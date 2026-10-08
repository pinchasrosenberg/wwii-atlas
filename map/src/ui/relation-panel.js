import { chainsForEntity, relationsForChain } from '../core/network-store.js?v=map-channel-19';

const TYPE_HE = {
  factory: 'מפעל',
  port: 'נמל',
  supply_route: 'נתיב',
  headquarters: 'מפקדה',
  battle: 'קרב',
};

const STATUS_HE = {
  real: 'נתון אמיתי',
  mixed: 'נתון מעורב',
  mock: 'mock עיצובי',
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class RelationPanel {
  constructor(panelRoot, dockRoot, data, { onSelect, onChainSelect }) {
    this.panelRoot = panelRoot;
    this.dockRoot = dockRoot;
    this.data = data;
    this.onSelect = onSelect;
    this.onChainSelect = onChainSelect;
    this.activeChainId = null;
  }

  render(entityId, day) {
    const entity = this.data.entityById.get(entityId);
    if (!entity) return;
    const chains = chainsForEntity(this.data, entityId);
    if (!chains.includes(this.activeChainId)) this.activeChainId = chains[0] || null;
    this._renderPanel(entity, day, chains);
    this._renderDock(entityId, day);
  }

  _renderPanel(entity, day, chains) {
    this.panelRoot.replaceChildren();
    const kicker = el('div', 'selection-kicker', 'ישות נבחרת');
    const title = el('h2', null, entity.name_he);
    const meta = el('div', 'selection-meta');
    meta.append(
      el('span', `data-chip status-${entity.data_status}`, STATUS_HE[entity.data_status]),
      el('span', 'data-chip', TYPE_HE[entity.entity_type] || entity.entity_type),
    );
    const summary = el('p', 'selection-summary', entity.summary_he);
    const warning = el(
      'div',
      'selection-warning',
      entity.data_status === 'real'
        ? 'הישות מעוגנת בנתון קיים; הקשרים סביבה עדיין עשויים להיות mock.'
        : 'אב־טיפוס עיצובי: אין להשתמש בישות או בקשריה כמסקנה היסטורית.',
    );
    this.panelRoot.append(kicker, title, meta, summary, warning);

    if (chains.length > 1) {
      const switcher = el('div', 'chain-switcher');
      for (const chainId of chains) {
        const button = el(
          'button',
          chainId === this.activeChainId ? 'is-active' : '',
          chainId.includes('persian') ? 'המסדרון הפרסי' : 'האטלנטי ונורמנדי',
        );
        button.type = 'button';
        button.onclick = () => {
          this.activeChainId = chainId;
          this.onChainSelect?.(chainId, entity.id);
        };
        switcher.appendChild(button);
      }
      this.panelRoot.appendChild(switcher);
    }

    const facts = el('dl', 'selection-facts');
    const rows = [
      ['מזהה קנוני', entity.id],
      ['אמינות', entity.confidence],
      ['מקורות', (entity.source_ids || []).join(' · ')],
    ];
    for (const [label, value] of rows) {
      facts.append(el('dt', null, label), el('dd', null, value || '—'));
    }
    this.panelRoot.appendChild(facts);
  }

  _renderDock(selectedId, day) {
    this.dockRoot.replaceChildren();
    if (!this.activeChainId) return;
    const relations = relationsForChain(this.data, this.activeChainId);
    const heading = el('div', 'chain-dock-head');
    heading.append(
      el('strong', null, this.activeChainId.includes('persian') ? 'שרשרת המסדרון הפרסי' : 'שרשרת אטלנטית לנורמנדי'),
      el('span', null, 'הקשרים המקווקווים מסומנים כ־mock'),
    );
    const flow = el('div', 'chain-flow');
    const orderedIds = relations.length
      ? [relations[0].from_id, ...relations.map((item) => item.to_id)]
      : [];
    orderedIds.forEach((id, index) => {
      const entity = this.data.entityById.get(id);
      if (!entity) return;
      const button = el('button', `chain-node${id === selectedId ? ' is-active' : ''}`);
      button.type = 'button';
      button.dataset.status = entity.data_status;
      button.append(
        el('span', 'chain-node-kind', TYPE_HE[entity.entity_type] || entity.entity_type),
        el('strong', null, entity.name_he),
      );
      button.onclick = () => this.onSelect?.(id, this.activeChainId);
      flow.appendChild(button);
      if (index < relations.length) {
        const relation = relations[index];
        const connector = el('div', `chain-connector status-${relation.data_status}`);
        connector.append(el('span', null, relation.label_he), el('i', null, '←'));
        flow.appendChild(connector);
      }
    });
    this.dockRoot.append(heading, flow);
  }
}
