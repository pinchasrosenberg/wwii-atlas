/**
 * זיהוי דרג ביצועים והידרדרות מבוקרת — מסלול A, סעיף 7.8 באפיון.
 *
 * הזיהוי מבוסס על יכולת בפועל ולא על user agent, שאינו מהימן.
 * העיקרון: ההידרדרות פוגעת באפקטים, לעולם לא בתוכן. במצב מינימלי
 * המשתמש רואה את אותם נתיבים ואותן ישויות — פשוט בלי תנועה.
 */

export const TIER = {
  FULL: 'full',
  REDUCED: 'reduced',
  MINIMAL: 'minimal',
};

export const TIER_LABEL = {
  [TIER.FULL]: 'מלא',
  [TIER.REDUCED]: 'מופחת',
  [TIER.MINIMAL]: 'מינימלי',
};

/** מגבלות לכל דרג. deck.gl מקבל מכאן החלטות, לא מה-UI. */
export const TIER_CAPS = {
  [TIER.FULL]: { maxLayers: 12, animatedTrips: true, maxPoints: 600000 },
  [TIER.REDUCED]: { maxLayers: 7, animatedTrips: false, maxPoints: 180000 },
  [TIER.MINIMAL]: { maxLayers: 4, animatedTrips: false, maxPoints: 50000 },
};

function probeWebGL() {
  const canvas = document.createElement('canvas');
  const gl2 = canvas.getContext('webgl2');
  const gl = gl2 || canvas.getContext('webgl');
  if (!gl) return { version: 0 };

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
  const info = {
    version: gl2 ? 2 : 1,
    renderer: String(renderer || ''),
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxRenderbuffer: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
  };

  // בדיקת הקצאה בפועל: נסיון להקצות טקסטורה גדולה. מכשירים רבים
  // מדווחים MAX_TEXTURE_SIZE נדיב ואז נכשלים בהקצאה אמיתית.
  try {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2048, 2048, 0, gl.RGBA,
                  gl.UNSIGNED_BYTE, null);
    info.allocOk = gl.getError() === gl.NO_ERROR;
    gl.deleteTexture(tex);
  } catch {
    info.allocOk = false;
  }

  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  return info;
}

export function detectTier() {
  const gpu = probeWebGL();

  if (gpu.version === 0) {
    return { tier: TIER.MINIMAL, reason: 'אין תמיכה ב-WebGL', gpu };
  }
  if (gpu.version === 1 || !gpu.allocOk) {
    return { tier: TIER.MINIMAL, reason: 'WebGL1 בלבד או כשל הקצאה', gpu };
  }

  const soft = /swiftshader|llvmpipe|software|basic render/i.test(gpu.renderer);
  if (soft) {
    return { tier: TIER.MINIMAL, reason: 'רינדור תוכנה', gpu };
  }

  const smallTexture = gpu.maxTexture < 8192;
  const coarseMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
  const touchOnly = matchMedia('(pointer: coarse)').matches;

  if (smallTexture || coarseMemory || touchOnly) {
    return {
      tier: TIER.REDUCED,
      reason: smallTexture ? 'טקסטורה מרבית מוגבלת'
            : coarseMemory ? 'זיכרון מכשיר נמוך'
            : 'מכשיר מגע',
      gpu,
    };
  }

  return { tier: TIER.FULL, reason: 'יכולת מלאה', gpu };
}

/**
 * ‏מנטר קצב פריימים ומוריד דרג אוטומטית.
 *
 * ⚠️ **חלון מוסתר אינו מכונה איטית**
 * ‏‏`requestAnimationFrame` נחנק כמעט לאפס כשהחלון אינו גלוי. הגרסה
 * ‏הראשונה ספרה את החלון הזה כמו כל חלון אחר, ולכן מספיק היה לעבור
 * ‏לאפליקציה אחרת לשתי שניות כדי שהמדידה תראה ‏0 FPS ותוריד דרג —
 * ‏ופעמיים ברצף הורידו את האטלס עד ‏minimal, שם פאנל השכבות כבר מסרב
 * ‏להדליק שכבות ואומר ״הגעת למגבלת השכבות״. נמדד כאן על ‏M5 עם
 * ‏‏WebGL2 ו-32GB: המכונה מדווחת `full`, והמפה השפילה את עצמה בגלל
 * ‏שהמשתמש לא הסתכל.
 *
 * ‏שלוש הגנות: לא דוגמים כשמוסתר, זורקים חלון שנחנק (הרבה זמן, מעט
 * ‏פריימים), ומחזירים דרג כשהקצב חוזר להיות בריא לאורך זמן — כי
 * ‏ירידה חד-כיוונית הופכת גמגום רגעי לנזק לכל הסשן.
 */
