/**
 * פאנל ״הצ׳אט ביקש להציג״ — מסלול A (שלד), סעיף 16.2 במפרט.
 *
 * למה הוא קיים: בין הרגע שהמשתמש שולח שאלה לרגע שהסצנה מופיעה עוברות שניות
 * עד עשרות שניות, ובזמן הזה המפה נראתה בדיוק כמו מפה תקועה. הפאנל מציג את
 * השלבים בזמן אמת, ואחר כך את מצב התשובה: כמה נמצא, כמה מהם ניתן היה למקם,
 * מה סונן ולמה.
 *
 * הפאנל אינו יודע דבר על מלחמת העולם השנייה. הוא מקבל אירועי שלב ואובייקט
 * סצנה, ומרנדר אותם עם textContent בלבד — טקסט שמגיע מהגרף לעולם אינו הופך
 * ל-HTML.
 */

const STAGES = [
  { id: 'received', label: 'התקבלה בקשה' },
  { id: 'planning', label: 'מאמת תוכנית' },
  { id: 'querying', label: 'שואל את הגרף' },
  { id: 'building', label: 'בונה סצנה' },
  { id: 'ready', label: 'הסצנה מוכנה' },
];

const STATUS_TEXT = {
  idle: 'ממתין לפקודת צ׳אט',
  waiting: 'מחובר · ממתין לפקודת צ׳אט',
  loading: 'מביא את הסצנה…',
  ready: 'הסצנה מוצגת',
  cleared: 'הסצנה נוקתה',
  scene_failed: 'בניית הסצנה נכשלה',
  scene_expired: 'הסצנה פגה',
  scene_unavailable: 'הסצנה אינה זמינה',
  bridge_unavailable: 'הגשר אינו זמין — המפה ממשיכה לפעול',
};

