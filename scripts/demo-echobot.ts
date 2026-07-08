// Self-contained demo counterparty for a real Handshake audit, on ONE WebSocket
// connection (a single SDK key allows only one). EchoBot plays both roles:
//
//   • Buyer  — hires Handshake to audit EchoBot's own echo service, and pays.
//   • Target — auto-accepts Handshake's probe negotiations and echoes back.
//
// The two roles are disambiguated by the hire negotiation id: the OrderCreated
// for that negotiation is the hire order (EchoBot pays); every other event is a
// probe where EchoBot is the provider (accept, then deliver on payment).
//
// Usage:
//   CROO_API_URL=https://api.croo.network CROO_WS_URL=wss://api.croo.network/ws \
//   CROO_SDK_KEY=<echobot sdk key> \
//   HANDSHAKE_SERVICE_ID=<handshake audit service id> \
//   ECHO_SERVICE_ID=<echobot echo service id> \
//   npx tsx scripts/demo-echobot.ts
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
  const handshakeServiceId = env('HANDSHAKE_SERVICE_ID');
  const echoServiceId = env('ECHO_SERVICE_ID');

  const stream = await client.connectWebSocket();
  console.log('[echobot] online (buyer + echo target on one connection)');

  let hireNegId = '';

  // TARGET role: Handshake probes EchoBot's echo service.
  stream.on(EventType.NegotiationCreated, async (e) => {
    try {
      const res = await client.acceptNegotiation(e.negotiation_id!);
      console.log(`[echobot/target] accepted probe ${e.negotiation_id} → order ${res.order.orderId}`);
    } catch (err) {
      console.error('[echobot/target] accept error:', err);
    }
  });

  // BUYER role: pay the hire order (matched by the hire negotiation id).
  // Every other OrderCreated is a probe order where EchoBot is the provider.
  stream.on(EventType.OrderCreated, async (e) => {
    if (e.negotiation_id !== hireNegId) return;
    try {
      const res = await client.payOrder(e.order_id!);
      console.log(`[echobot/buyer] paid Handshake — hire order ${e.order_id}, tx ${res.txHash}`);
      console.log('[echobot/buyer] audit running; Handshake will now probe the echo service...');
    } catch (err) {
      console.error('[echobot/buyer] pay error:', err);
    }
  });

  // TARGET role: deliver the echo once Handshake pays a probe.
  stream.on(EventType.OrderPaid, async (e) => {
    try {
      const neg = e.negotiation_id ? await client.getNegotiation(e.negotiation_id).catch(() => undefined) : undefined;
      await client.deliverOrder(e.order_id!, {
        deliverableType: DeliverableType.Text,
        deliverableText: JSON.stringify({ echo: neg?.requirements ?? 'ok', at: new Date().toISOString() }),
      });
      console.log(`[echobot/target] echoed + delivered probe order ${e.order_id}`);
    } catch (err) {
      console.error('[echobot/target] deliver error:', err);
    }
  });

  // BUYER role: the hire order completing means the signed audit was delivered.
  stream.on(EventType.OrderCompleted, async (e) => {
    if (e.negotiation_id !== hireNegId) return;
    try {
      const delivery = await client.getDelivery(e.order_id!);
      console.log('\n[echobot/buyer] ===== AUDIT RECEIPT DELIVERED BY HANDSHAKE =====');
      console.log(JSON.stringify(JSON.parse(delivery.deliverableText), null, 2));
      console.log('[echobot/buyer] ================================================\n');
    } catch (err) {
      console.error('[echobot/buyer] get delivery error:', err);
    } finally {
      stream.close();
      process.exit(0);
    }
  });

  // Kick off: EchoBot hires Handshake, asking it to audit the echo service.
  const neg = await client.negotiateOrder({
    serviceId: handshakeServiceId,
    requirements: JSON.stringify({ target_service_id: echoServiceId }),
  });
  hireNegId = neg.negotiationId;
  console.log(`[echobot/buyer] hired Handshake — negotiation ${hireNegId}, target ${echoServiceId}`);

  process.on('SIGINT', () => { stream.close(); process.exit(0); });
}

main().catch((err) => { console.error(err); process.exit(1); });
