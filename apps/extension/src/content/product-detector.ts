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
function uniqueUrls(values: Array<string | undefined>, baseUrl: string) {
  const urls = values.map((value) => absoluteUrl(value, baseUrl)).filter((value): value is string => Boolean(value));
  return [...new Set(urls)].slice(0, 16);
}

function structuredImageUrls(value: unknown, baseUrl: string): string[] {
  const values = Array.isArray(value) ? value : [value];
  return uniqueUrls(
    values.flatMap((image): Array<string | undefined> => {
      if (typeof image === "string") return [image];
      if (!image || typeof image !== "object") return [];
      const object = image as JsonObject;
      return [object.url, object.contentUrl, object.thumbnailUrl].map((entry) =>
        typeof entry === "string" ? entry : undefined,
      );
    }),
    baseUrl,
  );
}

function srcsetUrls(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((candidate) => {
      const [url, descriptor] = candidate.trim().split(/\s+/);
      const size = descriptor ? Number.parseFloat(descriptor) : 0;
      return { url, size: Number.isFinite(size) ? size : 0 };
    })
    .filter((candidate): candidate is { url: string; size: number } => Boolean(candidate.url))
    .sort((left, right) => right.size - left.size)
    .slice(0, 3)
    .map((candidate) => candidate.url);
}

function imageElementUrls(image: HTMLImageElement, baseUrl: string) {
  const pictureSources = [...(image.closest("picture")?.querySelectorAll<HTMLSourceElement>("source") ?? [])];
  return uniqueUrls(
    [
      image.getAttribute("data-original") ?? undefined,
      ...srcsetUrls(image.getAttribute("srcset")),
      ...pictureSources.flatMap((source) => srcsetUrls(source.srcset)),
      image.getAttribute("data-src") ?? undefined,
      image.getAttribute("data-lazy-src") ?? undefined,
      image.currentSrc,
      image.getAttribute("src") ?? undefined,
    ],
    baseUrl,
  );
}

function normalizedImageKey(value: string) {
  const url = new URL(value);
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // A malformed third-party URL must not interrupt page scanning.
  }
  path = path.replace(/[-_]\d{2,4}x\d{2,4}(?=\.)/i, "");
  for (const key of ["w", "width", "h", "height", "q", "quality", "format", "fit"]) {
    url.searchParams.delete(key);
  }
  return `${url.hostname.toLowerCase()}${path}${url.search}`;
}

function inferCategory(text: string): ProductCategory | undefined {
  const value = text.toLowerCase();
  if (/\b(dress|dresses|gown|gowns|jumpsuit|jumpsuits)\b/.test(value)) return "dress";
  if (/\b(pants?|trousers?|jeans?|skirts?|shorts?|leggings?|salwar)\b/.test(value)) return "lower_body";
  if (/\b(t-?shirts?|shirts?|tees?|tops?|jackets?|hoodies?|sweaters?|blazers?|blouses?|kurtas?|kurtis?)\b/.test(value)) return "upper_body";
  if (/\b(shoes?|sneakers?|boots?|sandals?|heels?)\b/.test(value)) return "footwear";
  if (/\b(necklaces?|earrings?|bracelets?|jewell?ery)\b/.test(value)) return "jewellery";
  if (/\b(bags?|hats?|watches?|belts?|scarves?)\b/.test(value)) return "accessory";
  return undefined;
}

function readJsonLd(document: Document, pageUrl: string): DetectedProduct[] {
  const products: DetectedProduct[] = [];
  let visitedNodes = 0;
  const visit = (value: unknown) => {
    if (visitedNodes++ >= 1000) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as JsonObject;
    for (const key of ["@graph", "mainEntity", "itemListElement", "item", "hasVariant"]) {
      if (object[key]) visit(object[key]);
    }
    const rawType = object["@type"];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    if (!types.some((type) => /(?:^|\/)product$/i.test(String(type)))) return;

    const imageUrls = structuredImageUrls(object.image, pageUrl);
    const imageUrl = imageUrls[0];
    if (!imageUrl) return;

    const title = String(object.name ?? document.title ?? "Detected product").trim();
    const offers = object.offers && typeof object.offers === "object" ? (object.offers as JsonObject) : {};
    const price = offers.price ? `${String(offers.priceCurrency ?? "")} ${String(offers.price)}`.trim() : undefined;
    const productPageUrl = absoluteUrl(typeof object.url === "string" ? object.url : undefined, pageUrl) ?? pageUrl;
    const categoryHint = inferCategory(`${title} ${String(object.category ?? "")}`);
    products.push({
      id: stableId(`${productPageUrl}:${imageUrl}`),
      title,
      imageUrl,
      imageUrls,
      pageUrl: productPageUrl,
      ...(price ? { price } : {}),
      ...(categoryHint ? { categoryHint } : {}),
      score: categoryHint && ["upper_body", "lower_body", "dress"].includes(categoryHint) ? 100 : 55,
      source: "jsonld",
    });
  };

  [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 30).forEach((script) => {
    try {
      const content = script.textContent ?? "";
      if (content.length <= 1_000_000) visit(JSON.parse(content));
    } catch {
      // Invalid third-party structured data is ignored.
    }
  });
  return products;
}

