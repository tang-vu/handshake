import { ethers } from 'ethers';
import { InsufficientBalanceError } from './errors';

const DEFAULT_RPC_URL = 'https://mainnet.base.org';

export async function checkERC20Balance(
  rpcURL: string | undefined,
  walletAddr: string,
  tokenAddr: string,
  priceStr: string
): Promise<void> {
  if (!walletAddr || !tokenAddr || !priceStr) return;

  const price = BigInt(priceStr);
  if (price <= 0n) return;

  const provider = new ethers.JsonRpcProvider(rpcURL || DEFAULT_RPC_URL);

  const erc20 = new ethers.Contract(
    tokenAddr,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );

  const balance: bigint = await erc20.balanceOf(walletAddr);

  if (balance < price) {
    throw new InsufficientBalanceError(tokenAddr, price, balance);
  }
}
