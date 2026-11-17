# BMW M5 F10 driving prototype

Interactive Three.js car viewer with driving controls, moving wheels, opening doors, hood and trunk, sky reflections and an asphalt road. The current iteration is **v25**. The interface is in English.

## Run the viewer

Install Node.js and Python 3, then run from this repository:

```powershell
npm.cmd run viewer:install
npm.cmd run viewer
```

Open http://127.0.0.1:5195/car-v25.html in a browser. If port 5195 is already occupied, serve `outputs/bmw-viewer` on a different port. The viewer loads the vendored Three.js files installed by the first command. It does not require a model-generation service.

## Project contents

- `outputs/bmw-viewer/`: viewer, environments, current GLB and earlier model iterations, including raw generated candidates.
- `work/`: procedural modeling scripts, geometry helpers, diagnostic scripts and reference material.
- `outputs/`: screenshots, iteration statistics, verification reports and BMW reference documents.
- `tools/local-ai.mjs`: launcher for the separately installed local coding router.

The historical assets are intentionally retained in this initial upload. Packages, downloaded executables, caches, duplicate remote downloads and private machine configuration are excluded. This is a visual prototype, not an official BMW asset or a production-ready optimized game model. BMW names and reference material belong to their respective owners; no license for third-party material is granted here.

## Modeling

Install the Python dependencies with `python -m pip install -r requirements.txt`. Scripts assume this repository is the current working directory and may depend on earlier GLB iterations. Read each script before running it: some write a new model, while historical `publish_*` scripts update viewer files. `work/window_frames_v25.py` is the latest geometry iteration. Optimization/merging is currently paused.

## Local coding experiments

See `outputs/LOCAL_AI.md`. The configured coding model is `qwen2.5-coder:7b` through local Ollama. Requests always use local mode; cloud fallback is disabled for this project. Proposed changes stay in a separate Git worktree until reviewed. The launcher never commits, merges or pushes changes.

The initial snapshot is published to GitHub. Subsequent experiments must remain local until the owner explicitly requests another upload. Connecting a local coding router does not replace the model powering a Codex/ChatGPT conversation.