const QUALITY_LABEL = {
  explicit: 'מפורש',
  derived: 'נגזר',
  estimated: 'הערכה',
  context: 'הקשר',
  unknown: 'לא ידוע',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

export function createScenePanel(root, {
  onClear, onUndo, onFit, onCopyLink, onLoadUnlocated,
} = {}) {
  // replaceChildren ולא innerHTML: בדיקת האבטחה של הפרויקט אוסרת השמה
  // ל-innerHTML בקוד לקוח, ואיסור גורף עדיף על חריגים ש"בטוחים כרגע".
  root.replaceChildren();
  root.dataset.status = 'idle';
  // הפאנל מחזיק את מצב הכיווץ בעצמו ולא נשען על ה-HTML, כדי שהוא יתנהג
  // אותו דבר גם כשמרנדרים אותו לתוך אלמנט ריק.
  root.dataset.collapsed = root.dataset.collapsed === 'true' ? 'true' : 'false';

  const head = el('div', 'scene-panel__head');
  const title = el('div', 'scene-panel__title', STATUS_TEXT.idle);
  const toggle = el('button', 'scene-panel__toggle', '−');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'כווץ או הרחב את פאנל הסצנה');
  head.append(title, toggle);

  const body = el('div', 'scene-panel__body');
  const stages = el('ol', 'scene-panel__stages');
  const meta = el('div', 'scene-panel__meta');
  const counts = el('div', 'scene-panel__counts');
  const notes = el('ul', 'scene-panel__notes');
  const missing = el('div', 'scene-panel__missing');
  const actions = el('div', 'scene-panel__actions');
  body.append(stages, meta, counts, notes, missing, actions);
  root.append(head, body);

  toggle.addEventListener('click', () => {
    const collapsed = root.dataset.collapsed === 'true';
    root.dataset.collapsed = collapsed ? 'false' : 'true';
    toggle.textContent = collapsed ? '−' : '+';
  });

  const state = { startedAt: 0, reached: new Map(), scene: null, status: 'idle' };

  function renderStages(activeId) {
    stages.replaceChildren();
    const activeIndex = STAGES.findIndex((stage) => stage.id === activeId);
    STAGES.forEach((stage, index) => {
      const item = el('li', 'scene-panel__stage');
      const reached = state.reached.get(stage.id);
      item.dataset.state = reached ? 'done'
        : index === activeIndex ? 'active'
        : activeIndex >= 0 && index < activeIndex ? 'done'
        : 'pending';
      if (index === activeIndex) item.dataset.state = 'active';
      item.append(el('span', 'scene-panel__stage-dot'));
      item.append(el('span', 'scene-panel__stage-label', reached?.label || stage.label));
      if (reached?.ms != null) {
        item.append(el('span', 'scene-panel__stage-time', `${(reached.ms / 1000).toFixed(1)}s`));
      }
      stages.append(item);
    });
  }

  function setStatus(status, text) {
    state.status = status;
    root.dataset.status = status;
    title.textContent = text || STATUS_TEXT[status] || status;
  }

  /** אירוע שלב מהשרת. */
  function onProgress(data) {
    if (!data?.stage) return;
    if (data.stage === 'received') {
      state.startedAt = Date.now();
      state.reached.clear();
      state.scene = null;
      counts.replaceChildren();
      notes.replaceChildren();
      missing.replaceChildren();
      meta.replaceChildren();
      if (data.title) meta.append(el('div', 'scene-panel__question', data.title));
      const bits = [];
      if (data.date) bits.push(data.date);
      if (data.fact_policy) bits.push(`מדיניות: ${data.fact_policy}`);
      if (data.plan_steps) bits.push(`${data.plan_steps} שלבי גרף`);
      if (bits.length) meta.append(el('div', 'scene-panel__sub', bits.join(' · ')));
    }
    let label;
    if (data.stage === 'querying' && data.step_total) {
      label = `שואל את הגרף · שלב ${data.step_index}/${data.step_total}`
        + (data.rows != null ? ` · ${data.rows} שורות` : '');
    }
    state.reached.set(data.stage, {
      ms: state.startedAt ? Date.now() - state.startedAt : null,
      label,
    });
    renderStages(data.stage);
    setStatus('loading', label || STAGES.find((s) => s.id === data.stage)?.label);
  }

  function renderCounts(scene) {
    counts.replaceChildren();
    const pairs = [
      ['ממוקמים', scene.counts.located],
      ['ללא מיקום', scene.counts.unlocated],
      ['מקורות', scene.counts.sources],
    ];
    for (const [label, value] of pairs) {
      const cell = el('div', 'scene-panel__count');
      cell.append(el('strong', null, value));
      cell.append(el('span', null, label));
      counts.append(cell);
    }
    const quality = Object.entries(scene.quality || {});
    if (quality.length) {
      const row = el('div', 'scene-panel__quality');
      for (const [key, value] of quality) {
        const chip = el('span', 'scene-panel__chip', `${QUALITY_LABEL[key] || key} ${value}`);
        chip.dataset.quality = key;
        row.append(chip);
      }
      counts.append(row);
    }
  }

  function renderNotes(scene) {
    notes.replaceChildren();
    for (const warning of scene.warnings || []) {
      notes.append(el('li', 'scene-panel__note', warning));
    }
    for (const gap of scene.gaps || []) {
      const who = gap.subject || gap.step || gap.role || 'שלב';
      notes.append(el('li', 'scene-panel__note scene-panel__note--gap',
        `${who}: ${gap.reason}`));
    }
  }

  async function renderMissing(scene) {
    missing.replaceChildren();
    if (!scene.counts.unlocated || !onLoadUnlocated) return;
    const button = el('button', 'scene-panel__link',
      `הצג ${scene.counts.unlocated} ישויות ידועות ללא מיקום`);
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'טוען…';
      let items = [];
      try { items = await onLoadUnlocated(); }
      catch { button.textContent = 'לא ניתן לטעון את הרשימה'; button.disabled = false; return; }
      missing.replaceChildren();
      const list = el('ul', 'scene-panel__missing-list');
      for (const feature of items.slice(0, 200)) {
        const item = el('li', null, feature.properties?.name || feature.id);
        const kind = feature.properties?.entity_kind;
        if (kind) item.append(el('span', 'scene-panel__kind', kind));
        list.append(item);
      }
      missing.append(list);
      if (items.length > 200) {
        missing.append(el('div', 'scene-panel__sub', `ועוד ${items.length - 200}`));
      }
    });
    missing.append(button);
  }

  function renderActions(scene) {
    actions.replaceChildren();
    const buttons = [
      ['התאם תצוגה', onFit],
      ['בטל', onUndo],
      ['נקה', onClear],
      ['העתק קישור', onCopyLink],
    ];
    for (const [label, handler] of buttons) {
      if (!handler) continue;
      const button = el('button', 'scene-panel__action', label);
      button.type = 'button';
      button.disabled = !scene && label !== 'נקה';
      button.addEventListener('click', () => handler(scene));
      actions.append(button);
    }
  }

  /** סצנה מוכנה, או שינוי מצב חיבור. */
  function onScene(scene, status) {
    state.scene = scene || null;
    if (!scene) {
      state.reached.clear();
      renderStages(null);
      counts.replaceChildren();
      notes.replaceChildren();
      missing.replaceChildren();
      if (status !== 'loading') meta.replaceChildren();
      setStatus(status);
      renderActions(null);
      return;
    }
    state.reached.set('ready', {
      ms: state.startedAt ? Date.now() - state.startedAt : null,
    });
    renderStages('ready');
    meta.replaceChildren();
    meta.append(el('div', 'scene-panel__question', scene.title_he || ''));
    const bits = [];
    if (scene.temporal?.date) bits.push(scene.temporal.date);
    if (scene.fact_policy) bits.push(`מדיניות: ${scene.fact_policy}`);
    if (scene.scene_id) bits.push(scene.scene_id);
    meta.append(el('div', 'scene-panel__sub', bits.join(' · ')));
    renderCounts(scene);
    renderNotes(scene);
    renderMissing(scene);
    renderActions(scene);
    setStatus(status === 'ready' ? 'ready' : status,
      status === 'ready' ? STATUS_TEXT.ready : undefined);
  }

  renderStages(null);
  renderActions(null);
  return { element: root, onProgress, onScene, STAGES };
}
