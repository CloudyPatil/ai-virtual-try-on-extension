import type { DigitalProfile, ProfileAsset } from "@tryon/contracts";
import { describe, expect, it } from "vitest";
import { emptyProfile, profileCompletion, requiredAssetKinds, selectProfileAsset } from "./profile.js";

const asset = (kind: ProfileAsset["kind"]): ProfileAsset => ({
  kind,
  dataUrl: "data:image/webp;base64,AAAA",
  fileName: kind + ".webp",
  width: 900,
  height: 1200,
  updatedAt: new Date().toISOString(),
});

describe("digital profile category selection", () => {
  it("prefers an upper-body image and falls back to full-body", () => {
    const profile: DigitalProfile = {
      ...emptyProfile(),
      assets: { full_body: asset("full_body"), upper_body: asset("upper_body") },
    };
    expect(selectProfileAsset(profile, "upper_body")?.kind).toBe("upper_body");
    expect(selectProfileAsset({ ...profile, assets: { full_body: asset("full_body") } }, "upper_body")?.kind).toBe(
      "full_body",
    );
  });

  it("requires full-body for a dress", () => {
    expect(requiredAssetKinds("dress")).toEqual(["full_body"]);
    expect(selectProfileAsset({ ...emptyProfile(), assets: { upper_body: asset("upper_body") } }, "dress")).toBeUndefined();
  });

  it("reports profile completion", () => {
    expect(profileCompletion({ ...emptyProfile(), assets: { face: asset("face"), feet: asset("feet") } })).toEqual({
      completed: 2,
      total: 5,
    });
  });
});
