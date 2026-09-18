import type { CreateTryOnJob } from "@tryon/contracts";
import { describe, expect, it, vi } from "vitest";
import { createInferenceProvider } from "./provider-factory.js";
import { RemoteHttpInferenceProvider } from "./remote-provider.js";

const sampleRequest: CreateTryOnJob = {
  personImageDataUrl: "data:image/png;base64,AAAA",
  category: "upper_body",
  preserveBackground: true,
  product: {
    id: "product-1",
    title: "Blue shirt",
    imageUrl: "https://shop.example/shirt.jpg",
    pageUrl: "https://shop.example/shirt",
    score: 92,
    source: "dom",
  },
};

describe("remote inference provider", () => {
  it("sends inference to the configured worker with server-side authorization", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
      return new Response(JSON.stringify({ imageUrl: "https://worker.example/result.webp", productSimilarity: 0.91 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const provider = new RemoteHttpInferenceProvider({
      endpoint: "https://worker.example",
      token: "secret",
      fetcher,
    });

    await expect(provider.generate(sampleRequest)).resolves.toMatchObject({
      imageUrl: "https://worker.example/result.webp",
      isMock: false,
      productSimilarity: 0.91,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects insecure non-local worker URLs", () => {
    expect(() => new RemoteHttpInferenceProvider({ endpoint: "http://worker.example" })).toThrow(/HTTPS/);
  });

  it("uses mock by default and validates remote configuration", () => {
    expect(createInferenceProvider({}).name).toBe("mock");
    expect(() => createInferenceProvider({ TRYON_PROVIDER: "remote" })).toThrow(/TRYON_PROVIDER_URL/);
  });
});
