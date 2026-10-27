/* Physics Lab shared library · lab/lib/physlab.js
   สคริปต์ธรรมดา ประกาศตัวแปรเดียว window.PhysLab (ADR-1) ไม่พึ่งไลบรารีภายนอก (ADR-2)
   โมดูลภายใน: Engine, Controls, Draw, Graph, Readout, UrlState, Audio, Layout (SDD 2.1) */
(function (global) {
'use strict';

var DT_DEFAULT = 1 / 120;
var CHAPTERS = {
  1: 'ธรรมชาติและพัฒนาการทางฟิสิกส์', 2: 'การเคลื่อนที่แนวตรง', 3: 'แรงและกฎการเคลื่อนที่', 4: 'สมดุลกล',
  5: 'งานและพลังงาน', 6: 'โมเมนตัมและการชน', 7: 'การเคลื่อนที่แนวโค้ง', 8: 'การเคลื่อนที่ฮาร์มอนิกอย่างง่าย',
  9: 'คลื่น', 10: 'แสงเชิงคลื่น', 11: 'แสงเชิงรังสี', 12: 'เสียง', 13: 'ไฟฟ้าสถิต', 14: 'ไฟฟ้ากระแส',
  15: 'แม่เหล็กและไฟฟ้า', 16: 'ความร้อนและแก๊ส', 17: 'ของแข็งและของไหล', 18: 'คลื่นแม่เหล็กไฟฟ้า',
  19: 'ฟิสิกส์อะตอม', 20: 'ฟิสิกส์นิวเคลียร์และฟิสิกส์อนุภาค'
};
var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };

/* ---------- utilities ---------- */
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function rad(d) { return d * Math.PI / 180; }
function deg(r) { return r * 180 / Math.PI; }
function sup(n) { return String(n).split('').map(function (c) { return SUP[c] || c; }).join(''); }
function trimZeros(s) { return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; }
function fmt(v, sig) {
  sig = sig || 3;
  if (typeof v === 'string') return v;
  if (v === null || v === undefined || !isFinite(v)) return '—';
  if (v === 0) return '0';
  var a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) {
    var e = Math.floor(Math.log10(a));
    var m = v / Math.pow(10, e);
    var ms = trimZeros(m.toPrecision(sig));
    if (Math.abs(parseFloat(ms)) >= 10) { e += 1; ms = trimZeros((m / 10).toPrecision(sig)); }
    return ms + '×10' + sup(e);
  }
  var ex = Math.floor(Math.log10(a));
  if (ex >= sig) { var p = Math.pow(10, ex - sig + 1); return String(Math.round(v / p) * p); }
  return trimZeros(v.toPrecision(sig));
}
function fmtFixed(v, d) { if (!isFinite(v)) return '—'; return v.toFixed(d); }
function rng(seed) { /* mulberry32 ผลซ้ำได้ (ENG-05) */
  var a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hasNaN(o, depth) {
  depth = depth || 0; if (depth > 3) return false;
  if (typeof o === 'number') return !isFinite(o);
  if (Array.isArray(o)) { for (var i = 0; i < Math.min(o.length, 64); i++) { if (hasNaN(o[i], depth + 1)) return true; } return false; }
  if (o && typeof o === 'object') { for (var k in o) { if (k.charAt(0) === '_') continue; if (hasNaN(o[k], depth + 1)) return true; } }
  return false;
}
var integrate = {
  /* semi-implicit Euler สำหรับ state {x, v} กับความเร่ง a(x, v) */
  euler: function (x, v, a, dt) { var vn = v + a * dt; return { x: x + vn * dt, v: vn }; },
  /* RK4 สำหรับเวกเตอร์ y และ f(t, y) -> dy/dt */
  rk4: function (y, f, t, dt) {
    var n = y.length, i, k1 = f(t, y), y2 = new Array(n);
    for (i = 0; i < n; i++) y2[i] = y[i] + 0.5 * dt * k1[i];
    var k2 = f(t + 0.5 * dt, y2), y3 = new Array(n);
    for (i = 0; i < n; i++) y3[i] = y[i] + 0.5 * dt * k2[i];
    var k3 = f(t + 0.5 * dt, y3), y4 = new Array(n);
    for (i = 0; i < n; i++) y4[i] = y[i] + dt * k3[i];
    var k4 = f(t + dt, y4), out = new Array(n);
    for (i = 0; i < n; i++) out[i] = y[i] + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return out;
  }
};
function el(tag, attrs, children) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
  }
  if (children) children.forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function svgIcon(path, size) {
  var s = size || 18;
  var w = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  w.setAttribute('width', s); w.setAttribute('height', s); w.setAttribute('viewBox', '0 0 24 24'); w.setAttribute('aria-hidden', 'true');
  w.innerHTML = path; return w;
}
var ICON = {
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
  step: '<path d="M6 4l9 8-9 8z" fill="currentColor"/><rect x="17" y="4" width="3" height="16" fill="currentColor"/>',
  back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2"/>',
  theme: '<path d="M12 3a9 9 0 1 0 9 9c0-.5 0-1-.1-1.4A5 5 0 0 1 12 3z" fill="none" stroke="currentColor" stroke-width="2"/>'
};

/* ---------- theme & colors ---------- */
var Theme = {
  init: function () {
    var t = null;
    try { t = localStorage.getItem('physlab-theme'); } catch (e) { t = null; }
    if (!t) t = (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  },
  toggle: function () {
    var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('physlab-theme', t); } catch (e) { /* ไม่จำค่า */ }
    document.dispatchEvent(new CustomEvent('physlab-theme'));
  },
  colors: function () {
    var cs = getComputedStyle(document.documentElement);
    function v(n) { return cs.getPropertyValue(n).trim(); }
    return { primary: v('--pl-accent'), horizontal: v('--pl-orange'), vertical: v('--pl-green'), weight: v('--pl-red'),
      muted: v('--pl-muted'), line: v('--pl-line'), text: v('--pl-text'), bg: v('--pl-canvas'), card: v('--pl-card'), soft: v('--pl-soft'),
      accentSoft: v('--pl-accent-soft'), orange: v('--pl-orange'), green: v('--pl-green'), red: v('--pl-red'), blue: v('--pl-accent') };
  }
};

