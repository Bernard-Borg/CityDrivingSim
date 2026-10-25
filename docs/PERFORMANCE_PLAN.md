# Performance improvement plan

Status: investigation and plan only. No performance optimizations from this plan
have been implemented. Tunnel and junction corrections are separate functional fixes.

## Current evidence

The current scene was loaded and inspected in Node with the supplied exports.
Counts below describe all allocated scene meshes, including offscreen objects
and distance-hidden sign faces, excluding the car model loaded by the simulator.
Triangles include instanced primitive multiplicity. Material/map counts cover
meshes only, not street-name sprites. These are not measured per-frame draw calls,
GPU timings, or browser FPS. Dataset changes will change these numbers.

| City | Meshes | Total triangles | Unique mesh materials | Mesh map textures |
| --- | ---: | ---: | ---: | ---: |
| Monaco | 6,542 | 811,206 | 1,968 | 508 |
| Rabat | 4,484 | 1,291,158 | 1,502 | 204 |
| Balzan | 428 | 42,316 | 275 | 18 |

Monaco has 847 individual tree groups (two meshes each), 2,525 road-group
children, 154 tunnel-group meshes and 526 spatial building batches. Buildings
already share facade/roof materials and decor already uses spatial instancing.
There is no reason to replace those systems wholesale without profiling.

## 1. Establish a browser baseline

Use a production build on the same device, viewport, pixel ratio and city data.
Record a repeatable Monaco route covering the centre, shoreline, tunnel junctions,
bridges and a dense building area, then a Rabat route with vegetation and hills.
Include first/third person and city-switch cycles. Capture:

- Frame-time median and 95th/99th percentiles, CPU frame work and main-thread traces.
- Renderer calls/triangles, visible meshes, geometry/texture counts and memory.
- Cold/warm load duration, data download/parse, elevation processing, profile solving,
  corridor clipping, building generation and GPU upload separately.
- GPU timing when available; the current CPU metric includes renderer submission
  but does not measure asynchronous GPU completion. Keep HUD performance collection
  on/off comparisons because its two scene traversals run at 10 Hz.

Choose a target device and a 60 FPS / 16.7 ms frame budget there before promising
an FPS improvement. Preserve the same saved locations/camera poses for comparisons.

## 2. Share road materials and dash textures (first implementation candidate)

[RoadGenerator](../src/core/scene/RoadGenerator.ts) defines shared yellow/white
materials but edge ribbons still allocate their own materials. Lane dividers
also create a fresh canvas texture/material for a repeated dash pattern.

Reuse the existing shared edge material and one dash texture/material for
compatible roads. Keep disposal ownership explicit so removing one road does not
invalidate all others. Verify identical paint colour, dashed scale, transparency,
tunnel height and junction clipping. Success: substantially fewer material/map
allocations and no city-switch resource growth. This alone does not merge draw calls.

## 3. Instance trees by spatial cell

[TreeGenerator](../src/core/scene/TreeGenerator.ts) currently creates two unique
geometries per tree. Use shared trunk/canopy primitives with per-instance transforms
and seeded variety, grouped in roughly 100?200 metre cells for useful culling.
Keep mapped positions, terrain seating and trunk collision footprints unchanged.
Add distance simplification only if profiling still shows tree geometry cost.
Success: replace Monaco's 1,694 tree meshes with a small number of visible spatial
batches, without turning the entire city's vegetation into one uncullable mesh.

## 4. Spatially batch road rendering

After material sharing, merge road/edge/divider geometry by material and spatial
cell. Keep tunnel lining separate from aboveground road batches. Retain profile
and collision indices as independent data; batching must not change vehicle contact.
[RoadCorridors](../src/core/scene/RoadCorridors.ts) clipping runs before batching,
so openings and paint remain correct. Preserve UVs and map labels separately.
Success: lower measured visible draw calls without a significant triangle increase
or loss of culling. Avoid a single city-wide mesh. Prioritize this only if browser
traces show render submission cost, rather than fragment shading, dominates.

## 5. Profile shadows, labels and pixel cost

[DrivingSimulator](../src/core/DrivingSimulator.ts) enables soft shadow maps and
caps device pixel ratio at 2. Compare shadow-off and lower-resolution runs to
separate GPU pixel/shadow pressure from CPU draw-call pressure. Propose explicit
quality settings only after measuring. Investigate restricting distant small
objects' shadow casting; retain nearby car/building shadows and correct tunnel
occlusion. Do not freeze moving-car shadows while caching static scenery.

Road-name sprites and bus-stop artwork allocate many textures. Consider a shared
label atlas and distance/frustum selection, respecting readable stop names,
Unicode and two-sided physical signs. Bus-stop signs already have a 110 metre
LOD. Measure active labels before adding another visibility layer.

## 6. Loading and repeated CPU work

Only if profiles identify this bottleneck, cache derived per-city geometry keyed
by source data, elevation, city settings and generation version; move preparation
to a worker using transferable buffers. Invalidate caches when any input changes.
First investigate corridor clipping of large building batches: broad-phase filters,
per-building candidates and scratch-buffer allocation could lower load work.

Road contact is queried multiple times per 120 Hz physics tick. Profile those calls
before introducing reuse; collision correction can change X/Z, so cached contact
must never be reused after a body moves. Keep camera/audio contact separate when
their positions differ. HUD callback throttling and reducing temporary vectors are
later candidates if traces show garbage-collection or reactive update pressure.

## Delivery order and acceptance

Baseline first; material sharing, tree instancing and road batching are separate
reviewable changes. Re-measure after each and skip later work if the target budget
is met. Shadow/label and loading changes depend on the measured bottleneck.

Use the production build and one-off scene inspections rather than adding tests
or test infrastructure. Browser drives must preserve roads/paint at different
levels, joined tunnel clearance, building openings, water, terrain contact, camera
behaviour and readable bus-stop signs. Compare allocation counts over repeated city
switches and report observed results rather than estimated FPS gains.

## Resolved Stockholm terrain-loading stall

Stockholm currently has no elevation source configured. Its flat ground previously
used two triangles covering 50 by 50 kilometres. Subtracting all tunnel/water
openings from those triangles gathered millions of spatial cells and repeatedly
fragmented city-wide polygons. This was a loading scalability defect.

Flat maps now use 400 metre patches subdivided into triangles spanning at most
40 metres per axis around the exported road bounds plus 600 metres. Water clipping
uses that same mapped extent. Four uncut outer rectangles preserve the distant
backdrop without processing openings beyond map coverage. Elevation-backed ground
continues to use its existing height grid and chunking.

A Node scene inspection with the complete Stockholm exports completed the terrain
stage in 0.42 seconds (327 ground patches), with finite terrain positions and clean
disposal. Road/marking generation took 6.12 seconds and building generation 1.87
seconds in that run. These local wall-clock figures exclude browser GPU uploads,
shader compilation and actual rendering; they are not browser load-time guarantees.
The broader optimization candidates above remain proposals.
