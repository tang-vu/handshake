import { JsonRpcProvider, Interface, getAddress } from 'ethers';
import type { ChainVerifier, TxCheck } from './client.js';
import { config } from '../config.js';

const ERC20_TRANSFER = new Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);

// Verifies CAP settlement txs on Base. CAP txs are ERC-4337 UserOps, so the
// receipt's `to` is the EntryPoint/bundler — the truth lives in the logs:
// escrow lock  = USDC Transfer(requesterWallet -> CAPVault, price)
// settlement   = USDC Transfer(CAPVault -> providerWallet, price - fee)
export class BaseChainVerifier implements ChainVerifier {
  private provider = new JsonRpcProvider(config.baseRpcUrl);

  chainLabel(): string {
    return `${config.chain} (chainId ${config.chainId})`;
  }

  private async usdcTransfers(txHash: string): Promise<{ from: string; to: string; value: bigint }[] | string> {
    const receipt = await this.provider.getTransactionReceipt(txHash);
    if (!receipt) return 'transaction not found on-chain';
    if (receipt.status !== 1) return `transaction reverted (status ${receipt.status})`;
    const transfers: { from: string; to: string; value: bigint }[] = [];
    for (const log of receipt.logs) {
      if (getAddress(log.address) !== getAddress(config.usdcAddress)) continue;
      try {
        const parsed = ERC20_TRANSFER.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) transfers.push({ from: parsed.args[0], to: parsed.args[1], value: parsed.args[2] });
      } catch { /* non-Transfer USDC log */ }
    }
    return transfers;
  }

  async verifyEscrowLock(txHash: string, fromWallet: string, priceBaseUnits: string): Promise<TxCheck> {
    try {
      const transfers = await this.usdcTransfers(txHash);
      if (typeof transfers === 'string') return { txHash, ok: false, detail: transfers };
      const hit = transfers.find(
        (t) =>
          getAddress(t.from) === getAddress(fromWallet) &&
          getAddress(t.to) === getAddress(config.capVaultAddress) &&
          t.value === BigInt(priceBaseUnits)
      );
      return hit
        ? { txHash, ok: true, detail: `USDC ${priceBaseUnits} locked in CAPVault from ${fromWallet}` }
        : { txHash, ok: false, detail: 'no matching USDC Transfer to CAPVault found in receipt logs' };
    } catch (err: any) {
      return { txHash, ok: false, detail: `rpc error: ${err.message}` };
    }
  }

  async verifySettlementRelease(txHash: string, toWallet: string): Promise<TxCheck> {
    try {
      const transfers = await this.usdcTransfers(txHash);
      if (typeof transfers === 'string') return { txHash, ok: false, detail: transfers };
      const hit = transfers.find(
        (t) => getAddress(t.from) === getAddress(config.capVaultAddress) && getAddress(t.to) === getAddress(toWallet)
      );
      return hit
        ? { txHash, ok: true, detail: `USDC ${hit.value} released from CAPVault to ${toWallet}` }
        : { txHash, ok: false, detail: 'no USDC Transfer from CAPVault to provider wallet found in receipt logs' };
    } catch (err: any) {
      return { txHash, ok: false, detail: `rpc error: ${err.message}` };
    }
  }
}
