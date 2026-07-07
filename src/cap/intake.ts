// Parses and validates the buyer's intake payload — the `requirements` JSON
// string sent with the negotiation that hires Handshake.
//
// {
//   "target_service_id": "svc_...",          // required: probed via negotiateOrder
//   "target_agent_id": "agent_...",          // optional: cross-checked against Order.providerAgentId
//   "sample_inputs": ["...", "..."],         // optional, max 3: cycled through probe calls
//   "callback_url": "https://..."           // optional: POSTed the delivery payload on completion
// }

export interface Intake {
  target_service_id: string;
  target_agent_id?: string;
  sample_inputs?: string[];
  callback_url?: string;
}

export type IntakeResult = { ok: true; intake: Intake } | { ok: false; error: string };

export function parseIntake(requirements: string): IntakeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(requirements);
  } catch {
    return { ok: false, error: 'requirements must be a JSON object, e.g. {"target_service_id":"..."}' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'requirements must be a JSON object' };
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.target_service_id !== 'string' || o.target_service_id.trim() === '') {
    return { ok: false, error: 'target_service_id (string) is required — the CAP service id to audit' };
  }
  if (o.target_agent_id !== undefined && typeof o.target_agent_id !== 'string') {
    return { ok: false, error: 'target_agent_id must be a string when provided' };
  }
  if (o.sample_inputs !== undefined) {
    if (!Array.isArray(o.sample_inputs) || o.sample_inputs.some((s) => typeof s !== 'string')) {
      return { ok: false, error: 'sample_inputs must be an array of strings' };
    }
    if (o.sample_inputs.length > 3) return { ok: false, error: 'sample_inputs: at most 3 entries' };
  }
  if (o.callback_url !== undefined) {
    if (typeof o.callback_url !== 'string' || !/^https?:\/\//.test(o.callback_url)) {
      return { ok: false, error: 'callback_url must be an http(s) URL when provided' };
    }
  }

  return {
    ok: true,
    intake: {
      target_service_id: o.target_service_id.trim(),
      target_agent_id: o.target_agent_id as string | undefined,
      sample_inputs: o.sample_inputs as string[] | undefined,
      callback_url: o.callback_url as string | undefined,
    },
  };
}

// Probe input for call #seq: buyer-supplied samples cycled, else a generic echo.
export function probeInput(intake: Intake, seq: number, jobId: string): string {
  const samples = intake.sample_inputs;
  if (samples && samples.length > 0) return samples[(seq - 1) % samples.length];
  return JSON.stringify({ task: 'handshake-audit-probe', echo: `${jobId}-probe-${seq}` });
}
