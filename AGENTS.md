# Working agreement

- Current viewer/model iteration: v25. Preserve working driving controls and opening panels.
- Code-generation experiments for this project use the local `bmw-driver` router project, `mode: local`, model `qwen2.5-coder:7b`. Cloud fallback is not authorized. Do not send project context to a cloud coding backend.
- The standalone entry point is `node tools/local-ai.mjs`. Machine connection details live in ignored `.local-ai/connection.json`.
- Router proposals remain in detached worktrees for review. Never silently apply proposals to the live model/viewer. Review the actual diff and verify behavior before accepting it.
- After the initial authorized GitHub upload, do not push, publish or synchronize later experiments unless the owner explicitly requests it. Local commits are allowed.
- Model optimization/merging is paused. Do not invoke 3D generation services unless requested again.
- Do not commit installed dependencies, executables, caches, API keys or private machine configuration.
