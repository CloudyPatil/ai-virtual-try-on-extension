import socket

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

import app as worker


REQUEST = {
    "personImageDataUrl": "data:image/png;base64,AAAA",
    "category": "upper_body",
    "preserveBackground": True,
    "product": {
        "id": "product-1",
        "title": "Blue shirt",
        "imageUrl": "https://cdn.example/shirt.jpg",
        "pageUrl": "https://shop.example/shirt",
        "score": 90,
        "source": "dom",
    },
}


def test_worker_requires_server_token(monkeypatch):
    monkeypatch.setenv("TRYON_WORKER_TOKEN", "test-secret")
    monkeypatch.setattr(worker.engine, "generate", lambda _request: Image.new("RGB", (8, 8), "blue"))
    client = TestClient(worker.app)

    assert client.post("/v1/try-on", json=REQUEST).status_code == 401
    response = client.post(
        "/v1/try-on",
        json=REQUEST,
        headers={"authorization": "Bearer test-secret"},
    )
    assert response.status_code == 200
    assert response.json()["imageUrl"].startswith("data:image/webp;base64,")


def test_private_network_product_urls_are_blocked(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))],
    )
    with pytest.raises(HTTPException, match="Private-network"):
        worker.validate_public_image_request(httpx.Request("GET", "https://internal.example/image.jpg"))
