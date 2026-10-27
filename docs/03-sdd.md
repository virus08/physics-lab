# เอกสารออกแบบซอฟต์แวร์ (Software Design Document, SDD)
## Physics Lab — แบบจำลองฟิสิกส์เชิงโต้ตอบสำหรับนักเรียน

| รายการ | ค่า |
|---|---|
| เวอร์ชันเอกสาร | 1.0.0 |
| วันที่ | 2026-10-27 |
| สถานะ | ใช้งาน |
| ขั้น SDLC | 3 ออกแบบ |
| อ้างอิง | srs.md เวอร์ชัน 0.2.0 และแคนวาสออกแบบหน้าจอ (REF-4 ใน srs.md) |

---

## 1. บทนำ

เอกสารนี้แปลงความต้องการใน srs.md เป็นโครงสร้างโค้ดที่เขียนได้จริง ครอบคลุมสถาปัตยกรรม ไลบรารีร่วม รูปแบบไฟล์แบบจำลอง โครงสร้างข้อมูล และการตัดสินใจออกแบบ ทุกข้อในเอกสารนี้อ้างรหัสความต้องการใน srs.md ในวงเล็บ

---

## 2. สถาปัตยกรรม

### 2.1 ภาพรวม

```mermaid
flowchart TB
    subgraph หน้าแคตตาล็อก
        IDX["index.html"] --> CATJ[("data/catalog.json")]
    end
    subgraph หน้าแบบจำลอง chNN-sM-slug.html
        CFG["config ของแบบจำลอง<br>params presets init step draw readouts formulas graphs"]
        CFG --> CORE
    end
    subgraph "lib/physlab.js (window.PhysLab)"
        CORE["createSim"] --> ENG["Engine<br>ลูปเวลา ก้าวคงที่"]
        CORE --> CTL["Controls<br>แถบเลื่อน ปุ่ม ลาก"]
        CORE --> DRW["Draw<br>พิกัดโลก ลูกศร แกน"]
        CORE --> GRP["Graph<br>กราฟเวลาและกราฟ x-y"]
        CORE --> RDO["Readout<br>ค่าอ่าน สูตรแทนค่า"]
        CORE --> URLS["UrlState<br>อ่านและสร้างลิงก์"]
        CORE --> AUD["Audio<br>เสียงสำหรับบท 12"]
        CORE --> UI["Layout<br>แผง 5 ส่วน ธีม"]
    end
    IDX -->|เปิด| CFG
```

### 2.2 หลักการ

- แบบจำลองเป็น "ข้อมูล + ฟังก์ชันฟิสิกส์" ส่วน DOM และการวาดเป็นหน้าที่ของไลบรารี (NFR-M1, NFR-M2)
- ไลบรารีโหลดเป็นสคริปต์ธรรมดา ประกาศตัวแปรเดียวคือ `window.PhysLab` เพื่อให้เปิดจาก `file://` ได้ (CON-3)
- ไม่มีไฟล์ภาพ ไม่มีสคริปต์ภายนอก ไม่มี build (CON-1, CON-2, CON-6)

### 2.3 โครงสร้างไฟล์

```
lab/
  index.html                 แคตตาล็อก
  lib/physlab.js             ไลบรารีร่วม (โมดูลภายในตาม 2.1)
  lib/physlab.css            สไตล์ร่วม
  sims/_template.html        แม่แบบ
  sims/chNN-sM-<slug>.html   แบบจำลอง 76 ไฟล์
  data/catalog.json          รายการแบบจำลอง
  tests/*.test.mjs           ชุดทดสอบ
  docs/                      เอกสาร SDLC
```

---

## 3. การออกแบบไลบรารีร่วม PhysLab

### 3.1 วงจรชีวิตของแบบจำลอง

```
PhysLab.createSim(config)
  1. ตรวจ config (ต้องมี id, chapter, topics, params, init, step หรือ static, draw)
  2. อ่านพารามิเตอร์จาก URL (UrlState.parse) ปัดเข้าช่วง
  3. สร้างเลย์เอาต์ 5 ส่วนใน <main> (Layout.mount)
  4. สร้างตัวควบคุมจาก config.params และ config.presets (Controls.mount)
  5. state = config.init(params)
  6. ถ้า config.static เป็น true: วาดครั้งเดียวและวาดใหม่เมื่อพารามิเตอร์เปลี่ยน (ENG-08)
     ถ้าไม่: Engine.start() เริ่มลูป rAF พร้อมตัวสะสมเวลา
  7. ทุกเฟรม: Engine.tick -> step หลายครั้งตาม dt -> Draw -> Readout -> Graph
```

