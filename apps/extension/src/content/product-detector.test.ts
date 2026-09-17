// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { detectProducts } from "./product-detector.js";

describe("detectProducts", () => {
  it("extracts a Product from JSON-LD", () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Ocean blue shirt",
      image: "https://shop.example/shirt.jpg",
      offers: { price: "1499", priceCurrency: "INR" },
    })}</script>`;
    document.body.innerHTML = "";

    const products = detectProducts(document, "https://shop.example/products/shirt");
    expect(products[0]?.title).toBe("Ocean blue shirt");
    expect(products[0]?.categoryHint).toBe("upper_body");
    expect(products[0]?.source).toBe("jsonld");
  });

  it("deduplicates metadata and structured data images", () => {
    document.head.innerHTML = `
      <meta property="og:image" content="https://shop.example/dress.jpg">
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "Summer dress",
        image: "https://shop.example/dress.jpg",
      })}</script>
    `;
    document.body.innerHTML = "";
    const products = detectProducts(document, "https://shop.example/dress");
    expect(products).toHaveLength(1);
    expect(products[0]?.source).toBe("jsonld");
  });
});

