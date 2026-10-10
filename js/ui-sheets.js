/* Interstellar — taps, aim card, rich detail sheets, search, settings, time travel. */
'use strict';
const fmtTime = d => d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
const fmtDT = d => d ? d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const nf = (x, d = 0) => C.num(x, d);
function row(k, v) { return `<div><div class="k">${k}</div><div class="v">${v}</div></div>`; }
function kv(items, cls = '') { return `<div class="kv ${cls}">${items.filter(Boolean).map(([k, v]) => row(k, v)).join('')}</div>`; }
const colorOf = o => o.kind === 'sat' ? (o.hl ? '#62e8ff' : '#e9f1ff') : o.kind === 'dso' ? '#c7a6ff' : o.kind === 'con' ? '#8fa8ff' : (o.color || '#fff');

/* ---------------- tap & aim ---------------- */
function nearestTo(x, y, maxPx) {
  let best = null, bd = maxPx;
  for (const o of frame.objs) { if (!o.p || o.kind === 'con') continue; if (o.kind === 'star' && (!S.layers.stars || (o.mag > 3.8 && S.fov > 40))) continue;
    const d = Math.hypot(o.p.x - x, o.p.y - y) - (o.kind === 'planet' || o.kind === 'moon' || o.kind === 'sun' || o.hl ? 10 : 0); if (d < bd) { bd = d; best = o; } }
  return best;
}
function tapAt(x, y) {
  // 1) label/object boxes, 2) nearest object within 44 px, 3) weak boxes (constellation names, faint objects)
  const inBox = h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
  let id = (hits.find(h => !h.weak && inBox(h)) || {}).id;
  if (!id) { const o = nearestTo(x, y, 44); if (o) id = o.id; }
  if (!id) id = (hits.find(h => h.weak && inBox(h)) || {}).id;
  if (id) { haptic(); openDetail(id); } else { select(null); closeDetail(); }
}
function select(id) { S.selected = id; trail = { id: null, t: 0, pts: [] }; renderCard(); }
const anySheetOpen = () => ['#detail', '#tonight', '#sheet', '#search'].some(s => !$(s).classList.contains('hidden'));
function renderCard() {
  const el = $('#card');
  if (S.calibrating) return;
  if (anySheetOpen()) { el.classList.add('hidden'); return; }
  const o = nearestTo(W / 2, H / 2, 30);
  $('#crosshair').classList.toggle('lock', !!o);
  if (!o) { el.classList.add('hidden'); return; }
  const m = S.metric, color = colorOf(o), dirTxt = `${o.alt.toFixed(1)}° · ${Math.round(o.az)}° ${C.dirName(o.az)}`;
  let type = '', rows = [];
  if (o.kind === 'star') { type = 'Star' + (o.desig ? ' · ' + o.desig : ''); rows = [row('Altitude / azimuth', dirTxt), row('Distance', o.ly ? C.fmtLy(o.ly) : '—')]; }
  else if (o.kind === 'dso') { type = o.type; rows = [row('Altitude / azimuth', dirTxt), row('Magnitude', o.mag)]; }
  else if (o.kind === 'sat') { type = 'Satellite · NORAD ' + o.norad; rows = [row('Altitude', C.fmtDist(o.st.heightKm, m)), row('Speed', C.fmtSpeed(o.st.speedKms, m))]; }
  else { type = o.type; rows = [row('Altitude / azimuth', dirTxt), row('Distance', C.fmtDist(o.distKm, m))]; }
  el.innerHTML = `<div class="hd"><span class="sw" style="color:${color};background:${color}"></span><div><div class="nm">${esc(o.hl || o.name)}</div><div class="ty">◎ In crosshair · ${esc(type)}</div></div><button class="btn small ghost" data-open="${o.id}" style="margin-left:auto">Details</button></div><div class="grid">${rows.join('')}</div>`;
  el.classList.remove('hidden');
}
$('#card').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openDetail(b.dataset.open); });

