// Self-contained demo counterparty for a real Handshake audit, on ONE SDK key.
// EchoBot plays both roles on a single connection:
//
//   • Buyer  — hires Handshake to audit EchoBot's own echo service, and pays.
//   • Target — accepts Handshake's probe negotiations and echoes back.
//
// Everything is driven by POLLING the REST API (listNegotiations / listOrders),
// not by WebSocket events: the requester-side order_created event proved
// unreliable, and polling is exactly how Handshake's own engine works. The WS
// is still opened so the agent shows Online.
//
// Usage:
//   CROO_API_URL=https://api.croo.network CROO_WS_URL=wss://api.croo.network/ws \
//   CROO_SDK_KEY=<echobot sdk key> \
//   HANDSHAKE_SERVICE_ID=<handshake audit service id> \
//   ECHO_SERVICE_ID=<echobot echo service id> \
//   npx tsx scripts/demo-echobot.ts
import { AgentClient } from '@croo-network/sdk';

function env(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`missing env ${name}`); process.exit(1); }
  return v;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const client = new AgentClient(
    { baseURL: env('CROO_API_URL'), wsURL: env('CROO_WS_URL'), rpcURL: process.env.BASE_RPC_URL },
    env('CROO_SDK_KEY')
  );
  const handshakeServiceId = env('HANDSHAKE_SERVICE_ID');
  const echoServiceId = env('ECHO_SERVICE_ID');

  // Open the WS so the agent goes Online, then drive everything by polling.
  const stream = await client.connectWebSocket();
  console.log('[echobot] online (buyer + echo target, poll-driven)');

  // Buyer: hire Handshake, asking it to audit the echo service.
  const hire = await client.negotiateOrder({
    serviceId: handshakeServiceId,
    requirements: JSON.stringify({ target_service_id: echoServiceId }),
  });
  console.log(`[echobot/buyer] hired Handshake — negotiation ${hire.negotiationId}, target ${echoServiceId}`);

  const acceptedProbes = new Set<string>();
  const deliveredProbes = new Set<string>();
  let hirePaid = false;
  const deadline = Date.now() + 15 * 60 * 1000;

  while (Date.now() < deadline) {
    try {
      // TARGET: accept Handshake's probe negotiations.
      const pending = await client.listNegotiations({ role: 'provider', status: 'pending', pageSize: 50 });
      for (const n of pending) {
        if (acceptedProbes.has(n.negotiationId)) continue;
        acceptedProbes.add(n.negotiationId);
        try {
          const r = await client.acceptNegotiation(n.negotiationId);
          console.log(`[echobot/target] accepted probe → order ${r.order.orderId}`);
        } catch (err: any) {
          console.error('[echobot/target] accept error:', err?.message ?? err);
        }
      }

      // TARGET: deliver an echo for any paid probe order.
      const paid = await client.listOrders({ role: 'provider', status: 'paid', pageSize: 50 });
      for (const o of paid) {
        if (deliveredProbes.has(o.orderId)) continue;
        deliveredProbes.add(o.orderId);
        try {
          await client.deliverOrder(o.orderId, {
            deliverableType: 'text',
            deliverableText: JSON.stringify({ echo: 'ok', order: o.orderId, at: new Date().toISOString() }),
          });
          console.log(`[echobot/target] echoed + delivered probe order ${o.orderId}`);
        } catch (err: any) {
          console.error('[echobot/target] deliver error:', err?.message ?? err);
        }
      }

      // BUYER: find the hire order and drive it to completion.
      const mine = await client.listOrders({ role: 'buyer', pageSize: 50 });
      const hireOrder = mine.find((o) => o.negotiationId === hire.negotiationId);
      if (hireOrder) {
        if (hireOrder.status === 'created' && !hirePaid) {
          hirePaid = true;
          const res = await client.payOrder(hireOrder.orderId);
          console.log(`[echobot/buyer] paid Handshake — order ${hireOrder.orderId}, tx ${res.txHash}`);
          console.log('[echobot/buyer] audit running; Handshake will now probe the echo service...');
        } else if (hireOrder.status === 'completed') {
          const delivery = await client.getDelivery(hireOrder.orderId);
          console.log('\n[echobot/buyer] ===== AUDIT RECEIPT DELIVERED BY HANDSHAKE =====');
          console.log(JSON.stringify(JSON.parse(delivery.deliverableText), null, 2));
          console.log('===================================================\n');
          stream.close();
          process.exit(0);
        } else if (hireOrder.status === 'rejected' || hireOrder.status === 'expired') {
          console.error(`[echobot/buyer] hire order ${hireOrder.status}: ${hireOrder.rejectReason || ''}`);
          stream.close();
          process.exit(1);
        }
      }
    } catch (err: any) {
      console.error('[echobot] poll error (continuing):', err?.message ?? err);
    }
    await sleep(3000);
  }

  console.error('[echobot] timed out after 5 minutes');
  stream.close();
  process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
