import { loadJson } from './data-store.js?v=map-channel-19';

/**
 * אינדקס החיפוש המקומי — גיבוי למסד ה-serving ותחליף ל-RAG בזמן ריצה.
 *
 * האינדקס נבנה ב-ETL (`export/search_index.py`) ומוגש כקובץ סטטי.
 * בפריסה החיפוש מתחיל ב־API קריאה בלבד. אם הוא אינו זמין (למשל עם
 * python http.server), האינדקס הזה נותן חיפוש מלא ללא מודל שפה או
 * בקשת צד שלישי.
 *
 * ⚠️ `normalizeToken` כאן חייב להיות זהה ל-`normalize()` בפייתון.
 * כל סטייה בין השניים = מונח שנכנס לאינדקס בצורה אחת ומחופש בצורה
 * אחרת, ולעולם לא נמצא. הבדיקה על כך נמצאת ב-tools/test-core.mjs.
 */

const LEXICAL_URL = './data/search/lexical.json';
const SEMANTIC_URL = './data/search/semantic.json';
const LEGACY_URLS = [
  './data/legacy/places.json',
  './data/legacy/battles.json',
  './data/legacy/infrastructure.json',
];

/** מקביל ל-normalize() בפייתון: NFKD, lowercase, הסרת סימני ניקוד. */
export function normalizeToken(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')            // סימני ניקוד מצטרפים
    // \w ב-JavaScript הוא ASCII בלבד ולכן היה מוחק קירילית ויוונית.
    // \p{L}\p{N} שומר אותיות וספרות בכל כתב — זהה ל-\w של פייתון.
    .replace(/[^\p{L}\p{N}_\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export function tokenize(text, minLen = 2) {
  return normalizeToken(text).split(' ').filter((t) => t.length >= minLen);
}

export class SearchIndex {
  constructor() {
    this.lexical = null;
    this.semantic = null;
    this._semanticLoader = null;
  }

  async loadLexical() {
    if (this.lexical) return this.lexical;
    const [lexical, places, battles, infrastructure] = await Promise.all([
      loadJson(LEXICAL_URL),
      // ‏קובץ ישן חסר מדלל את החיפוש אבל אינו מפיל אותו
      ...LEGACY_URLS.map((url) => loadJson(url).catch(() => null)),
    ]);
    this.lexical = lexical;
    this._mergeLegacy({ places, battles, infrastructure });
    return this.lexical;
  }

  _mergeLegacy({ places, battles, infrastructure }) {
    const docs = [];
    for (const [index, item] of (places?.cities || []).entries()) {
      docs.push({
        ref: `legacy-city:${index}`, label: item.n, alt: [item.country, item.holder],
        kind: 'place', layer: 'legacy-cities', lon: item.x, lat: item.y,
        from: null, to: null,
      });
    }
    for (const item of places?.sites || []) {
      docs.push({
        ref: item.id, label: item.name, alt: [item.parent, item.type],
        kind: 'camp', layer: 'legacy-sites', lon: item.position?.[0], lat: item.position?.[1],
        from: item.day_from, to: item.day_to,
      });
    }
    for (const item of battles?.battles || []) {
      docs.push({
        ref: item.id, label: item.n, alt: [item.en, item.cmp, item.frt, item.th],
        kind: 'battle', layer: 'legacy-battles', lon: item.x, lat: item.y,
        from: item.f, to: item.e ?? item.f,
      });
    }
    for (const [kind, layer, items] of [
      ['factory', 'legacy-infrastructure', infrastructure?.plants || []],
      ['port', 'legacy-infrastructure', infrastructure?.ports || []],
      ['port', 'legacy-infrastructure', infrastructure?.supply_ports || []],
    ]) {
      for (const [index, item] of items.entries()) {
        docs.push({
          ref: item.id || `legacy-${kind}:${index}:${item.n}`, label: item.n_he || item.n,
          alt: [item.n, item.ind, item.c, item.admin], kind, layer,
          lon: item.x, lat: item.y, from: null, to: null,
        });
      }
    }

    const known = new Set(this.lexical.docs.map((doc) => doc.ref));
    for (const doc of docs) {
      if (!doc.label || known.has(doc.ref)) continue;
      const index = this.lexical.docs.length;
      this.lexical.docs.push(doc);
      known.add(doc.ref);
      const tokens = new Set(tokenize([doc.label, ...(doc.alt || [])].filter(Boolean).join(' ')));
      for (const token of tokens) {
        (this.lexical.terms[token] ||= []).push(index);
      }
    }
  }

  /**
   * חיפוש לקסיקלי. מכסה את רוב השימוש האמיתי — "מצא את העיר X" —
   * ועובד על כל התעתיקים ההיסטוריים: Lwów, Lviv, Lemberg, למברג.
   *
   * @param {string} query
   * @param {object} opts
   * @param {number} opts.day      — סינון לתאריך הנוכחי
   * @param {string} opts.kind     — place | battle | camp | route
   * @param {number} opts.limit
   */
  search(query, { day = null, kind = null, limit = 20 } = {}) {
    if (!this.lexical) return [];
    const tokens = tokenize(query);
    if (!tokens.length) return [];

    const { terms, docs } = this.lexical;
    const scores = new Map();

    for (const tok of tokens) {
      const postings = terms[tok];
      if (!postings) continue;
      // מונח נדיר אומר יותר ממונח נפוץ
      const weight = 1 / Math.log2(postings.length + 2);
      for (const i of postings) {
        scores.set(i, (scores.get(i) || 0) + weight);
      }
    }

    const out = [];
    for (const [i, score] of scores) {
      const d = docs[i];
      if (!d) continue;
      if (kind && d.kind !== kind) continue;
      if (day !== null && d.from !== null && d.to !== null) {
        if (day < d.from || day > d.to) continue;
      }
      // בונוס להתאמה מדויקת בשם עצמו, לא רק ב-alias
      const exact = normalizeToken(d.label) === normalizeToken(query) ? 2 : 0;
      out.push({ ...d, score: score + exact });
    }

    out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'he'));
    return out.slice(0, limit);
  }

  /** חיפוש במסד ה-serving; null מפעיל את האינדקס המקומי כגיבוי. */
  async searchRemote(query, { day, limit = 20, signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      day: String(Math.round(day)),
      limit: String(limit),
    });
    try {
      const response = await fetch(`./api/search?${params}`, {
        signal,
        headers: { accept: 'application/json' },
      });
      if (response.status === 404 || response.status === 503) return null;
      if (!response.ok) throw new Error(`חיפוש במסד נכשל (${response.status})`);
      const payload = await response.json();
      return payload.results || [];
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return null;
    }
  }

  /**
   * טעינה עצלה של הדרג הסמנטי. נטען רק אם המשתמש ביקש חיפוש חופשי —
   * המודל שוקל עשרות מגהבייטים ואין סיבה להטיל אותו על מי שרק מחפש
   * שם עיר.
   *
   * ⚠️ מאמת שהמודל בדפדפן תואם למודל שבנה את הווקטורים. אי-התאמה
   * אינה זורקת שגיאה מעצמה — היא מחזירה תוצאות שגויות בשקט, ולכן
   * הבדיקה כאן מפורשת.
   */
  async loadSemantic({ pipelineFactory } = {}) {
    if (this.semantic) return this.semantic;
    if (this._semanticLoader) return this._semanticLoader;

    this._semanticLoader = (async () => {
      const res = await fetch(SEMANTIC_URL);
      if (!res.ok) throw new Error('האינדקס הסמנטי אינו זמין');
      const meta = await res.json();

      if (!pipelineFactory) {
        throw new Error('נדרש pipelineFactory (transformers.js) לחיפוש סמנטי');
      }
      const embed = await pipelineFactory(meta.model_browser);

      this.semantic = {
        meta,
        embed,
        vectors: hexToFloat16Array(meta.vectors, meta.count, meta.dim),
      };
      return this.semantic;
    })();

    return this._semanticLoader;
  }

  async searchSemantic(query, { limit = 10 } = {}) {
    if (!this.semantic) throw new Error('הדרג הסמנטי לא נטען');
    const { embed, vectors, meta } = this.semantic;

    const out = await embed(query, { pooling: 'mean', normalize: true });
    const q = out.data;
    if (q.length !== meta.dim) {
      throw new Error(`ממד שאילתה ${q.length} מול ${meta.dim} באינדקס — מודל לא תואם`);
    }

    const scored = [];
    for (let i = 0; i < meta.count; i++) {
      let dot = 0;
      const base = i * meta.dim;
      for (let j = 0; j < meta.dim; j++) dot += q[j] * vectors[base + j];
      scored.push({ ...this.lexical.docs[i], score: dot });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

/** float16 מגיע כ-hex כדי לחסוך מחצית מהמשקל ברשת. */
function hexToFloat16Array(hex, count, dim) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  const u16 = new Uint16Array(bytes.buffer);
  const out = new Float32Array(count * dim);
  for (let i = 0; i < u16.length; i++) out[i] = float16ToFloat32(u16[i]);
  return out;
}

function float16ToFloat32(h) {
  const sign = (h & 0x8000) >> 15;
  const exp = (h & 0x7c00) >> 10;
  const frac = h & 0x03ff;
  if (exp === 0) return (sign ? -1 : 1) * Math.pow(2, -14) * (frac / 1024);
  if (exp === 0x1f) return frac ? NaN : (sign ? -Infinity : Infinity);
  return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
}
