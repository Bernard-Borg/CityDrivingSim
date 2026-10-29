# Wander

Explore real places at your own pace. Wander is a browser-based driving sandbox
built with Vue 3, TypeScript, Three.js and Pinia. OpenStreetMap data becomes
procedural streets, buildings and scenery, with elevation-aware driving and a
free-flight mode for exploring from above.

## Features

- **Real map data:** roads, bridges, tunnels, sidewalks, building parts, parks,
  beaches, water, trees and street furniture generated from OSM exports.
- **Detailed buildings:** procedural materials and features based on OSM tags,
  including distinctive building types and floating ships/houseboats.
- **Elevation:** NASA SRTM HGT and GeoTIFF terrain sources behind a common sampler,
  with a configurable HGT fallback for detailed terrain.
- **Driving:** configurable vehicles, slope-aware handling, gravity, collisions,
  ignition, parking brake and boost.
- **Cameras:** third-person and first-person views, plus creative free flight.
- **Vehicles:** Honda NSX, Jeep Gladiator and VW Golf, with animated wheels and
  steering-wheel animation where supported by the model.
- **Audio:** vehicle-specific engine sounds, ignition, collisions, horn and radio,
  with separate engine, music and effects volume settings.
- **HUD:** instruments, compass, coordinates, street labels, coordinate/street
  search and teleportation, FPS and optional performance graphs.
- **Touch controls:** driving, horn and camera controls for mobile devices.

Map accuracy and detail depend on the source data. Terrain heightmaps cannot
represent overhangs or multiple surfaces at the same horizontal position;
bridges and tunnels are generated separately.

## Get started

