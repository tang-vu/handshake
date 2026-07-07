// --- Deliverable ---

export const DeliverableType = {
  Text: 'text',
  Schema: 'schema',
} as const;

// --- Negotiation ---

export interface Negotiation {
  negotiationId: string;
  serviceId: string;
  requesterAgentId: string;
  providerAgentId: string;
  requirements: string;
  status: string;
  rejectReason: string;
  metadata: string;
  expiresAt: string;
  createdTime: string;
  updatedTime: string;
  /**
   * Fund-transfer fields. Populated only when the underlying service has
   * require_fund_transfer=true. fundAmount is in base units (decimal string);
   * fundToken is the ERC-20 address (zero address means native ETH);
   * providerFundAddress is set by the provider at accept time and is where
   * the requester's pay tx transfers fundAmount of fundToken.
   */
  fundAmount?: string;
  fundToken?: string;
  providerFundAddress?: string;
}

export const NegotiationStatus = {
  Pending: 'pending',
  Accepted: 'accepted',
  Rejected: 'rejected',
  Expired: 'expired',
} as const;

export interface NegotiateOrderRequest {
  serviceId: string;
  requirements?: string;
  metadata?: string;
  /** Optional. If omitted, the server uses the agent bound to the current SDK-Key. */
  requesterAgentId?: string;
  /**
   * fundAmount / fundToken are required when the target service has
   * require_fund_transfer=true; must be empty otherwise. fundAmount is in
   * base units (decimal string). fundToken is an ERC-20 address; the zero
   * address means native ETH and is only allowed for flat-priced services.
   */
  fundAmount?: string;
  fundToken?: string;
}

export interface AcceptNegotiationResult {
  negotiation: Negotiation;
  order: Order;
}

// --- Order ---

export interface Order {
  orderId: string;
  negotiationId: string;
  chainOrderId: string;
  serviceId: string;
  requesterAgentId: string;
  providerAgentId: string;
  buyerUserId: string;
  requesterWalletAddress: string;
  providerWalletAddress: string;
  price: string;
  paymentToken: string;
  deliveryWindow: number;
  status: string;
  rejectReason: string;
  createTxHash: string;
  payTxHash: string;
  deliverTxHash: string;
  rejectTxHash: string;
  clearTxHash: string;
  slaDeadline: string;
  payDeadline: string;
  createdTime: string;
  updatedTime: string;
  createdAt: string;
  paidAt: string;
  deliveredAt: string;
  rejectedAt: string;
  expiredAt: string;
  /**
   * Fund-transfer fields (empty/zero for non-fund services).
   * feeAmount is the on-chain escrow service fee in paymentToken (USDC)
   * base units. fundAmount / fundToken describe the off-chain transfer the
   * requester's pay tx batch performs into providerFundAddress.
   */
  feeAmount?: string;
  fundAmount?: string;
  fundToken?: string;
  providerFundAddress?: string;
}

export const OrderStatus = {
  Creating: 'creating',
  Created: 'created',
  Paying: 'paying',
  Paid: 'paid',
  Delivering: 'delivering',
  Completed: 'completed',
  Rejecting: 'rejecting',
  Rejected: 'rejected',
  Expired: 'expired',
  CreateFailed: 'create_failed',
  PayFailed: 'pay_failed',
  DeliverFailed: 'deliver_failed',
} as const;

export interface PayOrderResult {
  order: Order;
  txHash: string;
}

// --- Delivery ---

export interface Delivery {
  deliveryId: string;
  orderId: string;
  providerAgentId: string;
  deliverableType: string;
  deliverableSchema: string;
  deliverableText: string;
  contentHash: string;
  status: string;
  submittedAt: string;
  verifiedAt: string;
  createdTime: string;
  updatedTime: string;
}

export const DeliveryStatus = {
  Submitted: 'submitted',
  Accepted: 'accepted',
  Rejected: 'rejected',
} as const;

export interface DeliverOrderRequest {
  deliverableType: string;
  deliverableSchema?: string;
  deliverableText?: string;
}

export interface DeliverOrderResult {
  order: Order;
  delivery: Delivery;
  txHash: string;
}

// --- Config ---

export interface Config {
  baseURL: string;
  wsURL?: string;
  /** Custom JSON-RPC endpoint for on-chain balance checks. Defaults to https://mainnet.base.org */
  rpcURL?: string;
  logger?: Logger;
}

export interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

// --- List Options ---

export interface ListOptions {
  status?: string;
  page?: number;
  pageSize?: number;
  role?: string;
  agentId?: string;
}

// --- WebSocket Events ---

export const EventType = {
  NegotiationCreated: 'order_negotiation_created',
  NegotiationRejected: 'order_negotiation_rejected',
  NegotiationExpired: 'order_negotiation_expired',
  OrderCreated: 'order_created',
  OrderPaid: 'order_paid',
  OrderCompleted: 'order_completed',
  OrderRejected: 'order_rejected',
  OrderExpired: 'order_expired',
} as const;

export type EventTypeName = (typeof EventType)[keyof typeof EventType];

export interface Event {
  type: string;
  raw: Record<string, any>;
  negotiation_id?: string;
  order_id?: string;
  requester_agent_id?: string;
  provider_agent_id?: string;
  service_id?: string;
  status?: string;
  reason?: string;
}
