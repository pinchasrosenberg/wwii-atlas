import { SearchIndex } from '../core/search-index.js?v=map-channel-19';
import { installOutsideDismiss } from '../core/outside-dismiss.js?v=map-channel-19';

const KIND_HE = {
  battle: 'קרב',
  camp: 'מחנה / גטו',
  place: 'מקום',
  route: 'נתיב',
  factory: 'מפעל',
  port: 'נמל',
};

const DATASET_LABELS = {
  supply_routes: 'מסדרונות אספקה',
  submarine_patrols: 'אזורי צוללות',
  railways: 'מסילות',
  camps: 'מחנות וגטאות',
  transports: 'טרנספורטים',
  fronts: 'קווי חזית',
  fortifications: 'ביצורים',
  aid_operations: 'מבצעי סיוע',
  famines: 'אזורי רעב',
  refugee_flows: 'זרימות פליטים',
  demographics: 'רשומות דמוגרפיות',
};

function node(tag, cls, text) {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
}

function isoFromDay(day) {
  return new Date(Date.UTC(1937, 0, 1) + day * 86400000).toISOString().slice(0, 10);
}

function dayFromIso(value) {
  return Math.round((Date.parse(`${value}T00:00:00Z`) - Date.UTC(1937, 0, 1)) / 86400000);
}

export class Workbench {
  constructor(root, {
    atlas,
    maritimeRoutes,
    engine,
    registry,
    onFocus,
    onTourStep,
    onRouteHighlight,
    onExport,
    onKiosk,
  }) {
    this.root = root;
    this.atlas = atlas;
    this.maritimeRoutes = maritimeRoutes;
    this.engine = engine;
    this.registry = registry;
    this.onFocus = onFocus;
    this.onTourStep = onTourStep;
    this.onRouteHighlight = onRouteHighlight;
    this.onExport = onExport;
    this.onKiosk = onKiosk;
    this.search = new SearchIndex();
    this.routes = [...maritimeRoutes, ...atlas.supply_routes];
    this.activeTool = null;
    this.tourIndex = 0;
    this._build();
    installOutsideDismiss({
      isOpen: () => !this.drawer.hidden,
      inside: () => [this.root],
      close: () => this.close(),
    });
  }

  async init() {
    await this.search.loadLexical();
  }

  _build() {
    this.root.replaceChildren();
    const toolbar = node('div', 'tool-strip');
    const tools = [
      ['search', '⌕', 'חיפוש'],
      ['routes', '⇄', 'מחשבון נתיב'],
      ['tour', '▶', 'סיור מודרך'],
      ['compare', '◫', 'השוואת זמנים'],
      ['sources', 'i', 'מקורות ושיטה'],
      ['export', '⇩', 'ייצוא'],
      ['kiosk', '▣', 'מצב קיוסק'],
    ];
    for (const [key, icon, label] of tools) {
      const button = node('button', 'tool-button');
      button.type = 'button';
      button.dataset.tool = key;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-controls', 'tool-drawer');
      button.setAttribute('aria-expanded', 'false');
      button.title = label;
      button.appendChild(node('span', 'tool-icon', icon));
      button.appendChild(node('span', 'tool-label', label));
      button.onclick = () => {
        if (key === 'kiosk') {
          this.onKiosk?.();
          return;
        }
        this.open(key);
      };
      toolbar.appendChild(button);
    }
    this.root.appendChild(toolbar);

    this.drawer = node('section', 'tool-drawer');
    this.drawer.id = 'tool-drawer';
    this.drawer.setAttribute('role', 'dialog');
    this.drawer.setAttribute('aria-modal', 'false');
    this.drawer.hidden = true;
    this.root.appendChild(this.drawer);
  }

