# BMW M5 F10

![BMW M5 F10 driving at night in the rain](docs/media/driving-demo.gif)

The current driving scene uses the imported BMW M5 F10 model in Black Sapphire Metallic (475). It includes rotating and steering wheels, independent suspension, road bumps and potholes, brake lights, drifting clouds, Orbit and Wireframe controls. Night mode adds a moonlit dusk sky and automatically switches on the low beams and rear running lights.

Low beams use a shared projected angular light profile with a soft near field, an upper cutoff and a raised right-hand roadside edge. The lamps remain attached to the suspended body while their aim gradually levels after pitching and rolling. Rain and road ripples sample the same projection. This is a visual approximation for right-hand traffic, guided by [HELLA's low-beam distribution reference](https://www.hella.com/techworld/en/technical/automotive-lighting/light-distribution/), rather than measured BMW photometric data.

A compact F10-style instrument cluster sits at the bottom right, with white-lit 0–330 km/h and 0–8000 rpm dials, red needles, the current DCT gear and trip distance. Its smoothly damped needles follow the live driving simulation. The visual layout is adapted from the [original BMW M5 black-panel instruments](https://www.press.bmwgroup.com/usa/article/detail/T0114798EN_US/introducing-the-all-new-5th-generation-bmw-m5?language=en_US). The collapsible Settings menu at the top right holds driving, weather, camera, wireframe and sound controls; Escape or clicking the scene closes it.

The small suspension diagram at the bottom left shows all four tyre loads in kN and relative suspension travel in mm. Animated springs, damper rods and compression/rebound arrows follow the current physics state. Loads include static support and dynamic tyre force, and fall to zero when a wheel loses contact. These are readings from the simplified suspension model, not measured BMW telemetry.

Cornering uses a dynamic two-axle tyre model with lateral velocity, yaw inertia, combined braking/drive grip and suspension contact. Dry asphalt permits small slides; rain reduces grip and makes power oversteer and braking slides more pronounced. A simplified DSC controller trims drive force and applies a corrective yaw moment, allowing a slide before recovering it. The camera follows the direction of travel with a short delay so the body's sideslip remains visible. Tyre and stability-control parameters are tuned for this demo, not factory BMW calibration.

An amber skidding-car symbol flashes in the instrument cluster while DSC intervenes and extinguishes after grip returns, or when driving is paused. This follows [BMW's explanation of the flashing DSC warning](https://faq.bmwusa.com/s/article/FAQ-Dynamic-Stability-Control-BMW-FAQ-2TYkX). Normal straight cruising does not trigger it.

The standard 560 hp / 680 Nm F10 powertrain uses a seven-speed M DCT with automatic upshifts, downshifts and kickdown. The instrument cluster shows the transmission and current gear (D1–D7). Full-throttle acceleration is calibrated to approximately 0–100 km/h in 4.4 seconds and 0–200 km/h in 13.0 seconds, with the standard electronic limit of 250 km/h, using the [original BMW launch figures](https://www.press.bmwgroup.com/global/article/detail/T0113556EN/the-new-bmw-m5?language=en). The optional 305 km/h M Driver’s Package is not enabled.

Completed gear changes produce a short, subtle camera vibration under acceleration, with a weaker impulse on braking downshifts. The effect settles in under half a second and preserves the orbit camera position and target. Pause and Restart clear it; reduced-motion preferences disable it.

Sound uses recorded V8 idle and acceleration layers, recorded rain and a tyre friction loop under hard braking. Engine pitch, layer balance and volume follow RPM, load, gear changes and camera distance. The engine idles at a stop or when driving is paused; Rain audio follows its checkbox independently of Night. Sound begins after the first click or keypress, with Sound and Volume controls in Settings, and mutes while the page is hidden. The recordings are an adaptation, not stock BMW F10 audio. See [sound credits](public/assets/audio/ATTRIBUTION.md).

Hard braking and strong lateral tyre scrub leave soft-edged deposits on dry asphalt, with much lighter traces in rain. Each trail follows wheel position, contact and load, with gaps over road obstacles and holes. Marks stay in world space and fade after 35–65 seconds; Restart clears them. One GPU-instanced draw uses a fixed buffer of 8,192 segments. Deposits are a visual effect driven by deceleration and axle slip angles; individual wheel spin and ABS cycling are not simulated.

Brake pressure builds to full effort over 0.4 seconds while S / Down is held and releases immediately on key-up. Short taps and low-speed stops leave clean asphalt. Braking deposits require at least 88% pedal effort, speed above 45 km/h and deceleration above 8.8 m/s² on dry asphalt (4.8 m/s² in rain, where grip and deposits are weaker); light braking while turning cannot bypass those thresholds.

Engine ratings, gear ratios, mass, drag and tyre dimensions follow [BMW technical data](https://www.ausmotive.com/downloads/BMW/M5-press-kit-Feb2012.pdf). Drivetrain losses, launch grip, clutch transitions and automatic shift strategy are simplified model assumptions calibrated to the launch figures for ideal dry conditions. The demo initially cruises at 30 km/h; after using the accelerator or brake, releasing the pedals lets it coast.

Light exhaust vapor exits all four tailpipes, rises and disperses in the car's wake, and increases under acceleration. Pause freezes the plume; Restart clears it.

Rain is independent of Night. It adds falling drops, road ripples, overcast lighting, shorter visibility and a wet reflective asphalt surface in either lighting mode.

The wet asphalt retains diffuse headlight illumination, with a varied water film and rougher aggregate between smoother patches. Its reflections remain directional without a uniform mirror-like coating. The small surface mask is fixed in world space and uploaded once; changing weather or recentering the road does not animate or rebuild it.

Falling rain and ripples use two GPU-instanced draws, with no per-drop CPU animation or per-frame particle-buffer uploads. Wiper shapes are fitted to the windshield once and interpolated during playback. Rendering starts within a four-million-pixel Retina budget and adjusts canvas resolution under sustained load, while keeping the interface sharp and retaining all particles and suspension updates.

Sky reflections refresh every eight seconds through a persistent capture cube and reusable filtered targets for the four weather combinations. The sky renders after opaque surfaces so its cloud shader avoids pixels covered by the car or road. Water and exhaust update only the body transforms they need. Tyre trails discard distant segments before evaluating the road profile and upload only changed slots in their fixed buffer.

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

Open http://127.0.0.1:52259/ in a browser. Keep the server running while using the viewer.

For another available port, use `npm start -- --port 0` and open the printed address.

## Controls

- Settings: open or collapse the controls at the top right.
- Sound / Volume: enable or mute audio and adjust its level.
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
- `public/instruments.js` and `interface.css`: animated F10-style instruments and the collapsible settings menu.
- `public/suspension-display.js`: live four-corner tyre load, spring and damper diagram.
- `public/shift-shake.js`: bounded camera impulses on completed gear changes.
- `public/vehicle-audio.js` and `public/assets/audio/`: RPM-driven recording playback and sound attribution.
- `public/skid-marks.js`: contact-aware, bounded instanced tyre trails under hard braking.
- `public/vehicle-rig.js`, `driving-physics.js`, `brake-lights.js` and `headlights.js`: wheel rig, driving and lights.
- `public/tyre-dynamics.js`: dry/wet axle grip, lateral motion and simplified DSC intervention.
- `public/headlight-profile.js`: the shared projected low-beam distribution.
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
