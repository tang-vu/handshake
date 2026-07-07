import { AgentClient, EventType } from '@croo-network/sdk';
import type { EventStream, Negotiation, Order, Delivery, PayOrderResult, DeliverOrderRequest } from '@croo-network/sdk';
import type { CapClient, IntakeEvent } from './client.js';
import { config } from '../config.js';

// Real CAP integration over the CROO SDK. One process = one WebSocket: the
// platform allows a single active connection per API key (close code 1008),
// so the shared stream serves both intake events and any future listeners.
export class RealCapClient implements CapClient {
  private client: AgentClient;
  private stream: EventStream | null = null;

  constructor() {
    this.client = new AgentClient(
      { baseURL: config.crooApiUrl, wsURL: config.crooWsUrl, rpcURL: config.baseRpcUrl },
      config.crooSdkKey
    );
  }

  async start(onIntake: (e: IntakeEvent) => void): Promise<void> {
    this.stream = await this.client.connectWebSocket();
    // Intake = negotiations for OUR services. Probe-order events are ignored
    // here; the audit engine polls order state instead (WS is best-effort).
    this.stream.on(EventType.NegotiationCreated, (e) => {
      if (!e.negotiation_id || !e.service_id) return;
      if (e.service_id !== config.basicServiceId) return;
      onIntake({ negotiationId: e.negotiation_id, serviceId: e.service_id });
    });
  }

  stop(): void {
    this.stream?.close();
    this.stream = null;
  }

  getNegotiation(negotiationId: string): Promise<Negotiation> {
    return this.client.getNegotiation(negotiationId);
  }

  async acceptNegotiation(negotiationId: string): Promise<{ order: Order }> {
    const res = await this.client.acceptNegotiation(negotiationId);
    return { order: res.order };
  }

  rejectNegotiation(negotiationId: string, reason: string): Promise<void> {
    return this.client.rejectNegotiation(negotiationId, reason);
  }

  async deliverOrder(orderId: string, req: DeliverOrderRequest): Promise<{ txHash: string }> {
    const res = await this.client.deliverOrder(orderId, req);
    return { txHash: res.txHash };
  }

  rejectOrder(orderId: string, reason: string): Promise<void> {
    return this.client.rejectOrder(orderId, reason);
  }

  negotiateOrder(serviceId: string, requirements: string): Promise<Negotiation> {
    return this.client.negotiateOrder({ serviceId, requirements });
  }

  // The SDK has no negotiation→order lookup for the requester side; the order
  // materializes when the provider accepts. Match on Order.negotiationId.
  async findOrderByNegotiation(negotiationId: string): Promise<Order | undefined> {
    const orders = await this.client.listOrders({ role: 'buyer', pageSize: 50 });
    return orders.find((o) => o.negotiationId === negotiationId);
  }

  payOrder(orderId: string): Promise<PayOrderResult> {
    return this.client.payOrder(orderId);
  }

  getOrder(orderId: string): Promise<Order> {
    return this.client.getOrder(orderId);
  }

  getDelivery(orderId: string): Promise<Delivery> {
    return this.client.getDelivery(orderId);
  }
}
