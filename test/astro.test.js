'use strict';
const fs = require('fs');
const path = require('path');
process.chdir(path.join(__dirname, '..'));
eval(fs.readFileSync('vendor/satellite.min.js', 'utf8') + ';global.satellite=satellite');
const A = require('../vendor/astronomy.browser.min.js');
const C = require('../js/core.js');

let fails = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL', msg); fails++; } else console.log('  ok', msg); }
function near(a, b, tol, msg) {
  if (a == null || b == null) { assert(false, `${msg}: got ${a} vs ${b}`); return; }
  assert(Math.abs(a - b) <= tol, `${msg}: ${(+a).toFixed(4)} ≈ ${(+b).toFixed(4)} (±${tol})`);
}

console.log('=== alt/az vs Astronomy.Horizon ===');
const obs = C.observer(28.5383, -81.3792, 30);
const date = new Date('2026-10-09T01:00:00Z');
const t = A.MakeTime(date);
for (const id of ['Sun', 'Moon', 'Jupiter', 'Saturn', 'Venus']) {
  const eq = A.Equator(id, t, obs, true, true);
  const hor = A.Horizon(t, obs, eq.ra, eq.dec, 'normal');
  const ours = C.bodyState(C.BODIES.find(b => b.id === id), date, obs);
  near(ours.alt, hor.altitude, 0.05, `${id} altitude`);
  near(ours.az, hor.azimuth, 0.05, `${id} azimuth`);
}

console.log('=== Sirius (RA/Dec → alt/az via EQJ_HOR) ===');
A.DefineStar(A.Body.Star1, 101.2872 / 15, -16.7161, 2.64);
const eqS = A.Equator(A.Body.Star1, t, obs, true, true);
const horS = A.Horizon(t, obs, eqS.ra, eqS.dec, 'normal');
const h = C.eqjToAltAz(C.raDecToEQJ(101.2872, -16.7161), C.eqjToHorMatrix(date, obs), true);
near(h.alt, horS.altitude, 0.35, 'Sirius altitude');
near(h.az, horS.azimuth, 0.35, 'Sirius azimuth');

console.log('=== projection sanity ===');
const M = C.qToMatrix(C.lookQuat(120, 35));
const P = C.projector(M, 400, 800, 60);
const ctr = P.project(C.altAzToENU(35, 120));
near(ctr.x, 200, 1, 'look-at → center x');
near(ctr.y, 400, 1, 'look-at → center y');
assert(P.project(C.altAzToENU(35, 125)).x > ctr.x, 'eastward is to the right');
assert(P.project(C.altAzToENU(40, 120)).y < ctr.y, 'higher altitude is above');
assert(P.project(C.altAzToENU(35, 300)) == null, 'behind camera → null');

console.log('=== ISS altitude / speed sanity ===');
const iss = C.parseTLE(fs.readFileSync('data/tle/stations.tle', 'utf8'), 'stations').find(s => s.norad === 25544);
assert(!!iss, 'ISS (ZARYA) in stations TLE');
const st = C.satState(iss, date, C.satGd(28.54, -81.38, 10));
assert(st && st.heightKm > 380 && st.heightKm < 450, `ISS altitude ~400 km (got ${st && st.heightKm.toFixed(1)} km)`);
assert(st && st.speedKms > 7.0 && st.speedKms < 8.0, `ISS speed ~7.66 km/s (got ${st && st.speedKms.toFixed(2)})`);
assert(C.fmtSpeed(7.66) === '17,130 mph', '7.66 km/s → 17,130 mph');
assert(C.fmtDist(420).includes('261'), '420 km → ~261 mi');
console.log('  ISS', C.fmtDist(st.heightKm), C.fmtSpeed(st.speedKms));

console.log(fails ? `\n${fails} FAILURE(S)` : '\nAll checks passed.');
process.exit(fails ? 1 : 0);
