/**
 * ‏בחירת מצולע על המפה.
 *
 * ‏המודול הזה אינו יודע דבר על מלחמת העולם השנייה ואינו קורא לשרת בעצמו:
 * ‏הוא אוסף קודקודים ומחזיר טבעת סגורה. מי שמסכם מה יש בפנים הוא השרת,
 * ‏כדי שהסיכום יהיה על הסצנה ולא על מה שבמקרה נכנס למסך.
 *
 * ‏מצב ציור פעיל חוסם את גרירת המפה, אחרת כל לחיצה גם מזיזה את הרקע.
 */

export const MIN_VERTICES = 3;

export function createPolygonSelect({ onChange, onComplete, onCancel } = {}) {
  let active = false;
  let points = [];
  let hover = null;

  function reset() {
    points = [];
    hover = null;
  }

  return {
    get active() { return active; },
    get points() { return [...points]; },
    get hover() { return hover; },

    /** הטבעת כפי שהיא נשלחת לשרת: סגורה, בלי כפילות בקצה. */
    ring() { return points.length >= MIN_VERTICES ? points.map((p) => [...p]) : null; },

    start() {
      active = true;
      reset();
      onChange?.(this);
      return this;
    },

    cancel() {
      if (!active) return false;
      active = false;
      reset();
      onCancel?.();
      onChange?.(this);
      return true;
    },

    /** קליק על המפה. מחזיר true אם המצולע נסגר בעקבותיו. */
    addPoint(coordinate) {
      if (!active) return false;
      const point = [Number(coordinate[0]), Number(coordinate[1])];
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;
      // ‏לחיצה חוזרת על הקודקוד הראשון סוגרת את המצולע
      if (points.length >= MIN_VERTICES && near(point, points[0])) return this.finish();
      const last = points[points.length - 1];
      if (last && near(point, last)) return false;   // ‏קליק כפול אינו קודקוד נוסף
      points.push(point);
      onChange?.(this);
      return false;
    },

    moveTo(coordinate) {
      if (!active || !points.length) return;
      hover = [Number(coordinate[0]), Number(coordinate[1])];
      onChange?.(this);
    },

    undoPoint() {
      if (!active || !points.length) return false;
      points.pop();
      onChange?.(this);
      return true;
    },

    finish() {
      if (!active || points.length < MIN_VERTICES) return false;
      const ring = points.map((p) => [...p]);
      active = false;
      reset();
      onChange?.(this);
      onComplete?.(ring);
      return true;
    },
  };
}

/** ‏שני קודקודים ״באותו מקום״ ביחס לזום — בפיקסלים היה עדיף, בלי מפה זה מעלות. */
function near(a, b, epsilon = 0.02) {
  return Math.abs(a[0] - b[0]) < epsilon && Math.abs(a[1] - b[1]) < epsilon;
}

/** ‏שכבות deck.gl לציור המצולע בזמן שמסמנים אותו. */
export function selectionLayers(tool, { PolygonLayer, PathLayer, ScatterplotLayer }) {
  if (!tool.active || !tool.points.length) return [];
  const points = tool.points;
  const preview = tool.hover ? [...points, tool.hover] : points;
  const layers = [];
  if (preview.length >= 3) {
    layers.push(new PolygonLayer({
      id: 'selection-fill',
      data: [{ polygon: [...preview, preview[0]] }],
      getPolygon: (d) => d.polygon,
      filled: true,
      stroked: false,
      getFillColor: [226, 132, 86, 34],
      pickable: false,
    }));
  }
  layers.push(new PathLayer({
    id: 'selection-edge',
    data: [{ path: preview.length >= 2 ? preview : [] }],
    getPath: (d) => d.path,
    widthUnits: 'pixels',
    getWidth: 2,
    getColor: [226, 132, 86, 220],
    pickable: false,
  }));
  layers.push(new ScatterplotLayer({
    id: 'selection-vertices',
    data: points.map((at, index) => ({ at, index })),
    getPosition: (d) => d.at,
    radiusUnits: 'pixels',
    getRadius: (d) => (d.index === 0 ? 6 : 4),
    getFillColor: (d) => (d.index === 0 ? [246, 186, 83, 255] : [226, 132, 86, 220]),
    pickable: false,
  }));
  return layers;
}
