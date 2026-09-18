import type { ProfileAsset, ProfileAssetKind } from "@tryon/contracts";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1_400;

export async function optimizeProfileImage(file: File, kind: ProfileAssetKind): Promise<ProfileAsset> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    throw new Error("Choose a JPEG, PNG or WebP photograph.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("The photograph must be smaller than 10 MB.");
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (bitmap.width < 320 || bitmap.height < 320) {
      throw new Error("The photograph is too small. Use an image of at least 320 by 320 pixels.");
    }
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, width, height);
    return {
      kind,
      dataUrl: canvas.toDataURL("image/webp", 0.86),
      fileName: file.name,
      width,
      height,
      updatedAt: new Date().toISOString(),
    };
  } finally {
    bitmap.close();
  }
}
