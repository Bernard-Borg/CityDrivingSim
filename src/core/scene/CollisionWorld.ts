/**
 * CollisionWorld types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import type { TerrainBounds } from "./ElevationTerrain";

export interface Point {
    x: number;
    z: number;
}
interface Obstacle {
    rings: Point[][];
    minY: number;
    maxY: number;
    category: "scenery" | "road";
    owner?: string;
    tunnelOpeningsOnly?: boolean;
}

/**
 * Projects a horizontal point onto a finite segment, clamping the projection to its endpoints.
 *
 * @param p - Point or OSM tag record, as indicated by its type.
 * @param a - First segment endpoint or face vertex.
 * @param b - Second segment endpoint or face vertex.
 */
export function closestPoint(p: Point, a: Point, b: Point): Point {
    const dx = b.x - a.x,
        dz = b.z - a.z;
    const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    return { x: a.x + t * dx, z: a.z + t * dz };
}

/**
 * Checks whether a horizontal point lies inside a polygon ring using ray crossing.
 *
 * @param p - Point or OSM tag record, as indicated by its type.
 * @param ring - Polygon ring.
 */
function inside(p: Point, ring: Point[]): boolean {
    let result = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i],
            b = ring[j];
        if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
            result = !result;
    }
    return result;
}

/** Broad phase shared by static footprints and road segments. */
export class SpatialGrid<T> {
    private cells = new Map<string, Set<T>>();
    private size: number;
    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param size - Spatial grid cell size in metres.
     */
    constructor(size = 20) {
        this.size = size;
    }
    /**
     * Clears generated content and cached lookup data so the instance can be reused.
     */
    clear(): void {
        this.cells.clear();
    }
    /**
     * Registers an item in every spatial grid cell overlapped by its horizontal bounds.
     *
     * @param item - Spatially indexed item.
     * @param minX - Western bound in local metres.
     * @param minZ - Northern bound in local metres.
     * @param maxX - Eastern bound in local metres.
     * @param maxZ - Southern bound in local metres.
     */
    insert(item: T, minX: number, minZ: number, maxX: number, maxZ: number): void {
        for (let x = Math.floor(minX / this.size); x <= Math.floor(maxX / this.size); x++) {
            for (let z = Math.floor(minZ / this.size); z <= Math.floor(maxZ / this.size); z++) {
                const key = `${x},${z}`;
                if (!this.cells.has(key)) this.cells.set(key, new Set());
                this.cells.get(key)!.add(item);
            }
        }
    }
    /**
     * Returns the items registered in the cell containing the supplied local position.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     */
    at(x: number, z: number): Iterable<T> {
        return this.cells.get(`${Math.floor(x / this.size)},${Math.floor(z / this.size)}`) ?? [];
    }
}

/**
 * Resolves vehicle capsule contacts against spatially indexed scenery and road obstacles.
 */
