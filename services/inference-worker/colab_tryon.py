"""Notebook-driven CatVTON acceptance run; no web server or Detectron2."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

DEFAULT_BOXES = {
    "upper": (0.16, 0.21, 0.84, 0.66),
    "lower": (0.19, 0.48, 0.81, 0.98),
    "overall": (0.13, 0.20, 0.87, 0.98),
}


def parse_box(value: str | None, category: str) -> tuple[float, float, float, float]:
    box = DEFAULT_BOXES[category] if value is None else tuple(float(v.strip()) for v in value.split(","))
    if len(box) != 4 or not (0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1):
        raise ValueError("Mask box must be x0,y0,x1,y1, each from 0 to 1, with x0<x1 and y0<y1.")
    return box


def make_mask(image, box):
    from PIL import Image, ImageDraw, ImageFilter

    width, height = image.size
    mask = Image.new("L", (width, height), 0)
    coordinates = (round(box[0] * width), round(box[1] * height),
                   round(box[2] * width), round(box[3] * height))
    ImageDraw.Draw(mask).rounded_rectangle(coordinates, radius=max(8, width // 24), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(radius=5))


def preview(person, mask, output: Path) -> None:
    from PIL import Image

    tint = Image.new("RGB", person.size, (111, 51, 235))
    overlay = Image.blend(person, tint, 0.55)
    Image.composite(overlay, person, mask).save(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview a mask or perform one notebook try-on")
    parser.add_argument("--catvton-repo", required=True, type=Path)
    parser.add_argument("--person", required=True, type=Path)
    parser.add_argument("--garment", required=True, type=Path)
    parser.add_argument("--category", choices=tuple(DEFAULT_BOXES), default="upper")
    parser.add_argument("--box", help="Optional normalized mask box: x0,y0,x1,y1")
    parser.add_argument("--preview", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--steps", type=int, default=25)
    args = parser.parse_args()

    if args.steps < 10 or args.steps > 50:
        parser.error("--steps must be between 10 and 50")
    if not args.catvton_repo.is_dir():
        parser.error("CatVTON source is missing; run the setup cell first")
    if not args.person.is_file() or not args.garment.is_file():
        parser.error("Upload both the person and garment images first")

    from PIL import Image

    person = Image.open(args.person).convert("RGB")
    garment = Image.open(args.garment).convert("RGB")
    if min(person.size) < 256 or min(garment.size) < 256:
        parser.error("Both images should have width and height of at least 256 pixels")
    sys.path.insert(0, str(args.catvton_repo))
    from utils import resize_and_crop, resize_and_padding

    person = resize_and_crop(person, (768, 1024))
    garment = resize_and_padding(garment, (768, 1024))
    mask = make_mask(person, parse_box(args.box, args.category))
    args.preview.parent.mkdir(parents=True, exist_ok=True)
    preview(person, mask, args.preview)
    print(f"Mask preview: {args.preview}", flush=True)
    if args.output is None:
        return

    import torch
    from huggingface_hub import snapshot_download
    from model.pipeline import CatVTONPipeline

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; choose a GPU runtime and rerun setup")
    print("Downloading CatVTON attention checkpoint if it is not cached...", flush=True)
    attention = snapshot_download(
        repo_id="zhengchong/CatVTON",
        allow_patterns=["mix-48k-1024/attention/*"],
    )
    print("Loading base model and VAE (first run downloads several GB)...", flush=True)
    pipe = CatVTONPipeline(
        base_ckpt="booksforcharlie/stable-diffusion-inpainting",
        attn_ckpt=attention,
        attn_ckpt_version="mix",
        weight_dtype=torch.float16,
        device="cuda",
        skip_safety_check=True,
    )
    generator = torch.Generator(device="cuda").manual_seed(42)
    with torch.inference_mode():
        result = pipe(
            image=person, condition_image=garment, mask=mask,
            num_inference_steps=args.steps, guidance_scale=2.5,
            generator=generator,
        )[0]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output)
    print(f"REAL_TRYON_COMPLETE: {args.output}", flush=True)


if __name__ == "__main__":
    main()
