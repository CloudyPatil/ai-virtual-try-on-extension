import { build as buildScript } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as buildVite } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

await buildVite({ root });

await Promise.all([
  buildScript({
    entryPoints: [path.join(root, "src/background/service-worker.ts")],
    outfile: path.join(dist, "service-worker.js"),
    bundle: true,
    format: "esm",
    target: "chrome114",
  }),
  buildScript({
    entryPoints: [path.join(root, "src/content/content-script.ts")],
    outfile: path.join(dist, "content-script.js"),
    bundle: true,
    format: "iife",
    target: "chrome114",
  }),
]);

await fs.copyFile(path.join(root, "public/manifest.json"), path.join(dist, "manifest.json"));
console.log(`Extension built at ${dist}`);

