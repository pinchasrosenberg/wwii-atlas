/**
 * Global battle context synchronized to the selected day.
 *
 * Positions are map anchors for navigation and discovery. They are never
 * presented as battlefield polygons or front-line reconstructions.
 */

import { loadAtlasData, loadJson } from '../core/data-store.js?v=map-channel-19';

const BATTLES_URL = './data/stage2/battles.json';

const THEATER_COLORS = {
  europe: [244, 186, 83, 245],
  'eastern-front': [221, 105, 78, 245],
  mediterranean: [105, 191, 188, 245],
  pacific: [118, 173, 231, 245],
  asia: [164, 132, 218, 245],
};

function colorOf(item, alpha = 245) {
  const [r, g, b] = THEATER_COLORS[item.theater] || [230, 185, 94];
  return [r, g, b, alpha];
}

function theaterLabel(value) {
  return {
    europe: 'אירופה',
    'eastern-front': 'החזית המזרחית',
    mediterranean: 'הים התיכון וצפון אפריקה',
    pacific: 'האוקיינוס השקט',
    asia: 'אסיה',
  }[value] || value;
}

export function createBattlesLayer({ ScatterplotLayer, TextLayer, onWhy }) {
  let sourceIndex = new Map();
  const cardSpec = {
    title: (item) => item.name_he || item.name_en,
    subtitle: 'קרב או מערכה הפעילים בתאריך הנבחר',
    fieldsOf: (item, formatDay) => [
      { label: 'זירה', value: theaterLabel(item.theater) },
      { label: 'סוג', value: item.kind },
      { label: 'התחלה', value: formatDay(item.day_from) },
      { label: 'סיום', value: formatDay(item.day_to) },
      { label: 'הקשר', value: item.summary_he },
      {
        label: 'מיקום',
        value: 'עוגן תצוגה מייצג',
        derivation: 'algorithmic',
        note: 'הסמן עוזר לנווט אל אזור הקרב; הוא אינו גבול החזית או שטח הלחימה.',
      },
    ],
    actionsOf: (item) => item.supply_context ? [{
      label: 'מצב ״מדוע״ — הדגש שרשרת אספקה',
      action: () => onWhy?.(item),
    }] : [],
    sourcesOf: (item) => item.source_ids
      .map((id) => sourceIndex.get(id))
      .filter(Boolean),
  };

  return {
    id: 'battles',
    label: 'קרבות פעילים בעולם',
    group: 'לחימה וטריטוריה',
    defaultOn: true,
    opacity: 0.96,
    legend: [
      { color: [244, 186, 83], label: 'אירופה והים התיכון', shape: 'circle' },
      { color: [118, 173, 231], label: 'אסיה והאוקיינוס השקט', shape: 'circle' },
    ],

    async load() {
      const [loaded, atlas] = await Promise.all([loadJson(BATTLES_URL), loadAtlasData()]);
      // ⚠️ ‏המטמון מחזיר את **אותו אובייקט** לכל הקוראים, ולכן שכבה
      // ‏שכותבת עליו משנה אותו גם לשאר. עותק רדוד לפני שינוי.
      const payload = { ...loaded };
      const contexts = new Map(
        (atlas.supply_context || []).map((item) => [item.battle_id, item]),
      );
      payload.battles = payload.battles.map((item) => ({
        ...item,
        supply_context: contexts.get(item.id) || null,
      }));
      sourceIndex = new Map(
        (payload.metadata?.sources || []).map((source) => [source.id, source]),
      );
      return payload;
    },

    build(data, ctx) {
      const { day, opacity, onClick, zoom = 3 } = ctx;
      const active = data.battles.filter(
        (item) => item.day_from <= day && day <= item.day_to,
      );

      const halos = new ScatterplotLayer({
        id: 'battle-halos',
        data: active,
        pickable: false,
        opacity: opacity * 0.32,
        getPosition: (item) => item.position,
        getFillColor: (item) => colorOf(item, 75),
        getRadius: 22,
        radiusUnits: 'pixels',
        radiusMinPixels: 18,
        radiusMaxPixels: 30,
        stroked: true,
        getLineColor: (item) => colorOf(item, 130),
        lineWidthMinPixels: 1,
      });

      const points = new ScatterplotLayer({
        id: 'battle-points',
        data: active,
        pickable: true,
        autoHighlight: true,
        opacity,
        getPosition: (item) => item.position,
        getFillColor: (item) => colorOf(item),
        getLineColor: [250, 247, 238, 245],
        getRadius: 7,
        radiusUnits: 'pixels',
        radiusMinPixels: 6,
        radiusMaxPixels: 11,
        stroked: true,
        lineWidthMinPixels: 1.5,
        onClick: (info) => {
          if (info.object) onClick?.(info.object, cardSpec);
        },
      });

      if (zoom < 2.15) return [halos, points];

      const labels = new TextLayer({
        id: 'battle-labels',
        data: active,
        pickable: false,
        opacity,
        getPosition: (item) => item.position,
        getText: (item) => item.name_he,
        getColor: [52, 44, 35, 245],
        getSize: zoom >= 4 ? 13 : 11,
        sizeUnits: 'pixels',
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        getPixelOffset: [0, -12],
        fontFamily: '-apple-system, Segoe UI, Arial, sans-serif',
        fontWeight: 600,
        characterSet: [...new Set(active.map((item) => item.name_he).join(''))],
        fontSettings: { sdf: true, fontSize: 64, buffer: 4 },
        outlineWidth: 3,
        outlineColor: [250, 247, 238, 235],
      });
      return [halos, points, labels];
    },
    cardSpec,
  };
}