export class CollisionWorld {
    private grid = new SpatialGrid<Obstacle>();
    private bounds: TerrainBounds | null = null;
    private inTunnel: ((x: number, z: number, y: number) => boolean) | null = null;
    private roadOpening: ((x: number, z: number, y: number, owner: string, tunnelsOnly?: boolean) => boolean) | null =
        null;
    /**
     * Installs a predicate identifying openings between intersecting road corridors.
     *
     * @param query - World-space classification predicate.
     */
    setRoadOpeningQuery(query: (x: number, z: number, y: number, owner: string, tunnelsOnly?: boolean) => boolean): void {
        this.roadOpening = query;
    }
    /**
     * Installs or clears the predicate identifying tunnel interiors.
     *
     * @param query - World-space classification predicate.
     */
    setTunnelQuery(query: ((x: number, z: number, y: number) => boolean) | null): void {
        this.inTunnel = query;
    }
    /**
     * Sets optional horizontal bounds used to constrain vehicle positions.
     *
     * @param bounds - Local horizontal bounds in metres.
     */
    setBounds(bounds: TerrainBounds | null): void {
        this.bounds = bounds;
    }
    /**
     * Clears generated content and cached lookup data so the instance can be reused.
     */
    clear(): void {
        this.grid.clear();
        this.bounds = null;
        this.inTunnel = null;
        this.roadOpening = null;
    }
    /**
     * Registers polygon rings with a vertical collision extent and optional road ownership.
     *
     * @param rings - Outer polygon ring followed by holes.
     * @param minY - Lower collision elevation in metres.
     * @param maxY - Upper collision elevation in metres.
     * @param category - Obstacle category controlling collision filtering.
     * @param owner - Owning road identifier.
     * @param tunnelOpeningsOnly - Whether only tunnel bores can open this structural collider.
     */
    addPolygon(
        rings: Point[][],
        minY = 0,
        maxY = 100,
        category: "scenery" | "road" = "scenery",
        owner?: string,
        tunnelOpeningsOnly = false,
    ): void {
        if (!rings[0] || rings[0].length < 3) return;
        const xs = rings[0].map((p) => p.x),
            zs = rings[0].map((p) => p.z);
        this.grid.insert(
            { rings, minY, maxY, category, owner, tunnelOpeningsOnly },
            Math.min(...xs) - 2,
            Math.min(...zs) - 2,
            Math.max(...xs) + 2,
            Math.max(...zs) + 2,
        );
    }
    /**
     * Registers a circular tree-trunk obstacle above its base elevation.
     *
     * @param p - Point or OSM tag record, as indicated by its type.
     * @param radius - Obstacle radius in metres.
     * @param baseHeight - Obstacle base elevation in metres.
     */
    addTrunk(p: Point, radius: number, baseHeight = 0): void {
        const ring = Array.from({ length: 12 }, (_, i) => ({
            x: p.x + Math.cos((i * Math.PI) / 6) * radius,
            z: p.z + Math.sin((i * Math.PI) / 6) * radius,
        }));
        this.addPolygon([ring], baseHeight, baseHeight + 3);
    }
    /** Three overlapping circles approximate the 2.6 m car, including its front/rear corners. */
    resolve(
        body: { x: number; z: number; yaw: number; vx: number; vz: number },
        y: number,
        shape = { radius: 0.55, halfLength: 0.75, halfHeight: 0.4 },
    ): number {
        let impact = 0;
        if (this.bounds) {
            const ex = shape.radius + shape.halfLength * Math.abs(Math.sin(body.yaw));
            const ez = shape.radius + shape.halfLength * Math.abs(Math.cos(body.yaw));
            const x = Math.max(this.bounds.minX + ex, Math.min(this.bounds.maxX - ex, body.x));
            const z = Math.max(this.bounds.minZ + ez, Math.min(this.bounds.maxZ - ez, body.z));
            if ((body.x - x) * body.vx > 0) {
                impact = Math.max(impact, Math.abs(body.vx));
                body.vx = 0;
            }
            if ((body.z - z) * body.vz > 0) {
                impact = Math.max(impact, Math.abs(body.vz));
                body.vz = 0;
            }
            body.x = x;
            body.z = z;
        }
        for (let pass = 0; pass < 6; pass++) {
            let moved = false;
            for (const offset of [-shape.halfLength, 0, shape.halfLength]) {
                const p = {
                    x: body.x + Math.sin(body.yaw) * offset,
                    z: body.z + Math.cos(body.yaw) * offset,
                };
                for (const obstacle of this.grid.at(p.x, p.z)) {
                    if (
                        y + shape.halfHeight < obstacle.minY ||
                        y - shape.halfHeight > obstacle.maxY
                    )
                        continue;
                    if (obstacle.category === "scenery" && this.inTunnel?.(p.x, p.z, y)) continue;
                    if (obstacle.owner && this.roadOpening?.(p.x, p.z, y, obstacle.owner, obstacle.tunnelOpeningsOnly)) continue;
                    const solid =
                        inside(p, obstacle.rings[0]) &&
                        !obstacle.rings.slice(1).some((r) => inside(p, r));
                    let nearest = { x: 0, z: 0 },
                        best = Infinity;
                    for (const ring of obstacle.rings) {
                        for (let i = 0; i < ring.length; i++) {
                            const q = closestPoint(p, ring[i], ring[(i + 1) % ring.length]);
                            const d = Math.hypot(p.x - q.x, p.z - q.z);
                            if (d < best) {
                                best = d;
                                nearest = q;
                            }
                        }
                    }
                    const radius = shape.radius;
                    if (!solid && best >= radius) continue;
                    let nx = (p.x - nearest.x) / (best || 1),
                        nz = (p.z - nearest.z) / (best || 1);
                    if (solid) {
                        nx = -nx;
                        nz = -nz;
                    }
                    if (best < 1e-8) {
                        nx = -Math.sin(body.yaw);
                        nz = -Math.cos(body.yaw);
                    }
                    const depth = (solid ? best + radius : radius - best) + 0.001;
                    body.x += nx * depth;
                    body.z += nz * depth;
                    p.x += nx * depth;
                    p.z += nz * depth;
                    const inward = body.vx * nx + body.vz * nz;
                    if (inward < 0) {
                        impact = Math.max(impact, -inward);
                        // Inelastic contact: remove inward speed, never reflect it.
                        // Crush/contact friction also dissipates tangential motion.
                        body.vx -= nx * inward;
                        body.vz -= nz * inward;
                        const tangentSpeed = Math.hypot(body.vx, body.vz);
                        const retained = Math.max(
                            0,
                            1 - (-inward * 0.3) / Math.max(tangentSpeed, 1e-8),
                        );
                        body.vx *= retained;
                        body.vz *= retained;
                    }
                    moved = true;
                }
            }
            if (!moved) break;
        }
        return impact;
    }
}
