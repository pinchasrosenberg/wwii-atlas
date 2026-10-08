import { loadAtlasData, loadJson } from '../core/data-store.js?v=map-channel-19';

const DATA_URL = './data/motion/motion.json';
const BATTLES_URL = './data/legacy/battles.json';
const CONVOYS_URL = './data/stage2/convoy-routes.json';

const AXIS = [160, 68, 45, 92];
const OCCUPIED = [184, 126, 82, 78];
const ALLIES = [43, 108, 163, 100];
const PAPER = [250, 247, 239, 220];

let spriteAtlas = null;
const spriteMapping = {};

function rounded(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function drawTankSprite(ctx, offset, color) {
  const x = offset + 32;
  ctx.save();
  ctx.shadowColor = 'rgba(45,30,20,.32)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
  ctx.strokeStyle = 'rgba(255,253,247,.95)'; ctx.lineWidth = 5;
  rounded(ctx, x - 21, 19, 37, 9, 4); ctx.stroke();
  rounded(ctx, x - 21, 36, 37, 9, 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 17, 27); ctx.lineTo(x + 15, 27); ctx.lineTo(x + 23, 32);
  ctx.lineTo(x + 15, 37); ctx.lineTo(x - 17, 37); ctx.closePath(); ctx.stroke();
  ctx.shadowColor = 'transparent';
  const dark = '#382b22';
  ctx.fillStyle = dark; rounded(ctx, x - 21, 19, 37, 9, 4); ctx.fill();
  rounded(ctx, x - 21, 36, 37, 9, 4); ctx.fill();
  const body = ctx.createLinearGradient(x - 18, 25, x + 18, 39);
  body.addColorStop(0, color); body.addColorStop(1, dark);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(x - 17, 27); ctx.lineTo(x + 15, 27); ctx.lineTo(x + 23, 32);
  ctx.lineTo(x + 15, 37); ctx.lineTo(x - 17, 37); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x - 1, 32, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 5, 31); ctx.lineTo(x + 26, 31); ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
}

function drawInfantrySprite(ctx, offset, color) {
  const x = offset + 32;
  ctx.save();
  ctx.shadowColor = 'rgba(45,30,20,.28)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(255,253,247,.96)'; ctx.lineWidth = 3;
  rounded(ctx, x - 20, 21, 40, 25, 4); ctx.fill(); ctx.stroke();
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#fffdf7'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - 15, 25); ctx.lineTo(x + 15, 42);
  ctx.moveTo(x - 15, 42); ctx.lineTo(x + 15, 25); ctx.stroke();
  ctx.restore();
}

