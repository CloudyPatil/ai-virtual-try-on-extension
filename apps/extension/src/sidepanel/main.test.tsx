// @vitest-environment jsdom
import type { DetectedProduct, DigitalProfile, TryOnJob } from "@tryon/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTryOnJob } from "./api.js";
import { App } from "./main.js";
import { emptyProfile } from "./profile.js";
import { loadProfile } from "./profile-store.js";

vi.mock("./api.js", () => ({ createTryOnJob: vi.fn(), getTryOnJob: vi.fn() }));
vi.mock("./profile-store.js", () => ({
  loadProfile: vi.fn(),
  saveProfile: vi.fn(),
  deleteProfile: vi.fn(),
}));

const now = new Date().toISOString();
const profile: DigitalProfile = {
  ...emptyProfile(),
  assets: {
    upper_body: {
      kind: "upper_body",
      dataUrl: "data:image/webp;base64,AAAA",
      fileName: "person.webp",
      width: 900,
      height: 1200,
      updatedAt: now,
    },
  },
};
const products: DetectedProduct[] = [
  {
    id: "first",
    imageUrl: "https://shop.example/blue-shirt.jpg",
    imageUrls: ["https://shop.example/blue-shirt.jpg", "https://shop.example/red-shirt.jpg"],
    title: "First shirt",
    pageUrl: "https://shop.example/first",
    categoryHint: "upper_body",
    score: 90,
    source: "dom",
  },
  {
    id: "second",
    imageUrl: "https://shop.example/second-shirt.jpg",
    title: "Second shirt",
    pageUrl: "https://shop.example/second",
    categoryHint: "upper_body",
    score: 85,
    source: "dom",
  },
];
const completedJob: TryOnJob = {
  id: "aa4b7827-b542-49db-86e4-f9ca0ed63102",
  status: "completed",
  progress: 100,
  message: "Completed",
  createdAt: now,
  updatedAt: now,
  result: { imageUrl: "data:image/png;base64,AAAA", provider: "mock", isMock: true },
};

let container: HTMLElement;
let root: Root;

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((element) => element.textContent?.trim() === label);
  if (!found) throw new Error("Button not found: " + label);
  return found;
}

function preview(): HTMLImageElement {
  const image = container.querySelector<HTMLImageElement>('img[alt="Selected garment preview"]');
  if (!image) throw new Error("Selected image preview not found");
  return image;
}

async function scan() {
  await act(async () => { button("Scan page").click(); });
}

describe("side-panel selected image", () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(loadProfile).mockResolvedValue(profile);
    vi.mocked(createTryOnJob).mockResolvedValue(completedJob);
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 1 }]),
        sendMessage: vi.fn().mockResolvedValue({ type: "TRYON_PRODUCTS_DETECTED", products }),
      },
    });
    document.body.innerHTML = '<div id="test-root"></div>';
    container = document.getElementById("test-root")!;
    root = createRoot(container);
    await act(async () => { root.render(<App />); });
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires a loaded image, submits the exact variant, and blocks a failed replacement", async () => {
    await scan();
    expect(button("Generate virtual try-on").disabled).toBe(true);
    await act(async () => { preview().dispatchEvent(new Event("load")); });
    expect(button("Generate virtual try-on").disabled).toBe(false);

    await act(async () => { button("Generate virtual try-on").click(); });
    expect(createTryOnJob).toHaveBeenCalledWith(expect.objectContaining({
      product: expect.objectContaining({ imageUrl: "https://shop.example/blue-shirt.jpg" }),
    }));
    expect(container.textContent).toContain("Your preview");

    const variant = container.querySelector<HTMLButtonElement>('button[aria-label="Select product image 2"]')!;
    await act(async () => { variant.click(); });
    expect(preview().src).toBe("https://shop.example/red-shirt.jpg");
    expect(container.textContent).not.toContain("Your preview");
    expect(button("Generate virtual try-on").disabled).toBe(true);

    await act(async () => { preview().dispatchEvent(new Event("error")); });
    expect(container.textContent).toContain("Image could not be loaded");
    expect(button("Generate virtual try-on").disabled).toBe(true);
  });

  it("ignores a completed API response after the shopper changes products", async () => {
    let resolveJob!: (job: TryOnJob) => void;
    vi.mocked(createTryOnJob).mockReturnValueOnce(new Promise((resolve) => { resolveJob = resolve; }));
    await scan();
    await act(async () => { preview().dispatchEvent(new Event("load")); });
    await act(async () => { button("Generate virtual try-on").click(); });
    const second = [...container.querySelectorAll<HTMLButtonElement>(".product-card")]
      .find((element) => element.textContent?.includes("Second shirt"))!;
    await act(async () => { second.click(); });
    expect(button("Generate virtual try-on").disabled).toBe(true);
    await act(async () => { resolveJob(completedJob); });
    expect(container.textContent).not.toContain("Your preview");
  });

  it("rejects non-HTTPS manual URLs and submits the exact accepted image", async () => {
    await scan();
    const input = container.querySelector<HTMLInputElement>("#manual-image-url")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("Native input setter is unavailable");
    async function enter(value: string) {
      await act(async () => {
        setValue!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    await enter("http://shop.example/not-secure.jpg");
    await act(async () => { button("Use URL").click(); });
    expect(container.textContent).toContain("Enter a valid HTTPS image URL");
    expect(preview().src).toBe("https://shop.example/blue-shirt.jpg");

    await enter("https://shop.example/manual-choice.jpg");
    await act(async () => { button("Use URL").click(); });
    expect(preview().src).toBe("https://shop.example/manual-choice.jpg");
    expect(button("Generate virtual try-on").disabled).toBe(true);
    await act(async () => { preview().dispatchEvent(new Event("load")); });
    await act(async () => { button("Generate virtual try-on").click(); });
    expect(createTryOnJob).toHaveBeenCalledWith(expect.objectContaining({
      product: expect.objectContaining({ imageUrl: "https://shop.example/manual-choice.jpg" }),
    }));
  });
});
