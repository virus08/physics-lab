// ทดสอบควัน: เปิดทุกแบบจำลองสถานะ ready ด้วย Chromium จาก file:// ตรวจว่าไม่มีข้อผิดพลาดใน console
// กดเล่น ก้าว และอ่านค่าได้ (TST-02, TST-04) · รัน: node --test lab/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const lab = join(here, '..');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const catalog = JSON.parse(readFileSync(join(lab, 'data', 'catalog.json'), 'utf8'));
const ready = catalog.sims.filter(s => s.status === 'ready');

test('เปิดแคตตาล็อกจาก file:// ได้และแสดงครบ 76 ชุด', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(join(lab, 'index.html')).href);
  const cards = await page.locator('.pl-simcard').count();
  assert.equal(cards, 76);
  assert.deepEqual(errors, []);
  await browser.close();
});

for (const sim of ready) {
  test(`${sim.id} ${sim.title}: เปิด เล่น ก้าว รีเซ็ต และรับ URL ผิดรูปแบบได้`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const url = pathToFileURL(join(lab, sim.file)).href + '?u=abc&theta=999&seed=x&zzz=1';
    await page.goto(url);
    await page.waitForSelector('.pl-readouts .pl-readout');
    const play = page.locator('.pl-btn-primary');
    if (await play.count()) {
      await play.click();
      await page.waitForTimeout(400);
      await page.keyboard.press('Space');
      await page.locator('button[aria-label="ก้าวหนึ่งเฟรม"]').click();
      await page.locator('button:has-text("รีเซ็ต")').first().click();
    }
    const readouts = await page.locator('.pl-readouts .pl-readout').count();
    assert.ok(readouts > 0, 'ต้องมีค่าอ่าน');
    const alertHidden = await page.locator('.pl-alert').evaluate(e => e.hidden);
    assert.ok(alertHidden, 'ต้องไม่มีแถบเตือน NaN');
    assert.deepEqual(errors, []);
    await browser.close();
  });
}
