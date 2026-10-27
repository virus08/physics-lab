// สร้าง lab/data/catalog.json จากตารางภาคผนวก 4.1 ของ srs.md และชื่อเรื่องจาก physics-summary-20-chapters-easy.md
// แล้วฝังสำเนาลง lab/index.html (SDD §5, §8) · รัน: node lab/tools/build-catalog.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const lab = join(here, '..');
const root = join(lab, '..');
const srs = readFileSync(join(lab, 'docs', 'srs.md'), 'utf8');
const easyPath = [join(lab, 'docs', 'physics-summary-20-chapters-easy.md'), join(root, 'physics-summary-20-chapters-easy.md')].find(existsSync);
const easy = readFileSync(easyPath, 'utf8');

const SLUG = {
  'S1.1': 'measurement', 'S1.2': 'sig-figs', 'S1.3': 'sci-notation',
  'S2.1': 'motion-graphs', 'S2.2': 'constant-acceleration', 'S2.3': 'free-fall',
  'S3.1': 'vectors', 'S3.2': 'incline-friction', 'S3.3': 'spring-force', 'S3.4': 'newton-laws', 'S3.5': 'gravity-satellite',
  'S4.1': 'center-of-gravity', 'S4.2': 'lever-torque', 'S4.3': 'lami',
  'S5.1': 'work-power', 'S5.2': 'energy-track', 'S5.3': 'simple-machines',
  'S6.1': 'momentum-impulse', 'S6.2': 'collision-1d', 'S6.3': 'collision-2d',
  'S7.1': 'projectile', 'S7.2': 'circular-table', 'S7.3': 'wall-cone-curve', 'S7.4': 'orbit',
  'S8.1': 'spring-shm', 'S8.2': 'pendulum',
  'S9.1': 'wave-types', 'S9.2': 'superposition-reflection', 'S9.3': 'refraction-diffraction', 'S9.4': 'two-source-interference', 'S9.5': 'standing-wave',
  'S10.1': 'single-slit', 'S10.2': 'double-slit-grating',
  'S11.1': 'reflection-refraction', 'S11.2': 'lens-mirror', 'S11.3': 'color',
  'S12.1': 'sound-speed', 'S12.2': 'sound-reflection-refraction', 'S12.3': 'intensity-decibel', 'S12.4': 'resonance-tube', 'S12.5': 'beats', 'S12.6': 'doppler',
  'S13.1': 'field-potential', 'S13.2': 'conducting-sphere', 'S13.3': 'work-charge', 'S13.4': 'capacitor',
  'S14.1': 'ohm-power', 'S14.2': 'series-parallel', 'S14.3': 'kirchhoff',
  'S15.1': 'flux-current-field', 'S15.2': 'charge-in-field', 'S15.3': 'wire-force-torque', 'S15.4': 'induction-generator', 'S15.5': 'transformer',
  'S16.1': 'heat-phase', 'S16.2': 'gas-laws', 'S16.3': 'kinetic-theory', 'S16.4': 'thermodynamics',
  'S17.1': 'stress-strain', 'S17.2': 'fluid-pressure', 'S17.3': 'pascal-buoyancy', 'S17.4': 'surface-viscosity', 'S17.5': 'bernoulli',
  'S18.1': 'em-wave', 'S18.2': 'polarization', 'S18.3': 'em-spectrum', 'S18.4': 'digital-gps',
  'S19.1': 'blackbody-spectrum', 'S19.2': 'bohr', 'S19.3': 'photoelectric', 'S19.4': 'de-broglie',
  'S20.1': 'radiation-equations', 'S20.2': 'decay-half-life', 'S20.3': 'fission-fusion', 'S20.4': 'standard-model', 'S20.5': 'antiparticle-beta',
};
const STATIC = new Set(['S1.1', 'S1.2', 'S1.3', 'S3.1', 'S4.3', 'S10.1', 'S10.2', 'S11.1', 'S11.2', 'S11.3', 'S13.1', 'S13.2', 'S13.3', 'S13.4', 'S14.1', 'S14.2', 'S14.3', 'S15.1', 'S15.5', 'S17.1', 'S17.2', 'S18.3', 'S19.1', 'S19.3', 'S20.4']);
const PARTICLE = new Set(['S16.3', 'S20.2', 'S20.3']);
const WAVE = new Set(['S9.3', 'S9.4']);
const AUDIO = new Set(['S12.1', 'S12.2', 'S12.3', 'S12.4', 'S12.5', 'S12.6']);

// ชื่อเรื่องต่อบทจากไฟล์สรุปฉบับเข้าใจง่าย
const topicNames = {};
let ch = 0;
for (const line of easy.split('\n')) {
  const h = line.match(/^## บทที่ (\d+) /); if (h) { ch = +h[1]; topicNames[ch] = {}; continue; }
  const m = line.match(/^(\d+)\. \*\*(.+?)\*\*/); if (m && ch) topicNames[ch][+m[1]] = m[2];
}

const sims = [];
for (const line of srs.split('\n')) {
  const m = line.match(/^\| (S(\d+)\.(\d+)) \| (.+?) \| (.+?) \|$/); if (!m) continue;
  const id = m[1], chapter = +m[2], title = m[4].trim(), topicCell = m[5].trim();
  const ref = (topicCell.match(/\(อ้างอิง ([^)]+)\)/) || [])[1];
  const topics = topicCell.replace(/\(อ้างอิง [^)]+\)/, '').split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
  const refTopics = ref ? ref.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n)) : [];
  const names = topics.map(t => (topicNames[chapter] || {})[t]).filter(Boolean);
  const file = `sims/ch${String(chapter).padStart(2, '0')}-s${m[3]}-${SLUG[id] || 'sim'}.html`;
  const kind = AUDIO.has(id) ? 'audio' : PARTICLE.has(id) ? 'particle' : WAVE.has(id) ? 'wave' : STATIC.has(id) ? 'static' : 'dynamic';
  const status = existsSync(join(lab, file)) ? 'ready' : 'planned';
  sims.push({ id, chapter, topics, refTopics, title, file, summary: names.join(' · '), tags: names, status, kind });
}
if (sims.length !== 76) throw new Error('คาดว่า 76 ชุด แต่ได้ ' + sims.length);
const catalog = { version: 1, generated: new Date().toISOString().slice(0, 10), sims };
writeFileSync(join(lab, 'data', 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
const idx = join(lab, 'index.html');
let html = readFileSync(idx, 'utf8');
html = html.replace(/<!--CATALOG-->[\s\S]*?<!--\/CATALOG-->/, '<!--CATALOG-->' + JSON.stringify(catalog) + '<!--/CATALOG-->');
writeFileSync(idx, html);
const ready = sims.filter(s => s.status === 'ready').length;
console.log(`catalog.json: ${sims.length} ชุด พร้อมใช้ ${ready} · ฝังลง index.html แล้ว`);