### 3.2 Engine (ENG-01 ถึง ENG-07)

```js
// โครงร่างลูปเวลาแบบก้าวคงที่
const DT = 1 / 120;           // วินาทีจำลองต่อก้าว
let acc = 0, last = performance.now();
function frame(now) {
  if (!running) return;
  let real = (now - last) / 1000; last = now;
  if (real > 0.25) real = 0.25;   // กลับจากแท็บที่ถูกซ่อน ไม่กระโดด (ENG-07)
  acc += real * speed;             // speed = 0.25 ... 4 (ENG-03)
  let steps = 0;
  while (acc >= DT && steps < 32) { state = config.step(state, params, DT); acc -= DT; steps++; t += DT; }
  if (!isFinite(state.__check ?? 0) || hasNaN(state)) return halt('ค่าคำนวณไม่ได้');  // ENG-06
  render();
  requestAnimationFrame(frame);
}
```

- `step` ต้องเป็นฟังก์ชันบริสุทธิ์ รับ state เดิม คืน state ใหม่ ไม่อ่านเวลาเครื่องและไม่สุ่มเอง (ENG-05)
- ตัวสุ่มสำหรับชุดที่ต้องสุ่ม (S16.3, S20.2) ใช้ `PhysLab.rng(seed)` แบบ mulberry32 ที่ผลซ้ำได้ seed อ่านจาก URL ได้
- ตัวอินทิเกรต: `PhysLab.integrate.euler(state, deriv, dt)` แบบ semi-implicit เป็นค่าเริ่มต้น และ `PhysLab.integrate.rk4` สำหรับ S7.4 วงโคจร และชุดที่ระบุใน config (ENG-02)
- ก้าวทีละเฟรม: เรียก step หนึ่งครั้งแล้ว render โดยไม่เริ่มลูป

### 3.3 Controls (CTL-01 ถึง CTL-06)

พารามิเตอร์หนึ่งตัวใน `config.params`:

```js
u: { label: 'ความเร็วต้น', symbol: 'u', unit: 'm/s', type: 'range',
     min: 0, max: 50, step: 0.5, default: 20, live: true }
g: { label: 'ค่า g', symbol: 'g', unit: 'm/s²', type: 'choice',
     options: [{ label: 'ดวงจันทร์', value: 1.6 }, { label: 'โลก', value: 9.8 }], default: 9.8, live: false }
```

- `type` เป็น `range`, `number`, `choice`, `toggle`
- `live: true` มีผลทันทีระหว่างเล่น `live: false` ทำให้รีเซ็ตก่อน (ENG-04)
- `lock: true` อนุญาตให้ผู้ใช้ล็อกค่านี้คงที่ (CTL-06)
- `drag` ระบุว่าพารามิเตอร์นี้ลากบนภาพได้ โดยให้ `config.dragHandles(state, params)` คืนรายการจุดจับ `{ param, x, y, radius, map(worldX, worldY) -> value }` ไลบรารีจัดการ pointer events ให้ (CTL-05)
- `config.presets` เป็นรายการ `{ label, values: { u: 20, theta: 30 }, overlay?: true }` ถ้า `overlay` ให้วาดกรณีซ้อนกันโดยเก็บสถานะชุดที่สองไว้ (VIS-07)

### 3.4 Draw (VIS-01 ถึง VIS-07)

