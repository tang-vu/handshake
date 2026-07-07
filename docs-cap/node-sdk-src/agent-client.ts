import { Readable } from 'stream';
import { extname } from 'path';
import { HttpClient, buildQuery } from './http-client';
import { EventStream } from './ws';
import { checkERC20Balance } from './balance';
import type {
  Config,
  Logger,
  Negotiation,
  NegotiateOrderRequest,
  AcceptNegotiationResult,
  Order,
  PayOrderResult,
  Delivery,
  DeliverOrderRequest,
  DeliverOrderResult,
  ListOptions,
} from './types';

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.zip': 'application/zip',
  '.xml': 'application/xml',
  '.html': 'text/html',
};

const defaultLogger: Logger = console;

export class AgentClient {
  private hc: HttpClient;
  private sdkKey: string;
  private wsURL: string;
  private rpcURL: string | undefined;
  private logger: Logger;

  constructor(config: Config, sdkKey: string) {
    if (!config.baseURL) throw new Error('croo: baseURL is required');
    if (!sdkKey) throw new Error('croo: sdkKey is required');

    this.logger = config.logger ?? defaultLogger;
    this.hc = new HttpClient(config.baseURL, this.logger);
    this.sdkKey = sdkKey;
    this.wsURL = config.wsURL ?? '';
    this.rpcURL = config.rpcURL ?? 'https://mainnet.base.org';
  }

  private sdkReq(method: string, path: string, body?: any) {
    return { method, path, authType: 'sdk-key' as const, authVal: this.sdkKey, body };
  }

  // --- Order Negotiation ---

  async negotiateOrder(req: NegotiateOrderRequest): Promise<Negotiation> {
    const resp = await this.hc.do<{ negotiation: Negotiation }>(
      this.sdkReq('POST', '/orders/negotiate', req)
    );
    this.logger.info('negotiation created', {
      negotiationId: resp!.negotiation.negotiationId,
      serviceId: req.serviceId,
      status: resp!.negotiation.status,
    });
    return resp!.negotiation;
  }

  /**
   * Accepts a negotiation (called by Provider). After acceptance, the backend
   * automatically builds and submits a createOrder on-chain transaction.
   *
   * Use {@link acceptNegotiationWithFundAddress} instead when the underlying
   * service has require_fund_transfer=true — the backend rejects accepts that
   * omit provider_fund_address for those services.
   */
  async acceptNegotiation(negotiationId: string): Promise<AcceptNegotiationResult> {
    const resp = await this.hc.do<AcceptNegotiationResult>(
      this.sdkReq('POST', `/orders/negotiate/${negotiationId}/accept`)
    );
    this.logger.info('negotiation accepted', {
      negotiationId,
      orderId: resp!.order.orderId,
      orderStatus: resp!.order.status,
    });
    return resp!;
  }

  /**
   * Accepts a fund-transfer negotiation, declaring the provider-side address
   * that the requester's pay tx batch will transfer fundAmount of fundToken
   * into. providerFundAddress must be a valid EVM address; the backend
   * rejects empty or malformed values for services with
   * require_fund_transfer=true.
   *
   * For non-fund services, use {@link acceptNegotiation} — the backend
   * rejects this method's non-empty provider_fund_address on those services.
   */
  async acceptNegotiationWithFundAddress(
    negotiationId: string,
    providerFundAddress: string
  ): Promise<AcceptNegotiationResult> {
    const resp = await this.hc.do<AcceptNegotiationResult>(
      this.sdkReq('POST', `/orders/negotiate/${negotiationId}/accept`, {
        providerFundAddress,
      })
    );
    this.logger.info('negotiation accepted (fund)', {
      negotiationId,
      orderId: resp!.order.orderId,
      orderStatus: resp!.order.status,
      providerFundAddress,
    });
    return resp!;
  }

  async rejectNegotiation(negotiationId: string, reason: string): Promise<void> {
    await this.hc.do(
      this.sdkReq('POST', `/orders/negotiate/${negotiationId}/reject`, { reason })
    );
    this.logger.info('negotiation rejected', { negotiationId, reason });
  }

  async getNegotiation(negotiationId: string): Promise<Negotiation> {
    const resp = await this.hc.do<{ negotiation: Negotiation }>(
      this.sdkReq('GET', `/orders/negotiate/${negotiationId}`)
    );
    this.logger.info('got negotiation', { negotiationId, status: resp!.negotiation.status });
    return resp!.negotiation;
  }

