# Natural scenery and street furniture

The scene loader reads optional GeoJSON FeatureCollections with the same city
filename as the roads:

- [natural/](../public/data/natural/) contains trees, tree rows, beaches, parks,
  gardens, shrubbery, bare rock, scree, and water/coastlines.
- [decor/](../public/data/decor/) contains street furniture and barriers.

Export queries: [natural](../public/data/natural/osm_query.txt) and
[decor](../public/data/decor/osm_query.txt). Keep OSM attribution in exports.
Missing files are harmless. Tree loading now uses natural rather than trees;
only natural=tree points produce individual trees. Tree rows add trees roughly
every 8 metres, suppressing duplicates in the same 4 metre placement cell.

## Ground cover

[NaturalGenerator](../src/core/scene/NaturalGenerator.ts) triangulates Polygon
footprints and holes, then clips them to the same terrain grid triangles used by
vehicle contact. Beaches are sand-coloured, parks/gardens green, and bare rock
and scree grey/brown. World-space procedural grain varies their surfaces without
texture downloads. The default ground is muted earth, distinguishing vegetation
from undeveloped areas. Layers sit below road ribbons and retain water and tunnel
portal cutouts. Garden/park layering uses separate small height offsets.

Only polygons intersecting the loaded terrain render. Features outside elevation
coverage are clipped; missing beaches beyond the map boundary are intentional.
No satellite imagery, inferred vegetation coverage, or detailed cliff meshes are
introduced. SRTM remains the ground elevation source, so narrow beaches can still
follow an imperfect coastal height estimate. Ground-cover colour does not change
vehicle grip or replace the existing road contact model.

## Decor

[DecorGenerator](../src/core/scene/DecorGenerator.ts) generates:

- Benches, waste/recycling/grit bins, post boxes, drinking-water taps, hydrants,
  cabinets, telephone/parking-meter blocks, and bicycle stands.
- Bus-stop, traffic, information, advertising, and clock sign panels; shelters.
- Street lamps, surveillance-camera poles, utility/power poles and towers,
  masts, and flagpoles.
- Fountain basins and simple jets, memorial plinths, and abstract artwork.
- Walls, retaining walls, hedges, fences, chains, guardrails, kerbs, platform
  paving, embankment/cutting edges, bollards, blocks, gates, and barriers.
- Individual shrubs from natural data.

These are generic geometric representations, not replicas of individual landmarks.
Bus-stop signs show a bus pictogram, mapped name (or English/local reference fallback),
and stop reference when supplied. Names wrap to two lines. Both sides have readable
lettering. Sign artwork is cached per name/reference, hidden beyond 110 metres, and
released on city changes. Bus platforms tagged bus=yes also receive signs. Other
sign text and clock faces are not reproduced. Gate booms are upright with posts
beside the mapped opening; no unknown access state is interpreted as a closed road.
Kerbs/platforms are visual paving; substantial obstacles participate in scenery
collisions. Fences/chains use simplified solid collision strips. Long barriers
are split into terrain-following segments. OSM height/width and numeric direction
are respected within reasonable bounds. Furniture uses terrain height or the road
surface under its mapped position; layer tags guide road-level selection. Terrain
and estimated road levels cannot determine every retaining wall's actual height.

Primitives share geometry/materials and are instanced in 200 metre spatial cells
for frustum culling. Lamps have visible fixtures without per-lamp dynamic lights.
City changes and disposal release generated meshes and instance resources.

## Verification

Use the production build for TypeScript/bundling checks. One-off in-memory scene
inspection can check all city loads, finite geometry/instance matrices, and cleanup
without adding test files or test infrastructure to the game. Visual review in a
browser is still useful for placement and local OSM/SRTM inaccuracies.


## Stadium buildings

Polygons tagged `building=stadium` or `leisure=stadium` in the buildings dataset
use an open bowl with eight stepped spectator tiers, concrete bands, a green
playing field and basic white pitch markings. The mapped outline determines the
stand shape and orientation, while `height` controls the stand height (12 m by
default). Collisions follow the stand rings, leaving the playing field open.
These are generic stadiums, not reproductions of individual venues.
