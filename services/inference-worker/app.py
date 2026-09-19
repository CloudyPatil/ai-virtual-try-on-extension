from __future__ import annotations

import base64
import importlib
import ipaddress
import io
import os
import secrets
import socket
import ssl
import sys
import threading
from typing import Any, Literal
from urllib.parse import urlparse

import httpcore
import httpx
from httpcore._backends.sync import SyncBackend
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict

MAX_IMAGE_BYTES = 10 * 1024 * 1024
CATEGORY_MAP = {
    "upper_body": "upper",
    "lower_body": "lower",
    "dress": "overall",
}


class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    imageUrl: str
    pageUrl: str
    score: float
    source: str


class TryOnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    personImageDataUrl: str
    product: Product
    category: Literal["upper_body", "lower_body", "dress"]
    preserveBackground: bool = True


class TryOnResponse(BaseModel):
    imageUrl: str
    provider: str = "catvton"
    productSimilarity: float | None = None


def decode_data_image(value: str):
    from PIL import Image

    try:
        metadata, payload = value.split(",", 1)
        if not metadata.lower().startswith(("data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64")):
            raise ValueError
        raw = base64.b64decode(payload, validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise HTTPException(status_code=400, detail="Invalid person image") from error
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Person image is too large")
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
        return image.convert("RGB")
    except Exception as error:
        raise HTTPException(status_code=400, detail="Person image could not be decoded") from error


def resolve_public_address(hostname: str, port: int) -> str:
    """Resolve once and return the exact public IP to use for the TCP connection."""
    if "%" in hostname:
        raise HTTPException(status_code=400, detail="Invalid product image address")
    try:
        literal_ip = ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        if not literal_ip.is_global:
            raise HTTPException(status_code=400, detail="Private-network product image URLs are not allowed")
        return str(literal_ip)
    try:
        addresses = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise HTTPException(status_code=400, detail="Product image hostname could not be resolved") from error
    if not addresses:
        raise HTTPException(status_code=400, detail="Product image hostname could not be resolved")
    public_addresses: list[str] = []
    for address in addresses:
        try:
            raw_ip = address[4][0]
            if "%" in raw_ip:
                raise ValueError("Scoped IP address")
            ip = ipaddress.ip_address(raw_ip)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid product image address") from error
        if not ip.is_global:
            raise HTTPException(status_code=400, detail="Private-network product image URLs are not allowed")
        public_addresses.append(str(ip))
    return public_addresses[0]


def validate_public_image_request(request: httpx.Request) -> None:
    parsed = urlparse(str(request.url))
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="Product image URL must use HTTPS without credentials")
    resolve_public_address(parsed.hostname, parsed.port or 443)


class PublicImageNetworkBackend(SyncBackend):
    """Pin each connection to an address validated immediately before connecting."""

    def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        address = resolve_public_address(host, port)
        return super().connect_tcp(
            address,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )


class PublicImageTransport(httpx.HTTPTransport):
    def __init__(self) -> None:
        # HTTPX 0.28/httpcore 1.x keep TLS SNI and certificate checks on the
        # original hostname while connect_tcp receives the validated IP.
        super().__init__(trust_env=False, limits=httpx.Limits(max_connections=1, max_keepalive_connections=0))
        self._pool.close()
        self._pool = httpcore.ConnectionPool(
            ssl_context=ssl.create_default_context(),
            network_backend=PublicImageNetworkBackend(),
            max_connections=1,
            max_keepalive_connections=0,
        )


def download_product_image(url: str):
    from PIL import Image

    try:
        with httpx.Client(
            transport=PublicImageTransport(),
            trust_env=False,
            follow_redirects=True,
            max_redirects=5,
            timeout=20,
            event_hooks={"request": [validate_public_image_request]},
        ) as client:
            with client.stream("GET", url, headers={"user-agent": "TryOnStudio/0.1"}) as response:
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if not content_type.lower().startswith("image/"):
                    raise HTTPException(status_code=400, detail="Product URL did not return an image")
                declared_size = int(response.headers.get("content-length", "0"))
                if declared_size > MAX_IMAGE_BYTES:
                    raise HTTPException(status_code=413, detail="Product image is too large")
                chunks: list[bytes] = []
                size = 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > MAX_IMAGE_BYTES:
                        raise HTTPException(status_code=413, detail="Product image is too large")
                    chunks.append(chunk)
        image = Image.open(io.BytesIO(b"".join(chunks)))
        image.load()
        return image.convert("RGB")
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=400, detail="Unable to download product image") from error


