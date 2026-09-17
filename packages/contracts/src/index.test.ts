import { describe, expect, it } from "vitest";
import { createTryOnJobSchema } from "./index.js";

describe("createTryOnJobSchema", () => {
  it("accepts a supported image and product", () => {
    const result = createTryOnJobSchema.safeParse({
      personImageDataUrl: "data:image/png;base64,AAAA",
      category: "upper_body",
      preserveBackground: true,
      product: {
        id: "p1",
        title: "Blue shirt",
        imageUrl: "https://shop.example/shirt.jpg",
        pageUrl: "https://shop.example/product/1",
        score: 90,
        source: "dom",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects executable data", () => {
    const result = createTryOnJobSchema.safeParse({
      personImageDataUrl: "data:text/html;base64,AAAA",
      category: "upper_body",
      product: {},
    });

    expect(result.success).toBe(false);
  });
});

