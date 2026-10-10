/* Interstellar — main loop, init and scripting API. Loaded last. */
'use strict';
let lastT = performance.now(), lastUi = 0, fpsN = 0, fpsT = 0;
function step(ts) {
  const dt = Math.min(0.1, (ts - lastT) / 1000); lastT = ts;
  // quaternion low-pass (slerp) smoothing of orientation
  S.q = DEMO ? S.qTarget : C.qSlerp(S.q, S.qTarget, 1 - Math.exp(-dt / (S.mode === 'sensor' ? 0.12 : 0.05)));
  if (S.mode === 'sensor' && performance.now() - S.lastSensor > 3000) {
    S.mode = 'drag'; S.sensorsOk = false; const f = C.enuToAltAz(frame.proj ? frame.proj.forward() : [0, 1, 0]);
    S.view.az = f.az; S.view.alt = f.alt; S.qTarget = C.lookQuat(f.az, f.alt);
  }
  computeFrame(); draw();
  if (ts - lastUi > 250 || DEMO) {
    lastUi = ts; renderCard(); updateLive(); updateGuideBanner();
    if (S.detail) { const o = findObj(S.detail), el = $('#dLive'); if (o && el) el.innerHTML = detailLive(o); }
    const acc = $('#calAcc'); if (acc) acc.textContent = S.compassAcc != null ? `Compass accuracy ±${Math.round(S.compassAcc)}°` : (S.mode === 'sensor' ? 'Compass active' : 'Waiting for compass…');
  }
  if (params.has('fps')) { fpsN++; if (ts - fpsT > 1000) { window.__fps = fpsN; fpsN = 0; fpsT = ts; } }
  if (!DEMO) requestAnimationFrame(step);
}
function init() {
  resize(); setLocation(S.lat, S.lon, S.locName); setFov(S.fov); setNight(S.night);
  $('#hdg').value = S.headingOffset; $('#hdgVal').textContent = S.headingOffset.toFixed(1) + '°';
  $('#optDecl').checked = S.decl; $('#optMetric').checked = S.metric; $('#optGrid').checked = S.grid; $('#optTwinkle').checked = S.twinkle; $('#optCamera').checked = false;
  Object.keys(S.layers).forEach(k => setLayer(k, S.layers[k]));
  renderGroups(); buildSearchIndex();
  const ready = refreshSats();
  if (!DEMO) { requestAnimationFrame(step); if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { }); }
  if (params.has('nocam') || DEMO) $('#start').classList.add('hidden'); else showOnboarding(false);
  window.addEventListener('online', () => { Object.keys(satGroups).forEach(g => { if (satGroups[g].source === 'bundled snapshot') delete satGroups[g]; }); refreshSats(); });
  return ready;
}
const appReady = window.IS_DESK ? (buildDeskLanding(), new Promise(() => { })) : init();

window.Interstellar = {
  ready: appReady, S, frame: () => frame,
  setTime(t) { S.demoTime = t == null ? null : +new Date(t); },
  setLocation, setFov, setLayer, setGroups, setSatGroups, select, startGuide, openSearch, openSheet, openTonight, openDetail, closeDetail, closeSheets, setNight, startTimeTravel, backToNow, openCalib,
  setQuery(q, hl) { $('#q').value = q; renderResults(hl); },
  setView(az, alt, roll = 0) { S.view = { az, alt, roll }; S.q = S.qTarget = C.lookQuat(az, alt, roll); },
  setPreviewLabel(scale) { S.preview = scale ? { scale } : null; },
  stopGuide() { S.guide = null; updateGuideBanner(); },
  hideStart() { $('#start').classList.add('hidden'); },
  showOnboarding, render() { step(performance.now()); },
  project(id) { const o = findObj(id); return o && o.p ? { x: o.p.x, y: o.p.y, alt: o.alt, az: o.az } : null; },
  obj: findObj, tapAt, alerts, hits: () => hits, issPasses: () => { const s = satById.get('sat:25544'); return s ? satPasses(s) : null; },
};
