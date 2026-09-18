import type { DigitalProfile, ProductCategory, ProfileAsset, ProfileAssetKind } from "@tryon/contracts";

export const profileAssetDefinitions: Array<{
  kind: ProfileAssetKind;
  label: string;
  guidance: string;
}> = [
  { kind: "full_body", label: "Full body", guidance: "Required for dresses; keep your complete body visible." },
  { kind: "upper_body", label: "Upper body", guidance: "Recommended for shirts, tops and jackets." },
  { kind: "lower_body", label: "Lower body", guidance: "Recommended for pants and trousers." },
  { kind: "feet", label: "Feet and legs", guidance: "Reserved for the future footwear engine." },
  { kind: "face", label: "Face", guidance: "Optional reference for identity consistency." },
];

export function emptyProfile(): DigitalProfile {
  return { id: "default", name: "My profile", assets: {}, updatedAt: new Date().toISOString() };
}

export function requiredAssetKinds(category: ProductCategory): ProfileAssetKind[] {
  const mapping: Record<ProductCategory, ProfileAssetKind[]> = {
    upper_body: ["upper_body", "full_body"],
    lower_body: ["lower_body", "full_body"],
    dress: ["full_body"],
    footwear: ["feet", "full_body"],
    jewellery: ["face", "upper_body", "full_body"],
    accessory: ["upper_body", "full_body"],
  };
  return mapping[category];
}

export function selectProfileAsset(
  profile: DigitalProfile,
  category: ProductCategory,
): ProfileAsset | undefined {
  for (const kind of requiredAssetKinds(category)) {
    const asset = profile.assets[kind];
    if (asset) return asset;
  }
  return undefined;
}

export function profileCompletion(profile: DigitalProfile) {
  const completed = profileAssetDefinitions.filter(({ kind }) => Boolean(profile.assets[kind])).length;
  return { completed, total: profileAssetDefinitions.length };
}
