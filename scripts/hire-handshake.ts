// Buyer-side demo script: hires Handshake from a second agent's wallet.
//
// Usage:
//   CROO_API_URL=... CROO_WS_URL=... CROO_SDK_KEY=<buyer key> \
//   HANDSHAKE_SERVICE_ID=<handshake basic service id> \
//   TARGET_SERVICE_ID=<service to audit> \
//   npx tsx scripts/hire-handshake.ts
import { AgentClient, EventType, DeliverableType } from '@croo-network/sdk';

function env(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`missing env ${name}`); process.exit(1); }
  return v;
}

async function main(): Promise<void> {
  const client = new AgentClient(
    { baseURL: env('CROO_API_URL'), wsURL: env('CROO_WS_URL'), rpcURL: process.env.BASE_RPC_URL },
    env('CROO_SDK_KEY')
  );
  const stream = await client.connectWebSocket();

  stream.on(EventType.OrderCreated, async (e) => {
    console.log(`[buyer] order ${e.order_id} created — paying Handshake's fee...`);
    try {
      const res = await client.payOrder(e.order_id!);
      console.log(`[buyer] paid. escrow-lock tx: ${res.txHash}`);
      console.log(`[buyer] audit is running — waiting for the signed report (this can take a while)...`);
    } catch (err) {
      console.error('[buyer] pay failed:', err);
    }
  });

  stream.on(EventType.OrderRejected, (e) => {
    console.log(`[buyer] order ${e.order_id} rejected (refunded): ${e.reason ?? ''}`);
    stream.close();
    process.exit(0);
  });

  stream.on(EventType.OrderCompleted, async (e) => {
    const delivery = await client.getDelivery(e.order_id!);
    const payload = delivery.deliverableType === DeliverableType.Schema
      ? delivery.deliverableSchema
      : delivery.deliverableText;
    console.log('[buyer] audit delivered:');
    console.log(JSON.stringify(JSON.parse(payload), null, 2));
    stream.close();
    process.exit(0);
  });

  const neg = await client.negotiateOrder({
    serviceId: env('HANDSHAKE_SERVICE_ID'),
    requirements: JSON.stringify({
      target_service_id: env('TARGET_SERVICE_ID'),
      ...(process.env.TARGET_AGENT_ID ? { target_agent_id: process.env.TARGET_AGENT_ID } : {}),
    }),
  });
  console.log(`[buyer] negotiation ${neg.negotiationId} sent to Handshake — waiting for accept...`);

  process.on('SIGINT', () => { stream.close(); process.exit(0); });
}

main().catch((err) => { console.error(err); process.exit(1); });
