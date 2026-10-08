const LAYER_LABEL = {
  battles: 'קרב',
  'legacy-battles': 'קרב',
  fronts: 'חזית',
  camps: 'מחנה או גטו',
  'legacy-sites': 'חיסול גטו',
  transports: 'טרנספורט',
  'legacy-deportations': 'גירוש',
  'legacy-sinkings': 'הטבעה',
  'legacy-air-raids': 'הפצצה',
  'aid-operations': 'סיוע',
  famines: 'משבר הומניטרי',
  'supply-corridors': 'אספקה',
};

function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function eventFrom(item, layer, fallbackDay = 0) {
  const position = item.position || item.path?.[0] || item.polygon?.[0] || null;
  return {
    id: item.id || item.route_id,
    label: item.name_he || item.name_en || item.id || item.route_id,
    kind: LAYER_LABEL[layer] || layer,
    layer,
    from: item.day_from ?? item.day ?? fallbackDay,
    to: item.day_to ?? item.day ?? fallbackDay,
    lon: position?.[0],
    lat: position?.[1],
    summary: item.summary_he || item.note_he || item.context_he || item.coverage_he || '',
  };
}

function number(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('he-IL').format(value) : null;
}

export class EventFeed {
  constructor(root, engine, {
    atlas, battles, legacyBattles, legacyPlaces, legacyMaritime, legacyMotion, onFocus,
  }) {
    this.root = root;
    this.engine = engine;
    this.onFocus = onFocus;
    this.collapsed = false;
    this.events = [
      ...(battles || []).map((item) => eventFrom(item, 'battles')),
      ...(atlas.fronts || []).map((item) => eventFrom(item, 'fronts')),
      ...(atlas.camps || []).map((item) => eventFrom(item, 'camps')),
      ...(atlas.transports || []).map((item) => eventFrom(item, 'transports')),
      ...(atlas.aid_operations || []).map((item) => eventFrom(item, 'aid-operations')),
      ...(atlas.famines || []).map((item) => eventFrom(item, 'famines')),
      ...(atlas.supply_routes || []).map((item) => eventFrom(item, 'supply-corridors')),
    ];

    for (const battle of legacyBattles?.battles || []) {
      const tanks = (battle.oob || []).reduce((sum, row) => sum + (row.tanks || 0), 0);
      const strength = (battle.oob || []).reduce((sum, row) => sum + (row.strength || 0), 0);
      const detail = [
        (battle.bl || []).slice(0, 3).join(', '),
        battle.cas ? `~${number(battle.cas)} אבדות` : '',
        tanks ? `${number(tanks)} טנקים` : '',
        strength ? `${number(strength)} חיילים` : '',
      ].filter(Boolean).join(' · ');
      this.events.push({
        id: battle.id, label: battle.n, kind: 'קרב', layer: 'legacy-battles',
        from: battle.f, to: (battle.e ?? battle.f) + 4, lon: battle.x, lat: battle.y,
        summary: detail,
      });
    }

    for (const site of legacyPlaces?.sites || []) {
      if (site.type !== 'ghetto' || !Number.isFinite(site.day_to) || !(site.deaths_max > 0)) continue;
      this.events.push({
        id: site.id, label: `גטו ${site.name}`, kind: 'חיסול גטו', layer: 'legacy-sites',
        from: site.day_to, to: site.day_to, lon: site.position?.[0], lat: site.position?.[1],
        summary: `נרצחו ${number(site.deaths_min) || '?'}–${number(site.deaths_max)}`,
      });
    }

    for (const route of legacyMotion?.deportation_routes || []) {
      this.events.push({
        id: route.id, label: `${route.name} ← ${route.destination}`, kind: 'גירוש',
        layer: 'campaign-motion', from: route.day, to: route.day,
        lon: route.path?.[0]?.[0], lat: route.path?.[0]?.[1], summary: 'רכבת גירוש על תוואי המסילה',
      });
    }
    for (const transport of legacyMaritime?.transports || []) {
      this.events.push({
        id: transport.id, label: transport.id, kind: 'טרנספורט', layer: 'campaign-motion',
        from: transport.d, to: transport.d, lon: transport.c?.[0]?.[0], lat: transport.c?.[0]?.[1],
        summary: 'רכבת על תוואי המסילה',
      });
    }
    for (const sinking of legacyMaritime?.sinkings || []) {
      this.events.push({
        id: sinking.id, label: sinking.n || 'אנייה', kind: 'הטבעה', layer: 'naval-losses',
        from: sinking.d, to: sinking.d, lon: sinking.x, lat: sinking.y,
        summary: [sinking.c, sinking.t ? `${number(sinking.t)} GRT` : '', sinking.cl ? `${number(sinking.cl)} אבדות צוות` : ''].filter(Boolean).join(' · '),
      });
    }
    const packedAir = legacyMotion?.air_raids;
    for (const [index, row] of (packedAir?.v || []).entries()) {
      if ((row[4] || 0) < 150) continue;
      this.events.push({
        id: `legacy-air:${index}`, label: row[6] >= 0 ? packedAir.n?.[row[6]] : 'פשיטה אווירית',
        kind: 'הפצצה', layer: 'campaign-motion', from: row[2], to: row[2], lon: row[0], lat: row[1],
        summary: `${number(row[3])} גיחות · ${number(row[4])} טון${row[7] >= 0 ? ` · ${packedAir.f?.[row[7]]}` : ''}`,
      });
    }

    this.events = this.events.filter((item) => item.label && Number.isFinite(item.from));
    engine.subscribe(() => this.render());
    this.render();
  }

