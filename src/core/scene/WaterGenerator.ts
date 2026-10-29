/**
 * WaterGenerator types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";
import { RoadCutouts } from "./RoadCutouts";
import { SpatialGrid } from "./CollisionWorld";
import type { Point } from "./CollisionWorld";
import type { SurfaceSample, TerrainBounds } from "./ElevationTerrain";

type Coordinate = [number, number];
interface WaterData {
    features: Array<{
        properties: Record<string, unknown>;
        geometry: { type: string; coordinates: unknown };
    }>;
}
interface WaterArea {
    outer: Point[];
    holes: Point[][];
    height: number;
}
/**
 * Formats a horizontal point into a stable rounded key used to stitch coastline endpoints.
 *
 * @param p - Point or OSM tag record, as indicated by its type.
 */
const key = (p: Point) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
/**
 * Checks whether a point lies inside the represented bounds or corridor region.
 *
 * @param p - Point or OSM tag record, as indicated by its type.
 * @param ring - Polygon ring.
 */
function contains(p: Point, ring: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i],
            b = ring[j];
        if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
            inside = !inside;
    }
    return inside;
}

/** Converts directed OSM coastlines into sea polygons inside the loaded map extent. */
export class WaterGenerator {
    private group = new THREE.Group();
    private cuts = new RoadCutouts();
    private areas = new SpatialGrid<WaterArea>(100);
    private coverage = new SpatialGrid<WaterArea>(100);
    private time = { value: 0 };
    private bankMaterial = new THREE.MeshStandardMaterial({
        color: 0x8b826e,
        roughness: 0.95,
        side: THREE.DoubleSide,
    });
    private material = new THREE.MeshPhysicalMaterial({
        color: 0x167e9e,
        roughness: 0.24,
        metalness: 0,
        side: THREE.DoubleSide,
        ior: 1.333,
        specularIntensity: 0.45,
    });

    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param scene - Scene receiving generated objects; ownership remains with the caller.
     */
    constructor(private scene: THREE.Scene) {
        this.group.name = "Water";
        scene.add(this.group);
        // Subtle world-space ripples: no vertex displacement at shorelines or new textures.
        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.waterTime = this.time;
            shader.vertexShader = "varying vec2 waterPosition;\n" + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                "#include <begin_vertex>\nwaterPosition = position.xz;",
            );
            shader.fragmentShader =
                "uniform float waterTime;\nvarying vec2 waterPosition;\n" + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <color_fragment>",
                `#include <color_fragment>
                float ripple = sin(dot(waterPosition, vec2(0.38, 0.21)) + waterTime * 1.3)
                    * sin(dot(waterPosition, vec2(-0.17, 0.49)) - waterTime * 0.9);
                diffuseColor.rgb *= 1.0 + ripple * 0.055;`,
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <normal_fragment_maps>",
                `#include <normal_fragment_maps>
                // Analytic slopes of three small waves: break up sunlight without moving shores.
                float waveA = dot(waterPosition, vec2(0.38, 0.21)) + waterTime * 1.3;
                float waveB = dot(waterPosition, vec2(-0.17, 0.49)) - waterTime * 0.9;
                float waveC = dot(waterPosition, vec2(1.07, -0.83)) + waterTime * 1.8;
                vec2 waterSlope = vec2(0.38, 0.21) * cos(waveA) * 0.07
                    + vec2(-0.17, 0.49) * cos(waveB) * 0.05
                    + vec2(1.07, -0.83) * cos(waveC) * 0.012;
                normal = normalize(normal + (viewMatrix * vec4(-waterSlope.x, 0.0, -waterSlope.y, 0.0)).xyz);`,
            );
        };
    }

    /**
     * Generates the supported OSM features using the supplied coordinate and elevation samplers.
     *
     * @param data - OSM-derived GeoJSON collection.
     * @param project - Projection from latitude/longitude to local horizontal coordinates.
     * @param bounds - Local horizontal bounds in metres.
     * @param sample - Terrain height and slope sampler in local metre coordinates.
     * @param referenceHeight - Source elevation datum offset in metres.
     */
    generate(
        data: WaterData,
        project: (lat: number, lon: number) => Point,
        bounds: TerrainBounds,
        sample: (x: number, z: number) => SurfaceSample,
        referenceHeight: number,
    ): void {
        this.clear();
        const lines: Point[][] = [],
            islands: Point[][] = [],
            inland: WaterArea[] = [];
        /**
         * Projects an OSM coordinate ring into local horizontal coordinates.
         *
         * @param ring - Polygon ring.
         */
        const convert = (ring: Coordinate[]) => ring.map(([lon, lat]) => project(lat, lon));
        for (const feature of data.features) {
            const { geometry: g, properties: p } = feature;
            if (p.natural === "coastline") {
                if (g.type === "LineString") lines.push(convert(g.coordinates as Coordinate[]));
                if (g.type === "Polygon")
                    islands.push(convert((g.coordinates as Coordinate[][])[0]));
            } else if (p.natural === "water") {
                const polygons =
                    g.type === "Polygon"
                        ? [g.coordinates as Coordinate[][]]
                        : g.type === "MultiPolygon"
                          ? (g.coordinates as Coordinate[][][])
                          : [];
                for (const polygon of polygons) {
                    const rings = polygon.map(convert);
                    if (!rings[0]?.length) continue;
                    const elevations = rings[0]
                        .map((pt) => sample(pt.x, pt.z).height)
                        .sort((a, b) => a - b);
                    const ele =
                        typeof p.ele === "number"
                            ? p.ele
                            : typeof p.ele === "string"
                              ? Number(p.ele)
                              : NaN;
                    const height =
                        p.water === "bay"
                            ? -referenceHeight
                            : Number.isFinite(ele)
                              ? ele - referenceHeight
                              : elevations[Math.floor(elevations.length / 2)];
                    inland.push({
                        outer: rings[0],
                        holes: rings.slice(1),
                        height,
                    });
                }
            }
        }
        // Join only matching directed endpoints. Never reverse ways: OSM puts sea on their right.
        const starts = new Map(lines.map((line) => [key(line[0]), line]));
        const ends = new Set(lines.map((line) => key(line[line.length - 1])));
        const used = new Set<Point[]>(),
            chains: Point[][] = [];
        for (const first of [...lines.filter((line) => !ends.has(key(line[0]))), ...lines]) {
            if (used.has(first)) continue;
            const chain = [...first];
            used.add(first);
            let next = starts.get(key(chain[chain.length - 1]));
            while (next && !used.has(next)) {
                chain.push(...next.slice(1));
                used.add(next);
                next = starts.get(key(chain[chain.length - 1]));
            }
            if (key(chain[0]) === key(chain[chain.length - 1])) islands.push(chain);
            else chains.push(chain);
        }
        const pieces = chains.flatMap((chain) => this.clipLine(chain, bounds));
        const width = bounds.maxX - bounds.minX,
            depth = bounds.maxZ - bounds.minZ,
            perimeter = 2 * (width + depth);
        const corners = [
            { x: bounds.minX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.maxZ },
            { x: bounds.minX, z: bounds.maxZ },
        ];
        const cornerT = [0, width, width + depth, 2 * width + depth];
        /**
         * Returns distance around the map boundary for an edge point, or null for an interior point.
         *
         * @param p - Point or OSM tag record, as indicated by its type.
         */
        const boundaryT = (p: Point): number | null => {
            if (Math.abs(p.z - bounds.minZ) < 0.01) return p.x - bounds.minX;
            if (Math.abs(p.x - bounds.maxX) < 0.01) return width + p.z - bounds.minZ;
            if (Math.abs(p.z - bounds.maxZ) < 0.01) return width + depth + bounds.maxX - p.x;
            if (Math.abs(p.x - bounds.minX) < 0.01) return 2 * width + depth + bounds.maxZ - p.z;
            return null;
        };
        const valid = pieces.filter(
            (piece) => boundaryT(piece[0]) !== null && boundaryT(piece[piece.length - 1]) !== null,
        );
        if (valid.length !== pieces.length)
            console.warn(
                "Water: incomplete coastline inside map bounds; those open pieces were omitted. Export a larger surrounding area.",
            );
        const consumed = new Set<Point[]>(),
            seas: WaterArea[] = [];
        if (!chains.length && islands.length)
            seas.push({
                outer: corners,
                holes: islands,
                height: -referenceHeight,
            });
        for (const first of valid) {
            if (consumed.has(first)) continue;
            const ring: Point[] = [];
            let piece = first,
                closed = false;
            for (let step = 0; step <= valid.length; step++) {
                if (consumed.has(piece)) {
                    closed = piece === first;
                    break;
                }
                consumed.add(piece);
                ring.push(...piece);
                const end = boundaryT(piece[piece.length - 1])!;
                const next = [...valid].sort(
                    (a, b) =>
                        ((boundaryT(a[0])! - end + perimeter) % perimeter) -
                        ((boundaryT(b[0])! - end + perimeter) % perimeter),
                )[0];
                const travel = (boundaryT(next[0])! - end + perimeter) % perimeter;
                const between = cornerT
                    .map((t, i) => ({
                        distance: (t - end + perimeter) % perimeter,
                        point: corners[i],
                    }))
                    .filter((corner) => corner.distance > 0.0001 && corner.distance < travel)
                    .sort((a, b) => a.distance - b.distance);
                ring.push(...between.map((corner) => corner.point));
                piece = next;
            }
            if (closed)
                seas.push({
                    outer: ring,
                    holes: islands.filter((island) => contains(island[0], ring)),
                    height: -referenceHeight,
                });
            else
                console.warn(
                    "Water: coastline boundary did not form a closed sea polygon; skipped.",
                );
        }
        // Index every polygon before processing shores, so neighbouring water is
        // recognized independently of feature order or different boundary vertices.
        for (const area of [...seas, ...inland]) this.coverage.insert(area,
            Math.min(...area.outer.map(p => p.x)), Math.min(...area.outer.map(p => p.z)),
            Math.max(...area.outer.map(p => p.x)), Math.max(...area.outer.map(p => p.z)));
        let count = 0;
        for (const area of [...seas, ...inland])
            count += this.addArea(area, bounds, sample) ? 1 : 0;
        console.log(`Generated ${count} water areas (${seas.length} coastal sea polygons)`);
    }

    /**
     * Clips a polyline to the loaded rectangular map bounds.
     *
     * @param line - Polyline vertices.
     * @param bounds - Local horizontal bounds in metres.
     */
    private clipLine(line: Point[], bounds: TerrainBounds): Point[][] {
        const pieces: Point[][] = [];
        let current: Point[] = [];
        for (let i = 1; i < line.length; i++) {
            const a = line[i - 1],
                b = line[i],
                dx = b.x - a.x,
                dz = b.z - a.z;
            let lo = 0,
                hi = 1;
            for (const [p, q] of [
                [-dx, a.x - bounds.minX],
                [dx, bounds.maxX - a.x],
                [-dz, a.z - bounds.minZ],
                [dz, bounds.maxZ - a.z],
            ]) {
                if (p === 0) {
                    if (q < 0) hi = -1;
                } else if (p < 0) lo = Math.max(lo, q / p);
                else hi = Math.min(hi, q / p);
            }
            if (lo > hi) {
                if (current.length > 1) pieces.push(current);
                current = [];
                continue;
            }
            const start = { x: a.x + dx * lo, z: a.z + dz * lo },
                end = { x: a.x + dx * hi, z: a.z + dz * hi };
            if (current.length && key(current[current.length - 1]) !== key(start)) {
                pieces.push(current);
                current = [];
            }
            if (!current.length) current.push(start);
            current.push(end);
        }
        if (current.length > 1) pieces.push(current);
        return pieces;
    }

    /**
     * Triangulates a water polygon and holes, adds its mesh and indexes its elevation.
     *
     * @param area - Water polygon with holes and elevation.
     * @param bounds - Local horizontal bounds in metres.
     * @param sample - Terrain height and slope sampler in local metre coordinates.
     */
    private addArea(
        area: WaterArea,
        bounds: TerrainBounds,
        sample: (x: number, z: number) => SurfaceSample,
    ): boolean {
        /**
         * Converts a horizontal polygon ring into Three.js triangulation coordinates.
         *
         * @param ring - Polygon ring.
         */
        const vectors = (ring: Point[]) => {
            const result = ring.map((p) => new THREE.Vector2(p.x, p.z));
            if (result.length > 1 && result[0].equals(result[result.length - 1])) result.pop();
            return result;
        };
        const outer = vectors(area.outer),
            holes = area.holes.map(vectors);
        const faces = THREE.ShapeUtils.triangulateShape(outer, holes),
            points = [...outer, ...holes.flat()];
        const positions: number[] = [];
        for (const face of faces) {
            let poly: Point[] = face.map((i) => ({
                x: points[i].x,
                z: points[i].y,
            }));
            // Clip each convex triangle to the map bounds, preserving concave shores and holes.
            for (const [axis, value, sign] of [
                ["x", bounds.minX, 1],
                ["x", bounds.maxX, -1],
                ["z", bounds.minZ, 1],
                ["z", bounds.maxZ, -1],
            ] as const) {
                const clipped: Point[] = [];
                for (let i = 0; i < poly.length; i++) {
                    const a = poly[i],
                        b = poly[(i + 1) % poly.length],
                        da = (a[axis] - value) * sign,
                        db = (b[axis] - value) * sign;
                    if (da >= 0) clipped.push(a);
                    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
                        const t = da / (da - db);
                        clipped.push({
                            x: a.x + (b.x - a.x) * t,
                            z: a.z + (b.z - a.z) * t,
                        });
                    }
                }
                poly = clipped;
            }
            if (poly.length < 3) continue;
            this.cuts.add(poly);
            for (let j = 1; j < poly.length - 1; j++)
                for (const p of [poly[0], poly[j + 1], poly[j]])
                    positions.push(p.x, area.height + 0.025, p.z);
        }
        if (!positions.length) return false;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.receiveShadow = true;
        this.group.add(mesh);
        // Seal the gap between coarse SRTM heights and the mapped water boundary.
        const banks: number[] = [];
        for (const ring of [area.outer, ...area.holes])
            for (const line of this.clipLine([...ring, ring[0]], bounds)) {
                for (let i = 1; i < line.length; i++) {
                    const a = line[i - 1],
                        b = line[i];
                    if (
                        ["x", "z"].some((axis) => {
                            const k = axis as "x" | "z",
                                low = k === "x" ? bounds.minX : bounds.minZ,
                                high = k === "x" ? bounds.maxX : bounds.maxZ;
                            return (
                                (Math.abs(a[k] - low) < 0.01 && Math.abs(b[k] - low) < 0.01) ||
                                (Math.abs(a[k] - high) < 0.01 && Math.abs(b[k] - high) < 0.01)
                            );
                        })
                    )
                        continue;
                    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10));
                    for (let j = 0; j < steps; j++) {
                        const p = {
                            x: a.x + ((b.x - a.x) * j) / steps,
                            z: a.z + ((b.z - a.z) * j) / steps,
                        };
                        const q = {
                            x: a.x + ((b.x - a.x) * (j + 1)) / steps,
                            z: a.z + ((b.z - a.z) * (j + 1)) / steps,
                        };
                        if (this.isInternalBoundary(p, q)) continue;
                        const hp = sample(p.x, p.z).height,
                            hq = sample(q.x, q.z).height,
                            water = area.height + 0.025;
                        banks.push(
                            p.x,
                            water,
                            p.z,
                            q.x,
                            water,
                            q.z,
                            p.x,
                            hp,
                            p.z,
                            p.x,
                            hp,
                            p.z,
                            q.x,
                            water,
                            q.z,
                            q.x,
                            hq,
                            q.z,
                        );
                    }
                }
            }
        if (banks.length) {
            const bankGeometry = new THREE.BufferGeometry();
            bankGeometry.setAttribute("position", new THREE.Float32BufferAttribute(banks, 3));
            bankGeometry.computeVertexNormals();
            const bank = new THREE.Mesh(bankGeometry, this.bankMaterial);
            bank.receiveShadow = true;
            this.group.add(bank);
        }
        this.areas.insert(
            area,
            Math.max(bounds.minX, Math.min(...area.outer.map((p) => p.x))),
            Math.max(bounds.minZ, Math.min(...area.outer.map((p) => p.z))),
            Math.min(bounds.maxX, Math.max(...area.outer.map((p) => p.x))),
            Math.min(bounds.maxZ, Math.max(...area.outer.map((p) => p.z))),
        );
        return true;
    }

    /** Identifies a polygon seam covered by water on both sides, irrespective of water level.
     * Samples away from endpoints to avoid confusing shared shore corners with seams.
     * @param a - First boundary endpoint in local metres.
     * @param b - Second boundary endpoint in local metres.
     * @returns True for internal water boundaries, excluding island shores. A level change is not a land bank.
     */
    private isInternalBoundary(a: Point, b: Point): boolean {
        const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
        if (length < 1e-6) return true;
        const nx = -dz / length * 0.05, nz = dx / length * 0.05;
        for (const t of [0.2, 0.5, 0.8]) for (const side of [-1, 1]) {
            const p = { x: a.x + dx * t + nx * side, z: a.z + dz * t + nz * side };
            const covered = [...this.coverage.at(p.x, p.z)].some(area =>
                contains(p, area.outer)
                && !area.holes.some(hole => contains(p, hole)));
            if (!covered) return false;
        }
        return true;
    }

    /**
     * Returns the represented surface elevation at a local horizontal position, or no value outside mapped water.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     */
    heightAt(x: number, z: number): number | null {
        let height: number | null = null;
        for (const area of this.areas.at(x, z))
            if (
                contains({ x, z }, area.outer) &&
                !area.holes.some((hole) => contains({ x, z }, hole))
            )
                height = Math.max(height ?? -Infinity, area.height);
        return height;
    }
    /**
     * Subtracts mapped water openings from terrain geometry in place.
     *
     * @param geometry - Buffer geometry modified in place.
     * @param sample - Terrain height and slope sampler in local metre coordinates.
     */
    cutTerrain(
        geometry: THREE.BufferGeometry,
        sample: (x: number, z: number) => SurfaceSample,
    ): void {
        this.cuts.apply(geometry, { sample });
    }
    /**
     * Updates the shared water ripple animation clock in seconds.
     *
     * @param elapsed - Animation time in seconds.
     */
    update(elapsed: number): void {
        this.time.value = elapsed;
    }
    /**
     * Clears generated content and cached lookup data so the instance can be reused.
     */
    clear(): void {
        for (const child of [...this.group.children]) {
            (child as THREE.Mesh).geometry.dispose();
            this.group.remove(child);
        }
        this.cuts.clear();
        this.areas.clear();
        this.coverage.clear();
    }
    /**
     * Releases owned resources and unregisters scene objects, browser listeners or audio nodes as applicable.
     */
    dispose(): void {
        this.clear();
        this.material.dispose();
        this.bankMaterial.dispose();
        this.scene.remove(this.group);
    }
}
