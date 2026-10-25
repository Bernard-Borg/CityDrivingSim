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

[VehiclePhysics](../src/core/vehicle/VehiclePhysics.ts) works in metres, seconds,
and radians. The simulator advances it at 120 Hz regardless of rendering FPS.
Long suspension gaps are discarded; catch-up work is capped after slow frames.
Yaw follows a bicycle model with full steering lock at low speed and a lateral-acceleration limit at higher speed. Normal tires carry velocity around a turn; the handbrake releases lateral grip for deliberate sliding. Service braking responds immediately and takes priority over throttle. Road surfaces affect braking and lateral grip. Forward power tapers toward
200 km/h (250 with boost); reverse is limited to 35 km/h. The HUD converts speed
to km/h. Opposite throttle slows the vehicle before reversing it.

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
Road noise follows surface and speed; filtered tire-friction noise follows substantial lateral slip on pavement; impacts
produce short synthesized thumps. Browser audio permission may require a driving
keypress. City switches save the outgoing position and dispose input listeners,
audio contexts, geometries, materials, textures, shadows, and the old canvas.

The compass and geographic orientation are unchanged by this overhaul.

## Elevation

See [Elevation](ELEVATION.md) for the Rabat/Monaco implementation, tile coverage and source limitations.