Use Node.js 24 or newer, npm and [Git LFS](https://git-lfs.com/).

```sh
git lfs install
git clone https://github.com/Bernard-Borg/CityDrivingSim.git
cd CityDrivingSim
git lfs pull
npm ci
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

**Git LFS matters:** tracked TIFF assets must be downloaded as actual raster
files, not left as small LFS pointer files. After changing branches or pulling
new elevation assets, run `git lfs pull` if necessary.

### Commands

| Command             | Purpose                            |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Start the development server       |
| `npm run typecheck` | Check Vue and TypeScript types     |
| `npm run build`     | Type-check and build into `dist/`  |
| `npm run preview`   | Serve the production build locally |

## Playing

The game always starts at the main menu rather than automatically loading a city.
**Play** opens map selection. When a city is saved, **Continue** restores that
city and **Choose Map** opens the picker. Map cards include their country.
Settings and attribution are accessible from the menu.

The selected city, vehicle and supported preferences are saved locally in your
browser. Driving positions are saved per city. The car starts with its ignition
off; pressing the accelerator starts the ignition automatically.

### Driving controls

| Input                | Action                                                                         |
| -------------------- | ------------------------------------------------------------------------------ |
| W / Up               | Accelerate; start ignition if off                                              |
| S / Down             | Brake, then reverse                                                            |
| A / D / Left / Right | Steer                                                                          |
| Space / E, held      | Handbrake                                                                      |
| Shift                | Boost                                                                          |
| I                    | Ignition / park                                                                |
| H, held              | Horn                                                                           |
| V                    | Switch first-person / third-person view                                        |
| Mouse drag           | Look around; first-person horizontal look is limited to 80 degrees either side |
| Mouse wheel          | Third-person zoom                                                              |
| C                    | Toggle creative mode                                                           |
| ?                    | Open controls help                                                             |

Use the on-screen buttons for car selection, radio, street labels, location reset,
city switching and performance diagnostics. Search accepts street names or
latitude/longitude within map bounds. The in-game help dialog is the reference
for controls; mobile devices also expose touch controls.

### Creative controls

| Input             | Action              |
| ----------------- | ------------------- |
| WASD / Arrow keys | Fly horizontally    |
| Space / E         | Fly up              |
| Q                 | Fly down            |
| Shift, held       | Fly faster          |
| Mouse drag        | Look around         |
| Mouse wheel       | Adjust flight speed |
| C                 | Return to driving   |

### Settings and performance

Settings includes shadows, render resolution, audio channel volumes and mute.
The HUD page independently hides the speedometer/instruments, compass/coordinates
and search. Water-surface contact resets the car; simply being above or below water does not.
Use Delete or the touch Reset button for manual recovery.
**Use fallback terrain** loads a GeoTIFF city's configured HGT fallback directly,
skipping TIFF decoding. Changing it reloads the map, preserving latitude and
longitude while resolving height against the newly selected surface. Cities
without a configured fallback retain their normal source.

Fine terrain spacing increases mesh generation and clipping work substantially.
The TIFF pixel spacing and the rendered mesh spacing are separate settings.
Currently terrain meshes are generated at load time, and the TIFF loader reads
the complete elevation band; preprocessing/streaming is not implemented. Use
fallback terrain or adjust `meshSpacing` when detailed maps load too slowly.

The performance panel includes FPS, frame/CPU timings, draw calls and scene counts.
See [driving and diagnostics](docs/DRIVING.md) for more detail.

## Maps and configuration

Configured maps include Amsterdam (Netherlands), Monaco, Stockholm (Sweden),
Vaduz (Liechtenstein), and
Rabat, Valletta and Vaduz (Liechtenstein). A map appears in the picker when its road
file is available; availability checks use HEAD requests rather than downloading
the full road export.

### Add a map

1. Export GeoJSON using the queries in
   [roads](public/data/roads/osm_query.txt),
   [buildings](public/data/buildings/osm_query.txt),
   [natural features](public/data/natural/osm_query.txt) and
   [decor](public/data/decor/osm_query.txt).
2. Save matching filenames such as `example.json` under the corresponding
   `public/data/` directories. Roads are required; other scenery is optional.
   Keep coordinates in WGS84 longitude/latitude; the application projects them.
3. Add a configuration to [cities.ts](src/stores/cities.ts), including `name`,
   `country`, `file`, `centerLat` and `centerLon`, plus optional building theme and
   elevation settings. The city centre supplies the local coordinate origin and
   the default spawn search area; saved positions are stored separately.
4. For HGT elevation, provide the asset filename and its southern/western tile
   coordinates. For GeoTIFF, select `format: "geotiff"`, the supported CRS,
   mesh spacing and optional HGT fallback. See the
   [elevation guide](docs/ELEVATION.md) and
   [source notes](public/data/elevation/ele_query.txt).
5. Preserve source attribution and licences when adding or replacing data.

The natural-feature export includes water. There is no separate legacy water-file
fallback. Optional road-level settings live in
[road-levels.json](public/data/roads/road-levels.json).

### Vehicles and UI

Vehicle models, driver-eye placement, handling, grip and engine profiles are
configured in [VehicleConfig.ts](src/core/vehicle/VehicleConfig.ts).

The **coastal dusk** theme uses deep teal surfaces and warm gold menu accents,
with sage green as the secondary in-game palette. Reuse the shared buttons,
dialogs and native form-control classes in [screens.css](src/styles/screens.css).
Read [UI_THEME.md](docs/UI_THEME.md) before changing the UI.

## Project layout

| Location                                                          | Responsibility                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| [src/core/](src/core/)                                            | Simulator, menu scene, cameras and world integration         |
| [src/core/scene/](src/core/scene/)                                | Terrain, roads, tunnels, buildings, scenery and collisions   |
| [src/core/vehicle/](src/core/vehicle/)                            | Vehicle configuration, physics and model animation           |
| [src/stores/](src/stores/)                                        | Shared Pinia state, saved preferences and simulator commands |
| [src/parts/](src/parts/)                                          | Menu, loading, error, map-selection and HUD components       |
| [src/styles/screens.css](src/styles/screens.css)                  | Shared UI surfaces and controls                              |
| [public/data/](public/data/)                                      | OSM exports, elevation sources and queries                   |
| [public/models/](public/models/)                                  | Vehicle models and bundled asset credits                     |
| [public/music/](public/music/) / [public/sounds/](public/sounds/) | Radio tracks and sound assets                                |
| [docs/](docs/)                                                    | Feature and configuration guides                             |

The [simulator store](src/stores/simulator.ts) owns the simulator lifecycle and
exposes commands directly to components. Its `shallowRef` avoids deeply proxying
Three.js resources. Dialogs register independent pause reasons with the store;
closing one does not resume gameplay while another still needs it paused.

## Deployment and PWA

Build with `npm run build` and serve `dist/` from the site root. On Vercel, use the
Vite preset with `dist` as the output directory. Ensure the checkout resolves Git
LFS assets before building and that the host can serve the large elevation files.
GeoTIFF loading requires HTTP byte-range responses.

PWA installation requires HTTPS in production. The service worker caches the app
shell, not the large city datasets, elevation files, models or music. New service
workers activate after existing tabs close rather than forcing a reload during a
drive. Avoid long-lived caching of the service-worker script.

## Documentation

- [Driving, vehicles and diagnostics](docs/DRIVING.md)
- [Elevation sources and terrain](docs/ELEVATION.md)
- [Tunnel generation](docs/TUNNELS.md)
- [Procedural buildings](docs/BUILDINGS.md)
- [Natural features and street furniture](docs/SCENERY.md)
- [Water and coastlines](docs/WATER.md)
- [UI theme and shared controls](docs/UI_THEME.md)
- [Project contribution instructions](AGENTS.md)

## Attribution and licences

See [Attribution & licences](public/attribution.html), also linked from the game,
for dataset and vehicle-model credits. Sources include OpenStreetMap contributors,
NASA SRTM and IGN MNT LiDAR HD for Monaco's TIFF terrain.

Third-party assets and datasets retain their own licences. In particular, the
bundled vehicle credits specify **CC BY-NC-SA 4.0**, including noncommercial and
share-alike conditions for adaptations. Do not assume those assets share the same
licence as application code.
