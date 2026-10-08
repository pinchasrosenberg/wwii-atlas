/**
 * קישור עומק — מסלול A, דרישה FR-08.
 *
 * כתובת ה-URL משחזרת מצב מדויק: תאריך, שכבות פעילות, מיקום ומרחק המצלמה.
 * זו דרישת חובה ולא נוחות — בלעדיה אי אפשר לשלוח לכיתה קישור לרגע מסוים,
 * וזה שימוש הליבה של הקהל החינוכי.
 *
 * הפורמט קצר בכוונה: ‎#d=2620&l=demo&v=10.5,50.2,4.2
 * סצנה שהצ׳אט ביקש מוסיפה ‎&scene=scn_… כך שרענון או שיתוף
 * משחזרים את אותה סצנה בדיוק.
 */

export function readState() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const view = (h.get('v') || '').split(',').map(Number);
  return {
    day: h.has('d') ? Number(h.get('d')) : null,
    layers: h.get('l'),
    mode: h.get('m') === 'relations' ? 'relations' : 'overview',
    selected: h.get('s') || null,
    scene: h.get('scene') || null,
    view: view.length === 3 && view.every((n) => Number.isFinite(n))
      ? { longitude: view[0], latitude: view[1], zoom: view[2] }
      : null,
  };
}

export function writeState({ day, layers, view, mode, selected, scene }, { replace = true } = {}) {
  const h = new URLSearchParams();
  if (Number.isFinite(day)) h.set('d', String(Math.round(day)));
  if (layers) h.set('l', layers);
  if (mode && mode !== 'overview') h.set('m', mode);
  if (selected) h.set('s', selected);
  if (scene) h.set('scene', scene);
  if (view) {
    h.set('v', [
      view.longitude.toFixed(3),
      view.latitude.toFixed(3),
      view.zoom.toFixed(1),
    ].join(','));
  }
  const url = `${location.pathname}${location.search}#${h.toString()}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}

/** דחיסת עדכוני URL — כתיבה בכל פריים של סרגל הזמן מציפה את ההיסטוריה. */
export function throttleWriter(ms = 400) {
  let pending = null;
  let timer = null;
  return (state) => {
    pending = state;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (pending) { writeState(pending); pending = null; }
    }, ms);
  };
}
