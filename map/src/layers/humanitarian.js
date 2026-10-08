import { loadAtlasData, sourceMap, sourcesFor } from '../core/data-store.js?v=map-channel-19';

export function createAidOperationsLayer({ PathLayer, ScatterplotLayer }) {
  let sources = new Map();
  const cardSpec = {
    title: (item) => item.name_he,
    subtitle: 'מבצע סיוע הומניטרי',
    fieldsOf: (item) => [
      { label: 'ארגון', value: item.agency },
      { label: 'סוג סיוע', value: item.aid_type },
      { label: 'מעמד מעבר', value: {
        safe_conduct_agreed: 'מעבר בטוח מוסכם',
        blockade_exemption: 'הקלה במצור',
        allied_relief: 'מבצע סיוע של בעלות הברית',
      }[item.negotiated_status] || item.negotiated_status },
      { label: 'תקופה', value: `${item.active_from} — ${item.active_to}` },
      { label: 'היקף', value: item.volume_he },
    ],
    sourcesOf: (item) => sourcesFor(item, sources),
  };
  return {
    id: 'aid-operations',
    label: 'מבצעי סיוע הומניטרי',
    group: 'סיוע הומניטרי',
    defaultOn: false,
    opacity: 0.88,
    legend: [
      { color: [236, 239, 226], label: 'נתיב סיוע', shape: 'square' },
      { color: [118, 201, 167], label: 'יעד סיוע', shape: 'circle' },
    ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      return payload.aid_operations;
    },
    build(data, ctx) {
      const { day, opacity, onClick } = ctx;
      const active = data.filter((item) => item.day_from <= day && day <= item.day_to);
      const paths = new PathLayer({
        id: 'aid-operation-paths',
        data: active,
        pickable: true,
        opacity,
        getPath: (item) => item.path,
        getColor: [236, 239, 226, 230],
        getWidth: 3,
        widthUnits: 'pixels',
        widthMinPixels: 2,
        jointRounded: true,
        capRounded: true,
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
      });
      const endpoints = active.map((item) => ({
        item,
        position: item.path[item.path.length - 1],
      }));
      const points = new ScatterplotLayer({
        id: 'aid-operation-targets',
        data: endpoints,
        pickable: true,
        opacity,
        getPosition: (item) => item.position,
        getFillColor: [118, 201, 167, 245],
        getLineColor: [255, 255, 245, 245],
        getRadius: 6,
        radiusUnits: 'pixels',
        radiusMinPixels: 5,
        stroked: true,
        lineWidthMinPixels: 1,
        onClick: (info) => info.object && onClick?.(info.object.item, cardSpec),
      });
      return [paths, points];
    },
    cardSpec,
  };
}

export function createFaminesLayer({ PolygonLayer }) {
  let sources = new Map();
  const cardSpec = {
    title: (item) => item.name_he,
    subtitle: 'רעב ומצוקת מזון — תחום ייצוגי',
    fieldsOf: (item) => [
      { label: 'תקופה', value: `${item.active_from} — ${item.active_to}` },
      { label: 'חומרה', value: item.severity === 'extreme' ? 'קיצונית' : 'חמורה' },
      { label: 'הקשר', value: item.context_he },
      {
        label: 'גיאומטריה',
        value: 'תחום כללי, לא מפת תמותה',
        derivation: 'algorithmic',
        note: 'אין להסיק מן הצבע שכל מקום בתוך הפוליגון נפגע באותה מידה.',
      },
    ],
    sourcesOf: (item) => sourcesFor(item, sources),
  };
  return {
    id: 'famines',
    label: 'רעב ומצוקת מזון',
    group: 'סיוע הומניטרי',
    defaultOn: false,
    opacity: 0.62,
    legend: [
      { color: [179, 116, 52], label: 'מצוקת מזון חמורה', shape: 'square' },
      { color: [171, 65, 50], label: 'מצוקת מזון קיצונית', shape: 'square' },
    ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      return payload.famines;
    },
    build(data, ctx) {
      const { day, opacity, onClick } = ctx;
      const active = data.filter((item) => item.day_from <= day && day <= item.day_to);
      return new PolygonLayer({
        id: 'famines',
        data: active,
        pickable: true,
        opacity,
        getPolygon: (item) => item.polygon,
        getFillColor: (item) => item.severity === 'extreme'
          ? [171, 65, 50, 100] : [179, 116, 52, 85],
        getLineColor: (item) => item.severity === 'extreme'
          ? [221, 106, 78, 220] : [218, 169, 81, 210],
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        stroked: true,
        filled: true,
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
      });
    },
    cardSpec,
  };
}

