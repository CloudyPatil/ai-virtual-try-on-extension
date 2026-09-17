import type { DetectedProduct, ProductCategory, TryOnJob } from "@tryon/contracts";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createTryOnJob, getTryOnJob } from "./api.js";
import "./styles.css";

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the photograph"));
    reader.readAsDataURL(file);
  });
}

function App() {
  const [products, setProducts] = useState<DetectedProduct[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [personImage, setPersonImage] = useState<string>();
  const [category, setCategory] = useState<ProductCategory>("upper_body");
  const [job, setJob] = useState<TryOnJob>();
  const [message, setMessage] = useState("Open a shopping page, then scan it for products.");
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId),
    [products, selectedId],
  );

  useEffect(() => {
    if (!selectedProduct?.categoryHint) return;
    if (["upper_body", "lower_body", "dress"].includes(selectedProduct.categoryHint)) {
      setCategory(selectedProduct.categoryHint);
    }
  }, [selectedProduct]);

  useEffect(() => {
    if (!job || terminalStatuses.has(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await getTryOnJob(job.id);
        setJob(next);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to check generation status");
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  async function detect() {
    setMessage("Inspecting the current page…");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setMessage("No active webpage is available.");
      return;
    }
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "TRYON_DETECT_PRODUCTS" });
      const nextProducts = response?.type === "TRYON_PRODUCTS_DETECTED" ? response.products : [];
      setProducts(nextProducts);
      setSelectedId(nextProducts[0]?.id);
      setMessage(
        nextProducts.length
          ? `${nextProducts.length} product candidate${nextProducts.length === 1 ? "" : "s"} found.`
          : "No confident products were found on this page.",
      );
    } catch {
      setMessage("Reload the shopping page once after installing the extension, then scan again.");
    }
  }

  async function selectPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setMessage("Choose a JPEG, PNG or WebP photograph.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("The photograph must be smaller than 10 MB.");
      return;
    }
    setPersonImage(await readFileAsDataUrl(file));
    setMessage("Profile photograph ready. It is uploaded only when you start generation.");
  }

  async function generate() {
    if (!personImage || !selectedProduct) return;
    setMessage("Submitting try-on request…");
    try {
      const nextJob = await createTryOnJob({
        personImageDataUrl: personImage,
        product: selectedProduct,
        category,
        preserveBackground: true,
      });
      setJob(nextJob);
      setMessage("Request accepted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit the request");
    }
  }

  return (
    <main>
      <header>
        <span className="eyebrow">AI shopping assistant</span>
        <h1>TryOn Studio</h1>
        <p>Select a product from the page and preview it on your profile.</p>
      </header>

      <section className="status" aria-live="polite">{message}</section>

      <section>
        <div className="section-heading">
          <div><span>Step 1</span><h2>Choose a product</h2></div>
          <button className="secondary" onClick={detect}>Scan page</button>
        </div>
        <div className="product-grid">
          {products.map((product) => (
            <button
              className={`product-card ${selectedId === product.id ? "selected" : ""}`}
              key={product.id}
              onClick={() => setSelectedId(product.id)}
            >
              <img src={product.imageUrl} alt="" />
              <strong>{product.title}</strong>
              <small>{product.price ?? `${product.source} · confidence ${product.score}`}</small>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="section-heading"><div><span>Step 2</span><h2>Add your profile photo</h2></div></div>
        <label className="upload">
          {personImage ? <img src={personImage} alt="Selected profile" /> : <span>Front-facing upper- or full-body photograph</span>}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectPhoto(event.target.files?.[0])} />
        </label>
      </section>

      <section>
        <div className="section-heading"><div><span>Step 3</span><h2>Generate preview</h2></div></div>
        <label className="field">
          Garment category
          <select value={category} onChange={(event) => setCategory(event.target.value as ProductCategory)}>
            <option value="upper_body">Top, shirt or jacket</option>
            <option value="dress">Dress</option>
            <option value="lower_body">Pants or trousers</option>
          </select>
        </label>
        <button className="primary" disabled={!personImage || !selectedProduct || Boolean(job && !terminalStatuses.has(job.status))} onClick={generate}>
          Generate virtual try-on
        </button>
        {job && (
          <div className="job">
            <div><strong>{job.message}</strong><span>{job.progress}%</span></div>
            <progress value={job.progress} max="100" />
          </div>
        )}
      </section>

      {job?.result && (
        <section className="result">
          <div className="section-heading"><div><span>Result</span><h2>Your preview</h2></div></div>
          <img src={job.result.imageUrl} alt="Virtual try-on result" />
          {job.result.isMock && <p className="warning">Development preview: the AI provider has not been connected yet.</p>}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

