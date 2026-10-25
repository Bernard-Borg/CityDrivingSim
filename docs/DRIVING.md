# Driving simulation

Run with Node.js 24 or newer:

```sh
npm install
npm run dev
npm run build
```

`npm run typecheck` runs the Vue/TypeScript checks without creating a bundle.

## Handling

- W/S or arrow up/down: forward/reverse throttle.
- A/D or arrow left/right: steering, with reduced steering authority at speed.
- Space: service brake; E: handbrake with reduced lateral grip.
- Shift: boost while accelerating forward. An empty boost tank must be released
  before activating it again. It recharges when boost is inactive.
- V: toggle between third-person chase and first-person driver-seat cameras.
- Mouse drag: orbit in third person; horizontal look up to 80 degrees either side
  in first person, with no vertical look. Entering first person recentres the view.
- Mouse wheel: zoom the third-person camera; ignored in first person.
- I or the HUD power button: switch the engine off/on. Switching off stops the car
  and sets a parking lock that holds on slopes. Starting plays the ignition sound
  and retains the lock until the configured start duration finishes. E remains
  the separate driving handbrake for drifting.
- Help icon or ?: open the controls modal. Driving pauses, input clears, and
  focus stays in the modal until it is closed with Escape or its close button.
- F3 or the graph icon: toggle the optional performance panel.

[VehiclePhysics](../src/core/vehicle/VehiclePhysics.ts) works in metres, seconds,
and radians. The simulator advances it at 120 Hz regardless of rendering FPS.
Long suspension gaps are discarded; catch-up work is capped after slow frames.
Yaw follows a bicycle model with full steering lock at low speed and a lateral-acceleration limit at higher speed. The handbrake progressively locks the rear axle and reduces lateral tire force. Body rotation preserves world momentum, allowing controllable sideways slides rather than rotating the velocity with the car. Countersteering and a soft slip-angle alignment force resist spins. Releasing E restores grip progressively rather than snapping the velocity back into line. Service braking responds immediately and takes priority over throttle. Road surfaces affect braking and lateral grip. Forward power tapers toward
200 km/h (250 with boost); reverse is limited to 35 km/h. The HUD converts speed
to signed km/h: reversing or rolling backwards displays a minus. Opposite throttle
slows the vehicle before reversing it. The listed figures describe the default
vehicle; other configurations can supply different stats.

Physics snapshots are interpolated for each render frame. Both the model and
driver-seat camera use that same interpolated pose; camera targets are computed
directly from it without relying on scene-matrix updates. The chase camera
uses a yaw-only orbit anchored to the current rendered car, with vertical camera
smoothing only. Horizontal tracking and aiming do not lag behind the car, so
camera distance cannot increase with speed and orbiting keeps the car in view.
Small terrain pitch/bank changes do not swing its whole offset. Teleports, pause and visibility
changes reset interpolation. Ground/tunnel camera clearance remains enforced.

## Collisions and road contact

[CollisionWorld](../src/core/scene/CollisionWorld.ts) indexes building footprints,
courtyard holes, tree trunks, and tunnel sidewalls in a spatial grid. Three
overlapping circles approximate the car body. Small simulation steps prevent
high-speed tunneling at the supported speeds; contact correction removes inward
velocity and preserves tangential movement for wall sliding. This is an arcade
collision model, without deformable bodywork, rollover, or a full rigid-body
suspension system.

Road queries use an indexed set of sampled segments for surface detection. Rabat and Monaco
load their supplied SRTM height fields: terrain triangles, draped roads, scenery,
collision heights, camera clearance and vehicle contact share its elevations.
The car pitches/banks with the road, slows on climbs and can gain speed while
coasting downhill. Cities without configured elevation remain flat. Ground and
roads retain separate depth biases. Spawn/reset positions use a road near the
selected city centre and resolve footprint overlaps.

## Loading, audio, and lifecycle

City selection waits for both scene data and the car model. Required road or
model failures show Retry and Choose city actions; optional tree/building data
may be absent. Map requests have timeouts. Input resets on focus loss or page
visibility changes. Audio cannot block throttle, and mute has no physics effect.

Procedural engine audio follows throttle and approximate automatic gearing.
Road noise follows surface and speed. Drift/tire-squeal audio is intentionally
removed, including its audio nodes and buffers. Collisions layer a body thud,
short metallic resonance and a noise transient, scaled by impact speed with a
retrigger cooldown. Starter audio combines a short mechanical key transient,
starter motor/compression pulses and a textured combustion catch, without the
previous sustained rev-up tone.
Generated buffers are normalized below clipping. Browser audio permission may require a driving
keypress. City switches save the outgoing position and dispose input listeners,
audio contexts, geometries, materials, textures, shadows, and the old canvas.

The compass is a backed heading strip with coordinates beneath it. Its display
uses the original needle convention (inverse simulation yaw): from north, a left
turn displays northwest and a right turn displays northeast. The world and
geographic conversions remain unchanged. The instrument
cluster includes speed, gear, RPM, engine/parking state and boost reserve; RPM
continues to work when audio is muted. Existing settings retain their behaviour.

## Vehicle configuration

[VehicleConfig.ts](../src/core/vehicle/VehicleConfig.ts) defines the typed vehicle
registry and the default vehicle. Configurations control model path and
scale, wheel radius, cabin eye point, speed/acceleration/braking/steering/grip,
boost, collision dimensions, input response, camera smoothing, engine RPM/gears,
audio volumes and ignition duration. Speeds are km/h, distances metres,
acceleration/deceleration metres/second squared, angles radians and times seconds.
The three-circle collision shape uses a circle radius and the front/rear circle
centre offset (`halfLength`). Model eye coordinates are fractions of scaled bounds.

To add another car, copy `DEFAULT_VEHICLE` into a new registry entry, replace the
model/stats and pass that configuration as the second argument to
`new DrivingSimulator(container, config)`. Nested objects must be copied when
overriding individual fields. There is currently one vehicle and no selection UI.
Alternate GLTF models need compatible wheel node names for wheel animation;
camera placement and collision dimensions are configured separately.

Drift tuning includes `driftLateralGrip` (lateral acceleration during rear lock),
`gripRecoveryRate` (per-second response after release), `maxDriftAngle` (radians,
soft alignment threshold), and `driftStability` (alignment strength).

## HUD components

[Overlay.vue](../src/parts/Overlay.vue) coordinates events and shortcuts. Focused
components in [hud/](../src/parts/hud/) own their markup and styles:
`VehicleInstruments` (the preserved speedometer and other instruments),
`NavigationCompass`, `HudActions`, `ControlsHelp`, `PerformancePanel`, and
`HudIcon`. Settings keep their existing behaviour, with larger labels and icons
for audio and city switching.

## Performance panel

Diagnostics are off by default. Enabling them samples the peak frame interval and
CPU submission time every 100 ms and retains a timestamped 12-second history.
The panel also shows current draw calls, rendered triangles, camera-frustum mesh
count, total scene meshes and Three.js geometry/texture counts. Scene meshes include objects culled
from the current view; draw calls/triangles describe rendering. CPU times exclude
GPU execution and are not GPU timing measurements. Sampling and scene counting
stop when the panel is disabled. The panel replaces the FPS badge in its top-right
position and includes FPS. Closing it restores the simple badge. The compact HUD
labels omit these explanatory details; the timing and count definitions live here.

## Elevation

See [Elevation](ELEVATION.md) for the Rabat/Monaco implementation, tile coverage and source limitations.