/* ---------------- detail sheet content ---------------- */
const NASA_KEY = { Mercury: 'Mercury', Venus: 'Venus', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturn', Uranus: 'Uranus', Neptune: 'Neptune', Moon: 'Moon' };
const ABOUT = {
  Sun: 'Our star: a G-type main-sequence star whose light and gravity power the solar system. Never look at it directly or through optics without a proper solar filter.',
  Moon: "Earth's only natural satellite, tidally locked so the same face always points at us. Its phases come from the changing angle between the Sun, Earth and Moon.",
  Mercury: 'The smallest planet and the closest to the Sun. It never strays far from the Sun in our sky, so look low in twilight just after sunset or before sunrise.',
  Venus: 'Wrapped in thick clouds of sulfuric acid, Venus reflects so much sunlight that it is the brightest planet in our sky — the "evening" or "morning star".',
  Mars: 'The red planet. Iron-oxide dust gives it its color; it has polar ice caps, giant volcanoes and two small moons, Phobos and Deimos.',
  Jupiter: 'The largest planet, a gas giant with colorful cloud belts and the Great Red Spot. Binoculars show its four biggest moons as tiny points of light.',
  Saturn: 'The ringed gas giant. Even a small telescope shows its spectacular ring system, made mostly of water ice.',
  Uranus: 'An ice giant tipped on its side. It is at the limit of naked-eye visibility under very dark skies; binoculars show a small blue-green dot.',
  Neptune: 'The most distant planet, a deep-blue ice giant with the fastest winds in the solar system. You need binoculars or a telescope to see it.',
};
function dsoAbout(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('galaxy')) return 'A galaxy: a vast system of stars, gas and dust far beyond our Milky Way. The light you see left it long before humans existed.';
  if (t.includes('globular')) return 'A globular cluster: a dense, ancient ball of stars bound by gravity, orbiting in the halo of its galaxy.';
  if (t.includes('planetary')) return 'A planetary nebula: the glowing shell of gas thrown off by a dying Sun-like star.';
  if (t.includes('supernova')) return 'A supernova remnant: the expanding debris of a star that exploded.';
  if (t.includes('nebula') || t.includes('h ii')) return 'A nebula: a glowing or reflecting cloud of gas and dust, often a region where new stars are being born.';
  if (t.includes('cluster')) return 'An open cluster: a loose group of young stars born together from the same cloud; they will slowly drift apart.';
  return 'A deep-sky object from Charles Messier’s 18th-century catalogue of fuzzy objects that are not comets.';
}
function klyToText(s) {
  if (!s) return null;
  const parts = s.replace(/~/g, '').split(/[–-]/).map(x => parseFloat(x.trim().replace(/,/g, '')) * 1000).filter(v => !isNaN(v));
  if (!parts.length) return esc(s);
  const big = Math.max(...parts) >= 1e6, f = v => big ? nf(v / 1e6, v / 1e6 < 10 ? 2 : 1) : nf(v, 0);
  return (s.includes('~') ? '~' : '') + parts.map(f).join('–') + (big ? ' million ly' : ' ly');
}
const OWNERS = { US: 'United States', PRC: 'China', CIS: 'Russia / former USSR (CIS)', ISS: 'ISS partnership (NASA, Roscosmos, ESA, JAXA, CSA)', ESA: 'European Space Agency', JPN: 'Japan', IND: 'India', FR: 'France',
  UK: 'United Kingdom', GER: 'Germany', CA: 'Canada', IT: 'Italy', EUME: 'EUMETSAT', SKOR: 'South Korea', ARGN: 'Argentina', THAI: 'Thailand', MEX: 'Mexico', MALA: 'Malaysia', SING: 'Singapore', ASRA: 'Austria', POL: 'Poland' };
const OBJTYPE = { PAY: 'Payload', 'R/B': 'Rocket body', DEB: 'Debris', UNK: 'Unknown' };

