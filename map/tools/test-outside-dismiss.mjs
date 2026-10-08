import assert from 'node:assert/strict';

import { installOutsideDismiss, isOutsideEvent } from '../src/core/outside-dismiss.js';

const panel = { contains: (target) => target === 'panel-child' };
const button = { contains: () => false };

assert.equal(isOutsideEvent({ target: 'panel-child' }, [panel, button]), false);
assert.equal(isOutsideEvent({ target: 'map' }, [panel, button]), true);
assert.equal(isOutsideEvent({ target: 'map', composedPath: () => [button] }, [panel, button]), false);

let listener;
let closed = 0;
let open = false;
const root = {
  addEventListener: (name, callback) => {
    assert.equal(name, 'pointerdown');
    listener = callback;
  },
  removeEventListener: (name, callback) => {
    assert.equal(name, 'pointerdown');
    assert.equal(callback, listener);
  },
};
const uninstall = installOutsideDismiss({
  root,
  isOpen: () => open,
  inside: () => [panel],
  close: () => { closed += 1; },
});

listener({ target: 'map' });
assert.equal(closed, 0, 'a closed surface should stay untouched');
open = true;
listener({ target: 'panel-child' });
assert.equal(closed, 0, 'a click inside should not close the surface');
listener({ target: 'map' });
assert.equal(closed, 1, 'a click outside should close the surface');
uninstall();

console.log('Outside-dismiss behavior passed');
