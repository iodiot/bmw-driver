# Local coding connection

**Disabled for this project at the owner's request on 2026-11-17.** The project was removed from the router configuration. The instructions below are historical and must not be used unless the owner explicitly enables local models again.

This project uses an independently installed Hybrid Router and Ollama on the Windows machine. The selected model is **qwen2.5-coder:7b**. The BMW project has `cloud: false`; the launcher sends every request with `mode: local`. It never invokes the cloud backend as a fallback.

From the repository folder:

```powershell
node tools/local-ai.mjs status
node tools/local-ai.mjs --files work/glb_export.py --task "Add a concise module docstring. Preserve all executable code."
```

Use `--task-file C:/path/task.txt` for longer instructions. File paths are relative to the repository; separate multiple paths with commas. Only explicitly authorized source files are accepted. Requests allow up to eight files, 40 KB per input file and 60 KB total context. Start with a small helper; the current viewer is larger than the router's per-file limit.

The repository must have a clean committed HEAD. The router creates a detached worktree, asks the local model for a proposal, checks supported syntax and saves a patch/result. Review the returned `worktree` and `changes.patch`. Validation does not establish that a proposal works correctly. No automatic merge, commit, upload or cleanup occurs.

Machine configuration is kept outside Git:

```json
{
  "routerRoot": "C:/absolute/path/to/hybrid-router",
  "configPath": "C:/absolute/path/to/operator-config.json"
}
```

Save that structure as `.local-ai/connection.json` with the actual paths. The router operator config must register `bmw-driver` with this clone's absolute `repo`, an explicit `files` allowlist and `cloud: false`. Python parsing requires its absolute `python` executable path in the operator config. Model-generated project code is not executed by syntax validation.

This launcher can run without a ChatGPT/Codex conversation. It does not change the model powering an existing chat. A fresh router process is started for each standalone request, so updated project permissions are read immediately.

The initial snapshot is uploaded to GitHub once. Further experiments remain local until another upload is explicitly requested.
