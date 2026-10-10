/* Interstellar — shared state, catalogs, satellites & bodies.
   Classic scripts (state.js → render.js → ui-sheets.js → features.js) share the global lexical scope. */
'use strict';
const C = window.SkyCore, SD = window.SKY_DATA, F = window.SKY_FACTS || {}, D2R = C.D2R;
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const store = { get(k, d) { try { const v = localStorage.getItem('is:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('is:' + k, JSON.stringify(v)); } catch (e) { } } };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const haptic = (ms = 12) => { try { if (!DEMO && navigator.vibrate) navigator.vibrate(ms); } catch (e) { } };

const S = {
  lat: store.get('lat', 28.5383), lon: store.get('lon', -81.3792), elev: 30, locName: store.get('locName', 'Orlando, FL (default)'),
  mode: 'drag', camera: false, sensorsOk: false,
  view: { az: 150, alt: 25, roll: 0 }, fov: store.get('fov', 62),
  q: C.lookQuat(150, 25), qTarget: C.lookQuat(150, 25),
  layers: Object.assign({ constellations: true, stars: true, planets: true, dso: true, sats: true, milkyway: true }, store.get('layers', {})),
  groups: store.get('groups', ['stations', 'visual']),
  metric: store.get('metric', false), decl: store.get('decl', true), headingOffset: store.get('hdg', 0), grid: store.get('grid', false),
  night: store.get('night', false), twinkle: store.get('twinkle', true),
  selected: null, detail: null, guide: null, demoTime: null, dpr: Math.min(window.devicePixelRatio || 1, 2.5),
  tShift: 0, tRate: 1, tRateStart: 0, preview: null,
  declination: 0, iosOffset: null, lastSensor: 0, compassAcc: null,
};
if (params.get('dpr')) S.dpr = +params.get('dpr');
if (DEMO) document.documentElement.classList.add('demo');

function now() {
  if (S.demoTime != null) return new Date(S.demoTime);
  const w = Date.now(); return new Date(w + S.tShift + (S.tRate !== 1 ? (w - S.tRateStart) * (S.tRate - 1) : 0));
}
const isLive = () => S.demoTime == null ? (S.tShift === 0 && S.tRate === 1) : !S.preview;
let obs = C.observer(S.lat, S.lon, S.elev), gd = C.satGd(S.lat, S.lon, S.elev);
let locInit = false;
function setLocation(lat, lon, name) {
  if (locInit && lat === S.lat && lon === S.lon && (name || S.locName) === S.locName) return;
  locInit = true;
  S.lat = lat; S.lon = lon; S.locName = name || `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
  obs = C.observer(lat, lon, S.elev); gd = C.satGd(lat, lon, S.elev);
  try { S.declination = window.MagVar ? MagVar.magvar(lat, lon) : 0; } catch (e) { S.declination = 0; }
  store.set('lat', lat); store.set('lon', lon); store.set('locName', S.locName);
  $('#declVal').textContent = `(${S.declination >= 0 ? '+' : ''}${S.declination.toFixed(1)}° here)`;
  $('#lat').value = lat.toFixed(4); $('#lon').value = lon.toFixed(4);
  bodyCache.t = 0; skyCache.key = ''; passCache.clear(); alerts.reset();
}

/* ---------------- static catalogs ---------------- */
const CONS = F.cons || {};
const stars = SD.stars.map(s => ({ id: 'star:' + s[6], kind: 'star', ra: s[0], dec: s[1], mag: s[2], bv: s[3], name: s[4], desig: s[5], hip: s[6], ly: s[7], spect: s[8], con: s[9], lum: s[10],
  v: C.raDecToEQJ(s[0], s[1]), color: C.bvColor(s[3]), tw: Math.random() * 6.28, tf: 1.5 + Math.random() * 2.5 }));
const cons = Object.entries(SD.cons).map(([k, c]) => ({ id: 'con:' + k, kind: 'con', abbr: k, name: c.name, rank: c.rank, ra: c.ra, dec: c.dec, v: C.raDecToEQJ(c.ra, c.dec),
  lines: (SD.lines[k] || []).map(seg => seg.map(p => C.raDecToEQJ(p[0], p[1]))), segs: [] }));
const MF = F.messier || {};
const dsos = SD.messier.map(m => { const f = MF[m[0]] || {}; const alias = f.name || m[1];
  return { id: 'dso:' + m[0], kind: 'dso', short: m[0], alias, name: alias ? `${m[0]} · ${alias.split(',')[0]}` : m[0], type: f.type || C.dsoType(m[2]), t: m[2], mag: m[3], ra: m[4], dec: m[5],
    v: C.raDecToEQJ(m[4], m[5]), ngc: f.ngc || m[6], dim: f.dim || m[7], distKly: f.dist_kly || '', conName: f.con || '' }; });
const mwPts = (F.mw || []).map(p => ({ v: C.raDecToEQJ(p[0], p[1]), l: p[2] }));

/* ---------------- satellites ---------------- */
const GROUPS = [['stations', 'Stations'], ['visual', 'Bright'], ['starlink', 'Starlink'], ['gps-ops', 'GPS'], ['weather', 'Weather'], ['science', 'Science']];
const TLE_TTL = 2 * 3600e3; // CelesTrak asks clients not to re-download more often than ~2 h
const satGroups = {};
const satById = new Map();
let sats = [], satIdx = 0;
const HIGHLIGHT = { 25544: 'ISS', 48274: 'Tiangong' };
async function loadGroup(g) {
  if (satGroups[g]) return satGroups[g];
  let text = null, source = 'bundled snapshot', fetched = null;
  const cached = DEMO ? null : store.get('tle:' + g, null);
  if (cached && Date.now() - cached.t < TLE_TTL) { text = cached.text; source = 'CelesTrak (cached)'; fetched = cached.t; }
  if (!text && !DEMO && navigator.onLine !== false) {
    try { const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`, { cache: 'no-store' });
      if (r.ok) { const t = await r.text(); if (/^1 /m.test(t)) { text = t; source = 'CelesTrak (live)'; fetched = Date.now(); store.set('tle:' + g, { t: fetched, text }); } } } catch (e) { }
  }
  if (!text && cached) { text = cached.text; source = 'CelesTrak (cached, stale)'; fetched = cached.t; }
  if (!text) { try { const r = await fetch(`data/tle/${g}.tle`); text = await r.text(); } catch (e) { text = ''; } }
  satGroups[g] = { sats: C.parseTLE(text, g), source, fetched };
  return satGroups[g];
}
async function refreshSats() {
  await Promise.all(S.groups.map(loadGroup));
  const seen = new Map();
  for (const g of S.groups) for (const s of satGroups[g].sats) if (!seen.has(s.norad)) seen.set(s.norad, Object.assign(s, { id: 'sat:' + s.norad, kind: 'sat', hl: HIGHLIGHT[s.norad] || null, st: s.st || null }));
  sats = [...seen.values()]; satById.clear(); sats.forEach(s => satById.set(s.id, s));
  updateSatInfo(); buildSearchIndex(); alerts.reset();
}
function updateSatInfo() {
  $('#satInfo').textContent = `${sats.length} objects · ` + S.groups.map(g => { const G = satGroups[g]; return G ? `${GROUPS.find(x => x[0] === g)[1]}: ${G.sats.length} (${G.source})` : ''; }).join(' · ');
}
function updateSats(date, budget) {
  const n = sats.length; if (!n) return;
  const sun = C.sunEciFor(date), count = Math.min(n, budget);
  for (let k = 0; k < count; k++) { const s = sats[satIdx % n]; satIdx++; s.st = C.satState(s, date, gd, sun); }
  if (n > budget) for (const s of sats) if (s.hl || s.id === S.selected || s.id === S.detail || (S.guide && S.guide.id === s.id)) s.st = C.satState(s, date, gd, sun);
}

/* ---------------- Sun, Moon, planets ---------------- */
const bodyCache = { t: 0, list: [] };
function updateBodies(date, force) {
  if (!force && Math.abs(date - bodyCache.t) < 300) return bodyCache.list;
  bodyCache.t = +date; bodyCache.list = C.bodies(date, obs).map(b => Object.assign(b, { id: 'body:' + b.id }));
  return bodyCache.list;
}
const passCache = new Map();
