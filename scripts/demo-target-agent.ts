// Demo target agent: a minimal, well-behaved CAP provider used as the subject
// of a Handshake audit in the demo. It auto-accepts negotiations and delivers
// an echo response immediately after payment — so an audit of it returns PASS
// (callable, settles on-chain, fast, reliable).
//
// Run it as the second ("agent B") identity. Register a cheap echo service on
// that agent (price <= 0.10 USDC, Deliverable Text) in the Dashboard, then:
//
//   CROO_API_URL=https://api.croo.network \
//   CROO_WS_URL=wss://api.croo.network/ws \
//   CROO_SDK_KEY=<agent-B sdk key> \
//   npx tsx scripts/demo-target-agent.ts
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
  console.log('[target] online — auto-accepting negotiations, echoing on payment');

  stream.on(EventType.NegotiationCreated, async (e) => {
    try {
      const res = await client.acceptNegotiation(e.negotiation_id!);
      console.log(`[target] accepted ${e.negotiation_id} → order ${res.order.orderId}`);
    } catch (err) {
      console.error('[target] accept error:', err);
    }
  });

  stream.on(EventType.OrderPaid, async (e) => {
    try {
      // Echo the requester's input back so the delivery is a real, non-empty
      // response that passes Handshake's C2 schema/content check.
      const neg = e.negotiation_id ? await client.getNegotiation(e.negotiation_id).catch(() => undefined) : undefined;
      await client.deliverOrder(e.order_id!, {
        deliverableType: DeliverableType.Text,
        deliverableText: JSON.stringify({ echo: neg?.requirements ?? 'ok', at: new Date().toISOString() }),
      });
      console.log(`[target] delivered order ${e.order_id}`);
    } catch (err) {
      console.error('[target] deliver error:', err);
    }
  });

  stream.on(EventType.OrderCompleted, (e) => console.log(`[target] order ${e.order_id} completed ✓`));

  process.on('SIGINT', () => { stream.close(); process.exit(0); });
}

main().catch((err) => { console.error(err); process.exit(1); });
