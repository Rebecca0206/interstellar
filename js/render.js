/* Interstellar — canvas rendering, sensors, input, frame computation. */
'use strict';
const cv = $('#sky'), ctx = cv.getContext('2d');
let W = 0, H = 0;
function resize() { W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.round(W * S.dpr); cv.height = Math.round(H * S.dpr); }
window.addEventListener('resize', resize);
const FONT = 'Inter, "SF Pro Text", -apple-system, system-ui, Roboto, sans-serif';

/* pre-rendered sprites (avoid per-frame gradients) */
const sprites = new Map();
function glowSprite(color) {
  if (sprites.has(color)) return sprites.get(color);
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, color); rg.addColorStop(0.18, color);
  rg.addColorStop(0.45, color.replace('rgb', 'rgba').replace(')', ',.25)')); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64); sprites.set(color, c); return c;
}
const mwSprite = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(170,185,255,0.55)'); rg.addColorStop(1, 'rgba(170,185,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return c; })();

/* ---------------- sensors ---------------- */
function screenAngle() { return (screen.orientation && screen.orientation.angle) || window.orientation || 0; }
function onOrientation(e, absolute) {
  if (e.alpha == null) return;
  let alpha = e.alpha;
  if (e.webkitCompassHeading != null && !isNaN(e.webkitCompassHeading)) {
    // iOS: alpha is relative; derive a smoothed offset from the (magnetic) compass heading
    const compassAlpha = 360 - e.webkitCompassHeading;
    const off = ((compassAlpha - e.alpha + 540) % 360) - 180;
    if (S.iosOffset == null) S.iosOffset = off; else { const d = ((off - S.iosOffset + 540) % 360) - 180; S.iosOffset += d * 0.05; }
    alpha = e.alpha + S.iosOffset; S.compassAcc = e.webkitCompassAccuracy;
  } else if (!absolute && !e.absolute) S.relativeOnly = true;
  alpha -= (S.decl ? S.declination : 0) + S.headingOffset; // magnetic → true north, plus user calibration
  S.qTarget = C.screenAdjust(C.eulerToQuat(alpha, e.beta, e.gamma), screenAngle());
  if (!S.sensorsOk) { S.sensorsOk = true; S.mode = 'sensor'; S.q = S.qTarget; }
  S.lastSensor = performance.now();
}
async function startSensors() {
  try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { toast('Motion access denied — drag to look around.'); return; } } } catch (e) { toast('Motion permission failed — drag to look around.'); return; }
  if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', e => onOrientation(e, true));
  else window.addEventListener('deviceorientation', e => onOrientation(e, false));
  setTimeout(() => { if (!S.sensorsOk) toast('No motion sensors found — drag to look around.'); }, 2500);
}
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Camera not available here (needs HTTPS).'); $('#optCamera').checked = false; return; }
  try { const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    const v = $('#cam'); v.srcObject = st; await v.play().catch(() => { }); v.classList.add('on'); S.camera = true; $('#optCamera').checked = true;
  } catch (e) { toast('Camera blocked — showing a dark sky instead.'); S.camera = false; $('#optCamera').checked = false; }
}
function stopCamera() { const v = $('#cam'); if (v.srcObject) v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; v.classList.remove('on'); S.camera = false; }
function startGeo() {
  if (!navigator.geolocation) { toast('No GPS — set your location in settings.'); return; }
  navigator.geolocation.getCurrentPosition(p => { S.elev = p.coords.altitude || 0; setLocation(p.coords.latitude, p.coords.longitude, 'GPS ±' + Math.round(p.coords.accuracy) + ' m'); },
    () => toast('Location denied — using ' + S.locName + '. Change it in settings.'), { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
}

/* ---------------- drag / pinch / wheel / tap ---------------- */
const pointers = new Map(); let dragMoved = 0, pinch0 = null;
cv.addEventListener('pointerdown', e => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragMoved = 0; try { cv.setPointerCapture(e.pointerId); } catch (_) { }
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: S.fov }; } });
cv.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; dragMoved += Math.abs(dx) + Math.abs(dy);
  if (pointers.size === 2 && pinch0) { const [a, b] = [...pointers.values()]; setFov(pinch0.fov * pinch0.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))); return; }
  if (S.mode === 'sensor') return;
  const k = S.fov / H; S.view.az = (S.view.az - dx * k + 360) % 360; S.view.alt = Math.max(-89, Math.min(89, S.view.alt + dy * k));
  S.qTarget = C.lookQuat(S.view.az, S.view.alt);
});
cv.addEventListener('pointerup', e => { const was = pointers.size; pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = null; if (was === 1 && dragMoved < 10) tapAt(e.clientX, e.clientY); });
cv.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pinch0 = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); setFov(S.fov * Math.exp(e.deltaY * 0.001)); }, { passive: false });
function setFov(f) { S.fov = Math.max(15, Math.min(110, f)); $('#fov').value = S.fov; $('#fovVal').textContent = Math.round(S.fov) + '°'; store.set('fov', S.fov); }