- `Draw.world({ xMin, xMax, yMin, yMax, fit: 'contain' | 'follow' })` กำหนดพิกัดโลกเป็นเมตร ไลบรารีคำนวณมาตราส่วนและจัดกึ่งกลางเอง รองรับ devicePixelRatio
- ฟังก์ชันช่วย: `grid()`, `axes({ xLabel, yLabel })`, `arrow(x, y, dx, dy, { color, label, value })`, `trail(points)`, `dot`, `rect`, `spring(x1, y1, x2, y2, coils)`, `label(text, x, y)`
- สีมาตรฐานตาม UI-12: `Draw.color.primary` (น้ำเงิน) `.horizontal` (ส้ม) `.vertical` (เขียว) `.weight` (แดง) `.muted` (เทา) ปรับตามธีมอัตโนมัติ
- ชั้นวาด 2 ชั้น: ชั้นคงที่ (ตาราง แกน รางลอน) วาดครั้งเดียวเมื่อพารามิเตอร์หรือขนาดเปลี่ยน ชั้นเคลื่อนไหววาดทุกเฟรม (NFR-P1)

### 3.5 Graph (GRP-01 ถึง GRP-05)

- `config.graphs` เป็นรายการ `{ title, x: 't' | 'สัญลักษณ์', series: [{ key, label, color }], window: 10 }`
- บัฟเฟอร์วงแหวนความยาว 2,000 จุดต่อเส้น เพียงพอสำหรับหน้าต่าง 60 วินาทีที่ 30 จุดต่อวินาที
- มาตราส่วนแกนตั้งปรับอัตโนมัติแบบ "ขยายได้ หดช้า" เพื่อไม่ให้กราฟกระพริบ
- กราฟ x-y (P-V, σ-ε, I-V) ใช้โครงเดียวกันโดยตั้ง `x` เป็นสัญลักษณ์ของปริมาณ
- ชี้บนกราฟแสดงค่า และสำหรับกราฟที่ตั้ง `slopeArea: true` ลากช่วงเพื่อแสดงความชันและพื้นที่ใต้กราฟ

### 3.6 Readout และ Formula (RDO-01 ถึง RDO-04)

```js
readouts: (s, p) => [
  { label: 't', value: s.t, unit: 's' },
  { label: 'ระยะตก', value: range(p), unit: 'm', highlight: true },
],
formulas: (s, p) => [
  { symbolic: 'Sx max = u² sin2θ / g',
    substituted: `= ${p.u}² × sin(${2 * p.theta}°) / ${p.g}`,
    result: fmt(range(p)) + ' m' },
],
conserved: (s, p) => [{ label: 'โมเมนตัมรวม', before: p0, after: s.p }]
```

- จัดรูปเลขนัยสำคัญ 3 ตัวด้วย `PhysLab.fmt(value, sig = 3)` รองรับสัญกรณ์วิทยาศาสตร์เมื่อค่าเล็กหรือใหญ่มาก
- ข้อความสูตรเป็นข้อความธรรมดา ใช้ตัวยกและตัวห้อย Unicode ที่เป็นอักขระเดี่ยว (² ₁) ห้ามอักขระซ้อน (CON-4) ลูกศรเวกเตอร์ไม่ใส่ในข้อความ

### 3.7 UrlState (FI-03, FI-04, NFR-S2)

- `parse()` อ่าน query ทุกคีย์ที่ตรงกับ `config.params` แปลงเป็นตัวเลขหรือค่าตัวเลือก ค่าที่แปลงไม่ได้หรือเกินช่วงให้ใช้ค่าเริ่มต้นหรือปัดเข้าช่วง ไม่นำข้อความจาก URL ใส่ DOM ตรง ๆ
- `serialize(params)` สร้าง query เฉพาะค่าที่ต่างจากค่าเริ่มต้น เพื่อให้ลิงก์สั้น
- `seed` เป็นคีย์สงวนสำหรับชุดที่สุ่ม

### 3.8 Audio (บท 12)

- สร้าง `AudioContext` เมื่อผู้ใช้กดปุ่มเล่นครั้งแรกเท่านั้น (ข้อจำกัดของ iOS) และแสดงข้อความ "แตะเล่นเพื่อเปิดเสียง"
- `Audio.tone(freq, gain)` ใช้ oscillator แบบ sine, `Audio.beat(f1, f2)` ใช้สอง oscillator, `Audio.doppler(fn)` ปรับความถี่ทุกเฟรม
- ความดังจำกัดไม่เกิน 0.3 ของค่าสูงสุด และมีปุ่มปิดเสียงเสมอ

### 3.9 Layout และธีม (UI-01, UI-02, UI-10)

