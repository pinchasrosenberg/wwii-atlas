// Read-only Cypher validation for the owner console (defence in depth: the console is
// also gated by CONSOLE_KEY, and the API never exposes write endpoints).

export class CypherRejected extends Error {}

const FORBIDDEN = /\b(?:CREATE|MERGE|SET|REMOVE|DELETE|DETACH|DROP|ALTER|LOAD\s+CSV|CALL|FOREACH|USE|GRANT|DENY|REVOKE|TERMINATE|START\s+DATABASE|STOP\s+DATABASE|SHOW|PROFILE|EXPLAIN|FINISH|INSERT)\b/i;

export function validateReadCypher(cypher) {
  const query = String(cypher ?? '').trim();
  if (!query || query.length > 20_000) throw new CypherRejected('cypher must be 1-20,000 characters');
  let code = query.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ');
  code = code.replace(/'(?:\\.|''|[^'\\])*'|"(?:\\.|""|[^"\\])*"/g, "''");
  if (code.replace(/;\s*$/, '').includes(';')) throw new CypherRejected('only one statement is allowed');
  if (FORBIDDEN.test(code)) throw new CypherRejected('only read queries are allowed');
  if (!/^\s*(?:MATCH|OPTIONAL\s+MATCH|WITH|UNWIND|RETURN)\b/i.test(code)) {
    throw new CypherRejected('query must start with MATCH, OPTIONAL MATCH, WITH, UNWIND or RETURN');
  }
  if (!/\bRETURN\b/i.test(code)) throw new CypherRejected('a read query must RETURN something');
  return query.replace(/;\s*$/, '');
}
