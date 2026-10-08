import assert from 'node:assert/strict';
import { createPolygonSelect, selectionLayers, MIN_VERTICES } from '../src/ui/polygon-select.js';

class Fake { constructor(p) { Object.assign(this, p); this.kind = this.constructor.name; } }
class PolygonLayer extends Fake {}
class PathLayer extends Fake {}
class ScatterplotLayer extends Fake {}
const deckClasses = { PolygonLayer, PathLayer, ScatterplotLayer };

// -- collecting vertices -----------------------------------------------------
{
  const tool = createPolygonSelect();
  assert.equal(tool.active, false);
  assert.equal(tool.addPoint([1, 1]), false, 'clicks before start are ignored');
  assert.deepEqual(tool.points, []);
}
{
  let completed = null;
  const tool = createPolygonSelect({ onComplete: (ring) => { completed = ring; } });
  tool.start();
  tool.addPoint([0, 0]);
  tool.addPoint([10, 0]);
  assert.equal(tool.ring(), null, `fewer than ${MIN_VERTICES} vertices is not a polygon`);
  tool.addPoint([10, 10]);
  assert.equal(tool.ring().length, 3);
  assert.equal(tool.finish(), true);
  assert.deepEqual(completed, [[0, 0], [10, 0], [10, 10]]);
  assert.equal(tool.active, false, 'finishing leaves draw mode');
  assert.deepEqual(tool.points, [], 'and clears the working ring');
}
{
  // clicking the first vertex again closes the shape
  let completed = null;
  const tool = createPolygonSelect({ onComplete: (r) => { completed = r; } });
  tool.start();
  [[0, 0], [10, 0], [10, 10], [0.001, 0.001]].forEach((p) => tool.addPoint(p));
  assert.ok(completed, 'clicking the start vertex closes the polygon');
  assert.equal(completed.length, 3, 'the closing click is not stored as a fourth vertex');
}
{
  // a double click must not add the same vertex twice
  const tool = createPolygonSelect();
  tool.start();
  tool.addPoint([5, 5]);
  tool.addPoint([5, 5]);
  assert.equal(tool.points.length, 1);
}
{
  const tool = createPolygonSelect();
  tool.start();
  tool.addPoint([0, 0]);
  tool.addPoint([1, 1]);
  assert.equal(tool.undoPoint(), true);
  assert.equal(tool.points.length, 1);
  assert.equal(tool.finish(), false, 'an unfinished polygon is not submitted');
}
{
  let cancelled = false;
  const tool = createPolygonSelect({ onCancel: () => { cancelled = true; } });
  tool.start();
  tool.addPoint([0, 0]);
  assert.equal(tool.cancel(), true);
  assert.ok(cancelled);
  assert.equal(tool.active, false);
  assert.deepEqual(tool.points, []);
  assert.equal(tool.cancel(), false, 'cancelling twice is a no-op');
}
{
  const tool = createPolygonSelect();
  tool.start();
  assert.equal(tool.addPoint([NaN, 3]), false, 'a bad coordinate is refused');
  assert.equal(tool.addPoint(['x', 'y']), false);
  assert.deepEqual(tool.points, []);
}

// -- what gets drawn ---------------------------------------------------------
{
  const tool = createPolygonSelect();
  assert.deepEqual(selectionLayers(tool, deckClasses), [], 'nothing is drawn when idle');
  tool.start();
  assert.deepEqual(selectionLayers(tool, deckClasses), [], 'nor before the first click');
  tool.addPoint([0, 0]);
  let ids = selectionLayers(tool, deckClasses).map((l) => l.id);
  assert.deepEqual(ids, ['selection-edge', 'selection-vertices']);
  tool.addPoint([10, 0]);
  tool.addPoint([10, 10]);
  ids = selectionLayers(tool, deckClasses).map((l) => l.id);
  assert.ok(ids.includes('selection-fill'), 'three vertices make a fillable shape');
}
{
  // the hover point previews the edge without becoming a vertex
  const tool = createPolygonSelect();
  tool.start();
  tool.addPoint([0, 0]);
  tool.addPoint([10, 0]);
  tool.moveTo([10, 10]);
  const edge = selectionLayers(tool, deckClasses).find((l) => l.id === 'selection-edge');
  assert.equal(edge.data[0].path.length, 3, 'the preview edge follows the cursor');
  assert.equal(tool.points.length, 2, 'but the cursor is not a vertex');
}
{
  // the first vertex is drawn larger — it is the one you click to close
  const tool = createPolygonSelect();
  tool.start();
  tool.addPoint([0, 0]);
  tool.addPoint([5, 5]);
  const dots = selectionLayers(tool, deckClasses).find((l) => l.id === 'selection-vertices');
  assert.ok(dots.getRadius(dots.data[0]) > dots.getRadius(dots.data[1]));
}

console.log('test-polygon-select.mjs ✓');
