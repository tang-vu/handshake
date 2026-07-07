// Deterministic JSON canonicalization for signing and hashing.
//
// Simplified profile of RFC 8785 (JCS): recursive lexicographic key sort +
// standard JSON.stringify escaping. Full JCS differs only in float
// serialization — Handshake documents therefore MUST contain integers only
// (enforced below), which makes this output byte-identical to JCS and lets
// anyone re-implement offline verification in a few lines.

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return JSON.stringify(value);
  if (t === 'number') {
    const n = value as number;
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new Error(`canonicalJson: only finite integers allowed, got ${n}`);
    }
    return JSON.stringify(n);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  throw new Error(`canonicalJson: unsupported type ${t}`);
}