/* ---------- Draw: พิกัดโลก (VIS-01) ---------- */
function makeDraw(canvas) {
  var D = { canvas: canvas, ctx: canvas.getContext('2d'), W: 0, H: 0, dpr: 1, scale: 1, ox: 0, oy: 0, yUp: true, view: {}, ghost: false, color: Theme.colors() };
  D.resize = function () {
    var r = canvas.getBoundingClientRect();
    D.dpr = Math.min(global.devicePixelRatio || 1, 3);
    D.W = Math.max(10, r.width); D.H = Math.max(10, r.height);
    canvas.width = Math.round(D.W * D.dpr); canvas.height = Math.round(D.H * D.dpr);
  };
  D.setWorld = function (w) {
    var pad = (w.pad === undefined ? 36 : w.pad);
    var xr = (w.xMax - w.xMin) || 1, yr = (w.yMax - w.yMin) || 1;
    D.yUp = w.yUp !== false;
    D.world = w;
    var sx = (D.W - 2 * pad) / xr, sy = (D.H - 2 * pad) / yr;
    D.scale = (w.fit === 'stretch') ? sx : Math.min(sx, sy);
    D.scaleY = (w.fit === 'stretch') ? sy : D.scale;
    if (w.fit === 'stretch') { D.scale = sx; }
    D.ox = (D.W - xr * D.scale) / 2 - w.xMin * D.scale;
    if (w.alignX === 'left') D.ox = pad - w.xMin * D.scale;
    var syy = D.scaleY;
    if (D.yUp) { D.oy = D.H - ((D.H - yr * syy) / 2) + w.yMin * syy; if (w.alignY === 'bottom') D.oy = D.H - pad + w.yMin * syy; }
    else { D.oy = (D.H - yr * syy) / 2 - w.yMin * syy; }
  };
  D.x = function (wx) { return D.ox + wx * D.scale; };
  D.y = function (wy) { return D.yUp ? D.oy - wy * D.scaleY : D.oy + wy * D.scaleY; };
  D.sx = function (len) { return len * D.scale; };
  D.sy = function (len) { return len * D.scaleY; };
  D.wx = function (px) { return (px - D.ox) / D.scale; };
  D.wy = function (py) { return D.yUp ? (D.oy - py) / D.scaleY : (py - D.oy) / D.scaleY; };
  D.begin = function () { var c = D.ctx; c.setTransform(D.dpr, 0, 0, D.dpr, 0, 0); c.clearRect(0, 0, D.W, D.H); c.fillStyle = D.color.bg; c.fillRect(0, 0, D.W, D.H); c.lineCap = 'round'; c.lineJoin = 'round'; };
  D.font = function (size, mono) { return (size || 13) + 'px ' + (mono ? 'ui-monospace, Menlo, Consolas, monospace' : 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif'); };
  D.grid = function (step) {
    var c = D.ctx, w = D.world; if (!w) return;
    var s = step || niceStep((w.xMax - w.xMin) / 8);
    c.save(); c.strokeStyle = D.color.soft; c.lineWidth = 1;
    var x0 = Math.ceil(w.xMin / s) * s, y0 = Math.ceil(w.yMin / s) * s, i;
    for (i = x0; i <= w.xMax + 1e-9; i += s) { c.beginPath(); c.moveTo(D.x(i), D.y(w.yMin)); c.lineTo(D.x(i), D.y(w.yMax)); c.stroke(); }
    for (i = y0; i <= w.yMax + 1e-9; i += s) { c.beginPath(); c.moveTo(D.x(w.xMin), D.y(i)); c.lineTo(D.x(w.xMax), D.y(i)); c.stroke(); }
    c.restore(); return s;
  };
  D.axes = function (o) {
    o = o || {}; var c = D.ctx, w = D.world; if (!w) return;
    var x0 = clamp(o.x0 !== undefined ? o.x0 : 0, w.xMin, w.xMax), y0 = clamp(o.y0 !== undefined ? o.y0 : 0, w.yMin, w.yMax);
    c.save(); c.strokeStyle = D.color.line; c.lineWidth = 1.5; c.fillStyle = D.color.muted; c.font = D.font(12, true);
    c.beginPath(); c.moveTo(D.x(w.xMin), D.y(y0)); c.lineTo(D.x(w.xMax), D.y(y0)); c.stroke();
    c.beginPath(); c.moveTo(D.x(x0), D.y(w.yMin)); c.lineTo(D.x(x0), D.y(w.yMax)); c.stroke();
    var s = o.step || niceStep((w.xMax - w.xMin) / 8), i;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (i = Math.ceil(w.xMin / s) * s; i <= w.xMax + 1e-9; i += s) { if (Math.abs(i - x0) < 1e-9) continue; c.fillText(fmt(i), D.x(i), D.y(y0) + 4); }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    var sy = o.stepY || niceStep((w.yMax - w.yMin) / 6);
    for (i = Math.ceil(w.yMin / sy) * sy; i <= w.yMax + 1e-9; i += sy) { if (Math.abs(i - y0) < 1e-9) continue; c.fillText(fmt(i), D.x(x0) - 4, D.y(i)); }
    if (o.xLabel) { c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillText(o.xLabel, D.x(w.xMax) - 2, D.y(y0) - 4); }
    if (o.yLabel) { c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(o.yLabel, D.x(x0) + 6, D.y(w.yMax) + 2); }
    c.restore();
  };
  D.line = function (x1, y1, x2, y2, o) { o = o || {}; var c = D.ctx; c.save(); c.strokeStyle = o.color || D.color.text; c.lineWidth = o.width || 1.5; if (o.dash) c.setLineDash(o.dash); c.beginPath(); c.moveTo(D.x(x1), D.y(y1)); c.lineTo(D.x(x2), D.y(y2)); c.stroke(); c.restore(); };
  D.polyline = function (pts, o) { o = o || {}; if (!pts || pts.length < 2) return; var c = D.ctx; c.save(); c.strokeStyle = o.color || D.color.primary; c.lineWidth = o.width || 2; if (o.dash) c.setLineDash(o.dash); if (o.alpha !== undefined) c.globalAlpha = o.alpha; c.beginPath(); for (var i = 0; i < pts.length; i++) { var p = pts[i]; if (i === 0) c.moveTo(D.x(p[0]), D.y(p[1])); else c.lineTo(D.x(p[0]), D.y(p[1])); } if (o.close) c.closePath(); if (o.fill) { c.fillStyle = o.fill; c.fill(); } c.stroke(); c.restore(); };
  D.trail = function (pts, o) { D.polyline(pts, Object.assign({ color: D.color.primary, width: 2, alpha: D.ghost ? 0.45 : 1 }, o || {})); };
  D.circle = function (x, y, r, o) { o = o || {}; var c = D.ctx; c.save(); c.beginPath(); c.arc(D.x(x), D.y(y), o.px ? r : D.sx(r), 0, Math.PI * 2); if (o.fill) { c.fillStyle = o.fill; c.fill(); } if (o.stroke || !o.fill) { c.strokeStyle = o.stroke || D.color.text; c.lineWidth = o.width || 1.5; if (o.dash) c.setLineDash(o.dash); c.stroke(); } c.restore(); };
  D.dot = function (x, y, rpx, color, o) { o = o || {}; var c = D.ctx; c.save(); if (D.ghost) c.globalAlpha = 0.45; c.beginPath(); c.arc(D.x(x), D.y(y), rpx || 8, 0, Math.PI * 2); c.fillStyle = color || D.color.primary; c.fill(); if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.width || 2; c.stroke(); } c.restore(); };
  D.rect = function (x, y, w, h, o) { o = o || {}; var c = D.ctx; c.save(); if (D.ghost) c.globalAlpha = 0.45; var px = D.x(x), py = D.y(y + (D.yUp ? h : 0)), pw = D.sx(w), ph = D.sy(h); if (o.angle) { c.translate(px + pw / 2, py + ph / 2); c.rotate(-o.angle); c.translate(-(px + pw / 2), -(py + ph / 2)); } if (o.fill) { c.fillStyle = o.fill; c.fillRect(px, py, pw, ph); } if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.width || 1.5; c.strokeRect(px, py, pw, ph); } c.restore(); };
  D.rectPx = function (px, py, pw, ph, o) { o = o || {}; var c = D.ctx; c.save(); if (o.fill) { c.fillStyle = o.fill; c.fillRect(px, py, pw, ph); } if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.width || 1.5; c.strokeRect(px, py, pw, ph); } c.restore(); };
  D.arrowPx = function (px, py, dx, dy, o) {
    o = o || {}; var c = D.ctx, len = Math.hypot(dx, dy); if (len < 1) return;
    var ux = dx / len, uy = dy / len, head = Math.min(o.head || 10, len * 0.6), w = o.width || 3;
    c.save(); if (D.ghost) c.globalAlpha = 0.45; c.strokeStyle = o.color || D.color.text; c.fillStyle = c.strokeStyle; c.lineWidth = w;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + dx - ux * head * 0.6, py + dy - uy * head * 0.6); c.stroke();
    c.beginPath(); c.moveTo(px + dx, py + dy); c.lineTo(px + dx - ux * head - uy * head * 0.5, py + dy - uy * head + ux * head * 0.5); c.lineTo(px + dx - ux * head + uy * head * 0.5, py + dy - uy * head - ux * head * 0.5); c.closePath(); c.fill();
    if (o.label) { c.font = D.font(o.size || 12, true); c.textAlign = 'left'; c.textBaseline = 'middle'; var lx = px + dx + ux * 8 + (o.dx || 0), ly = py + dy + uy * 8 + (o.dy || 0); if (ux < -0.3) c.textAlign = 'right'; c.fillText(o.label, lx, ly); }
    c.restore();
  };
  /* ลูกศรจากจุดโลก (x, y) ด้วยองค์ประกอบ dx, dy ในหน่วยโลก (เช่น เมตร) · ใช้ scale เพื่อแปลงปริมาณอื่นเป็นเมตรก่อนเรียก */
  D.arrow = function (x, y, dx, dy, o) { D.arrowPx(D.x(x), D.y(y), D.sx(dx), D.yUp ? -D.sy(dy) : D.sy(dy), o); };
  D.text = function (s, x, y, o) { o = o || {}; D.textPx(s, D.x(x) + (o.dx || 0), D.y(y) + (o.dy || 0), o); };
  D.textPx = function (s, px, py, o) {
    o = o || {}; var c = D.ctx; c.save(); if (D.ghost) c.globalAlpha = 0.5; c.font = D.font(o.size || 13, o.mono); c.textAlign = o.align || 'left'; c.textBaseline = o.baseline || 'middle';
    if (o.bg) { var m = c.measureText(s).width, h = (o.size || 13) + 6, bx = px - (o.align === 'center' ? m / 2 : o.align === 'right' ? m : 0) - 4; c.fillStyle = o.bg; c.fillRect(bx, py - h / 2, m + 8, h); }
    c.fillStyle = o.color || D.color.text; if (o.bold) c.font = 'bold ' + c.font; c.fillText(s, px, py); c.restore();
  };
  D.arc = function (x, y, r, a0, a1, o) { o = o || {}; var c = D.ctx; c.save(); c.strokeStyle = o.color || D.color.muted; c.lineWidth = o.width || 1.5; if (o.dash) c.setLineDash(o.dash); c.beginPath(); c.arc(D.x(x), D.y(y), o.px ? r : D.sx(r), D.yUp ? -a0 : a0, D.yUp ? -a1 : a1, D.yUp); if (o.fill) { c.lineTo(D.x(x), D.y(y)); c.closePath(); c.fillStyle = o.fill; c.fill(); } else c.stroke(); c.restore(); };
  D.angle = function (x, y, rpx, a0, a1, o) { o = o || {}; D.arc(x, y, rpx, a0, a1, { px: true, color: o.color || D.color.muted }); if (o.label) { var am = (a0 + a1) / 2; D.textPx(o.label, D.x(x) + Math.cos(am) * (rpx + 14), D.y(y) - Math.sin(am) * (rpx + 14), { color: o.color || D.color.muted, size: 12, mono: true, align: 'center' }); } };
  D.spring = function (x1, y1, x2, y2, o) {
    o = o || {}; var c = D.ctx, coils = o.coils || 10, amp = o.amp || 8;
    var px1 = D.x(x1), py1 = D.y(y1), px2 = D.x(x2), py2 = D.y(y2), dx = px2 - px1, dy = py2 - py1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    c.save(); c.strokeStyle = o.color || D.color.muted; c.lineWidth = o.width || 2.5; c.beginPath(); c.moveTo(px1, py1);
    var lead = Math.min(14, len * 0.1), n = coils * 2;
    c.lineTo(px1 + ux * lead, py1 + uy * lead);
    for (var i = 1; i <= n; i++) { var t = lead + (len - 2 * lead) * i / n, s = (i % 2 ? 1 : -1) * amp * (i === n ? 0 : 1); c.lineTo(px1 + ux * t + nx * s, py1 + uy * t + ny * s); }
    c.lineTo(px2, py2); c.stroke(); c.restore();
  };
  D.hatch = function (x1, y1, x2, y2, o) { o = o || {}; var c = D.ctx, n = o.n || 12, side = o.side === undefined ? 1 : o.side; var px1 = D.x(x1), py1 = D.y(y1), px2 = D.x(x2), py2 = D.y(y2), dx = px2 - px1, dy = py2 - py1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len; c.save(); c.strokeStyle = o.color || D.color.muted; c.lineWidth = o.width || 2.5; c.beginPath(); c.moveTo(px1, py1); c.lineTo(px2, py2); c.stroke(); c.lineWidth = 1.2; for (var i = 0; i <= n; i++) { var t = len * i / n, bx = px1 + ux * t, by = py1 + uy * t; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - (ux + uy * side) * 8, by - (uy - ux * side) * 8); c.stroke(); } c.restore(); };
  D.ground = function (y, o) { var w = D.world; D.hatch(w.xMin, y, w.xMax, y, Object.assign({ n: Math.round(D.W / 24) }, o || {})); };
  D.label = function (s, x, y, o) { D.text(s, x, y, Object.assign({ size: 12, mono: true, color: D.color.muted }, o || {})); };
  D.vectorScale = function (maxValue, maxMeters) { return maxValue > 0 ? maxMeters / maxValue : 1; };
  return D;
}
function niceStep(raw) { if (!(raw > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; var s = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10; return s * p; }

/* ---------- Graph (GRP-01 ถึง GRP-05) ---------- */
function makeGraph(spec, colors) {
  var canvas = el('canvas', { role: 'img', 'aria-label': 'กราฟ ' + spec.title });
  var box = el('div', { class: 'pl-graph' }, [el('h3', { text: spec.title }), canvas]);
  var g = { spec: spec, el: box, canvas: canvas, ctx: canvas.getContext('2d'), data: {}, n: 0, max: 2000, ymin: 0, ymax: 1, xmin: 0, xmax: 1, hover: null };
  var keys = spec.series.map(function (s) { return s.key; });
  var xkey = spec.x || 't';
  g.reset = function () { g.data = {}; g.data[xkey] = []; keys.forEach(function (k) { g.data[k] = []; }); g.n = 0; g.ymin = spec.yMin !== undefined ? spec.yMin : 0; g.ymax = spec.yMax !== undefined ? spec.yMax : 1; };
  g.push = function (sample) {
    var xv = sample[xkey]; if (xv === undefined || !isFinite(xv)) return;
    g.data[xkey].push(xv); keys.forEach(function (k) { var v = sample[k]; g.data[k].push(isFinite(v) ? v : NaN); });
    if (g.data[xkey].length > g.max) { g.data[xkey].shift(); keys.forEach(function (k) { g.data[k].shift(); }); }
    g.n++;
  };
  g.resize = function () { var r = canvas.getBoundingClientRect(); var dpr = Math.min(global.devicePixelRatio || 1, 3); canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); g.W = r.width; g.H = r.height; g.dpr = dpr; };
  g.draw = function () {
    if (!g.W) g.resize();
    var c = g.ctx, W = g.W, H = g.H, L = 44, R = 10, T = 10, B = 24, col = colors();
    c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); c.clearRect(0, 0, W, H);
    var xs = g.data[xkey], len = xs.length, i, k;
    var xmin, xmax;
    if (xkey === 't') { var win = spec.window || 10; var tNow = len ? xs[len - 1] : 0; xmin = Math.max(0, tNow - win); xmax = Math.max(win, tNow); if (tNow > win) { xmin = tNow - win; xmax = tNow; } }
    else { xmin = spec.xMin !== undefined ? spec.xMin : Infinity; xmax = spec.xMax !== undefined ? spec.xMax : -Infinity; if (spec.xMin === undefined || spec.xMax === undefined) { for (i = 0; i < len; i++) { if (xs[i] < xmin) xmin = xs[i]; if (xs[i] > xmax) xmax = xs[i]; } if (!isFinite(xmin)) { xmin = 0; xmax = 1; } if (xmax - xmin < 1e-9) xmax = xmin + 1; } }
    var ymin = Infinity, ymax = -Infinity;
    keys.forEach(function (k) { var ys = g.data[k]; for (i = 0; i < len; i++) { if (xs[i] < xmin - 1e-9 || xs[i] > xmax + 1e-9) continue; var v = ys[i]; if (!isFinite(v)) continue; if (v < ymin) ymin = v; if (v > ymax) ymax = v; } });
    if (spec.yMin !== undefined) ymin = spec.yMin; if (spec.yMax !== undefined) ymax = spec.yMax;
    if (!isFinite(ymin)) { ymin = 0; ymax = 1; }
    if (spec.zero !== false) { ymin = Math.min(ymin, 0); ymax = Math.max(ymax, 0); }
    if (ymax - ymin < 1e-9) { ymax = ymin + 1; }
    var padY = (ymax - ymin) * 0.08; ymin -= padY; ymax += padY;
    /* ขยายได้ทันที หดช้า (SDD 3.5) */
    if (ymin < g.ymin) g.ymin = ymin; else g.ymin += (ymin - g.ymin) * 0.05;
    if (ymax > g.ymax) g.ymax = ymax; else g.ymax += (ymax - g.ymax) * 0.05;
    ymin = g.ymin; ymax = g.ymax;
    function X(v) { return L + (v - xmin) / (xmax - xmin) * (W - L - R); }
    function Y(v) { return T + (ymax - v) / (ymax - ymin) * (H - T - B); }
    c.strokeStyle = col.soft; c.lineWidth = 1; c.font = '10px ui-monospace, Menlo, monospace'; c.fillStyle = col.muted;
    var ys = niceStep((ymax - ymin) / 4);
    for (k = Math.ceil(ymin / ys) * ys; k <= ymax + 1e-9; k += ys) { c.beginPath(); c.moveTo(L, Y(k)); c.lineTo(W - R, Y(k)); c.stroke(); c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(fmt(k), L - 4, Y(k)); }
    var xs2 = niceStep((xmax - xmin) / 5);
    for (k = Math.ceil(xmin / xs2) * xs2; k <= xmax + 1e-9; k += xs2) { c.beginPath(); c.moveTo(X(k), T); c.lineTo(X(k), H - B); c.stroke(); c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(fmt(k), X(k), H - B + 4); }
    c.strokeStyle = col.line; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L, T); c.lineTo(L, H - B); c.lineTo(W - R, H - B); c.stroke();
    if (ymin < 0 && ymax > 0) { c.strokeStyle = col.line; c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(W - R, Y(0)); c.stroke(); }
    c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillStyle = col.muted; c.fillText(spec.xLabel || (xkey === 't' ? 't (s)' : xkey), W - R, H - B - 2);
    spec.series.forEach(function (s, si) {
      var ysr = g.data[s.key], color = s.color || [col.primary, col.orange, col.green, col.red][si % 4];
      c.strokeStyle = color; c.lineWidth = 2; c.beginPath(); var started = false;
      for (i = 0; i < len; i++) { if (xs[i] < xmin - 1e-9) continue; var v = ysr[i]; if (!isFinite(v)) { started = false; continue; } var px = X(xs[i]), py = Y(v); if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py); }
      c.stroke();
      c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(s.label || s.key, L + 6 + si * 90, T);
    });
    if (g.hover !== null && len) {
      var best = -1, bd = Infinity; for (i = 0; i < len; i++) { var d = Math.abs(X(xs[i]) - g.hover); if (d < bd) { bd = d; best = i; } }
      if (best >= 0 && bd < 20) { c.strokeStyle = col.muted; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(X(xs[best]), T); c.lineTo(X(xs[best]), H - B); c.stroke(); c.setLineDash([]); var txt = (spec.xLabel || xkey) + ' ' + fmt(xs[best]); spec.series.forEach(function (s) { txt += ' · ' + (s.label || s.key) + ' ' + fmt(g.data[s.key][best]); }); c.fillStyle = col.text; c.textAlign = 'right'; c.textBaseline = 'top'; c.fillText(txt, W - R, T + 12); }
    }
  };
  canvas.addEventListener('pointermove', function (e) { var r = canvas.getBoundingClientRect(); g.hover = e.clientX - r.left; g.draw(); });
  canvas.addEventListener('pointerleave', function () { g.hover = null; g.draw(); });
  g.reset();
  return g;
}

