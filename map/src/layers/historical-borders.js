/**
 * Stage 1 — historical state boundaries from CShapes 2.0.
 *
 * CShapes provides dated interstate boundaries and dependencies. It does not
 * replace the later Stanford military-control layer; that distinction is kept
 * visible in the card and data manifest.
 */

const DATA_URL = './data/stage1/historical-borders.geojson';

/**
 * ⚠️ **דמות ורקע**
 * ‏המילוי היה באטימות ~73% ועוד `opacity: 0.92` מעליו, כלומר הוא כיסה
 * ‏את הבסיס לגמרי: מתחתיו יכול היה להיות תבליט, נייר או כלום — אותה
 * ‏תמונה בדיוק. שטיפה חלשה עם קו גבול חזק נותנת את שתי הקריאות: את
 * ‏הצורה המדינית **ואת הקרקע שמתחתיה**.
 *
 * ⚠️ **שטח כבוש אינו אותו דבר כמו שטח ריבוני**
 * ‏צרפת ביוני 1941 באותו אדום כמו גרמניה היא **טענה**, לא עובדה.
 * ‏הכיבוש מקבל גוון אדמה נפרד — אותו צד, מעמד אחר.
 */
const SIDE_COLORS = {
  allied: [43, 108, 163, 78],
  axis: [166, 60, 46, 78],
  neutral: [150, 143, 122, 52],
};

const OCCUPIED_COLORS = {
  axis: [138, 90, 51, 70],
  allied: [70, 106, 128, 66],
  neutral: [150, 143, 122, 52],
};

const OCCUPIED_STATUS = new Set(['occupied', 'protectorate', 'mandate']);

function fillFor(feature) {
  const { side, status } = feature.properties;
  const table = OCCUPIED_STATUS.has(status) ? OCCUPIED_COLORS : SIDE_COLORS;
  return table[side] || SIDE_COLORS.neutral;
}

const STATUS_HE = {
  independent: 'עצמאית',
  colony: 'מושבה',
  occupied: 'שטח כבוש',
  protectorate: 'פרוטקטורט',
  mandate: 'מנדט',
};

function propsOf(entity) {
  return entity?.properties || entity || {};
}

const cardSpec = {
  title: (entity) => propsOf(entity).name_he || propsOf(entity).name_en,
  subtitle: 'גבול מדיני מתוארך — לא קו חזית',
  fieldsOf: (entity) => {
    const p = propsOf(entity);
    return [
      { label: 'שם במקור', value: p.name_en },
      { label: 'מעמד', value: STATUS_HE[p.status] || p.status },
      { label: 'תקף מ־', value: p.valid_from },
      { label: 'תקף עד', value: p.valid_to },
      {
        label: 'כיסוי',
        value: 'גבולות בין־מדינתיים',
        note: 'שכבת השליטה הצבאית החודשית תתווסף ממערך Stanford; אין לפרש מילוי זה כשליטה בפועל בכל שטח.',
      },
    ];
  },
  sourcesOf: () => [
    {
      id: 'cshapes',
      name: 'CShapes 2.0 — ETH Zürich / CRAN',
      url: 'https://cran.r-project.org/package=cshapes',
    },
  ],
};

export function createHistoricalBordersLayer({ GeoJsonLayer }) {
  return {
    id: 'historical-borders',
    label: 'גבולות מדיניים היסטוריים',
    group: 'לחימה וטריטוריה',
    defaultOn: true,
    opacity: 1,
    legend: [
      { color: SIDE_COLORS.allied.slice(0, 3), label: 'בעלות הברית', shape: 'square' },
      { color: SIDE_COLORS.axis.slice(0, 3), label: 'מדינות הציר', shape: 'square' },
      { color: SIDE_COLORS.neutral.slice(0, 3), label: 'ניטרלי / אחר', shape: 'square' },
      { color: OCCUPIED_COLORS.axis.slice(0, 3), label: 'שטח כבוש', shape: 'square' },
    ],

    async load() {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`טעינת הגבולות נכשלה (${response.status})`);
      const payload = await response.json();
      if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
        throw new Error('פורמט שכבת הגבולות אינו תקין');
      }
      return payload;
    },

    build(data, ctx) {
      const { day, opacity, onClick } = ctx;
      const visible = data.features.filter((feature) => (
        feature.properties.day_from <= day && day <= feature.properties.day_to
      ));
      return new GeoJsonLayer({
        id: 'historical-borders',
        data: { ...data, features: visible },
        opacity,
        pickable: true,
        filled: true,
        stroked: true,
        lineWidthUnits: 'pixels',
        // ‏הקו נושא את הצורה המדינית; המילוי רק רומז לצד. לכן הקו
        // ‏מתחזק כשהמילוי נחלש, ולא להפך.
        getLineWidth: 1.4,
        lineWidthMinPixels: 1.1,
        getLineColor: [92, 74, 56, 225],
        getFillColor: fillFor,
        onClick: (info) => {
          if (info.object) onClick?.(info.object, cardSpec);
        },
      });
    },
    cardSpec,
  };
}
