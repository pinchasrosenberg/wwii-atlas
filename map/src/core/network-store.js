const ENTITIES_URL = './data/network/entities.json';
const RELATIONS_URL = './data/network/relations.json';

let sharedPromise = null;

export function loadNetworkData() {
  if (sharedPromise) return sharedPromise;
  sharedPromise = Promise.all([
    fetch(ENTITIES_URL).then((response) => {
      if (!response.ok) throw new Error(`ישויות הרשת לא נטענו (${response.status})`);
      return response.json();
    }),
    fetch(RELATIONS_URL).then((response) => {
      if (!response.ok) throw new Error(`קשרי הרשת לא נטענו (${response.status})`);
      return response.json();
    }),
  ]).then(([entityPayload, relationPayload]) => {
    const entities = entityPayload.entities || [];
    const relations = relationPayload.relations || [];
    return {
      entities,
      relations,
      entityById: new Map(entities.map((item) => [item.id, item])),
      warning_he: relationPayload.warning_he,
    };
  });
  return sharedPromise;
}

export function chainsForEntity(data, entityId) {
  const ids = new Set(
    data.relations
      .filter((item) => item.from_id === entityId || item.to_id === entityId)
      .map((item) => item.chain_id),
  );
  return [...ids];
}

export function relationsForChain(data, chainId) {
  return data.relations
    .filter((item) => item.chain_id === chainId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export class EntityRelationsClient {
  constructor({ endpoint = './api/entities' } = {}) {
    this.endpoint = endpoint;
    this.unavailableUntil = 0;
  }

  async entity(id, { includeMock = false, signal } = {}) {
    if (Date.now() < this.unavailableUntil) return null;
    try {
      const response = await fetch(
        `${this.endpoint}/${encodeURIComponent(id)}?include_mock=${includeMock ? 1 : 0}`,
        { signal, headers: { accept: 'application/json' } },
      );
      if (response.status === 404 || response.status === 503) return null;
      if (!response.ok) throw new Error(`כרטיס הישות נכשל (${response.status})`);
      return (await response.json()).entity || null;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      this.unavailableUntil = Date.now() + 30_000;
      return null;
    }
  }

  async relations(id, { day, includeMock = false, limit = 50, signal } = {}) {
    if (Date.now() < this.unavailableUntil) return null;
    const params = new URLSearchParams({
      day: String(Math.round(day)),
      include_mock: includeMock ? '1' : '0',
      limit: String(limit),
    });
    try {
      const response = await fetch(
        `${this.endpoint}/${encodeURIComponent(id)}/relations?${params}`,
        { signal, headers: { accept: 'application/json' } },
      );
      if (response.status === 404 || response.status === 503) return null;
      if (!response.ok) throw new Error(`שאילתת הקשרים נכשלה (${response.status})`);
      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      this.unavailableUntil = Date.now() + 30_000;
      return null;
    }
  }
}