function detailLive(o) {
  const m = S.metric, dirTxt = `${o.alt.toFixed(1)}° · ${Math.round(o.az)}° ${C.dirName(o.az)}`;
  if (o.kind === 'sat') { const st = o.st; if (!st) return kv([['Status', 'No position (enable Satellites layer)']]);
    return kv([['Altitude above Earth', C.fmtDist(st.heightKm, m)], ['Speed', C.fmtSpeed(st.speedKms, m)], ['In your sky', dirTxt + (st.alt < 0 ? ' (below horizon)' : '')],
      ['Lighting', st.sunlit ? '☀ Sunlit' : '● In Earth’s shadow'], ['Distance from you', C.fmtDist(st.rangeKm, m)], ['Over', `${st.lat.toFixed(1)}°, ${st.lon.toFixed(1)}°`]]); }
  if (o.kind === 'con') return kv([['Center altitude', o.alt.toFixed(1) + '°'], ['Direction', `${Math.round(o.az)}° ${C.dirName(o.az)}`]]);
  if (o.kind === 'star' || o.kind === 'dso') return kv([['Altitude / azimuth', dirTxt], ['Status', o.alt > 0 ? 'Above horizon' : 'Below horizon']]);
  const n = F.planets && F.planets[NASA_KEY[o.id.slice(5)]], orbV = n ? parseFloat(n['Orbital Velocity (km/s)']) : null;
  return kv([['Altitude / azimuth', dirTxt], ['Distance from Earth', C.fmtDist(o.distKm, m)], [o.rangeRate >= 0 ? 'Moving away at' : 'Approaching at', C.fmtSpeed(o.rangeRate, m)],
    orbV ? [o.kind === 'moon' ? 'Mean orbital speed (Earth)' : 'Mean orbital speed (Sun)', C.fmtSpeed(orbV, m)] : null,
    ['Magnitude', o.mag != null ? o.mag.toFixed(1) : '—'], o.kind !== 'sun' && o.phase != null ? ['Illuminated', Math.round(o.phase * 100) + '%'] : null,
    o.kind === 'moon' ? ['Phase', C.moonPhaseName(frame.date).name] : null, ['In constellation', (C.constellationAt(o.ra * 15, o.dec) || {}).name || '—']]);
}
function rtsBlock(r) {
  if (r.always) return kv([['Rise / set', 'Up all day (circumpolar)'], ['Highest', fmtTime(r.transit) + (r.transitAlt != null ? ` · ${Math.round(r.transitAlt)}°` : '')]]);
  if (r.never) return kv([['Rise / set', 'Does not rise today']]);
  return kv([['Rises', fmtTime(r.rise)], ['Highest', fmtTime(r.transit) + (r.transitAlt != null ? ` · ${Math.round(r.transitAlt)}°` : '')], ['Sets', fmtTime(r.set)]], 'three');
}
function detailStatic(o) {
  const m = S.metric, date = frame.date, sec = (t, inner) => `<h3>${t}</h3>${inner}`; let html = '', src = '';
  if (o.kind === 'planet' || o.kind === 'moon') {
    const name = o.id.slice(5), n = F.planets && F.planets[NASA_KEY[name]];
    html += sec('Today (local time)', rtsBlock(C.riseTransitSet(name, date, obs)));
    if (n) { const num = v => parseFloat(String(v).replace(/[,*]/g, '')), mi = km => C.fmtDist(num(km), m);
      const tC = num(n['Mean Temperature (C)']), dayH = num(n['Length of Day (hours)']), per = num(n['Orbital Period (days)']);
      const type = o.kind === 'moon' ? 'Natural satellite' : ['Jupiter', 'Saturn'].includes(name) ? 'Gas giant planet' : ['Uranus', 'Neptune'].includes(name) ? 'Ice giant planet' : 'Rocky (terrestrial) planet';
      html += sec('Facts', kv([['Type', type], ['Diameter', mi(n['Diameter (km)'])], ['Mass', `${n['Mass (10^24kg)']} × 10²⁴ kg`], ['Moons', n['Number of Moons']],
        ['Length of day', `${nf(dayH, dayH < 100 ? 1 : 0)} hours`],
        o.kind === 'moon' ? ['Orbit around Earth', `${per} days`] : ['Year length', per > 700 ? `${nf(per / 365.25, 1)} Earth years` : `${nf(per, 1)} days`],
        ['Mean temperature', `${Math.round(tC * 9 / 5 + 32)}°F (${tC}°C)`], ['Surface gravity', `${n['Gravity (m/s2)']} m/s²`],
        o.kind === 'moon' ? ['Mean distance from Earth', mi(num(n['Distance from Sun (10^6 km)']) * 1e6)] : ['Mean distance from Sun', mi(num(n['Distance from Sun (10^6 km)']) * 1e6)],
        ['Ring system', n['Ring System?']]]));
      src = F.sources.planets; }
    html += sec('About', `<p class="about">${ABOUT[name] || ''}</p>`);
  } else if (o.kind === 'sun') {
    const ev = C.sunEvents(date, obs), s = F.sun || {};
    html += sec('Today (local time)', kv([['Sunrise', fmtTime(ev.sunrise)], ['Sunset', fmtTime(ev.sunset)], ['Civil dawn', fmtTime(ev.civilDawn)], ['Civil dusk', fmtTime(ev.civilDusk)], ['Astronomical dawn', fmtTime(ev.astroDawn)], ['Astronomical dusk', fmtTime(ev.astroDusk)]]));
    if (s['Volumetric mean radius (km)']) html += sec('Facts', kv([['Type', `Star · ${s['Spectral type']}`], ['Diameter', C.fmtDist(2 * parseFloat(s['Volumetric mean radius (km)'].replace(/,/g, '')), m)],
      ['Mass', `${s['Mass (10^24 kg)']} × 10²⁴ kg`], ['Surface temperature', `${nf(parseFloat(s['Effective temperature (K)']))} K`], ['Rotation (16° latitude)', `${s['Sidereal rotation period (hrs)']} hours`],
      ['Sunspot cycle', `${s['Sun spot cycle (yr)']} years`]]));
    html += sec('About', `<p class="about">${ABOUT.Sun}</p>`); src = F.sources.sun;
  } else if (o.kind === 'star') {
    const conN = (CONS[o.con] || {}).name || o.con, T = o.bv != null ? C.bvToTemp(o.bv) : null, rad = T && o.lum ? Math.sqrt(o.lum) * Math.pow(5772 / T, 2) : null;
    html += sec('Today (local time)', rtsBlock(C.riseTransitSet({ ra: o.ra, dec: o.dec, ly: o.ly }, date, obs)));
    html += sec('Facts', kv([['Constellation', esc(conN)], ['Designation', esc(o.desig || '—')], ['Distance', o.ly ? C.fmtLy(o.ly) : '—'], ['Apparent magnitude', o.mag.toFixed(2)],
      ['Spectral type', esc(o.spect || '—')], ['Color (B–V)', `${C.colorName(o.bv)} · ${o.bv.toFixed(2)}`], T ? ['Temperature ≈', `${nf(Math.round(T / 100) * 100)} K`] : null,
      o.lum ? ['Luminosity', `${nf(o.lum, o.lum < 10 ? 2 : 0)} × Sun`] : null, rad ? ['Radius ≈', `${nf(rad, rad < 10 ? 1 : 0)} × Sun`] : null, ['Catalog', `HIP ${o.hip}`]]));
    html += `<p class="src">≈ Temperature estimated from B–V color (Ballesteros 2012); radius from HYG luminosity and that temperature.</p>`;
    html += sec('About', `<p class="about">${esc(o.name || o.desig)} is a ${C.colorName(o.bv).toLowerCase()} star in ${esc(conN)}.${o.ly ? ` The light you see left it about ${C.fmtLy(o.ly).replace(' ly', '')} years ago.` : ''}</p>`);
    src = F.sources.stars;
  } else if (o.kind === 'dso') {
    html += sec('Today (local time)', rtsBlock(C.riseTransitSet({ ra: o.ra, dec: o.dec }, date, obs)));
    html += sec('Facts', kv([['Type', esc(o.type)], ['Catalog', `${o.short}${o.ngc ? ' · ' + esc(o.ngc) : ''}`], o.distKly ? ['Distance', klyToText(o.distKly)] : null,
      ['Apparent size', esc(o.dim || '—')], ['Magnitude', esc(o.mag)], o.conName ? ['Constellation', esc(o.conName)] : null]));
    html += sec('About', `<p class="about">${dsoAbout(o.type)}</p>`); src = F.sources.messier;
  } else if (o.kind === 'con') {
    const members = stars.filter(s => s.con === o.abbr).sort((a, b) => a.mag - b.mag), named = members.filter(s => s.name).slice(0, 6);
    const ms = dsos.filter(d => d.conName && d.conName.toLowerCase() === o.name.toLowerCase());
    html += sec('Facts', kv([['Abbreviation', o.abbr], ['Genitive', esc((CONS[o.abbr] || {}).gen || '—')],
      ['Brightest star', members[0] ? `${esc(members[0].name || members[0].desig)} (mag ${members[0].mag.toFixed(2)})` : '—'], ['Messier objects', ms.length ? ms.map(d => d.short).join(', ') : 'None']]));
    html += sec('Today (local time)', rtsBlock(C.riseTransitSet({ ra: o.ra, dec: o.dec }, date, obs)));
    if (named.length) html += sec('Named stars', `<ul class="list">${named.map(s => `<li class="tap" data-open="${s.id}"><i class="sw" style="background:${s.color}"></i>${esc(s.name)}<span class="r">mag ${s.mag.toFixed(1)}${s.ly ? ' · ' + C.fmtLy(s.ly) : ''}</span></li>`).join('')}</ul>`);
    html += sec('About', `<p class="about">${esc(o.name)} is one of the 88 constellations recognized by the International Astronomical Union. The lines are a traditional stick figure joining its brighter stars.</p>`);
  } else if (o.kind === 'sat') {
    const ti = C.tleInfo(o), sc = (F.satcat || {})[o.norad], intl = C.intlDesignator(o.line1 || '');
    html += sec('Passes over you', `<div id="dPass" class="hint">Calculating next passes…</div>`);
    html += sec('Orbit', kv([['Period', `${nf(ti.periodMin, 1)} min`], ['Inclination', `${ti.incDeg.toFixed(1)}°`], ['Apogee', C.fmtDist(ti.apogeeKm, m)], ['Perigee', C.fmtDist(ti.perigeeKm, m)],
      ['Orbits per day', nf(1440 / ti.periodMin, 2)], ['TLE epoch', fmtDT(ti.epoch)]]));
    html += sec('Identity', kv([['NORAD ID', o.norad], ['Int’l designator', esc(sc ? sc[3] : intl.id)], sc ? ['Owner / country', esc(OWNERS[sc[0]] || sc[0])] : null,
      ['Launched', sc && sc[1] ? esc(sc[1]) : String(intl.year)], sc ? ['Object type', OBJTYPE[sc[2]] || esc(sc[2])] : null, ['Catalog name', esc(o.name)]]));
    src = 'CelesTrak TLE via SGP4 (satellite.js)' + (sc ? ' · CelesTrak SATCAT' : ' · launch year from international designator');
    setTimeout(() => fillPasses(o), 30);
  }
  return html + (src ? `<p class="src">Source: ${esc(src)}</p>` : '');
}
function satPasses(o) {
  const c = passCache.get(o.id), t = now();
  if (c && Math.abs(t - c.t) < 600e3) return c.list;
  const list = C.findPasses(o, S.lat, S.lon, S.elev, new Date(+t - 5 * 60e3), 72, 10, obs).filter(p => p.set > t);
  passCache.set(o.id, { t: +t, list }); return list;
}
function fillPasses(o) {
  const el = $('#dPass'); if (!el || S.detail !== o.id) return;
  const list = satPasses(o), vis = list.find(p => p.visible), next = list[0];
  const li = (p, tag) => `<li><span class="badge ${p.visible ? 'vis' : ''}">${p.visible ? 'VISIBLE' : 'NOT VISIBLE'}</span>&nbsp;${fmtDT(p.rise)}<span class="r">max ${Math.round(p.maxEl)}° ${C.dirName(p.maxAz)} · ${C.dirName(p.riseAz)}→${C.dirName(p.setAz)}${tag ? '<br>' + tag : ''}</span></li>`;
  el.outerHTML = list.length ? `<ul class="list">${vis ? li(vis, 'next visible pass') : '<li>No visible pass (sunlit satellite + dark sky) in the next 3 days</li>'}${next && next !== vis ? li(next, 'next pass') : ''}</ul>
    ${vis ? `<div class="acts"><button class="btn ghost" data-preview="${o.id}" data-t="${+vis.rise - 60e3}">▶ Preview visible pass (10×)</button></div>` : ''}` : '<div class="hint">No passes above 10° in the next 3 days.</div>';
}
function openDetail(id) {
  const o = findObj(id); if (!o) return;
  closeSheets(); S.detail = id; select(id);
  const type = o.kind === 'sat' ? `Satellite · NORAD ${o.norad}` : o.kind === 'star' ? `Star · ${o.desig || 'HIP ' + o.hip}` : o.kind === 'dso' ? `${o.type} · ${o.short}` : o.kind === 'con' ? 'Constellation' : o.type;
  const el = $('#detail'), color = colorOf(o);
  el.innerHTML = `<div class="grab"></div><div class="dhd"><span class="sw" style="color:${color};background:${color}"></span><div><h2>${esc(o.hl ? `${o.hl} · ${o.name}` : o.name)}</h2><div class="dsub">${esc(type)}</div></div><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <div class="acts"><button class="btn" data-act="find">◎ Find</button>${o.kind !== 'con' ? '<button class="btn ghost" data-act="calib">Calibrate on this</button>' : ''}<button class="btn ghost" data-act="share">Share</button></div>
    <h3>${isLive() ? 'Live now' : 'At ' + fmtDT(now())}</h3><div id="dLive">${detailLive(o)}</div>${detailStatic(o)}`;
  el.classList.remove('hidden'); el.scrollTop = 0; renderCard();
}
function closeDetail() { $('#detail').classList.add('hidden'); S.detail = null; }
$('#detail').addEventListener('click', e => {
  const a = e.target.closest('[data-act],[data-open],[data-preview]'); if (!a) return;
  if (a.dataset.open) return openDetail(a.dataset.open);
  if (a.dataset.preview) { startTimeTravel(+a.dataset.t, 10); startGuide(a.dataset.preview); return; }
  const act = a.dataset.act;
  if (act === 'close') { closeDetail(); select(null); }
  if (act === 'find') { const id = S.detail; closeDetail(); startGuide(id); }
  if (act === 'calib') calibrateOn(findObj(S.detail));
  if (act === 'share') shareShot();
});
function calibrateOn(o) {
  if (!o || !frame.proj) return false;
  if (S.mode !== 'sensor') { toast('Calibration works in compass mode on a phone.'); return false; }
  const f = C.enuToAltAz(frame.proj.forward()), d = ((o.az - f.az + 540) % 360) - 180;
  S.headingOffset = Math.max(-30, Math.min(30, S.headingOffset - d)); store.set('hdg', S.headingOffset); $('#hdg').value = S.headingOffset; $('#hdgVal').textContent = S.headingOffset.toFixed(1) + '°';
  toast(`Heading corrected by ${(-d).toFixed(1)}° using ${o.hl || o.name}.`); haptic(25); return true;
}

