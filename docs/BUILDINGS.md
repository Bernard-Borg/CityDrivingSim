# Procedural buildings

Buildings retain their OSM footprints, courtyards and terrain-seated foundations.
Their walls and roofs now have separate procedural materials rather than one
grey material. Generation is deterministic: the OSM way/relation ID seeds colour,
fallback height, bay spacing, shutter colour and balcony-rail variation. Reopening
the same city preserves the appearance.

## City configuration

Each entry in [cities.ts](../src/stores/cities.ts) accepts a `buildings` theme.
The `MALTA_BUILDINGS` and `MONACO_BUILDINGS` presets live in
[BuildingAppearance.ts](../src/core/scene/BuildingAppearance.ts).
Copy/spread a preset in a city entry to customize it:

```ts
buildings: {
    ...MALTA_BUILDINGS,
    wallColors: ['#d9c594', '#e4d3ab', '#c4ad7d'],
    shutterColors: ['#305b47', '#683e36'],
    weathering: 0.3,
    balconyChance: 0.4,
    residentialLevels: [1, 3],
},
```

`wallColors`, `roofColors`, and `shutterColors` are fallback palettes;
`wallMaterial` selects the fallback facade finish. `floorHeight` and
`windowSpacing` are metres. `weathering` and `balconyChance` are fractions from
0 to 1. `residentialLevels` supplies the inclusive fallback range for unclassified
homes. Explicit OSM properties override the corresponding defaults.

Malta defaults to warm limestone, coloured shutters and mostly low buildings.
Monaco defaults to pastel plaster, taller residential buildings and more balcony
rail patterns. Balcony rails and window recesses are facade details, not separate
3D balconies.

## OSM properties

The renderer uses `building`, `amenity`, `historic`, `height`, `building:levels`,
`levels`, `min_height`, `building:min_level`, `building:colour`,
`building:material`, `roof:shape`, `roof:height`, `roof:colour`, and `roof:material`.
Colour names and hexadecimal colours are supported. Heights are interpreted as
metres. Invalid/missing dimensions fall back to the selected style.

Roof geometry supports flat, gabled, skillion, pyramidal and an approximate hipped
profile; unsupported composite roof shapes fall back to flat geometry. Pitched
roofs are included within the total building height. They are generic estimates,
not reconstructions of landmarks, church domes or bell towers.

## Styles found in the bundled exports

The full source files include the following building classes, although some are
outside the supplied elevation coverage and are omitted from the loaded scene.
Related `amenity` tags also classify otherwise unspecified buildings.

| Appearance | OSM building values | Treatment |
| --- | --- | --- |
| Homes | `yes`, `house`, `detached`, `semidetached_house`, unclassified | City palette, windows, shutters, optional rail patterns |
| Apartments | `apartments`, `residential`, `hotel`, `terrace`, `terraced` | Taller fallback, repeated floor/window rows |
| Places of worship | `church`, `chapel`, `cathedral`, or `amenity=place_of_worship` | Masonry, tall arched windows and entry, pitched fallback for churches/chapels/cathedrals |
| Civic | `public`, `civic`, `school`, `hospital`, `college`, `university`, `government`, `museum`, `police`, `stadium`, `train_station` | Restrained civic facade; historic generic buildings use this style |
| Commercial | `commercial`, `retail`, `office`, `restaurant`, `kiosk`, exported French office classification | Glazed ground-floor shopfronts |
| Industrial | `industrial`, `warehouse`, `hangar`, `barn` | Corrugated finish, high windows, loading doors, pitched metal roofs |
| Garages | `garage`, `garages`, `shed`, `service`, `toilets` | Low fallback, roller doors rather than residential windows |
| Greenhouses | `greenhouse` | Opaque glazed-panel approximation on walls and roof |
| Ruins | `ruins` or `ruins=yes` | Low, unroofed footprint walls |
| Construction | `construction` | Concrete-like surface and floor bands |
| Shelters | `roof`, `carport`, `tent` | Open sides with collidable support posts; tents use a pyramidal fallback |
| Parking | `parking` | Repeated open-deck bands |
| Bunkers | `bunker` | Low concrete facade with narrow slit details |

Non-building `bridge`, `pier`, and `no` classifications are excluded from house
generation. Unknown classifications use the city home defaults.

## Rendering and collision

[BuildingGenerator.ts](../src/core/scene/BuildingGenerator.ts) batches geometry
into 200 m spatial cells with shared wall/roof materials and vertex attributes.
This keeps frustum culling while avoiding one draw call or texture per building.
Patterns are generated in facade metre coordinates; window rows follow measured
height/floor counts, and fine facade detail fades at distance to reduce shimmer.
Only a shared 1-pixel white texture is allocated for shader UV plumbing; there are
no image downloads or new dependencies.

Collision footprints preserve courtyard holes and use the generated vertical
extent. Open shelters collide with their support posts instead of an invisible
solid footprint. Clearing a city disposes its geometry; the materials and shared
texture are reused across city switches and disposed when the generator is destroyed.