  async listNegotiations(opts?: ListOptions): Promise<Negotiation[]> {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 20;
    const resp = await this.hc.do<{ negotiations: Negotiation[] }>({
      ...this.sdkReq('GET', '/orders/negotiate'),
      query: buildQuery(page, pageSize, {
        role: opts?.role,
        agent_id: opts?.agentId,
        status: opts?.status,
      }),
    });
    this.logger.info('listed negotiations', { count: resp!.negotiations?.length ?? 0 });
    return resp!.negotiations ?? [];
  }

  // --- Order Lifecycle ---

  async getOrder(orderId: string): Promise<Order> {
    const resp = await this.hc.do<{ order: Order }>(
      this.sdkReq('GET', `/orders/${orderId}`)
    );
    this.logger.info('got order', { orderId, status: resp!.order.status });
    return resp!.order;
  }

  async listOrders(opts?: ListOptions): Promise<Order[]> {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 20;
    const resp = await this.hc.do<{ orders: Order[] }>({
      ...this.sdkReq('GET', '/orders'),
      query: buildQuery(page, pageSize, {
        role: opts?.role,
        agent_id: opts?.agentId,
        status: opts?.status,
      }),
    });
    this.logger.info('listed orders', { count: resp!.orders?.length ?? 0 });
    return resp!.orders ?? [];
  }

  async payOrder(orderId: string): Promise<PayOrderResult> {
    // Pre-check: query on-chain ERC-20 balance to fail fast.
    const order = await this.getOrder(orderId);
    await checkERC20Balance(this.rpcURL, order.requesterWalletAddress, order.paymentToken, order.price);

    const resp = await this.hc.do<PayOrderResult>(
      this.sdkReq('POST', `/orders/${orderId}/pay`)
    );
    this.logger.info('order paid', {
      orderId,
      txHash: resp!.txHash,
      status: resp!.order.status,
    });
    return resp!;
  }

  async deliverOrder(orderId: string, req: DeliverOrderRequest): Promise<DeliverOrderResult> {
    const resp = await this.hc.do<DeliverOrderResult>(
      this.sdkReq('POST', `/orders/${orderId}/deliver`, req)
    );
    this.logger.info('order delivered', {
      orderId,
      txHash: resp!.txHash,
      deliveryId: resp!.delivery.deliveryId,
    });
    return resp!;
  }

  async rejectOrder(orderId: string, reason: string): Promise<void> {
    await this.hc.do(
      this.sdkReq('POST', `/orders/${orderId}/reject`, { reason })
    );
    this.logger.info('order rejected', { orderId, reason });
  }

  async getDelivery(orderId: string): Promise<Delivery> {
    const resp = await this.hc.do<{ delivery: Delivery }>(
      this.sdkReq('GET', `/orders/${orderId}/delivery`)
    );
    this.logger.info('got delivery', {
      orderId,
      deliveryId: resp!.delivery.deliveryId,
      status: resp!.delivery.status,
    });
    return resp!.delivery;
  }

  // --- Object Storage ---

  async uploadFile(fileName: string, body: Buffer | Readable | ReadableStream): Promise<string> {
    const ext = extname(fileName).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Step 1: Get presigned upload URL
    const uploadResp = await this.hc.do<{ uploadUrl: string; objectKey: string }>(
      this.sdkReq('POST', '/objects/upload-url', {
        file_name: fileName,
        content_type: contentType,
      })
    );
    this.logger.info('got upload url', { fileName, objectKey: uploadResp!.objectKey });

    // Step 2: Upload file via HTTP PUT to presigned URL
    const putResp = await fetch(uploadResp!.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: body as any,
    });

    if (!putResp.ok) {
      const text = await putResp.text();
      throw new Error(`croo: upload failed (HTTP ${putResp.status}): ${text}`);
    }

    this.logger.info('file uploaded', { fileName, objectKey: uploadResp!.objectKey });
    return uploadResp!.objectKey;
  }

  async getDownloadURL(objectKey: string): Promise<string> {
    const resp = await this.hc.do<{ downloadUrl: string }>(
      this.sdkReq('POST', '/objects/download-url', { object_key: objectKey })
    );
    this.logger.info('got download url', { objectKey });
    return resp!.downloadUrl;
  }

  // --- WebSocket ---

  async connectWebSocket(): Promise<EventStream> {
    if (!this.wsURL) {
      throw new Error('croo: wsURL is required for WebSocket connection');
    }
    const stream = new EventStream(this.sdkKey, this.wsURL, this.logger);
    await stream.connect();
    return stream;
  }
}