/* ---------------- search (everything) ---------------- */
let searchIndex = [];
function buildSearchIndex() {
  searchIndex = [].concat(C.BODIES.map(b => ({ id: 'body:' + b.id, name: b.name, type: b.type, color: b.color, rank: -2 })),
    stars.map(s => ({ id: s.id, name: s.name || s.desig || 'HIP ' + s.hip, type: `Star${s.desig ? ' · ' + s.desig : ''} · mag ${s.mag.toFixed(1)}`, color: s.color, alt: `${s.desig} hip ${s.hip} ${(CONS[s.con] || {}).name || ''}`, rank: s.name ? 0 : 2 })),
    dsos.map(d => ({ id: d.id, name: d.name, type: d.type, color: '#c7a6ff', alt: `${d.alias || ''} ${d.ngc || ''} messier ${d.short.slice(1)}` })),
    cons.map(c => ({ id: c.id, name: c.name, type: 'Constellation', color: '#8fa8ff', alt: c.abbr })),
    sats.map(s => ({ id: s.id, name: s.hl ? `${s.hl} (${s.name})` : s.name, type: 'Satellite · NORAD ' + s.norad, color: s.hl ? '#62e8ff' : '#e9f1ff', alt: String(s.norad), rank: s.hl ? -1 : 1 })));
}
function searchResults(q) {
  q = q.trim().toLowerCase();
  if (!q) return searchIndex.filter(i => i.id.startsWith('body:') || HIGHLIGHT[+i.id.slice(4)] || ['dso:M31', 'dso:M42', 'dso:M45'].includes(i.id));
  return searchIndex.map(i => { const n = i.name.toLowerCase(), pos = n.indexOf(q), ap = (i.alt || '').toLowerCase().indexOf(q); return { i, sc: pos === 0 ? 0 : pos > 0 ? 1 : ap >= 0 ? 2 : 9 }; })
    .filter(x => x.sc < 9).sort((a, b) => a.sc - b.sc || (a.i.rank || 0) - (b.i.rank || 0) || a.i.name.length - b.i.name.length).slice(0, 50).map(x => x.i);
}
function whereTxt(id) {
  const o = findObj(id); if (!o || o.alt == null) return '';
  if (o.alt > 0) return `${Math.round(o.alt)}° up · ${C.dirName(o.az)}`;
  if (id.startsWith('body:')) { try { const n = now(); let r = C.riseTransitSet(id.slice(5), n, obs).rise; if (!r || r < n) r = C.riseTransitSet(id.slice(5), new Date(+n + 86400e3), obs).rise; if (r) return `Below horizon · rises ${fmtTime(r)}`; } catch (e) { } }
  return 'Below horizon';
}
function renderResults(hl) {
  $('#results').innerHTML = searchResults($('#q').value).map(i => `<li data-id="${i.id}" class="${i.id === hl ? 'sel' : ''}"><i class="sw" style="background:${i.color}"></i><div><b>${esc(i.name)}</b><div class="hint">${esc(i.type)}</div></div><span>${whereTxt(i.id)}</span></li>`).join('');
}
$('#q').addEventListener('input', () => renderResults());
$('#results').addEventListener('click', e => { const li = e.target.closest('li'); if (li) { haptic(); openDetail(li.dataset.id); } });
function startGuide(id) {
  closeSheets();
  if (id.startsWith('sat:') && !S.layers.sats) setLayer('sats', true);
  if (id.startsWith('body:') && !S.layers.planets) setLayer('planets', true);
  if (id.startsWith('con:') && !S.layers.constellations) setLayer('constellations', true);
  S.guide = { id }; select(id); updateGuideBanner();
}
function updateGuideBanner() {
  const g = $('#guide'); if (!S.guide) { g.classList.add('hidden'); return; }
  const o = findObj(S.guide.id); if (!o || !o.enu || !frame.proj) { g.classList.add('hidden'); return; }
  const sep = C.angSep(frame.proj.forward(), o.enu), nm = (o.hl || o.name).split(' · ')[0];
  $('#guideText').textContent = sep < S.fov * 0.3 ? `✓ ${nm} found` : o.alt < 0 ? `${nm} is below the horizon · ${C.dirName(o.az)}` : `Follow the arrow to ${nm} · ${Math.round(o.alt)}° up ${C.dirName(o.az)}`;
  g.classList.remove('hidden');
}
$('#guideClose').addEventListener('click', () => { S.guide = null; updateGuideBanner(); });