- CSS grid สองคอลัมน์ที่ความกว้าง 1024 px ขึ้นไป (ภาพ 2fr : แผง 1fr สูงสุด 420 px) และหนึ่งคอลัมน์ต่ำกว่า 768 px เรียง ภาพ แถบเล่น พารามิเตอร์ ค่าอ่าน กราฟ เนื้อหา
- ธีมตาม `prefers-color-scheme` และสลับด้วยปุ่ม เก็บค่าใน localStorage ถ้าใช้ได้
- ฟอนต์: ระบบ (system-ui) เป็นหลัก เพราะห้ามโหลดฟอนต์ภายนอก (CON-2) สำรองด้วยฟอนต์ไทยของระบบ

---

## 4. รูปแบบไฟล์แบบจำลอง

โครงของ `sims/_template.html` (ย่อ):

```html
<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>S7.1 โพรเจกไทล์ · Physics Lab</title>
<link rel="stylesheet" href="../lib/physlab.css">
<script src="../lib/physlab.js"></script>
</head>
<body>
<main id="sim"></main>
<script>
/* S7.1 โพรเจกไทล์ · บท 7 เรื่อง 1 ถึง 3
   สูตร: ux = u cosθ, uy = u sinθ, sy = uy t − ½gt², Sx max = u² sin2θ / g
   สมมติฐาน: ไม่มีแรงต้านอากาศ · แก้ไขล่าสุด 2026-10-27 */
PhysLab.createSim({
  id: 'S7.1', chapter: 7, topics: [1, 2, 3],
  title: 'โพรเจกไทล์',
  params: { /* ดู 3.3 */ },
  presets: [ /* ดู 3.3 */ ],
  world: { xMin: 0, xMax: 'auto', yMin: 0, yMax: 'auto', fit: 'contain' },
  init(p) { return { t: 0, x: 0, y: p.h0, vx: p.u * Math.cos(rad(p.theta)), vy: p.u * Math.sin(rad(p.theta)), trail: [] }; },
  step(s, p, dt) { /* semi-implicit Euler */ },
  draw(ctx, s, p, D) { D.grid(); D.axes({ xLabel: 'x (m)', yLabel: 'y (m)' }); /* ... */ },
  readouts(s, p) { /* ... */ },
  formulas(s, p) { /* ... */ },
  graphs: [ { title: 'y-t', x: 't', series: [{ key: 'y', label: 'y (m)' }] } ],
  content: { summary: '...', tryIt: ['...', '...'], reference: null },
});
</script>
</body>
</html>
```

กฎของไฟล์แบบจำลอง

- ส่วนหัวคอมเมนต์ระบุ รหัส บท เรื่อง สูตร สมมติฐาน วันที่ (NFR-M3)
- ฟังก์ชัน init, step และฟังก์ชันคำนวณเชิงวิเคราะห์ (เช่น `range(p)`) ต้องอยู่ใน `window.PhysLabSims['S7.1']` ด้วย เพื่อให้ไฟล์ทดสอบ import ได้โดยไม่ต้องมี DOM (TST-01)
- `content` ฝังข้อความจากไฟล์สรุปฉบับเข้าใจง่ายตอนสร้าง ไม่โหลดขณะรัน (INF-02) และ `reference` ใส่ตารางอ้างอิงสำหรับเรื่องที่เป็นนิยาม (INF-03)

---

## 5. โครงสร้างข้อมูล catalog.json (FI-01)

```json
{
  "version": 1,
  "sims": [
    {
      "id": "S7.1",
      "chapter": 7,
      "topics": [1, 2, 3],
      "title": "โพรเจกไทล์",
      "file": "sims/ch07-s1-projectile.html",
      "summary": "ปรับความเร็วต้น มุมยิง และค่า g แล้วดูวิถี ระยะตก และความสูงสูงสุด",
      "tags": ["โพรเจกไทล์", "การเคลื่อนที่แนวโค้ง", "ระยะตก"],
      "status": "ready",
      "kind": "dynamic"
    }
  ]
}
```