/* ---------------- frame computation ---------------- */
const frame = { objs: [], proj: null, date: new Date(), sun: null, bodies: [] };
const skyCache = { key: '' };
let trail = { id: null, t: 0, pts: [] };
function computeFrame() {
  const date = now(); frame.date = date;
  const P = C.projector(C.qToMatrix(S.q), W, H, S.fov); frame.proj = P;
  // fixed-sky objects move ~0.004°/s: recompute alt/az at most every 250 ms of sky time
  const key = Math.floor(+date / 250) + ':' + S.lat + ':' + S.lon;
  if (key !== skyCache.key) {
    skyCache.key = key; const rot = C.eqjToHorMatrix(date, obs);
    for (const s of stars) { const h = C.eqjToAltAz(s.v, rot); s.alt = h.alt; s.az = h.az; s.enu = C.altAzToENU(h.alt, h.az); }
    for (const d of dsos) { const h = C.eqjToAltAz(d.v, rot); d.alt = h.alt; d.az = h.az; d.enu = C.altAzToENU(h.alt, h.az); }
    for (const c of cons) { const h = C.eqjToAltAz(c.v, rot, false); c.alt = h.alt; c.az = h.az; c.enu = C.altAzToENU(h.alt, h.az);
      c.segs = c.lines.map(seg => seg.map(v => { const hh = C.eqjToAltAz(v, rot); return C.altAzToENU(hh.alt, hh.az); })); }
    for (const m of mwPts) { const h = C.eqjToAltAz(m.v, rot, false); m.enu = C.altAzToENU(h.alt, h.az); m.alt = h.alt; }
  }
  const objs = [], add = o => { o.p = P.project(o.enu); objs.push(o); };
  if (S.layers.stars || S.layers.constellations) stars.forEach(add);
  cons.forEach(add);
  if (S.layers.dso) dsos.forEach(add);
  const bl = updateBodies(date, DEMO); frame.bodies = bl; frame.sun = bl[0];
  for (const b of bl) { b.enu = C.altAzToENU(b.alt, b.az); b.p = P.project(b.enu); if (S.layers.planets || [S.guide && S.guide.id, S.selected, S.detail].includes(b.id)) objs.push(b); }
  if (S.layers.sats && sats.length) {
    updateSats(date, DEMO ? 1e9 : (sats.length > 1500 ? 700 : sats.length));
    for (const s of sats) if (s.st) { s.alt = s.st.alt; s.az = s.st.az; s.enu = C.altAzToENU(s.alt, s.az); add(s); }
  }
  frame.objs = objs;
  const selSat = S.selected && S.selected.startsWith('sat:') ? satById.get(S.selected) : null;
  if (selSat && (trail.id !== selSat.id || Math.abs(date - trail.t) > 5000)) {
    const pts = [];
    for (let dt = -180; dt <= 600; dt += 10) { const st = C.satState(selSat, new Date(+date + dt * 1000), gd); if (st) pts.push({ dt, enu: C.altAzToENU(st.alt, st.az) }); }
    trail = { id: selSat.id, t: +date, pts };
  } else if (!selSat) trail = { id: null, t: 0, pts: [] };
}