  open(key) {
    if (this.activeTool === key && !this.drawer.hidden) {
      this.close();
      return;
    }
    this.activeTool = key;
    this.drawer.hidden = false;
    this.drawer.replaceChildren();
    const head = node('div', 'drawer-head');
    const titles = {
      search: 'חיפוש באטלס',
      routes: 'מחשבון נתיב ותפוקה',
      tour: 'סיור מודרך',
      compare: 'השוואת שני זמנים',
      sources: 'מקורות, כיסוי ושיטה',
      export: 'ייצוא התצוגה הנוכחית',
    };
    head.appendChild(node('strong', null, titles[key]));
    const close = node('button', 'drawer-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'סגירה');
    close.onclick = () => this.close();
    head.appendChild(close);
    this.drawer.appendChild(head);

    const body = node('div', 'drawer-body');
    this.drawer.appendChild(body);
    for (const button of this.root.querySelectorAll('.tool-button')) {
      const active = button.dataset.tool === key;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-expanded', active ? 'true' : 'false');
    }
    if (key === 'search') this._renderSearch(body);
    if (key === 'routes') this._renderRoutes(body);
    if (key === 'tour') this._renderTour(body);
    if (key === 'compare') this._renderCompare(body);
    if (key === 'sources') this._renderSources(body);
    if (key === 'export') this._renderExport(body);
    close.focus({ preventScroll: true });
  }

  close() {
    this.drawer.hidden = true;
    this.activeTool = null;
    for (const button of this.root.querySelectorAll('.tool-button')) {
      button.classList.remove('is-active');
      button.setAttribute('aria-expanded', 'false');
    }
  }

  _renderSearch(body) {
    const input = node('input', 'search-input');
    input.type = 'search';
    input.placeholder = 'למשל: למברג, Lviv, סטלינגרד…';
    input.setAttribute('aria-label', 'חיפוש מקום, קרב, מחנה או נתיב');
    body.appendChild(input);
    const note = node(
      'p',
      'drawer-note',
      'החיפוש משתמש במסד הקריאה של האטלס בלבד. בהרצה מקומית הוא עובר אוטומטית לאינדקס המובנה.',
    );
    body.appendChild(note);
    const results = node('div', 'search-results');
    body.appendChild(results);

    let sequence = 0;
    let controller = null;
    const render = async () => {
      results.replaceChildren();
      const query = input.value.trim();
      if (query.length < 2) return;
      const current = ++sequence;
      controller?.abort();
      controller = new AbortController();
      const remote = await this.search.searchRemote(query, {
        day: this.engine.day,
        limit: 16,
        signal: controller.signal,
      }).catch((error) => {
        if (error?.name === 'AbortError') return [];
        return null;
      });
      if (current !== sequence) return;
      const local = this.search.search(query, {
        day: this.engine.day,
        limit: 32,
      });
      const merged = [...(remote || []), ...local];
      const seen = new Set();
      const found = merged.filter((item) => {
        const key = item.ref || `${item.layer}:${item.label}:${item.lon}:${item.lat}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 16);
      if (!found.length) {
        results.appendChild(node('p', 'empty-note', 'לא נמצאה התאמה.'));
        return;
      }
      for (const item of found) {
        const button = node('button', 'search-result');
        button.type = 'button';
        const title = node('span', 'search-result-title', item.label);
        const meta = node(
          'span',
          'search-result-meta',
          `${KIND_HE[item.kind] || item.kind}${item.alt?.length ? ` · ${item.alt.filter(Boolean).slice(0, 2).join(' / ')}` : ''}`,
        );
        button.append(title, meta);
        button.onclick = () => {
          this.onFocus?.(item);
          this.close();
        };
        results.appendChild(button);
      }
    };
    input.addEventListener('input', () => {
      render().catch(() => {});
    });
    input.focus({ preventScroll: true });
  }

  _renderRoutes(body, selectedRouteId = null) {
    body.replaceChildren();
    body.appendChild(node(
      'p',
      'drawer-note',
      'בחרו מוצא ויעד. אם אין ביניהם מסלול מתועד במערך הנוכחי, המערכת לא תצייר קו אווירי.',
    ));

    const origins = [...new Set(this.routes.map((route) => route.origin_name_he))].sort();
    const destinations = [...new Set(this.routes.map((route) => route.destination_name_he))].sort();
    const origin = this._select('מוצא', origins);
    const destination = this._select('יעד', destinations);
    body.append(origin.wrap, destination.wrap);

    if (selectedRouteId) {
      const selected = this.routes.find((route) => route.route_id === selectedRouteId);
      if (selected) {
        origin.select.value = selected.origin_name_he;
        destination.select.value = selected.destination_name_he;
      }
    }

    const cargo = node('div', 'cargo-filters');
    for (const [value, label] of [
      ['fuel', 'דלק'], ['ordnance', 'תחמושת'], ['food', 'מזון'],
      ['vehicles', 'כלי רכב'], ['medical', 'רפואה'],
    ]) {
      const chip = node('button', 'cargo-chip', label);
      chip.type = 'button';
      chip.dataset.cargo = value;
      chip.onclick = () => {
        chip.classList.toggle('is-active');
        showResult();
      };
      cargo.appendChild(chip);
    }
    body.appendChild(cargo);

    const action = node('button', 'primary-action', 'חשב מסלול');
    body.appendChild(action);
    const result = node('div', 'route-result');
    body.appendChild(result);

    const showResult = () => {
      result.replaceChildren();
      const route = this.routes.find((item) => (
        item.origin_name_he === origin.select.value
        && item.destination_name_he === destination.select.value
      ));
      if (!route) {
        result.appendChild(node(
          'div',
          'coverage-warning',
          'אין מסלול ניתן לניתוב בין שתי הנקודות בכיסוי הנוכחי. לא מוצג קו חלופי.',
        ));
        this.onRouteHighlight?.([]);
        return;
      }
      const chosenCargo = [...cargo.querySelectorAll('.is-active')].map((item) => item.dataset.cargo);
      const translatedCargo = (route.cargo || []).map((item) => ({
        fuel: 'דלק', ordnance: 'תחמושת', food: 'מזון', vehicles: 'כלי רכב',
        medical: 'רפואה', aircraft: 'מטוסים', personnel: 'כוח אדם',
        raw_materials: 'חומרי גלם',
      }[item] || item));
      const compatible = !chosenCargo.length
        || chosenCargo.some((item) => (route.cargo || []).includes(item)
          || translatedCargo.includes(item));

      result.appendChild(node('h3', null, route.name_he));
      const facts = node('dl', 'route-facts');
      this._fact(facts, 'משך טיפוסי', `${route.duration_days} ימים`);
      this._fact(facts, 'מטען', translatedCargo.join(' · '));
      this._fact(facts, 'התאמה למסנן', compatible ? 'כן' : 'לא');
      this._fact(facts, 'צוואר בקבוק', route.bottleneck || route.geometry_note);
      result.appendChild(facts);
      this._drawThroughput(result, route);
      this.onRouteHighlight?.([route.route_id]);
    };
    action.onclick = showResult;
    if (selectedRouteId) showResult();
  }

  inspectRoute(routeId) {
    this.open('routes');
    this._renderRoutes(this.drawer.querySelector('.drawer-body'), routeId);
  }

  _drawThroughput(root, route) {
    const records = route.throughput || [];
    if (!records.length) {
      root.appendChild(node(
        'p',
        'empty-note',
        'לנתיב זה יש כרגע פרופיל סיכון, אך אין סדרת טונאז׳ פתוחה להצגה.',
      ));
      return;
    }
    const figure = node('figure', 'throughput-chart');
    figure.appendChild(node('figcaption', null, 'תפוקה לאורך זמן · טונות ארוכות'));
    const max = Math.max(...records.map((record) => record.tonnage), 1);
    const bars = node('div', 'throughput-bars');
    for (const record of records) {
      const bar = node('div', 'throughput-bar');
      bar.style.height = `${Math.max(4, (record.tonnage / max) * 100)}%`;
      bar.title = `${record.date}: ${record.tonnage.toLocaleString('he-IL')}`;
      if (Math.abs((record.day ?? dayFromIso(record.date)) - this.engine.day) <= 45) {
        bar.classList.add('is-current');
      }
      bars.appendChild(bar);
    }
    figure.appendChild(bars);
    const axis = node('div', 'throughput-axis');
    axis.append(
      node('span', null, records[0].date),
      node('span', null, records[records.length - 1].date),
    );
    figure.appendChild(axis);
    root.appendChild(figure);
  }

  _renderTour(body) {
    const steps = this.atlas.tour;
    const render = () => {
      body.replaceChildren();
      const item = steps[this.tourIndex];
      body.appendChild(node('div', 'tour-count', `${this.tourIndex + 1} מתוך ${steps.length}`));
      body.appendChild(node('h3', 'tour-title', item.title_he));
      body.appendChild(node('p', 'tour-body', item.body_he));
      const go = node('button', 'primary-action', 'הצג על המפה');
      go.onclick = () => this.onTourStep?.(item);
      body.appendChild(go);
      const nav = node('div', 'tour-nav');
      const prev = node('button', null, 'הקודם');
      prev.type = 'button';
      prev.disabled = this.tourIndex === 0;
      prev.onclick = () => { this.tourIndex--; render(); };
      const next = node('button', null, 'הבא');
      next.type = 'button';
      next.disabled = this.tourIndex === steps.length - 1;
      next.onclick = () => { this.tourIndex++; render(); };
      nav.append(prev, next);
      body.appendChild(nav);
    };
    render();
  }

  _renderCompare(body) {
    body.appendChild(node(
      'p',
      'drawer-note',
      'ההשוואה מסכמת אילו שכבות תוכן פעילות בכל תאריך. היא אינה משווה קטגוריות דמוגרפיות שאינן ניתנות להשוואה.',
    ));
    const a = this._dateInput('זמן א׳', isoFromDay(Math.max(this.engine.minDay, this.engine.day - 365)));
    const b = this._dateInput('זמן ב׳', isoFromDay(this.engine.day));
    body.append(a.wrap, b.wrap);
    const button = node('button', 'primary-action', 'השווה');
    body.appendChild(button);
    const output = node('div', 'compare-output');
    body.appendChild(output);
    button.onclick = () => {
      const dayA = dayFromIso(a.input.value);
      const dayB = dayFromIso(b.input.value);
      output.replaceChildren();
      const table = node('table', 'compare-table');
      const head = node('tr');
      for (const title of ['שכבה', a.input.value, b.input.value]) {
        head.appendChild(node('th', null, title));
      }
      table.appendChild(head);
      for (const [key, label] of Object.entries(DATASET_LABELS)) {
        const rows = this.atlas[key] || [];
        const countAt = (day) => rows.filter((item) => (
          (item.day_from ?? -Infinity) <= day && day <= (item.day_to ?? Infinity)
        )).length;
        const row = node('tr');
        row.append(node('td', null, label), node('td', null, String(countAt(dayA))),
          node('td', null, String(countAt(dayB))));
        table.appendChild(row);
      }
      output.appendChild(table);
    };
    button.click();
  }

  _renderSources(body) {
    body.appendChild(node('div', 'coverage-warning', this.atlas.metadata.coverage_note_he));
    const principles = node('ul', 'method-list');
    for (const text of [
      'אין ישות ללא source_ids.',
      'שחזור אלגוריתמי מסומן כהסקה ולא כעובדה.',
      'טרנספורט שאינו ניתן לניתוב אינו מוצג כקו אווירי.',
      'שכבות רדיפה אינן מונפשות ואינן מוצגות כאסתטיקה של משחק.',
      'ה־RAG המקומי הוא כלי פיתוח בלבד; האתר אינו פונה ל־localhost.',
    ]) principles.appendChild(node('li', null, text));
    body.appendChild(principles);
    const list = node('div', 'source-list');
    for (const source of this.atlas.metadata.sources) {
      const item = node('article', 'source-item');
      item.appendChild(node('strong', null, source.name));
      item.appendChild(node('span', null, source.license));
      if (/^https:\/\//.test(source.url)) {
        const link = node('a', null, 'פתח מקור');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.appendChild(link);
      }
      list.appendChild(item);
    }
    body.appendChild(list);
  }

  _renderExport(body) {
    body.appendChild(node(
      'p',
      'drawer-note',
      'הייצוא כולל רק ישויות בחלון המפה ובתאריך הנוכחי, יחד עם מזהי המקור ורמת ההסקה.',
    ));
    const csv = node('button', 'primary-action', 'הורד CSV');
    csv.onclick = () => this.onExport?.('csv');
    const geo = node('button', 'secondary-action', 'הורד GeoJSON');
    geo.onclick = () => this.onExport?.('geojson');
    body.append(csv, geo);
  }

  _select(labelText, values) {
    const wrap = node('label', 'field-wrap');
    wrap.appendChild(node('span', null, labelText));
    const select = node('select');
    for (const value of values) {
      const option = node('option', null, value);
      option.value = value;
      select.appendChild(option);
    }
    wrap.appendChild(select);
    return { wrap, select };
  }

  _dateInput(labelText, value) {
    const wrap = node('label', 'field-wrap');
    wrap.appendChild(node('span', null, labelText));
    const input = node('input');
    input.type = 'date';
    input.min = '1937-01-01';
    input.max = '1946-12-31';
    input.value = value;
    wrap.appendChild(input);
    return { wrap, input };
  }

  _fact(list, key, value) {
    if (!value) return;
    list.append(node('dt', null, key), node('dd', null, String(value)));
  }
}
