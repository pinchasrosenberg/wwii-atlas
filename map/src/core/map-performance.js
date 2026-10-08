export const MAX_RENDER_PIXEL_RATIO = 1.25;
export const TERRAIN_TILE_MAX_ZOOM = 4;

const DETAIL_THRESHOLDS = [2.15, 2.7, 2.8, 4, 4.2, 4.5, 5, 6];

export function renderPixelRatio(value = globalThis.devicePixelRatio || 1) {
  const ratio = Number.isFinite(value) && value > 0 ? value : 1;
  return Math.min(MAX_RENDER_PIXEL_RATIO, Math.max(1, ratio));
}

export function zoomDetailLevel(zoom) {
  return DETAIL_THRESHOLDS.reduce(
    (level, threshold) => level + (zoom >= threshold ? 1 : 0),
    0,
  );
}