/* ---------- Audio (บท 12) ---------- */
var Audio = {
  ctx: null, nodes: {},
  ensure: function () { if (Audio.ctx) { if (Audio.ctx.state === 'suspended') Audio.ctx.resume(); return Audio.ctx; } try { var AC = global.AudioContext || global.webkitAudioContext; Audio.ctx = new AC(); } catch (e) { Audio.ctx = null; } return Audio.ctx; },
  tone: function (id, o) { var ctx = Audio.ensure(); if (!ctx) return null; Audio.stop(id); var osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = (o && o.type) || 'sine'; osc.frequency.value = (o && o.freq) || 440; gain.gain.value = 0; osc.connect(gain); gain.connect(ctx.destination); osc.start(); gain.gain.linearRampToValueAtTime(clamp((o && o.gain) || 0.15, 0, 0.3), ctx.currentTime + 0.03); Audio.nodes[id] = { osc: osc, gain: gain }; return Audio.nodes[id]; },
  set: function (id, o) { var n = Audio.nodes[id]; if (!n || !Audio.ctx) return; if (o.freq !== undefined) n.osc.frequency.setTargetAtTime(o.freq, Audio.ctx.currentTime, 0.02); if (o.gain !== undefined) n.gain.gain.setTargetAtTime(clamp(o.gain, 0, 0.3), Audio.ctx.currentTime, 0.02); },
  stop: function (id) { var n = Audio.nodes[id]; if (!n) return; try { n.gain.gain.setTargetAtTime(0, Audio.ctx.currentTime, 0.02); n.osc.stop(Audio.ctx.currentTime + 0.1); } catch (e) { /* ปิดแล้ว */ } delete Audio.nodes[id]; },
  stopAll: function () { Object.keys(Audio.nodes).forEach(Audio.stop); }
};

