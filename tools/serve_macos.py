"""Serve the viewer on loopback and open the system browser on macOS."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

root = Path(__file__).resolve().parents[1]
handler = partial(SimpleHTTPRequestHandler, directory=str(root/'outputs/bmw-viewer'))
with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
    url = f'http://127.0.0.1:{server.server_port}/car-v26.html?paused=1'
    print(f'BMW viewer: {url}\nKeep this window open. Press Control-C to stop.', flush=True)
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
