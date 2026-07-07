// Generates the ed25519 attestation keypair for Handshake.
// Usage: npm run keygen   → copy the ED25519_PRIVATE_KEY_HEX line into .env
import { randomBytes, createHash } from 'node:crypto';
import * as ed from '@noble/ed25519';

ed.etc.sha512Sync = (...msgs: Uint8Array[]) => {
  const h = createHash('sha512');
  for (const m of msgs) h.update(m);
  return new Uint8Array(h.digest());
};

const priv = randomBytes(32);
const pub = ed.getPublicKey(new Uint8Array(priv));

console.log('Handshake attestation keypair (ed25519)\n');
console.log(`ED25519_PRIVATE_KEY_HEX=${priv.toString('hex')}`);
console.log(`\nPublic key (embedded in every report as auditor.pubkey):`);
console.log(`ed25519:${Buffer.from(pub).toString('hex')}`);
console.log('\nKeep the private key out of git. Put the env line in .env (local) or the server env.');
