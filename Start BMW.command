#!/bin/bash
set -eu
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python 3 is required. Install Python 3, then open this launcher again.'
  read -r -p 'Press Return to close.'
  exit 1
fi
if [ ! -f outputs/bmw-viewer/node_modules/three/build/three.module.js ]; then
  if command -v npm >/dev/null 2>&1; then
    npm ci --ignore-scripts --prefix outputs/bmw-viewer
  else
    echo 'Three.js is missing. Install Node.js and run npm run viewer:install.'
    read -r -p 'Press Return to close.'
    exit 1
  fi
fi
# Port zero chooses an available port without interfering with other servers.
exec python3 tools/serve_macos.py
