import type { TerrainBounds } from './ElevationTerrain';

export interface Point { x: number; z: number; }
interface Obstacle { rings: Point[][]; minY: number; maxY: number; category: 'scenery' | 'road'; }

export function closestPoint(p: Point, a: Point, b: Point): Point {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    return { x: a.x + t * dx, z: a.z + t * dz };
}

function inside(p: Point, ring: Point[]): boolean {
    let result = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) result = !result;
    }
    return result;
}

/** Broad phase shared by static footprints and road segments. */
export class SpatialGrid<T> {
    private cells = new Map<string, Set<T>>();
    private size: number;
    constructor(size = 20) { this.size = size; }
    clear(): void { this.cells.clear(); }
    insert(item: T, minX: number, minZ: number, maxX: number, maxZ: number): void {
        for (let x = Math.floor(minX / this.size); x <= Math.floor(maxX / this.size); x++) {
            for (let z = Math.floor(minZ / this.size); z <= Math.floor(maxZ / this.size); z++) {
                const key = `${x},${z}`;
                if (!this.cells.has(key)) this.cells.set(key, new Set());
                this.cells.get(key)!.add(item);
            }
        }
    }
    at(x: number, z: number): Iterable<T> { return this.cells.get(`${Math.floor(x / this.size)},${Math.floor(z / this.size)}`) ?? []; }
}

export class CollisionWorld {
    private grid = new SpatialGrid<Obstacle>();
    private bounds: TerrainBounds | null = null;
    private inTunnel: ((x: number, z: number, y: number) => boolean) | null = null;
    setTunnelQuery(query: ((x: number, z: number, y: number) => boolean) | null): void { this.inTunnel = query; }
    setBounds(bounds: TerrainBounds | null): void { this.bounds = bounds; }
    clear(): void { this.grid.clear(); this.bounds = null; this.inTunnel = null; }
    addPolygon(rings: Point[][], minY = 0, maxY = 100, category: 'scenery' | 'road' = 'scenery'): void {
        if (!rings[0] || rings[0].length < 3) return;
        const xs = rings[0].map(p => p.x), zs = rings[0].map(p => p.z);
        this.grid.insert({ rings, minY, maxY, category }, Math.min(...xs) - 2, Math.min(...zs) - 2, Math.max(...xs) + 2, Math.max(...zs) + 2);
    }
    addTrunk(p: Point, radius: number, baseHeight = 0): void {
        const ring = Array.from({ length: 12 }, (_, i) => ({ x: p.x + Math.cos(i * Math.PI / 6) * radius, z: p.z + Math.sin(i * Math.PI / 6) * radius }));
        this.addPolygon([ring], baseHeight, baseHeight + 3);
    }
    /** Three overlapping circles approximate the 2.6 m car, including its front/rear corners. */
    resolve(body: { x: number; z: number; yaw: number; vx: number; vz: number }, y: number,
        shape = { radius: 0.55, halfLength: 0.75, halfHeight: 0.4 }): number {
        let impact = 0;
        if (this.bounds) {
            const ex = shape.radius + shape.halfLength * Math.abs(Math.sin(body.yaw));
            const ez = shape.radius + shape.halfLength * Math.abs(Math.cos(body.yaw));
            const x = Math.max(this.bounds.minX + ex, Math.min(this.bounds.maxX - ex, body.x));
            const z = Math.max(this.bounds.minZ + ez, Math.min(this.bounds.maxZ - ez, body.z));
            if ((body.x - x) * body.vx > 0) { impact = Math.max(impact, Math.abs(body.vx)); body.vx = 0; }
            if ((body.z - z) * body.vz > 0) { impact = Math.max(impact, Math.abs(body.vz)); body.vz = 0; }
            body.x = x; body.z = z;
        }
        for (let pass = 0; pass < 6; pass++) {
            let moved = false;
            for (const offset of [-shape.halfLength, 0, shape.halfLength]) {
                const p = { x: body.x + Math.sin(body.yaw) * offset, z: body.z + Math.cos(body.yaw) * offset };
                for (const obstacle of this.grid.at(p.x, p.z)) {
                    if (y + shape.halfHeight < obstacle.minY || y - shape.halfHeight > obstacle.maxY) continue;
                    if (obstacle.category === 'scenery' && this.inTunnel?.(p.x, p.z, y)) continue;
                    const solid = inside(p, obstacle.rings[0]) && !obstacle.rings.slice(1).some(r => inside(p, r));
                    let nearest = { x: 0, z: 0 }, best = Infinity;
                    for (const ring of obstacle.rings) {
                        for (let i = 0; i < ring.length; i++) {
                            const q = closestPoint(p, ring[i], ring[(i + 1) % ring.length]);
                            const d = Math.hypot(p.x - q.x, p.z - q.z);
                            if (d < best) { best = d; nearest = q; }
                        }
                    }
                    const radius = shape.radius;
                    if (!solid && best >= radius) continue;
                    let nx = (p.x - nearest.x) / (best || 1), nz = (p.z - nearest.z) / (best || 1);
                    if (solid) { nx = -nx; nz = -nz; }
                    if (best < 1e-8) { nx = -Math.sin(body.yaw); nz = -Math.cos(body.yaw); }
                    const depth = (solid ? best + radius : radius - best) + 0.001;
                    body.x += nx * depth; body.z += nz * depth;
                    p.x += nx * depth; p.z += nz * depth;
                    const inward = body.vx * nx + body.vz * nz;
                    if (inward < 0) {
                        impact = Math.max(impact, -inward);
                        body.vx -= nx * inward; body.vz -= nz * inward;
                    }
                    moved = true;
                }
            }
            if (!moved) break;
        }
        return impact;
    }
}
