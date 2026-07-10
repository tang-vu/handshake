import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

export interface JobRow {
  job_id: string;
  order_id: string;
  negotiation_id: string;
  buyer_agent_id: string;
  tier: string;
  target_service_id: string;
  target_agent_id: string | null;
  intake_json: string;
  status: string;
  fail_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProbeRow {
  job_id: string;
  seq: number;
  negotiation_id: string | null;
  order_id: string | null;
  status: string;
  price: string | null;
  requester_wallet: string | null;
  provider_wallet: string | null;
  pay_tx_hash: string | null;
  clear_tx_hash: string | null;
  started_at: string | null;
  order_created_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  delivery_json: string | null;
  error: string | null;
}

export interface TraceStepRow {
  job_id: string;
  seq: number;
  ts: string;
  step: string;
  data_json: string;
  prev_hash: string;
  hash: string;
}

export interface ReportRow {
  job_id: string;
  subject_agent_id: string;
  report_json: string;
  trace_root: string;
  verdict: string;
  created_at: string;
}

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
db.exec(readFileSync(schemaPath, 'utf8'));

const now = () => new Date().toISOString();

export const repo = {
  createJob(j: Omit<JobRow, 'created_at' | 'updated_at' | 'fail_reason'>): void {
    db.prepare(
      `INSERT INTO jobs (job_id, order_id, negotiation_id, buyer_agent_id, tier, target_service_id,
       target_agent_id, intake_json, status, created_at, updated_at)
       VALUES (@job_id, @order_id, @negotiation_id, @buyer_agent_id, @tier, @target_service_id,
       @target_agent_id, @intake_json, @status, @created_at, @updated_at)`
    ).run({ ...j, created_at: now(), updated_at: now() });
  },

  setJobStatus(jobId: string, status: string, failReason?: string): void {
    db.prepare('UPDATE jobs SET status = ?, fail_reason = ?, updated_at = ? WHERE job_id = ?')
      .run(status, failReason ?? null, now(), jobId);
  },

  getJob(jobId: string): JobRow | undefined {
    return db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId) as JobRow | undefined;
  },

  // Jobs left in a non-terminal state by a previous process run.
  getInFlightJobs(): JobRow[] {
    return db.prepare(
      `SELECT * FROM jobs WHERE status IN ('accepted', 'awaiting_payment', 'auditing')`
    ).all() as JobRow[];
  },

  upsertProbe(p: ProbeRow): void {
    db.prepare(
      `INSERT INTO probes (job_id, seq, negotiation_id, order_id, status, price, requester_wallet, provider_wallet,
       pay_tx_hash, clear_tx_hash, started_at, order_created_at, paid_at, completed_at, delivery_json, error)
       VALUES (@job_id, @seq, @negotiation_id, @order_id, @status, @price, @requester_wallet, @provider_wallet,
       @pay_tx_hash, @clear_tx_hash, @started_at, @order_created_at, @paid_at, @completed_at, @delivery_json, @error)
       ON CONFLICT (job_id, seq) DO UPDATE SET
         negotiation_id = @negotiation_id, order_id = @order_id, status = @status, price = @price,
         requester_wallet = @requester_wallet, provider_wallet = @provider_wallet,
         pay_tx_hash = @pay_tx_hash, clear_tx_hash = @clear_tx_hash, started_at = @started_at,
         order_created_at = @order_created_at, paid_at = @paid_at, completed_at = @completed_at,
         delivery_json = @delivery_json, error = @error`
    ).run(p);
  },

  getProbes(jobId: string): ProbeRow[] {
    return db.prepare('SELECT * FROM probes WHERE job_id = ? ORDER BY seq').all(jobId) as ProbeRow[];
  },

  appendTraceStep(s: TraceStepRow): void {
    db.prepare(
      `INSERT INTO trace_steps (job_id, seq, ts, step, data_json, prev_hash, hash)
       VALUES (@job_id, @seq, @ts, @step, @data_json, @prev_hash, @hash)`
    ).run(s);
  },

  getTraceSteps(jobId: string): TraceStepRow[] {
    return db.prepare('SELECT * FROM trace_steps WHERE job_id = ? ORDER BY seq').all(jobId) as TraceStepRow[];
  },

  getLastTraceStep(jobId: string): TraceStepRow | undefined {
    return db.prepare('SELECT * FROM trace_steps WHERE job_id = ? ORDER BY seq DESC LIMIT 1')
      .get(jobId) as TraceStepRow | undefined;
  },

  saveReport(r: Omit<ReportRow, 'created_at'>): void {
    db.prepare(
      `INSERT OR REPLACE INTO reports (job_id, subject_agent_id, report_json, trace_root, verdict, created_at)
       VALUES (@job_id, @subject_agent_id, @report_json, @trace_root, @verdict, @created_at)`
    ).run({ ...r, created_at: now() });
  },

  getReport(jobId: string): ReportRow | undefined {
    return db.prepare('SELECT * FROM reports WHERE job_id = ?').get(jobId) as ReportRow | undefined;
  },

  getLatestReportForSubject(agentId: string): ReportRow | undefined {
    return db.prepare('SELECT * FROM reports WHERE subject_agent_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(agentId) as ReportRow | undefined;
  },

  // Most recent reports across all subjects, for the public landing page.
  getLatestReports(limit: number): ReportRow[] {
    return db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT ?')
      .all(limit) as ReportRow[];
  },
};
