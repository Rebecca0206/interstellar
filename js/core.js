/* Interstellar — core math: astronomy, satellites, projection, formatting.
   Works in the browser (window.SkyCore) and in Node (module.exports) for tests. */
(function (root) {
  'use strict';
  const A = root.Astronomy || (typeof require !== 'undefined' ? require('../vendor/astronomy.browser.min.js') : null);
  const SAT = () => root.satellite;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const AU_KM = 149597870.7, KM_PER_MI = 1.609344;

  /* ---------------- formatting (imperial default) ---------------- */
  function num(x, d = 0) { return x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }); }
  function fmtDist(km, metric) {
    const v = metric ? km : km / KM_PER_MI, u = metric ? 'km' : 'mi';
    if (v >= 1e9) return num(v / 1e9, 2) + 'B ' + u;
    if (v >= 1e6) return num(v / 1e6, v >= 1e8 ? 0 : 1) + 'M ' + u;
    return num(v, 0) + ' ' + u;
  }
  function fmtSpeed(kms, metric) { // km/s in
    const v = Math.abs(kms) * 3600 / (metric ? 1 : KM_PER_MI);
    return num(v >= 1e5 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10, 0) + (metric ? ' km/h' : ' mph');
  }
  function fmtLy(ly) { return ly >= 1e6 ? num(ly / 1e6, 1) + 'M ly' : ly >= 1000 ? num(ly, 0) + ' ly' : num(ly, ly < 10 ? 1 : 0) + ' ly'; }
  function fmtAlt(alt) { return (alt >= 0 ? '' : '−') + Math.abs(alt).toFixed(alt > -10 && alt < 10 ? 1 : 0) + '°' + (alt >= 0 ? ' up' : ' below'); }
  const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function dirName(az) { return DIRS[Math.round(((az % 360) + 360) % 360 / 22.5) % 16]; }

  /* ---------------- vectors / alt-az ---------------- */
  function altAzToENU(alt, az) { const ca = Math.cos(alt * D2R); return [ca * Math.sin(az * D2R), ca * Math.cos(az * D2R), Math.sin(alt * D2R)]; }
  function enuToAltAz(v) { const n = Math.hypot(v[0], v[1], v[2]); return { alt: Math.asin(v[2] / n) * R2D, az: (Math.atan2(v[0], v[1]) * R2D + 360) % 360 }; }
  function angSep(a, b) { return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * R2D; }

  /* ---------------- observer / time ---------------- */
  function observer(lat, lon, elevM) { return new A.Observer(lat, lon, elevM || 0); }

  // Rotation from J2000 equatorial (EQJ) to horizontal (x=N, y=W, z=zenith), incl. precession+nutation.
  function eqjToHorMatrix(date, obs) { return A.Rotation_EQJ_HOR(A.MakeTime(date), obs).rot; }
  function raDecToEQJ(raDeg, decDeg) { const r = raDeg * D2R, d = decDeg * D2R, cd = Math.cos(d); return [cd * Math.cos(r), cd * Math.sin(r), Math.sin(d)]; }
  // Astronomy Engine RotateVector convention: out_i = sum_j rot[j][i] * v_j
  function eqjToAltAz(v, rot, refract = true) {
    const x = rot[0][0] * v[0] + rot[1][0] * v[1] + rot[2][0] * v[2];
    const y = rot[0][1] * v[0] + rot[1][1] * v[1] + rot[2][1] * v[2];
    const z = rot[0][2] * v[0] + rot[1][2] * v[1] + rot[2][2] * v[2];
    let alt = Math.asin(Math.max(-1, Math.min(1, z))) * R2D;
    const az = (Math.atan2(-y, x) * R2D + 360) % 360;
    if (refract && alt > -1) alt += A.Refraction('normal', alt);
    return { alt, az };
  }

  /* ---------------- Sun, Moon, planets ---------------- */
  const BODIES = [
    { id: 'Sun', name: 'Sun', type: 'Star (our Sun)', color: '#ffd23f', r: 9 },
    { id: 'Moon', name: 'Moon', type: 'Moon', color: '#e8e6df', r: 8 },
    { id: 'Mercury', name: 'Mercury', type: 'Planet', color: '#b9a99a', r: 4 },
    { id: 'Venus', name: 'Venus', type: 'Planet', color: '#fff2c4', r: 6 },
    { id: 'Mars', name: 'Mars', type: 'Planet', color: '#ff6b4a', r: 5 },
    { id: 'Jupiter', name: 'Jupiter', type: 'Planet', color: '#f4c27a', r: 7 },
    { id: 'Saturn', name: 'Saturn', type: 'Planet', color: '#e8d08a', r: 6, ring: true },
    { id: 'Uranus', name: 'Uranus', type: 'Planet', color: '#8fe3e0', r: 4 },
    { id: 'Neptune', name: 'Neptune', type: 'Planet', color: '#6f8cff', r: 4 },
  ];
  function bodyState(def, date, obs) {
    const t = A.MakeTime(date);
    const eq = A.Equator(def.id, t, obs, true, true);
    const hor = A.Horizon(t, obs, eq.ra, eq.dec, 'normal');
    // range-rate (topocentric) from +/-30 s finite difference
    const dt = 30 / 86400;
    const e1 = A.Equator(def.id, t.AddDays(-dt), obs, true, true), e2 = A.Equator(def.id, t.AddDays(dt), obs, true, true);
    const rangeRate = (e2.dist - e1.dist) * AU_KM / 60; // km/s, + = receding
    let mag = null, phase = null;
    try { const il = A.Illumination(def.id, t); mag = il.mag; phase = il.phase_fraction; } catch (e) { }
    return { id: def.id, kind: def.id === 'Sun' ? 'sun' : def.id === 'Moon' ? 'moon' : 'planet', name: def.name, type: def.type, color: def.color, r: def.r, ring: !!def.ring,
      alt: hor.altitude, az: hor.azimuth, ra: hor.ra, dec: hor.dec, distKm: eq.dist * AU_KM, rangeRate, mag, phase };
  }
  function bodies(date, obs) { return BODIES.map(b => bodyState(b, date, obs)); }
  function riseSet(id, date, obs) {
    const t = A.MakeTime(date);
    const r = A.SearchRiseSet(id, obs, +1, t, 2), s = A.SearchRiseSet(id, obs, -1, t, 2);
    return { rise: r ? r.date : null, set: s ? s.date : null };
  }
  function sunAltitude(date, obs) { const t = A.MakeTime(date); const e = A.Equator('Sun', t, obs, true, true); const h = A.Horizon(t, obs, e.ra, e.dec, null); return { alt: h.altitude, az: h.azimuth }; }

  /* ---------------- satellites (satellite.js / SGP4) ---------------- */
  function parseTLE(text, group) {
    const L = text.replace(/\r/g, '').split('\n').map(s => s.trimEnd()).filter(Boolean), out = [];
    for (let i = 0; i + 2 < L.length + 1; i++) {
      if (L[i + 1] && L[i + 1][0] === '1' && L[i + 2] && L[i + 2][0] === '2') {
        try { const rec = SAT().twoline2satrec(L[i + 1].trim(), L[i + 2].trim()); out.push({ name: L[i].trim(), norad: +L[i + 1].slice(2, 7), rec, group, line1: L[i + 1] }); } catch (e) { }
        i += 2;
      }
    }
    return out;
  }
  function satGd(lat, lon, elevM) { return { latitude: lat * D2R, longitude: lon * D2R, height: (elevM || 0) / 1000 }; }
  function satState(s, date, gd, sunEci) {
    const S = SAT(); const pv = S.propagate(s.rec, date);
    if (!pv || !pv.position || isNaN(pv.position.x)) return null;
    const gmst = S.gstime(date), ecf = S.eciToEcf(pv.position, gmst);
    const look = S.ecfToLookAngles(gd, ecf), geo = S.eciToGeodetic(pv.position, gmst);
    const v = pv.velocity, speed = Math.hypot(v.x, v.y, v.z);
    const sun = sunEci || S.sunPos(S.jday(date)).rsun;
    const shadow = S.shadowFraction(sun, pv.position);
    return { alt: look.elevation * R2D, az: (look.azimuth * R2D + 360) % 360, rangeKm: look.rangeSat, heightKm: geo.height,
      speedKms: speed, sunlit: shadow < 0.5, lat: geo.latitude * R2D, lon: geo.longitude * R2D, eci: pv.position };
  }
  function sunEciFor(date) { const S = SAT(); return S.sunPos(S.jday(date)).rsun; }
  // Pass prediction: returns passes with rise/max/set and visibility.
  function findPasses(s, obsLat, obsLon, elevM, start, hours = 96, minEl = 10, obs) {
    const gd = satGd(obsLat, obsLon, elevM), out = []; let cur = null;
    const step = 20e3, t0 = start.getTime(), end = t0 + hours * 3600e3;
    for (let t = t0; t < end; t += step) {
      const d = new Date(t), st = satState(s, d, gd); if (!st) continue;
      if (st.alt > 0) {
        if (!cur) cur = { rise: d, max: d, maxEl: st.alt, maxAz: st.az, riseAz: st.az, visible: false, pts: [] };
        if (st.alt > cur.maxEl) { cur.maxEl = st.alt; cur.max = d; cur.maxAz = st.az; }
        cur.setAz = st.az; cur.set = d;
        if (st.sunlit && obs && sunAltitude(d, obs).alt < -6 && st.alt > 10) cur.visible = true;
      } else if (cur) { if (cur.maxEl >= minEl) out.push(cur); cur = null; if (out.length >= 12) break; }
    }
    return out;
  }

  /* ---------------- orientation & projection ---------------- */
  // Quaternion [w,x,y,z] for W3C device orientation (Z-X'-Y'' intrinsic: alpha, beta, gamma in degrees).
  function eulerToQuat(alpha, beta, gamma) {
    const x = beta * D2R / 2, y = gamma * D2R / 2, z = alpha * D2R / 2;
    const cX = Math.cos(x), cY = Math.cos(y), cZ = Math.cos(z), sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
    return [cX * cY * cZ - sX * sY * sZ, sX * cY * cZ - cX * sY * sZ, cX * sY * cZ + sX * cY * sZ, cX * cY * sZ + sX * sY * cZ];
  }
  function qMul(a, b) {
    return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
  }
  function qAxis(ax, deg) { const h = deg * D2R / 2, s = Math.sin(h); return [Math.cos(h), ax[0] * s, ax[1] * s, ax[2] * s]; }
  function qNorm(q) { const n = Math.hypot(q[0], q[1], q[2], q[3]); return q.map(c => c / n); }
  function qSlerp(a, b, t) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = b.map(c => -c); d = -d; }
    if (d > 0.9995) return qNorm(a.map((c, i) => c + (b[i] - c) * t));
    const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((c, i) => c * wa + b[i] * wb);
  }
  // Rotation matrix (device -> world ENU), columns are device axes in world coords.
  function qToMatrix(q) {
    const [w, x, y, z] = q;
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
      [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
      [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
  }
  // Device orientation for "looking at" az/alt with no roll (used for drag mode & demo).
  function lookQuat(az, alt, roll = 0) { return qMul(eulerToQuat(-az, 90 + alt, 0), qAxis([0, 0, 1], -roll)); }
  // Account for screen orientation (portrait=0, landscape=90/-90/270).
  function screenAdjust(q, screenAngle) { return screenAngle ? qMul(q, qAxis([0, 0, 1], -screenAngle)) : q; }
  // Make a projector for a canvas w x h with vertical FOV (deg).
  function projector(M, w, h, fovV) {
    const f = (h / 2) / Math.tan(fovV * D2R / 2), cx = w / 2, cy = h / 2;
    return {
      f, w, h,
      // world ENU -> device coords (M^T v)
      dev(v) { return [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]]; },
      project(v) { const d = this.dev(v); const z = -d[2]; if (z <= 1e-3) return null; return { x: cx + f * d[0] / z, y: cy - f * d[1] / z, z }; },
      unproject(x, y) { const dx = (x - cx) / f, dy = -(y - cy) / f, dz = -1; const n = Math.hypot(dx, dy, dz);
        const d = [dx / n, dy / n, dz / n]; return [M[0][0] * d[0] + M[0][1] * d[1] + M[0][2] * d[2], M[1][0] * d[0] + M[1][1] * d[1] + M[1][2] * d[2], M[2][0] * d[0] + M[2][1] * d[1] + M[2][2] * d[2]]; },
      forward() { return [-M[0][2], -M[1][2], -M[2][2]]; },
      // screen-space direction (unit) towards a world vector, for off-screen arrows
      dirTo(v) { const d = this.dev(v); let x = d[0], y = -d[1]; const n = Math.hypot(x, y) || 1; return { x: x / n, y: y / n, behind: d[2] > 0 }; }
    };
  }

  /* ---------------- star colour ---------------- */
  function bvColor(bv) {
    const s = [[-0.4, [155, 176, 255]], [0, [202, 215, 255]], [0.4, [248, 247, 255]], [0.6, [255, 244, 234]], [1.0, [255, 210, 161]], [1.5, [255, 180, 120]], [2.0, [255, 150, 90]]];
    bv = Math.max(-0.4, Math.min(2, bv || 0.6));
    for (let i = 1; i < s.length; i++) if (bv <= s[i][0]) { const t = (bv - s[i - 1][0]) / (s[i][0] - s[i - 1][0]); const a = s[i - 1][1], b = s[i][1]; return `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * t)).join(',')})`; }
    return 'rgb(255,150,90)';
  }
  const DSO_TYPES = { gc: 'Globular cluster', oc: 'Open cluster', pn: 'Planetary nebula', bn: 'Bright nebula', en: 'Emission nebula', rn: 'Reflection nebula', snr: 'Supernova remnant',
    s: 'Spiral galaxy', e: 'Elliptical galaxy', i: 'Irregular galaxy', s0: 'Lenticular galaxy', sd: 'Dwarf spheroidal galaxy', '**': 'Double star', '*': 'Star', ast: 'Asterism', 'sc': 'Star cloud', oc_en: 'Cluster with nebula' };
  function dsoType(t) { return DSO_TYPES[t] || (t && t[0] === 's' ? 'Galaxy' : t && t[0] === 'e' ? 'Galaxy' : 'Deep-sky object'); }


  /* ---------------- events & extra info ---------------- */
  function startOfLocalDay(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
  // body: astronomy-engine body name, or {ra (deg J2000), dec} for a fixed object
  function bodyArg(b) {
    if (typeof b === 'string') return b;
    A.DefineStar(A.Body.Star1, b.ra / 15, b.dec, b.ly || 1000);
    return A.Body.Star1;
  }
  function riseTransitSet(b, date, obs) {
    const t0 = A.MakeTime(startOfLocalDay(date)), body = bodyArg(b);
    const out = { rise: null, transit: null, set: null, transitAlt: null, always: false, never: false };
    try { const r = A.SearchRiseSet(body, obs, +1, t0, 1); if (r) out.rise = r.date; } catch (e) { }
    try { const r = A.SearchRiseSet(body, obs, -1, t0, 1); if (r) out.set = r.date; } catch (e) { }
    try { const h = A.SearchHourAngle(body, obs, 0, t0, +1); if (h && h.time.date - t0.date < 86400e3 * 1.01) { out.transit = h.time.date; out.transitAlt = h.hor.altitude; } } catch (e) { }
    if (!out.rise && !out.set) { const alt = out.transitAlt; if (alt != null) { if (alt > 0) out.always = true; else out.never = true; } }
    return out;
  }
  function sunEvents(date, obs) {
    const t0 = A.MakeTime(startOfLocalDay(date)), f = (dir, alt) => { try { const r = A.SearchAltitude('Sun', obs, dir, t0, 1, alt); return r ? r.date : null; } catch (e) { return null; } };
    return { sunrise: (A.SearchRiseSet('Sun', obs, +1, t0, 1) || {}).date || null, sunset: (A.SearchRiseSet('Sun', obs, -1, t0, 1) || {}).date || null,
      civilDawn: f(+1, -6), civilDusk: f(-1, -6), nauticalDawn: f(+1, -12), nauticalDusk: f(-1, -12), astroDawn: f(+1, -18), astroDusk: f(-1, -18) };
  }
  function moonPhaseName(date) {
    const a = A.MoonPhase(A.MakeTime(date));
    const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
    return { angle: a, name: names[Math.round(a / 45) % 8] };
  }
  function nextMoonQuarters(date, n = 4) {
    const out = []; let mq = A.SearchMoonQuarter(A.MakeTime(date));
    const nm = ['New Moon', 'First quarter', 'Full Moon', 'Last quarter'];
    for (let i = 0; i < n; i++) { out.push({ name: nm[mq.quarter], date: mq.time.date }); mq = A.NextMoonQuarter(mq); }
    return out;
  }
  function constellationAt(raDeg, decDeg) { try { return A.Constellation(raDeg / 15, decDeg); } catch (e) { return null; } }
  // Ballesteros (2012) blackbody approximation of effective temperature from B–V colour index
  function bvToTemp(bv) { return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)); }
  function colorName(bv) { return bv < -0.1 ? 'Blue' : bv < 0.15 ? 'Blue-white' : bv < 0.45 ? 'White' : bv < 0.7 ? 'Yellow-white' : bv < 1.1 ? 'Yellow-orange' : bv < 1.5 ? 'Orange' : 'Red-orange'; }
  // Orbital elements straight from the TLE (via satrec)
  function tleInfo(s) {
    const r = s.rec, ER = 6378.135;
    return { periodMin: 2 * Math.PI / r.no, incDeg: r.inclo * R2D, ecc: r.ecco, apogeeKm: r.alta * ER, perigeeKm: r.altp * ER,
      epoch: new Date(Date.UTC(2000 + (r.epochyr < 57 ? r.epochyr : r.epochyr - 100), 0, 1) + (r.epochdays - 1) * 86400e3) };
  }
  function intlDesignator(line1) { const y = +line1.slice(9, 11), id = line1.slice(9, 17).trim(); return { year: y < 57 ? 2000 + y : 1900 + y, id }; }

  const api = { startOfLocalDay, riseTransitSet, sunEvents, moonPhaseName, nextMoonQuarters, constellationAt, bvToTemp, colorName, tleInfo, intlDesignator, A, D2R, R2D, AU_KM, KM_PER_MI, num, fmtDist, fmtSpeed, fmtLy, fmtAlt, dirName, altAzToENU, enuToAltAz, angSep, observer, eqjToHorMatrix, raDecToEQJ, eqjToAltAz,
    BODIES, bodyState, bodies, riseSet, sunAltitude, parseTLE, satGd, satState, sunEciFor, findPasses,
    eulerToQuat, qMul, qAxis, qNorm, qSlerp, qToMatrix, lookQuat, screenAdjust, projector, bvColor, dsoType };
  root.SkyCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
