/**
 * סרגל הזמן — מסלול A.
 *
 * אינו מחוון פשוט: מתחתיו היסטוגרמת פעילות שמראה היכן נמצאות נקודות
 * השיא, ופסי סימון לחלונות הרזולוציה הגבוהה. המשתמש רואה מיד לאן כדאי
 * לגרור, במקום לגרור באקראי ולקוות.
 *
 * הרכיב אינו יודע מה ההיסטוגרמה מודדת — הוא מקבל מערך מספרים.
 */

import { formatDate } from '../config.js?v=map-channel-19';

const MILESTONES = [
  ['1937-07-07', 'פרוץ המלחמה בסין'],
  ['1939-09-01', 'הפלישה לפולין'],
  ['1940-05-10', 'המערכה במערב'],
  ['1940-07-10', 'הקרב על בריטניה'],
  ['1941-06-22', 'מבצע ברברוסה'],
  ['1941-12-07', 'פרל הארבור'],
  ['1942-06-04', 'קרב מידוויי'],
  ['1942-08-23', 'קרב סטלינגרד'],
  ['1942-10-23', 'אל־עלמיין'],
  ['1943-07-05', 'קרב קורסק'],
  ['1943-09-03', 'הפלישה לאיטליה'],
  ['1944-06-06', 'נחיתת נורמנדי'],
  ['1944-08-25', 'שחרור פריז'],
  ['1944-12-16', 'קרב הבליטה'],
  ['1945-01-27', 'שחרור אושוויץ'],
  ['1945-05-08', 'יום הניצחון באירופה'],
  ['1945-08-15', 'כניעת יפן'],
];

export class Timeline {
  constructor(root, engine, { onScrub } = {}) {
    this.root = root;
    this.engine = engine;
    this.onScrub = onScrub;
    this.histogram = null;
    this._build();
    engine.subscribe(() => this._sync());
  }

  _build() {
    const r = this.root;
    r.replaceChildren();

    const bar = document.createElement('div');
    bar.className = 'tl-bar';

    // ── כפתורי שליטה ──
    const controls = document.createElement('div');
    controls.className = 'tl-controls';

    this.playBtn = btn('▶', 'הפעלה', () => this.engine.toggle());
    this.playBtn.classList.add('tl-play');
    controls.appendChild(btn('◀', 'צעד אחורה', () => this.engine.advance(-1)));
    controls.appendChild(this.playBtn);
    controls.appendChild(btn('▶', 'צעד קדימה', () => this.engine.advance(1)));

    this.speedBtn = btn('×1', 'מהירות', () => this._cycleSpeed());
    this.speedBtn.classList.add('tl-speed');
    controls.appendChild(this.speedBtn);
    bar.appendChild(controls);

    // ── התאריך ──
    this.dateEl = document.createElement('div');
    this.dateEl.className = 'tl-date';
    this.dateEl.setAttribute('aria-live', 'polite');
    bar.appendChild(this.dateEl);

    // ── הרצועה ──
    const track = document.createElement('div');
    track.className = 'tl-track';
    track.setAttribute('role', 'slider');
    track.setAttribute('tabindex', '0');
    track.setAttribute('aria-label', 'ציר הזמן');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'tl-canvas';
    track.appendChild(this.canvas);

    this.windowsEl = document.createElement('div');
    this.windowsEl.className = 'tl-windows';
    track.appendChild(this.windowsEl);

    this.yearsEl = document.createElement('div');
    this.yearsEl.className = 'tl-years';
    track.appendChild(this.yearsEl);

    this.milestonesEl = document.createElement('div');
    this.milestonesEl.className = 'tl-milestones';
    track.appendChild(this.milestonesEl);

    this.handle = document.createElement('div');
    this.handle.className = 'tl-handle';
    track.appendChild(this.handle);

    this.track = track;
    bar.appendChild(track);

    this.badge = document.createElement('div');
    this.badge.className = 'tl-badge';
    bar.appendChild(this.badge);

    r.appendChild(bar);

    this._renderWindows();
    this._renderYears();
    this._renderMilestones();
    this._attachScrub();
    this._attachKeys();
    new ResizeObserver(() => this._drawHistogram()).observe(track);
  }

  _position(day) {
    return ((day - this.engine.minDay) / (this.engine.maxDay - this.engine.minDay)) * 100;
  }

  _renderYears() {
    this.yearsEl.replaceChildren();
    const minYear = new Date(this.engine.epoch.getTime() + this.engine.minDay * 86400000).getUTCFullYear();
    const maxYear = new Date(this.engine.epoch.getTime() + this.engine.maxDay * 86400000).getUTCFullYear();
    for (let year = minYear; year <= maxYear; year += 1) {
      const day = Math.round((Date.UTC(year, 0, 1) - this.engine.epoch.getTime()) / 86400000);
      const tick = document.createElement('span');
      tick.style.right = `${this._position(day)}%`;
      tick.textContent = year;
      this.yearsEl.appendChild(tick);
    }
  }

