# Tunnel geometry

Tunnel roads use a thick horseshoe lining: short vertical shoulders and a 16-facet elliptical arch. Width includes sidewalks; centre height uses the existing headroom setting. The outer lining expands by 0.45 metres. End rims seal the lining thickness without closing the drive-through opening; rims are omitted at continuing tunnel nodes.

`TunnelSection.ts` supplies the shared shape. `RoadCorridors.ts` adds the same arch planes to the tunnel excavation volume. Terrain and natural cover are cut only where their triangles actually enter this 3D volume. Terrain above the crown is preserved; the previous horizontal portal footprint no longer removes an entire strip of overhead ground. Ground-road approach cutouts retain their existing behaviour.

Other tunnel volumes clip the lining to open tunnel junctions. Above-ground road volumes do not clip tunnel shells. Lining colliders use facet-specific footprints and height ranges, including curved shoulders. Their openings likewise consider other tunnels only, keeping visible shell collision consistent at surface-road crossings. These are height-bounded polygon colliders using the existing collision solver; they are not a new vertical rigid-body solver.

This change does not alter vehicle gravity, support selection, tunnel elevation estimation, road-level overrides, or the underlying elevation sampler. The inferred tunnel profile can still be inaccurate where OSM lacks actual elevations. Geometry checks cover thick-shell generation, arch containment, overhead terrain preservation, partial portal excavation and surface crossings. In-game inspection of specific city portals remains useful.

## Surface approaches

Ground roads within 80 metres of connected tunnel portals (or twice the configured ramp length, if larger) now use engineered node-height profiles. A local relaxation lowers excessive high samples to the configured maximum grade while protecting bridge nodes, explicit height overrides and the outer neighborhood boundary. Shared portal heights are reconciled with the tunnel network afterward. These approach sections interpolate the solved centreline height across the carriageway rather than adding terrain-relative offsets separately at each lateral sample. Ordinary ground roads outside the neighborhood keep their terrain drape.

An in-memory comparison with the Monaco road export and HGT tile reduced maximum node grades on ways 353889390 and 1212029941 from approximately 46.9% and 33.5% to 22%. This is the configured grade ceiling, not a surveyed reconstruction. Protected boundaries and height overrides can constrain what can be corrected automatically.
