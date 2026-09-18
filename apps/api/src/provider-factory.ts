import { MockInferenceProvider, type InferenceProvider } from "./provider.js";
import { RemoteHttpInferenceProvider } from "./remote-provider.js";

type ProviderEnvironment = Partial<Record<
  "TRYON_PROVIDER" | "TRYON_PROVIDER_URL" | "TRYON_PROVIDER_TOKEN" | "TRYON_PROVIDER_TIMEOUT_MS",
  string
>>;

export function createInferenceProvider(environment: ProviderEnvironment = process.env): InferenceProvider {
  const provider = environment.TRYON_PROVIDER?.trim().toLowerCase() || "mock";
  if (provider === "mock") return new MockInferenceProvider();
  if (provider !== "remote") throw new Error(`Unsupported TRYON_PROVIDER "${provider}"`);
  if (!environment.TRYON_PROVIDER_URL) throw new Error("TRYON_PROVIDER_URL is required for the remote provider");

  const timeoutMs = environment.TRYON_PROVIDER_TIMEOUT_MS
    ? Number.parseInt(environment.TRYON_PROVIDER_TIMEOUT_MS, 10)
    : undefined;
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 1_000)) {
    throw new Error("TRYON_PROVIDER_TIMEOUT_MS must be at least 1000");
  }

  return new RemoteHttpInferenceProvider({
    endpoint: environment.TRYON_PROVIDER_URL,
    token: environment.TRYON_PROVIDER_TOKEN,
    timeoutMs,
  });
}