function readMetadata(document: Document, pageUrl: string): DetectedProduct[] {
  const imageUrls = uniqueUrls(
    [...document.querySelectorAll<HTMLMetaElement>('meta[property="og:image"], meta[name="twitter:image"]')].map(
      (element) => element.content,
    ),
    pageUrl,
  );
  const imageUrl = imageUrls[0];
  if (!imageUrl) return [];
  const title =
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim() ||
    document.title ||
    "Page product";
  const ogType = document.querySelector<HTMLMetaElement>('meta[property="og:type"]')?.content?.toLowerCase();
  if (ogType && ogType !== "product") return [];
  const categoryHint = inferCategory(title);
  if (!categoryHint && ogType !== "product") return [];
  return [
    {
      id: stableId(`${pageUrl}:${imageUrl}`),
      title,
      imageUrl,
      imageUrls,
      pageUrl,
      ...(categoryHint ? { categoryHint } : {}),
      score: categoryHint && ["upper_body", "lower_body", "dress"].includes(categoryHint) ? 82 : 55,
      source: "metadata",
    },
  ];
}

function readDomImages(document: Document, pageUrl: string): DetectedProduct[] {
  if (document.querySelector<HTMLMetaElement>('meta[property="og:type"]')?.content?.toLowerCase() === "article") return [];
  return [...document.images].slice(0, 600)
    .filter((image) => {
      const rectangle = image.getBoundingClientRect();
      const description = `${image.alt} ${image.className} ${image.id}`.toLowerCase();
      const aspectRatio = rectangle.height ? rectangle.width / rectangle.height : 1;
      const inProductContext = Boolean(image.closest("article, [data-product], [class*='product'], [class*='gallery'], [data-gallery]"));
      const minSize = inProductContext ? 80 : 140;
      return rectangle.width >= minSize && rectangle.height >= minSize && rectangle.bottom >= 0 &&
        aspectRatio > 0.28 && aspectRatio < 3.5 &&
        !/logo|icon|sprite|avatar|badge/.test(description);
    })
    .flatMap((image): DetectedProduct[] => {
      const imageUrls = imageElementUrls(image, pageUrl);
      const imageUrl = imageUrls[0];
      if (!imageUrl) return [];
      const rectangle = image.getBoundingClientRect();
      const gallery = image.closest("[class*='gallery'], [data-gallery]");
      const productContainer = image.closest("article, [class*='product'], [data-product]");
      const nearby = gallery ?? productContainer ?? image.closest("li");
      const link = image.closest<HTMLAnchorElement>("a[href]");
      const linkTarget = absoluteUrl(link?.getAttribute("href") ?? undefined, pageUrl);
      const isZoomLink = Boolean(linkTarget && /\.(?:jpe?g|png|webp|avif)$/i.test(new URL(linkTarget).pathname));
      const productPageUrl = linkTarget && !isZoomLink ? linkTarget : pageUrl;
      const nearbyText = nearby?.textContent?.replace(/\s+/g, " ").trim().slice(0, 180) ?? "";
      const heading = productContainer?.querySelector("h2, h3, [itemprop='name']")?.textContent?.trim();
      const pageHeading = gallery ? document.querySelector("h1")?.textContent?.trim() : undefined;
      const title = heading || pageHeading || image.alt.trim() || nearbyText || document.title || "Visible product";
      const productKey = linkTarget && !isZoomLink
        ? productPageUrl
        : gallery ? pageUrl : `${pageUrl}:${title}`;
      const areaScore = Math.min(30, Math.round((rectangle.width * rectangle.height) / 18_000));
      const contextScore = nearby ? 18 : 0;
      const altScore = image.alt.trim() ? 12 : 0;
      const product: DetectedProduct = {
        id: stableId(productKey),
        title,
        imageUrl,
        imageUrls,
        pageUrl: productPageUrl,
        ...(inferCategory(`${title} ${nearbyText}`)
          ? { categoryHint: inferCategory(`${title} ${nearbyText}`) }
          : {}),
        score: Math.min(80, 25 + areaScore + contextScore + altScore),
        source: "dom" as const,
      };
      return [product];
    });
}

function mergeCandidates(candidates: DetectedProduct[]) {
  const merged: DetectedProduct[] = [];
  for (const candidate of candidates) {
    const candidateImages = candidate.imageUrls ?? [candidate.imageUrl];
    const candidateKeys = new Set(candidateImages.map(normalizedImageKey));
    const identity = `${candidate.pageUrl}:${candidate.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const index = merged.findIndex((product) => {
      const productImages = product.imageUrls ?? [product.imageUrl];
      const overlaps = productImages.some((image) => candidateKeys.has(normalizedImageKey(image)));
      const productIdentity = `${product.pageUrl}:${product.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
      const sameProductPage = product.pageUrl === candidate.pageUrl;
      return product.id === candidate.id || identity === productIdentity || (sameProductPage && overlaps);
    });
    if (index < 0) {
      merged.push({ ...candidate, imageUrls: candidateImages });
      continue;
    }
    const previous = merged[index]!;
    const best = candidate.score > previous.score ? candidate : previous;
    const imageUrls = [...new Set([...(previous.imageUrls ?? [previous.imageUrl]), ...candidateImages])].slice(0, 16);
    const categoryHint = best.categoryHint ?? previous.categoryHint ?? candidate.categoryHint;
    merged[index] = {
      ...best,
      imageUrl: imageUrls[0]!,
      imageUrls,
      ...(categoryHint ? { categoryHint } : {}),
    };
  }
  return merged;
}

export function detectProducts(document: Document, pageUrl = document.location.href) {
  const candidates = [
    ...readJsonLd(document, pageUrl),
    ...readMetadata(document, pageUrl),
    ...readDomImages(document, pageUrl),
  ];
  return mergeCandidates(candidates).sort((left, right) => right.score - left.score).slice(0, 24);
}
