# Driving simulation

Run with Node.js 24 or newer:

```sh
npm install
npm run dev
npm run build
```

`npm run typecheck` runs the Vue/TypeScript checks without creating a bundle.

## Handling

- W / Up: accelerate forward; brake first when reversing.
- S / Down: brake while moving forward, then reverse once stopped.
- A/D or arrow left/right: steering, with reduced steering authority at speed.
- Space or E (hold): the same assisted emergency handbrake, with full lateral grip
  and 30 m/s? nominal deceleration (scaled by surface grip), including sideways motion. Holding both
  keeps it active until both are released.
- Shift: boost while accelerating forward. An empty boost tank must be released
  before activating it again. It recharges when boost is inactive.
- V: toggle between third-person chase and first-person driver-seat cameras.
- Mouse drag: orbit in third person; horizontal look up to 80 degrees either side
  in first person, with no vertical look. Entering first person recentres the view.
- Mouse wheel: zoom the third-person camera; ignored in first person.
- I or the HUD power button: switch the engine off/on. Switching off stops the car
  and sets a parking lock that holds on slopes. Starting plays the ignition sound
  and retains the lock until the configured start duration finishes. Space/E remain
  the separate driving handbrake.
- Help icon or ?: open the controls modal. Driving pauses, input clears, and
  focus stays in the modal until it is closed with Escape or its close button.
- F3 or the graph icon: toggle the optional performance panel.

[VehiclePhysics](../src/core/vehicle/VehiclePhysics.ts) works in metres, seconds,
and radians. The simulator advances it at 120 Hz regardless of rendering FPS.
Long suspension gaps are discarded; catch-up work is capped after slow frames.
Handling blends a kinematic parking/reverse model into a dynamic front/rear-axle
model between 3 and 7 m/s. Tyre slip angles generate bounded forces; vehicle mass
and yaw inertia determine how momentum and heading respond. Steering no longer
rotates world velocity directly at driving speeds. The keyboard steering envelope
uses available grip rather than stacking arbitrary speed attenuation on full lock.
Steering reversals respond faster than initial steering input.

Front/rear weight distribution and longitudinal load transfer affect tyre capacity.
A combined-force budget reduces acceleration in hard corners; braking reserves
some steering capacity and traction control avoids deliberately breaking rear grip.
There is no drift mode or handbrake grip reduction. Both brakes cut throttle and
act immediately. The default is an assisted sport-car tune for the game's scaled
car, not surveyed NSX tyre/suspension measurements. Full-lock bends at highway
speed still require slowing down; steering cannot bypass available tyre force.
Forward power tapers toward
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
Small terrain pitch/bank changes do not swing its whole offset.
A separate visual body group adds restrained, smoothed acceleration/braking pitch
and cornering roll. This is not added to either camera mount or road contact pose.
Visible front wheels follow the physics steering angle rather than raw keyboard lock. Teleports, pause and visibility
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
Continuous speed-dependent road/wind noise and the engine's filtered white-noise
texture are removed, including their loop sources and noise-gain nodes. The engine
keeps its tonal harmonics; ignition and crash effects remain one-shot buffers.
Collisions use
a broadband crush transient, a low filtered body thump and irregular debris/panel
rattles, with short damped metallic detail. Higher impact speeds increase loudness
and slightly lower pitch; a 0.4 second cooldown avoids repeated crash chatter
while resting against an obstacle. Collision response removes inward velocity
without restitution, dissipates tangential energy through contact friction, and
clears stored yaw rate on contact. Positional overlap correction never adds velocity.
Starter audio combines a short mechanical key transient,
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

### Loading diagnostics

[LoadingScreen.vue](../src/parts/LoadingScreen.vue) reads shared progress from
[the loading store](../src/stores/loading.ts). It shows the active stage, road
counts during mesh generation, total elapsed time, and the five most recently
completed stages with durations. A complete timing table is printed to the
browser console on completion or failure. Each city load/retry resets the history.

Stages distinguish road download/parsing, elevation, road-profile solving,
corridor preparation, road/marking generation, scenery download, water, terrain,
parks, trees, street furniture, buildings/tunnel openings, spawn, vehicle assets,
controls/audio and first rendering. Timings are wall-clock diagnostics, including
brief browser paint yields; they are not GPU benchmarks or estimated progress
percentages. Heavy synchronous work can pause the elapsed-time display; the
stage is painted before that work begins so its name identifies the active task.
There is no worker/off-thread generation change in this update.

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

### Handling parameters

The default handling tune is in [VehicleConfig.ts](../src/core/vehicle/VehicleConfig.ts):

- `mass` (kg), `yawInertia` (kg m?), `frontWeight` (static front load fraction),
  `centreOfMassHeight` and `wheelbase` (metres) set mass and load-transfer response.
- `frontCornerStiffness` / `rearCornerStiffness` (N/radian) balance turn-in and rear
  stability; these are game tuning values matched to the scaled model.
- `cornerGrip` is the nominal lateral acceleration budget (m/s?); road grip scales
  that budget. `steeringAssist` scales the useful high-speed steering envelope,
  `maxSteeringAngle` is low-speed lock, and `yawDamping` smooths heading response.
- `brakeBias` allocates braking between axles. Service/handbrake deceleration,
  engine power, resistance and boost remain separately configurable.
- `controls.steerRise` and `steerReturn` set keyboard filtering. The return rate
  also applies when reversing steering direction.
- `bodyMotion` controls visual roll/pitch gains (radians per m/s?) and response.
  Those values do not move the camera or change collisions.

One-off numerical inspections of the current default tune gave approximately
1.88 seconds / 26.2 metres for straight 100?0 km/h braking on full-grip flat road,
for the service brake, including when throttle was held. The stronger assisted
handbrake now stops from 100 km/h in about 0.93 seconds / 12.8 metres on full-grip
flat ground; its whole-velocity deceleration is deliberately stronger than the
ordinary axle-force budget. Fixed-step trajectories matched at 30, 60 and
144 rendered frames per second. Repeated slalom/braking runs on asphalt,
cobblestone and loose-ground grip remained finite, and collision resolution
added no speed in repeated wall impacts. These checks do not replace a browser
drive to judge steering feel or listening to the audio. No test files were added.

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
