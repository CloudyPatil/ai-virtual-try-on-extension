import { z } from "zod";

export const productCategorySchema = z.enum([
  "upper_body",
  "lower_body",
  "dress",
  "footwear",
  "jewellery",
  "accessory",
]);

export type ProductCategory = z.infer<typeof productCategorySchema>;

export const profileAssetKindSchema = z.enum([
  "full_body",
  "upper_body",
  "lower_body",
  "feet",
  "face",
]);

export type ProfileAssetKind = z.infer<typeof profileAssetKindSchema>;

export const profileAssetSchema = z.object({
  kind: profileAssetKindSchema,
  dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/i),
  fileName: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});

export type ProfileAsset = z.infer<typeof profileAssetSchema>;

export const digitalProfileSchema = z.object({
  id: z.literal("default"),
  name: z.string().min(1).max(80),
  assets: z.object({
    full_body: profileAssetSchema.optional(),
    upper_body: profileAssetSchema.optional(),
    lower_body: profileAssetSchema.optional(),
    feet: profileAssetSchema.optional(),
    face: profileAssetSchema.optional(),
  }),
  updatedAt: z.string().datetime(),
});

export type DigitalProfile = z.infer<typeof digitalProfileSchema>;

export const detectedProductSchema = z.object({
  id: z.string().min(1),
  imageUrls: z.array(z.string().url()).min(1).max(16).optional(),
  title: z.string().min(1),
  imageUrl: z.string().url(),
  pageUrl: z.string().url(),
  price: z.string().optional(),
  categoryHint: productCategorySchema.optional(),
  score: z.number().min(0).max(100),
  source: z.enum(["jsonld", "metadata", "dom", "manual"]),
});

export type DetectedProduct = z.infer<typeof detectedProductSchema>;

export const createTryOnJobSchema = z.object({
  personImageDataUrl: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/i, "A JPEG, PNG or WebP data URL is required"),
  product: detectedProductSchema,
  category: productCategorySchema,
  preserveBackground: z.boolean().default(true),
});

export type CreateTryOnJob = z.infer<typeof createTryOnJobSchema>;

export const jobStatusSchema = z.enum([
  "queued",
  "validating",
  "preprocessing",
  "waiting_for_gpu",
  "generating",
  "evaluating",
  "postprocessing",
  "completed",
  "failed",
  "cancelled",
]);

export type JobStatus = z.infer<typeof jobStatusSchema>;

export const tryOnJobSchema = z.object({
  id: z.string().uuid(),
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  message: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  result: z
    .object({
      imageUrl: z.string(),
      provider: z.string(),
      isMock: z.boolean(),
      productSimilarity: z.number().min(0).max(1).optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export type TryOnJob = z.infer<typeof tryOnJobSchema>;

export type ExtensionMessage =
  | { type: "TRYON_DETECT_PRODUCTS" }
  | { type: "TRYON_PRODUCTS_DETECTED"; products: DetectedProduct[] };
