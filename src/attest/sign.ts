import * as ed from '@noble/ed25519';
import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.js';

// @noble/ed25519 v2 needs a sha512 implementation wired in; use node:crypto.
ed.etc.sha512Sync = (...msgs: Uint8Array[]) => {
  const h = createHash('sha512');
  for (const m of msgs) h.update(m);
  return new Uint8Array(h.digest());
};

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.replace(/^0x/, '');
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) throw new Error('sign: invalid hex');
  return Uint8Array.from(Buffer.from(clean, 'hex'));
};
const bytesToHex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

export function publicKeyHex(privateKeyHex: string): string {
  return bytesToHex(ed.getPublicKey(hexToBytes(privateKeyHex)));
}

// Signs the canonical JSON bytes of `doc` with the `signature` field removed.
export function signReport(doc: Record<string, unknown>, privateKeyHex: string): string {
  const { signature: _omit, ...unsigned } = doc;
  const bytes = new TextEncoder().encode(canonicalJson(unsigned));
  return bytesToHex(ed.sign(bytes, hexToBytes(privateKeyHex)));
}

export function verifyReport(doc: Record<string, unknown>, signatureHex: string, pubKeyHex: string): boolean {
  try {
    const { signature: _omit, ...unsigned } = doc;
    const bytes = new TextEncoder().encode(canonicalJson(unsigned));
    return ed.verify(hexToBytes(signatureHex), bytes, hexToBytes(pubKeyHex));
  } catch {
    return false;
  }
}

export function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}