  render() {
    this.root.replaceChildren();
    const head = text('div', '', 'feed-head');
    const heading = text('div', '', 'feed-heading');
    heading.append(text('strong', 'מה קורה עכשיו'), text('small', 'קרבות, גירושים, הטבעות והפצצות'));
    const toggle = text('button', this.collapsed ? 'אירועים' : '−', 'feed-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', this.collapsed ? 'פתיחת ציר האירועים' : 'כיווץ ציר האירועים');
    toggle.onclick = () => { this.collapsed = !this.collapsed; this.render(); };
    head.append(heading, toggle);
    this.root.appendChild(head);
    this.root.classList.toggle('is-collapsed', this.collapsed);
    if (this.collapsed) return;

    const day = this.engine.day;
    const nearby = this.events
      .map((item) => ({
        ...item,
        distance: day < item.from ? item.from - day : day > item.to ? day - item.to : 0,
      }))
      .filter((item) => item.distance <= 120)
      .sort((a, b) => a.distance - b.distance || b.from - a.from)
      .slice(0, 14);

    const list = text('div', '', 'feed-list');
    if (!nearby.length) list.appendChild(text('p', 'אין אירועים מתועדים בסביבת התאריך הזה.', 'feed-empty'));
    for (const item of nearby) {
      const button = text('button', '', 'feed-item');
      button.type = 'button';
      button.dataset.layer = item.layer;
      const when = item.distance === 0
        ? 'פעיל בתאריך הנבחר'
        : `${Math.max(1, Math.round(item.distance / 7))} שבועות מהתאריך`;
      button.append(
        text('span', item.kind, 'feed-kind'),
        text('strong', item.label),
        text('small', item.summary ? `${when} · ${item.summary}` : when),
      );
      button.onclick = () => this.onFocus?.(item);
      list.appendChild(button);
    }
    this.root.appendChild(list);
  }
}

export function buildActivityHistogram(atlas, battles, minDay, maxDay, bucketCount = 120) {
  const values = new Array(bucketCount).fill(0);
  const span = Math.max(1, maxDay - minDay);
  const collections = [
    battles || [], atlas.fronts || [], atlas.transports || [], atlas.camps || [],
    atlas.supply_routes || [], atlas.aid_operations || [], atlas.submarine_patrols || [],
  ];
  for (const collection of collections) {
    for (const item of collection) {
      const day = item.day_from ?? item.day;
      if (!Number.isFinite(day)) continue;
      const index = Math.max(0, Math.min(bucketCount - 1, Math.floor(((day - minDay) / span) * bucketCount)));
      values[index] += 1;
    }
  }
  return values;
}

/** העתקה שמרנית של מדד הצפיפות מקובץ האטלס המקורי. */
export function buildLegacyActivityDensity({ battles, places, maritime, motion }, minDay, maxDay) {
  const density = new Float32Array(maxDay - minDay + 1);
  const add = (from, to, weight) => {
    if (!Number.isFinite(from)) return;
    const start = Math.max(minDay, Math.round(from));
    const end = Math.min(maxDay, Math.round(to ?? from));
    for (let day = start; day <= end; day += 1) density[day - minDay] += weight;
  };
  for (const battle of battles?.battles || []) add(battle.f - 2, (battle.e ?? battle.f) + 2, 2);
  for (const sinking of maritime?.sinkings || []) add(sinking.d, sinking.d + 5, 0.4);
  for (const route of motion?.deportation_routes || []) add(route.day - 3, route.day + 3, 1);
  for (const site of places?.sites || []) {
    if (site.type === 'ghetto' && Number.isFinite(site.day_to) && site.deaths_max > 0) {
      add(site.day_to - 3, site.day_to + 3, 1.5);
    }
  }
  for (const row of motion?.air_raids?.v || []) add(row[2], row[2], Math.min((row[4] || 0) / 500, 0.8));
  return density;
}

export function bucketActivityDensity(density, bucketCount = 120) {
  const buckets = new Array(bucketCount).fill(0);
  const counts = new Array(bucketCount).fill(0);
  for (let index = 0; index < density.length; index += 1) {
    const bucket = Math.min(bucketCount - 1, Math.floor((index / density.length) * bucketCount));
    buckets[bucket] += density[index];
    counts[bucket] += 1;
  }
  return buckets.map((value, index) => value / Math.max(1, counts[index]));
}
