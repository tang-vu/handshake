import type { ProbeRow } from '../../db/repo.js';
import type { ChainVerifier } from '../../cap/client.js';

export interface SettlementCheck {
  pass: boolean;
  chain: string;
  tx_hashes: string[];
  detail: string;
  verifications: { order_id: string; escrow_lock: string; settlement_release: string }[];
}

// C3 — did the money actually move on-chain? For every completed probe order,
// independently verify via chain RPC (not CROO's API):
//   payTxHash   → USDC Transfer(our AA wallet → CAPVault, price)   [escrow lock]
//   clearTxHash → USDC Transfer(CAPVault → target's AA wallet)     [settlement]
export async function checkSettlement(probes: ProbeRow[], verifier: ChainVerifier): Promise<SettlementCheck> {
  const completed = probes.filter((p) => p.status === 'completed');
  if (completed.length === 0) {
    return {
      pass: false,
      chain: verifier.chainLabel(),
      tx_hashes: [],
      detail: 'no completed probe orders — nothing settled on-chain',
      verifications: [],
    };
  }

  const txHashes: string[] = [];
  const verifications: SettlementCheck['verifications'] = [];
  let allOk = true;

  for (const p of completed) {
    let lockDetail = 'missing pay_tx_hash';
    let releaseDetail = 'missing clear_tx_hash';
    let ok = false;

    if (p.pay_tx_hash && p.requester_wallet && p.price) {
      const lock = await verifier.verifyEscrowLock(p.pay_tx_hash, p.requester_wallet, p.price);
      txHashes.push(p.pay_tx_hash);
      lockDetail = `${lock.ok ? 'VERIFIED' : 'FAILED'}: ${lock.detail}`;
      if (p.clear_tx_hash && p.provider_wallet) {
        const release = await verifier.verifySettlementRelease(p.clear_tx_hash, p.provider_wallet);
        txHashes.push(p.clear_tx_hash);
        releaseDetail = `${release.ok ? 'VERIFIED' : 'FAILED'}: ${release.detail}`;
        ok = lock.ok && release.ok;
      }
    }

    allOk = allOk && ok;
    verifications.push({
      order_id: p.order_id ?? '',
      escrow_lock: lockDetail,
      settlement_release: releaseDetail,
    });
  }

  return {
    pass: allOk,
    chain: verifier.chainLabel(),
    tx_hashes: txHashes,
    detail: allOk
      ? `verified escrow lock + settlement release for ${completed.length} order(s)`
      : 'one or more orders failed on-chain verification',
    verifications,
  };
}
