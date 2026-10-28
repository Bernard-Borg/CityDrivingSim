/**
 * BuildingGenerator types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import { BuildingSurfaceIndex } from "./BuildingSurfaceIndex";
import * as THREE from "three";
import type { GeoJSON } from "@/types";
import type { CollisionWorld, Point } from "./CollisionWorld";
import {
    buildingSeed,
    resolveBuildingAppearance,
    createBuildingMaterials,
    MALTA_BUILDINGS,
} from "./BuildingAppearance";
import type { BuildingTheme, BuildingStyle } from "./BuildingAppearance";

interface MeshData {
    position: number[];
    uv: number[];
    color: number[];
    facade: number[];
    shutters: number[];
    finish: number[];
    roofFinish: number[];
}
const styles: BuildingStyle[] = [
    "home",
    "apartments",
    "church",
    "civic",
    "commercial",
    "industrial",
    "garage",
    "greenhouse",
    "ruins",
    "construction",
    "canopy",
    "parking",
    "bunker",
];

/** Builds procedural building facades, roofs and canopy supports, batches geometry and registers collisions. */
export class BuildingGenerator {
    private cutGeometry: ((geometry: THREE.BufferGeometry) => void) | null = null;
    /**
     * Installs the cutter applied to generated building geometry before final surface processing.
     *
     * @param cut - Geometry cutter applied to generated surfaces.
     */
    setGeometryCutter(cut: (geometry: THREE.BufferGeometry) => void): void {
        this.cutGeometry = cut;
    }
    private buildingGroup = new THREE.Group();
    private materials = createBuildingMaterials();
    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param scene - Scene receiving generated objects; ownership remains with the caller.
     * @param collisions - Shared collision world receiving generated obstacles.
     */
    constructor(
        private scene: THREE.Scene,
        private collisions?: CollisionWorld,
    ) {
        this.buildingGroup.userData.isBuildingGroup = true;
        scene.add(this.buildingGroup);
    }
    /**
     * Builds terrain-seated procedural buildings, batches surfaces and registers their collision geometry.
     *
     * @param data - OSM-derived GeoJSON collection.
     * @param centerLat - City origin latitude in decimal degrees.
     * @param centerLon - City origin longitude in decimal degrees.
     * @param heightAt - Base-elevation sampler in local metres.
     * @param theme - City building palette and generation defaults.
     */
    generateBuildingsFromGeoJSON(
        data: GeoJSON,
        centerLat: number,
        centerLon: number,
        heightAt: (x: number, z: number) => number = () => 0,
        theme: BuildingTheme = MALTA_BUILDINGS,
    ): void {
        this.clear();
        const scale = (Math.PI / 180) * 6371000;
        /**
         * Projects an OSM longitude/latitude pair into local east/south coordinates in metres.
         *
         * The destructured coordinate argument is in OSM longitude, latitude order.
         */
        const local = ([lon, lat]: [number, number]) => ({
            x: (lon - centerLon) * scale * Math.cos((centerLat * Math.PI) / 180),
            z: -(lat - centerLat) * scale,
        });
        // Shared materials, spatial batches and per-vertex appearance attributes keep draw calls bounded.
        const batches = new Map<string, { walls: MeshData; roofs: MeshData }>();
        /**
         * Allocates empty attribute arrays for a building surface batch.
         */
        const empty = (): MeshData => ({
            position: [],
            uv: [],
            color: [],
            facade: [],
            shutters: [],
            finish: [],
            roofFinish: [],
        });
        const counts: Record<string, number> = {};
        let count = 0;
        for (const feature of data.features) {
            if (
                feature.geometry.type !== "Polygon" ||
                ["pier", "bridge", "no"].includes(String(feature.properties.building))
            )
                continue;
            const rings = feature.geometry.coordinates
                .map((ring) => {
                    const points = ring.map(local);
                    return points.filter(
                        (p, i) =>
                            (i === 0 ||
                                Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 0.001) &&
                            (i === 0 || Math.hypot(p.x - points[0].x, p.z - points[0].z) > 0.001),
                    );
                })
                .filter((ring) => ring.length >= 3);
            if (!rings[0]) continue;
            const outer = rings[0],
                p = feature.properties;
            const seed = buildingSeed(
                String(
                    feature.id ?? p["@id"] ?? `${outer[0].x.toFixed(2)},${outer[0].z.toFixed(2)}`,
                ),
            );
            const a = resolveBuildingAppearance(p, seed, theme);
            const minX = Math.min(...outer.map((v) => v.x)),
                maxX = Math.max(...outer.map((v) => v.x));
            const minZ = Math.min(...outer.map((v) => v.z)),
                maxZ = Math.max(...outer.map((v) => v.z));
            const cx = (minX + maxX) / 2,
                cz = (minZ + maxZ) / 2;
            const edge = outer
                .map((v, i) => {
                    const w = outer[(i + 1) % outer.length];
                    return {
                        x: w.x - v.x,
                        z: w.z - v.z,
                        length: Math.hypot(w.x - v.x, w.z - v.z),
                    };
                })
                .sort((a, b) => b.length - a.length)[0];
            const ex = edge.x / Math.max(0.001, edge.length),
                ez = edge.z / Math.max(0.001, edge.length);
            /**
             * Transforms a footprint point into the current roof-local coordinate axes.
             *
             * @param v - Vertex or scalar being evaluated.
             */
            const roofPoint = (v: Point) => ({
                x: (v.x - cx) * ex + (v.z - cz) * ez,
                z: -(v.x - cx) * ez + (v.z - cz) * ex,
            });
            const roofPoints = outer.map(roofPoint);
            const roofMinX = Math.min(...roofPoints.map((v) => v.x)),
                roofMaxX = Math.max(...roofPoints.map((v) => v.x));
            const roofMinZ = Math.min(...roofPoints.map((v) => v.z)),
                roofMaxZ = Math.max(...roofPoints.map((v) => v.z));
            const roofCx = (roofMinX + roofMaxX) / 2,
                roofCz = (roofMinZ + roofMaxZ) / 2;
            const halfX = Math.max(0.01, (roofMaxX - roofMinX) / 2),
                halfZ = Math.max(0.01, (roofMaxZ - roofMinZ) / 2);
            const batchKey = `${Math.floor(cx / 200)},${Math.floor(cz / 200)}`;
            if (!batches.has(batchKey)) batches.set(batchKey, { walls: empty(), roofs: empty() });
            const batch = batches.get(batchKey)!;
            let low = Infinity,
                high = -Infinity;
            for (const ring of rings)
                for (let i = 0; i < ring.length; i++) {
                    const v = ring[i],
                        w = ring[(i + 1) % ring.length];
                    const steps = Math.max(1, Math.ceil(Math.hypot(w.x - v.x, w.z - v.z) / 5));
                    for (let j = 0; j < steps; j++) {
                        const h = heightAt(
                            v.x + ((w.x - v.x) * j) / steps,
                            v.z + ((w.z - v.z) * j) / steps,
                        );
                        low = Math.min(low, h);
                        high = Math.max(high, h);
                    }
                }
            const minLevel = Math.max(0, Number(p["building:min_level"]) || 0);
            const minHeight = Math.max(
                0,
                parseFloat(String(p.min_height ?? minLevel * theme.floorHeight)) || 0,
            );
            const base = minHeight > 0 ? high + minHeight : low - 0.25;
            const totalHeight = Math.max(a.height, minHeight + 0.5),
                top = high + totalHeight;
            const pitched = ["gabled", "gable", "hipped", "pyramidal", "skillion"].includes(
                a.roofShape,
            );
            const taggedRise = parseFloat(String(p["roof:height"] ?? ""));
            const rise = pitched
                ? Math.min(
                      totalHeight - minHeight - 0.4,
                      Number.isFinite(taggedRise) && taggedRise >= 0
                          ? taggedRise
                          : Math.min(3, totalHeight * 0.22),
                  )
                : 0;
            const eave = top - rise,
                shortX = halfX <= halfZ;
            /**
             * Computes the current building roof elevation at a footprint point.
             *
             * @param v - Vertex or scalar being evaluated.
             */
            const roofY = (v: Point) => {
                const q = roofPoint(v),
                    nx = Math.abs(q.x - roofCx) / halfX,
                    nz = Math.abs(q.z - roofCz) / halfZ;
                if (a.roofShape === "pyramidal" || a.roofShape === "hipped")
                    return eave + rise * Math.max(0, 1 - Math.max(nx, nz));
                if (a.roofShape === "skillion")
                    return eave + rise * Math.max(0, Math.min(1, (q.x - roofMinX) / (2 * halfX)));
                return eave + rise * Math.max(0, 1 - (shortX ? nx : nz));
            };
            const wallHeight = eave - high;
            const floorHeight = ["church", "industrial", "garage", "greenhouse", "bunker"].includes(
                a.style,
            )
                ? Math.max(1, wallHeight)
                : Math.max(1, wallHeight / Math.max(1, a.levels - minLevel));
            const width =
                Math.max(1, theme.windowSpacing) *
                (0.9 + (seed % 21) / 100) *
                (a.style === "church"
                    ? 1.5
                    : a.style === "industrial" || a.style === "garage"
                      ? 1.8
                      : 1);
            const finish = ["stone", "sandstone", "limestone", "brick"].includes(a.material)
                ? 1
                : ["metal", "steel"].includes(a.material)
                  ? 2
                  : ["glass", "mirror"].includes(a.material)
                    ? 3
                    : a.material === "wood"
                      ? 4
                      : 0;
            const roofFinish = ["roof_tiles", "tile", "tiles", "slate"].includes(a.roofMaterial)
                ? 0
                : a.roofMaterial === "metal"
                  ? 1
                  : a.roofMaterial === "glass"
                    ? 3
                    : a.roofMaterial === "wood"
                      ? 4
                      : 2;
            /**
             * Appends one building vertex and its facade or roof attributes to the surface batch.
             *
             * @param mesh - Surface attribute arrays receiving a vertex.
             * @param v - Vertex or scalar being evaluated.
             * @param y - Local elevation in metres.
             * @param u - Horizontal facade texture coordinate.
             * @param t - Normalized curve or local interpolation parameter.
             * @param roof - Whether the vertex belongs to a roof surface.
             */
            const emit = (
                mesh: MeshData,
                v: Point,
                y: number,
                u: number,
                t: number,
                roof = false,
            ) => {
                mesh.position.push(v.x, y, v.z);
                mesh.uv.push(u, t);
                const c = roof ? a.roofColor : a.wallColor;
                mesh.color.push(c.r, c.g, c.b);
                mesh.facade.push(width, floorHeight, styles.indexOf(a.style), Number(a.balcony));
                mesh.shutters.push(a.shutterColor.r, a.shutterColor.g, a.shutterColor.b);
                mesh.finish.push(finish, theme.weathering);
                mesh.roofFinish.push(roofFinish);
            };
            // Split triangles/edges at ridge planes so roof geometry matches its sampled height.
            const planes = rise
                ? a.roofShape === "pyramidal" || a.roofShape === "hipped"
                    ? [
                          (v: Point) =>
                              (roofPoint(v).x - roofCx) / halfX - (roofPoint(v).z - roofCz) / halfZ,
                          (v: Point) =>
                              (roofPoint(v).x - roofCx) / halfX + (roofPoint(v).z - roofCz) / halfZ,
                      ]
                    : a.roofShape === "skillion"
                      ? []
                      : [(v: Point) => (shortX ? roofPoint(v).x - roofCx : roofPoint(v).z - roofCz)]
                : [];
            for (const ring of rings) {
                let along = 0;
                for (let i = 0; i < ring.length; i++) {
                    const v = ring[i],
                        w = ring[(i + 1) % ring.length],
                        length = Math.hypot(w.x - v.x, w.z - v.z);
                    const ts = [0, 1];
                    for (const plane of planes) {
                        const av = plane(v),
                            bv = plane(w);
                        if (av * bv < 0) ts.push(av / (av - bv));
                    }
                    ts.sort((x, y) => x - y);
                    if (a.style !== "canopy")
                        for (let j = 1; j < ts.length; j++) {
                            const t = ts[j - 1],
                                s = ts[j],
                                b = {
                                    x: v.x + (w.x - v.x) * t,
                                    z: v.z + (w.z - v.z) * t,
                                },
                                c = {
                                    x: v.x + (w.x - v.x) * s,
                                    z: v.z + (w.z - v.z) * s,
                                };
                            const bh = roofY(b),
                                ch = roofY(c),
                                u = along + length * t,
                                u2 = along + length * s;
                            emit(batch.walls, b, base, u, base - high);
                            emit(batch.walls, c, base, u2, base - high);
                            emit(batch.walls, b, bh, u, bh - high);
                            emit(batch.walls, b, bh, u, bh - high);
                            emit(batch.walls, c, base, u2, base - high);
                            emit(batch.walls, c, ch, u2, ch - high);
                        }
                    along += length;
                }
            }
            const vectors = rings.map((ring) => ring.map((v) => new THREE.Vector2(v.x, v.z)));
            const faces = THREE.ShapeUtils.triangulateShape(vectors[0], vectors.slice(1)),
                flat = vectors.flat();
            if (a.style !== "ruins")
                for (const face of faces) {
                    let polys: Point[][] = [face.map((i) => ({ x: flat[i].x, z: flat[i].y }))];
                    for (const plane of planes)
                        polys = polys.flatMap((poly) => this.split(poly, plane));
                    for (const poly of polys)
                        for (let i = 1; i < poly.length - 1; i++) {
                            const tri = [poly[0], poly[i], poly[i + 1]];
                            if (
                                (tri[1].x - tri[0].x) * (tri[2].z - tri[0].z) -
                                    (tri[1].z - tri[0].z) * (tri[2].x - tri[0].x) >
                                0
                            )
                                tri.reverse();
                            for (const v of tri) {
                                const q = roofPoint(v);
                                emit(batch.roofs, v, roofY(v), q.x, q.z, true);
                            }
                        }
                }
            if (a.style === "canopy") {
                // Open shelters have real support posts and corresponding post collisions.
                for (const v of outer.filter(
                    (_, i) => i % Math.max(1, Math.ceil(outer.length / 6)) === 0,
                )) {
                    const h = heightAt(v.x, v.z),
                        r = 0.12;
                    const post = [
                        { x: v.x - r, z: v.z - r },
                        { x: v.x + r, z: v.z - r },
                        { x: v.x + r, z: v.z + r },
                        { x: v.x - r, z: v.z + r },
                    ];
                    for (let i = 0; i < 4; i++) {
                        const b = post[i],
                            c = post[(i + 1) % 4];
                        for (const [pt, y] of [
                            [b, h],
                            [c, h],
                            [b, eave],
                            [b, eave],
                            [c, h],
                            [c, eave],
                        ] as const)
                            emit(batch.walls, pt, y, 0, -1);
                    }
                    this.collisions?.addPolygon([post], h, eave);
                }
            } else this.collisions?.addPolygon(rings, base, top);
            counts[a.style] = (counts[a.style] ?? 0) + 1;
            count++;
        }
        const surfaces = new BuildingSurfaceIndex();
        for (const [key, batch] of batches)
            for (const [kind, meshData] of Object.entries(batch)) {
                if (!meshData.position.length) continue;
                const geometry = new THREE.BufferGeometry();
                for (const [name, size] of [
                    ["position", 3],
                    ["uv", 2],
                    ["color", 3],
                    ["facade", 4],
                    ["shutters", 3],
                    ["finish", 2],
                    ["roofFinish", 1],
                ] as const)
                    geometry.setAttribute(
                        name,
                        new THREE.Float32BufferAttribute(meshData[name], size),
                    );
                this.cutGeometry?.(geometry);
                surfaces.apply(geometry);
                geometry.computeVertexNormals();
                geometry.computeBoundingSphere();
                const mesh = new THREE.Mesh(
                    geometry,
                    kind === "walls" ? this.materials.wall : this.materials.roof,
                );
                mesh.name = `Buildings ${key} ${kind}`;
                mesh.castShadow = mesh.receiveShadow = true;
                this.buildingGroup.add(mesh);
            }
        this.buildingGroup.userData.styles = counts;
        this.buildingGroup.userData.trimmedTriangles = surfaces.trimmedTriangles;
        console.log(`Trimmed ${surfaces.trimmedTriangles} overlapping building surface triangles`);
        console.log(
            `Generated ${count} procedural buildings in ${this.buildingGroup.children.length} batches`,
            counts,
        );
    }
    /**
     * Splits a polygon across a roof plane while preserving crossing vertices.
     *
     * @param poly - Polygon vertices to clip.
     * @param plane - Clipping plane or signed-distance function.
     */
    private split(poly: Point[], plane: (p: Point) => number): Point[][] {
        if (poly.every((p) => plane(p) >= -1e-8) || poly.every((p) => plane(p) <= 1e-8))
            return [poly];
        const result: Point[][] = [];
        for (const sign of [-1, 1]) {
            const clipped: Point[] = [];
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i],
                    b = poly[(i + 1) % poly.length],
                    da = plane(a) * sign,
                    db = plane(b) * sign;
                if (da >= 0) clipped.push(a);
                if (da * db < 0) {
                    const t = da / (da - db);
                    clipped.push({
                        x: a.x + (b.x - a.x) * t,
                        z: a.z + (b.z - a.z) * t,
                    });
                }
            }
            if (clipped.length >= 3) result.push(clipped);
        }
        return result;
    }
    /**
     * Clears generated content and cached lookup data so the instance can be reused.
     */
    clear(): void {
        for (const mesh of this.buildingGroup.children) (mesh as THREE.Mesh).geometry.dispose();
        this.buildingGroup.clear();
    }
    /**
     * Releases owned resources and unregisters scene objects, browser listeners or audio nodes as applicable.
     */
    dispose(): void {
        this.clear();
        this.materials.wall.dispose();
        this.materials.roof.dispose();
        this.materials.map.dispose();
        this.scene.remove(this.buildingGroup);
    }
}
