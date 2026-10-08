/* Entity cards (2026-09-24): every map popup becomes a dark card in the style of the atlas components.
   - Simple popups (title + "label: value" lines) are rebuilt as a header, fact tiles and rows.
   - Popups with their own controls keep their content and only take the card styling.
   - Ship losses get a full card: ship, cause, cargo, convoy, attacker, the location's reliability
     ("מצב מעקב") and — when the graph bridge runs — the shipyard/builder from the graph. */
(() => {
 'use strict';
 if (!window.L || typeof map === 'undefined') return;
 // Public read-only graph API (wwii-atlas/api). Static exports in cards/ remain the fallback.
 const GRAPH_API = 'https://ww2-atlas-api.ww2-atlas-public-api.workers.dev';
 const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
 const heDate = d => new Date(Date.UTC(1937, 0, 1) + d * 864e5).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
 const num = n => Number(n).toLocaleString('he-IL');

 // ── Wikipedia links on battle and unit cards ──
 // Battles carry their page in a hidden marker (data-wiki). Units ask the public graph for their exact page,
 // which it returns only when the unit's country is certain; until then (or otherwise) the link is a search.
 const NATION_EN = { 'ארצות הברית': 'United States', 'גרמניה': 'Germany', 'ברית המועצות': 'Soviet Union', 'בריטניה': 'United Kingdom',
  'יפן': 'Japan', 'צרפת': 'France', 'איטליה': 'Italy', 'פינלנד': 'Finland', 'פולין': 'Poland', 'אוסטרליה': 'Australia',
  'ניו זילנד': 'New Zealand', 'יוון': 'Greece', 'סין': 'China', 'קנדה': 'Canada', 'רומניה': 'Romania', 'הונגריה': 'Hungary',
  'בולגריה': 'Bulgaria', 'יוגוסלביה': 'Yugoslavia', 'סלובקיה': 'Slovakia', 'הולנד': 'Netherlands', 'בלגיה': 'Belgium',
  'נורווגיה': 'Norway', 'דרום אפריקה': 'South Africa', 'הודו': 'India' };
 const WIKI_OK = /^https:\/\/([a-z-]+\.)?(wikipedia|wikidata)\.org\//;
 const wikiSearch = name => 'https://en.wikipedia.org/w/index.php?' + new URLSearchParams({ search: name, title: 'Special:Search', go: 'Go' });
 const wikiLink = (href, unit) => WIKI_OK.test(href || '')
  ? `<a class="ec-wiki" href="${esc(href)}" target="_blank" rel="noopener noreferrer"` +
    (unit ? ` data-wiki-unit="${esc(unit.name)}" data-wiki-nation="${esc(unit.nation || '')}"` : '') + `>ויקיפדיה ↗</a>` : '';
 const withWiki = (html, link) => !link ? html : html.includes('<div class="ec-foot">')
  ? html.replace('<div class="ec-foot">', `<div class="ec-foot">${link} · `)
  : html.replace(/<\/div>$/, `<div class="ec-foot">${link}</div></div>`);
 const unitWiki = (name, nationHe) => name && !/^כוח מייצג|^יחידה מזוהה$/.test(name)
  ? wikiLink(wikiSearch(name), { name, nation: NATION_EN[nationHe] || '' }) : '';
 async function upgradeWikiLinks(root) {
  for (const a of root.querySelectorAll('a.ec-wiki[data-wiki-unit]')) {
   const name = a.dataset.wikiUnit, nation = a.dataset.wikiNation;
   a.removeAttribute('data-wiki-unit');
   if (!nation) continue;
   try {
    const r = await fetch(GRAPH_API + '/wiki?' + new URLSearchParams({ kind: 'unit', name, nation }), { credentials: 'omit' });
    const j = r.ok ? await r.json() : null;
    if (j && WIKI_OK.test(j.url || '')) { a.href = j.url; a.title = 'הדף של היחידה בוויקיפדיה'; }
   } catch (e) { /* keep the search link */ }
  }
 }

 const css = document.createElement('style');
 css.textContent = `
.leaflet-popup.ww2-card .leaflet-popup-content-wrapper{background:#12213a;color:#e8eef6;border:1px solid #23406a;border-radius:14px;
 box-shadow:0 14px 34px rgba(3,10,24,.55),0 2px 6px rgba(3,10,24,.35);padding:0}
.leaflet-popup.ww2-card .leaflet-popup-tip{background:#12213a;border:1px solid #23406a;box-shadow:none}
.leaflet-popup.ww2-card .leaflet-popup-content{margin:0;direction:rtl;font:13px/1.55 Heebo,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#e8eef6}
.leaflet-popup.ww2-card a.leaflet-popup-close-button{color:#8fa6c1;top:8px;left:8px;right:auto;font-size:20px}
.leaflet-popup.ww2-card a.leaflet-popup-close-button:hover{color:#fff}
.leaflet-popup.ww2-card .leaflet-popup-content>*:not(.ec){margin:0}
.leaflet-popup.ww2-card .leaflet-popup-content .ec-raw{padding:14px 16px 14px 34px}
.leaflet-popup.ww2-card .ec-raw [style*="color"]:not(.tag){color:#aebfd3 !important}
.leaflet-popup.ww2-card .ec-raw b{color:#fff}
.leaflet-popup.ww2-card .ec-raw a{color:#6fb1ff}
.leaflet-popup.ww2-card .ec-raw button{color:#e8eef6;background:#1a2f50;border:1px solid #2a4a78;border-radius:8px}
.leaflet-popup.ww2-card .ec-raw table{color:#e8eef6}
.leaflet-popup.ww2-card .ec-raw td,.leaflet-popup.ww2-card .ec-raw th{border-color:#2a4368 !important}
.ec{min-width:280px;max-width:380px}
.ec-h{display:flex;gap:12px;align-items:center;padding:16px 16px 12px 36px;border-bottom:1px solid #20395d}
.ec-ic{flex:0 0 42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;
 background:linear-gradient(160deg,#1f4f8f,#16345e);box-shadow:inset 0 0 0 1px #2d5a96}
.ec-t{font-size:16px;font-weight:700;color:#fff;line-height:1.3}
.ec-s{font-size:12px;color:#93a9c4;margin-top:2px}
.ec-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px 16px}
.ec-kpi:last-child:nth-child(odd){grid-column:1/-1}
.ec-kpi{background:#172b49;border:1px solid #23406a;border-radius:10px;padding:8px 10px;min-width:0}
.ec-kpi .l{font-size:11px;color:#8fa6c1}.ec-kpi .v{font-size:14px;font-weight:700;color:#fff;overflow-wrap:anywhere}
.ec-kpi .subv{display:block;margin-top:3px;color:#aebfd3;font-size:12px;font-weight:500}
.ec-affiliation{display:flex;align-items:center;gap:7px}
.ec-flag{display:inline-flex;align-items:center;justify-content:center;width:30px;height:19px;box-sizing:border-box;
 border:1px solid #b9c7d8;border-radius:3px;color:#fff;font:800 8px/1 Arial;text-shadow:0 1px 2px #000;box-shadow:0 1px 3px #06101f99}
.ec-flag.f-DE{position:relative;background:#bd1f2d;color:transparent;font-size:0}
.ec-flag.f-DE:before{content:"";position:absolute;width:13px;height:13px;border-radius:50%;background:#f5f1e9}
.ec-flag.f-DE:after{content:"卐";position:absolute;color:#111;font:900 12px/1 Arial;transform:rotate(-45deg)}
.ec-flag.f-SU{background:#aa2635}.ec-flag.f-US,.ec-flag.f-AU,.ec-flag.f-NZ{background:#315a82}
.ec-flag.f-UK{background:linear-gradient(135deg,#294f79 0 42%,#f1ede4 42% 56%,#b83b45 56% 68%,#294f79 68%)}
.ec-flag.f-JP{background:linear-gradient(90deg,#f4f0e7 0 35%,#bc3341 35% 65%,#f4f0e7 65%)}
.ec-flag.f-IT{background:linear-gradient(90deg,#347654 0 33%,#f4f0e7 33% 66%,#b83b45 66%)}
.ec-flag.f-FR{background:linear-gradient(90deg,#315c8d 0 33%,#f4f0e7 33% 66%,#b83b45 66%)}
.ec-flag.f-PL{background:linear-gradient(#f4f0e7 0 50%,#bc3d4d 50%)}
.ec-flag.f-FI{background:linear-gradient(90deg,#f4f0e7 0 35%,#386399 35% 55%,#f4f0e7 55%)}
.ec-flag.f-CN{background:#ba343e}.ec-flag.f-CA{background:linear-gradient(90deg,#bd3542 0 28%,#f4f0e7 28% 72%,#bd3542 72%)}
.ec-flag.f-RO{background:linear-gradient(90deg,#315b91 0 33%,#e4c849 33% 66%,#b93c45 66%)}
.ec-flag.f-HU{background:linear-gradient(#b43c42 0 33%,#f4efe5 33% 66%,#39764f 66%)}
.ec-flag.f-GR{background:linear-gradient(#3c6d9d 0 42%,#f4f0e7 42% 58%,#3c6d9d 58%)}
.ec-flag.f-BG{background:linear-gradient(#f4efe5 0 33%,#39764f 33% 66%,#b43c42 66%)}
.ec-link{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#dcebff;background:#19365e;
 border:1px solid #315b8f;border-radius:9px;padding:8px 10px;font:600 13px Heebo,system-ui;cursor:pointer;text-align:right}
.ec-link:hover,.ec-link:focus{background:#214573;border-color:#5b8cc7;outline:none}.ec-link small{color:#91aac8;font-weight:500}
.ec-sec{padding:4px 16px 10px}.ec-sh{font-size:11px;letter-spacing:.02em;color:#7f97b6;font-weight:700;margin:6px 0 4px}
.ec-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px dashed #203a5e}
.ec-row:last-child{border-bottom:0}.ec-row .l{color:#93a9c4;flex:0 0 auto}.ec-row .v{color:#e8eef6;text-align:left;overflow-wrap:anywhere}
.ec-p{color:#c9d6e6;font-size:12.5px;margin:4px 0}
.ec-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600}
.ec-badge.ok{background:#12391f;color:#7fe0a0;border:1px solid #1f5c33}.ec-badge.mid{background:#3a3212;color:#f2d27a;border:1px solid #5e5020}
.ec-badge.low{background:#2a2f3a;color:#c3ccd8;border:1px solid #414a59}
.ec-foot{padding:8px 16px 14px;font-size:11px;color:#7f97b6}
.ec-foot a{color:#6fb1ff}
.ec-live{color:#6fb1ff}
`;
 document.head.appendChild(css);

 // ── helpers ──
 const splitLines = el => {
  const lines = []; let cur = document.createElement('div');
  for (const n of Array.from(el.childNodes)) {
   if (n.nodeName === 'BR') { lines.push(cur); cur = document.createElement('div'); } else cur.appendChild(n.cloneNode(true));
  }
  lines.push(cur); return lines.filter(l => l.textContent.trim());
 };
 const ICONS = [['⚔', '⚔️'], ['🚢', '🚢'], ['✈', '✈️'], ['⚓', '⚓'], ['🏭', '🏭'], ['💣', '💣'], ['🪖', '🪖'], ['🗺', '🗺️'], ['🏕', '🏕️']];
 function pickIcon(text) { for (const [k, v] of ICONS) if (text.includes(k)) return v; return '📍'; }
 const stripIcon = t => t.replace(/^[\s\p{Extended_Pictographic}️‍]+/u, '').trim();

 function card({ icon, title, sub, kpis = [], sections = [], foot = '' }) {
  return `<div class="ec"><div class="ec-h"><div class="ec-ic">${icon}</div><div><div class="ec-t">${title}</div>${sub ? `<div class="ec-s">${sub}</div>` : ''}</div></div>` +
   (kpis.length ? `<div class="ec-kpis">${kpis.map(([l, v]) => `<div class="ec-kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>` : '') +
   sections.map(s => `<div class="ec-sec">${s.h ? `<div class="ec-sh">${s.h}</div>` : ''}${s.html || (s.rows || []).map(([l, v]) => `<div class="ec-row"><span class="l">${l}</span><span class="v">${v}</span></div>`).join('')}</div>`).join('') +
   (foot ? `<div class="ec-foot">${foot}</div>` : '') + '</div>';
 }

 // generic: title + lines → header, first facts as tiles, the rest as rows
 function genericCard(content) {
  const b = content.querySelector('b'); if (!b) return null;
  const title = b.textContent.trim();
  const tmp = content.cloneNode(true); const tb = tmp.querySelector('b');
  if (tb) tb.remove();
  const lines = splitLines(tmp);
  const rows = [], notes = [];
  for (const l of lines) {
   const t = l.textContent.trim().replace(/^[·\s]+/, '');
   const m = t.match(/^([^:]{1,32}):\s*(.+)$/s);
   if (m) rows.push([esc(m[1].trim()), l.innerHTML.slice(l.innerHTML.indexOf(':') + 1).trim() || esc(m[2])]);
   else notes.push(l.innerHTML);
  }
  const sub = notes.length && notes[0].length < 90 ? notes.shift() : '';
  const kpis = rows.length >= 3 ? rows.splice(0, 2) : [];
  return card({ icon: pickIcon(title), title: esc(stripIcon(title)), sub, kpis,
   sections: [{ rows }, ...(notes.length ? [{ html: notes.map(n => `<div class="ec-p">${n}</div>`).join('') }] : [])] });
 }

 // label/value rows (<div><b>label </b>value</div>…) — units, bases, fortifications, movements
 function rowsCard(content) {
  const box = content.children.length === 1 && content.firstElementChild.tagName === 'DIV' ? content.firstElementChild : content;
  const divs = Array.from(box.children);
  if (divs.length < 2 || !divs.every(d => d.tagName === 'DIV' && d.firstElementChild && d.firstElementChild.tagName === 'B' && d.firstChild === d.firstElementChild)) return null;
  const rows = divs.map(d => { const l = d.firstElementChild.textContent.trim(); return [l, d.textContent.slice(d.firstElementChild.textContent.length).trim()]; });
  const take = (...names) => { for (const n of names) { const i = rows.findIndex(r => r[0] === n); if (i >= 0) return rows.splice(i, 1)[0][1]; } return ''; };
  const has = n => rows.some(r => r[0] === n);
  const isUnit = has('יחידה');
  const icon = isUnit ? '🪖' : has('ביצור') || has('קו ביצורים') ? '🧱' : has('מתקן') || has('בסיס') ? '🏕️' : has('תנועה') || has('מסלול') ? '🧭' : has('קרב') ? '⚔️' : '📍';
  const title = take('יחידה', 'מתקן', 'בסיס', 'ביצור', 'קו ביצורים', 'שם', 'תנועה') || rows.shift()[1];
  const nation = take('מדינה'), battle = take('קרב');
  const status = take('מעמד', 'דיוק', 'ודאות'), src = take('מקור');
  if (isUnit) {
   const period = take('תקופה', 'תאריך');
   const location = take('מיקום');
   const affiliation = take('שיוך') || 'לא ידוע';
   const flag = take('דגל') || '--';
   const role = take('תפקיד') || 'לא ידוע';
   const purpose = take('תפקיד בכוח') || 'לא ידוע במקור';
   const parent = take('יחידת־אם') || 'לא ידוע במקור';
   const parentEchelon = take('דרג יחידת־האם');
   const parentDate = take('תאריך שיוך');
   const parentSource = take('מקור יחידת־האם');
   const commander = take('מפקד') || 'לא ידוע במקור';
   const locationPrecision = take('דיוק מיקום');
   take('צד בקרב');
   const flagClass = /^[A-Z]{2}$/.test(flag) ? ' f-' + flag : '';
   const affiliationValue = `<span class="ec-affiliation"><span class="ec-flag${flagClass}">${esc(flag)}</span>${esc(affiliation)}</span>` +
    `<span class="subv">${esc(nation || 'מדינה לא ידועה')}</span>`;
   const kpis = [['תקופה', esc(period || 'לא ידוע')], ['מיקום', esc(location || 'לא ידוע')],
    ['שיוך', affiliationValue], ['תפקיד', `${esc(role)}<span class="subv">${esc(purpose)}</span>`]];
   const parentKnown = parent && !/^לא ידוע/.test(parent);
   const parentHtml = parentKnown
    ? `<button type="button" class="ec-link" data-ww2-parent="${esc(parent)}" data-ww2-child="${esc(title)}" data-ww2-battle="${esc(battle)}" data-ww2-country="${esc(nation)}" data-ww2-echelon="${esc(parentEchelon)}" data-ww2-date="${esc(parentDate)}" data-ww2-source="${esc(parentSource)}"><span>${esc(parent)}</span><small>לפתוח את יחידת־האם ←</small></button>`
    : `<div class="ec-p">${esc(parent)}</div>`;
   const structure = parentHtml + `<div class="ec-row"><span class="l">מפקד</span><span class="v">${esc(commander)}</span></div>`;
   const cls = /משוער|סכמטי|מייצג|לא קואורדינטת/.test(status + ' ' + locationPrecision) ? 'low' : /עוגן|היסטורי|בקירוב/.test(status) ? 'mid' : 'ok';
   const tracking = `${status ? `<span class="ec-badge ${cls}">● ${esc(status)}</span>` : ''}` +
    `${locationPrecision ? `<div class="ec-p">${esc(locationPrecision)}</div>` : ''}`;
   return card({ icon, title: esc(title), sub: esc(battle), kpis,
    sections: [{ h: 'מבנה ופיקוד', html: structure },
     ...(rows.length ? [{ h: 'פרטים', rows: rows.map(([l, v]) => [esc(l), esc(v)]) }] : []),
     ...(tracking ? [{ h: 'מצב מעקב', html: tracking }] : [])],
    foot: [unitWiki(title, nation), src ? 'מקור: ' + esc(src) : ''].filter(Boolean).join(' · ') });
  }
  const kpis = [];
  for (const n of ['תקופה', 'תאריך', 'צד בקרב', 'הכוח בצד זה', 'כוח']) { const v = take(n); if (v && kpis.length < 4) kpis.push([esc(n), esc(v.replace(/(\d{4})-(\d{2})-(\d{2})/g, (m, y, mo, d) => new Date(Date.UTC(+y, +mo - 1, +d)).toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: 'numeric' })))]); else if (v) rows.unshift([n, v]); }
  const cls = /משוער|סכמטי|מייצג|לא קואורדינטת/.test(status) ? 'low' : /עוגן|היסטורי|בקירוב/.test(status) ? 'mid' : 'ok';
  const loc = rows.findIndex(r => r[0] === 'מיקום'); const locRow = loc >= 0 ? rows.splice(loc, 1)[0] : null;
  const track = status || locRow ? `${status ? `<span class="ec-badge ${cls}">● ${esc(status)}</span>` : ''}${locRow ? `<div class="ec-p">מיקום: ${esc(locRow[1])}</div>` : ''}` : '';
  return card({ icon, title: esc(title), sub: [nation, battle].filter(Boolean).map(esc).join(' · '), kpis,
   sections: [...(rows.length ? [{ h: 'פרטים', rows: rows.map(([l, v]) => [esc(l), esc(v)]) }] : []), ...(track ? [{ h: 'מצב מעקב', html: track }] : [])],
   foot: src ? 'מקור: ' + esc(src) : '' });
 }

 function parentReferenceCard(button) {
  const d = button.dataset;
  const normalize = value => String(value || '').toLowerCase().replace(/\([^)]*\)/g, ' ')
   .replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/g, ' ').trim();
  const candidates = ((window.WW2_BATTLE_UNITS || {}).units || []).filter(unit =>
   normalize(unit.u) === normalize(d.ww2Parent));
  const unit = candidates.find(row => row.b === d.ww2Battle) || null;
  const period = d.ww2Date;
  const observed = /^\d{4}-\d{2}-\d{2}$/.test(period || '')
   ? new Date(period + 'T00:00:00Z').toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' }) : period;
  const location = unit ? (unit.pl || `${Math.abs(unit.y).toFixed(3)}° ${unit.y >= 0 ? 'צ׳' : 'ד׳'}, ${Math.abs(unit.x).toFixed(3)}° ${unit.x >= 0 ? 'מז׳' : 'מע׳'}`) : '';
  const higher = unit && unit.p && normalize(unit.p) !== normalize(d.ww2Parent)
   ? `<button type="button" class="ec-link" data-ww2-parent="${esc(unit.p)}" data-ww2-child="${esc(d.ww2Parent)}" data-ww2-battle="${esc(unit.b)}" data-ww2-country="${esc(d.ww2Country)}" data-ww2-echelon="${esc(unit.pe)}" data-ww2-date="${esc(unit.pd)}" data-ww2-source="${esc(unit.ps)}"><span>${esc(unit.p)}</span><small>לפתוח את יחידת־הא ←</small></button>` : '';
  return card({ icon: '🪖', title: esc(d.ww2Parent),
   sub: `יחידת־האם של ${esc(d.ww2Child)}`,
   kpis: [['דרג', esc(d.ww2Echelon || (unit && unit.e) || 'לא ידוע')],
    ['תאריך השיוך', esc(observed || 'לא ידוע')],
    ['מדינה', esc(d.ww2Country || 'לא ידוע')],
    ...(location ? [['מיקום', esc(location)]] : [])],
   sections: [{ h: 'קשר מבני', rows: [['יחידה כפופה', esc(d.ww2Child)], ['הקשר לקרב', esc(d.ww2Battle || 'לא ידוע')]] },
    ...(higher ? [{ h: 'יחידה עליונה נוספת', html: higher }] : [])],
   foot: [unitWiki(d.ww2Parent, d.ww2Country), d.ww2Source ? 'מקור קשר הכפיפות: ' + esc(d.ww2Source) : ''].filter(Boolean).join(' · ') });
 }

 // ── ship losses ──
 let details = null;
 const loadDetails = () => details || (details = fetch('./cards/sinkings.json').then(r => r.ok ? r.json() : {}).catch(() => ({})));
 // static builders exported from the graph (tools/export_sinking_builders.py) — used when the bridge is off
 let builders = null;
 const loadBuilders = () => builders || (builders = fetch('./cards/sinking_builders.json').then(r => r.ok ? r.json() : {}).catch(() => ({})));
 const CAUSE = { torpedo: 'טורפדו', air_attack: 'תקיפה אווירית', mine: 'מוקש', scuttled: 'הוטבעה בידי הצוות', gunfire: 'ירי ארטילרי',
  depth_charge: 'פצצות עומק', grounding: 'עלתה על שרטון', collision: 'התנגשות', foundered: 'שקעה בסערה', wrecked: 'נטרפה', capsized: 'התהפכה', fire: 'שריפה' };
 const tracking = geo => geo === 'wreck_site' ? '<span class="ec-badge ok">● השריד אותר — המיקום הוא אתר השריד</span>'
  : geo === 'coord_template' ? '<span class="ec-badge mid">● מיקום מדווח — קואורדינטות מרשימת הטביעות</span>'
   : '<span class="ec-badge low">● מיקום משוער — אין תיעוד מדויק של מקום השריד</span>';
 const cargoFrom = t => { const m = (t || '').match(/(?:carrying|laden with|with a cargo of|cargo of)\s+([^.;:()]{3,80})/i); return m ? m[1].trim() : ''; };
 function shipCard(k, det, live) {
  const cause = CAUSE[det.cause] || det.cause || k.c || '';
  const cargo = k.cg || cargoFrom(det.text);
  const kpis = [['הוטבעה', heDate(k.d)], ['סיבה', esc(cause || 'לא ידוע')]];
  if (k.t || det.grt) kpis.push(['תפוסה', num(k.t || det.grt) + ' GRT']);
  if (k.cl) kpis.push(['אבדות צוות', num(k.cl)]);
  const ship = [];
  if (det.cls || (live && live.label)) ship.push(['סוג', esc(det.cls || live.label)]);
  if (det.flag) ship.push(['דגל', esc(det.flag)]);
  if (det.operator) ship.push(['מפעיל', esc(det.operator)]);
  const yard = live && live.builders && live.builders.length
   ? [['מספנה / בונה', esc(live.builders.join(' · '))], ...(live.city && live.city.length ? [['עיר הבנייה', esc(live.city.join(' · '))]] : [])]
   : [['מספנה / בונה', live === false ? '<span class="ec-live">המספנה לא רשומה בגרף לאונייה זו</span>' : '<span class="ec-live">נטען מהגרף…</span>']];
  const loss = [];
  loss.push(['מה העבירה', cargo ? esc(cargo) : '<span class="ec-live">המטען לא מתועד במקורות</span>']);
  if (det.convoy || k.cv) loss.push(['שיירה', esc(det.convoy || k.cv)]);
  if (det.attacker || k.a || (live && live.attacker && live.attacker.length)) loss.push(['התוקף', esc(det.attacker || k.a || live.attacker.join(', '))]);
  const sections = [
   { h: 'האונייה', rows: ship },
   { h: 'מספנה', rows: yard },
   ...(loss.length ? [{ h: 'הטביעה', rows: loss }] : []),
   { h: 'מצב מעקב', html: tracking(det.geo) + (live && live.vs ? `<div class="ec-p">סטטוס אימות בגרף: ${esc(live.vs)}</div>` : '') },
   ...(det.text ? [{ html: `<div class="ec-p" dir="auto">${esc(cleanWiki(det.text))}</div>` }] : [])
  ];
  const foot = (det.src ? 'מקור: ' + esc(det.src) : '') + (live && live.wiki ? ` · <a href="${esc(live.wiki)}" target="_blank" rel="noopener">ויקיפדיה</a>` : '');
  return card({ icon: '🚢', title: esc(k.n || 'אנייה'), sub: [det.cls, det.flag].filter(Boolean).map(esc).join(' · '), kpis, sections, foot });
 }
 async function liveShip(k) {
  try {
   const date = new Date(Date.UTC(1937, 0, 1) + k.d * 864e5).toISOString().slice(0, 10);
   const r = await fetch(GRAPH_API + '/ship?' + new URLSearchParams({ n: k.n || '', d: date }), { credentials: 'omit' });
   if (!r.ok) return null;
   const j = await r.json(); const row = (j.rows || j.records || j.data || [])[0];
   if (!row) return false;
   const v = Array.isArray(row) ? { builders: row[0], city: row[1], label: row[2], wiki: row[3], vs: row[4], attacker: row[5] } : row;
   v.city = (v.city || []).filter(Boolean); v.builders = (v.builders || []).filter(Boolean);
   return v.builders.length || v.label ? v : false;
  } catch (e) { return null; }
 }
 const cleanWiki = t => String(t).replace(/^World War II:\s*/, '').replace(/\(\s*\d+px[^)]*\)/g, '').replace(/\(\s*[,;]?\s*\)/g, '').replace(/\s+([,.;])/g, '$1').replace(/\s{2,}/g, ' ').trim();
 function findSink(ll) {
  const S = (typeof D !== 'undefined' && D.sea && D.sea.sink) || [];
  let best = null, bd = 1e9;
  for (const k of S) { const d = Math.abs(k.y - ll.lat) + Math.abs(k.x - ll.lng); if (d < bd) { bd = d; best = k; } if (d < 1e-7) break; }
  return bd < 1e-4 ? best : null;
 }

 map.on('popupopen', async e => {
  const popup = e.popup, el = popup.getElement(); if (!el) return;
  el.classList.add('ww2-card');
  const content = el.querySelector('.leaflet-popup-content'); if (!content || content.querySelector('.ec,.ec-raw')) return;
  popup.options.maxWidth = 400; popup.options.minWidth = 280;
  // keep the card clear of the timeline panel at the bottom
  try { const tb = document.getElementById('timebar'); if (tb) popup.options.autoPanPaddingBottomRight = [20, Math.max(20, map.getContainer().getBoundingClientRect().bottom - tb.getBoundingClientRect().top + 16)]; } catch (err) {}
  const src = popup._source;
  // many layers are rebuilt on every tick/moveend (sinkings, air raids, plants…); the rebuild removes the
  // source marker and Leaflet then closes its popup at once. Keep the open card alive until the user closes it.
  if (src && src.closePopup) { src.off('remove', src.closePopup, src); popup.once('remove', () => { try { src.on('remove', src.closePopup, src); } catch (err) {} }); }
  // ship loss
  let isSink = false;
  try { isSink = typeof sinkFx !== 'undefined' && src && sinkFx.hasLayer(src); } catch (err) {}
  if (isSink && src.getLatLng) {
   const k = findSink(src.getLatLng());
   if (k) {
    const key = `${(k.n || '').toLowerCase()}|${k.d}`;
    const det = ((await loadDetails())[key]) || {};
    if (!map.hasLayer(popup)) return;
    popup.setContent(shipCard(k, det, undefined));
    let live = await liveShip(k);
    if (live === null) {            // bridge off → static export from the graph
     const st = (await loadBuilders())[key];
     live = st ? { builders: st[0] || [], city: st[1] || [], label: st[2] } : (Object.keys(await loadBuilders()).length ? false : null);
    }
    if (map.hasLayer(popup)) {
     let h = shipCard(k, det, live === null ? undefined : live);
     if (live === null) h = h.replace('נטען מהגרף…', 'שרת הגרף אינו זמין כרגע — פרטי המספנה יוצגו כשיחזור');
     popup.setContent(h);
    }
    return;
   }
  }
  const marker = content.querySelector('[data-wiki]');
  const battleWiki = marker ? wikiLink(marker.getAttribute('data-wiki')) : '';
  // popups with their own controls keep their markup
  if (content.querySelector('button,a,input,select,textarea,[data-sub],[data-ww2-factory],table')) {
   const wrap = document.createElement('div'); wrap.className = 'ec-raw';
   while (content.firstChild) wrap.appendChild(content.firstChild);
   if (battleWiki && !wrap.querySelector('a.ec-wiki')) { const f = document.createElement('div'); f.className = 'ec-foot'; f.innerHTML = battleWiki; wrap.appendChild(f); }
   content.appendChild(wrap); if (map.hasLayer(popup)) { popup._updateLayout(); popup._updatePosition(); } return;
  }
  const built = rowsCard(content) || genericCard(content);
  const html = built ? withWiki(built, battleWiki) : null;
  if (html) { popup.setContent(html); upgradeWikiLinks(popup.getElement() || document.createElement('div')); }
  else { const wrap = document.createElement('div'); wrap.className = 'ec-raw'; while (content.firstChild) wrap.appendChild(content.firstChild); content.appendChild(wrap); if (map.hasLayer(popup)) { popup._updateLayout(); popup._updatePosition(); } }
 });
 map.getContainer().addEventListener('click', event => {
  const button = event.target.closest && event.target.closest('.ec-link[data-ww2-parent]');
  if (!button || !map._popup || !map.hasLayer(map._popup)) return;
  event.preventDefault();
  map._popup.setContent(parentReferenceCard(button));
  map._popup.update();
  upgradeWikiLinks(map._popup.getElement() || document.createElement('div'));
 });
 window.WW2Cards = { card, shipCard, parentReferenceCard };
})();
