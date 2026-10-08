import { chainsForEntity, loadNetworkData } from '../core/network-store.js?v=map-channel-19';

const TYPE_COLOR = {
  factory: [213, 139, 82, 245],
  port: [79, 161, 179, 245],
  supply_route: [226, 181, 87, 245],
  headquarters: [167, 132, 201, 245],
  battle: [220, 96, 78, 245],
};

const TYPE_SYMBOL = {
  factory: '▦',
  port: '◉',
  supply_route: '⇢',
  headquarters: '◆',
  battle: '✦',
};

function activeAt(item, day) {
  return (item.day_from ?? -Infinity) <= day && day <= (item.day_to ?? Infinity);
}

function chainData(data, selectedId, day) {
  const chainIds = selectedId ? chainsForEntity(data, selectedId) : [];
  const chosen = chainIds.length ? new Set(chainIds) : new Set(['chain:atlantic-normandy']);
  const relations = data.relations.filter(
    (item) => chosen.has(item.chain_id) && activeAt(item, day),
  );
  const entityIds = new Set(relations.flatMap((item) => [item.from_id, item.to_id]));
  if (selectedId) entityIds.add(selectedId);
  const entities = data.entities.filter((item) => entityIds.has(item.id));
  return { relations, entities };
}

export function createSupplyNetworkLayer({
  PathLayer,
  ScatterplotLayer,
  TextLayer,
  getMapMode,
  getSelectedId,
  onSelect,
}) {
  return {
    id: 'supply-network',
    label: 'שרשרת מפעל–נמל–מפקדה–קרב',
    group: 'אספקה ונתיבים',
    defaultOn: false,
    opacity: 1,
    legend: [
      { color: [79, 161, 179], label: 'ישות מעוגנת בנתון קיים', shape: 'circle' },
      { color: [226, 181, 87], label: 'קשר mock לצורך עיצוב', shape: 'line' },
    ],

    async load() {
      return loadNetworkData();
    },

    build(data, ctx) {
      if (getMapMode() !== 'relations') return [];
      const { day, opacity, zoom = 3 } = ctx;
      const selectedId = getSelectedId();
      const active = chainData(data, selectedId, day);

      const paths = new PathLayer({
        id: 'supply-network-relations',
        data: active.relations,
        pickable: true,
        autoHighlight: true,
        opacity: opacity * 0.94,
        getPath: (item) => item.path,
        getColor: (item) => item.data_status === 'mixed'
          ? [112, 190, 166, 225]
          : [226, 181, 87, 220],
        getWidth: (item) => selectedId && (item.from_id === selectedId || item.to_id === selectedId) ? 5 : 3,
        widthUnits: 'pixels',
        widthMinPixels: 2,
        jointRounded: true,
        capRounded: true,
        onClick: (info) => info.object && onSelect?.(info.object.to_id, info.object.chain_id),
      });

      const halos = new ScatterplotLayer({
        id: 'supply-network-halos',
        data: active.entities,
        pickable: false,
        opacity: opacity * 0.34,
        getPosition: (item) => item.position,
        getFillColor: (item) => TYPE_COLOR[item.entity_type] || [230, 181, 87, 220],
        getRadius: (item) => item.id === selectedId ? 27 : 18,
        radiusUnits: 'pixels',
        stroked: true,
        getLineColor: [255, 244, 218, 160],
        lineWidthMinPixels: 1,
      });

      const nodes = new ScatterplotLayer({
        id: 'supply-network-nodes',
        data: active.entities,
        pickable: true,
        autoHighlight: true,
        opacity,
        getPosition: (item) => item.position,
        getFillColor: (item) => TYPE_COLOR[item.entity_type] || [230, 181, 87, 245],
        getLineColor: (item) => item.id === selectedId ? [255, 255, 255, 255] : [8, 18, 27, 245],
        getRadius: (item) => item.id === selectedId ? 10 : 7,
        radiusUnits: 'pixels',
        radiusMinPixels: 6,
        stroked: true,
        getLineWidth: (item) => item.id === selectedId ? 3 : 1.5,
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 1.5,
        onClick: (info) => info.object && onSelect?.(info.object.id),
      });

      const symbols = new TextLayer({
        id: 'supply-network-symbols',
        data: active.entities,
        pickable: false,
        opacity,
        getPosition: (item) => item.position,
        getText: (item) => TYPE_SYMBOL[item.entity_type] || '•',
        getColor: [250, 246, 235, 255],
        getSize: 11,
        sizeUnits: 'pixels',
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        characterSet: Object.values(TYPE_SYMBOL),
        fontFamily: '-apple-system, Segoe UI Symbol, Arial, sans-serif',
      });

      if (zoom < 2.7) return [paths, halos, nodes, symbols];
      const labels = new TextLayer({
        id: 'supply-network-labels',
        data: active.entities,
        pickable: false,
        opacity,
        getPosition: (item) => item.position,
        getText: (item) => item.name_he,
        getColor: [48, 42, 35, 245],
        getSize: 12,
        sizeUnits: 'pixels',
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        getPixelOffset: [0, -15],
        fontFamily: '-apple-system, Segoe UI, Arial, sans-serif',
        fontWeight: 650,
        characterSet: [...new Set(active.entities.map((item) => item.name_he).join(''))],
        fontSettings: { sdf: true, fontSize: 64, buffer: 4 },
        outlineWidth: 3,
        outlineColor: [250, 247, 238, 235],
      });
      return [paths, halos, nodes, symbols, labels];
    },
  };
}
