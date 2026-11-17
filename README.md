# BMW M5 F10 driving prototype

Interactive Three.js viewer for the current v26 model, with driving controls, independently moving wheels, opening panels, drifting clouds and reflections. The road includes potholes and speed bumps; a spring-and-damper suspension model drives body roll, pitch and wheel travel.

The current model includes body-junction repairs, reshaped mirrors, corrected trim materials, wheelhouse clearances and open exhaust tips.

## Run

Python 3 is required. Double-click `Start BMW.command`, or run `bash "Start BMW.command"` from this folder. The launcher starts a local server and opens the viewer. Keep the launcher window open while using it.

If the Three.js files are missing, the launcher installs them with npm; Node.js is needed only for that setup.

## Project files

- `outputs/bmw-viewer/` contains the current viewer, v26 model, support scripts, and Three.js files.
- `work/` contains modeling scripts and source reference material. Historical scripts can require earlier model assets available in Git history.
- `tools/repack_glb.py` removes unused export data while verifying that all retained binary buffers are unchanged.

This is a visual prototype, not an official BMW product or production-ready game model. BMW names and third-party reference material belong to their respective owners; no license for third-party material is granted here.
