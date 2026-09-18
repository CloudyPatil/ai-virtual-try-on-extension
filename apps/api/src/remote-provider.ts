import type { CreateTryOnJob } from "@tryon/contracts";
import type { InferenceProvider, ProviderResult } from "./provider.js";

type Fetcher = typeof fetch;

export interface RemoteProviderOptions {
  endpoint: string;
  token?: string | undefined;
  timeoutMs?: number | undefined;
  fetcher?: Fetcher | undefined;
}

function endpointUrl(value: string) {
  const url = new URL(value);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error("Remote provider URL must use HTTPS (HTTP is allowed only for localhost)");
  }
  if (url.username || url.password) throw new Error("Remote provider URL must not contain credentials");
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

function resultFrom(value: unknown, provider: string): ProviderResult {
  if (!value || typeof value !== "object") throw new Error("Remote provider returned an invalid response");
  const data = value as Record<string, unknown>;
  if (typeof data.imageUrl !== "string" || !/^(https?:\/\/|data:image\/)/i.test(data.imageUrl)) {
    throw new Error("Remote provider response did not include a valid image URL");
  }
  if (
    data.productSimilarity !== undefined &&
    (typeof data.productSimilarity !== "number" || data.productSimilarity < 0 || data.productSimilarity > 1)
  ) {
    throw new Error("Remote provider returned an invalid similarity score");
  }
  const result: ProviderResult = {
    imageUrl: data.imageUrl,
    provider: typeof data.provider === "string" ? data.provider : provider,
    isMock: false,
  };
  return typeof data.productSimilarity === "number" ? { ...result, productSimilarity: data.productSimilarity } : result;
}

export class RemoteHttpInferenceProvider implements InferenceProvider {
  readonly name = "remote-http";
  readonly #endpoint: URL;
  readonly #token: string | undefined;
  readonly #timeoutMs: number;
  readonly #fetcher: Fetcher;

  constructor(options: RemoteProviderOptions) {
    this.#endpoint = endpointUrl(options.endpoint);
    this.#token = options.token;
    this.#timeoutMs = options.timeoutMs ?? 120_000;
    this.#fetcher = options.fetcher ?? fetch;
  }

  async health() {
    try {
      const response = await this.#request("/health", { method: "GET" }, Math.min(this.#timeoutMs, 8_000));
      return {
        ready: response.ok,
        detail: response.ok ? "Remote GPU worker is reachable" : `Remote worker returned HTTP ${response.status}`,
      };
    } catch (error) {
      return { ready: false, detail: error instanceof Error ? error.message : "Remote worker is unavailable" };
    }
  }

  async generate(request: CreateTryOnJob): Promise<ProviderResult> {
    const response = await this.#request("/v1/try-on", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`Remote inference failed with HTTP ${response.status}`);
    return resultFrom(await response.json(), this.name);
  }

  async #request(path: string, init: RequestInit, timeoutMs = this.#timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(init.headers);
    if (this.#token) headers.set("authorization", `Bearer ${this.#token}`);
    try {
      return await this.#fetcher(new URL(this.#endpoint.pathname + path, this.#endpoint), {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Remote inference timed out after ${timeoutMs} ms`);
      }
      throw new Error(error instanceof Error ? `Remote provider unavailable: ${error.message}` : "Remote provider unavailable");
    } finally {
      clearTimeout(timer);
    }
  }
}
