import { createTryOnJobSchema, productCategorySchema } from "@tryon/contracts";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { JobStore } from "./job-store.js";
import { MockInferenceProvider, type InferenceProvider } from "./provider.js";

export function createApp(provider: InferenceProvider = new MockInferenceProvider()) {
  const app = express();
  const jobs = new JobStore(provider);

  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: true, methods: ["GET", "POST", "DELETE"] }));
  app.use(express.json({ limit: "12mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "tryon-api" });
  });

  app.get("/api/v1/categories", (_request, response) => {
    response.json(
      productCategorySchema.options.map((id) => ({
        id,
        enabled: ["upper_body", "lower_body", "dress"].includes(id),
      })),
    );
  });

  app.get("/api/v1/providers/health", async (_request, response, next) => {
    try {
      response.json({ name: provider.name, ...(await provider.health()) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/try-on", (request, response) => {
    const parsed = createTryOnJobSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid try-on request",
        details: parsed.error.flatten(),
      });
      return;
    }
    response.status(202).json(jobs.create(parsed.data));
  });

  app.get("/api/v1/jobs/:id", (request, response) => {
    const job = jobs.get(request.params.id);
    if (!job) {
      response.status(404).json({ error: "Job not found" });
      return;
    }
    response.json(job);
  });

  app.delete("/api/v1/jobs/:id", (request, response) => {
    const job = jobs.cancel(request.params.id);
    if (!job) {
      response.status(404).json({ error: "Job not found" });
      return;
    }
    response.json(job);
  });

  app.use(
    (
      error: Error,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      response.status(500).json({ error: "Internal server error", detail: error.message });
    },
  );

  return app;
}