def image_data_url(image) -> str:
    output = io.BytesIO()
    image.save(output, format="WEBP", quality=92, method=4)
    return "data:image/webp;base64," + base64.b64encode(output.getvalue()).decode("ascii")


class CatVtonEngine:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self._pipeline: Any = None
        self._automasker: Any = None
        self._mask_processor: Any = None
        self._resize_and_crop: Any = None
        self._resize_and_padding: Any = None

    @property
    def ready(self) -> bool:
        try:
            torch = importlib.import_module("torch")
            return bool(torch.cuda.is_available()) and os.path.isdir(os.environ.get("CATVTON_REPO", "/content/CatVTON"))
        except ImportError:
            return False

    def _load(self) -> None:
        if self._loaded:
            return
        repo = os.environ.get("CATVTON_REPO", "/content/CatVTON")
        if repo not in sys.path:
            sys.path.insert(0, repo)

        torch = importlib.import_module("torch")
        if not torch.cuda.is_available():
            raise RuntimeError("CatVTON worker requires a CUDA GPU")

        snapshot_download = importlib.import_module("huggingface_hub").snapshot_download
        VaeImageProcessor = importlib.import_module("diffusers.image_processor").VaeImageProcessor
        CatVTONPipeline = importlib.import_module("model.pipeline").CatVTONPipeline
        AutoMasker = importlib.import_module("model.cloth_masker").AutoMasker
        utils = importlib.import_module("utils")

        checkpoint = snapshot_download(repo_id=os.environ.get("CATVTON_CHECKPOINT", "zhengchong/CatVTON"))
        precision = os.environ.get("CATVTON_PRECISION", "fp16")
        self._pipeline = CatVTONPipeline(
            base_ckpt=os.environ.get("CATVTON_BASE_MODEL", "booksforcharlie/stable-diffusion-inpainting"),
            attn_ckpt=checkpoint,
            attn_ckpt_version="mix",
            weight_dtype=utils.init_weight_dtype(precision),
            use_tf32=True,
            device="cuda",
        )
        self._automasker = AutoMasker(
            densepose_ckpt=os.path.join(checkpoint, "DensePose"),
            schp_ckpt=os.path.join(checkpoint, "SCHP"),
            device="cuda",
        )
        self._mask_processor = VaeImageProcessor(
            vae_scale_factor=8,
            do_normalize=False,
            do_binarize=True,
            do_convert_grayscale=True,
        )
        self._resize_and_crop = utils.resize_and_crop
        self._resize_and_padding = utils.resize_and_padding
        self._loaded = True

    def generate(self, request: TryOnRequest):
        import torch

        with self._lock, torch.inference_mode():
            self._load()
            person = self._resize_and_crop(decode_data_image(request.personImageDataUrl), (768, 1024))
            garment = self._resize_and_padding(download_product_image(request.product.imageUrl), (768, 1024))
            mask = self._automasker(person, CATEGORY_MAP[request.category])["mask"]
            mask = self._mask_processor.blur(mask, blur_factor=9)
            generator = torch.Generator(device="cuda").manual_seed(42)
            return self._pipeline(
                image=person,
                condition_image=garment,
                mask=mask,
                num_inference_steps=40,
                guidance_scale=2.5,
                generator=generator,
            )[0]


engine = CatVtonEngine()
app = FastAPI(title="TryOn Studio GPU Worker", version="0.1.0")


def authorize(authorization: str | None = Header(default=None)) -> None:
    token = os.environ.get("TRYON_WORKER_TOKEN")
    if token and (not authorization or not secrets.compare_digest(authorization, f"Bearer {token}")):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict[str, object]:
    return {"ready": engine.ready, "engine": "catvton", "modelLoaded": engine._loaded}


@app.post("/v1/try-on", response_model=TryOnResponse, dependencies=[Depends(authorize)])
def try_on(request: TryOnRequest) -> TryOnResponse:
    try:
        result = engine.generate(request)
        return TryOnResponse(imageUrl=image_data_url(result))
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"Inference unavailable: {error}") from error
