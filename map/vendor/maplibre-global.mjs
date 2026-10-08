// MapLibre GL JS 6 is published as an ES module only. The atlas code reads the `maplibregl` global, so this shim
// exposes it. Module scripts run in document order, so it is defined before src/main.js executes.
import * as maplibregl from './maplibre/maplibre-gl.mjs';

globalThis.maplibregl = maplibregl;
