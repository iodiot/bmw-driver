from pathlib import Path
p=Path('outputs/bmw-viewer/car-v15.html');s=p.read_text();prefix=s.split('<header>')[0]
css='''<style>.drive-hud{position:absolute;z-index:2;right:24px;bottom:24px;display:grid;gap:8px;justify-items:center;padding:12px;background:rgba(17,24,35,.48);border:1px solid #304052;border-radius:14px;backdrop-filter:blur(6px)}.drive-hud output{font-size:19px;font-variant-numeric:tabular-nums}.drive-pad{display:grid;grid-template-columns:36px 36px 36px;gap:4px}.drive-pad button{padding:5px;min-height:36px;touch-action:none;user-select:none}.drive-pad button[data-pressed=true]{background:#397eab}.drive-pad .up{grid-column:2}.drive-pad .left{grid-column:1}.drive-hud .pause{border:0;padding:2px 6px;background:none;color:#b9c9d8;font-size:12px}canvas:focus{outline:none}.key-help{color:#b8c4d0;font-size:12px;line-height:1.5;margin:8px 0}@media(max-width:420px){.drive-hud{right:16px;bottom:16px;padding:9px}.panel[open]{bottom:160px;max-height:calc(100dvh - 250px)}}</style>'''
body='''<header><h1>BMW M5 F10</h1></header><p id="status" hidden>Loading…</p>
<details class="panel"><summary>Controls</summary>
<div class="row"><label><input type="checkbox" id="drive" checked> Driving</label><button id="reset">Reset</button></div>
<p class="key-help">↑ Accelerate · ↓ Brake<br>← → Steer · Space Pause</p>
<div class="row"><label><input type="checkbox" id="perspective" checked> Perspective camera</label></div>
<div class="row"><label for="hood">Hood opening</label><output id="angle">0°</output></div><input id="hood" type="range" min="0" max="65" value="0">
<div class="row"><label for="steer">Steering preview</label><output id="steer-angle">0°</output></div><input id="steer" type="range" min="-25" max="25" value="0">
<div class="row"><label><input type="checkbox" id="spin">Spin preview</label><output id="rpm">30 RPM</output></div><input id="speed" aria-label="Wheel preview speed" type="range" min="0" max="120" value="30" step="5">
<div class="row"><label><input type="checkbox" id="lights" checked> Headlights</label><label><input type="checkbox" id="orbit"> Orbit</label></div>
<div class="row"><button id="front">Front</button><button id="side">Side</button><button id="three">¾ view</button></div>
<div class="row"><button id="rear">Rear</button><button id="arch">Rear arch</button><button id="shot">Save PNG</button></div>
<div class="downloads"><a href="bmw-solid-sides-v16.glb" download>Car GLB</a><a href="car-v15.html">Previous iteration</a><a href="factory-dimensions.png" target="_blank">Factory drawing</a></div></details>
<div class="drive-hud"><output id="velocity" aria-label="Vehicle speed">30 km/h</output><div class="drive-pad"><button class="up" data-action="accelerate" aria-label="Accelerate">↑</button><button class="left" data-action="left" aria-label="Steer left">←</button><button data-action="brake" aria-label="Brake">↓</button><button data-action="right" aria-label="Steer right">→</button></div><button class="pause" id="pause" aria-label="Pause driving">Pause</button></div>
<script type="importmap">{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
<script type="module" src="./viewer-v16.js"></script></html>'''
Path('outputs/bmw-viewer/car-v16.html').write_text(prefix+css+body,encoding='utf-8')
