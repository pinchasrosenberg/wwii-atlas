/* Guided exploration for the timeline map (8.10.2026).
   A new visitor should not have to work out by themselves where and when to look:
   - picking a battle or a site (search, events list) moves the map to the place AND to its date, switches to the
     view that fits it, opens its card, and shows a small "story" bar: how far into the event the map is, back to
     its first day, play, and day-by-day steps;
   - views also switch the layers other modules own (units, bases and fortifications, flights and airfields);
   - "−1 יום" / "+1 יום" next to play;
   - a one-time welcome card with three ways to start (and "איך מתחילים?" in the tools menu to see it again). */
(() => {
 'use strict';
 if (!window.L || typeof map === 'undefined' || typeof BAT === 'undefined') return;
 const slider = document.getElementById('slider'), play = document.getElementById('play');
 const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
 const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
 const today = () => +slider.value;
 function goDay(d) {
  d = Math.max(+slider.min, Math.min(+slider.max, Math.round(d)));
  if (d === today()) return;
  slider.value = d; slider.dispatchEvent(new Event('input', { bubbles: true }));   // the same path as dragging the slider
 }
 const view = name => { if (typeof applyView === 'function' && currentView !== name && currentView !== 'all') applyView(name); };

 // ── views → the layers of the other modules ──
 const GROUPS = ['battleUnits', 'movements', 'units', 'bases', 'forts'];
 const OVERLAYS = {
  overview: [], occupation: [], persecution: [], sea: [], industry: [],
  all: [...GROUPS, 'fly', 'fields'],
  front: ['battleUnits', 'movements', 'units', 'forts'],
  air: ['bases', 'fly', 'fields']
 };
 function applyOverlays(name) {
  const on = new Set(OVERLAYS[name] || []);
  const mil = window.WW2Military, air = window.WW2Air;
  if (mil && mil.setGroup) for (const g of GROUPS) if (!!mil.state[g] !== on.has(g)) mil.setGroup(g, on.has(g));
  if (air && air.setFly) { air.setFly(on.has('fly')); air.setFields(on.has('fields')); }
  return !!(mil && mil.setGroup);
 }
 document.addEventListener('ww2:view', e => applyOverlays(e.detail.name));
 // the other modules load their data asynchronously: apply the opening view to them once they exist
 let tries = 0;
 (function waitOverlays() { if (applyOverlays(currentView) || ++tries > 40) return; setTimeout(waitOverlays, 250); })();

 // ── the story bar ──
 const css = document.createElement('style');
 css.textContent = `
 #storyBar{bottom:calc(var(--tlH) + 26px);left:50%;transform:translateX(-50%);width:min(600px,94vw);box-sizing:border-box;
  padding:9px 12px;font-size:12.5px;line-height:1.5;direction:rtl;display:none}
 #storyBar.show{display:block}
 #storyBar .sb-t{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
 #storyBar .sb-t b{font-size:14px}
 #storyBar .sb-when{color:var(--ink-soft);font-size:11.5px}
 #storyBar .sb-h{color:var(--ink-soft);font-size:11.5px;margin:2px 0 6px}
 #storyBar .sb-p{display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px}
 #storyBar .sb-bar{flex:1;height:5px;border-radius:3px;background:rgba(90,106,117,.25);overflow:hidden;direction:ltr}
 #storyBar .sb-bar i{display:block;height:100%;background:var(--axis);width:0}
 #storyBar .sb-a{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}
 #storyBar button,#welcome button,.dayStep{font:600 12px Heebo,Arial,sans-serif;border:1px solid var(--line);background:#fff;
  border-radius:var(--r1);padding:6px 10px;cursor:pointer;color:var(--ink)}
 #storyBar button:hover,#welcome button:hover,.dayStep:hover{border-color:var(--ink-soft)}
 #storyBar .sb-x{margin-inline-start:auto}
 .dayStep{padding:6px 8px;white-space:nowrap}
 #tbTop .nvsel{margin-inline-start:auto!important}   /* the speed menu copied a fixed margin before the day buttons existed */
 #welcome{top:50%;left:50%;transform:translate(-50%,-50%);width:min(420px,92vw);box-sizing:border-box;z-index:1300;
  padding:16px 18px;font-size:13.5px;line-height:1.6;direction:rtl}
 #welcome h3{margin:0 0 8px;font-size:17px}
 #welcome ol{margin:0 0 12px;padding-inline-start:20px}
 #welcome li{margin:5px 0}
 #welcome .w-a{display:flex;gap:8px;flex-wrap:wrap}
 #welcome .w-go{background:var(--ink);color:#fff;border-color:var(--ink)}
 @media (max-width:700px){
  #storyBar{left:6px;right:6px;width:auto;transform:none;bottom:var(--sheetBottom)}
  body:not([data-ui-panel="none"]) #storyBar{display:none}
  .dayStep{padding:6px 6px;font-size:11.5px}
  #seasonLbl{display:none}
 }`;
 document.head.appendChild(css);

 const bar = document.createElement('section');
 bar.id = 'storyBar'; bar.className = 'panel'; bar.setAttribute('aria-label', 'האירוע שנבחר');
 bar.innerHTML = '<div class="sb-t"><b></b><span class="sb-when"></span></div><div class="sb-h"></div>' +
  '<div class="sb-p"><span class="sb-n" aria-live="polite"></span><span class="sb-bar"><i></i></span></div>' +
  '<div class="sb-a"><button type="button" data-a="start">⏮ ליום הראשון</button>' +
  '<button type="button" data-a="card">📄 הכרטיס</button><button type="button" data-a="play">▶ הפעל</button>' +
  '<button type="button" class="sb-x" data-a="close" aria-label="סגור">✕</button></div>';
 document.body.appendChild(bar);
 let story = null;
 const dayWord = n => n === 1 ? 'יום אחד' : `${n.toLocaleString('he-IL')} ימים`;
 function updateStory() {
  if (!story) return;
  const d = today(), { f, e } = story, n = bar.querySelector('.sb-n'), fill = bar.querySelector('.sb-bar i');
  const span = Math.max(1, e - f + 1);
  if (d < f) { n.textContent = `עוד ${dayWord(f - d)} עד שזה מתחיל`; fill.style.width = '0'; }
  else if (d > e) { n.textContent = `הסתיים לפני ${dayWord(d - e)}`; fill.style.width = '100%'; }
  else { n.textContent = span === 1 ? 'היום של האירוע' : `יום ${(d - f + 1).toLocaleString('he-IL')} מתוך ${span.toLocaleString('he-IL')}`;
   fill.style.width = ((d - f + 1) / span * 100) + '%'; }
  bar.querySelector('[data-a="play"]').textContent = isPlaying() ? '❚❚ עצור' : '▶ הפעל';
 }
 const isPlaying = () => /❚|⏸|■/.test(play ? play.textContent : '');
 function showStory(s) {
  story = s;
  bar.querySelector('.sb-t b').textContent = s.title;
  bar.querySelector('.sb-when').textContent = s.f === s.e ? heDay(s.f) : `${heDay(s.f)} – ${heDay(s.e)}`;
  const v = VIEWS[currentView];
  bar.querySelector('.sb-h').textContent = `המפה עברה ${s.moved ? 'לתאריך הזה' : 'למקום'}` +
   (v && currentView !== 'all' ? ` ובמבט ״${v.he}״ (${v.what}).` : '.') + ' התקדמו יום אחרי יום ב״+1 יום״, או הפעילו.';
  bar.classList.add('show'); updateStory();
 }
 bar.addEventListener('click', e => {
  const a = e.target.closest('[data-a]')?.dataset.a; if (!a || !story) return;
  if (a === 'close') { story = null; bar.classList.remove('show'); return; }
  if (a === 'start') { goDay(story.f); map.setView(story.ll, Math.max(map.getZoom(), story.z)); }
  if (a === 'card') story.card();
  if (a === 'play') { play.click(); setTimeout(updateStory, 50); }
 });
 document.addEventListener('ww2:daychange', updateStory);

 // ── opening a battle / a site ──
 // the card opens upward from the place, so the place is first moved to just above the story bar and the timeline
 function popupAt(ll, html) {
  if (!html) return;
  const H = map.getSize().y, top = bar.classList.contains('show') ? bar.getBoundingClientRect().top - map.getContainer().getBoundingClientRect().top : H - 190;
  const want = Math.max(H * .45, top - 24), at = map.latLngToContainerPoint(ll);
  if (Math.abs(at.y - want) > 8) map.panBy([0, at.y - want], { animate: false });
  L.popup({ maxWidth: Math.min(400, innerWidth - 64), maxHeight: Math.max(160, want - 70), autoPanPaddingTopLeft: [12, 60], autoPanPaddingBottomRight: [12, 20] })
   .setLatLng(ll).setContent(html).openOn(map);
 }
 const isAirBattle = b => /הפצצ|הבליץ|bombing|blitz/i.test(`${b.n} ${b.en || ''}`);
 function openBattle(b) {
  const o = BAT.find(x => x.b === b); if (!o) return;
  const f0 = b.f, e0 = Math.max(b.e || b.f, b.f ?? 0), ll = [b.y, b.x];
  const moved = f0 != null && (today() < f0 || today() > e0);
  if (moved) goDay(f0);
  view(isAirBattle(b) ? 'air' : 'front');
  const card = () => popupAt(ll, o.m.getPopup() && o.m.getPopup().getContent());
  map.setView(ll, Math.max(map.getZoom(), 7));
  setTimeout(card, 380);
  if (f0 != null) showStory({ title: b.n, f: f0, e: e0, ll, z: 7, card, moved });
 }
 function openSite(p) {
  const o = M.find(x => x.p === p), ll = [p.y, p.x];
  const has = p.f != null, f0 = p.f ?? p.e, e0 = p.e ?? p.f;
  const moved = has && (today() < (p.f ?? -1e9) || today() > (p.e ?? 1e9));
  if (moved) goDay(p.f);
  if (/camp|ghetto|killing|transit/i.test(p.t)) view('persecution');
  const card = () => popupAt(ll, o && o.m.getPopup() && o.m.getPopup().getContent());
  map.setView(ll, Math.max(map.getZoom(), 9));
  setTimeout(card, 380);
  if (f0 != null) showStory({ title: p.n, f: f0, e: e0 ?? f0, ll, z: 9, card, moved });
 }
 function openSearch(it) {
  if (it.battle) return openBattle(it.battle);
  if (it.site) return openSite(it.site);
  if (it.factoryId) { view('industry'); map.setView([it.y, it.x], it.z); window.WW2BattleSupply?.showFactory?.(it.factoryId); }
 }

 // ── ±1 day ──
 if (play) {
  const step = (txt, title, dd) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dayStep';
   b.textContent = txt; b.title = title; b.setAttribute('aria-label', title); b.onclick = () => goDay(today() + dd); return b; };
  play.after(step('+1 יום', 'יום אחד קדימה', 1));
  play.after(step('−1 יום', 'יום אחד אחורה', -1));
 }

 // ── welcome ──
 const normandy = (D.bat || []).find(b => b.en === 'Normandy landings');
 function welcome() {
  if (document.getElementById('welcome')) return;
  const w = document.createElement('section');
  w.id = 'welcome'; w.className = 'panel'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'איך מתחילים');
  w.innerHTML = '<h3>איך מתחילים?</h3><ol>' +
   '<li>🔎 <b>חפשו קרב או מקום</b> ב״כלים ← חיפוש״. המפה עוברת גם למקום וגם לתאריך שלו, ונפתח עליו כרטיס.</li>' +
   '<li>▶ <b>הפעילו את הזמן</b>, או התקדמו יום אחרי יום ב״+1 יום״.</li>' +
   '<li>👁 <b>בחרו נושא</b> ב״כלים ← שכבות ומבטים״: החזית, הכיבוש, המלחמה האווירית, הרדיפה, הים.</li></ol>' +
   '<div class="w-a">' + (normandy ? `<button type="button" class="w-go" data-a="demo">נסו: ${esc(normandy.n)}</button>` : '') +
   '<button type="button" data-a="ok">הבנתי</button></div>';
  document.body.appendChild(w);
  const close = () => { w.remove(); store.set('ww2.welcome', '1'); };
  w.addEventListener('click', e => {
   const a = e.target.closest('[data-a]')?.dataset.a;
   if (a === 'ok') close();
   if (a === 'demo') { close(); openBattle(normandy); }
  });
  w.querySelector('button').focus();
 }
 if (!store.get('ww2.welcome')) setTimeout(welcome, 900);
 const menu = document.getElementById('mapToolsMenu'), closeBtn = menu && menu.querySelector('[data-panel="none"]');
 if (menu) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = 'איך מתחילים?';
  b.onclick = () => { menu.classList.remove('open'); welcome(); };
  menu.insertBefore(b, closeBtn || null);
 }

 window.WW2Explore = { openBattle, openSite, openSearch, goDay, welcome };
})();
