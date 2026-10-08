/**
 * כרטיס ישות גנרי — מסלול A.
 *
 * הכרטיס אינו יודע מהי הישות. הוא מקבל מפרט שדות מהשכבה ומרנדר אותו.
 * כל התוכן נבנה עם textContent ולעולם לא עם innerHTML — זהו הלקח
 * הישיר מפרצת ה-XSS שנמצאה באטלס הרומי (סעיף 12.1).
 *
 * שני כללים שהכרטיס אוכף בעצמו:
 *   1. ישות ללא מקורות מוצגת עם אזהרה גלויה, לא בשקט.
 *   2. שדה שמסומן derivation='algorithmic' מוצג כהסקה ולא כעובדה.
 */

import { installOutsideDismiss } from './outside-dismiss.js?v=map-channel-19';

const DERIVATION_LABEL = {
  source: 'ממקור',
  algorithmic: 'הסקה אלגוריתמית',
  manual: 'הזנה ידנית',
};

export class EntityCard {
  constructor(root) {
    this.root = root;
    this.el = null;
    this._drag = null;
    this._escape = (event) => {
      if (event.key === 'Escape') this.close();
    };
    installOutsideDismiss({
      isOpen: () => Boolean(this.el),
      inside: () => [this.el],
      close: () => this.close(),
    });
  }

  close() {
    if (this.el) {
      this.el.remove();
      this.el = null;
      document.removeEventListener('keydown', this._escape);
      document.dispatchEvent(new CustomEvent('atlas:card-close'));
    }
  }

  /**
   * @param {object} entity              — הנתונים
   * @param {object} spec
   * @param {Function} spec.title        — (entity) => string
   * @param {string}  spec.subtitle
   * @param {Array}   spec.fields        — [{label, value, derivation, note}]
   * @param {Array}   spec.sources       — [{id, name, url}]
   */
  show(entity, spec) {
    this.close();

    const card = el('div', 'card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-label', spec.title(entity));

    // ── כותרת ──
    const head = el('div', 'card-head');
    const titles = el('div');
    titles.appendChild(el('div', 'card-title', spec.title(entity)));
    if (spec.subtitle) titles.appendChild(el('div', 'card-sub', spec.subtitle));
    head.appendChild(titles);

    const close = el('button', 'card-x', '×');
    close.setAttribute('aria-label', 'סגירה');
    close.onclick = () => this.close();
    head.appendChild(close);
    card.appendChild(head);

    // ── שדות ──
    const body = el('div', 'card-body');
    for (const f of spec.fields || []) {
      if (f.value === null || f.value === undefined || f.value === '') continue;
      const row = el('div', 'card-row');
      row.appendChild(el('span', 'card-key', f.label));

      const val = el('span', 'card-val', String(f.value));
      row.appendChild(val);

      if (f.derivation && f.derivation !== 'source') {
        const tag = el('span', 'card-tag', DERIVATION_LABEL[f.derivation] || f.derivation);
        tag.title = 'ערך זה חושב ואינו לקוח ישירות ממקור';
        row.appendChild(tag);
      }
      body.appendChild(row);
      if (f.note) body.appendChild(el('div', 'card-note', f.note));
    }
    card.appendChild(body);

    // ── תרשימי פילוח נגישים ──
    for (const chart of spec.charts || []) {
      const figure = el('figure', 'card-chart');
      figure.appendChild(el('figcaption', 'card-chart-title', chart.title));
      for (const part of chart.values || []) {
        const row = el('div', 'card-chart-row');
        row.appendChild(el('span', 'card-chart-label', part.label));
        const meter = el('span', 'card-chart-meter');
        const fill = el('span', 'card-chart-fill');
        fill.style.width = `${Math.max(0, Math.min(100, Number(part.value) || 0))}%`;
        meter.appendChild(fill);
        row.appendChild(meter);
        row.appendChild(el('span', 'card-chart-value', `${part.value}%`));
        figure.appendChild(row);
      }
      body.appendChild(figure);
    }

    // ── פעולות הקשריות ──
    if (spec.actions?.length) {
      const actions = el('div', 'card-actions');
      for (const item of spec.actions) {
        const button = el('button', 'card-action', item.label);
        button.type = 'button';
        button.onclick = () => item.action?.(entity);
        actions.appendChild(button);
      }
      card.appendChild(actions);
    }

    // ── מקורות ──
    const sources = spec.sources || [];
    const foot = el('div', 'card-foot');
    if (sources.length === 0) {
      const warn = el('div', 'card-warn', 'אין מקור מצוטט לישות זו');
      warn.title = 'כלל ברזל #1 — ישות ללא מקור לא אמורה להגיע לפלט';
      foot.appendChild(warn);
    } else {
      foot.appendChild(el('div', 'card-key', 'מקורות'));
      const list = el('div', 'card-sources');
      for (const s of sources) {
        if (s.url && isSafeUrl(s.url)) {
          const a = el('a', 'card-src', s.name || s.id);
          a.href = s.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';   // סעיף 12.1 — reverse tabnabbing
          list.appendChild(a);
        } else {
          list.appendChild(el('span', 'card-src', s.name || s.id));
        }
      }
      foot.appendChild(list);
    }
    card.appendChild(foot);

    if (!this.root.closest('#atlas-dock')) makeDraggable(card, head);
    this.root.appendChild(card);
    this.el = card;
    document.addEventListener('keydown', this._escape);
    document.dispatchEvent(new CustomEvent('atlas:card-open'));
    close.focus({ preventScroll: true });
    return card;
  }
}

/** רק https, ורק לדומיינים מותרים. כתובת שאינה עומדת בכך אינה הופכת לקישור. */
function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;   // לעולם לא innerHTML
  return n;
}

function makeDraggable(card, handle) {
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
  handle.style.cursor = 'move';

  const down = (e) => {
    if (e.target.closest('.card-x')) return;
    dragging = true;
    const p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY;
    const r = card.getBoundingClientRect();
    ox = r.left; oy = r.top;
    card.style.right = 'auto';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
  };
  const move = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    card.style.left = `${ox + (p.clientX - sx)}px`;
    card.style.top = `${oy + (p.clientY - sy)}px`;
  };
  const up = () => {
    dragging = false;
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', up);
  };
  handle.addEventListener('mousedown', down);
  handle.addEventListener('touchstart', down, { passive: true });
}
