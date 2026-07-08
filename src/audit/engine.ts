import { randomUUID } from 'node:crypto';
import type { Order } from '@croo-network/sdk';
import type { CapClient, ChainVerifier, IntakeEvent } from '../cap/client.js';
import { parseIntake, probeInput, type Intake } from '../cap/intake.js';
import { repo, type ProbeRow } from '../db/repo.js';
import { appendTrace, traceRoot } from './trace.js';
import { checkCallable } from './checks/callable.js';
import { checkReliability } from './checks/reliability.js';
import { checkSettlement } from './checks/settlement.js';
import { checkSchema, type DeliverySnapshot } from './checks/schema.js';
import { checkLatency } from './checks/latency.js';
import { buildSignedReport, deliverablePayload } from '../attest/report.js';
import { config, type Tier } from '../config.js';

const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tierForService(serviceId: string): Tier | undefined {
  if (config.deepServiceId && serviceId === config.deepServiceId) return 'deep';
  if (config.basicServiceId && serviceId === config.basicServiceId) return 'basic';
  // No service ids configured → single-service default: treat every negotiation
  // as the basic tier. (When ids ARE configured, an unmatched service is rejected.)
  if (!config.basicServiceId && !config.deepServiceId) return 'basic';
  return undefined;
}

export class AuditEngine {
  // Audits run strictly one at a time: concurrent payOrder calls from one AA
  // wallet collide on the wallet nonce at the bundler (docs-cap/faq.md).
  private tail: Promise<void> = Promise.resolve();

  constructor(private cap: CapClient, private verifier: ChainVerifier) {}

  handleIntake(e: IntakeEvent): void {
    this.tail = this.tail
      .then(() => this.processIntake(e.negotiationId))
      .catch((err) => console.error('engine: unhandled job error', err));
  }

  // Jobs left mid-flight by a previous process are aborted; the buyer's escrow
  // is protected by the platform's SLA auto-refund. (No retry queue by design.)
  abortStaleJobs(): void {
    for (const job of repo.getInFlightJobs()) {
      repo.setJobStatus(job.job_id, 'aborted', 'process restarted during audit; buyer refunded via SLA timeout');
      appendTrace(job.job_id, 'job_aborted', { reason: 'process restart' });
    }
  }

  private async processIntake(negotiationId: string): Promise<void> {
    const neg = await this.cap.getNegotiation(negotiationId);
    const tierName = tierForService(neg.serviceId);
    if (!tierName) {
      console.warn(`engine: negotiation ${negotiationId} targets unknown service ${neg.serviceId}, ignoring`);
      return;
    }
    const parsed = parseIntake(neg.requirements);
    if (!parsed.ok) {
      await this.cap.rejectNegotiation(negotiationId, `handshake: invalid intake — ${parsed.error}`);
      console.warn(`engine: rejected negotiation ${negotiationId}: ${parsed.error}`);
      return;
    }
    const intake = parsed.intake;

    // Accepting submits the on-chain createOrder. It can fail for reasons
    // outside our control (e.g. the buyer's AA wallet has no USDC for the
    // ERC-20 paymaster). Reject cleanly instead of leaving the buyer hanging.
    let order;
    try {
      ({ order } = await this.cap.acceptNegotiation(negotiationId));
    } catch (err: any) {
      const msg = err?.reason ? `${err.reason}: ${err.message}` : String(err?.message ?? err);
      console.error(`engine: acceptNegotiation failed for ${negotiationId}: ${msg}`);
      await this.cap.rejectNegotiation(negotiationId, `handshake: cannot start audit — ${msg}`).catch(() => {});
      return;
    }
    const jobId = randomUUID();
    repo.createJob({
      job_id: jobId,
      order_id: order.orderId,
      negotiation_id: negotiationId,
      buyer_agent_id: neg.requesterAgentId,
      tier: tierName,
      target_service_id: intake.target_service_id,
      target_agent_id: intake.target_agent_id ?? null,
      intake_json: JSON.stringify(intake),
      status: 'awaiting_payment',
    });
    appendTrace(jobId, 'intake_accepted', {
      buyer_agent_id: neg.requesterAgentId,
      our_order_id: order.orderId,
      target_service_id: intake.target_service_id,
      tier: tierName,
    });

    const paid = await this.waitFor(
      () => this.cap.getOrder(order.orderId),
      (o) => o.status !== 'created' && o.status !== 'creating' && o.status !== 'paying',
      config.buyerPayTimeoutMs
    );
    if (!paid || paid.status !== 'paid') {
      repo.setJobStatus(jobId, 'expired_unpaid', `buyer never paid (status: ${paid?.status ?? 'timeout'})`);
      appendTrace(jobId, 'job_expired_unpaid', { last_status: paid?.status ?? 'timeout' });
      return;
    }
    appendTrace(jobId, 'payment_received', { pay_tx_hash: paid.payTxHash, price: paid.price });
    repo.setJobStatus(jobId, 'auditing');

    try {
      await this.runAudit(jobId, tierName, intake, paid);
    } catch (err: any) {
      // Integrity rule: if the audit itself breaks, refund the buyer rather
      // than deliver a report we can't stand behind.
      appendTrace(jobId, 'audit_error', { error: String(err?.message ?? err) });
      try {
        await this.cap.rejectOrder(paid.orderId, 'handshake: internal audit error — full refund');
      } catch (rejectErr: any) {
        appendTrace(jobId, 'refund_failed', { error: String(rejectErr?.message ?? rejectErr) });
      }
      repo.setJobStatus(jobId, 'failed', String(err?.message ?? err));
    }
  }