function drawPlaneSprite(ctx, offset) {
  const x = offset + 32;
  ctx.save(); ctx.translate(x, 32);
  ctx.shadowColor = 'rgba(20,35,45,.3)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#255f88'; ctx.strokeStyle = '#fffdf7'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(9, 4); ctx.lineTo(-3, 20); ctx.lineTo(-9, 20);
  ctx.lineTo(-5, 5); ctx.lineTo(-17, 5); ctx.lineTo(-23, 11); ctx.lineTo(-26, 11);
  ctx.lineTo(-26, -11); ctx.lineTo(-23, -11); ctx.lineTo(-17, -5); ctx.lineTo(-5, -5);
  ctx.lineTo(-9, -20); ctx.lineTo(-3, -20); ctx.lineTo(9, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawTrainSprite(ctx, offset) {
  const x = offset + 5;
  ctx.save(); ctx.shadowColor = 'rgba(40,25,20,.3)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#674052'; ctx.strokeStyle = '#fffdf7'; ctx.lineWidth = 2;
  rounded(ctx, x, 24, 19, 20, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#412b31'; ctx.fillRect(x + 9, 17, 8, 9);
  for (let i = 0; i < 3; i += 1) { rounded(ctx, x + 21 + i * 11, 28, 9, 14, 2); ctx.fillStyle = '#674052'; ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#2f2827'; for (let i = 0; i < 5; i += 1) { ctx.beginPath(); ctx.arc(x + 8 + i * 11, 46, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawShipSprite(ctx, offset) {
  const x = offset + 32;
  ctx.save(); ctx.shadowColor = 'rgba(20,35,45,.3)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#285f80'; ctx.strokeStyle = '#fffdf7'; ctx.lineWidth = 2.3;
  ctx.beginPath(); ctx.moveTo(x + 25, 32); ctx.lineTo(x + 13, 41); ctx.lineTo(x - 22, 41);
  ctx.lineTo(x - 28, 31); ctx.lineTo(x + 20, 27); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(x - 8, 18, 18, 11); ctx.strokeRect(x - 8, 18, 18, 11);
  ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, 10); ctx.stroke();
  ctx.restore();
}

function getSpriteAtlas() {
  if (spriteAtlas) return spriteAtlas;
  const icons = ['tank-axis', 'tank-allies', 'inf-axis', 'inf-allies', 'plane', 'train', 'ship'];
  const canvas = document.createElement('canvas'); canvas.width = icons.length * 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  drawTankSprite(ctx, 0, '#8a522e'); drawTankSprite(ctx, 64, '#315f82');
  drawInfantrySprite(ctx, 128, '#8a522e'); drawInfantrySprite(ctx, 192, '#315f82');
  drawPlaneSprite(ctx, 256); drawTrainSprite(ctx, 320); drawShipSprite(ctx, 384);
  icons.forEach((id, index) => { spriteMapping[id] = { x: index * 64, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32 }; });
  spriteAtlas = canvas;
  return canvas;
}

function interpolatePath(path, phase) {
  if (!path?.length) return null;
  if (path.length === 1) return path[0];
  const scaled = ((phase % 1) + 1) % 1 * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(scaled));
  const t = scaled - index;
  return [
    path[index][0] + (path[index + 1][0] - path[index][0]) * t,
    path[index][1] + (path[index + 1][1] - path[index][1]) * t,
  ];
}

function angleOf(path, phase) {
  const a = interpolatePath(path, phase);
  const b = interpolatePath(path, phase + 0.015);
  if (!a || !b) return 0;
  return 90 - Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
}

function pickContour(contours, day) {
  let selected = null;
  for (const item of contours) {
    if (item.d > day) break;
    selected = item;
  }
  return selected?.p || [];
}

function ownerColor(grid, owner) {
  const cls = owner >= 0 ? grid.cls?.[owner] : 'axis';
  if (cls === 'occ') return OCCUPIED;
  return AXIS;
}

//: ‏כרטיס הפצצה. הגודל על המפה הוא סדר גודל; המספר המדויק כאן.
const raidCard = {
  title: () => 'הפצצה אווירית',
  subtitle: 'רשומת גיחה מתוך מסד ההפצצות',
  fieldsOf: (item, formatDay) => [
    { label: 'תאריך', value: formatDay(item.day) },
    { label: 'טונות פצצות', value: item.tons != null ? Math.round(item.tons).toLocaleString('he-IL') : null },
    { label: 'גיחות', value: item.missions || null },
    { label: 'מטוסים', value: item.aircraft || null },
    {
      label: 'מה מציין העיגול',
      value: 'טונאז׳ — לא שטח הפגיעה',
      derivation: 'algorithmic',
      note: 'שטח העיגול פרופורציוני לכמות הפצצות. הנקודה במרכז היא המטרה.',
    },
  ].filter((row) => row.value != null && row.value !== ''),
};

export function createLegacyMotionLayer({ IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer }) {
  let dayCache = null;

  return {
    id: 'campaign-motion',
    label: 'התקדמות חזית וכוחות בתנועה',
    group: 'תנועה ואנימציה',
    defaultOn: true,
    opacity: 0.95,
    legend: [
      { color: AXIS.slice(0, 3), label: 'כיבוש / התקדמות הציר', shape: 'square' },
      { color: ALLIES.slice(0, 3), label: 'שחרור / התקדמות בעלות הברית', shape: 'square' },
      { color: [39, 91, 132], label: 'מטוס, שיירה או תצורה בתנועה', shape: 'triangle' },
      { color: [179, 38, 30], label: 'הפצצה — עיגול קטן ≈ 100 טון', shape: 'circle' },
      { color: [166, 34, 27], label: 'הפצצה — עיגול בינוני ≈ 1,000 טון', shape: 'circle' },
      { color: [143, 26, 20], label: 'הפצצה — עיגול גדול ≈ 5,000 טון', shape: 'circle' },
    ],
    legendContext: 'גריד החזית וחצי המערכה הם שחזורים אלגוריתמיים; מסלולי תצורות '
      + 'נשענים על הרשומות המקוריות. ההפצצות הן חלון של חמישה ימים אחורה, '
      + 'ודוהות עם הזמן; שטח העיגול פרופורציוני לטונאז׳ ואינו שטח הפגיעה — '
      + 'הנקודה הכהה במרכז היא המטרה.',

    async load() {
      const [motion, atlas, battles, convoys] = await Promise.all([
        loadJson(DATA_URL), loadAtlasData(), loadJson(BATTLES_URL), loadJson(CONVOYS_URL),
      ]);
      const grid = motion.front_grid;
      grid.cells = grid.cx.map((cx, index) => {
        const position = [grid.bbox[0] + cx * grid.step, grid.bbox[1] + grid.cy[index] * grid.step];
        const half = grid.step * 0.505;
        return {
        position,
        polygon: [[position[0] - half, position[1] - half], [position[0] + half, position[1] - half],
          [position[0] + half, position[1] + half], [position[0] - half, position[1] + half]],
        fall: grid.fall[index], free: grid.free[index],
        ownFall: grid.ownf?.[index] ?? -1, ownFree: grid.ownl?.[index] ?? -1,
        index,
      }; });
      motion.airByDay = new Map();
      for (const row of motion.air_raids?.v || []) {
        const raid = { position: [row[0], row[1]], day: row[2], missions: row[3], tons: row[4], aircraft: row[5] };
        if (!motion.airByDay.has(raid.day)) motion.airByDay.set(raid.day, []);
        motion.airByDay.get(raid.day).push(raid);
      }
      return {
        ...motion,
        atlas,
        battles: battles.battles.map((item) => ({
          ...item,
          position: item.position || [item.x, item.y],
          day_from: item.day_from ?? item.f,
          day_to: item.day_to ?? item.e ?? item.f,
        })).filter((item) => item.position?.every(Number.isFinite) && Number.isFinite(item.day_from)),
        convoys: convoys.routes,
      };
    },

    build(data, ctx) {
      const { day, opacity, zoom = 3, animationTime = 0, motionEnabled = true,
        onClick } = ctx;
      const phase = motionEnabled ? (animationTime / 8200) % 1 : 0.42;
      const grid = data.front_grid;

      if (!dayCache || dayCache.day !== day) {
        const axisCells = [];
        const freshCells = [];
        const units = [];
        for (const cell of grid.cells) {
          const axis = (cell.fall === -1 || (cell.fall > 0 && day >= cell.fall))
            && !(cell.free > 0 && day >= cell.free);
          if (axis) axisCells.push(cell);
          const sinceFall = cell.fall > 0 ? day - cell.fall : Infinity;
          const sinceFree = cell.free > 0 ? day - cell.free : Infinity;
          if (sinceFall >= 0 && sinceFall <= 14) freshCells.push({ ...cell, side: 'axis', age: sinceFall });
          if (sinceFree >= 0 && sinceFree <= 14) freshCells.push({ ...cell, side: 'allies', age: sinceFree });
          if (sinceFall >= 0 && sinceFall <= 6) units.push({ ...cell, side: 'axis', age: sinceFall });
          else if (sinceFree >= 0 && sinceFree <= 6) units.push({ ...cell, side: 'allies', age: sinceFree });
        }
        dayCache = { day, axisCells, freshCells, units };
      }

      // 0.25° is roughly 18–28 km in Europe. A fixed 23 km radius keeps the
      // daily grid visually continuous at every zoom instead of exposing rows.
      const cellRadius = 23000;
      const cells = new PolygonLayer({
        id: 'legacy-front-control', data: dayCache.axisCells, pickable: false,
        opacity: opacity * 0.9, getPolygon: (item) => item.polygon,
        getFillColor: (item) => ownerColor(grid, item.ownFall),
        stroked: false, filled: true,
      });

      const flashes = new ScatterplotLayer({
        id: 'legacy-front-flashes', data: dayCache.freshCells, pickable: false,
        opacity, getPosition: (item) => item.position,
        getFillColor: (item) => item.side === 'axis' ? [224, 132, 58, 105] : [92, 164, 214, 125],
        getRadius: (item) => cellRadius * (1.2 + (1 - item.age / 14) * 1.7 + Math.sin(phase * Math.PI * 2) * 0.12),
        radiusUnits: 'meters', stroked: false,
        updateTriggers: { getRadius: [phase, day] },
      });

      const contourPaths = pickContour(data.front_contours, day).map((path) => ({ path }));
      const contourHalo = new PathLayer({
        id: 'legacy-front-contour-halo', data: contourPaths, getPath: (item) => item.path,
        getColor: PAPER, getWidth: 5.2, widthUnits: 'pixels', jointRounded: true, capRounded: true,
      });
      const contour = new PathLayer({
        id: 'legacy-front-contour', data: contourPaths, getPath: (item) => item.path,
        getColor: [73, 37, 23, 235], getWidth: 2.4, widthUnits: 'pixels', jointRounded: true, capRounded: true,
      });

      const arrows = data.attack_arrows.filter((item) => day >= item.d0 - 45 && day <= item.d1 + 90)
        .slice(0, zoom >= 5 ? 30 : 16)
        .map((item) => {
          const progress = Math.max(0.2, Math.min(1, (day - item.d0) / Math.max(1, item.d1 - item.d0)));
          const end = [item.x0 + (item.x1 - item.x0) * progress, item.y0 + (item.y1 - item.y0) * progress];
          return { ...item, path: [[item.x0, item.y0], end], position: end };
        });
      const arrowPaths = new PathLayer({
        id: 'legacy-attack-arrows', data: arrows, getPath: (item) => item.path,
        getColor: (item) => item.side === 'axis' ? [138, 70, 32, 210] : [31, 78, 121, 220],
        getWidth: (item) => 3 + Math.min(7, Math.log10((item.cas || 10) + 10) * 1.7),
        widthUnits: 'pixels', jointRounded: true, capRounded: true,
      });
      const arrowHeads = new TextLayer({
        id: 'legacy-attack-arrow-heads', data: arrows, getPosition: (item) => item.position,
        getText: () => '➤', getAngle: (item) => 90 - Math.atan2(item.y1 - item.y0, item.x1 - item.x0) * 180 / Math.PI,
        getColor: (item) => item.side === 'axis' ? [138, 70, 32, 255] : [31, 78, 121, 255],
        getSize: (item) => 22 + Math.sin((phase + item.d0 * 0.001) * Math.PI * 2) * 2,
        sizeUnits: 'pixels', getTextAnchor: 'middle', getAlignmentBaseline: 'center',
        characterSet: ['➤'], updateTriggers: { getSize: [phase] },
      });

      const formations = [];
      for (const formation of data.formation_tracks) {
        const past = formation.t.filter((point) => point[0] <= day + phase * 3);
        if (!past.length || day - past[past.length - 1][0] > 60) continue;
        const last = past[past.length - 1];
        formations.push({
          ...formation,
          path: past.map((point) => [point[1], point[2]]),
          position: [last[1], last[2]], tanks: last[3] || 0, strength: last[4] || 0,
          axis: /גרמנ|איטל|יפן/.test(formation.pol || ''),
        });
      }
      const formationPaths = new PathLayer({
        id: 'legacy-formation-tracks', data: formations, getPath: (item) => item.path,
        getColor: (item) => item.axis ? [138, 70, 32, 140] : [31, 78, 121, 150],
        getWidth: 2, widthUnits: 'pixels', jointRounded: true,
      });
      const formationSymbols = new IconLayer({
        id: 'legacy-formation-symbols', data: formations, getPosition: (item) => item.position,
        iconAtlas: getSpriteAtlas(), iconMapping: spriteMapping,
        getIcon: (item) => `${item.tanks ? 'tank' : 'inf'}-${item.axis ? 'axis' : 'allies'}`,
        getAngle: (item) => angleOf(item.path, 0.99),
        getSize: (item) => Math.min(38, 22 + Math.log10(item.tanks + 10) * 4),
        sizeUnits: 'pixels', billboard: true,
      });

      const unitSample = dayCache.units.filter((_, index) => index % (zoom >= 6 ? 4 : 10) === 0).slice(0, zoom >= 6 ? 70 : 36);
      const units = new IconLayer({
        id: 'legacy-front-units', data: unitSample, getPosition: (item) => item.position,
        iconAtlas: getSpriteAtlas(), iconMapping: spriteMapping,
        getIcon: (item) => `${item.index % 3 === 0 ? 'tank' : 'inf'}-${item.side}`,
        getAngle: (item) => item.side === 'axis' ? 0 : 180,
        getSize: (item) => 25 + (1 - item.age / 7) * 6 + Math.sin((phase + item.index * 0.01) * Math.PI * 2),
        sizeUnits: 'pixels', billboard: true,
        updateTriggers: { getSize: [phase, day] },
      });

      const moving = [];
      const air = data.atlas.supply_routes.filter((item) => item.route_class === 'air_bridge' && item.day_from <= day && day <= item.day_to);
      air.forEach((item, index) => moving.push({ path: item.path, phase: phase + index * 0.23, icon: 'plane', size: 25 }));
      data.atlas.transports.filter((item) => item.day_from <= day && day <= item.day_to)
        .slice(0, 18).forEach((item, index) => moving.push({ path: item.path, phase: phase * 0.72 + index * 0.17, icon: 'train', size: 22 }));
      data.deportation_routes.filter((item) => Math.abs(day - item.day) <= 24)
        .slice(0, zoom >= 5 ? 28 : 12).forEach((item, index) => moving.push({
          path: item.path, phase: phase * 0.68 + index * 0.137,
          icon: 'train', size: 22,
        }));
      data.convoys.filter((item) => item.day_from <= day && day <= item.day_to)
        .slice(0, 18).forEach((item, index) => moving.push({ path: item.path, phase: phase * 0.55 + index * 0.19, icon: 'ship', size: 22 }));
      moving.forEach((item) => {
        item.position = interpolatePath(item.path, item.phase);
        item.angle = angleOf(item.path, item.phase);
      });
      const movingSymbols = new IconLayer({
        id: 'legacy-moving-vehicles', data: moving.filter((item) => item.position),
        iconAtlas: getSpriteAtlas(), iconMapping: spriteMapping,
        getPosition: (item) => item.position, getIcon: (item) => item.icon,
        getAngle: (item) => item.angle, getSize: (item) => item.size,
        sizeUnits: 'pixels', billboard: true,
        updateTriggers: { getPosition: [phase], getAngle: [phase] },
      });

      // ── הפצצות אוויר ──────────────────────────────────────────────
      //
      // ⚠️ ‏**מה שהיה כאן קודם**: עיגול חום שקוף עם תו ‏`☁` במרכזו,
      // ‏ברדיוס שהוא לוגריתם הטונאז׳ **כפול סינוס של הזמן**. כלומר
      // ‏הגודל, שאמור לקודד כמה פצצות הוטלו, השתנה מעצמו — הקידוד
      // ‏שיקר. מעל זה: חום הוא גוון הקרקע בפלטה, ענן הוא סמל של מזג
      // ‏אוויר, ובמקרא לא הופיע דבר. הקורא לא יכול היה לדעת שהוא
      // ‏מסתכל על הפצצה, ובוודאי לא על כמה.
      //
      // ‏מה שיש כאן עכשיו, וכל החלטה עם סיבה:
      //   · **צבע** — אדום עמוק. הפצצה היא אש, לא אדמה. הגוון כהה
      //     ‏וחם יותר מהוורמיליון של הציר, כדי שלא ייקרא כצד.
      //   · **גודל** — שורש הטונאז׳ בלבד. שטח העיגול פרופורציוני
      //     ‏לכמות, וזו המוסכמה הקרטוגרפית לסמל פרופורציוני. **אין
      //     ‏פעימה ברדיוס**: מספר שמשנה את עצמו אינו מספר.
      //   · **נקודת ליבה** — העיגול הגדול הוא *כמות*, לא שטח הפגיעה.
      //     ‏בלי נקודה קטנה ומלאה במרכז, הקורא מבין ״כל האזור הזה
      //     ‏הופצץ״, וזו טענה שאיש לא טען.
      //   · **דהייה** — היום עצמו מלא, לפני חמישה ימים חיוור. החלון
      //     ‏של חמישה ימים כתוב במקרא, לא מנוחש.
      const RAID_WINDOW = 5;
      const raids = [];
      for (let raidDay = day - RAID_WINDOW; raidDay <= day; raidDay += 1) {
        for (const raid of data.airByDay.get(raidDay) || []) {
          raids.push({ ...raid, age: day - raidDay });
        }
      }
      raids.sort((a, b) => b.tons - a.tons);
      const visibleRaids = raids.slice(0, zoom >= 6 ? 650 : zoom >= 4 ? 320 : 140);
      //: ‏רדיוס לפי שורש הטונאז׳ — שטח פרופורציוני לכמות.
      const raidRadius = (item) => 2600 + Math.sqrt(Math.max(item.tons || 0, 0)) * 620;
      const freshness = (item) => 1 - (item.age / (RAID_WINDOW + 1)) * 0.62;
      const raidBlast = new ScatterplotLayer({
        id: 'legacy-air-raid-blast', data: visibleRaids, pickable: true,
        getPosition: (item) => item.position,
        getFillColor: (item) => [179, 38, 30, Math.round(46 * freshness(item))],
        getLineColor: (item) => [150, 28, 22, Math.round(215 * freshness(item))],
        stroked: true, filled: true,
        getRadius: raidRadius, radiusUnits: 'meters',
        lineWidthMinPixels: 1.1, radiusMinPixels: 3,
        updateTriggers: { getFillColor: [day], getLineColor: [day], getRadius: [day] },
        onClick: (info) => info.object && onClick?.(info.object, raidCard),
      });
      const raidCore = new ScatterplotLayer({
        id: 'legacy-air-raid-core', data: visibleRaids,
        getPosition: (item) => item.position,
        getFillColor: (item) => [143, 26, 20, Math.round(250 * freshness(item))],
        getRadius: 2.2, radiusUnits: 'pixels', radiusMinPixels: 2,
        updateTriggers: { getFillColor: [day] },
      });

      const activeBattles = data.battles.filter((item) => item.day_from - 2 <= day && day <= item.day_to + 12);
      // ⚠️ ‏ההילה פעמה **ברדיוס** בין 18 ל-46 ק״מ. רדיוס על מפה נקרא
      // ‏כמרחק, וכאן הוא לא קידד כלום — קרב לא התרחב ולא התכווץ.
      // ‏הפעימה עברה לאטימות: אותה תשומת לב, בלי טענה מרחבית.
      const battleBeat = 0.55 + (Math.sin(phase * Math.PI * 2) + 1) * 0.22;
      const battleHalos = new ScatterplotLayer({
        id: 'legacy-battle-pulses', data: activeBattles, getPosition: (item) => item.position,
        getFillColor: [165, 66, 36, Math.round(30 * battleBeat)],
        getLineColor: [153, 55, 32, Math.round(150 * battleBeat)], stroked: true,
        getRadius: 22000, radiusUnits: 'meters', lineWidthMinPixels: 1.2,
        updateTriggers: { getFillColor: [phase], getLineColor: [phase] },
      });
      const bursts = new TextLayer({
        id: 'legacy-battle-bursts', data: activeBattles, getPosition: (item) => item.position,
        getText: () => '✹', getColor: [170, 70, 32, 245],
        getSize: (item) => 15 + Math.sin((phase + item.day_from * 0.002) * Math.PI * 2) * 2.5,
        sizeUnits: 'pixels', characterSet: ['✹'], outlineWidth: 2, outlineColor: PAPER,
        updateTriggers: { getSize: [phase] },
      });

      return [cells, flashes, contourHalo, contour, arrowPaths, arrowHeads,
        formationPaths, formationSymbols, units, movingSymbols, raidBlast, raidCore,
        battleHalos, bursts];
    },
  };
}