/* ---------- UrlState (FI-03, FI-04, NFR-S2) ---------- */
var UrlState = {
  parse: function (params) {
    var out = {}, q;
    try { q = new URLSearchParams(global.location.search); } catch (e) { return out; }
    Object.keys(params).forEach(function (k) {
      if (!q.has(k)) return; var spec = params[k], raw = q.get(k);
      if (spec.type === 'choice') { var m = spec.options.filter(function (o) { return String(o.value) === raw; }); if (m.length) out[k] = m[0].value; return; }
      if (spec.type === "toggle") { out[k] = raw === "1" || raw === "true"; return; }
      if (spec.type === "text") { out[k] = String(raw).slice(0, spec.maxlength || 24); return; }
      var v = parseFloat(raw); if (isFinite(v)) out[k] = clamp(v, spec.min, spec.max);
    });
    if (q.has('seed')) { var s = parseInt(q.get('seed'), 10); if (isFinite(s)) out.seed = s; }
    return out;
  },
  serialize: function (params, specs, extra) {
    var q = new URLSearchParams();
    Object.keys(specs).forEach(function (k) { var v = params[k], d = specs[k].default; if (v !== d) q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)); });
    if (extra) Object.keys(extra).forEach(function (k) { q.set(k, String(extra[k])); });
    var s = q.toString(); return s ? '?' + s : '';
  }
};

