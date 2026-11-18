# BMW M5 F10

The current driving scene uses the imported BMW M5 F10 model in Black Sapphire Metallic (475). It includes rotating and steering wheels, independent suspension, road bumps and potholes, brake lights, drifting clouds, Orbit and Wireframe controls. Night mode adds a moonlit dusk sky and automatically switches on the low beams and rear running lights.

Light exhaust vapor exits all four tailpipes, rises and disperses in the car's wake, and increases under acceleration. Pause freezes the plume; Restart clears it.

Rain is independent of Night. It adds falling drops, road ripples, overcast lighting, shorter visibility and a wet reflective asphalt surface in either lighting mode.

Water beads accumulate on painted panels and remain after the rain stops. Gravity drains them slowly; airflow stretches and moves them rearward as speed increases. The paint gradually returns to its dry finish.

The windshield, rear window and side glass also collect beads and longer running drops. Their flow follows the slope of each pane and changes with vehicle speed, while retaining glass transparency.

Rain automatically runs two modeled front wipers. The flexible 650/450 mm blades follow the imported windshield and clear only the areas they sweep; drops gradually collect there again. Switching Rain off lets them finish the cycle and park. The layout follows the [M5 F10 parts diagram](https://www.bmwpartsdeal.com/parts-list/2013-bmw-m5-sedan_f10/vehicle_electrical_system/single_wiper_parts.html), with blade lengths from the [Bosch application catalogue](https://images-na.ssl-images-amazon.com/images/I/91S3otAdGGS.pdf). Pivot positions and stroke are fitted to this visual model, rather than factory CAD coordinates.

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

## Files

- `public/index.html` and `public/viewer.js`: the current interface and scene.
- `public/vehicle-rig.js`, `driving-physics.js`, `brake-lights.js` and `headlights.js`: wheel rig, driving and lights.
- `public/environment.js`, `road.js`, `road-profile.js` and `rain.js`: sky, weather, asphalt and tyre contact surface.
- `public/body-water.js` and `wipers.js`: surface drops, automatic front wipers and their synchronized clearing mask.
- `public/assets/bmw-m5-f10.glb`: the only car asset.
- `public/assets/ATTRIBUTION.md`: model author, source, license and adaptations.
- `tools/serve.mjs`: local server.
- `tests/`: geometry, suspension, steering, lights, exhaust and weather checks (`npm test`).

The GLB remains unmodified; scale, paint and moving parts are adapted at runtime. This is an unofficial visual prototype.

## Code formatting

Run `npm run format` to format the source, or `npm run format:check` to check it. The pinned formatter uses `.prettierrc.json` and is cached outside the project.
