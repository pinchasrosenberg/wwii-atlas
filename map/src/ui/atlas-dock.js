import { installOutsideDismiss } from '../core/outside-dismiss.js?v=map-channel-19';

const TITLES = {
  layers: 'שכבות האטלס',
  events: 'מה קורה עכשיו',
  tools: 'חיפוש וכלי מחקר',
  legend: 'מקרא פעיל',
  details: 'פרטי הישות',
  selection: 'ישות וקשרים',
  chain: 'שרשרת האספקה',
};

export class AtlasDock {
  constructor(root, toggle) {
    this.root = root;
    this.toggle = toggle;
    this.active = 'layers';
    this.mode = 'overview';
    this.title = root.querySelector('[data-dock-title]');
    this.closeButton = root.querySelector('[data-dock-close]');
    this.tabs = [...root.querySelectorAll('[data-dock-tab]')];
    this.panels = [...root.querySelectorAll('[data-dock-panel]')];

    toggle?.addEventListener('click', () => {
      if (this.root.hidden) this.open(this.mode === 'relations' ? 'selection' : this.active);
      else this.close();
    });
    this.closeButton?.addEventListener('click', () => this.close());
    for (const tab of this.tabs) tab.addEventListener('click', () => this.open(tab.dataset.dockTab));

    document.addEventListener('atlas:card-open', () => this.open('details'));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.root.hidden) this.close();
    });
    installOutsideDismiss({
      isOpen: () => !this.root.hidden,
      inside: () => [this.root, this.toggle],
      close: () => this.close(),
    });
    this.setMode(document.body.dataset.mapMode || 'overview');
    this.close();
  }

  open(tab = this.active) {
    const allowed = this.tabs.some((item) => item.dataset.dockTab === tab && !item.hidden);
    this.active = allowed ? tab : this.mode === 'relations' ? 'selection' : 'layers';
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.toggle?.setAttribute('aria-expanded', 'true');
    if (this.title) this.title.textContent = TITLES[this.active] || 'אטלס';
    for (const item of this.tabs) {
      const selected = item.dataset.dockTab === this.active;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    for (const panel of this.panels) panel.hidden = panel.dataset.dockPanel !== this.active;
  }

  close() {
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.toggle?.setAttribute('aria-expanded', 'false');
  }

  setMode(mode) {
    this.mode = mode === 'relations' ? 'relations' : 'overview';
    for (const item of this.tabs) {
      const scope = item.dataset.dockScope || 'both';
      item.hidden = scope !== 'both' && scope !== this.mode;
    }
    const activeTab = this.tabs.find((item) => item.dataset.dockTab === this.active);
    if (!activeTab || activeTab.hidden) this.active = this.mode === 'relations' ? 'selection' : 'layers';
    if (!this.root.hidden) this.open(this.active);
  }
}
