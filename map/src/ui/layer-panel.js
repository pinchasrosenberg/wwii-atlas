/**
 * פאנל השכבות והמקרא הדינמי — מסלול A.
 *
 * הפאנל נבנה מהרג'יסטר ואינו יודע אילו שכבות קיימות. המקרא מציג רק
 * שכבות פעילות ומתעדכן בכל שינוי (סעיף 8.1 באפיון).
 */

export class LayerPanel {
  constructor(root, registry, { getTier }) {
    this.root = root;
    this.registry = registry;
    this.getTier = getTier;
    this.rows = new Map();
    this._build();
    registry.subscribe((e) => this._onChange(e));
  }

  _build() {
    this.root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'panel-head';
    head.textContent = 'שכבות';
    this.root.appendChild(head);

    for (const [group, ids] of this.registry.groups) {
      const g = document.createElement('div');
      g.className = 'panel-group';

      const gh = document.createElement('button');
      gh.type = 'button';
      gh.className = 'panel-group-head';
      gh.textContent = group;
      g.appendChild(gh);

      const body = document.createElement('div');
      body.className = 'panel-group-body';
      for (const id of ids) body.appendChild(this._row(id));
      g.appendChild(body);
      const open = ids.some((id) => this.registry.stateOf(id).visible);
      g.classList.toggle('is-open', open);
      gh.setAttribute('aria-expanded', String(open));
      gh.onclick = () => {
        const next = !g.classList.contains('is-open');
        g.classList.toggle('is-open', next);
        gh.setAttribute('aria-expanded', String(next));
      };
      this.root.appendChild(g);
    }

    this.capNote = document.createElement('div');
    this.capNote.className = 'panel-note';
    this.root.appendChild(this.capNote);
    this._updateCap();
  }

  _row(id) {
    const spec = this.registry.get(id);
    const st = this.registry.stateOf(id);

    const row = document.createElement('div');
    row.className = 'panel-row';

    const label = document.createElement('label');
    label.className = 'panel-label';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = st.visible;
    cb.onchange = () => this.registry.setVisible(id, cb.checked, this.getTier());
    label.appendChild(cb);

    const name = document.createElement('span');
    name.textContent = spec.label;
    label.appendChild(name);

    const status = document.createElement('span');
    status.className = 'panel-status';
    label.appendChild(status);

    row.appendChild(label);

    const op = document.createElement('input');
    op.type = 'range';
    op.min = '0'; op.max = '1'; op.step = '0.05';
    op.value = String(st.opacity);
    op.className = 'panel-opacity';
    op.setAttribute('aria-label', `שקיפות — ${spec.label}`);
    op.oninput = () => this.registry.setOpacity(id, Number(op.value));
    row.appendChild(op);

    this.rows.set(id, { row, cb, status, op });
    return row;
  }

  _onChange(e) {
    const r = this.rows.get(e.id);
    if (r) {
      const st = this.registry.stateOf(e.id);
      r.cb.checked = st.visible;
      r.status.textContent =
        st.status === 'loading' ? '…' :
        st.status === 'error' ? '⚠' : '';
      r.status.title = st.error || '';
      r.row.classList.toggle('is-error', st.status === 'error');
      if (st.visible) {
        const group = r.row.closest('.panel-group');
        group?.classList.add('is-open');
        group?.querySelector('.panel-group-head')?.setAttribute('aria-expanded', 'true');
      }
    }
    if (e.type === 'blocked') this._flashCap();
    this._updateCap();
  }

  _updateCap() {
    const tier = this.getTier();
    const cap = this.registry.tierCaps[tier].maxLayers;
    const n = this.registry.visibleIds.length;
    this.capNote.textContent = `${n} מתוך ${cap} שכבות פעילות`;
  }

  _flashCap() {
    this.capNote.classList.add('flash');
    setTimeout(() => this.capNote.classList.remove('flash'), 900);
  }
}

export class Legend {
  constructor(root, registry, { getContext = () => ({}) } = {}) {
    this.root = root;
    this.registry = registry;
    this.getContext = getContext;
    this.collapsed = false;
    registry.subscribe(() => this.render());
    this.render();
  }

  render() {
    const items = this.registry.activeLegend(this.getContext());
    this.root.replaceChildren();

    if (this.collapsed) {
      const open = document.createElement('button');
      open.className = 'legend-reopen';
      open.textContent = 'מקרא';
      open.onclick = () => { this.collapsed = false; this.render(); };
      this.root.appendChild(open);
      return;
    }

    if (!items.length) { this.root.style.display = 'none'; return; }
    this.root.style.display = '';

    const head = document.createElement('div');
    head.className = 'legend-head';
    head.appendChild(textEl('span', 'מקרא'));
    const x = document.createElement('button');
    x.className = 'legend-x';
    x.textContent = '×';
    x.setAttribute('aria-label', 'סגירת המקרא');
    x.onclick = () => { this.collapsed = true; this.render(); };
    head.appendChild(x);
    this.root.appendChild(head);

    for (const item of items) {
      const block = document.createElement('div');
      block.className = 'legend-block';
      block.appendChild(textEl('div', item.layer, 'legend-layer'));
      for (const entry of item.entries) {
        const row = document.createElement('div');
        row.className = 'legend-row';
        const sw = document.createElement('span');
        sw.className = 'legend-swatch';
        sw.style.background = `rgb(${entry.color.join(',')})`;
        // לא רק צבע: כל ערך נושא גם צורה או דפוס (דרישת נגישות)
        if (entry.shape === 'square') sw.style.borderRadius = '2px';
        row.appendChild(sw);
        row.appendChild(textEl('span', entry.label));
        block.appendChild(row);
      }
      if (item.context) {
        const context = document.createElement('p');
        context.className = 'legend-context';
        context.textContent = item.context;
        block.appendChild(context);
      }
      this.root.appendChild(block);
    }
  }
}

function textEl(tag, text, cls) {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
