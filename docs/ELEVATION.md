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
Its stacked roads, bridges and tunnels remain subject to the SRTM limitations below.

## Terrain, scenery and contact

[ElevationTerrain](../src/core/scene/ElevationTerrain.ts) resamples the tile into
a roughly 20 m mesh grid. Resampling does not add detail beyond the source's
approximately 30 m resolution. The mesh is divided into small chunks for frustum
culling. Rendering and vehicle contact use the same triangle interpolation.

Road ribbons and lane markings are clipped at terrain cell boundaries and
diagonals before being raised by their small rendering clearance. This prevents
wide road triangles from slicing through a hillside. Marking UVs are interpolated
through clipping so dashed lines retain their pattern. Road labels and tunnel
arches also follow the new heights.

Buildings retain level roofs. Their foundations extend below the lowest sampled
footprint height, while roofs sit above the highest, preventing floating walls on
slopes. Building collision volumes use those same foundation/roof heights. Trees
and trunk collisions use the shared terrain sampler. Spawns, resets and saved
positions are re-seated on current terrain; an out-of-coverage saved location
falls back to a road near the selected city centre. The chase camera stays above
terrain, and the driver's camera follows the car's pitch and bank.

## Slope physics

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
With the current data, 302 road features, 80 trees and 3685 building features are
outside the available coverage. The resulting scene contains 587 road features,
35 trees and 1894 buildings, plus a 445 x 377 terrain grid. Driving is constrained
to the loaded terrain extent so the car cannot continue into an unrendered area.

An **N36E014** neighbouring tile and a multi-tile source configuration would be
needed to complete that northern area. The original HGT remains unchanged.

SRTM is coarse radar-derived surface data. It cannot resolve curbs, individual
ramps, bridge decks or tunnel floors reliably. Current bridge/tunnel roads use a
terrain-conforming approximation; OSM layer tags are not converted into guessed
metres. Accurately stacked road levels require separate road profiles, terrain
cuts at tunnel portals and bridge endpoint constraints.

## Higher-resolution options

- [Malta Planning Authority DTM 2018](https://data.europa.eu/data/datasets/d8d5aca3-b980-4f42-914e-f35f2c6e3a3f):
  1 m bare-earth terrain. A better candidate for detailed Malta scenery once a
  usable raster and redistribution terms are confirmed.
- [Open Topo Data SRTM](https://www.opentopodata.org/datasets/srtm/): useful for
  offline preparation or cross-checks; avoid querying it while driving.
- [Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM):
  alternative 30/90 m global surface data, with buildings/vegetation and attribution
  requirements to account for.
