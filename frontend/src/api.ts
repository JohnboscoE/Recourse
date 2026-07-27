/** Typed client for the Recourse backend. Vite proxies /api → :3001 in dev. */

export interface JobView {
  jobId: string;
  status: number;
  statusLabel: string;
  poster: string;
  agent: string;
  subject: string;
  paymentAmount: string;
  minIncrease: string;
  observedIncrease: string;
  baseline: string;
  deadline: string;
  deadlinePassed: boolean;
  deltaMet: boolean;
  executionRef: string;
  pendingDecision: { action: string; reason: string };
}

export interface LogEvent {
  seq: number;
  ts: string;
  level: "info" | "success" | "warn" | "error";
  jobId?: string;
  phase?: string;
  message: string;
  executionId?: string;
  txHash?: string;
}

export interface AppConfig {
  escrowAddress: string;
  chainId: number;
  explorer: string;
  keeperHubWallet: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export const api = {
  config: () => req<AppConfig>("/config"),
  balances: () => req<{ escrowUsdc: string; walletUsdc: string; stale: boolean }>("/balances"),
  jobs: () => req<{ jobs: JobView[] }>("/jobs"),
  events: (sinceSeq: number) =>
    req<{ events: LogEvent[]; latestSeq: number }>(`/events?since=${sinceSeq}`),

  postJob: (body: {
    subject: string;
    minIncrease: string;
    payment: string;
    deadlineMins: number;
  }) => req<{ started: boolean }>("/jobs", { method: "POST", body: JSON.stringify(body) }),

  work: (jobId: string, mode: "honest" | "fail") =>
    req<{ started: boolean }>(`/jobs/${jobId}/work`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),

  resolve: (jobId: string, dryRun: boolean) =>
    req<{ started: boolean }>(`/jobs/${jobId}/resolve?dryRun=${dryRun ? 1 : 0}`, {
      method: "POST",
    }),
};
