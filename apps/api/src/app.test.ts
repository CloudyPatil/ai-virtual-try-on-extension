import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const validRequest = {
  personImageDataUrl: "data:image/png;base64,AAAA",
  category: "upper_body",
  preserveBackground: true,
  product: {
    id: "product-1",
    title: "Blue shirt",
    imageUrl: "https://shop.example/blue-shirt.jpg",
    pageUrl: "https://shop.example/blue-shirt",
    score: 95,
    source: "dom",
  },
};

describe("try-on API", () => {
  it("reports service health", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("creates an asynchronous job", async () => {
    const response = await request(createApp()).post("/api/v1/try-on").send(validRequest);
    expect(response.status).toBe(202);
    expect(response.body.status).toBe("queued");
    expect(response.body.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("rejects invalid image data", async () => {
    const response = await request(createApp())
      .post("/api/v1/try-on")
      .send({ ...validRequest, personImageDataUrl: "not-an-image" });
    expect(response.status).toBe(400);
  });
});

