import { randomUUID } from 'node:crypto';
import type { Negotiation, Order, Delivery, PayOrderResult, DeliverOrderRequest } from '@croo-network/sdk';
import type { CapClient, ChainVerifier, IntakeEvent, TxCheck } from './client.js';
import { config } from '../config.js';

// In-memory CAP simulator for MODE=dryrun. Simulated target behaviors are
// selected by the target service id in the intake payload:
//   dryrun-target-ok           happy path (0.10 USDC service)
//   dryrun-target-unresponsive never accepts negotiations (C1 fail)
//   dryrun-target-flaky        every 3rd order expires instead of completing (C5 fail)
//   dryrun-target-pricey       1.00 USDC service — exercises the price-cap refusal
// All fake tx hashes are prefixed "dryrun:" so they can never be confused
// with real Base transactions.

const fakeTx = () => `dryrun:0x${randomUUID().replace(/-/g, '')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TARGET_WALLET = '0xDRYRUNTARGETWALLET';
const OUR_WALLET = '0xDRYRUNHANDSHAKEWALLET';

function baseOrder(negotiationId: string, serviceId: string, price: string): Order {
  const now = new Date().toISOString();
  return {
    orderId: `dryrun-order-${randomUUID().slice(0, 8)}`,
    negotiationId,
    chainOrderId: '0',
    serviceId,
    requesterAgentId: config.handshakeAgentId,
    providerAgentId: 'dryrun-target-agent',
    buyerUserId: 'dryrun-user',
    requesterWalletAddress: OUR_WALLET,
    providerWalletAddress: TARGET_WALLET,
    price,
    paymentToken: config.usdcAddress,
    deliveryWindow: 600,
    status: 'created',
    rejectReason: '',
    createTxHash: fakeTx(),
    payTxHash: '',
    deliverTxHash: '',
    rejectTxHash: '',
    clearTxHash: '',
    slaDeadline: new Date(Date.now() + 600_000).toISOString(),
    payDeadline: new Date(Date.now() + 600_000).toISOString(),
    createdTime: now,
    updatedTime: now,
    createdAt: now,
    paidAt: '',
    deliveredAt: '',
    rejectedAt: '',
    expiredAt: '',
  };
}

export class DryrunCapClient implements CapClient {
  private negotiations = new Map<string, Negotiation>();
  private orders = new Map<string, Order>();
  private probeCounter = 0;
  private onIntake: ((e: IntakeEvent) => void) | null = null;

  async start(onIntake: (e: IntakeEvent) => void): Promise<void> {
    this.onIntake = onIntake;
  }

  stop(): void {}

  // Dev-only hook used by POST /dev/simulate-intake: a fake buyer hires Handshake.
  simulateBuyerIntake(requirements: string, tier: 'basic' | 'deep' = 'basic'): { negotiationId: string; orderId: string } {
    const serviceId = tier === 'deep' ? config.deepServiceId : config.basicServiceId;
    const negotiationId = `dryrun-neg-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    this.negotiations.set(negotiationId, {
      negotiationId,
      serviceId,
      requesterAgentId: 'dryrun-buyer-agent',
      providerAgentId: config.handshakeAgentId,
      requirements,
      status: 'pending',
      rejectReason: '',
      metadata: '',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      createdTime: now,
      updatedTime: now,
    });
    setImmediate(() => this.onIntake?.({ negotiationId, serviceId }));
    return { negotiationId, orderId: '(created on accept)' };
  }

  async getNegotiation(negotiationId: string): Promise<Negotiation> {
    const n = this.negotiations.get(negotiationId);
    if (!n) throw new Error(`dryrun: negotiation ${negotiationId} not found`);
    return n;
  }

  // Provider side: accepting the buyer's negotiation creates our order; the
  // fake buyer "pays" it 1.5s later so the engine's payment polling runs.
  async acceptNegotiation(negotiationId: string): Promise<{ order: Order }> {
    const neg = await this.getNegotiation(negotiationId);
    neg.status = 'accepted';
    const fee = neg.serviceId === config.deepServiceId ? '3000000' : '1000000'; // deep 3 / basic 1 USDC
    const order = baseOrder(negotiationId, neg.serviceId, fee);
    order.requesterAgentId = neg.requesterAgentId;
    order.providerAgentId = config.handshakeAgentId;
    order.requesterWalletAddress = '0xDRYRUNBUYERWALLET';
    order.providerWalletAddress = OUR_WALLET;
    // Mirror the real basic-tier service config (SLA 2h), not the probe default.
    order.deliveryWindow = 7200;
    order.slaDeadline = new Date(Date.now() + config.tiers.basic.slaMs).toISOString();
    this.orders.set(order.orderId, order);
    setTimeout(() => {
      order.status = 'paid';
      order.payTxHash = fakeTx();
      order.paidAt = new Date().toISOString();
    }, 1500);
    return { order };
  }

  async rejectNegotiation(negotiationId: string, reason: string): Promise<void> {
    const neg = await this.getNegotiation(negotiationId);
    neg.status = 'rejected';
    neg.rejectReason = reason;
  }

  async deliverOrder(orderId: string, _req: DeliverOrderRequest): Promise<{ txHash: string }> {
    const order = await this.getOrder(orderId);
    order.status = 'completed';
    order.deliverTxHash = fakeTx();
    order.clearTxHash = fakeTx();
    order.deliveredAt = new Date().toISOString();
    return { txHash: order.deliverTxHash };
  }

  async rejectOrder(orderId: string, reason: string): Promise<void> {
    const order = await this.getOrder(orderId);
    order.status = 'rejected';
    order.rejectReason = reason;
    order.rejectTxHash = fakeTx();
  }

  // Requester side: simulated target agent reacts based on its service id.
  async negotiateOrder(serviceId: string, requirements: string): Promise<Negotiation> {
    const negotiationId = `dryrun-probe-neg-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const neg: Negotiation = {
      negotiationId,
      serviceId,
      requesterAgentId: config.handshakeAgentId,
      providerAgentId: 'dryrun-target-agent',
      requirements,
      status: 'pending',
      rejectReason: '',
      metadata: '',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdTime: now,
      updatedTime: now,
    };
    this.negotiations.set(negotiationId, neg);

    if (serviceId !== 'dryrun-target-unresponsive') {
      const price = serviceId === 'dryrun-target-pricey' ? '1000000' : '100000';
      this.probeCounter += 1;
      const failThisOne = serviceId === 'dryrun-target-flaky' && this.probeCounter % 3 === 0;
      setTimeout(() => {
        neg.status = 'accepted';
        const order = baseOrder(negotiationId, serviceId, price);
        this.orders.set(order.orderId, order);
        (order as any)._failOnComplete = failThisOne;
      }, 300);
    }
    return neg;
  }

  async findOrderByNegotiation(negotiationId: string): Promise<Order | undefined> {
    return [...this.orders.values()].find((o) => o.negotiationId === negotiationId);
  }

  async payOrder(orderId: string): Promise<PayOrderResult> {
    const order = await this.getOrder(orderId);
    await sleep(200);
    order.status = 'paid';
    order.payTxHash = fakeTx();
    order.paidAt = new Date().toISOString();
    const failOnComplete = (order as any)._failOnComplete === true;
    setTimeout(() => {
      if (failOnComplete) {
        order.status = 'expired';
        order.expiredAt = new Date().toISOString();
      } else {
        order.status = 'completed';
        order.deliverTxHash = fakeTx();
        order.clearTxHash = fakeTx();
        order.deliveredAt = new Date().toISOString();
      }
    }, 500 + Math.floor(Math.random() * 700));
    return { order, txHash: order.payTxHash };
  }

  async getOrder(orderId: string): Promise<Order> {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`dryrun: order ${orderId} not found`);
    return o;
  }

  async getDelivery(orderId: string): Promise<Delivery> {
    const order = await this.getOrder(orderId);
    const now = new Date().toISOString();
    return {
      deliveryId: `dryrun-delivery-${orderId}`,
      orderId,
      providerAgentId: order.providerAgentId,
      deliverableType: 'text',
      deliverableSchema: '',
      deliverableText: '{"echo":"dryrun probe response"}',
      contentHash: fakeTx(),
      status: 'accepted',
      submittedAt: now,
      verifiedAt: now,
      createdTime: now,
      updatedTime: now,
    };
  }
}

// Vouches only for hashes the simulator itself minted.
export class DryrunChainVerifier implements ChainVerifier {
  chainLabel(): string {
    return 'dryrun (no chain — simulated settlement)';
  }
  async verifyEscrowLock(txHash: string, _from: string, price: string): Promise<TxCheck> {
    const ok = txHash.startsWith('dryrun:');
    return { txHash, ok, detail: ok ? `simulated escrow lock of ${price}` : 'not a dryrun tx hash' };
  }
  async verifySettlementRelease(txHash: string, _to: string): Promise<TxCheck> {
    const ok = txHash.startsWith('dryrun:');
    return { txHash, ok, detail: ok ? 'simulated settlement release' : 'not a dryrun tx hash' };
  }
}
