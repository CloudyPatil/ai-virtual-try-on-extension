import json

import colab_runtime


def test_read_state_tolerates_interrupted_state_write(tmp_path):
    state_path = tmp_path / "state.json"
    state_path.write_text("{interrupted", encoding="utf-8")
    assert colab_runtime.read_state(state_path) == {}


def test_healthy_runtime_is_reused(monkeypatch, tmp_path):
    runtime_root = tmp_path / "runtime"
    runtime_root.mkdir()
    expected = {
        "worker_pid": 100,
        "tunnel_pid": 101,
        "public_url": "https://example.trycloudflare.com",
    }
    (runtime_root / "state.json").write_text(json.dumps(expected), encoding="utf-8")
    monkeypatch.setattr(colab_runtime, "process_alive", lambda _pid: True)
    monkeypatch.setattr(colab_runtime, "health_ready", lambda _url: True)

    state = colab_runtime.start_runtime(
        worker_dir=tmp_path,
        catvton_dir=tmp_path,
        persistent_root=tmp_path,
        runtime_root=runtime_root,
        token="x" * 24,
    )

    assert state == expected
