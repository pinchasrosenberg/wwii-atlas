/**
 * ‏בורר אופן התובלה לשכבת התוואי.
 *
 * ⚠️ **למה זה פקד ולא הגדרה בשאילתה**
 * ‏השאלה ״האם אפשר היה להגיע לכאן״ אין לה תשובה אחת: אותו קטע נהר חוסם
 * ‏משאית לחלוטין ונושא דוברה. כל המקדמים כבר הגיעו עם התא, ולכן ההחלפה
 * ‏היא ציור מחדש מיידי — וזה בדיוק מה שהופך את ההבדל לנראה: לוחצים
 * ‏״דוברה״, והנהר שהיה קיר שחור נפתח.
 *
 * ‏הפקד מופיע רק כשיש תאי תוואי על המפה, ונעלם כשאין. ‏textContent בלבד.
 */

import {
  MODES_WITHOUT_BASIS, MODE_LABELS, MODE_NOTES, TRANSPORT_MODES, legendFor,
} from '../layers/terrain-passability.js?v=map-channel-19';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

export function createTransportModeControl(root, { getMode, onChange } = {}) {
  root.replaceChildren();
  root.hidden = true;

  const head = el('div', 'transport-mode__head', 'במה מגיעים');
  const note = el('p', 'transport-mode__note');
  const chips = el('div', 'transport-mode__chips');
  const legend = el('div', 'transport-mode__legend');
  root.append(head, chips, note, legend);

  const buttons = new Map();
  for (const mode of TRANSPORT_MODES) {
    const button = el('button', 'transport-mode__chip', MODE_LABELS[mode]);
    button.type = 'button';
    button.dataset.mode = mode;
    button.title = MODE_NOTES[mode] || '';
    if (MODES_WITHOUT_BASIS.has(mode)) button.dataset.empty = 'true';
    button.addEventListener('click', () => select(mode));
    buttons.set(mode, button);
    chips.append(button);
  }

  function drawLegend(mode) {
    legend.replaceChildren();
    for (const entry of legendFor(mode)) {
      const row = el('span', 'transport-mode__legend-item');
      const swatch = el('i', 'transport-mode__swatch');
      const [r, g, b, a] = entry.color;
      swatch.style.background = `rgba(${r},${g},${b},${(a ?? 255) / 255})`;
      if (entry.shape === 'line') swatch.dataset.shape = 'line';
      row.append(swatch, el('span', null, entry.label));
      legend.append(row);
    }
  }

  function paint(mode) {
    for (const [key, button] of buttons) {
      button.dataset.active = key === mode ? 'true' : 'false';
      button.setAttribute('aria-pressed', key === mode ? 'true' : 'false');
    }
    note.textContent = MODE_NOTES[mode] || '';
    drawLegend(mode);
  }

  function select(mode) {
    if (onChange?.(mode) === false) return;
    paint(mode);
  }

  paint(getMode?.() || TRANSPORT_MODES[0]);

  return {
    /** ‏מציג את הפקד רק כשיש מה לצבוע, ומדווח כמה תאים ומה לא ידוע. */
    update({ cells = 0, unknown = 0 } = {}) {
      root.hidden = cells === 0;
      head.textContent = cells
        ? `במה מגיעים · ${cells} תאי תוואי${unknown ? ` · ${unknown} לא ידועים` : ''}`
        : 'במה מגיעים';
    },
    setMode(mode) { paint(mode); },
    element: root,
  };
}
