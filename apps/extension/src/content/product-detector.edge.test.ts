// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectProducts } from "./product-detector.js";

describe("product listing edge cases", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("reads nested ItemList products and preserves destination links", () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", item: {
          "@type": "https://schema.org/Product",
          name: "Blue shirt",
          url: "/products/blue-shirt",
          image: "/images/blue-shirt.jpg",
        } },
        { "@type": "ListItem", item: {
          "@type": "Product",
          name: "Red dress",
          url: "/products/red-dress",
          image: "/images/red-dress.jpg",
        } },
      ],
    })}</script>`;

    const products = detectProducts(document, "https://shop.example/search");
    expect(products).toHaveLength(2);
    expect(products.map((product) => product.pageUrl)).toEqual(expect.arrayContaining([
      "https://shop.example/products/blue-shirt",
      "https://shop.example/products/red-dress",
    ]));
  });

  it("keeps separate listing products that reuse a placeholder image", () => {
    document.body.innerHTML = `
      <article><a href="/products/shirt"><img alt="Blue shirt" src="/placeholder.jpg"></a></article>
      <article><a href="/products/dress"><img alt="Red dress" src="/placeholder.jpg"></a></article>
    `;
    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 400, height: 520, top: 0, right: 400, bottom: 520,
      left: 0, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    const products = detectProducts(document, "https://shop.example/search");
    expect(products).toHaveLength(2);
    expect(products.map((product) => product.pageUrl)).toEqual(expect.arrayContaining([
      "https://shop.example/products/shirt",
      "https://shop.example/products/dress",
    ]));
  });

  it("does not crash on malformed encoded image paths", () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "Blue shirt",
      image: "https://cdn.example/shirt%GG.jpg",
    })}</script>`;
    expect(() => detectProducts(document, "https://shop.example/shirt")).not.toThrow();
  });
  it("ignores article social images and does not mistake laptop for a top", () => {
    document.head.innerHTML = `
      <meta property="og:type" content="article">
      <meta property="og:title" content="Best dress trends this year">
      <meta property="og:image" content="/article.jpg">
    `;
    document.body.innerHTML = '<article><img alt="Dress trends article photograph" src="/article.jpg"></article>';
    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 500, height: 600, top: 0, right: 500, bottom: 600,
      left: 0, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    expect(detectProducts(document, "https://shop.example/blog/dress-trends")).toHaveLength(0);

    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product", name: "Laptop computer", image: "/laptop.jpg",
    })}</script>`;
    document.body.innerHTML = "";
    const products = detectProducts(document, "https://shop.example/laptop");
    expect(products).toHaveLength(1);
    expect(products[0]?.categoryHint).toBeUndefined();
  });

  it("groups gallery thumbnails and ignores image zoom links as product pages", () => {
    document.body.innerHTML = `
      <h1>Blue cotton shirt</h1>
      <div class="product-gallery">
        <ul>
          <li><a href="/images/blue-front-large.jpg"><img alt="front" src="/images/blue-front-small.jpg"></a></li>
          <li><a href="/images/blue-back-large.jpg"><img alt="back" src="/images/blue-back-small.jpg"></a></li>
        </ul>
      </div>
    `;
    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 100, height: 120, top: 0, right: 100, bottom: 120,
      left: 0, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    const products = detectProducts(document, "https://shop.example/products/blue-shirt");
    expect(products).toHaveLength(1);
    expect(products[0]?.title).toBe("Blue cotton shirt");
    expect(products[0]?.pageUrl).toBe("https://shop.example/products/blue-shirt");
    expect(products[0]?.imageUrls).toEqual(expect.arrayContaining([
      "https://shop.example/images/blue-front-small.jpg",
      "https://shop.example/images/blue-back-small.jpg",
    ]));
  });

  it("detects compact product cards without merging distinct links", () => {
    document.body.innerHTML = `
      <div class="product-card"><a href="/shirts/blue"><img alt="Blue shirt" src="/blue.jpg"></a></div>
      <div class="product-card"><a href="/shirts/red"><img alt="Red shirt" src="/red.jpg"></a></div>
    `;
    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 120, height: 160, top: 0, right: 120, bottom: 160,
      left: 0, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const products = detectProducts(document, "https://shop.example/search");
    expect(products).toHaveLength(2);
  });

});