  _renderMilestones() {
    this.milestonesEl.replaceChildren();
    for (const [iso, label] of MILESTONES) {
      const day = Math.round((Date.parse(`${iso}T00:00:00Z`) - this.engine.epoch.getTime()) / 86400000);
      if (day < this.engine.minDay || day > this.engine.maxDay) continue;
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'tl-milestone';
      marker.style.right = `${this._position(day)}%`;
      marker.title = `${label} · ${iso}`;
      marker.setAttribute('aria-label', `${label}, ${iso}`);
      marker.onclick = (event) => {
        event.stopPropagation();
        this.engine.pause();
        this.engine.setDay(day, 'milestone');
        this.onScrub?.(day);
      };
      this.milestonesEl.appendChild(marker);
    }
  }

  _renderWindows() {
    const { minDay, maxDay, windows } = this.engine;
    const span = maxDay - minDay;
    this.windowsEl.replaceChildren();
    for (const w of windows) {
      const seg = document.createElement('div');
      seg.className = 'tl-window';
      seg.style.right = `${((w.startDay - minDay) / span) * 100}%`;
      seg.style.width = `${((w.endDay - w.startDay) / span) * 100}%`;
      seg.title = `${w.label} — רזולוציה ${w.step === 1 ? 'יומית' : 'שבועית'}`;
      this.windowsEl.appendChild(seg);
    }
  }

  /** @param {number[]} values — עוצמת פעילות לכל חודש בציר. */
  setHistogram(values) {
    this.histogram = values;
    this._drawHistogram();
  }

  _drawHistogram() {
    const c = this.canvas;
    const rect = this.track.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!this.histogram || !this.histogram.length) return;

    const max = Math.max(...this.histogram) || 1;
    const bw = rect.width / this.histogram.length;
    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    gradient.addColorStop(0, 'rgba(174, 64, 44, .72)');
    gradient.addColorStop(1, 'rgba(44, 103, 135, .28)');
    ctx.fillStyle = gradient;
    this.histogram.forEach((v, i) => {
      const h = (v / max) * (rect.height - 4);
      // ציר הזמן מוצג מימין לשמאל בהתאם לכיווניות הממשק
      const x = rect.width - (i + 1) * bw;
      ctx.fillRect(x, rect.height - h, Math.max(bw - 0.5, 0.5), h);
    });
  }

  _attachScrub() {
    let dragging = false;
    const posToDay = (clientX) => {
      const r = this.track.getBoundingClientRect();
      // RTL: הקצה הימני הוא ההתחלה
      const p = 1 - (clientX - r.left) / r.width;
      return this.engine.dayFromProgress(Math.max(0, Math.min(1, p)));
    };
    const apply = (e) => {
      const p = e.touches ? e.touches[0] : e;
      this.engine.setDay(posToDay(p.clientX), 'scrub');
      this.onScrub?.(this.engine.day);
    };
    const down = (e) => {
      dragging = true;
      this.engine.pause();
      apply(e);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', up);
    };
    const move = (e) => { if (dragging) { e.preventDefault(); apply(e); } };
    const up = () => {
      dragging = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    this.track.addEventListener('mousedown', down);
    this.track.addEventListener('touchstart', down, { passive: true });
  }

  _attachKeys() {
    this.track.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowLeft') { this.engine.advance(1); e.preventDefault(); }
      else if (k === 'ArrowRight') { this.engine.advance(-1); e.preventDefault(); }
      else if (k === ' ') { this.engine.toggle(); e.preventDefault(); }
      else if (k === 'Home') { this.engine.setDay(this.engine.minDay); e.preventDefault(); }
      else if (k === 'End') { this.engine.setDay(this.engine.maxDay); e.preventDefault(); }
    });
  }

  _cycleSpeed() {
    const order = [0.25, 0.5, 1, 2, 4];
    const i = order.indexOf(this.engine.speed);
    const next = order[(i + 1) % order.length];
    this.engine.setSpeed(next);
    this.speedBtn.textContent = `×${next}`;
  }

  _sync() {
    const e = this.engine;
    this.dateEl.textContent = formatDate(e.date, e.step);
    this.handle.style.right = `${e.progress * 100}%`;
    this.playBtn.textContent = e.playing ? '❚❚' : '▶';
    this.playBtn.setAttribute('aria-label', e.playing ? 'השהיה' : 'הפעלה');
    this.track.setAttribute('aria-valuenow', String(e.day));
    this.track.setAttribute('aria-valuetext', formatDate(e.date, e.step));

    const w = e.activeWindow;
    const dense = e.activityDensity > 4;
    if (w || dense) {
      const parts = [];
      if (w) parts.push(`${w.label} · רזולוציה ${w.step === 1 ? 'יומית' : 'שבועית'}`);
      if (dense) parts.push('⏳ תקופה עתירת אירועים · הנגן הואט');
      this.badge.textContent = parts.join(' · ');
      this.badge.classList.add('on');
    } else {
      this.badge.textContent = '';
      this.badge.classList.remove('on');
    }
  }
}

function btn(text, label, onClick) {
  const b = document.createElement('button');
  b.className = 'tl-btn';
  b.textContent = text;
  b.setAttribute('aria-label', label);
  b.onclick = onClick;
  return b;
}
