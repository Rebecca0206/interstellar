/* Interstellar — pass alerts, Tonight card, compass calibration, share, onboarding, toast. */
'use strict';
/* ---------------- pass alerts (ISS + bright satellites) ---------------- */
const alerts = {
  list: [], queue: [], timers: [], enabled: store.get('notify', false), done: false, started: false,
  reset() { this.list = []; this.queue = []; this.done = false; this.started = false; },
  start() {
    if (this.started || !sats.length) return; this.started = true;
    // ISS & Tiangong (≥10°) plus CelesTrak "brightest" group (≥30°), visible passes in the next 24 h — computed in small idle slices
    this.queue = sats.filter(s => s.hl || s.group === 'visual').sort((a, b) => (b.hl ? 1 : 0) - (a.hl ? 1 : 0));
    const t0 = now(), step = () => {
      const until = performance.now() + 6;
      while (this.queue.length && performance.now() < until) {
        const s = this.queue.shift();
        for (const p of C.findPasses(s, S.lat, S.lon, S.elev, t0, 24, s.hl ? 10 : 30, obs)) if (p.visible) this.list.push({ id: s.id, name: s.hl || s.name, p });
      }
      this.list.sort((a, b) => a.p.rise - b.p.rise);
      if (this.queue.length) setTimeout(step, 16); else { this.done = true; this.schedule(); if (!$('#tonight').classList.contains('hidden')) renderTonight(); }
    };
    setTimeout(step, 300);
  },
  schedule() {
    this.timers.forEach(clearTimeout); this.timers = [];
    if (!this.enabled || !('Notification' in window) || Notification.permission !== 'granted' || !isLive()) return;
    for (const a of this.list.slice(0, 20)) { const ms = +a.p.rise - 5 * 60e3 - Date.now();
      if (ms > 0 && ms < 24 * 3600e3) this.timers.push(setTimeout(() => notify(`${a.name} pass in 5 minutes`, `Rises ${C.dirName(a.p.riseAz)} at ${fmtTime(a.p.rise)} · max ${Math.round(a.p.maxEl)}° ${C.dirName(a.p.maxAz)}`), ms)); }
  },
};
async function notify(title, body) {
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' }); else new Notification(title, { body, icon: 'icons/icon-192.png' }); } catch (e) { }
}
async function toggleNotify() {
  if (!('Notification' in window)) { toast('Notifications aren’t supported here (on iPhone, add Interstellar Lens to the Home Screen first).'); return; }
  if (!alerts.enabled) { const p = await Notification.requestPermission(); if (p !== 'granted') { toast('Notifications blocked.'); return; } }
  alerts.enabled = !alerts.enabled; store.set('notify', alerts.enabled); alerts.schedule(); renderTonight();
  toast(alerts.enabled ? 'Alert 5 minutes before each visible pass (while Interstellar Lens is open).' : 'Pass alerts off.');
}