- `kind` เป็น `dynamic`, `static`, `particle`, `audio` ใช้บอกแคตตาล็อกและชุดทดสอบว่าต้องตรวจอะไร
- `status` เปลี่ยนจาก `planned` เป็น `draft` เมื่อเริ่มเขียน และเป็น `ready` เมื่อผ่านตรวจรับ
- ไฟล์นี้คือแหล่งความจริงเดียวของรายการ 76 ชุด ชุดทดสอบ coverage อ่านจากไฟล์นี้เทียบกับรายการ 195 เรื่อง (TST-05)

---

## 6. การออกแบบรายแบบจำลอง

### 6.1 แหล่งสเปก

การ์ดบนแคนวาส (REF-4) คือสเปกระดับหน้าจอของแต่ละชุด ระบุ ภาพกลางจอ สิ่งที่ปรับได้ สิ่งที่เห็น และกราฟ เอกสารนี้ไม่คัดลอกซ้ำ ผู้พัฒนาเปิดการ์ดของชุดนั้นก่อนเขียนทุกครั้ง

### 6.2 ชนิดแบบจำลองและตัวอินทิเกรต

| ชนิด | ตัวอย่าง | แนวทาง |
|---|---|---|
| dynamic ทั่วไป | S2.x, S3.2, S5.2, S6.x, S7.1, S8.x, S12.6 | semi-implicit Euler, dt 1/120 |
| dynamic ต้องแม่นสูง | S7.4 วงโคจร, S15.2 ประจุในสนาม | RK4 |
| static | S1.2, S1.3, S3.1, S4.3, S11.2, S13.4, S14.2, S14.3, S15.5, S18.3 | ไม่มีลูป คำนวณใหม่เมื่อเปลี่ยนค่า |
| particle | S16.3 ทฤษฎีจลน์, S20.2 การสลายตัว, S20.3 ลูกโซ่ | จำกัดอนุภาค 500 ตัว, rng(seed), วาดแบบ batch |
| wave field | S9.3, S9.4, S10.x, S13.1 | คำนวณบนกริดความละเอียด 1 ถึง 2 px ที่ความกว้างภาพ และแคชเมื่อพารามิเตอร์ไม่เปลี่ยน |
| audio | S12.1 ถึง S12.6 | ต่อ Audio ตาม 3.8 |

### 6.3 ตัวอย่างสเปกเต็มของ S7.1

| หัวข้อ | ค่า |
|---|---|
| params | u 0 ถึง 50 (20), theta 0 ถึง 90 (45), h0 0 ถึง 50 (0), g choice (9.8) |
| presets | 45° ไกลสุด, 30° กับ 60° (overlay), ปล่อยจากที่สูง h0 = 20 |
| world | x 0 ถึง max(range) × 1.1, y 0 ถึง max(H, h0) × 1.2, fit contain |
| step | vy -= g·dt; x += vx·dt; y += vy·dt; หยุดเมื่อ y < 0 แล้วตั้ง y = 0 |
| draw | grid, axes, trail, dot, arrow vx (ส้ม), arrow vy (เขียว), arrow v (ดำ), จุดสูงสุด, ระยะตก, มุม θ ที่จุดยิง |
| readouts | t, x, y, vx, vy, v, t ถึงจุดสูงสุด, H, ระยะตก, เวลารวม |
| formulas | ux, uy, y(t), Sx max |
| graphs | y-t, vy-t |
| analytic | range = u² sin2θ / g (h0 = 0), tUp = uy / g, H = h0 + uy² / 2g |
| เกณฑ์ | ระยะตกและเวลาจากการจำลองต่างจาก analytic ไม่เกิน 0.5% |

ทุกชุดต้องมีตารางแบบนี้ในส่วนหัวคอมเมนต์ของไฟล์หรือในคู่มือพัฒนา ก่อนเริ่มเขียนโค้ด

---

## 7. การออกแบบส่วนติดต่อผู้ใช้

ยึดตามแคนวาสออกแบบ (REF-4) ทั้งหน้าแคตตาล็อกและหน้าแบบจำลองทั้งเดสก์ท็อปและมือถือ สรุปสิ่งที่โค้ดต้องทำให้ตรง

