# Elevation

## Implemented for Rabat and Monaco

The game loads [Rabat.hgt](../public/data/elevation/Rabat.hgt) for Rabat and
[Monaco.hgt](../public/data/elevation/Monaco.hgt) for Monaco. Both are local HGT files. There are no runtime elevation API calls or new dependencies.
Other cities retain flat terrain until an elevation source is configured for them.

Both supplied files are 3601 x 3601 SRTM tiles, approximately 30 m source resolution.
Because it was renamed, its location is explicitly recorded as **N35E014**
(southwest corner 35 N, 14 E) in [cityManager](../src/utils/cityManager.ts).
That interpretation gives approximately 205.92 m AMSL at the configured Rabat
centre and agrees with the earlier public elevation sample. HGT contains no
embedded geographic header; change that configuration if the original tile
identifier differs.

[The NASA/USGS format guide](https://lpdaac.usgs.gov/documents/179/SRTM_User_Guide_V3.pdf)
defines signed 16-bit big-endian elevations, northernmost row first. The loader
supports 1201/3601 square tiles, handles -32768 NoData samples without creating
zero-height pits, and fails explicitly for unsupported files or large voids.
All scene Y values subtract the same city-centre reference altitude. The existing
X/Z conversion and compass are unchanged.

Monaco is configured as **N43E007** (southwest corner 43 N, 7 E).
That interpretation gives approximately 61 m at its configured centre. The same
terrain, scenery, collision, camera and slope-physics pipeline applies to Monaco.
Out-of-area road features in its source GeoJSON are omitted by the coverage filter.
Its stacked roads use the estimated road profiles described below.

## Terrain, scenery and contact

[ElevationTerrain](../src/core/scene/ElevationTerrain.ts) resamples the tile into
a roughly 20 m mesh grid. Resampling does not add detail beyond the source's
approximately 30 m resolution. The mesh is divided into small chunks for frustum
culling. Rendering and vehicle contact use the same triangle interpolation.

Road ribbons and lane markings are clipped at terrain cell boundaries and
diagonals before being raised by their small rendering clearance. This prevents
wide road triangles from slicing through a hillside. Marking UVs are interpolated
through clipping so dashed lines retain their pattern. Road labels and tunnel
linings also follow the new heights.

Buildings retain level roofs. Their foundations extend below the lowest sampled
footprint height, while roofs sit above the highest, preventing floating walls on
slopes. Building collision volumes use those same foundation/roof heights. Trees
and trunk collisions use the shared terrain sampler. Spawns, resets and saved
positions are re-seated on the closest road level using the saved height; an out-of-coverage saved location
falls back to a road near the selected city centre. The chase camera stays above
terrain outdoors and moves closer inside tunnels, while the driver's camera follows the car's pitch and bank.

## Separate road levels

[RoadProfiles](../src/core/scene/RoadProfiles.ts) uses OSM `bridge`, `tunnel`
(including `building_passage`) and numeric `layer` tags to classify roads.
Layer numbers express relative ordering, not surveyed metre heights. Shared
coordinates connect consecutive OSM ways into bridge/tunnel networks, so an
internal way boundary is not treated as another tunnel entrance.

Bridge decks are raised above terrain; tunnel floors interpolate between
connected entrances and descend below them. Crossings between different layers
receive estimated clearance, and shared bridge/tunnel exits are reconciled with
the grade limit. Ground approaches blend into those endpoints. The solver trades
local clearance against grade and connectivity, so these are plausible profiles,
not an engineering reconstruction of the real roads.

Road meshes, markings, slope gravity, car pitch, surface audio and spawns all use
the same profiles. Contact selects reachable surfaces by height, preventing an
overhead bridge from pulling the car off the road underneath. Bridge side barriers
and tunnel walls collide with the car. Scenery collisions are suppressed within
height-aware tunnel volumes so building foundations cannot block a tunnel.
[RoadCutouts](../src/core/scene/RoadCutouts.ts) cuts narrow openings in terrain at
portals and lowered approaches; retaining walls fill their sides. Terrain remains
over fully buried tunnel sections. Buildings themselves retain terrain-based
foundations rather than being lifted onto decks.

### Junctions, paint and tunnel clearance

[RoadCorridors](../src/core/scene/RoadCorridors.ts) builds spatially indexed,
sloped 3D volumes from all road profiles. Yellow edge ribbons are subtracted
where they lie inside another road at the same height (a narrow road-height
band rather than every projected overlap). Coincident outer edges use stable
way-ID ordering to retain one outline. Roads above/below keep their own paint.
This trims markings rather than rebuilding the road network or changing OSM.

Tunnel lining uses vertical sides and a full-width flat ceiling at configured
headroom. It has no transverse end caps. Other road corridors cut openings in
lining and approach/bridge barriers at matching heights, and matching collision
queries allow cars through those openings. Tunnel sides no longer extend to the
terrain surface; shallow portal terrain cutouts remain in place. Connected ways
still share their estimated floor elevations through the profile network.

Building wall/roof triangles are clipped only within tunnel volumes, preserving
interpolated facade, colour and texture attributes and retaining the building
above and beside a passage. Collision bypass uses those same tunnel volumes.
Other scenery meshes are not geometrically carved. Clipping is approximate at
2 metre corridor samples; missing connectivity or inaccurate OSM layer/height
tags may still require per-way overrides. Separate roads genuinely within the
paint height band are treated as one drivable overlap.

### Tuning estimates and correcting individual ways

Edit [road-levels.json](../public/data/roads/road-levels.json); reload the city to
apply changes. Global `defaults` can be overridden under `cities.rabat` or
`cities.monaco`. Distances/heights are metres:

- `layerSeparation`: baseline deck/crossing separation, initially 5.
- `tunnelCover`: desired ground cover above the tunnel roof, initially 2.
- `tunnelHeadroom`: default road-to-roof height, initially 3.5; numeric OSM
  `maxheight` values of at least 2 m take precedence.
- `rampLength`: minimum transition distance, initially 35.
- `maxGrade`: estimated structure slope limit as rise/run, initially 0.22 (22%).
- `deckThickness`: bridge underside thickness, initially 0.5.

Each city's `overrides` maps an OSM way ID (for example `way/120113156`) to
optional fields: `kind` (`ground`, `bridge`, `tunnel`), `heightOffset`,
`startHeight`, `endHeight`, `clearance`, and `headroom`.
`startHeight`/`endHeight` are absolute metres above sea level in GeoJSON coordinate
order; their corrections blend along the way. `heightOffset` is a relative shift.
Conflicting adjustments at a shared node are averaged to preserve continuity.
`clearance` increases the baseline separation for its connected structure;
`headroom` changes that way's roof height. Explicit height corrections run after
automatic grade constraints, so conflicting measurements can exceed that limit.
Use consistent values on adjoining ways.

## Slope physics

Mapped sea and inland water now mask the terrain within their boundaries;
see [WATER.md](./WATER.md) for data formats, surface heights and vehicle recovery.

The vehicle's fixed-step simulation projects gravity onto the contact plane.
Climbing consumes momentum; descending adds it even with no throttle. Acceleration
can overcome a climb, and releasing the brake on a sufficiently steep climb can
allow rollback. Rolling/engine resistance still applies, so an extremely gentle
descent does not guarantee acceleration. Brakes and the handbrake can hold the car
on a slope. Tire grip and existing collision response remain active. The car body
aligns with the terrain normal, smoothing pitch/bank changes across grid cells.

## Coverage limits

The bundled Rabat GeoJSON also includes northern Malta/Gozo geometry above 36 N,
outside this tile. That geometry is omitted rather than assigned invented heights.
The loader reports omitted feature counts when loading each city; these change
with the source GeoJSON. Driving is constrained
to the loaded terrain extent so the car cannot continue into an unrendered area.

An **N36E014** neighbouring tile and a multi-tile source configuration would be
needed to complete that northern area. The original HGT remains unchanged.

SRTM is coarse radar-derived surface data. It cannot resolve curbs, individual
ramps, bridge decks or tunnel floors reliably. The road profiles therefore use
configurable estimates rather than interpreting SRTM as deck/floor measurements.
Accurate reconstruction still needs surveyed heights or manual way overrides.
Connectivity is inferred from shared coordinates because the exported GeoJSON
does not preserve OSM node IDs; missing tags or disconnected endpoints can need
correction. Building passages use generic, full-width tunnel linings with matching
openings cut into intersecting building geometry; they are not architectural replicas.

## Higher-resolution options

- [Malta Planning Authority DTM 2018](https://data.europa.eu/data/datasets/d8d5aca3-b980-4f42-914e-f35f2c6e3a3f):
  1 m bare-earth terrain. A better candidate for detailed Malta scenery once a
  usable raster and redistribution terms are confirmed.
- [Open Topo Data SRTM](https://www.opentopodata.org/datasets/srtm/): useful for
  offline preparation or cross-checks; avoid querying it while driving.
- [Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM):
  alternative 30/90 m global surface data, with buildings/vegetation and attribution
  requirements to account for.

## Land clearance above water

Water levels are resolved before road profiles, scenery, collision heights and
spawns. The shared height field has a minimum of 0.15 metres above sea level and
is raised above nearby inland water levels along shorelines, including island
holes. An 80 metre sampling buffer covers the terrain triangles touching each
shore, keeping their interpolated land height above the rendered water plane.
Other terrain elevations are preserved; an elevated pond does not raise an entire
mountain/city to its level. Water footprints remain cut out of visible ground.

Maps without HGT use a 40 metre shared flat grid, raised uniformly above the
highest mapped shoreline level in coverage. Their outer backdrop uses the same
height. Roads, markings, trees, buildings and car contact use this corrected grid.
Bridge/tunnel profiles retain their own levels, including underwater tunnels.
No supplied HGT file is modified.

Inspections of Stockholm, Monaco and Rabat checked 1,212, 635 and 550 shoreline
samples respectively with no terrain below the corresponding water surface. All
five cities loaded with finite terrain heights and clean disposal.