/* ---------------- Tonight ---------------- */
function tonightWindow(date) {
  const ev = C.sunEvents(date, obs), evNext = C.sunEvents(new Date(+C.startOfLocalDay(date) + 86400e3 + 3600e3), obs);
  // darkness window: from civil dusk (or now, if later) to next civil dawn
  const dusk = ev.civilDusk || ev.sunset, start = dusk && dusk > date ? dusk : date, end = evNext.civilDawn || evNext.sunrise || new Date(+start + 12 * 3600e3);
  return { ev, evNext, start, end };
}
function upcomingShowers(date) {
  return (F.showers || []).map(s => { const y = (s.peak.match(/(\d{4})$/) || [])[1], md = s.peak.match(/^([A-Za-z]{3}) (\d+)/);
    return Object.assign({ pd: md && y ? new Date(`${md[1]} ${md[2]}, ${y} 12:00`) : null }, s); })
    .filter(s => s.pd && +s.pd > +date - 2 * 86400e3).sort((a, b) => a.pd - b.pd).slice(0, 3);
}
function renderTonight() {
  const date = now(), tw = tonightWindow(date), ev = tw.ev;
  const moon = frame.bodies.find(b => b.id === 'body:Moon') || C.bodyState(C.BODIES[1], date, obs), mp = C.moonPhaseName(date), mrts = C.riseTransitSet('Moon', date, obs);
  const planets = [];
  for (const b of C.BODIES.slice(2)) { let best = null;
    for (let t = +tw.start; t <= +tw.end; t += 20 * 60e3) { const st = C.bodyState(b, new Date(t), obs); if (!best || st.alt > best.alt) best = { alt: st.alt, az: st.az, t: new Date(t), mag: st.mag }; }
    if (best && best.alt > 5 && best.mag != null && best.mag < 6.5) planets.push({ b, best }); }
  const sunUp = frame.sun && frame.sun.alt > -6;
  const nowList = sunUp ? [] : [].concat(frame.bodies.filter(b => b.alt > 10 && b.kind !== 'sun').map(b => ({ id: b.id, name: b.name, mag: b.mag, alt: b.alt, az: b.az, color: b.color })),
    stars.filter(s => s.name && s.alt > 25 && s.mag < 1.5).map(s => ({ id: s.id, name: s.name, mag: s.mag, alt: s.alt, az: s.az, color: s.color })),
    dsos.filter(d => d.alt > 25 && parseFloat(d.mag) < 5).map(d => ({ id: d.id, name: d.name, mag: parseFloat(d.mag), alt: d.alt, az: d.az, color: '#c7a6ff' }))).sort((a, b) => a.mag - b.mag).slice(0, 8);
  const li = (o, r) => `<li class="tap" data-open="${o.id}"><i class="sw" style="background:${o.color}"></i>${esc(o.name)}<span class="r">${r}</span></li>`;
  $('#tonightBody').innerHTML = `<div class="dhd"><div><h2>Tonight</h2><div class="dsub">${esc(S.locName)} · ${date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div></div><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <h3>Sun &amp; twilight</h3>${kv([['Sunset', fmtTime(ev.sunset)], ['Civil dusk', fmtTime(ev.civilDusk)], ['Nautical dusk', fmtTime(ev.nauticalDusk)], ['Dark sky from', fmtTime(ev.astroDusk)],
      ['Dark sky until', fmtTime(tw.evNext.astroDawn)], ['Sunrise', fmtTime(tw.evNext.sunrise)]], 'three')}
    <h3>Moon</h3>${kv([['Phase', mp.name], ['Illuminated', Math.round((moon.phase || 0) * 100) + '%'], ['Moonrise', fmtTime(mrts.rise)], ['Moonset', fmtTime(mrts.set)]])}
    <div class="hint small">Next: ${C.nextMoonQuarters(date, 2).map(q => `${q.name} ${q.date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`).join(' · ')}</div>
    <h3>Planets tonight</h3><ul class="list">${planets.length ? planets.map(p => li({ id: 'body:' + p.b.id, name: p.b.name, color: p.b.color }, `best ${fmtTime(p.best.t)} · ${Math.round(p.best.alt)}° ${C.dirName(p.best.az)} · mag ${p.best.mag.toFixed(1)}`)).join('') : '<li>No planets above the horizon tonight.</li>'}</ul>
    <h3>Best to see now</h3><ul class="list">${nowList.length ? nowList.map(o => li(o, `${Math.round(o.alt)}° ${C.dirName(o.az)} · mag ${o.mag.toFixed(1)}`)).join('') : `<li>${sunUp ? 'The sky is still bright — check back after dusk.' : 'Nothing bright is high right now.'}</li>`}</ul>
    <h3>Satellite passes · next 24 h</h3><ul class="list">${alerts.list.length ? alerts.list.slice(0, 8).map(a => li({ id: a.id, name: a.name, color: '#62e8ff' }, `${fmtDT(a.p.rise)} · max ${Math.round(a.p.maxEl)}° ${C.dirName(a.p.maxAz)}`)).join('') : `<li>${alerts.done ? 'No visible passes of the ISS or bright satellites in the next 24 h.' : 'Calculating visible passes…'}</li>`}</ul>
    <div class="acts"><button class="btn ${alerts.enabled ? '' : 'ghost'}" data-act="notify">${alerts.enabled ? '🔔 Pass alerts on' : '🔕 Enable pass alerts'}</button></div>
    <h3>Meteor showers</h3><ul class="list">${upcomingShowers(date).map(s => `<li><div><b>${esc(s.name)}</b><div class="hint">Peak night ${esc(s.peak)} · active ${esc(s.active)}</div></div></li>`).join('')}</ul>
    <p class="src">Sources: astronomy-engine (Sun, Moon, planets) · CelesTrak TLE (passes) · ${esc((F.sources || {}).showers || '')}</p>`;
  if (!alerts.started) alerts.start();
}
$('#tonight').addEventListener('click', e => { const a = e.target.closest('[data-act],[data-open]'); if (!a) return;
  if (a.dataset.open) return openDetail(a.dataset.open); if (a.dataset.act === 'close') closeSheets(); if (a.dataset.act === 'notify') toggleNotify(); });

/* ---------------- guided compass calibration ---------------- */
let calibStep = 0, calibTarget = null;
function openCalib() { closeSheets(); calibStep = 0; $('#calib').classList.remove('hidden'); renderCalib(); }
function renderCalib() {
  const b = $('#calibBody'), btns = (...x) => `<div class="acts" style="justify-content:center">${x.join('')}</div>`;
  if (calibStep === 0) b.innerHTML = `<h2>Calibrate compass</h2><svg class="fig8" viewBox="0 0 120 70"><path d="M60 35c-15-25-50-25-50 0s35 25 50 0 50-25 50 0-35 25-50 0Z"/></svg>
    <p>Step 1 of 2 · Move your phone in a slow figure-8 a few times, away from metal, magnets and cars.</p><p class="hint" id="calAcc"></p>${btns('<button class="btn" data-c="next">Next</button>', '<button class="btn ghost" data-c="close">Cancel</button>')}`;
  else if (calibStep === 1) {
    calibTarget = [].concat(frame.bodies.filter(x => x.alt > 8 && x.kind !== 'sun'), stars.filter(s => s.name && s.mag < 1 && s.alt > 10)).sort((a, x) => (a.mag ?? 9) - (x.mag ?? 9))[0] || null;
    b.innerHTML = calibTarget ? `<h2>Center a bright object</h2><p>Step 2 of 2 · Follow the arrow to <b>${esc(calibTarget.name)}</b> (${Math.round(calibTarget.alt)}° up, ${C.dirName(calibTarget.az)}). Put it in the crosshair, then tap <b>It’s centered</b>.</p>${btns('<button class="btn" data-c="go">Show me</button>', '<button class="btn ghost" data-c="skip">Skip</button>')}`
      : `<h2>No bright target up</h2><p>No Moon, planet or very bright star is above the horizon. Use the Heading correction slider to fine-tune instead.</p>${btns('<button class="btn" data-c="close">OK</button>')}`;
  } else b.innerHTML = `<h2>All set</h2><p>Heading correction <b>${S.headingOffset.toFixed(1)}°</b>${S.decl ? ` · magnetic declination ${S.declination.toFixed(1)}° applied (WMM2025)` : ''}.</p>${btns('<button class="btn" data-c="close">Done</button>', '<button class="btn ghost" data-c="reset">Reset to 0°</button>')}`;
}
$('#calib').addEventListener('click', e => { const a = e.target.closest('[data-c]'); if (!a) return; const c = a.dataset.c;
  if (c === 'close') $('#calib').classList.add('hidden');
  if (c === 'next') { calibStep = 1; renderCalib(); }
  if (c === 'skip') { calibStep = 2; renderCalib(); }
  if (c === 'reset') { S.headingOffset = 0; store.set('hdg', 0); $('#hdg').value = 0; $('#hdgVal').textContent = '0.0°'; renderCalib(); }
  if (c === 'go') { $('#calib').classList.add('hidden'); startGuide(calibTarget.id); showCalibBar(); } });
function showCalibBar() {
  S.calibrating = true; const el = $('#card'); el.classList.remove('hidden');
  el.innerHTML = `<div class="hd"><div><div class="nm">Calibrating on ${esc(calibTarget.name)}</div><div class="ty">Put it inside the crosshair, then tap below</div></div></div><div class="acts"><button class="btn" data-cal="ok">It’s centered</button><button class="btn ghost" data-cal="cancel">Cancel</button></div>`;
}
$('#card').addEventListener('click', e => { const a = e.target.closest('[data-cal]'); if (!a) return; S.calibrating = false; S.guide = null; updateGuideBanner();
  if (a.dataset.cal === 'ok') { calibrateOn(findObj(calibTarget.id)); calibStep = 2; $('#calib').classList.remove('hidden'); renderCalib(); } renderCard(); });

/* ---------------- share screenshot ---------------- */
async function shareShot() {
  try {
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const g = c.getContext('2d'), v = $('#cam');
    if (S.camera && v.videoWidth) { const s = Math.max(c.width / v.videoWidth, c.height / v.videoHeight), w = v.videoWidth * s, h = v.videoHeight * s; g.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h); }
    g.drawImage(cv, 0, 0);
    g.font = `600 ${14 * S.dpr}px ${FONT}`; g.fillStyle = 'rgba(220,230,255,.85)'; g.fillText(`Interstellar Lens · ${S.locName} · ${now().toLocaleString()}`, 14 * S.dpr, c.height - 16 * S.dpr);
    if (S.night) { g.globalCompositeOperation = 'multiply'; g.fillStyle = '#ff1a00'; g.fillRect(0, 0, c.width, c.height); }
    const blob = await new Promise(r => c.toBlob(r, 'image/png')), file = new File([blob], 'interstellar-sky.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'My sky — Interstellar Lens' });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'interstellar-sky.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Screenshot saved.'); }
    haptic(20);
  } catch (e) { if (!e || e.name !== 'AbortError') toast('Could not share the screenshot.'); }
}

/* ---------------- onboarding walkthrough ---------------- */
const SLIDES = [
  { ill: '<img src="icons/icon.svg" class="logo" alt="">', t: 'Interstellar Lens', p: 'Point your phone at the sky.<br>See what’s really up there — live.' },
  { ill: '🪐', t: 'Tap anything', p: 'Planets, stars, constellations, galaxies and satellites all open live details: distance, speed in mph, rise and set times.' },
  { ill: '🛰️', t: 'Never miss the ISS', p: 'Tonight’s highlights, visible satellite passes with alerts, and meteor showers live behind the moon button.' },
  { ill: '⏱', t: 'Travel in time', p: 'Scrub the sky forward or back, then tap <b>Now</b>. Red night-vision mode keeps your eyes dark-adapted.' },
  { ill: '🧭', t: 'Ready?', p: 'Tap Start and allow camera, motion and location, then hold your phone up to the sky. You can calibrate the compass any time in settings.' },
];
let slideIdx = 0, tourMode = false;
function showOnboarding(force) { tourMode = !!force || !store.get('onboarded', false); slideIdx = tourMode ? 0 : SLIDES.length - 1; $('#start').classList.remove('hidden'); renderSlide(); }
function renderSlide() {
  const s = SLIDES[slideIdx], last = slideIdx === SLIDES.length - 1;
  $('#slides').innerHTML = `<div class="slide"><div class="ill">${s.ill}</div><h1>${s.t}</h1><p class="tag">${s.p}</p></div>`;
  $('#dots').innerHTML = tourMode ? SLIDES.map((_, i) => `<i class="${i === slideIdx ? 'on' : ''}"></i>`).join('') : '';
  $('#startBtns').classList.toggle('hidden', !last); $('#btnNext').classList.toggle('hidden', last);
}
$('#btnNext').addEventListener('click', () => { slideIdx = Math.min(SLIDES.length - 1, slideIdx + 1); renderSlide(); });
async function begin(withCam) { store.set('onboarded', true); $('#start').classList.add('hidden'); if (withCam) { await startSensors(); startCamera(); } startGeo(); }
$('#btnStart').addEventListener('click', () => begin(true));
$('#btnNoCam').addEventListener('click', () => begin(false));

/* ---------------- toast ---------------- */
let toastT = 0;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3800); }
