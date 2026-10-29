# Water

Water is loaded exclusively from `public/data/natural/<city-file>.json`.
Cities without natural water/coastline features continue to load without water.
The legacy water folder is not read. There are no runtime OSM queries,
additional packages, or downloaded textures.

## Supported geometry

- Directed `natural=coastline` LineStrings are joined by matching endpoints,
  clipped to the terrain extent, and closed along the map boundary on the sea
  side. OSM coastline direction is preserved. An export must extend beyond the
  loaded map bounds at both ends of each open shoreline; incomplete interior
  endpoints are reported and omitted rather than inventing a coastline.
- Closed coastlines, including ones exported as Polygons, preserve land islands.
- `natural=water` Polygons and MultiPolygons preserve their inner rings. This
  includes ponds, reservoirs, basins, lakes, and bays in the supplied export.

The current Monaco data produces two coastal sea polygons and 28 additional
water areas intersecting the map. Source features extending beyond the map are
clipped, rather than discarded wholesale.

## Heights and rendering

Sea and `water=bay` surfaces are at 0 m above sea level, converted to the same
city-relative Y coordinates as roads and terrain. Inland surfaces use numeric
OSM `ele` when supplied, otherwise the median terrain elevation along their
outer boundary. This fallback is an estimate; add a measured `ele` in metres
above sea level to the feature properties to correct it.

[WaterGenerator](../src/core/scene/WaterGenerator.ts) triangulates these areas
with their holes, preserves source terrain elevations, removes covered terrain using the shared polygon clipping
utility, and seals shoreline gaps with simple bank faces. Water has subtle
animated colour ripples with a shared material. The shoreline stays fixed;
there is no bathymetry or wave displacement. Coarse SRTM and newer coastal
reclamation can still differ from the mapped shoreline.

## Vehicle contact

Entering a water footprint outside a supported road resets the car to its
normal city spawn and clears motion/input. An enclosed tunnel or a reachable
road surface above the water remains drivable, including bridge crossings.
Saved locations in open water fall back to the city spawn when loading.

## Exporting another city

Use [Overpass Turbo](https://overpass-turbo.eu/) and the query in
[natural/osm_query.txt](../public/data/natural/osm_query.txt). Select an area larger than
the entire terrain extent, including connected coastline beyond its edges.
Export **GeoJSON** into `public/data/natural/` with the same filename as that
city's road data. Native Overpass JSON is not the same format. Keep the OSM
copyright/ODbL attribution from the export.

## Stockholm coastline coverage

The original Stockholm natural export contained 53 coastline features with open
chains ending inside the loaded map. These could not be closed without inventing
shoreline across land, so the generator skipped the incomplete chains.

On 2026-10-26 the coastline subset was refreshed from the OpenStreetMap
[Overpass API](https://overpass-api.de/api/interpreter), requesting coastline ways
in `(59.27,17.98,59.39,18.18)` with full geometry. It now has 136 coastline features;
all non-coastline features and the original OSM attribution are preserved. This
provides complete surrounding context rather than guessing connections between
nearby shoreline endpoints. In the current loaded bounds it produces three
coastal water polygons without incomplete-chain warnings. Directional checks on
1,711 in-bounds shoreline segments found water on the expected sea side.

The [natural export query](../public/data/natural/osm_query.txt) now also requests
coastline ways within 3 km of the selected coastline set. Export a map region that
includes the entire drivable area; a buffer cannot repair disconnected or invalid
source mapping. Inland lake/river polygons and their island holes remain separate
from sea coastlines, including Lake Malaren's mapped elevation.
