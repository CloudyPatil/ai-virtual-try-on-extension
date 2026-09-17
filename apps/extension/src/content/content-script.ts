import type { ExtensionMessage } from "@tryon/contracts";
import { detectProducts } from "./product-detector.js";

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (response: ExtensionMessage) => void) => {
    if (message.type !== "TRYON_DETECT_PRODUCTS") return false;
    sendResponse({ type: "TRYON_PRODUCTS_DETECTED", products: detectProducts(document) });
    return false;
  },
);