  private async runAudit(jobId: string, tierName: Tier, intake: Intake, ourOrder: Order): Promise<void> {
    const tier = config.tiers[tierName];
    const startedAt = now();
    // The SLA countdown started at the buyer's payment; miss it and the escrow
    // (our fee) auto-refunds. Keep a safety margin to build/sign/deliver, but
    // never let the margin consume the whole budget on short SLAs.
    const platformDeadline = Date.parse(ourOrder.slaDeadline);
    const budgetMs = Math.min(
      Number.isFinite(platformDeadline) ? platformDeadline - Date.now() : Infinity,
      tier.slaMs
    );
    const marginMs = Math.min(config.slaSafetyMarginMs, Math.floor(budgetMs * 0.2));
    const deadline = Date.now() + budgetMs - marginMs;

    const probes: ProbeRow[] = [];
    for (let seq = 1; seq <= tier.probeCount; seq++) {
      if (Date.now() >= deadline) {
        appendTrace(jobId, 'audit_deadline_reached', { executed_probes: probes.length, planned: tier.probeCount });
        break;
      }
      const probe = await this.runProbe(jobId, seq, intake, deadline, tier.targetPriceCapBaseUnits);
      probes.push(probe);

      if (probe.status === 'price_over_cap') {
        const reason = `handshake: target price ${probe.price} exceeds ${tierName} tier cap ${tier.targetPriceCapBaseUnits} (USDC base units) — full refund`;
        appendTrace(jobId, 'job_refused_price_cap', { target_price: probe.price, cap: String(tier.targetPriceCapBaseUnits) });
        await this.cap.rejectOrder(ourOrder.orderId, reason);
        repo.setJobStatus(jobId, 'refused', reason);
        return;
      }
    }

    // Zero executed probes means WE never tested the target — that is our
    // failure, not theirs. Refund instead of delivering a report that blames
    // the subject for something we didn't measure.
    if (probes.length === 0) {
      throw new Error('no probes executed before the audit deadline');
    }

    const checks = {
      callable: checkCallable(probes),
      schema: checkSchema(probes),
      settlement: await checkSettlement(probes, this.verifier),
      latency: checkLatency(probes),
      reliability: checkReliability(probes),
    };
    appendTrace(jobId, 'checks_computed', {
      callable: checks.callable.pass,
      schema: checks.schema.pass,
      settlement: checks.settlement.pass,
      latency: checks.latency.pass,
      reliability: checks.reliability.pass,
    });

    const subjectAgentId =
      (await this.subjectAgentIdFromProbes(probes)) ?? intake.target_agent_id ?? 'unknown';

    // Our own agent id: from config if set, else the provider side of the
    // buyer's order (that's us) — lets Handshake self-configure from just the key.
    const auditorAgentId = config.handshakeAgentId || ourOrder.providerAgentId || 'handshake';
    const report = buildSignedReport({
      jobId,
      auditorAgentId,
      subjectAgentId,
      subjectServiceId: intake.target_service_id,
      startedAt,
      finishedAt: now(),
      checks,
      traceRoot: traceRoot(jobId),
    });
    repo.saveReport({
      job_id: jobId,
      subject_agent_id: subjectAgentId,
      report_json: JSON.stringify(report),
      trace_root: report.trace_root as string,
      verdict: report.verdict as string,
    });
    appendTrace(jobId, 'report_signed', { verdict: report.verdict, trace_root: report.trace_root });

    // Deliver as text (JSON string) — the common denominator every CAP client
    // reads (node SDK deliverableText, MCP server deliverable_text).
    const { txHash } = await this.cap.deliverOrder(ourOrder.orderId, {
      deliverableType: 'text',
      deliverableText: deliverablePayload(report),
    });
    appendTrace(jobId, 'report_delivered', { deliver_tx_hash: txHash });
    repo.setJobStatus(jobId, 'delivered');

    if (intake.callback_url) {
      try {
        await fetch(intake.callback_url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: deliverablePayload(report),
        });
        appendTrace(jobId, 'callback_sent', { url: intake.callback_url });
      } catch (err: any) {
        appendTrace(jobId, 'callback_failed', { url: intake.callback_url, error: String(err?.message ?? err) });
      }
    }
  }

  private async subjectAgentIdFromProbes(probes: ProbeRow[]): Promise<string | undefined> {
    const withOrder = probes.find((p) => p.order_id);
    if (!withOrder?.order_id) return undefined;
    try {
      return (await this.cap.getOrder(withOrder.order_id)).providerAgentId;
    } catch {
      return undefined;
    }
  }

  private async runProbe(
    jobId: string,
    seq: number,
    intake: Intake,
    deadline: number,
    priceCap: bigint
  ): Promise<ProbeRow> {
    const probe: ProbeRow = {
      job_id: jobId, seq, negotiation_id: null, order_id: null, status: 'negotiating',
      price: null, requester_wallet: null, provider_wallet: null, pay_tx_hash: null,
      clear_tx_hash: null, started_at: now(), order_created_at: null, paid_at: null,
      completed_at: null, delivery_json: null, error: null,
    };
    const save = () => repo.upsertProbe(probe);
    save();

    try {
      const input = probeInput(intake, seq, jobId);
      appendTrace(jobId, 'probe_started', { seq, input });
      const neg = await this.cap.negotiateOrder(intake.target_service_id, input);
      probe.negotiation_id = neg.negotiationId;
      save();

      const order = await this.waitFor(
        () => this.cap.findOrderByNegotiation(neg.negotiationId),
        (o) => o !== undefined,
        Math.min(config.probeOrderCreateTimeoutMs, deadline - Date.now())
      );
      if (!order) {
        const finalNeg = await this.cap.getNegotiation(neg.negotiationId).catch(() => neg);
        probe.status = finalNeg.status === 'rejected' ? 'rejected' : 'expired';
        probe.error = finalNeg.status === 'rejected'
          ? `negotiation rejected: ${finalNeg.rejectReason}`
          : 'no on-chain order within timeout (target did not accept)';
        save();
        appendTrace(jobId, 'probe_no_order', { seq, negotiation_status: finalNeg.status });
        return probe;
      }

      probe.order_id = order.orderId;
      probe.price = order.price;
      probe.requester_wallet = order.requesterWalletAddress;
      probe.provider_wallet = order.providerWalletAddress;
      probe.order_created_at = now();
      probe.status = 'created';
      save();
      appendTrace(jobId, 'probe_order_created', {
        seq, order_id: order.orderId, price: order.price, create_tx_hash: order.createTxHash,
        provider_agent_id: order.providerAgentId,
      });

      // Price gate before any money moves; rejecting an unpaid order is free.
      if (BigInt(order.price) > priceCap) {
        probe.status = 'price_over_cap';
        save();
        await this.cap.rejectOrder(order.orderId, 'handshake: target price exceeds audit tier cap').catch(() => {});
        return probe;
      }

      const payRes = await this.cap.payOrder(order.orderId);
      probe.pay_tx_hash = payRes.txHash;
      probe.paid_at = now();
      probe.status = 'paid';
      save();
      appendTrace(jobId, 'probe_paid', { seq, pay_tx_hash: payRes.txHash });

      const finalOrder = await this.waitFor(
        () => this.cap.getOrder(order.orderId),
        (o) => ['completed', 'rejected', 'expired'].includes(o.status),
        Math.min(config.probeCompleteTimeoutMs, deadline - Date.now())
      );
      if (!finalOrder) {
        probe.status = 'error';
        probe.error = 'timeout waiting for delivery (escrow will auto-refund at target SLA)';
        save();
        appendTrace(jobId, 'probe_timeout', { seq });
        return probe;
      }

      probe.status = finalOrder.status;
      probe.clear_tx_hash = finalOrder.clearTxHash || null;
      probe.completed_at = now();
      if (finalOrder.status === 'completed') {
        const delivery = await this.cap.getDelivery(order.orderId).catch(() => undefined);
        if (delivery) {
          // Snapshot for the C2 schema check; cap stored content at 2 KB.
          const snapshot: DeliverySnapshot = {
            deliverableType: delivery.deliverableType,
            deliverableText: (delivery.deliverableText ?? '').slice(0, 2048),
            deliverableSchema: (delivery.deliverableSchema ?? '').slice(0, 2048),
            contentHash: delivery.contentHash ?? '',
          };
          probe.delivery_json = JSON.stringify(snapshot);
        }
        appendTrace(jobId, 'probe_delivery_received', {
          seq, content_hash: delivery?.contentHash ?? '', deliverable_type: delivery?.deliverableType ?? '',
        });
      } else {
        probe.error = `order ${finalOrder.status}: ${finalOrder.rejectReason || 'no reason given'}`;
      }
      save();
      appendTrace(jobId, 'probe_finished', { seq, status: probe.status });
      return probe;
    } catch (err: any) {
      probe.status = 'error';
      probe.error = String(err?.message ?? err);
      save();
      appendTrace(jobId, 'probe_error', { seq, error: probe.error });
      return probe;
    }
  }

  private async waitFor<T>(
    poll: () => Promise<T>,
    done: (value: T) => boolean,
    timeoutMs: number
  ): Promise<T | undefined> {
    const deadline = Date.now() + Math.max(timeoutMs, 0);
    while (Date.now() < deadline) {
      try {
        const value = await poll();
        if (done(value)) return value;
      } catch (err: any) {
        console.warn('engine: poll error (retrying):', err?.message ?? err);
      }
      await sleep(config.pollIntervalMs);
    }
    return undefined;
  }
}
