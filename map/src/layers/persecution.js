import { loadAtlasData, sourceMap, sourcesFor } from '../core/data-store.js?v=map-channel-19';

const CAMP_COLOR = {
  extermination: [188, 73, 68, 240],
  concentration: [213, 128, 75, 240],
  ghetto: [149, 112, 190, 240],
  transit: [104, 151, 187, 240],
};

const CAMP_TYPE_HE = {
  extermination: 'מרכז השמדה',
  concentration: 'מחנה ריכוז',
  ghetto: 'גטו',
  transit: 'מחנה מעבר',
};

export function createCampsLayer({ ScatterplotLayer, TextLayer }) {
  let sources = new Map();
  const cardSpec = {
    title: (item) => item.name_he,
    subtitle: 'אתר רדיפה — הקשר לפני מספר',
    fieldsOf: (item) => [
      { label: 'סוג', value: CAMP_TYPE_HE[item.camp_type] || item.camp_type },
      { label: 'מפעיל', value: item.operator },
      { label: 'תקופת פעילות', value: `${item.active_from} — ${item.active_to}` },
      { label: 'הקשר', value: item.context_he },
      { label: 'אי־ודאות', value: item.uncertainty_he },
    ],
    sourcesOf: (item) => sourcesFor(item, sources),
  };
  return {
    id: 'camps',
    label: 'מחנות וגטאות',
    group: 'אוכלוסין וגורלם',
    defaultOn: false,
    opacity: 0.92,
    legend: [
      { color: CAMP_COLOR.extermination.slice(0, 3), label: 'מרכז השמדה', shape: 'square' },
      { color: CAMP_COLOR.concentration.slice(0, 3), label: 'מחנה ריכוז', shape: 'circle' },
      { color: CAMP_COLOR.ghetto.slice(0, 3), label: 'גטו', shape: 'circle' },
    ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      return payload.camps;
    },
    build(data, ctx) {
      const { day, opacity, onClick, zoom = 3 } = ctx;
      let active = data.filter((item) => item.day_from <= day && day <= item.day_to);
      if (zoom < 4) {
        active = active.filter((item) => (
          item.camp_type === 'extermination'
          || ['warsaw-ghetto', 'theresienstadt', 'dachau'].includes(item.id)
        ));
      }
      const points = new ScatterplotLayer({
        id: 'camps',
        data: active,
        pickable: true,
        opacity,
        getPosition: (item) => item.position,
        getFillColor: (item) => CAMP_COLOR[item.camp_type] || [190, 140, 110, 235],
        getLineColor: [250, 235, 210, 230],
        getRadius: (item) => item.camp_type === 'extermination' ? 8 : 6,
        radiusUnits: 'pixels',
        radiusMinPixels: 5,
        radiusMaxPixels: 10,
        stroked: true,
        lineWidthMinPixels: 1,
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
      });
      if (zoom < 5) return points;
      return [points, new TextLayer({
        id: 'camp-labels',
        data: active,
        pickable: false,
        getPosition: (item) => item.position,
        getText: (item) => item.name_he,
        getColor: [53, 45, 38, 240],
        getSize: 10,
        sizeUnits: 'pixels',
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        getPixelOffset: [0, -10],
        characterSet: [...new Set(active.map((item) => item.name_he).join(''))],
        fontSettings: { sdf: true, fontSize: 64, buffer: 4 },
        outlineWidth: 3,
        outlineColor: [250, 247, 238, 235],
      })];
    },
    cardSpec,
  };
}

export function createTransportsLayer({ PathLayer }) {
  let sources = new Map();
  const cardSpec = {
    title: (item) => item.name_he,
    subtitle: 'מסדרון גירוש — מוצג ללא אנימציית זרימה',
    fieldsOf: (item) => [
      { label: 'מוצא', value: item.origin_name_he },
      { label: 'יעד', value: item.destination_name_he },
      { label: 'אמצעי', value: 'מסילה' },
      { label: 'חלון זמן', value: `${item.active_from} — ${item.active_to}` },
      { label: 'כיסוי', value: item.coverage_he },
      {
        label: 'ניתוב',
        value: 'על רשת המסילות המייצגת',
        derivation: item.derivation,
        note: 'כאשר אין מסלול ניתן לאימות, המערכת אינה מציירת קו אווירי.',
      },
    ],
    sourcesOf: (item) => sourcesFor(item, sources),
  };
  return {
    id: 'transports',
    label: 'טרנספורטים על מסילות',
    group: 'אוכלוסין וגורלם',
    defaultOn: false,
    opacity: 0.85,
    legend: [
      { color: [216, 111, 102], label: 'מסדרון גירוש מנותב', shape: 'square' },
    ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      return payload.transports;
    },
    build(data, ctx) {
      const { day, opacity, onClick } = ctx;
      const active = data.filter((item) => item.day_from <= day && day <= item.day_to);
      return new PathLayer({
        id: 'transports',
        data: active,
        pickable: true,
        opacity,
        getPath: (item) => item.path,
        getColor: [216, 111, 102, 225],
        getWidth: 3.2,
        widthUnits: 'pixels',
        widthMinPixels: 2.5,
        jointRounded: false,
        capRounded: false,
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
      });
    },
    cardSpec,
  };
}
