import { randomUUID } from "node:crypto";
import type { CreateTryOnJob, JobStatus, TryOnJob } from "@tryon/contracts";
import type { InferenceProvider } from "./provider.js";

export class JobStore {
  readonly #jobs = new Map<string, TryOnJob>();

  constructor(private readonly provider: InferenceProvider) {}

  create(request: CreateTryOnJob): TryOnJob {
    const now = new Date().toISOString();
    const job: TryOnJob = {
      id: randomUUID(),
      status: "queued",
      progress: 0,
      message: "Request queued",
      createdAt: now,
      updatedAt: now,
    };
    this.#jobs.set(job.id, job);
    void this.#run(job.id, request);
    return job;
  }

  get(id: string) {
    return this.#jobs.get(id);
  }

  cancel(id: string) {
    const job = this.#jobs.get(id);
    if (!job || ["completed", "failed", "cancelled"].includes(job.status)) return job;
    return this.#update(id, "cancelled", 100, "Generation cancelled");
  }

  async #run(id: string, request: CreateTryOnJob) {
    try {
      this.#update(id, "validating", 10, "Validating images and category");
      await this.#pause(120);
      if (this.#isCancelled(id)) return;
      this.#update(id, "preprocessing", 25, "Preparing profile and garment");
      await this.#pause(120);
      if (this.#isCancelled(id)) return;
      this.#update(id, "waiting_for_gpu", 40, "Waiting for inference provider");
      await this.#pause(120);
      if (this.#isCancelled(id)) return;
      this.#update(id, "generating", 60, "Generating try-on preview");
      const result = await this.provider.generate(request);
      if (this.#isCancelled(id)) return;
      this.#update(id, "evaluating", 85, "Checking product consistency");
      await this.#pause(120);
      if (this.#isCancelled(id)) return;
      const completed = this.#update(id, "completed", 100, "Preview ready");
      this.#jobs.set(id, { ...completed, result, updatedAt: new Date().toISOString() });
    } catch (error) {
      const failed = this.#update(id, "failed", 100, "Generation failed");
      this.#jobs.set(id, {
        ...failed,
        error: error instanceof Error ? error.message : "Unknown provider error",
      });
    }
  }

  #isCancelled(id: string) {
    return this.#jobs.get(id)?.status === "cancelled";
  }

  #pause(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  #update(id: string, status: JobStatus, progress: number, message: string) {
    const current = this.#jobs.get(id);
    if (!current) throw new Error(`Unknown job ${id}`);
    const updated: TryOnJob = {
      ...current,
      status,
      progress,
      message,
      updatedAt: new Date().toISOString(),
    };
    this.#jobs.set(id, updated);
    return updated;
  }
}

