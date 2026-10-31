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

## Terrain and water elevations

Water generation does not raise or flatten the shared terrain height field.
HGT and GeoTIFF elevations remain as sampled, and maps without elevation retain
their flat grid. Water surfaces retain their independently resolved elevations;
visible terrain is clipped within water footprints and shoreline gaps use bank
faces. The former global sea-level clamp and 80 m shoreline minimum-height buffer
were removed because elevated fountains and ponds created artificial circular
plateaus across lower surrounding terrain. Roads, scenery and vehicle contact
use the unraised terrain. Bridge and tunnel profiles keep their own levels.

## GeoTIFF elevation sources

HGT and GeoTIFF now implement `ElevationSampler`: `covers(lat, lon)`,
`sample(lat, lon)` (absolute elevation in source-datum metres), and `getBounds()`
(WGS84 geographic bounds). `ElevationTerrain` remains the shared triangulated
surface for rendering, scenery placement and vehicle contact.

Existing HGT configurations need no changes. Their decoding, bilinear interpolation,
NoData search, coverage clipping and default 20 m terrain spacing are unchanged.

Monaco now uses this configuration in `src/stores/cities.ts`:

```ts
elevation: {
    format: "geotiff",
    file: "Monaco.tiff",
    crs: "EPSG:2154",
    meshSpacing: 2,
    fallback: { file: "Monaco.hgt", south: 43, west: 7 },
}
```

The TIFF loader supports single-band, north-up GeoTIFFs in WGS84 (EPSG:4326),
Lambert-93 (EPSG:2154), or WGS 84 / UTM zone 33N (EPSG:32633), with
compressed formats decoded by geotiff.js. EPSG:32633 is used by Rabat's
projected elevation raster.
An explicit `crs` handles exports whose EPSG identifier is embedded only in a
citation rather than a standard GeoKey. Rotated rasters and RGB images are rejected.
Pixel-is-area and pixel-is-point alignment are respected. Valid neighbouring
samples are bilinearly interpolated; NoData never becomes a deep negative pit.
When all interpolation samples are missing, the explicitly configured fallback
is sampled. Without one, missing coverage raises a descriptive error.

The current 1 m choice limits transfer and decoded-memory
cost: approximately 192 MB rather than 768 MB for these uncompressed files.
HTTP range requests are grouped into 1 MB blocks with a bounded cache; decoding
uses 256-row batches to avoid an additional full-size raster allocation. This is
not terrain streaming: the entire first elevation band is still transferred and
retained. The hosting server must support HTTP byte-range responses. Offline
compression/tiling and selective loading remain future performance improvements.

`meshSpacing` is independent of source pixel spacing. Monaco now uses a 2 m
terrain grid, sampling the 1 m TIFF at half the resolution along each axis. The minimum permitted spacing is
1 m. Compared with the previous 10 m setting, the same area has approximately
25 times as many terrain cells, increasing generation, clipping and rendering
cost. HGT cities retain their original grid by omitting this option. Selecting
the 50 cm TIFF does not automatically change the mesh to 50 cm. This change does
not add cliff overhangs or stacked terrain.

No automatic vertical-datum adjustment is applied between TIFF and fallback.
Use matching datums where possible; discrepancies can produce transitions near
missing-data boundaries. Water generation does not raise terrain to match water levels. Switching elevation sources also changes the local reference height,
so previously saved local vehicle elevations may need repositioning.

Validation covered actual Monaco TIFF HTTP decoding, all 13,798 road-coordinate
entries, HGT fallback outside the raster, unchanged 20 m HGT mesh spacing, and
synthetic 1 m/50 cm pixel alignment and NoData interpolation. Production build
passes. Full visual inspection of Monaco has not yet been performed.


## Forcing fallback terrain

Settings ? Terrain ? **Use fallback terrain** persists a global preference in
Pinia/local storage. Enabling it loads a GeoTIFF city's explicitly configured
HGT fallback directly, without downloading or decoding the TIFF. Disabling it
restores the configured detailed source and its mesh spacing. HGT-only cities,
flat cities and GeoTIFF cities without a configured fallback keep their normal
source. Changing the preference reloads the active map, preserving latitude and
longitude but resolving vehicle height against the newly selected terrain.


## Quantized elevation sources

The supplied Rabat TIFF is an unsigned 8-bit raster with whole-number elevations
and no fractional scale/offset metadata. Its 1 m pixel spacing describes horizontal
sampling, not vertical precision; it forms terraces with 1 m jumps. Rabat enables
`smoothingPasses: 2` to soften these steps in the shared terrain height grid before
roads, scenery and vehicle contact are prepared. It uses a separable [1, 2, 1]
filter, bounded to 0?4 passes. The default is zero, preserving existing HGT and
other source sampling. Radius depends on mesh spacing; two passes soften over a
few grid cells. This modifies the reconstructed surface and can soften real sharp
edges; it does not restore lost survey precision. Prefer a Float32 elevation export
with fractional-metre values when the source offers one.

Terrain lighting interpolates the original sampled normal field after clipping,
rather than assigning each disconnected triangle its own face normal. This changes
shading only: positions, cutouts and collision heights still match the shared grid.
No extra terrain subdivision is introduced.


## Ground colour and snow

Each city can set `groundColor` to a CSS colour in `CITY_CONFIGS`, for example
`groundColor: "#95866b"`. Omitted values retain the existing `#a49b80` base.
Terrain and natural ground cover blend to white between 2,490 and 2,500 metres
above sea level, overriding their base colours at 2,500 m and above. This is
material shading only: it adds no terrain vertices and does not change grip.
