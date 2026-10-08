import { loadAtlasData, sourceMap, sourcesFor } from '../core/data-store.js?v=map-channel-19';

function uncertaintyColor(item, alpha = 230) {
  return item.confidence === 'primary_map'
    ? [230, 116, 86, alpha]
    : [226, 173, 83, alpha];
}

export function createFrontsLayer({ PathLayer, ScatterplotLayer }) {
  let sources = new Map();
  const cardSpec = {
    title: (item) => item.name_he,
    subtitle: 'קו חזית תקף לחלון הזמן הנבחר',
    fieldsOf: (item) => [
      { label: 'תאריך מצב', value: item.as_of },
      { label: 'רמת ודאות', value: item.confidence === 'primary_map'
        ? 'מבוסס מפת מצב ראשונית' : 'שחזור סכמטי' },
      {
        label: 'הערה',
        value: item.note_he,
        derivation: item.confidence === 'primary_map' ? 'manual' : 'algorithmic',
      },
    ],
    sourcesOf: (item) => sourcesFor(item, sources),
  };
  return {
    id: 'fronts',
    label: 'קווי חזית והתקדמות',
    group: 'לחימה וטריטוריה',
    defaultOn: false,
    opacity: 0.88,
    legend: [
      { color: [230, 116, 86], label: 'מבוסס מפת מצב', shape: 'square' },
      { color: [226, 173, 83], label: 'שחזור סכמטי', shape: 'circle' },
    ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      return payload.fronts;
    },
    build(data, ctx) {
      const { day, opacity, onClick } = ctx;
      const active = data.filter((item) => item.day_from <= day && day <= item.day_to);
      const lines = new PathLayer({
        id: 'front-lines',
        data: active,
        pickable: true,
        opacity,
        getPath: (item) => item.path,
        getColor: (item) => uncertaintyColor(item),
        getWidth: (item) => item.confidence === 'primary_map' ? 4 : 2.5,
        widthUnits: 'pixels',
        widthMinPixels: 2,
        jointRounded: true,
        capRounded: item => item.confidence === 'primary_map',
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
      });
      const reconstructionDots = active
        .filter((item) => item.confidence !== 'primary_map')
        .flatMap((item) => item.path.map((position) => ({ position, item })));
      const dots = new ScatterplotLayer({
        id: 'front-reconstruction-pattern',
        data: reconstructionDots,
        pickable: false,
        opacity,
        getPosition: (item) => item.position,
        getFillColor: [255, 226, 155, 220],
        getRadius: 2,
        radiusUnits: 'pixels',
        radiusMinPixels: 1.5,
      });
      return [lines, dots];
    },
    cardSpec,
  };
}

export function createFortificationsLayer({ PathLayer }) {
  let sources = new Map();
  const cardSpec = {
    title: (item) => item.name_he,
    subtitle: 'ביצורים והנדסה צבאית',
    fieldsOf: (item) => [
      { label: 'סוג', value: {
        fortified_line: 'קו מבוצר',
        coastal_defense: 'מערך חוף',
        field_defenses: 'ביצורי שדה',
      }[item.kind] || item.kind },
      {
        label: 'גיאומטריה',
        value: 'תוואי מייצג',
        derivation: item.derivation,
        note: 'התוואי מסמן את מיקום המערך בקנה מידה אזורי ואינו תוכנית הנדסית.',
      },
    ],
    sourcesOf: (item) => sourcesFor(item, sources),
  };
  return {
    id: 'fortifications',
    label: 'ביצורים וחפירות',
    group: 'לחימה וטריטוריה',
    defaultOn: false,
    opacity: 0.78,
    legend: [
      { color: [178, 190, 201], label: 'קו מבוצר', shape: 'square' },
    ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      return payload.fortifications;
    },
    build(data, ctx) {
      const { day, opacity, onClick } = ctx;
      const active = data.filter((item) => item.day_from <= day && day <= item.day_to);
      return new PathLayer({
        id: 'fortifications',
        data: active,
        pickable: true,
        opacity,
        getPath: (item) => item.path,
        getColor: [178, 190, 201, 225],
        getWidth: 3,
        widthUnits: 'pixels',
        widthMinPixels: 2,
        jointRounded: false,
        capRounded: false,
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
      });
    },
    cardSpec,
  };
}

export function createSubmarinePatrolsLayer({ PathLayer }) {
  let sources = new Map();
  const cardSpec = {
    title: (item) => item.name_he,
    subtitle: 'אזור פעילות משוער — לא יומן סיור',
    fieldsOf: (item) => [
      { label: 'כיסוי', value: item.note_he },
      {
        label: 'שיטה',
        value: 'מעטפת סכמטית בלבד',
        derivation: item.derivation,
        note: 'נתיבי צוללת בודדת אינם מוצגים כל עוד אין רישיון להפצת יומני הסיור המלאים.',
      },
    ],
    sourcesOf: (item) => sourcesFor(item, sources),
  };
  return {
    id: 'submarine-patrols',
    label: 'אזורי פעילות צוללות',
    group: 'מלחמת הים',
    defaultOn: false,
    opacity: 0.68,
    legend: [
      { color: [181, 105, 190], label: 'מעטפת פעילות משוערת', shape: 'square' },
    ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      return payload.submarine_patrols;
    },
    build(data, ctx) {
      const { day, opacity, onClick } = ctx;
      const active = data.filter((item) => item.day_from <= day && day <= item.day_to);
      return new PathLayer({
        id: 'submarine-patrols',
        data: active,
        pickable: true,
        opacity,
        getPath: (item) => item.path,
        getColor: [181, 105, 190, 210],
        getWidth: 2.5,
        widthUnits: 'pixels',
        widthMinPixels: 2,
        jointRounded: true,
        capRounded: true,
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
      });
    },
    cardSpec,
  };
}

