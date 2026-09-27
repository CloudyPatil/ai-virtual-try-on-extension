# Resumable Google Colab runbook

## Python compatibility and setup

The notebook launches colab_bootstrap.py, which creates a separate Python 3.11 environment under /content/tryon-studio/venv-py311. It installs CUDA PyTorch 2.4.1 and matching torchvision. Colab's notebook kernel can remain on Python 3.13.

Setup prints four numbered stages and streams installation output. The first CUDA wheel download is large. Compiled dependencies require binary wheels, so unsupported packages fail rather than silently compiling from source. Success markers are written only after installation and validation succeed.

## One-time preparation

1. Upload notebooks/tryon_studio_colab.ipynb to Colab and save a copy in Drive.
2. Choose Runtime > Change runtime type > T4 GPU.
3. Add GITHUB_TOKEN to Colab Secrets, selecting this private repository with Contents: Read-only. Enable notebook access.
4. Run the first code cell with PREPARE_ONLY = True.
5. Authorize Drive access.
6. Wait for [4/4] Environment preparation complete.

Authentication is passed through the subprocess environment and removed from ordinary Git error output. The source checkout fetches project fixes and merges with --ff-only, preserving local edits.

Preparation validates the environment and model imports. It does not download checkpoints or generate an image. Real notebook-driven inference remains an acceptance test.

## Free-Colab scope

Google restricts bypassing the notebook UI to interact primarily through a web UI on free runtimes without a positive compute-unit balance:
https://research.google.com/colaboratory/faq.html

The default preparation mode does not start the remote worker or tunnel. Use notebook-driven model testing for free Colab. Serving through the extension requires a runtime/provider that permits that workflow.

## Resume behavior

| Situation | Recovery |
|---|---|
| Same healthy VM | Reuse the Python environment and success markers |
| Interrupted installation | Retry; no success marker is written |
| New VM | Recreate the Python environment using available Drive caches |
| Project fixes pushed | Fetch and merge latest main with --ff-only |
| Checkpoint download interrupted | Retry inference using the Hugging Face cache |

My Drive/TryOnStudio retains source and available package/model caches. Running processes and installed VM packages do not survive a VM replacement. Caching reduces repeated downloads but does not eliminate installation.

## Remote serving on a permitted runtime

Add TRYON_WORKER_TOKEN (at least 24 random characters) to Secrets and enable notebook access. Set PREPARE_ONLY = False. A successful launch prints TRYON_PROVIDER_URL.

From the local repository root:

```powershell
.\scripts\configure-remote-worker.ps1 -Url "https://the-new-address.trycloudflare.com"
npm.cmd run dev:api
```

Enter the same worker token at the hidden prompt. The generated .env is ignored by Git. Allow sufficient provider timeout for the first cold inference's checkpoint downloads.

The Quick Tunnel URL changes when its process is recreated. Update local configuration and restart the API when it changes.

## Diagnostics

Run the final notebook cell after a failure. It reads the local setup.log, falling back to My Drive/TryOnStudio/setup.log, and worker/tunnel logs if present.

The setup log is copied to Drive at normal completion or a handled failure. An abrupt VM termination may prevent that final copy, so retain the notebook's last output lines too. Worker/tunnel logs are absent in preparation-only mode.

Do not delete Drive caches to recover from a package error. First record the numbered setup stage and final error.
