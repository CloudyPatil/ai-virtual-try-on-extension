import { tryOnJobSchema, type CreateTryOnJob, type TryOnJob } from "@tryon/contracts";

const API_BASE = "http://127.0.0.1:8787/api/v1";

export async function createTryOnJob(request: CreateTryOnJob) {
  const response = await fetch(`${API_BASE}/try-on`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`The backend rejected the request (${response.status})`);
  return tryOnJobSchema.parse(await response.json());
}

export async function getTryOnJob(id: string): Promise<TryOnJob> {
  const response = await fetch(`${API_BASE}/jobs/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`Unable to read generation status (${response.status})`);
  return tryOnJobSchema.parse(await response.json());
}

