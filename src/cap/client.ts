// Handshake's boundary to the CAP protocol. Everything that touches money or
// on-chain state goes through this interface so MODE=dryrun can swap in a
// simulator (dryrun-client.ts) while MODE=real wires the CROO SDK (real-client.ts).

import type { Negotiation, Order, Delivery, PayOrderResult, DeliverOrderRequest } from '@croo-network/sdk';

export interface IntakeEvent {
  negotiationId: string;
  serviceId: string;
}

export interface CapClient {
  // Lifecycle
  start(onIntake: (e: IntakeEvent) => void): Promise<void>;
  stop(): void;

  // Provider side (Handshake selling audits)
  getNegotiation(negotiationId: string): Promise<Negotiation>;
  acceptNegotiation(negotiationId: string): Promise<{ order: Order }>;
  rejectNegotiation(negotiationId: string, reason: string): Promise<void>;
  deliverOrder(orderId: string, req: DeliverOrderRequest): Promise<{ txHash: string }>;
  rejectOrder(orderId: string, reason: string): Promise<void>;

  // Requester side (Handshake probing the target agent)
  negotiateOrder(serviceId: string, requirements: string): Promise<Negotiation>;
  findOrderByNegotiation(negotiationId: string): Promise<Order | undefined>;
  payOrder(orderId: string): Promise<PayOrderResult>;
  getOrder(orderId: string): Promise<Order>;
  getDelivery(orderId: string): Promise<Delivery>;
}

// On-chain settlement verification is chain-RPC, not CAP — separate seam so
// the dryrun simulator can vouch for its own fake hashes.
export interface TxCheck {
  txHash: string;
  ok: boolean;
  detail: string;
}

export interface ChainVerifier {
  chainLabel(): string;
  verifyEscrowLock(txHash: string, fromWallet: string, priceBaseUnits: string): Promise<TxCheck>;
  verifySettlementRelease(txHash: string, toWallet: string): Promise<TxCheck>;
}
