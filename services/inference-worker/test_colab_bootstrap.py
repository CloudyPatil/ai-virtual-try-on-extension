import pytest
import colab_bootstrap


def test_failed_command_logs_output(tmp_path):
    log = tmp_path / "setup.log"
    with pytest.raises(RuntimeError, match="exit code 7"):
        colab_bootstrap.run_logged(
            [colab_bootstrap.sys.executable, "-c", "print('install failed'); raise SystemExit(7)"],
            dict(colab_bootstrap.os.environ), log,
        )
    assert "install failed" in log.read_text()


def test_existing_python_and_torch_are_reused(monkeypatch, tmp_path):
    runtime = tmp_path / "runtime"
    python = runtime / "venv-py311/bin/python"
    python.parent.mkdir(parents=True)
    python.touch()
    (runtime / "torch-cu121.ready").touch()
    commands = []
    monkeypatch.setattr(colab_bootstrap, "run_logged", lambda command, *_args: commands.append(command))
    result = colab_bootstrap.ensure_worker_python(tmp_path, runtime, tmp_path / "setup.log")
    assert result == python
    assert len(commands) == 2
    assert "sys.version_info[:2] == (3, 11)" in commands[0][-1]
    assert "torch.cuda.is_available()" in commands[1][-1]


def test_interrupted_torch_install_has_no_success_marker(monkeypatch, tmp_path):
    runtime = tmp_path / "runtime"
    python = runtime / "venv-py311/bin/python"
    python.parent.mkdir(parents=True)
    python.touch()

    def run(command, *_args):
        if "install" in command:
            raise RuntimeError("download interrupted")

    monkeypatch.setattr(colab_bootstrap, "run_logged", run)
    with pytest.raises(RuntimeError, match="download interrupted"):
        colab_bootstrap.ensure_worker_python(tmp_path, runtime, tmp_path / "setup.log")
    assert not (runtime / "torch-cu121.ready").exists()


def test_invalid_cached_torch_is_reinstalled(monkeypatch, tmp_path):
    runtime = tmp_path / "runtime"
    python = runtime / "venv-py311/bin/python"
    python.parent.mkdir(parents=True)
    python.touch()
    (runtime / "torch-cu121.ready").touch()
    commands = []

    def run(command, *_args):
        commands.append(command)
        if len(commands) == 2:
            raise RuntimeError("cached torch broken")

    monkeypatch.setattr(colab_bootstrap, "run_logged", run)
    colab_bootstrap.ensure_worker_python(tmp_path, runtime, tmp_path / "setup.log")
    assert any("install" in command for command in commands)
    assert (runtime / "torch-cu121.ready").exists()
