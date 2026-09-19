// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectProducts } from "./product-detector.js";

describe("detectProducts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
  it("groups JSON-LD image objects into one product gallery", () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "Tailored blazer",
      image: [
        { contentUrl: "https://cdn.example/blazer-front.jpg" },
        { url: "https://cdn.example/blazer-back.jpg" },
      ],
    })}</script>`;
    document.body.innerHTML = "";

    const [product] = detectProducts(document, "https://shop.example/blazer");
    expect(product?.imageUrls).toEqual([
      "https://cdn.example/blazer-front.jpg",
      "https://cdn.example/blazer-back.jpg",
    ]);
    expect(product?.categoryHint).toBe("upper_body");
  });

  it("groups lazy and responsive images by listing product link", () => {
    document.head.innerHTML = "";
    document.body.innerHTML = `
      <article>
        <a href="/products/blue-shirt">
          <img alt="Blue shirt" src="/images/blue-small.jpg"
               data-src="/images/blue-front.jpg"
               srcset="/images/blue-medium.jpg 400w, /images/blue-large.jpg 900w">
          <img alt="Blue shirt" src="/images/blue-back.jpg">
        </a>
      </article>
      <article>
        <a href="/products/red-dress"><img alt="Red dress" src="/images/red-dress.jpg"></a>
      </article>
      <img class="brand-logo" alt="Store logo" src="/images/logo.jpg">
    `;
    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 420,
      height: 560,
      top: 0,
      right: 420,
      bottom: 560,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const products = detectProducts(document, "https://shop.example/search");
    expect(products).toHaveLength(2);
    const shirt = products.find((product) => product.pageUrl.endsWith("/products/blue-shirt"));
    expect(shirt?.imageUrls).toEqual(expect.arrayContaining([
      "https://shop.example/images/blue-front.jpg",
      "https://shop.example/images/blue-large.jpg",
      "https://shop.example/images/blue-back.jpg",
    ]));
    expect(products.some((product) => product.imageUrl.endsWith("/logo.jpg"))).toBe(false);
  });

});