/* ---------- createSim ---------- */
global.PhysLabSims = global.PhysLabSims || {};
function createSim(config) {
  if (!config || !config.id || !config.params || !config.init || !config.draw) throw new Error('PhysLab: config ไม่ครบ (id, params, init, draw)');
  global.PhysLabSims[config.id] = config;
  Theme.init();
  var DT = config.dt || DT_DEFAULT;
  var specs = config.params;
  var params = {}; Object.keys(specs).forEach(function (k) { params[k] = specs[k].default; });
  var fromUrl = UrlState.parse(specs); Object.keys(fromUrl).forEach(function (k) { if (k !== 'seed') params[k] = fromUrl[k]; });
  var seed = fromUrl.seed !== undefined ? fromUrl.seed : (config.seed || 1);
  var view = {}; (config.toggles || []).forEach(function (t) { view[t.key] = t.default !== false; });
  var state, ghost = null, t = 0, acc = 0, running = false, speed = config.defaultSpeed || 1, last = 0, halted = false, frameReq = 0, lastDom = 0, lastSample = -1;
  var root = document.getElementById(config.mount || 'sim') || document.body;
  root.innerHTML = '';
  root.classList.add('pl-root');

  /* header (UI-09) */
  var backHref = config.back || '../index.html';
  var crumb = 'บทที่ ' + config.chapter + ' ' + (CHAPTERS[config.chapter] || '') + ' · เรื่อง ' + (config.topics || []).join(', ');
  var themeBtn = el('button', { class: 'pl-btn pl-btn-icon', type: 'button', 'aria-label': 'สลับธีมสว่างมืด', title: 'ธีม', onclick: Theme.toggle }, [svgIcon(ICON.theme)]);
  var header = el('header', { class: 'pl-header' }, [
    el('a', { class: 'pl-back', href: backHref, 'aria-label': 'กลับไปแคตตาล็อก' }, [svgIcon(ICON.back, 20)]),
    el('div', { class: 'pl-titlebox' }, [el('span', { class: 'pl-crumb', text: crumb }), el('h1', { text: config.id + ' ' + config.title })]),
    el('div', { class: 'pl-actions' }, [
      el('button', { class: 'pl-btn', type: 'button', text: 'ค่าเริ่มต้น', onclick: function () { resetDefaults(); } }),
      el('button', { class: 'pl-btn', type: 'button', text: 'คัดลอกลิงก์', onclick: copyLink }),
      el('button', { class: 'pl-btn', type: 'button', text: 'บันทึกภาพ', onclick: savePng }),
      themeBtn])
  ]);
  document.title = config.id + ' ' + config.title + ' · Physics Lab';

  /* stage */
  var canvas = el('canvas', { role: 'img', 'aria-label': config.alt || ('ภาพจำลอง ' + config.title) });
  var alertBox = el('div', { class: 'pl-alert', hidden: '' });
  var wrap = el('div', { class: 'pl-canvas-wrap' }, [canvas, alertBox]);
  var transport = el('div', { class: 'pl-transport' });
  var stage = el('section', { class: 'pl-card pl-stage' }, [wrap, transport]);
  var D = makeDraw(canvas);
  D.view = view;

  /* transport (UI-03) */
  var playBtn, timeEl, speedBtns = [];
  var isStatic = !!config.static;
  if (!isStatic) {
    playBtn = el('button', { class: 'pl-btn pl-btn-primary', type: 'button', 'aria-label': 'เล่น', onclick: togglePlay }, [svgIcon(ICON.play)]);
    var stepBtn = el('button', { class: 'pl-btn pl-btn-icon', type: 'button', 'aria-label': 'ก้าวหนึ่งเฟรม', title: 'ก้าวทีละ dt', onclick: function () { pause(); doStep(1); render(true); } }, [svgIcon(ICON.step)]);
    var resetBtn = el('button', { class: 'pl-btn', type: 'button', text: 'รีเซ็ต', onclick: function () { reset(); } });
    var speedBox = el('div', { class: 'pl-speed', role: 'group', 'aria-label': 'ความเร็วการเล่น' });
    (config.speeds || [0.25, 0.5, 1, 2, 4]).forEach(function (s) { var b = el('button', { type: 'button', text: s + 'x', 'aria-pressed': String(s === speed), onclick: function () { speed = s; speedBtns.forEach(function (bb) { bb.setAttribute('aria-pressed', String(bb._s === speed)); }); } }); b._s = s; speedBtns.push(b); speedBox.appendChild(b); });
    timeEl = el('div', { class: 'pl-time', text: 't = 0 s' });
    transport.appendChild(playBtn); transport.appendChild(stepBtn); transport.appendChild(resetBtn); transport.appendChild(speedBox); transport.appendChild(timeEl);
    if (config.audio) transport.appendChild(el('button', { class: 'pl-btn', type: 'button', text: 'ปิดเสียง', onclick: function () { Audio.stopAll(); if (config.onMute) config.onMute(); } }));
  } else {
    transport.appendChild(el('span', { class: 'pl-param-hint', text: 'ภาพนิ่ง ปรับค่าแล้วเห็นผลทันที' }));
  }
  (config.toggles || []).forEach(function (tg) {
    var cb = el('input', { type: 'checkbox' }); cb.checked = view[tg.key] !== false;
    cb.addEventListener('change', function () { view[tg.key] = cb.checked; if (tg.onChange) tg.onChange(cb.checked, params); render(true); });
    transport.appendChild(el('label', { class: 'pl-toggle' }, [cb, tg.label]));
  });

  /* params (CTL-01 ถึง CTL-04) */
  var paramUI = {};
  var paramsBox = el('div', { class: 'pl-params' });
  Object.keys(specs).forEach(function (k) {
    var sp = specs[k], unit = sp.unit ? ' ' + sp.unit : '';
    var valEl = el('span', { class: 'pl-param-val' });
    var head = el('div', { class: 'pl-param-head' }, [el('label', { for: 'pl-p-' + k, text: sp.label + (sp.symbol ? ' ' + sp.symbol : '') + (sp.drag ? ' (ลากได้)' : '') }), valEl]);
    var box = el('div', { class: 'pl-param' }, [head]);
    var ui = { val: valEl, spec: sp };
    if (sp.type === 'choice') {
      var grp = el('div', { class: 'pl-choice', role: 'group', 'aria-label': sp.label });
      ui.buttons = sp.options.map(function (o) { var b = el('button', { type: 'button', text: o.label, 'aria-pressed': String(o.value === params[k]), onclick: function () { setParam(k, o.value); } }); b._v = o.value; grp.appendChild(b); return b; });
      box.appendChild(grp);
    } else if (sp.type === "text") {
      var tx = el("input", { type: "text", id: "pl-p-" + k, "aria-label": sp.label, maxlength: sp.maxlength || 24, inputmode: sp.inputmode || "decimal", autocomplete: "off" }); tx.className = "pl-text"; tx.value = params[k];
      tx.addEventListener("input", function () { setParam(k, tx.value); });
      ui.text = tx; box.appendChild(el("div", { class: "pl-param-row" }, [tx]));
    } else if (sp.type === "toggle") {
      var cb = el('input', { type: 'checkbox', id: 'pl-p-' + k }); cb.checked = !!params[k]; cb.addEventListener('change', function () { setParam(k, cb.checked); });
      ui.checkbox = cb; head.insertBefore(cb, head.firstChild); valEl.textContent = '';
    } else {
      var range = el('input', { type: 'range', id: 'pl-p-' + k, min: sp.min, max: sp.max, step: sp.step || 'any', 'aria-label': sp.label });
      var num = el('input', { type: 'number', min: sp.min, max: sp.max, step: sp.step || 'any', 'aria-label': sp.label + ' (พิมพ์)' });
      range.value = params[k]; num.value = params[k];
      range.addEventListener('input', function () { setParam(k, parseFloat(range.value)); });
      num.addEventListener('change', function () { var v = parseFloat(num.value); if (!isFinite(v)) { num.value = params[k]; return; } setParam(k, clamp(v, sp.min, sp.max)); });
      ui.range = range; ui.num = num;
      box.appendChild(el('div', { class: 'pl-param-row' }, [range, num]));
    }
    if (sp.hint) box.appendChild(el('div', { class: 'pl-param-hint', text: sp.hint }));
    paramUI[k] = ui; paramsBox.appendChild(box);
  });
  var presetsBox = null;
  if (config.presets && config.presets.length) {
    presetsBox = el('div', { class: 'pl-presets', role: 'group', 'aria-label': 'ชุดค่าสำเร็จรูป' });
    config.presets.forEach(function (pr) { presetsBox.appendChild(el('button', { type: 'button', text: pr.label, title: pr.hint || '', onclick: function () { applyPreset(pr); } })); });
    paramsBox.appendChild(el('div', { class: 'pl-param' }, [el('span', { class: 'pl-param-head' }, [el('label', { text: 'ชุดค่าสำเร็จรูป' })]), presetsBox]));
  }
  var secParams = el('section', { class: 'pl-card pl-sec-params' }, [el('h2', { text: 'แผงควบคุม' }), paramsBox]);

  /* readouts (RDO) */
  var readBox = el('div', { class: 'pl-readouts' }), formulaBox = el('div', { class: 'pl-formulas' }), consBox = el('div', { class: 'pl-conserved' });
  var secRead = el('section', { class: 'pl-card pl-sec-readouts' }, [el('h2', { text: 'ค่าอ่าน' }), readBox, formulaBox, consBox]);
  if (!config.formulas) formulaBox.style.display = 'none';
  if (!config.conserved) consBox.style.display = 'none';

  /* graphs (GRP) */
  var graphs = (config.graphs || []).map(function (gs) { return makeGraph(gs, Theme.colors); });
  var graphsBox = el('div', { class: 'pl-graphs' }, graphs.map(function (g) { return g.el; }));
  if (!graphs.length) graphsBox.style.display = 'none';

  /* content (INF) */
  var ct = config.content || {};
  var contentKids = [el('h2', { text: 'เนื้อหา' })];
  if (ct.summary) contentKids.push(el('p', { html: ct.summary }));
  if (ct.tryIt && ct.tryIt.length) contentKids.push(el('div', { class: 'pl-tryit' }, [el('b', { text: 'ลองทำดู' }), el('ol', null, ct.tryIt.map(function (s) { return el('li', { text: s }); }))]));
  if (ct.reference) {
    var tbl = el('table', null, [el('thead', null, [el('tr', null, ct.reference.columns.map(function (c) { return el('th', { text: c }); }))]), el('tbody', null, ct.reference.rows.map(function (r) { return el('tr', null, r.map(function (c) { return el('td', { text: c }); })); }))]);
    contentKids.push(el('div', { class: 'pl-ref' }, [ct.reference.title ? el('b', { text: ct.reference.title }) : null, tbl]));
  }
  if (ct.note) contentKids.push(el('p', { class: 'pl-param-hint', text: ct.note }));
  var secContent = el('section', { class: 'pl-card pl-sec-content' }, contentKids);

  var body = el('div', { class: 'pl-body' }, [el('div', { class: 'pl-left' }, [stage, graphsBox]), el('div', { class: 'pl-right' }, [secParams, secRead, secContent])]);
  root.appendChild(header); root.appendChild(body);
  root.appendChild(el('div', { class: 'pl-footer', text: 'Physics Lab · เปิดจากไฟล์ในเครื่องได้ ไม่ต้องต่ออินเทอร์เน็ต · ตัวเลขจากการคำนวณจริงทุกเฟรม' }));

  /* ----- core functions ----- */
  function currentWorld(s) { var w = typeof config.world === "function" ? config.world(params, s || state, ghost ? ghost.params : null) : config.world; return w || { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }; }
  function sizeCanvas() {
    var w = wrap.clientWidth || 600, aspect = config.aspect || 0.52, h = clamp(w * aspect, 240, config.maxHeight || 520);
    if (global.innerWidth < 600) h = clamp(w * (config.mobileAspect || 0.8), 240, 420);
    wrap.style.height = h + 'px'; D.resize(); graphs.forEach(function (g) { g.resize(); });
  }
  function render(force) {
    D.color = Theme.colors(); D.ctx.setTransform(1, 0, 0, 1, 0, 0);
    D.setWorld(currentWorld(state)); D.begin(); D.t = t; D.running = running; D.params = params;
    if (ghost) { D.ghost = true; try { config.draw(D.ctx, ghost.state, ghost.params, D); } catch (e) { /* ghost วาดไม่ได้ ข้าม */ } D.ghost = false; }
    config.draw(D.ctx, state, params, D);
    drawHandles();
    var now = performance.now();
    if (force || now - lastDom > 80) { lastDom = now; updateReadouts(); if (timeEl) timeEl.textContent = (config.timeLabel ? config.timeLabel(t, state, params) : ('t = ' + fmt(t, 3) + ' s')); }
    if (graphs.length) { var sampleEvery = 1 / 30; if (force || t - lastSample >= sampleEvery - 1e-9 || t < lastSample) { lastSample = t; var smp = config.sample ? config.sample(state, params, t) : state; var merged = Object.assign({ t: t }, smp); graphs.forEach(function (g) { g.push(merged); g.draw(); }); } }
  }
  function updateReadouts() {
    var rows = config.readouts ? config.readouts(state, params, t) : [];
    while (readBox.children.length > rows.length) readBox.removeChild(readBox.lastChild);
    rows.forEach(function (r, i) {
      var row = readBox.children[i];
      if (!row) { row = el('div', { class: 'pl-readout' }, [el('span', { class: 'k' }), el('span', { class: 'v' })]); readBox.appendChild(row); }
      row.className = 'pl-readout' + (r.highlight ? ' hi' : '');
      row.firstChild.textContent = r.label; row.firstChild.style.color = r.color || '';
      row.lastChild.textContent = (typeof r.value === 'string' ? r.value : fmt(r.value, r.sig)) + (r.unit ? ' ' + r.unit : '');
    });
    if (config.formulas) {
      var fs = config.formulas(state, params, t), html = '<div class="t">สูตรที่ใช้</div>';
      fs.forEach(function (f) { html += '<div>' + esc(f.symbolic) + (f.substituted ? ' <span class="pl-mono">' + esc(f.substituted) + '</span>' : '') + (f.result ? ' <span class="r">' + esc(f.result) + '</span>' : '') + '</div>'; });
      formulaBox.innerHTML = html;
    }
    if (config.conserved) {
      var cs = config.conserved(state, params, t);
      while (consBox.children.length > cs.length) consBox.removeChild(consBox.lastChild);
      cs.forEach(function (c, i) {
        var row = consBox.children[i];
        if (!row) { row = el('div', null, [el('div', { class: 'pl-readout' }, [el('span', { class: 'k' }), el('span', { class: 'v' })]), el('div', { class: 'pl-bar' }, [el('i')])]); consBox.appendChild(row); }
        row.firstChild.firstChild.textContent = c.label; row.firstChild.lastChild.textContent = (c.before !== undefined ? 'ก่อน ' + fmt(c.before) + ' · หลัง ' : '') + fmt(c.after) + (c.unit ? ' ' + c.unit : '');
        var ratio = c.max ? clamp(c.after / c.max, 0, 1) : (c.before ? clamp(Math.abs(c.after / c.before), 0, 1) : 1);
        row.lastChild.firstChild.style.width = (ratio * 100) + '%'; row.lastChild.firstChild.style.background = c.color || '';
      });
    }
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function doStep(n) {
    for (var i = 0; i < n; i++) {
      var ns = config.step(state, params, DT, t); if (ns) state = ns; t += DT;
      if (ghost) { var gs = config.step(ghost.state, ghost.params, DT, t); if (gs) ghost.state = gs; }
      if (config.done && config.done(state, params)) { pause(); break; }
    }
    if (hasNaN(state)) halt();
  }
  function frame(now) {
    if (!running) return;
    var real = (now - last) / 1000; last = now; if (real > 0.25) real = 0.25; if (real < 0) real = 0;
    acc += real * speed; var steps = 0;
    while (acc >= DT && steps < 32 && running && !halted) { doStep(1); acc -= DT; steps++; }
    if (steps >= 32) acc = 0;
    render(false);
    if (running) frameReq = requestAnimationFrame(frame);
  }
  function play() { if (isStatic || halted) return; if (config.onPlay) config.onPlay(state, params); running = true; last = performance.now(); acc = 0; if (playBtn) { playBtn.innerHTML = ''; playBtn.appendChild(svgIcon(ICON.pause)); playBtn.setAttribute('aria-label', 'หยุด'); } cancelAnimationFrame(frameReq); frameReq = requestAnimationFrame(frame); }
  function pause() { running = false; if (playBtn) { playBtn.innerHTML = ''; playBtn.appendChild(svgIcon(ICON.play)); playBtn.setAttribute('aria-label', 'เล่น'); } if (config.onPause) config.onPause(state, params); }
  function togglePlay() { if (running) pause(); else { if (config.done && config.done(state, params)) reset(); play(); } }
  function reset() { pause(); halted = false; alertBox.hidden = true; t = 0; acc = 0; lastSample = -1; state = config.init(params, { seed: seed, rng: rng(seed) }); if (ghost) ghost.state = config.init(ghost.params, { seed: seed, rng: rng(seed) }); graphs.forEach(function (g) { g.reset(); }); if (config.onReset) config.onReset(state, params); render(true); }
  function halt() { pause(); halted = true; alertBox.innerHTML = ''; alertBox.appendChild(el('span', { text: 'ค่าที่ตั้งทำให้คำนวณไม่ได้ ลองลดค่าแล้วรีเซ็ต' })); alertBox.appendChild(el('button', { class: 'pl-btn', type: 'button', text: 'รีเซ็ต', onclick: function () { reset(); } })); alertBox.hidden = false; }
  function syncParamUI(k) {
    var ui = paramUI[k]; if (!ui) return; var sp = ui.spec, v = params[k];
    if (ui.range) { ui.range.value = v; ui.num.value = Math.round(v * 1e6) / 1e6; ui.val.innerHTML = '<b>' + esc(fmt(v, sp.sig || 4)) + '</b>' + (sp.unit ? ' <span>' + esc(sp.unit) + '</span>' : ''); }
    else if (ui.buttons) { ui.buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b._v === v)); }); var o = sp.options.filter(function (x) { return x.value === v; })[0]; ui.val.textContent = o ? o.label : ''; }
    else if (ui.checkbox) { ui.checkbox.checked = !!v; }
    else if (ui.text) { if (ui.text.value !== v) ui.text.value = v; ui.val.textContent = ""; }
  }
  function setParam(k, v, opts) {
    opts = opts || {}; var sp = specs[k]; if (!sp) return;
    if (sp.type === "text") v = String(v).slice(0, sp.maxlength || 24);
    else if (sp.type !== "choice" && sp.type !== "toggle") v = clamp(v, sp.min, sp.max);
    params[k] = v; syncParamUI(k);
    if (config.onParam) config.onParam(k, v, params, state);
    if (isStatic) { state = config.init(params, { seed: seed, rng: rng(seed) }); render(true); return; }
    if (sp.live === false || (t === 0 && !running)) { if (!opts.noReset) reset(); else render(true); }
    else { if (config.onLive) { var ns = config.onLive(state, params, k); if (ns) state = ns; } render(true); }
  }
  function applyPreset(pr) {
    pause(); ghost = null;
    Object.keys(pr.values || {}).forEach(function (k) { if (specs[k]) { params[k] = pr.values[k]; syncParamUI(k); } });
    if (pr.overlay) { var gp = Object.assign({}, params, pr.overlay); ghost = { params: gp, state: null }; }
    if (pr.view) Object.keys(pr.view).forEach(function (k) { view[k] = pr.view[k]; });
    transport.querySelectorAll('.pl-toggle input').forEach(function (cb, i) { var tg = (config.toggles || [])[i]; if (tg) cb.checked = view[tg.key] !== false; });
    reset();
    if (pr.autoplay !== false && !isStatic) play();
  }
  function resetDefaults() { pause(); ghost = null; Object.keys(specs).forEach(function (k) { params[k] = specs[k].default; syncParamUI(k); }); reset(); }
  function copyLink() {
    var base = global.location.href.split('?')[0].split('#')[0];
    var url = base + UrlState.serialize(params, specs, fromUrl.seed !== undefined ? { seed: seed } : null);
    function done(ok) { var b = header.querySelector('.pl-actions button:nth-child(2)'); if (b) { var old = b.textContent; b.textContent = ok ? 'คัดลอกแล้ว' : url; setTimeout(function () { b.textContent = old; }, 1800); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { done(true); }, function () { global.prompt('คัดลอกลิงก์นี้', url); });
    else global.prompt('คัดลอกลิงก์นี้', url);
  }
  function savePng() {
    var off = document.createElement('canvas'); off.width = canvas.width; off.height = canvas.height;
    var c = off.getContext('2d'); c.fillStyle = Theme.colors().bg; c.fillRect(0, 0, off.width, off.height); c.drawImage(canvas, 0, 0);
    c.fillStyle = Theme.colors().muted; c.font = (12 * D.dpr) + 'px system-ui'; c.textAlign = 'right'; c.fillText(config.id + ' ' + config.title + ' · Physics Lab', off.width - 10 * D.dpr, off.height - 10 * D.dpr);
    var name = config.id.replace('.', '-') + '-' + Math.round(t * 100) / 100 + 's.png';
    if (off.toBlob) off.toBlob(function (blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); });
    else { var a2 = document.createElement('a'); a2.href = off.toDataURL('image/png'); a2.download = name; a2.click(); }
  }

  /* drag handles (CTL-05) */
  var handles = [], activeHandle = null;
  function drawHandles() {
    handles = (config.dragHandles && !D.ghost) ? (config.dragHandles(state, params, D) || []) : [];
    var c = D.ctx; handles.forEach(function (h) { var px = h.px !== undefined ? h.px : D.x(h.x), py = h.py !== undefined ? h.py : D.y(h.y); c.save(); c.strokeStyle = D.color.primary; c.lineWidth = 2; c.globalAlpha = activeHandle === h ? 1 : 0.55; c.setLineDash([3, 3]); c.beginPath(); c.arc(px, py, (h.r || 14), 0, Math.PI * 2); c.stroke(); c.restore(); });
  }
  function pointerPos(e) { var r = canvas.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', function (e) {
    if (!handles.length) return; var p = pointerPos(e), best = null, bd = Infinity;
    handles.forEach(function (h) { var px = h.px !== undefined ? h.px : D.x(h.x), py = h.py !== undefined ? h.py : D.y(h.y); var d = Math.hypot(px - p.px, py - p.py); if (d < Math.max(22, (h.r || 14) + 8) && d < bd) { bd = d; best = h; } });
    if (!best) return; activeHandle = best; canvas.setPointerCapture(e.pointerId); e.preventDefault(); if (best.onStart) best.onStart(); if (running && best.pauseWhileDrag !== false) pause();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!activeHandle) return; var p = pointerPos(e), wx = D.wx(p.px), wy = D.wy(p.py);
    if (activeHandle.set) { activeHandle.set(wx, wy, p.px, p.py, params, state); render(true); return; }
    var v = activeHandle.map(wx, wy, params, state, p.px, p.py); if (v === undefined || v === null) return;
    if (typeof v === 'object') { Object.keys(v).forEach(function (k) { var val = v[k]; if (!isFinite(val)) return; var sp2 = specs[k]; if (sp2 && sp2.step) val = Math.round(val / sp2.step) * sp2.step; setParam(k, val, { noReset: false }); }); return; }
    if (!isFinite(v)) return;
    var sp = specs[activeHandle.param]; if (sp && sp.step) v = Math.round(v / sp.step) * sp.step;
    setParam(activeHandle.param, v, { noReset: false });
  });
  function endDrag(e) { if (!activeHandle) return; if (activeHandle.onEnd) activeHandle.onEnd(params, state); activeHandle = null; try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ไม่ได้จับ */ } render(true); }
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

  /* keyboard (UI-04) */
  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); if (!isStatic) togglePlay(); }
    else if (e.key === 'r' || e.key === 'R') { reset(); }
    else if (e.key === 'ArrowRight' && !isStatic) { pause(); doStep(1); render(true); }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (running) { pause(); state._resume = true; } } else if (state && state._resume) { delete state._resume; play(); } });
  document.addEventListener('physlab-theme', function () { render(true); });
  var ro = global.ResizeObserver ? new ResizeObserver(function () { sizeCanvas(); render(true); }) : null;
  if (ro) ro.observe(wrap); else global.addEventListener('resize', function () { sizeCanvas(); render(true); });

  /* public API สำหรับทดสอบและปุ่มพิเศษ */
  var api = {
    get state() { return state; }, get params() { return params; }, get t() { return t; }, get running() { return running; },
    play: play, pause: pause, reset: reset, step: function (n) { doStep(n || 1); render(true); }, setParam: setParam, render: function () { render(true); }, D: D, view: view,
    addButton: function (label, fn) { var b = el('button', { class: 'pl-btn', type: 'button', text: label, onclick: function () { fn(api); } }); transport.insertBefore(b, timeEl || null); return b; },
    note: function (text) { var n = el('span', { class: 'pl-param-hint', text: text }); transport.appendChild(n); return n; }
  };
  Object.keys(specs).forEach(syncParamUI);
  sizeCanvas();
  state = config.init(params, { seed: seed, rng: rng(seed) });
  if (config.setup) config.setup(api);
  render(true);
  var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (config.autoplay && !reduce && !isStatic) play();
  return api;
}

global.PhysLab = { createSim: createSim, fmt: fmt, fmtFixed: fmtFixed, rng: rng, integrate: integrate, clamp: clamp, rad: rad, deg: deg, sup: sup, CHAPTERS: CHAPTERS, Theme: Theme, Audio: Audio, UrlState: UrlState, niceStep: niceStep, DT: DT_DEFAULT, version: '0.1.0' };
})(typeof window !== 'undefined' ? window : globalThis);
