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

def test_dependency_marker_is_not_written_after_install_failure(monkeypatch, tmp_path):
    import pytest
    worker = tmp_path / "worker"
    worker.mkdir()
    (worker / "requirements-colab.txt").write_text("numpy==1.26.4")
    monkeypatch.setattr(colab_runtime, "run", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("interrupted")))
    with pytest.raises(RuntimeError, match="interrupted"):
        colab_runtime.ensure_dependencies(worker, tmp_path, tmp_path, tmp_path)
    assert not list(tmp_path.glob("dependencies-*.ready"))


def test_dependency_install_uses_binary_wheels_and_validates_before_marker(monkeypatch, tmp_path):
    worker = tmp_path / "worker"
    worker.mkdir()
    (worker / "requirements-colab.txt").write_text("numpy==1.26.4")
    commands = []
    monkeypatch.setattr(colab_runtime, "run", lambda command, **_kwargs: commands.append(command))
    colab_runtime.ensure_dependencies(worker, tmp_path, tmp_path, tmp_path)
    assert any("--only-binary=numpy,scipy,matplotlib,opencv-python,pillow,scikit-image,pycocotools,av,tokenizers,safetensors" in c for c in commands)
    assert any(c[-2:] == ["pip", "check"] for c in commands)
    assert any("from model.pipeline import CatVTONPipeline" in c[-1] for c in commands)
    assert any("from accelerate.utils.memory import clear_device_cache" in c[-1] for c in commands)
    assert list(tmp_path.glob("dependencies-*.ready"))
