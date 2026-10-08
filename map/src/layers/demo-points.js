/**
 * שכבת ההדגמה של שלב 0 — פיקסטורה סינתטית.
 *
 * ⚠️ הנתונים כאן אינם היסטוריים. הם נוצרו אלגוריתמית ומטרתם היחידה
 * להוכיח שצינור התצוגה עובד: טעינה → סינון בזמן על ה-GPU → רינדור →
 * כרטיס ישות. השכבה נמחקת בשלב 1 ומוחלפת בגבולות אמיתיים.
 *
 * מה שכן אמיתי כאן הוא המבנה: כל ישות נושאת day_from/day_to,
 * source_ids ו-derivation, בדיוק כמו כל ישות אמיתית בהמשך. זה מה
 * שמאפשר להחליף את הנתונים בלי לגעת במנוע.
 */

const DATA_URL = './data/fixtures/demo-points.json';

const COLORS = {
  alpha: [55, 138, 221],
  beta: [29, 158, 117],
  gamma: [186, 117, 23],
};

export function createDemoLayer({ DeckLayers, DataFilterExtension }) {
  return {
    id: 'demo-points',
    label: 'נקודות הדגמה (סינתטי)',
    group: 'בדיקת מערכת',
    defaultOn: true,
    opacity: 1,

    legend: [
      { color: COLORS.alpha, label: 'קבוצה א׳', shape: 'circle' },
      { color: COLORS.beta, label: 'קבוצה ב׳', shape: 'circle' },
      { color: COLORS.gamma, label: 'קבוצה ג׳', shape: 'circle' },
    ],

    async load() {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`טעינת הפיקסטורה נכשלה (${res.status})`);
      const json = await res.json();
      if (!Array.isArray(json.features)) throw new Error('פורמט פיקסטורה לא תקין');
      return json;
    },

    build(data, ctx) {
      const { day, tier, opacity, onClick, minDay, maxDay } = ctx;
      // גבולות סופיים ולא Infinity: ערכי אינסוף ב-uniform של float
      // עלולים להפוך ל-NaN בחלק ממימושי ה-GPU, והשכבה נעלמת בשקט.
      const LO = minDay - 1;
      const HI = maxDay + 1;

      return new DeckLayers.ScatterplotLayer({
        id: 'demo-points',
        data: data.features,
        pickable: true,
        opacity,

        getPosition: (d) => d.position,
        getFillColor: (d) => COLORS[d.category] || [130, 130, 130],
        getRadius: (d) => d.magnitude,
        radiusUnits: 'pixels',
        radiusMinPixels: 2,
        radiusMaxPixels: 14,
        stroked: false,

        // ── הלב של שלב 0 ──
        // הסינון בזמן מתבצע ב-shader דרך getFilterValue, ולא בלולאת
        // JavaScript שמסננת את המערך בכל הזזת סרגל. זו ההצדקה כולה
        // למעבר מ-Leaflet ל-deck.gl, ולכן זה מה שהשלב הזה מוכיח.
        extensions: [new DataFilterExtension({ filterSize: 2 })],
        getFilterValue: (d) => [d.day_from, d.day_to],
        // ישות נראית כאשר day_from ≤ היום הנוכחי ≤ day_to
        filterRange: [[LO, day], [day, HI]],

        // דהייה עדינה במקום הבהוב חד — רק בדרג מלא
        transitions: tier === 'full' ? { getFillColor: 200 } : {},

        onClick: (info) => { if (info.object) onClick?.(info.object); },
      });
    },

    /** מפרט כרטיס הישות — הכרטיס עצמו גנרי ואינו יודע מה זה. */
    cardSpec: {
      title: (d) => d.name,
      subtitle: 'ישות סינתטית — נתוני בדיקה בלבד',
      fieldsOf: (d, fmt) => ([
        { label: 'קבוצה', value: { alpha: 'א׳', beta: 'ב׳', gamma: 'ג׳' }[d.category] },
        { label: 'עוצמה', value: d.magnitude },
        { label: 'קיים מ', value: fmt(d.day_from) },
        { label: 'קיים עד', value: fmt(d.day_to) },
        {
          label: 'מדד נגזר', value: d.derived_score,
          derivation: 'algorithmic',
          note: 'ערך מחושב — מוצג כדי להדגים את סימון ההסקה בכרטיס',
        },
      ]),
      sourcesOf: () => ([{ id: 'synthetic', name: 'פיקסטורה סינתטית — ללא מקור היסטורי' }]),
    },
  };
}

/** היסטוגרמת פעילות לסרגל הזמן — כמה ישויות קיימות בכל חודש. */
export function buildHistogram(data, minDay, maxDay, buckets = 120) {
  const out = new Array(buckets).fill(0);
  const span = maxDay - minDay;
  for (const f of data.features) {
    const a = Math.max(0, Math.floor(((f.day_from - minDay) / span) * buckets));
    const b = Math.min(buckets - 1, Math.floor(((f.day_to - minDay) / span) * buckets));
    for (let i = a; i <= b; i++) out[i]++;
  }
  return out;
}
