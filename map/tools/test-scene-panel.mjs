import assert from 'node:assert/strict';
import { createScenePanel } from '../src/ui/scene-panel.js';

// --- the smallest DOM the panel actually uses -------------------------------
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.attributes = {};
    this._text = '';
    this._handlers = {};
    this.disabled = false;
    this.type = '';
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() {
    return this.children.length
      ? this.children.map((c) => c.textContent).join(' ')
      : this._text;
  }
  set innerHTML(value) { if (value === '') { this.children = []; this._text = ''; } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  append(...nodes) { for (const n of nodes) if (n) this.children.push(n); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { (this._handlers[name] ||= []).push(fn); }
  click() { for (const fn of this._handlers.click || []) fn(); }
  querySelectorAll() { return []; }
  // helpers for the tests
  find(pred) {
    if (pred(this)) return this;
    for (const child of this.children) {
      const hit = child.find ? child.find(pred) : null;
      if (hit) return hit;
    }
    return null;
  }
  all(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const child of this.children) if (child.all) child.all(pred, out);
    return out;
  }
  get text() { return this.textContent; }
}
globalThis.document = { createElement: (tag) => new El(tag) };

function panel(handlers = {}) {
  const root = new El('aside');
  const api = createScenePanel(root, handlers);
  return { root, api };
}
// exact class-token match: 'scene-panel__stage' must not also catch
// 'scene-panel__stage-dot'
const byClass = (root, cls) =>
  root.all((n) => String(n.className || '').split(/\s+/).includes(cls));
const textOf = (root) => root.all(() => true).map((n) => n._text).join(' ');

const SCENE = {
  scene_id: 'scn_abc123',
  title_he: 'קרב קורסק — 1943-07-07',
  temporal: { day: 2378, date: '1943-07-07' },
  camera: { bounds: [35, 51, 37, 52], max_zoom: 8 },
  counts: { features: 70, located: 1, unlocated: 69, sources: 9 },
  quality: { explicit: 1, unknown: 69 },
  fact_policy: 'explicit_or_fact_safe',
  warnings: ['69 יחידות ללא מיקום בטוח'],
  gaps: [{ subject: 'commanders', reason: 'no_rows_matched_policy_or_window' }],
  deep_link: 'http://localhost:8000/#scene=scn_abc123&d=2378',
};

// -- idle --------------------------------------------------------------------
{
  const { root } = panel();
  assert.equal(root.dataset.status, 'idle');
  assert.ok(textOf(root).includes('ממתין לפקודת צ׳אט'));
  assert.equal(byClass(root, 'scene-panel__stage').length, 5, 'all five stages are listed up front');
}

// -- progress ----------------------------------------------------------------
{
  const { root, api } = panel();
  api.onProgress({ stage: 'received', title: 'הצג את קורסק', date: '1943-07-07',
                   fact_policy: 'explicit_or_fact_safe', plan_steps: 2 });
  assert.equal(root.dataset.status, 'loading');
  const shown = textOf(root);
  assert.ok(shown.includes('הצג את קורסק'), 'the question is echoed while working');
  assert.ok(shown.includes('1943-07-07'));
  assert.ok(shown.includes('2 שלבי גרף'));

  const active = byClass(root, 'scene-panel__stage').filter((s) => s.dataset.state === 'active');
  assert.equal(active.length, 1, 'exactly one stage is active at a time');
}

// -- per-step querying detail ------------------------------------------------
{
  const { root, api } = panel();
  api.onProgress({ stage: 'received' });
  api.onProgress({ stage: 'querying', step_index: 2, step_total: 3, rows: 64, step: 'participants' });
  const shown = textOf(root);
  assert.ok(shown.includes('שלב 2/3'), 'plan progress is visible while the graph works');
  assert.ok(shown.includes('64 שורות'));
}