/* ---------------- drawing ---------------- */
let placed = [], hits = [];
function freeRect(x, y, w, h) { for (const r of placed) if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return false; placed.push({ x, y, w, h }); return true; }
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const onScreen = (p, m = 30) => p && p.x > -m && p.x < W + m && p.y > -m && p.y < H + m;
function label(o, x, y, name, subs, color, opt = {}) {
  const fs = opt.size || 13, sfs = Math.round(fs * 0.8);
  ctx.font = `600 ${fs}px ${FONT}`; let w = ctx.measureText(name).width;
  ctx.font = `500 ${sfs}px ${FONT}`; for (const s of subs) w = Math.max(w, ctx.measureText(s).width);
  const h = fs + subs.length * (sfs + 3) + 2, dx = opt.dx ?? 10;
  let lx = x + dx; const ly = y - fs / 2 - 1; if (lx + w > W - 4) lx = x - dx - w;
  if (!opt.force && !freeRect(lx - 3, ly - 2, w + 6, h + 4)) return false;
  if (opt.force) placed.push({ x: lx - 3, y: ly - 2, w: w + 6, h: h + 4 });
  // generous hit box: object + its label, at least 44 px tall
  const x0 = Math.min(lx, x - 14) - 6, x1 = Math.max(lx + w, x + 14) + 6;
  hits.push({ id: o.id, x: x0, y: Math.min(ly, y - 16) - 6, w: x1 - x0, h: Math.max(h, 32) + 12 });
  if (opt.bubble) { ctx.fillStyle = opt.bubble; roundRect(lx - 7, ly - 5, w + 14, h + 9, 9); ctx.fill(); }
  ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 4;
  ctx.font = `600 ${fs}px ${FONT}`; ctx.fillStyle = color; ctx.fillText(name, lx, ly);
  ctx.font = `500 ${sfs}px ${FONT}`; ctx.fillStyle = opt.subColor || 'rgba(205,215,240,.78)';
  subs.forEach((s, i) => ctx.fillText(s, lx, ly + fs + 3 + i * (sfs + 3)));
  ctx.shadowBlur = 0; return true;
}
function horizonFn(az) { return 0.6 + 0.45 * Math.sin(az * D2R * 3 + 1.3) + 0.35 * Math.sin(az * D2R * 7 + 0.4) + 0.5 * Math.max(0, Math.sin(az * D2R * 17)) + 0.35 * Math.sin(az * D2R * 41); }
function drawBackground(P) {
  const sunAlt = frame.sun ? frame.sun.alt : -30;
  if (S.camera) { ctx.clearRect(0, 0, W, H); return; }
  const t = Math.max(0, Math.min(1, (sunAlt + 18) / 24));
  const hz = P.project(C.altAzToENU(0, C.enuToAltAz(P.forward()).az)) || { y: H };
  const zen = [5 + 40 * t, 8 + 80 * t, 20 + 150 * t], hor = [12 + 140 * t, 18 + 120 * t, 40 + 140 * t];
  const g = ctx.createLinearGradient(0, Math.min(hz.y, H) - H * 1.2, 0, Math.max(hz.y, 0));
  g.addColorStop(0, `rgb(${zen.map(Math.round)})`); g.addColorStop(1, `rgb(${hor.map(Math.round)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (frame.sun && sunAlt > -20) { const sp = P.project(C.altAzToENU(Math.max(sunAlt, -3), frame.sun.az));
    if (sp) { const rg = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, H * 0.9), a = 0.55 * Math.max(0, Math.min(1, (sunAlt + 20) / 14));
      rg.addColorStop(0, `rgba(255,150,90,${a})`); rg.addColorStop(0.35, `rgba(150,90,160,${a * 0.45})`); rg.addColorStop(1, 'rgba(40,40,90,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); } }
}
function drawMilkyWay(P) {
  const sunAlt = frame.sun ? frame.sun.alt : -30; if (sunAlt > -8) return;
  const fade = Math.min(1, (-8 - sunAlt) / 8) * (S.camera ? 0.5 : 1), size = Math.max(10, (2.6 * D2R) * P.f * 1.6);
  ctx.globalCompositeOperation = 'lighter';
  for (const m of mwPts) { if (m.alt < -2) continue; const p = P.project(m.enu); if (!p || p.z < 0.1 || !onScreen(p, size)) continue;
    ctx.globalAlpha = fade * (0.05 + 0.035 * m.l) * Math.min(1, (m.alt + 2) / 15); ctx.drawImage(mwSprite, p.x - size / 2, p.y - size / 2, size, size); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawGround(P) {
  const runs = []; let run = [];
  for (let az = 0; az <= 360; az += 1.5) { const p = P.project(C.altAzToENU(S.camera ? 0 : horizonFn(az), az)); if (p && p.z > 0.05) run.push(p); else if (run.length) { runs.push(run); run = []; } }
  if (run.length) runs.push(run);
  for (const r of runs) { if (r.length < 2) continue;
    if (!S.camera) { ctx.beginPath(); ctx.moveTo(r[0].x, r[0].y + 3000); r.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(r[r.length - 1].x, r[r.length - 1].y + 3000); ctx.closePath(); ctx.fillStyle = '#03050a'; ctx.fill(); }
    ctx.beginPath(); r.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.strokeStyle = S.camera ? 'rgba(120,200,160,.55)' : 'rgba(120,150,220,.25)'; ctx.lineWidth = 1.2; ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].forEach((n, i) => { const p = P.project(C.altAzToENU(S.camera ? -2.5 : -4, i * 45)); if (!onScreen(p)) return;
    ctx.font = `${n.length === 1 ? 700 : 600} ${n.length === 1 ? 16 : 12}px ${FONT}`; ctx.fillStyle = n === 'N' ? '#ff7a6b' : 'rgba(200,215,255,.8)'; ctx.fillText(n, p.x, Math.min(p.y, H - 20)); });
  ctx.textAlign = 'left';
}
function drawGrid(P) {
  ctx.strokeStyle = 'rgba(120,150,255,.12)'; ctx.lineWidth = 1;
  const line = (fn, a0, a1, st) => { ctx.beginPath(); let pen = false; for (let a = a0; a <= a1; a += st) { const p = P.project(fn(a)); if (p && p.z > 0.05) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; } ctx.stroke(); };
  for (let alt = 15; alt < 90; alt += 15) line(az => C.altAzToENU(alt, az), 0, 360, 3);
  for (let az = 0; az < 360; az += 30) line(alt => C.altAzToENU(alt, az), 0, 90, 3);
}
function strokeFigure(P, c) { for (const seg of c.segs) { let prev = null; for (const v of seg) { const p = P.project(v); const ok = p && p.z > 0.08; if (ok && prev) { ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); } prev = ok ? p : null; } } }
const altTxt = a => `${Math.round(a)}° up`;
function subFor(o) {
  const m = S.metric;
  switch (o.kind) {
    case 'star': return [altTxt(o.alt) + (o.ly ? ' · ' + C.fmtLy(o.ly) : '')];
    case 'dso': return [`${o.type} · ${altTxt(o.alt)}`];
    case 'sat': return [`${C.fmtDist(o.st.heightKm, m)} high · ${C.fmtSpeed(o.st.speedKms, m)}`].concat(o.hl || o.id === S.selected ? [o.st.sunlit ? '☀ sunlit' : '● in Earth\'s shadow'] : []);
    default: return [`${altTxt(o.alt)} · ${C.fmtDist(o.distKm, m)}`, `${C.fmtSpeed(o.rangeRate, m)} ${o.rangeRate >= 0 ? 'receding' : 'approaching'}`];
  }
}
function draw() {
  const P = frame.proj; placed = [{ x: W / 2 - 26, y: H / 2 - 26, w: 52, h: 52 }]; hits = [];
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  drawBackground(P);
  if (S.layers.milkyway) drawMilkyWay(P);
  if (S.grid) drawGrid(P);
  const lim = S.fov > 70 ? 2.0 : S.fov > 45 ? 2.6 : S.fov > 28 ? 3.3 : 4.2, tsec = performance.now() / 1000, sel = S.selected;
  if (S.layers.constellations) {
    ctx.strokeStyle = 'rgba(130,165,255,.38)'; ctx.lineWidth = 1.1; ctx.beginPath();
    for (const c of cons) if (c.id !== sel) strokeFigure(P, c);
    ctx.stroke();
    const sc = cons.find(c => c.id === sel);
    if (sc) { ctx.strokeStyle = 'rgba(255,211,107,.9)'; ctx.lineWidth = 2.2; ctx.beginPath(); strokeFigure(P, sc); ctx.stroke(); }
  }
  // stars: size & brightness scale with flux (magnitude); altitude-dependent twinkle
  if (S.layers.stars) { const zs = Math.pow(60 / S.fov, 0.35);
    for (const s of stars) { if (!onScreen(s.p, 6)) continue;
      const flux = Math.pow(10, -0.4 * (s.mag - 1)), r = Math.max(0.55, Math.min(7, 2 * Math.pow(flux, 0.33))) * zs;
      let a = Math.min(1, 0.35 + 0.65 * Math.pow(flux, 0.25)); if (s.alt < 0) a *= 0.35;
      if (S.twinkle && !DEMO) { const amp = 0.3 * Math.pow(1 - Math.max(0, s.alt) / 90, 2); a *= 1 - amp * (0.5 + 0.5 * Math.sin(tsec * s.tf * 3 + s.tw)); }
      ctx.globalAlpha = a;
      if (s.mag < 2.2) { const sz = r * 5; ctx.drawImage(glowSprite(s.color), s.p.x - sz / 2, s.p.y - sz / 2, sz, sz); }
      ctx.fillStyle = s.mag < 1.5 ? '#fff' : s.color; ctx.beginPath(); ctx.arc(s.p.x, s.p.y, r * 0.7, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; }
  drawGround(P);
  // predicted track for selected satellite
  if (trail.pts.length > 1) {
    for (let i = 1; i < trail.pts.length; i++) { const a = P.project(trail.pts[i - 1].enu), b = P.project(trail.pts[i].enu); if (!a || !b || a.z < 0.05 || b.z < 0.05) continue;
      const fut = trail.pts[i].dt > 0; ctx.strokeStyle = fut ? 'rgba(98,232,255,.85)' : 'rgba(98,232,255,.35)'; ctx.lineWidth = fut ? 2 : 1.5; ctx.setLineDash(fut ? [] : [4, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const t of trail.pts) if (t.dt > 0 && t.dt % 60 === 0) { const p = P.project(t.enu); if (onScreen(p, 0) && p.z > 0.05) { ctx.fillStyle = 'rgba(98,232,255,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, 7); ctx.fill();
      ctx.font = `600 9.5px ${FONT}`; ctx.fillStyle = 'rgba(160,240,255,.8)'; ctx.fillText(`+${t.dt / 60}m`, p.x + 5, p.y + 3); } }
  }
  if (S.layers.sats) for (const s of frame.objs) if (s.kind === 'sat' && !s.hl && onScreen(s.p, 4)) {
    ctx.fillStyle = s.st.sunlit ? 'rgba(255,255,240,.95)' : 'rgba(130,155,210,.55)'; const r = s.group === 'starlink' ? 1.4 : 2; ctx.fillRect(s.p.x - r, s.p.y - r, r * 2, r * 2);
    hits.push({ id: s.id, x: s.p.x - 18, y: s.p.y - 18, w: 36, h: 36, weak: true }); }
  // labels, priority order
  const L = [], seen = new Set(), push = o => { if (!seen.has(o.id)) { seen.add(o.id); L.push(o); } };
  for (const o of frame.objs) if (o.id === sel && onScreen(o.p) && o.kind !== 'con') push(o);
  for (const o of frame.objs) if (o.kind === 'sat' && o.hl && onScreen(o.p)) push(o);
  if (S.layers.planets) for (const o of frame.bodies) if (onScreen(o.p)) push(o);
  if (S.layers.stars) for (const o of stars) if (o.name && o.mag <= lim && onScreen(o.p, 0)) push(o);
  if (S.layers.dso) for (const o of dsos) if (o.mag <= (S.fov > 50 ? 6 : 9) && onScreen(o.p, 0)) push(o);
  if (S.layers.sats) frame.objs.filter(o => o.kind === 'sat' && !o.hl && o.alt > 0 && onScreen(o.p, 0)).sort((a, b) => Math.hypot(a.p.x - W / 2, a.p.y - H / 2) - Math.hypot(b.p.x - W / 2, b.p.y - H / 2)).slice(0, 7).forEach(push);
  for (const o of L) {
    const isSel = o.id === sel;
    if (o.kind === 'planet' || o.kind === 'sun' || o.kind === 'moon') { drawBody(o); label(o, o.p.x, o.p.y, o.name, subFor(o), o.color, { dx: o.r + 8, force: true, size: 14 }); }
    else if (o.kind === 'sat') { if (o.hl) drawStation(o); label(o, o.p.x, o.p.y, o.hl || o.name, subFor(o), o.hl ? '#62e8ff' : 'rgba(225,235,255,.9)', { force: o.hl || isSel, size: o.hl ? 14 : 11.5, bubble: o.hl ? 'rgba(10,40,60,.55)' : null, dx: o.hl ? 14 : 7 }); }
    else if (o.kind === 'star') label(o, o.p.x, o.p.y, o.name, subFor(o), 'rgba(235,240,255,.95)', { size: 12.5, force: isSel });
    else if (o.kind === 'dso') { drawDso(o); label(o, o.p.x, o.p.y, o.name, subFor(o), '#c7a6ff', { size: 12, dx: 12, force: isSel }); }
    if (isSel) { ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.p.x, o.p.y, 15, 0, 7); ctx.stroke(); }
  }
  // unlabeled objects stay tappable
  if (S.layers.stars) for (const s of stars) if (s.mag < 3.6 && !seen.has(s.id) && onScreen(s.p, 0)) hits.push({ id: s.id, x: s.p.x - 16, y: s.p.y - 16, w: 32, h: 32, weak: true });
  if (S.layers.dso) for (const d of dsos) if (!seen.has(d.id) && onScreen(d.p, 0) && d.alt > -2) { drawDso(d, 0.4); hits.push({ id: d.id, x: d.p.x - 16, y: d.p.y - 16, w: 32, h: 32, weak: true }); }
  if (S.layers.constellations) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const c of cons) if (onScreen(c.p, 0) && c.alt > -5 && (S.fov < 70 || c.rank <= 2 || c.id === sel)) {
      ctx.font = `600 10.5px ${FONT}`; const t = c.name.toUpperCase().split('').join('\u200A'), w = ctx.measureText(t).width;
      if (freeRect(c.p.x - w / 2, c.p.y - 7, w, 14) || c.id === sel) { ctx.fillStyle = c.id === sel ? '#ffd36b' : 'rgba(150,180,255,.6)'; ctx.fillText(t, c.p.x, c.p.y);
        hits.push({ id: c.id, x: c.p.x - w / 2 - 10, y: c.p.y - 20, w: w + 20, h: 40, weak: true }); } }
    ctx.textAlign = 'left'; }
  drawGuide(P);
}
function drawBody(o) {
  const { x, y } = o.p, r = o.r;
  ctx.drawImage(glowSprite(hexToRgb(o.color)), x - r * 3.5, y - r * 3.5, r * 7, r * 7);
  ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  if (o.kind === 'moon' && o.phase != null) { const sp = frame.proj.project(C.altAzToENU(frame.sun.alt, frame.sun.az)); const ang = sp ? Math.atan2(sp.y - y, sp.x - x) : 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = 'rgba(10,12,22,.85)'; ctx.beginPath(); ctx.arc(0, 0, r + 0.3, Math.PI / 2, Math.PI * 1.5);
    const k = 1 - 2 * o.phase; ctx.ellipse(0, 0, Math.abs(k) * r, r + 0.3, 0, -Math.PI / 2, Math.PI / 2, k < 0); ctx.fill(); ctx.restore(); }
  if (o.ring) { ctx.strokeStyle = o.color; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x, y, r * 2, r * 0.6, -0.4, 0, 7); ctx.stroke(); }
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return `rgb(${n >> 16},${(n >> 8) & 255},${n & 255})`; }
function drawStation(o) { const { x, y } = o.p; ctx.save(); ctx.translate(x, y); ctx.shadowColor = '#62e8ff'; ctx.shadowBlur = 12; ctx.fillStyle = o.st.sunlit ? '#e9fbff' : '#5b7c96';
  ctx.fillRect(-9, -1, 18, 2); ctx.fillRect(-10, -5, 5, 10); ctx.fillRect(5, -5, 5, 10); ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 7); ctx.fill(); ctx.restore(); }
function drawDso(o, alpha = 0.8) {
  const { x, y } = o.p; ctx.strokeStyle = `rgba(199,166,255,${alpha})`; ctx.lineWidth = 1.2;
  if (o.t && (o.t[0] === 's' || o.t[0] === 'e' || o.t[0] === 'i')) { ctx.beginPath(); ctx.ellipse(x, y, 9, 4.5, -0.5, 0, 7); ctx.stroke(); }
  else if (o.t === 'oc' || o.t === 'gc') { ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  else ctx.strokeRect(x - 5, y - 5, 10, 10);
}
function findObj(id) {
  if (!id) return null; const k = id.split(':')[0];
  if (k === 'sat') return satById.get(id) || null;
  if (k === 'body') return frame.bodies.find(b => b.id === id) || null;
  if (k === 'star') return stars.find(s => s.id === id) || null;
  if (k === 'dso') return dsos.find(d => d.id === id) || null;
  if (k === 'con') return cons.find(c => c.id === id) || null;
  return null;
}
function drawGuide(P) {
  if (!S.guide) return; const o = findObj(S.guide.id); if (!o || !o.enu) return;
  const p = P.project(o.enu), pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
  if (onScreen(p, -40)) { ctx.strokeStyle = `rgba(255,200,110,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, 22 + 6 * pulse, 0, 7); ctx.stroke();
    if (!S.guide.found && Math.hypot(p.x - W / 2, p.y - H / 2) < 60) { S.guide.found = true; haptic(30); } return; }
  const d = P.dirTo(o.enu), m = 56, t = Math.min((W / 2 - m) / Math.abs(d.x || 1e-6), (H / 2 - m - 40) / Math.abs(d.y || 1e-6));
  const ax = W / 2 + d.x * t, ay = H / 2 + d.y * t;
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.atan2(d.y, d.x)); ctx.fillStyle = '#ffc56b'; ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-10, -15); ctx.lineTo(-3, 0); ctx.lineTo(-10, 15); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.font = `700 12px ${FONT}`; ctx.fillStyle = '#ffe2a8'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
  ctx.fillText(`${(o.hl || o.name).split(' · ')[0]} · ${Math.round(C.angSep(P.forward(), o.enu))}°`, ax - d.x * 44, ay - d.y * 44); ctx.shadowBlur = 0; ctx.textAlign = 'left';
}
