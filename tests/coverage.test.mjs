// ตรวจว่าแบบจำลอง 76 ชุดใน catalog อ้างถึงครบ 195 เรื่อง (TST-05)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const lab = join(here, '..');
const catalog = JSON.parse(readFileSync(join(lab, 'data', 'catalog.json'), 'utf8'));
const easy = readFileSync(join(lab, 'docs', 'physics-summary-20-chapters-easy.md'), 'utf8');

test('catalog มี 76 ชุด และครอบคลุมทุกเรื่องของทั้ง 20 บท', () => {
  assert.equal(catalog.sims.length, 76);
  const counts = {}; let ch = 0;
  for (const line of easy.split('\n')) { const h = line.match(/^## บทที่ (\d+) .*\((\d+) เรื่อง\)/); if (h) { ch = +h[1]; counts[ch] = +h[2]; } }
  assert.equal(Object.keys(counts).length, 20);
  for (const c of Object.keys(counts).map(Number)) {
    const covered = new Set();
    catalog.sims.filter(s => s.chapter === c).forEach(s => { s.topics.forEach(t => covered.add(t)); (s.refTopics || []).forEach(t => covered.add(t)); });
    for (let t = 1; t <= counts[c]; t++) assert.ok(covered.has(t), `บท ${c} เรื่อง ${t} ไม่มีแบบจำลองรองรับ`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total, 195);
});