export function createRefugeesLayer({ PathLayer, ScatterplotLayer }) {
  let sources = new Map();
  const cardSpec = {
    title: (item) => item.name_he,
    subtitle: 'תנועת פליטים ועקורים — ללא ייצוג אנשים כחלקיקים',
    fieldsOf: (item) => [
      { label: 'תקופה', value: `${item.active_from} — ${item.active_to}` },
      { label: 'הקשר', value: item.context_he },
      {
        label: 'שיטה',
        value: 'מסדרון אזורי מייצג',
        derivation: 'algorithmic',
        note: 'הקו אינו מספר אנשים ואינו טוען שכל אדם עבר באותו מסלול.',
      },
    ],
    sourcesOf: (item) => sourcesFor(item, sources),
  };
  return {
    id: 'refugees',
    label: 'עקורים ופליטים',
    group: 'סיוע הומניטרי',
    defaultOn: false,
    opacity: 0.78,
    legend: [
      { color: [104, 185, 170], label: 'מסדרון פליטים/עקורים', shape: 'square' },
    ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      return payload.refugee_flows;
    },
    build(data, ctx) {
      const { day, opacity, onClick } = ctx;
      const active = data.filter((item) => item.day_from <= day && day <= item.day_to);
      const paths = new PathLayer({
        id: 'refugee-flows',
        data: active,
        pickable: true,
        opacity,
        getPath: (item) => item.path,
        getColor: [104, 185, 170, 215],
        getWidth: 3,
        widthUnits: 'pixels',
        widthMinPixels: 2,
        jointRounded: true,
        capRounded: true,
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
      });
      const endpoints = active.map((item) => ({
        item,
        position: item.path[item.path.length - 1],
      }));
      const points = new ScatterplotLayer({
        id: 'refugee-destinations',
        data: endpoints,
        pickable: true,
        opacity,
        getPosition: (item) => item.position,
        getFillColor: [104, 185, 170, 235],
        getLineColor: [228, 246, 237, 230],
        getRadius: 5,
        radiusUnits: 'pixels',
        radiusMinPixels: 4,
        stroked: true,
        lineWidthMinPixels: 1,
        onClick: (info) => info.object && onClick?.(info.object.item, cardSpec),
      });
      return [paths, points];
    },
    cardSpec,
  };
}

export function createDemographicsLayer({ ScatterplotLayer, TextLayer }) {
  let sources = new Map();
  const cardSpec = {
    title: (item) => item.name_he,
    subtitle: 'דמוגרפיה עירונית — שיטת המדידה מוצגת בכל רשומה',
    fieldsOf: (item) => item.records.flatMap((record) => [
      { label: record.label_he, value: record.breakdown.length
        ? record.breakdown.map((part) => `${part.category_he}: ${part.share}%`).join(' · ')
        : 'אין ערך מאומת להצגה' },
      {
        label: 'מה נמדד',
        value: record.kind,
        note: record.note_he,
      },
    ]),
    chartsOf: (item) => item.records
      .filter((record) => record.breakdown.length)
      .map((record) => ({
        title: `${record.label_he} · ${record.kind}`,
        values: record.breakdown.map((part) => ({
          label: part.category_he,
          value: part.share,
        })),
      })),
    sourcesOf: (item) => sourcesFor(item, sources),
  };
  return {
    id: 'demographics',
    label: 'דמוגרפיה ואבדות',
    group: 'אוכלוסין וגורלם',
    defaultOn: false,
    opacity: 0.88,
    legend: [
      { color: [102, 173, 220], label: 'עיר עם רשומה', shape: 'circle' },
      { color: [226, 174, 84], label: 'אימות נתונים ממתין', shape: 'square' },
    ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      return payload.demographics;
    },
    build(data, ctx) {
      const { opacity, onClick, zoom = 3 } = ctx;
      const points = new ScatterplotLayer({
        id: 'demographics',
        data,
        pickable: true,
        opacity,
        getPosition: (item) => item.position,
        getFillColor: (item) => item.records.some((record) => record.breakdown.length)
          ? [102, 173, 220, 235] : [226, 174, 84, 235],
        getLineColor: [244, 240, 224, 235],
        getRadius: 7,
        radiusUnits: 'pixels',
        radiusMinPixels: 6,
        stroked: true,
        lineWidthMinPixels: 1,
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
      });
      if (zoom < 4.5) return points;
      return [points, new TextLayer({
        id: 'demographic-labels',
        data,
        pickable: false,
        getPosition: (item) => item.position,
        getText: (item) => item.name_he,
        getColor: [238, 236, 219, 235],
        getSize: 10,
        sizeUnits: 'pixels',
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        getPixelOffset: [0, -11],
        characterSet: [...new Set(data.map((item) => item.name_he).join(''))],
        fontSettings: { sdf: true, fontSize: 64, buffer: 4 },
        outlineWidth: 3,
        outlineColor: [7, 15, 21, 225],
      })];
    },
    cardSpec,
  };
}

