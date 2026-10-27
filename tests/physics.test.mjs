// ทดสอบสูตรและความแม่นของแบบจำลอง (TST-01, TST-03) โดยโหลดสคริปต์ของหน้าแบบจำลองใน vm พร้อม PhysLab จำลองที่จับ config
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const lab = join(here, '..');
const libSrc = readFileSync(join(lab, 'lib', 'physlab.js'), 'utf8');

export function loadSim(file) {
  const html = readFileSync(join(lab, file), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  if (!m) throw new Error('ไม่พบสคริปต์ของแบบจำลองใน ' + file);
  const sandbox = { window: {}, document: undefined, globalThis: undefined, performance: { now: () => 0 } };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(libSrc, sandbox);
  let captured = null;
  sandbox.PhysLab.createSim = cfg => { captured = cfg; return {}; };
  vm.runInContext(m[1], sandbox);
  if (!captured) throw new Error('createSim ไม่ถูกเรียกใน ' + file);
  return { cfg: captured, PhysLab: sandbox.PhysLab };
}

export function run(cfg, params, steps, dt = 1 / 120) {
  const p = Object.assign({}, Object.fromEntries(Object.entries(cfg.params).map(([k, v]) => [k, v.default])), params);
  let s = cfg.init(p, { seed: 1, rng: () => 0.5 }), t = 0;
  for (let i = 0; i < steps; i++) { const ns = cfg.step(s, p, dt, t); if (ns) s = ns; t += dt; if (cfg.done && cfg.done(s, p)) break; }
  return { s, p, t };
}

test('PhysLab.fmt จัดรูปเลขนัยสำคัญ 3 ตัวและสัญกรณ์วิทยาศาสตร์', () => {
  const { PhysLab } = loadSim('sims/ch07-s1-projectile.html');
  assert.equal(PhysLab.fmt(40.8163), '40.8');
  assert.equal(PhysLab.fmt(2.886), '2.89');
  assert.equal(PhysLab.fmt(12345), '12300');
  assert.equal(PhysLab.fmt(0.000123), '1.23×10⁻⁴');
  assert.equal(PhysLab.fmt(2.5e6), '2.5×10⁶');
  assert.equal(PhysLab.fmt(0), '0');
});

test('PhysLab.rng(seed) ให้ลำดับเดิมทุกครั้ง', () => {
  const { PhysLab } = loadSim('sims/ch07-s1-projectile.html');
  const a = PhysLab.rng(42), b = PhysLab.rng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('S7.1 โพรเจกไทล์ u=20 θ=45° g=9.8: ระยะตก 40.82 m และเวลา 2.886 s ต่างไม่เกิน 0.5 %', () => {
  const { cfg } = loadSim('sims/ch07-s1-projectile.html');
  const a = cfg.analytic({ u: 20, theta: 45, h0: 0, g: 9.8 });
  assert.ok(Math.abs(a.range - 40.816) < 0.01);
  assert.ok(Math.abs(a.tTotal - 2.8862) < 0.001);
  const { s } = run(cfg, { u: 20, theta: 45, h0: 0, g: 9.8 }, 2000);
  assert.ok(s.landed, 'ต้องตกถึงพื้น');
  assert.ok(Math.abs(s.x - a.range) / a.range < 0.005, `ระยะตกจำลอง ${s.x}`);
  assert.ok(Math.abs(s.tLand - a.tTotal) / a.tTotal < 0.005, `เวลาจำลอง ${s.tLand}`);
});

test('S7.1 มุม 30° กับ 60° ตกไกลเท่ากัน และยิงจากที่สูงใช้สูตรทั่วไป', () => {
  const { cfg } = loadSim('sims/ch07-s1-projectile.html');
  const r30 = cfg.analytic({ u: 20, theta: 30, h0: 0, g: 9.8 }).range, r60 = cfg.analytic({ u: 20, theta: 60, h0: 0, g: 9.8 }).range;
  assert.ok(Math.abs(r30 - r60) < 1e-9);
  const a = cfg.analytic({ u: 15, theta: 0, h0: 20, g: 9.8 });
  assert.ok(Math.abs(a.tTotal - Math.sqrt(2 * 20 / 9.8)) < 1e-9);
  const { s } = run(cfg, { u: 15, theta: 0, h0: 20, g: 9.8 }, 2000);
  assert.ok(Math.abs(s.x - a.range) / a.range < 0.005);
});

test('ความกำหนดได้: รัน 600 ก้าวสองครั้งได้สถานะเดียวกัน', () => {
  const { cfg } = loadSim('sims/ch07-s1-projectile.html');
  const a = run(cfg, {}, 600), b = run(cfg, {}, 600);
  assert.deepEqual(JSON.stringify(a.s), JSON.stringify(b.s));
});
