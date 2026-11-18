# BMW M5 F10

The current driving scene uses the imported BMW M5 F10 model in Black Sapphire Metallic (475). It includes rotating and steering wheels, independent suspension, road bumps and potholes, brake lights, drifting clouds, Orbit and Wireframe controls. Night mode adds a moonlit dusk sky and automatically switches on the low beams and rear running lights.

The standard 560 hp / 680 Nm F10 powertrain uses a seven-speed M DCT with automatic upshifts, downshifts and kickdown. The top-right display shows the transmission and current gear (D1–D7). Full-throttle acceleration is calibrated to approximately 0–100 km/h in 4.4 seconds and 0–200 km/h in 13.0 seconds, with the standard electronic limit of 250 km/h, using the [original BMW launch figures](https://www.press.bmwgroup.com/global/article/detail/T0113556EN/the-new-bmw-m5?language=en). The optional 305 km/h M Driver’s Package is not enabled.

Engine ratings, gear ratios, mass, drag and tyre dimensions follow [BMW technical data](https://www.ausmotive.com/downloads/BMW/M5-press-kit-Feb2012.pdf). Drivetrain losses, launch grip, clutch transitions and automatic shift strategy are simplified model assumptions calibrated to the launch figures for ideal dry conditions. The demo initially cruises at 30 km/h; after using the accelerator or brake, releasing the pedals lets it coast.

Light exhaust vapor exits all four tailpipes, rises and disperses in the car's wake, and increases under acceleration. Pause freezes the plume; Restart clears it.

Rain is independent of Night. It adds falling drops, road ripples, overcast lighting, shorter visibility and a wet reflective asphalt surface in either lighting mode.

Falling rain and ripples use two GPU-instanced draws, with no per-drop CPU animation or per-frame particle-buffer uploads. Wiper shapes are fitted to the windshield once and interpolated during playback. Rendering starts within a four-million-pixel Retina budget and adjusts canvas resolution under sustained load, while keeping the interface sharp and retaining all particles and suspension updates.

Water beads accumulate on painted panels and remain after the rain stops. Gravity drains them slowly; airflow stretches and moves them rearward as speed increases. The paint gradually returns to its dry finish.

The windshield, rear window and side glass also collect beads and longer running drops. Their flow follows the slope of each pane and changes with vehicle speed, while retaining glass transparency.

Rain automatically runs two modeled front wipers. The flexible 650/450 mm blades follow the imported windshield and clear only the areas they sweep; drops gradually collect there again. Switching Rain off lets them finish the cycle and park. The layout follows the [M5 F10 parts diagram](https://www.bmwpartsdeal.com/parts-list/2013-bmw-m5-sedan_f10/vehicle_electrical_system/single_wiper_parts.html), with blade lengths from the [Bosch application catalogue](https://images-na.ssl-images-amazon.com/images/I/91S3otAdGGS.pdf). Pivot positions and stroke are fitted to this visual model, rather than factory CAD coordinates.

The stock M Compound brakes have drilled, internally vented iron discs, separate aluminium hats and blue M calipers (six-piston fixed front, single-piston floating rear). Nominal diameters are 400/396 mm; the assemblies are fitted proportionally to the imported wheels. References: [BMW brake-system description](https://www.press.bmwgroup.com/canada/article/detail/T0135232EN/text.html?actionType=copyToClient&comingFrom=transferOverview&id=165340), [front parts diagram](https://www.realoem.com/bmw/enUS/showparts?diagId=34_1423&id=FV91-EUR---F10-BMW-M5), [rear parts diagram](https://www.realoem.com/bmw/enUS/showparts?diagId=34_1472&id=FV91-EUR---F10-BMW-M5). Caliper contours and drilling patterns are visual reconstructions.

Brake work heats the iron friction rings gradually, progressing from dark red to orange under sustained heavy braking; ordinary stops stay metallic. A simplified surface/core heat model accounts for front/rear energy distribution, retained heat, airflow, radiation and faster cooling in rain. Its temperatures and glow are illustrative, not BMW test measurements. Calipers and aluminium hats do not glow. Restart cools the brakes; parked or paused cars cool naturally without adding brake heat.

## Run

Install Node.js 20 or later. From this folder, run:

```sh
npm ci --ignore-scripts
npm start
```

Open http://127.0.0.1:52259/ in the Codex browser panel. Keep the server running while using the viewer.

For another available port, use `npm start -- --port 0` and open the printed address.

## Controls

- Drive / Pause or Space: start and pause driving.
- W / Up: accelerate; S / Down: brake.
- A / Left and D / Right: steer.
- Restart: reset the car and route.
- Orbit: move the camera around the car.
- Night: switch between daylight and moonlit dusk with automatic low beams.
- Rain: toggle rain independently of Night.
- Wireframe: show the mesh.
- Drag and scroll on the scene: orbit manually and zoom.
- For a close inspection of the front brake, open `http://127.0.0.1:52259/?detail=brakes&paused=1`; the normal URL retains the general view.

## Files

- `public/index.html` and `public/viewer.js`: the current interface and scene.
- `public/vehicle-rig.js`, `driving-physics.js`, `brake-lights.js` and `headlights.js`: wheel rig, driving and lights.
- `public/powertrain.js`: standard F10 engine, seven-speed M DCT and speed limiter.
- `public/brakes.js` and `brake-heat.js`: modeled M Compound brakes and energy-driven rotor heat.
- `public/environment.js`, `road.js`, `road-profile.js` and `rain.js`: sky, weather, asphalt and tyre contact surface.
- `public/body-water.js` and `wipers.js`: surface drops, automatic front wipers and their synchronized clearing mask.
- `public/render-quality.js`: bounded Retina resolution and gradual adaptation to sustained frame load.
- `public/assets/bmw-m5-f10.glb`: the only car asset.
- `public/assets/ATTRIBUTION.md`: model author, source, license and adaptations.
- `tools/serve.mjs`: local server.
- `tests/`: geometry, suspension, steering, lights, exhaust and weather checks (`npm test`).

The GLB remains unmodified; scale, paint and moving parts are adapted at runtime. This is an unofficial visual prototype.

## Public demo build

Run `npm ci --ignore-scripts` and `npm run build` to create a standalone static demo in `dist/`. Publish that folder under any path, including `/bmw-driver/`. Its application JavaScript is bundled and obfuscated with a fixed seed; third-party rendering modules remain minified. The build ships no source maps or readable application modules, and retains model attribution and library licensing. This is code obfuscation, not secrecy: the public source repository remains readable.

Use `?capture=1&paused=1` for a clean screenshot without the overlay. The normal URL keeps all controls and telemetry visible.

## Code formatting

Run `npm run format` to format the source, or `npm run format:check` to check it. The pinned formatter uses `.prettierrc.json` and is cached outside the project.