/* ---------------- sheets & settings ---------------- */
function closeSheets() { ['#sheet', '#search', '#tonight'].forEach(s => $(s).classList.add('hidden')); closeDetail(); ['#btnSearch', '#btnMenu', '#btnTonight'].forEach(s => $(s).classList.remove('on')); }
function openSheet() { closeSheets(); $('#sheet').classList.remove('hidden'); $('#btnMenu').classList.add('on'); }
function openSearch() { closeSheets(); $('#search').classList.remove('hidden'); $('#btnSearch').classList.add('on'); renderResults(); if (!DEMO) setTimeout(() => $('#q').focus(), 50); }
function openTonight() { closeSheets(); $('#tonight').classList.remove('hidden'); $('#btnTonight').classList.add('on'); renderTonight(); }
const toggleSheet = (sel, open) => () => $(sel).classList.contains('hidden') ? open() : closeSheets();
$('#btnSearch').addEventListener('click', toggleSheet('#search', openSearch));
$('#btnMenu').addEventListener('click', toggleSheet('#sheet', openSheet));
$('#btnTonight').addEventListener('click', toggleSheet('#tonight', openTonight));
function setLayer(k, on) { S.layers[k] = on; store.set('layers', S.layers); document.querySelectorAll(`[data-layer="${k}"]`).forEach(b => b.classList.toggle('on', on)); }
document.querySelectorAll('[data-layer]').forEach(b => b.addEventListener('click', () => { haptic(8); setLayer(b.dataset.layer, !S.layers[b.dataset.layer]); }));
function renderGroups() {
  const all = S.groups.length === GROUPS.length;
  $('#satGroups').innerHTML = GROUPS.map(([g, n]) => `<button class="chip ${S.groups.includes(g) ? 'on' : ''}" data-g="${g}">${n}</button>`).join('') + `<button class="chip ${all ? 'on' : ''}" data-g="all">All</button>`;
}
$('#satGroups').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) setGroups(b.dataset.g); });
function setGroups(g) {
  if (g === 'all') S.groups = S.groups.length === GROUPS.length ? ['stations', 'visual'] : GROUPS.map(x => x[0]);
  else if (S.groups.includes(g)) S.groups = S.groups.filter(x => x !== g); else S.groups = S.groups.concat(g);
  store.set('groups', S.groups); renderGroups(); $('#satInfo').textContent = 'Loading…'; return refreshSats();
}
async function setSatGroups(list) { S.groups = list.slice(); store.set('groups', S.groups); renderGroups(); await refreshSats(); }
function setNight(on) { S.night = on; store.set('night', on); document.documentElement.classList.toggle('nightmode', on); $('#optNight').checked = on;
  document.querySelector('meta[name=theme-color]').content = on ? '#100000' : '#05070f'; }
