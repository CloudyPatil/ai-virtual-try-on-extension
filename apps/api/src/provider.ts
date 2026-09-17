import type { CreateTryOnJob } from "@tryon/contracts";

export interface ProviderResult {
  imageUrl: string;
  provider: string;
  isMock: boolean;
  productSimilarity?: number;
}

export interface InferenceProvider {
  readonly name: string;
  health(): Promise<{ ready: boolean; detail: string }>;
  generate(request: CreateTryOnJob): Promise<ProviderResult>;
}

export class MockInferenceProvider implements InferenceProvider {
  readonly name = "mock";

  async health() {
    return { ready: true, detail: "Deterministic development provider" };
  }

  async generate(request: CreateTryOnJob): Promise<ProviderResult> {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return {
      imageUrl: request.product.imageUrl,
      provider: this.name,
      isMock: true,
    };
  }
}

