# BMW M5 F10 driving prototype

Interactive Three.js car viewer with driving controls, moving wheels, opening doors, hood and trunk, sky reflections and an asphalt road. The current iteration is **v26**. The interface is in English.

## Run the viewer

Install Node.js and Python 3, then run from this repository:

```powershell
npm.cmd run viewer:install
npm.cmd run viewer
```

Open http://127.0.0.1:5195/car-v26.html in a browser. If port 5195 is already occupied, serve `outputs/bmw-viewer` on a different port. The viewer loads the vendored Three.js files installed by the first command. It does not require a model-generation service.

## Project contents

- `outputs/bmw-viewer/`: viewer, environments, current GLB and earlier model iterations, including raw generated candidates.
- `work/`: procedural modeling scripts, geometry helpers, diagnostic scripts and reference material.
- `outputs/`: screenshots, iteration statistics, verification reports and BMW reference documents.
- `tools/local-ai.mjs`: launcher for the separately installed local coding router.

The historical assets are intentionally retained in this initial upload. Packages, downloaded executables, caches, duplicate remote downloads and private machine configuration are excluded. This is a visual prototype, not an official BMW asset or a production-ready optimized game model. BMW names and reference material belong to their respective owners; no license for third-party material is granted here.

## Modeling

Install the Python dependencies with `python -m pip install -r requirements.txt`. Scripts assume this repository is the current working directory and may depend on earlier GLB iterations. Read each script before running it: some write a new model, while historical `publish_*` scripts update viewer files. `work/assemble_brakes_v26.py` builds the latest brake-disc iteration from v25. Optimization/merging is currently paused.

## Local coding experiments

Local models were disabled for this project at the owner's request on 2026-11-17. `outputs/LOCAL_AI.md` and local connection reports are historical only. Use the normal coding workflow.

The initial snapshot is published to GitHub. Subsequent experiments must remain local until the owner explicitly requests another upload. Connecting a local coding router does not replace the model powering a Codex/ChatGPT conversation.