$('#fov').addEventListener('input', e => setFov(+e.target.value));
$('#hdg').addEventListener('input', e => { S.headingOffset = +e.target.value; store.set('hdg', S.headingOffset); $('#hdgVal').textContent = S.headingOffset.toFixed(1) + '°'; });
$('#optDecl').addEventListener('change', e => { S.decl = e.target.checked; store.set('decl', S.decl); });
$('#optMetric').addEventListener('change', e => { S.metric = e.target.checked; store.set('metric', S.metric); });
$('#optGrid').addEventListener('change', e => { S.grid = e.target.checked; store.set('grid', S.grid); });
$('#optTwinkle').addEventListener('change', e => { S.twinkle = e.target.checked; store.set('twinkle', S.twinkle); });
$('#optNight').addEventListener('change', e => setNight(e.target.checked));
$('#optCamera').addEventListener('change', e => e.target.checked ? startCamera() : stopCamera());
$('#locSet').addEventListener('click', () => { const la = parseFloat($('#lat').value), lo = parseFloat($('#lon').value); if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) { setLocation(la, lo); toast('Location set.'); } else toast('Enter latitude (−90…90) and longitude (−180…180).'); });
$('#locGps').addEventListener('click', () => startGeo());
$('#btnShare').addEventListener('click', () => shareShot());
$('#btnCalib').addEventListener('click', () => openCalib());
$('#btnTour').addEventListener('click', () => { closeSheets(); showOnboarding(true); });