export class PerfMonitor {
  constructor({
    onDowngrade, onRecover, onSample,
    floorFps = 20, sustainMs = 2000,
    recoverFps = 50, recoverMs = 5000,
    sampleMs = 500, throttleGapMs = 900,
    isHidden = () => (typeof document !== 'undefined' && document.hidden === true),
    schedule = (fn) => requestAnimationFrame(fn),
    cancel = (id) => cancelAnimationFrame(id),
  } = {}) {
    this.onDowngrade = onDowngrade;
    this.onRecover = onRecover;
    this.onSample = onSample;
    this.floorFps = floorFps;
    this.sustainMs = sustainMs;
    this.recoverFps = recoverFps;
    this.recoverMs = recoverMs;
    this.sampleMs = sampleMs;
    this.throttleGapMs = throttleGapMs;
    this.isHidden = isHidden;
    this._schedule = schedule;
    this._cancel = cancel;
    this.fps = 60;
    this._frames = 0;
    this._windowStart = 0;
    this._lowSince = null;
    this._highSince = null;
    this._lastFrame = null;
    this._maxGap = 0;
    this._raf = null;
    this._stopped = false;
    this._detach = null;
  }

  /** ‏פותח חלון מדידה חדש. כל חזרה מהסתרה מתחילה מדף נקי. */
  _reset(now) {
    this._windowStart = now;
    this._frames = 0;
    this._lowSince = null;
    this._highSince = null;
    this._lastFrame = null;
    this._maxGap = 0;
  }

  /** ‏פריים אחד. נפרד מ-tick כדי שאפשר יהיה לבדוק בלי דפדפן. */
  frame(now) {
    if (this.isHidden()) {
      this._reset(now);
      return;
    }
    if (this._lastFrame !== null) {
      this._maxGap = Math.max(this._maxGap, now - this._lastFrame);
    }
    this._lastFrame = now;
    this._frames += 1;
    const elapsed = now - this._windowStart;
    if (elapsed < this.sampleMs) return;

    // ⚠️ ‏מה שמבדיל דפדפן שנחנק ממכונה איטית הוא **המרווח בין פריימים**,
    // ‏לא הקצב הממוצע. מכונה שמציירת ב-8 FPS נותנת מרווחים של 125 מ״ש;
    // ‏דפדפן שהפסיק לצייר נותן מרווח של שנייה ומעלה. ממוצע לבדו אינו
    // ‏יודע להבחין ביניהם, ולכן חלון עם מרווח ענק נזרק ולא נספר.
    if (this._maxGap >= this.throttleGapMs) {
      this._reset(now);
      return;
    }

    this.fps = Math.round((this._frames * 1000) / elapsed);
    this._frames = 0;
    this._maxGap = 0;
    this._windowStart = now;
    this.onSample?.(this.fps);

    if (this.fps < this.floorFps) {
      this._highSince = null;
      if (this._lowSince === null) this._lowSince = now;
      else if (now - this._lowSince >= this.sustainMs) {
        this._lowSince = null;
        this.onDowngrade?.(this.fps);
      }
      return;
    }

    this._lowSince = null;
    if (this.fps >= this.recoverFps) {
      if (this._highSince === null) this._highSince = now;
      else if (now - this._highSince >= this.recoverMs) {
        this._highSince = null;
        this.onRecover?.(this.fps);
      }
    } else {
      this._highSince = null;
    }
  }

  start() {
    this._reset(typeof performance !== 'undefined' ? performance.now() : 0);
    if (typeof document !== 'undefined' && document.addEventListener) {
      const onVisibility = () => {
        this._reset(typeof performance !== 'undefined' ? performance.now() : 0);
      };
      document.addEventListener('visibilitychange', onVisibility);
      this._detach = () => document.removeEventListener('visibilitychange', onVisibility);
    }
    const tick = (now) => {
      if (this._stopped) return;
      this.frame(now);
      this._raf = this._schedule(tick);
    };
    this._raf = this._schedule(tick);
  }

  stop() {
    this._stopped = true;
    if (this._raf) this._cancel(this._raf);
    this._detach?.();
    this._detach = null;
  }
}


/** ‏דרג אחד למעלה. אף פעם לא מעל התקרה שזוהתה למכונה הזאת. */
export function nextTierUp(tier, ceiling = TIER.FULL) {
  const order = [TIER.MINIMAL, TIER.REDUCED, TIER.FULL];
  const at = order.indexOf(tier);
  const cap = order.indexOf(ceiling);
  if (at < 0 || cap < 0) return tier;
  return order[Math.min(at + 1, cap)];
}


export function nextTierDown(tier) {
  if (tier === TIER.FULL) return TIER.REDUCED;
  if (tier === TIER.REDUCED) return TIER.MINIMAL;
  return TIER.MINIMAL;
}

/**
 * טיפול באובדן קונטקסט גרפי — במקום מסך לבן, ירידת דרג ושחזור.
 */
export function attachContextLossHandler(canvas, { onLost, onRestored }) {
  if (!canvas) return () => {};
  const lost = (e) => { e.preventDefault(); onLost?.(); };
  const restored = () => onRestored?.();
  canvas.addEventListener('webglcontextlost', lost, false);
  canvas.addEventListener('webglcontextrestored', restored, false);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}
