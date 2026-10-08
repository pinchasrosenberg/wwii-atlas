const META_URL = './data/terrain/terrain.meta.json';

export function createTerrainLayer() {
  return {
    id: 'terrain-relief',
    label: 'תוואי קרקע ותבליט',
    group: 'קרקע ותבליט',
    defaultOn: true,
    opacity: 0.56,
    legend: [
      { color: [92, 124, 91], label: 'שפלה וכיסוי צמחי', shape: 'square' },
      { color: [159, 142, 105], label: 'רמה וקרקע צחיחה', shape: 'square' },
      { color: [205, 199, 184], label: 'רכס והרים גבוהים', shape: 'triangle' },
      { color: [55, 92, 119], label: 'ים ועומק יחסי', shape: 'square' },
    ],
    legendContext: ({ dateLabel }) => (
      `התבליט הפיזי קבוע; הגבולות והפעילות שמעליו מוצגים לפי ${dateLabel}.`
    ),

    async load() {
      const response = await fetch(META_URL);
      if (!response.ok) throw new Error(`טעינת מטא-דאטה של התבליט נכשלה (${response.status})`);
      const meta = await response.json();
      if (!Array.isArray(meta.bounds) || meta.bounds.length !== 4 || !meta.tile_template) {
        throw new Error('פורמט שכבת התבליט אינו תקין');
      }
      return meta;
    },

    nativeLayerId: 'terrain-relief-map',
    build() { return null; },
  };
}