// -- a finished scene --------------------------------------------------------
{
  const { root, api } = panel();
  api.onProgress({ stage: 'received', title: 'הצג את קורסק' });
  api.onScene(SCENE, 'ready');
  assert.equal(root.dataset.status, 'ready');
  const shown = textOf(root);
  assert.ok(shown.includes('קרב קורסק'));
  assert.ok(shown.includes('scn_abc123'));
  assert.ok(shown.includes('69'), 'the unlocated count is on screen, not buried');
  assert.ok(shown.includes('69 יחידות ללא מיקום בטוח'), 'warnings are shown, not swallowed');
  assert.ok(shown.includes('commanders'), 'gaps are shown as part of the answer');
  const chips = byClass(root, 'scene-panel__chip');
  assert.ok(chips.length >= 2, 'the quality breakdown is visible');
}

// -- every stage reads as done once the scene lands ---------------------------
{
  const { root, api } = panel();
  api.onProgress({ stage: 'received' });
  api.onScene(SCENE, 'ready');
  const stages = byClass(root, 'scene-panel__stage');
  assert.equal(stages[stages.length - 1].dataset.state, 'active');
  assert.ok(stages.slice(0, -1).every((s) => s.dataset.state === 'done'));
}

// -- graph text is never treated as markup -----------------------------------
{
  const { root, api } = panel();
  api.onScene({ ...SCENE, title_he: '<img src=x onerror=alert(1)>',
                warnings: ['<script>alert(2)</script>'] }, 'ready');
  const node = root.find((n) => n._text.includes('<img'));
  assert.ok(node, 'the raw text is present…');
  assert.equal(node.tagName, 'DIV', '…as text content of a plain element, never parsed');
}

// -- the bridge going away is stated, not hidden ------------------------------
{
  const { root, api } = panel();
  api.onScene(null, 'bridge_unavailable');
  assert.equal(root.dataset.status, 'bridge_unavailable');
  assert.ok(textOf(root).includes('הגשר אינו זמין'));
  assert.ok(textOf(root).includes('המפה ממשיכה לפעול'));
}

// -- a failed scene says so ---------------------------------------------------
{
  const { root, api } = panel();
  api.onScene(null, 'scene_failed');
  assert.equal(root.dataset.status, 'scene_failed');
  assert.ok(textOf(root).includes('נכשלה'));
}

// -- actions ------------------------------------------------------------------
{
  let cleared = 0; let fitted = null; let copied = null;
  const { root, api } = panel({
    onClear: () => { cleared += 1; },
    onFit: (scene) => { fitted = scene.scene_id; },
    onCopyLink: (scene) => { copied = scene.deep_link; },
    onUndo: () => {},
  });
  api.onScene(SCENE, 'ready');
  const actions = byClass(root, 'scene-panel__action');
  assert.equal(actions.length, 4);
  for (const button of actions) {
    assert.equal(button.disabled, false, 'actions are live once a scene exists');
    button.click();
  }
  assert.equal(cleared, 1);
  assert.equal(fitted, 'scn_abc123');
  assert.equal(copied, SCENE.deep_link);
}

// -- the unlocated list is on demand, not preloaded ---------------------------
{
  let calls = 0;
  const { root, api } = panel({
    onLoadUnlocated: async () => {
      calls += 1;
      return [{ id: 'unit:1', properties: { name: '13th Army', entity_kind: 'Unit' } }];
    },
  });
  api.onScene(SCENE, 'ready');
  assert.equal(calls, 0, 'the list is not fetched until asked for');
  const link = byClass(root, 'scene-panel__link')[0];
  assert.ok(link.textContent.includes('69'));
  link.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  assert.ok(textOf(root).includes('13th Army'));
}

// -- collapsing --------------------------------------------------------------
{
  const { root } = panel();
  const toggle = byClass(root, 'scene-panel__toggle')[0];
  assert.equal(root.dataset.collapsed, 'false');
  toggle.click();
  assert.equal(root.dataset.collapsed, 'true');
  toggle.click();
  assert.equal(root.dataset.collapsed, 'false');
}

// -- a new request resets the previous scene's numbers ------------------------
{
  const { root, api } = panel();
  api.onScene(SCENE, 'ready');
  assert.ok(textOf(root).includes('69'));
  api.onProgress({ stage: 'received', title: 'שאלה חדשה' });
  assert.ok(!textOf(root).includes('69 יחידות ללא מיקום בטוח'),
    'stale counts must not linger under a new question');
  assert.ok(textOf(root).includes('שאלה חדשה'));
}

console.log('test-scene-panel.mjs ✓');