/* ---------------- time travel ---------------- */
function resetSkyCaches() { skyCache.key = ''; bodyCache.t = 0; }
function startTimeTravel(targetMs, rate = 1) { S.tShift = targetMs - Date.now(); S.tRate = rate; S.tRateStart = Date.now(); resetSkyCaches(); syncTimebar(); updateLive(); }
function backToNow() { S.tShift = 0; S.tRate = 1; resetSkyCaches(); syncTimebar(); updateLive(); haptic(); }
function syncTimebar() { $('#tslider').value = Math.max(-1440, Math.min(1440, Math.round((+now() - Date.now()) / 60000))); }
$('#chipTime').addEventListener('click', () => { const tb = $('#timebar'); tb.classList.toggle('hidden'); $('#chipTime').classList.toggle('on', !tb.classList.contains('hidden')); syncTimebar(); });
$('#tslider').addEventListener('input', e => { S.tShift = +e.target.value * 60000; S.tRate = 1; resetSkyCaches(); updateLive(); });
document.querySelectorAll('[data-dt]').forEach(b => b.addEventListener('click', () => { S.tShift += +b.dataset.dt * 60000; resetSkyCaches(); syncTimebar(); updateLive(); }));
document.querySelectorAll('[data-dd]').forEach(b => b.addEventListener('click', () => { S.tShift += +b.dataset.dd * 86400e3; resetSkyCaches(); syncTimebar(); updateLive(); }));
$('#tnow').addEventListener('click', backToNow);
$('#live').addEventListener('click', () => { if (!isLive()) backToNow(); else $('#chipTime').click(); });
function updateLive() {
  const d = now(), live = isLive(), rate = S.preview ? S.preview.scale : S.tRate;
  $('#live').classList.toggle('travel', !live);
  $('#liveText').textContent = live ? 'LIVE' : (rate !== 1 ? `${rate}× · ` : '') + d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  $('#tlabel').textContent = (live ? 'Live · ' : '') + d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  $('#status').textContent = `${S.locName} · ${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}${S.mode === 'sensor' ? ' · compass' : ' · drag to look'}`;
}
