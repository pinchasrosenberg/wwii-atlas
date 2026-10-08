/* Navy dropdowns (2026-09-27). The browser draws a <select>'s open list itself (a pale system menu that ignores the
   page colours), so every <select> on the page is shown through this component instead: a navy button and list,
   with a search box for long lists and full keyboard use (↑ ↓ Enter Esc, typing filters).
   The real <select> stays in the page, hidden and in sync — code that reads .value, sets it, or listens for
   'change' keeps working, and selects that are re-rendered later are picked up automatically. */
(() => {
 'use strict';
 const css = `
 .nvsel{position:relative;display:inline-flex;min-width:0;vertical-align:middle}
 .nvsel>button{display:flex;align-items:center;gap:8px;width:100%;min-width:0;background:#0e1b2f;color:#e8eef6;border:1px solid #23406a;
  border-radius:10px;padding:8px 10px;font:inherit;cursor:pointer;text-align:start;direction:rtl}
 .nvsel>button:hover{border-color:#60a5fa}
 .nvsel>button:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(59,130,246,.35);border-color:#3b82f6}
 .nvsel>button .lb{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .nvsel>button .lb.ph{color:#93a9c4}
 .nvsel>button .ar{flex:0 0 auto;width:8px;height:8px;border:solid #93a9c4;border-width:0 0 1.6px 1.6px;transform:rotate(-45deg) translateY(-2px);transition:transform .15s}
 .nvsel.open>button .ar{transform:rotate(135deg) translate(-2px,0)}
 .nvsel.open>button{border-color:#3b82f6}
 .nvsel>button:disabled{opacity:.5;cursor:default}
 .nvpop{position:fixed;z-index:100000;background:#12213a;border:1px solid #23406a;border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.55);
  direction:rtl;display:flex;flex-direction:column;overflow:hidden;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Heebo,Arial,sans-serif;color:#e8eef6}
 .nvpop input{margin:8px;background:#0e1b2f;color:#e8eef6;border:1px solid #23406a;border-radius:9px;padding:7px 10px;font:inherit;outline:none}
 .nvpop input:focus{border-color:#3b82f6}
 .nvpop input::placeholder{color:#6f86a3}
 .nvpop ul{list-style:none;margin:0;padding:4px;overflow:auto;scrollbar-color:#23406a transparent}
 .nvpop li{display:flex;align-items:baseline;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer;white-space:nowrap}
 .nvpop li .sub{margin-inline-start:auto;color:#6f86a3;font-size:12px}
 .nvpop li.act{background:#1c3a66}
 .nvpop li.sel{color:#60a5fa;font-weight:600}
 .nvpop li.sel::before{content:"✓";font-size:12px}
 .nvpop li.dis{opacity:.4;cursor:default}
 .nvpop li.grp{color:#93a9c4;font-size:11.5px;font-weight:700;cursor:default;padding-top:9px}
 .nvpop .none{padding:10px 12px;color:#6f86a3;font-size:13px}`;
 const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

 let openState = null;                                          // { sel, wrap, pop, items, act }
 const placeholder = o => o && o.value === '';
 // an option may carry a muted note on the side: <option data-sub="3 נתיבים">
 function label(sel) {
  const o = sel.options[sel.selectedIndex];
  const lb = sel._nv.btn.querySelector('.lb'); lb.textContent = o ? o.textContent : ''; lb.classList.toggle('ph', !o || placeholder(o));
  sel._nv.btn.disabled = sel.disabled;
 }
 function close(refocus) {
  if (!openState) return; const { wrap, pop, sel } = openState; openState = null;
  wrap.classList.remove('open'); pop.remove(); if (refocus) sel._nv.btn.focus();
 }
 function choose(sel, value) {
  if (sel.value !== value) { sel.value = value; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
  if (sel.isConnected && sel._nv) label(sel);
  close(sel.isConnected);
 }
 function open(sel) {
  if (openState && openState.sel === sel) return close(true);
  close(false);
  const wrap = sel._nv.wrap, r = wrap.getBoundingClientRect(), pop = document.createElement('div'); pop.className = 'nvpop';
  const opts = [...sel.querySelectorAll('option,optgroup')];
  const searchable = sel.options.length > 8;
  pop.innerHTML = (searchable ? '<input type="text" placeholder="חיפוש…" aria-label="חיפוש ברשימה">' : '') + '<ul role="listbox"></ul>';
  const ul = pop.querySelector('ul'), inp = pop.querySelector('input');
  const state = { sel, wrap, pop, items: [], act: -1 };
  function render(q) {
   ul.innerHTML = ''; state.items = []; q = (q || '').trim().toLowerCase();
   for (const o of opts) {
    if (o.tagName === 'OPTGROUP') { if (!q) { const li = document.createElement('li'); li.className = 'grp'; li.textContent = o.label; ul.appendChild(li); } continue; }
    if (o.hidden || (placeholder(o) && searchable)) continue;   // the "+ choose…" line is the button's label, not an item
    const text = o.textContent, sub = o.dataset.sub || '';
    if (q && !(text + ' ' + sub).toLowerCase().includes(q)) continue;
    const li = document.createElement('li'); li.setAttribute('role', 'option');
    li.innerHTML = '<span></span>' + (sub ? '<span class="sub"></span>' : '');
    li.firstChild.textContent = text; if (sub) li.lastChild.textContent = sub;
    if (o.disabled) li.classList.add('dis'); if (o.selected && !placeholder(o)) li.classList.add('sel');
    li.onmousedown = e => e.preventDefault();
    li.onclick = () => { if (!o.disabled) choose(sel, o.value); };
    li.onmousemove = () => setAct(state.items.indexOf(li));
    li._opt = o; ul.appendChild(li); state.items.push(li);
   }
   if (!state.items.length) ul.innerHTML = '<div class="none">אין תוצאות</div>';
   setAct(Math.max(0, state.items.findIndex(li => li.classList.contains('sel'))));
  }
  function setAct(i) {
   if (state.act >= 0 && state.items[state.act]) state.items[state.act].classList.remove('act');
   state.act = Math.min(Math.max(i, 0), state.items.length - 1);
   const li = state.items[state.act]; if (li) { li.classList.add('act'); li.scrollIntoView({ block: 'nearest' }); }
  }
  render('');
  if (inp) inp.oninput = () => render(inp.value);
  pop.onkeydown = e => {
   if (e.key === 'ArrowDown') { setAct(state.act + 1); e.preventDefault(); }
   else if (e.key === 'ArrowUp') { setAct(state.act - 1); e.preventDefault(); }
   else if (e.key === 'Enter') { const li = state.items[state.act]; if (li && !li._opt.disabled) choose(sel, li._opt.value); e.preventDefault(); }
   else if (e.key === 'Escape') { close(true); e.preventDefault(); }
   else if (e.key === 'Tab') close(false);
  };
  document.body.appendChild(pop);
  // place under the button (or above it when there is no room), at least as wide as the button
  const below = innerHeight - r.bottom - 12, above = r.top - 12, up = below < 240 && above > below;
  const maxH = Math.min(360, up ? above : below);
  pop.style.minWidth = Math.max(200, r.width) + 'px'; pop.style.maxWidth = Math.max(r.width, Math.min(420, innerWidth - 24)) + 'px';
  ul.style.maxHeight = (maxH - (inp ? 52 : 8)) + 'px';
  const w = pop.offsetWidth; let left = r.right - w; if (left < 12) left = Math.min(r.left, innerWidth - w - 12); pop.style.left = Math.max(12, left) + 'px';
  if (up) pop.style.bottom = (innerHeight - r.top + 6) + 'px'; else pop.style.top = (r.bottom + 6) + 'px';
  wrap.classList.add('open'); openState = state;
  if (inp) inp.focus(); else { pop.tabIndex = -1; pop.focus(); }
 }
 document.addEventListener('mousedown', e => { if (openState && !openState.pop.contains(e.target) && !openState.wrap.contains(e.target)) close(false); }, true);
 addEventListener('resize', () => close(false));
 document.addEventListener('scroll', e => { if (openState && !openState.pop.contains(e.target)) close(false); }, true);

 function enhance(sel) {
  if (sel._nv || sel.multiple || sel.size > 1 || sel.closest('.nvsel') || sel.dataset.native != null) return;
  const cs = getComputedStyle(sel), wrap = document.createElement('div'), btn = document.createElement('button');
  wrap.className = 'nvsel'; btn.type = 'button'; btn.innerHTML = '<span class="lb"></span><span class="ar" aria-hidden="true"></span>';
  btn.setAttribute('aria-haspopup', 'listbox'); if (sel.getAttribute('aria-label') || sel.title) btn.setAttribute('aria-label', sel.getAttribute('aria-label') || sel.title);
  // keep the select's footprint: flex share, width, and a compact size when the original was compact
  const grows = parseFloat(cs.flexGrow) > 0, pw = sel.parentElement ? sel.parentElement.clientWidth : 0;
  if (grows) wrap.style.flex = cs.flex;                                  // shares a flex row
  else if (!sel.offsetWidth || sel.offsetWidth >= pw - 4) wrap.style.width = '100%';   // hidden now, or full width
  else wrap.style.width = sel.offsetWidth + 'px';                         // a compact control keeps its size
  if (parseFloat(cs.fontSize) < 13.5) { btn.style.fontSize = cs.fontSize; btn.style.padding = '5px 8px'; btn.style.borderRadius = '8px'; }
  if (cs.marginInlineStart && cs.marginInlineStart !== '0px') wrap.style.marginInlineStart = cs.marginInlineStart;
  wrap.appendChild(btn); sel.after(wrap); sel.style.display = 'none';
  sel._nv = { wrap, btn };
  btn.onclick = () => open(sel);
  btn.onkeydown = e => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { open(sel); e.preventDefault(); } };
  sel.addEventListener('change', () => label(sel));
  new MutationObserver(() => label(sel)).observe(sel, { childList: true, subtree: true, attributes: true });
  label(sel);
 }
 // programmatic changes (sel.value = …, selectedIndex = …) refresh the label too
 for (const prop of ['value', 'selectedIndex']) {
  const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
  Object.defineProperty(HTMLSelectElement.prototype, prop, { configurable: true, enumerable: d.enumerable, get: d.get,
   set(v) { d.set.call(this, v); if (this._nv) label(this); } });
 }
 const scan = root => { if (root.tagName === 'SELECT') enhance(root); else if (root.querySelectorAll) root.querySelectorAll('select').forEach(enhance); };
 const start = () => {
  scan(document.body);
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); }).observe(document.body, { childList: true, subtree: true });
 };
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
 window.WW2NvSelect = { enhance, close };
})();
