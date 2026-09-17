import type { DetectedProduct, ProductCategory } from "@tryon/contracts";

type JsonObject = Record<string, unknown>;

function stableId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return `product-${Math.abs(hash).toString(36)}`;
}

function absoluteUrl(value: string | undefined, baseUrl: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function inferCategory(text: string): ProductCategory | undefined {
  const value = text.toLowerCase();
  if (/dress|gown/.test(value)) return "dress";
  if (/pant|trouser|jean|skirt|shorts/.test(value)) return "lower_body";
  if (/shirt|t-shirt|tee|top|jacket|hoodie|sweater|blazer/.test(value)) return "upper_body";
  if (/shoe|sneaker|boot|sandal|heel/.test(value)) return "footwear";
  if (/necklace|earring|bracelet|jewel/.test(value)) return "jewellery";
  if (/bag|hat|watch|belt|scarf/.test(value)) return "accessory";
  return undefined;
}

function readJsonLd(document: Document, pageUrl: string): DetectedProduct[] {
  const products: DetectedProduct[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as JsonObject;
    if (Array.isArray(object["@graph"])) visit(object["@graph"]);
    const rawType = object["@type"];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    if (!types.some((type) => String(type).toLowerCase() === "product")) return;

    const rawImages = Array.isArray(object.image) ? object.image : [object.image];
    const imageUrl = rawImages
      .map((image) => (typeof image === "string" ? image : undefined))
      .map((image) => absoluteUrl(image, pageUrl))
      .find(Boolean);
    if (!imageUrl) return;

    const title = String(object.name ?? document.title ?? "Detected product").trim();
    const offers = object.offers && typeof object.offers === "object" ? (object.offers as JsonObject) : {};
    const price = offers.price ? `${String(offers.priceCurrency ?? "")} ${String(offers.price)}`.trim() : undefined;
    products.push({
      id: stableId(`${pageUrl}:${imageUrl}`),
      title,
      imageUrl,
      pageUrl,
      ...(price ? { price } : {}),
      ...(inferCategory(`${title} ${String(object.category ?? "")}`)
        ? { categoryHint: inferCategory(`${title} ${String(object.category ?? "")}`) }
        : {}),
      score: 100,
      source: "jsonld",
    });
  };

  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      visit(JSON.parse(script.textContent ?? ""));
    } catch {
      // Invalid third-party structured data is ignored.
    }
  });
  return products;
}

function readMetadata(document: Document, pageUrl: string): DetectedProduct[] {
  const imageValue =
    document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ??
    document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.content;
  const imageUrl = absoluteUrl(imageValue, pageUrl);
  if (!imageUrl) return [];
  const title =
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim() ||
    document.title ||
    "Page product";
  return [
    {
      id: stableId(`${pageUrl}:${imageUrl}`),
      title,
      imageUrl,
      pageUrl,
      ...(inferCategory(title) ? { categoryHint: inferCategory(title) } : {}),
      score: 82,
      source: "metadata",
    },
  ];
}

function readDomImages(document: Document, pageUrl: string): DetectedProduct[] {
  return [...document.images]
    .filter((image) => {
      const rectangle = image.getBoundingClientRect();
      return rectangle.width >= 140 && rectangle.height >= 140 && rectangle.bottom >= 0;
    })
    .flatMap((image): DetectedProduct[] => {
      const imageUrl = absoluteUrl(image.currentSrc || image.src, pageUrl);
      if (!imageUrl) return [];
      const rectangle = image.getBoundingClientRect();
      const nearby = image.closest("article, li, [class*='product'], [data-product]");
      const nearbyText = nearby?.textContent?.replace(/\s+/g, " ").trim().slice(0, 180) ?? "";
      const title = image.alt.trim() || nearbyText || document.title || "Visible product";
      const areaScore = Math.min(30, Math.round((rectangle.width * rectangle.height) / 18_000));
      const contextScore = nearby ? 18 : 0;
      const altScore = image.alt.trim() ? 12 : 0;
      const product: DetectedProduct = {
        id: stableId(`${pageUrl}:${imageUrl}`),
        title,
        imageUrl,
        pageUrl,
        ...(inferCategory(`${title} ${nearbyText}`)
          ? { categoryHint: inferCategory(`${title} ${nearbyText}`) }
          : {}),
        score: Math.min(80, 25 + areaScore + contextScore + altScore),
        source: "dom" as const,
      };
      return [product];
    });
}

export function detectProducts(document: Document, pageUrl = document.location.href) {
  const candidates = [
    ...readJsonLd(document, pageUrl),
    ...readMetadata(document, pageUrl),
    ...readDomImages(document, pageUrl),
  ];
  const byImage = new Map<string, DetectedProduct>();
  for (const product of candidates) {
    const previous = byImage.get(product.imageUrl);
    if (!previous || product.score > previous.score) byImage.set(product.imageUrl, product);
  }
  return [...byImage.values()].sort((left, right) => right.score - left.score).slice(0, 24);
}