- แผง 5 ส่วนและลำดับการเรียงบนมือถือตาม UI-01, UI-02
- ปุ่มเล่นเป็นปุ่มสีหลักขนาดใหญ่สุดในแถบ ปุ่มอื่นเป็นปุ่มขอบ
- ตัวเลือกความเร็วเป็นกลุ่มปุ่มเรียงแถว 0.25x ถึง 4x
- ค่าอ่านใช้ฟอนต์ความกว้างคงที่ (monospace ของระบบ) เพื่อให้ตัวเลขเรียงตรง
- สีตาม UI-12 ทั้งในภาพ ลูกศร กราฟ และค่าอ่าน

---

## 8. การจัดการข้อผิดพลาด

| สถานการณ์ | การตอบสนอง |
|---|---|
| state มี NaN หรือ Infinity | หยุดลูป แสดงแถบเตือน "ค่าที่ตั้งทำให้คำนวณไม่ได้ ลองลดค่า" พร้อมปุ่มรีเซ็ต (ENG-06) |
| URL มีค่าผิดรูปแบบ | ใช้ค่าเริ่มต้นและไม่แสดงข้อผิดพลาด (NFR-S2) |
| localStorage ใช้ไม่ได้ | ทำงานต่อโดยไม่จำค่า (NFR-S3) |
| AudioContext สร้างไม่ได้ | แบบจำลองบท 12 ทำงานต่อแบบไม่มีเสียง และแสดงข้อความแจ้ง |
| catalog.json โหลดไม่ได้จาก file:// ในบางเบราว์เซอร์ | index.html ฝังสำเนา catalog ไว้ใน `<script type="application/json">` เป็นค่าสำรอง และใช้ไฟล์ JSON เมื่อโหลดได้ |

---

## 9. ประสิทธิภาพ

- ชั้น canvas คงที่กับชั้นเคลื่อนไหวแยกกัน (3.4)
- จำกัดจำนวนก้าวต่อเฟรมไม่เกิน 32 เพื่อไม่ให้ค้างเมื่อเครื่องช้า
- กราฟวาดเฉพาะเมื่อมีจุดใหม่ และไม่เกิน 30 จุดต่อวินาที
- wave field ใช้ `Float32Array` และคำนวณใหม่เฉพาะเมื่อพารามิเตอร์เปลี่ยน
- ไม่สร้างอ็อบเจกต์ใหม่ใน step สำหรับชุด particle ใช้บัฟเฟอร์ที่จองไว้ล่วงหน้า

---

## 10. การตัดสินใจออกแบบ (ADR ย่อ)

| รหัส | การตัดสินใจ | เหตุผล | ทางเลือกที่ไม่เลือก |
|---|---|---|---|
| ADR-1 | สคริปต์ธรรมดา ไม่ใช้ ES module | เปิดจาก file:// ได้ทุกเบราว์เซอร์ | ES module ต้องมีเซิร์ฟเวอร์ |
| ADR-2 | ไม่ใช้เฟรมเวิร์กหรือไลบรารีภายนอก | ไม่ต้องต่อเน็ต ไฟล์เล็ก ดูแลง่าย | React หรือ p5.js |
| ADR-3 | ก้าวเวลาคงที่ 1/120 s แยกจาก rAF | ผลเท่ากันทุกเครื่อง ทดสอบได้ | ใช้ dt ตามเฟรมจริง |
| ADR-4 | วาดทุกอย่างด้วย canvas ไม่ใช้ไฟล์ภาพ | ภาพเปลี่ยนตามค่าเสมอ ไม่มีภาพนิ่งที่ไม่ตรง | ภาพประกอบจากไฟล์ |
| ADR-5 | ฟิสิกส์เป็นฟังก์ชันบริสุทธิ์แยกจาก DOM | ทดสอบด้วย node ได้โดยไม่ต้องมีเบราว์เซอร์ | ผูกฟิสิกส์กับการวาด |
| ADR-6 | เนื้อหาฝังในไฟล์แบบจำลองตอนสร้าง | ไม่ต้องโหลด Markdown ขณะรัน เปิดจาก file:// ได้ | fetch ไฟล์สรุป |
| ADR-7 | catalog.json เป็นแหล่งความจริงเดียวของรายการ | ชุดทดสอบ coverage ตรวจครบ 195 เรื่องได้อัตโนมัติ | ฝังรายการใน index.html อย่างเดียว |
