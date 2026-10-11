// Headless UI check: loads the app with a fixed time/location, asserts no console errors, saves screenshots.
const { chromium } = require('/home/box/pwtools/node_modules/playwright');
const OUT = '/workspace/sky-viewer/screenshots/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, geolocation: { latitude: 28.5383, longitude: -81.3792 }, permissions: ['geolocation'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  // 1) normal (non-demo) load with onboarding to catch runtime errors in the live loop
  await p.goto('http://127.0.0.1:8080/index.html?fps&desktop=1', { waitUntil: 'networkidle' });
  await p.screenshot({ path: OUT + '00-onboarding.png' });
  for (let i = 0; i < 4; i++) await p.click('#btnNext');
  await p.screenshot({ path: OUT + '00b-onboarding-last.png' });
  await p.click('#btnNoCam'); await p.waitForTimeout(2500);
  const fps = await p.evaluate(() => window.__fps);
  // 2) deterministic demo scenes: tonight 9 PM ET, Orlando
  await p.goto('http://127.0.0.1:8080/index.html?demo=1&nocam=1&desktop=1', { waitUntil: 'networkidle' });
  const R = (fn, arg) => p.evaluate(fn, arg);
  await R(async () => { const I = Interstellar; await I.ready; I.setTime('2026-10-10T01:00:00Z'); I.setLocation(28.5383, -81.3792, 'Orlando, FL'); I.setView(110, 30); I.setFov(62); I.render(); I.render(); });
  await p.screenshot({ path: OUT + '01-main.png' });
  // tap Saturn on screen (real tap path through hit boxes)
  const sat = await R(() => Interstellar.project('body:Saturn'));
  await p.mouse.click(sat.x + 3, sat.y + 2); await R(() => Interstellar.render());
  const opened = await R(() => !document.querySelector('#detail').classList.contains('hidden') && document.querySelector('#detail h2').textContent);
  await p.screenshot({ path: OUT + '02-planet-detail.png' });
  await R(() => { document.querySelector('#detail').scrollTop = 520; }); await p.screenshot({ path: OUT + '02b-planet-detail-facts.png' });
  // ISS detail
  await R(() => { const I = Interstellar; I.closeSheets(); I.openDetail('sat:25544'); I.render(); });
  await p.waitForTimeout(800); await R(() => Interstellar.render());
  await p.screenshot({ path: OUT + '03-satellite-detail.png' });
  // Tonight card (wait for pass alerts)
  await R(() => { Interstellar.closeSheets(); Interstellar.openTonight(); });
  for (let i = 0; i < 40; i++) { if (await R(() => Interstellar.alerts.done)) break; await p.waitForTimeout(500); }
  await R(() => Interstellar.openTonight());
  await p.screenshot({ path: OUT + '04-tonight.png' });
  await R(() => { document.querySelector('#tonight').scrollTop = 600; }); await p.screenshot({ path: OUT + '04b-tonight-passes.png' });
  // star + constellation + DSO detail checks
  const kinds = await R(() => { const I = Interstellar, out = {}; for (const id of ['star:32349', 'con:Ori', 'dso:M31', 'body:Moon', 'body:Sun']) { I.openDetail(id); out[id] = document.querySelector('#detail').innerText.split('\n').slice(0, 2).join(' | '); } return out; });
  await R(() => { Interstellar.openDetail('dso:M31'); }); await p.screenshot({ path: OUT + '05-dso-detail.png' });
  // red night mode
  await R(() => { const I = Interstellar; I.closeSheets(); I.setNight(true); I.select(null); I.render(); });
  await p.screenshot({ path: OUT + '06-night-mode.png' });
  await R(() => { Interstellar.setNight(false); });
  // search + time slider
  await R(() => { const I = Interstellar; I.openSearch(); I.setQuery('andro'); });
  await p.screenshot({ path: OUT + '07-search.png' });
  await R(() => { const I = Interstellar; I.closeSheets(); document.querySelector('#chipTime').click(); I.render(); });
  await p.screenshot({ path: OUT + '08-time-slider.png' });
  console.log(JSON.stringify({ errors: errs, liveFps: fps, tapOpened: opened, kinds }, null, 1));
  await b.close(); process.exit(errs.length ? 1 : 0);
})();
