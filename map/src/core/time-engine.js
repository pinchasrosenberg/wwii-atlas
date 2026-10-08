/**
 * מנוע הזמן — מסלול A.
 *
 * הזמן מיוצג כמספר שלם: ימים מאז 1937-01-01. לא Date, לא ISO string.
 * זו לא קפריזה — זה מה שמאפשר לשלוח את הערך היישר ל-shader דרך
 * DataFilterExtension של deck.gl, ולסנן עשרות אלפי ישויות על ה-GPU
 * במקום בלולאת JavaScript. זה ההבדל בין 60 FPS ל-5 FPS.
 *
 * המנוע אינו יודע דבר על מלחמת העולם השנייה. הוא מקבל טווח, צעד,
 * ורשימת חלונות רזולוציה, ומנהל מספר.
 */

export const MS_PER_DAY = 86400000;

/** ממיר תאריך למספר ימים מאז האפוק. */
export function toDayIndex(date, epoch) {
  return Math.round((date.getTime() - epoch.getTime()) / MS_PER_DAY);
}

/** ממיר מספר ימים בחזרה לאובייקט Date. */
export function fromDayIndex(day, epoch) {
  return new Date(epoch.getTime() + day * MS_PER_DAY);
}

export class TimeEngine {
  /**
   * @param {object} opts
   * @param {Date}   opts.epoch          — יום 0
   * @param {Date}   opts.start          — תחילת הציר
   * @param {Date}   opts.end            — סוף הציר
   * @param {number} opts.defaultStep    — צעד ברירת מחדל בימים
   * @param {Array}  opts.windows        — [{key,label,start,end,step}] חלונות רזולוציה גבוהה
   */
  constructor({ epoch, start, end, defaultStep = 30, windows = [] }) {
    this.epoch = epoch;
    this.minDay = toDayIndex(start, epoch);
    this.maxDay = toDayIndex(end, epoch);
    this.defaultStep = defaultStep;

    // ממוין לפי התחלה — חיפוש דטרמיניסטי
    this.windows = windows
      .map((w) => ({
        ...w,
        startDay: toDayIndex(w.start, epoch),
        endDay: toDayIndex(w.end, epoch),
      }))
      .sort((a, b) => a.startDay - b.startDay);

    this._day = this.minDay;
    this._playing = false;
    this._speed = 1;
    this._raf = null;
    this._lastFrame = 0;
    this._listeners = new Set();
    this._activityDensity = null;
    this._activityMinDay = this.minDay;
  }

  // ── מצב ────────────────────────────────────────────────────────────────
  get day() { return this._day; }
  get date() { return fromDayIndex(this._day, this.epoch); }
  get playing() { return this._playing; }
  get speed() { return this._speed; }
  get activityDensity() {
    if (!this._activityDensity) return 0;
    return this._activityDensity[Math.round(this._day - this._activityMinDay)] || 0;
  }

  /** החלון הפעיל בתאריך הנוכחי, אם יש. */
  get activeWindow() {
    return this.windows.find((w) => this._day >= w.startDay && this._day <= w.endDay) || null;
  }

  /** הצעד החל כרגע — יומי/שבועי בתוך חלון, חודשי מחוץ לו. */
  get step() {
    const w = this.activeWindow;
    return w ? w.step : this.defaultStep;
  }

  // ── שליטה ──────────────────────────────────────────────────────────────
  setDay(day, reason = 'set') {
    const clamped = Math.max(this.minDay, Math.min(this.maxDay, Math.round(day)));
    if (clamped === this._day) return;
    const prevWindow = this.activeWindow;
    this._day = clamped;
    const nextWindow = this.activeWindow;
    this._emit({
      day: clamped,
      reason,
      windowChanged: prevWindow?.key !== nextWindow?.key,
      window: nextWindow,
    });
  }

  setDate(date) { this.setDay(toDayIndex(date, this.epoch)); }

  advance(steps = 1) { this.setDay(this._day + this.step * steps, 'advance'); }

  play() {
    if (this._playing) return;
    this._playing = true;
    this._lastFrame = performance.now();
    const tick = (now) => {
      if (!this._playing) return;
      const elapsed = now - this._lastFrame;
      // קצב הבסיס: חודש לשנייה. הצעד עצמו משתנה לפי החלון, כך שבתוך
      // מבצע מפתח התנועה מאטה אוטומטית ורואים את הפרטים.
      // בקובץ האטלס המקורי הנגן האט עד פי ארבע סביב ריכוזי
      // קרבות, הפצצות, גירושים והטבעות. האטה זו נוספת לרזולוציה
      // היומית/שבועית, כדי שאירוע עשיר לא יחלוף כהבזק.
      const slowdown = Math.min(this.activityDensity / 4, 3);
      const msPerStep = ((1000 * this.step) / (this.defaultStep * this._speed)) * (1 + slowdown);
      if (elapsed >= msPerStep) {
        this._lastFrame = now;
        if (this._day >= this.maxDay) { this.pause(); return; }
        this.advance(1);
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
    this._emit({ day: this._day, reason: 'play' });
  }

  pause() {
    if (!this._playing) return;
    this._playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._emit({ day: this._day, reason: 'pause' });
  }

  toggle() { this._playing ? this.pause() : this.play(); }

  setSpeed(mult) {
    this._speed = Math.max(0.25, Math.min(4, mult));
    this._emit({ day: this._day, reason: 'speed' });
  }

  /** עוצמת אירועים לכל יום, להאטה אדפטיבית של הנגן. */
  setActivityDensity(values, minDay = this.minDay) {
    this._activityDensity = values;
    this._activityMinDay = minDay;
    this._emit({ day: this._day, reason: 'density' });
  }

  // ── מנויים ─────────────────────────────────────────────────────────────
  subscribe(fn) {
    this._listeners.add(fn);
    fn({ day: this._day, reason: 'init', window: this.activeWindow });
    return () => this._listeners.delete(fn);
  }

  _emit(payload) {
    for (const fn of this._listeners) fn(payload);
  }

  /** מיקום יחסי על הציר, 0..1 — לרינדור הסרגל. */
  get progress() {
    return (this._day - this.minDay) / (this.maxDay - this.minDay);
  }

  dayFromProgress(p) {
    return this.minDay + p * (this.maxDay - this.minDay);
  }
}
