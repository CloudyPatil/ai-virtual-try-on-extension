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


def test_image_connection_uses_validated_ip_without_second_dns_lookup(monkeypatch):
    lookups = []
    connections = []

    def resolve(host, port, **_kwargs):
        lookups.append((host, port))
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", port))]

    def connect(_self, host, port, **_kwargs):
        connections.append((host, port))
        return object()

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
    monkeypatch.setattr(worker.SyncBackend, "connect_tcp", connect)

    worker.PublicImageNetworkBackend().connect_tcp("cdn.example", 443)
    assert lookups == [("cdn.example", 443)]
    assert connections == [("93.184.215.14", 443)]


def test_dns_rebinding_to_private_ip_is_blocked_at_connection(monkeypatch):
    answers = iter(["93.184.215.14", "127.0.0.1"])
    connections = []

    def resolve(_host, port, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (next(answers), port))]

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
    monkeypatch.setattr(
        worker.SyncBackend,
        "connect_tcp",
        lambda *_args, **_kwargs: connections.append("connected"),
    )

    worker.validate_public_image_request(httpx.Request("GET", "https://cdn.example/image.jpg"))
    with pytest.raises(HTTPException, match="Private-network"):
        worker.PublicImageNetworkBackend().connect_tcp("cdn.example", 443)
    assert connections == []


def test_mixed_public_and_private_dns_answers_are_rejected(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.2", 443)),
        ],
    )
    with pytest.raises(HTTPException, match="Private-network"):
        worker.resolve_public_address("cdn.example", 443)


def test_redirect_to_private_host_is_rejected_before_fetch(monkeypatch):
    fetched = []

    def handler(request):
        fetched.append(str(request.url))
        return httpx.Response(302, headers={"location": "https://127.0.0.1/secret"})

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", 443))],
    )
    monkeypatch.setattr(worker, "PublicImageTransport", lambda: httpx.MockTransport(handler))

    with pytest.raises(HTTPException, match="Private-network"):
        worker.download_product_image("https://cdn.example/redirect")
    assert fetched == ["https://cdn.example/redirect"]


def test_non_https_product_image_url_is_rejected_before_fetch(monkeypatch):
    fetched = []
    monkeypatch.setattr(worker, "PublicImageTransport", lambda: httpx.MockTransport(lambda request: fetched.append(request)))
    with pytest.raises(HTTPException, match="HTTPS"):
        worker.download_product_image("http://cdn.example/image.jpg")
    assert fetched == []
