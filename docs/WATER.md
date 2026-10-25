# Water

Water is loaded automatically from `public/data/water/<city-file>.json` when
available. Monaco uses the supplied `monaco.json` Overpass Turbo GeoJSON export.
Cities without a water file continue to load normally. There are no runtime OSM
queries, additional packages, or downloaded textures.

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
with their holes, removes covered terrain using the shared polygon clipping
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
[osm_query.txt](../public/data/water/osm_query.txt). Select an area larger than
the entire terrain extent, including connected coastline beyond its edges.
Export **GeoJSON** into `public/data/water/` with the same filename as that
city's road data. Native Overpass JSON is not the same format. Keep the OSM
copyright/ODbL attribution from the export.
