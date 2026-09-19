import type { DetectedProduct, DigitalProfile, ProductCategory, ProfileAssetKind, TryOnJob } from "@tryon/contracts";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createTryOnJob, getTryOnJob } from "./api.js";
import { optimizeProfileImage } from "./image-utils.js";
import { emptyProfile, profileAssetDefinitions, profileCompletion, selectProfileAsset } from "./profile.js";
import { deleteProfile, loadProfile, saveProfile } from "./profile-store.js";
import "./styles.css";

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

function isClothingCategory(category: ProductCategory | undefined): category is "upper_body" | "lower_body" | "dress" {
  return category === "upper_body" || category === "lower_body" || category === "dress";
}

function App() {
  const [products, setProducts] = useState<DetectedProduct[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [profile, setProfile] = useState<DigitalProfile>(emptyProfile);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>();
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [profileReady, setProfileReady] = useState(false);
  const [category, setCategory] = useState<ProductCategory>("upper_body");
  const [categoryConfirmed, setCategoryConfirmed] = useState(false);
  const [job, setJob] = useState<TryOnJob>();
  const [submitting, setSubmitting] = useState(false);
  const [imageLoad, setImageLoad] = useState<{ url: string; status: "ready" | "failed" }>();
  const [imageRevision, setImageRevision] = useState(0);
  const requestEpoch = useRef(0);
  const [message, setMessage] = useState("Open a shopping page, then scan it for products.");
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId),
    [products, selectedId],
  );
  const unsupportedProduct = Boolean(selectedProduct?.categoryHint && !isClothingCategory(selectedProduct.categoryHint));
  const productImages = useMemo(
    () => selectedProduct
      ? [...new Set([selectedProduct.imageUrl, ...(selectedProduct.imageUrls ?? []), ...(selectedImageUrl ? [selectedImageUrl] : [])])]
      : [],
    [selectedProduct, selectedImageUrl],
  );
  const activeImageUrl = productImages.includes(selectedImageUrl ?? "")
    ? selectedImageUrl
    : selectedProduct?.imageUrl;
  const imageReady = Boolean(activeImageUrl && imageLoad?.url === activeImageUrl && imageLoad.status === "ready");
  const selectedProfileAsset = useMemo(() => selectProfileAsset(profile, category), [profile, category]);
  const completion = useMemo(() => profileCompletion(profile), [profile]);

  useEffect(() => {
    void loadProfile()
      .then(setProfile)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Unable to load your saved profile.");
      })
      .finally(() => setProfileReady(true));
  }, []);

  useEffect(() => {
    const hint = selectedProduct?.categoryHint;
    setCategoryConfirmed(isClothingCategory(hint));
    if (isClothingCategory(hint)) setCategory(hint);
  }, [selectedProduct]);

  useEffect(() => {
    if (!job || terminalStatuses.has(job.status)) return;
    const epoch = requestEpoch.current;
    const timer = window.setInterval(async () => {
      try {
        const next = await getTryOnJob(job.id);
        if (requestEpoch.current === epoch) setJob(next);
      } catch (error) {
        if (requestEpoch.current === epoch) setMessage(error instanceof Error ? error.message : "Unable to check generation status");
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  function resetResult(checkImage = false) {
    requestEpoch.current += 1;
    setJob(undefined);
    setSubmitting(false);
    if (checkImage) {
      setImageLoad(undefined);
      setImageRevision((revision) => revision + 1);
    }
  }

  function chooseImage(url: string | undefined) {
    setSelectedImageUrl(url);
    resetResult(true);
  }

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
      chooseImage(nextProducts[0]?.imageUrl);
      setManualImageUrl("");
      setCategoryConfirmed(isClothingCategory(nextProducts[0]?.categoryHint));
      setMessage(
        nextProducts.length
          ? `${nextProducts.length} product candidate${nextProducts.length === 1 ? "" : "s"} found.`
          : "No confident products were found on this page.",
      );
    } catch {
      setMessage("Reload the shopping page once after installing the extension, then scan again.");
    }
  }

  async function selectPhoto(kind: ProfileAssetKind, file: File | undefined) {
    if (!file) return;
    setMessage("Optimizing photograph for secure local storage...");
    try {
      const asset = await optimizeProfileImage(file, kind);
      const nextProfile: DigitalProfile = {
        ...profile,
        assets: { ...profile.assets, [kind]: asset },
        updatedAt: new Date().toISOString(),
      };
      await saveProfile(nextProfile);
      setProfile(nextProfile);
      resetResult();
      setMessage("Profile photograph saved locally in this browser.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the photograph.");
    }
  }

  async function clearProfile() {
    await deleteProfile();
    setProfile(emptyProfile());
    resetResult();
    setMessage("Local profile photographs deleted.");
  }

  function selectManualImage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const raw = manualImageUrl.trim();
      if (raw.length > 2048) throw new Error("Image URL is too long.");
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("Only HTTPS image URLs without credentials are allowed.");
      }
      chooseImage(url.href);
      setMessage("Manual product image selected. Check the preview before generating.");
    } catch {
      setMessage("Enter a valid HTTPS image URL without credentials.");
    }
  }

  async function generate() {
    if (!selectedProfileAsset || !selectedProduct || !activeImageUrl || !imageReady || unsupportedProduct || !categoryConfirmed || submitting) return;
    const epoch = ++requestEpoch.current;
    setSubmitting(true);
    setJob(undefined);
    setMessage("Submitting try-on request…");
    try {
      const nextJob = await createTryOnJob({
        personImageDataUrl: selectedProfileAsset.dataUrl,
        product: { ...selectedProduct, imageUrl: activeImageUrl },
        category,
        preserveBackground: true,
      });
      if (requestEpoch.current !== epoch) return;
      setJob(nextJob);
      setMessage("Request accepted.");
    } catch (error) {
      if (requestEpoch.current === epoch) setMessage(error instanceof Error ? error.message : "Unable to submit the request");
    } finally {
      if (requestEpoch.current === epoch) setSubmitting(false);
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
              onClick={() => {
                setSelectedId(product.id);
                chooseImage(product.imageUrl);
                setManualImageUrl("");
                setCategoryConfirmed(isClothingCategory(product.categoryHint));
              }}
            >
              <img src={product.imageUrl} alt="" />
              <strong>{product.title}</strong>
              <small>{product.price ?? `${product.source} · confidence ${product.score}`}</small>
            </button>
          ))}
        </div>
        {selectedProduct && (
          <div className="variant-picker">
            <div className="variant-heading">
              <strong>Choose the exact garment image</strong>
              <span>{productImages.length} choice{productImages.length === 1 ? "" : "s"}</span>
            </div>
            <p>Pick the colour and view to send to the try-on model.</p>
            <div className="variant-grid" role="group" aria-label="Product image variants">
              {productImages.map((imageUrl, index) => (
                <button
                  className={`variant-card ${activeImageUrl === imageUrl ? "selected" : ""}`}
                  key={imageUrl}
                  type="button"
                  aria-label={`Select product image ${index + 1}`}
                  aria-pressed={activeImageUrl === imageUrl}
                  onClick={() => chooseImage(imageUrl)}
                >
                  <img src={imageUrl} alt={`Product image ${index + 1}`} loading="lazy" />
                  <span>{activeImageUrl === imageUrl ? "Selected" : `Image ${index + 1}`}</span>
                </button>
              ))}
            </div>
            <div className={`selected-image-preview ${imageLoad?.url === activeImageUrl && imageLoad?.status === "failed" ? "failed" : ""}`}>
              {activeImageUrl && (
                <img
                  key={activeImageUrl + ":" + imageRevision}
                  src={activeImageUrl}
                  alt="Selected garment preview"
                  onLoad={() => setImageLoad({ url: activeImageUrl, status: "ready" })}
                  onError={() => setImageLoad({ url: activeImageUrl, status: "failed" })}
                />
              )}
              <span aria-live="polite">
                {imageReady
                  ? "Selected image loaded and ready for try-on."
                  : imageLoad?.url === activeImageUrl && imageLoad?.status === "failed"
                    ? "Image could not be loaded. Choose another image or paste a different HTTPS URL."
                    : "Checking selected image..."}
              </span>
            </div>
            <form className="manual-image-form" onSubmit={selectManualImage}>
              <label htmlFor="manual-image-url">Image missing? Paste its HTTPS URL</label>
              <div className="manual-image-controls">
                <input
                  id="manual-image-url"
                  type="url"
                  placeholder="https://example.com/garment.jpg"
                  value={manualImageUrl}
                  onChange={(event) => setManualImageUrl(event.target.value)}
                />
                <button className="secondary" type="submit" disabled={!manualImageUrl.trim()}>Use URL</button>
              </div>
            </form>
          </div>
        )}
      </section>

      <section>
        <div className="section-heading">
          <div><span>Step 2</span><h2>Build your reusable profile</h2></div>
          {completion.completed > 0 && <button className="text-button" onClick={() => void clearProfile()}>Delete all</button>}
        </div>
        <div className="profile-summary">
          <strong>{profileReady ? `${completion.completed} of ${completion.total} photos ready` : "Loading local profile..."}</strong>
          <span>Stored only in this browser until you generate a preview.</span>
        </div>
        <div className="profile-grid">
          {profileAssetDefinitions.map((definition) => {
            const asset = profile.assets[definition.kind];
            return (
              <label className={`profile-card ${asset ? "complete" : ""}`} key={definition.kind}>
                {asset ? <img src={asset.dataUrl} alt={`${definition.label} profile`} /> : <span className="profile-placeholder">+</span>}
                <span className="profile-copy">
                  <strong>{definition.label}</strong>
                  <small>{asset ? `${asset.width} x ${asset.height}` : definition.guidance}</small>
                </span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectPhoto(definition.kind, event.target.files?.[0])} />
              </label>
            );
          })}
        </div>
        {!selectedProfileAsset && <p className="inline-warning">Add a compatible profile photo for the selected garment category.</p>}
      </section>

      <section>
        <div className="section-heading"><div><span>Step 3</span><h2>Generate preview</h2></div></div>
        <label className="field">
          Garment category
          <select
            value={categoryConfirmed ? category : ""}
            onChange={(event) => {
              setCategory(event.target.value as ProductCategory);
              setCategoryConfirmed(true);
              resetResult();
            }}
          >
            <option value="" disabled>Choose a clothing category</option>
            <option value="upper_body">Top, shirt or jacket</option>
            <option value="dress">Dress</option>
            <option value="lower_body">Pants or trousers</option>
          </select>
        </label>
        {unsupportedProduct && <p className="inline-warning">This product is marked as {selectedProduct?.categoryHint}; the try-on model supports tops, bottoms, and dresses only.</p>}
        {selectedProduct && !selectedProduct.categoryHint && !categoryConfirmed && <p className="inline-warning">Category was not detected. Choose a clothing category before generating.</p>}
        <button className="primary" disabled={!selectedProfileAsset || !selectedProduct || !imageReady || unsupportedProduct || !categoryConfirmed || submitting || Boolean(job && !terminalStatuses.has(job.status))} onClick={generate}>
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

export { App };

const rootElement = document.getElementById("root");
if (rootElement) createRoot(rootElement).render(<App />);

