# Resumable Google Colab runbook

The notebook at `notebooks/tryon_studio_colab.ipynb` is the supported free-GPU launcher.

## One-time preparation

1. In Google Colab, choose **Runtime > Change runtime type > T4 GPU**.
2. Open Colab's Secrets panel.
3. Add `GITHUB_TOKEN`: a fine-grained GitHub token with read-only access to this private repository.
4. Add `TRYON_WORKER_TOKEN`: a random value containing at least 24 characters.
5. Enable notebook access for both secrets.
6. Upload or open the notebook and run its **Resume runtime** cell.

The first execution installs dependencies and the first try-on downloads model checkpoints. These are the slow operations.

## Resume behavior

| Situation | What the Resume cell does |
|---|---|
| Cell was rerun in the same healthy VM | Reuses the existing API process and tunnel |
| Worker stopped but VM remains | Restarts only the worker and tunnel |
| Colab assigned a fresh VM | Remounts Drive, installs packages from the persistent pip cache, then restarts services |
| First inference after a fresh VM | Loads CatVTON from the persistent Hugging Face cache |
| Source/model cache already exists | Skips cloning and avoids downloading the same model blobs again |

Colab deletes idle VMs, so no notebook can preserve live Python processes across a full runtime replacement. This workflow preserves everything reusable and reconstructs only ephemeral state.

## Connect the local backend

The Resume cell prints a new `TRYON_PROVIDER_URL`. From the repository root run:

```powershell
.\scripts\configure-remote-worker.ps1 -Url "https://the-new-address.trycloudflare.com"
npm.cmd run dev:api
```

Enter the same `TRYON_WORKER_TOKEN` when prompted. The token input is hidden and the generated `.env` is ignored by Git.

Quick Tunnel URLs change whenever the tunnel process is recreated. The worker token and Drive caches remain stable. For a permanent URL, a named Cloudflare Tunnel with an account and a domain can replace the Quick Tunnel later.

## Recovery

- If setup fails, run the notebook's diagnostics cell and inspect `worker.log` and `tunnel.log`.
- If a package installation was interrupted, rerun Resume; the marker is written only after installation succeeds.
- If the model download was interrupted, rerun the first try-on; Hugging Face resumes from its content-addressed Drive cache.
- Do not use **Disconnect and delete runtime** unless the VM is unhealthy; a normal reconnect is faster.
