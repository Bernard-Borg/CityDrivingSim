import * as THREE from 'three';
import { SpatialGrid } from './CollisionWorld';
import type { Point } from './CollisionWorld';
import type { ElevationTerrain } from './ElevationTerrain';

/** Subtract narrow portal/approach corridors without deleting whole 20 m terrain triangles. */
export class RoadCutouts {
    private grid = new SpatialGrid<Point[]>(20);
    private count = 0;
    clear(): void { this.grid.clear(); this.count = 0; }
    add(points: Point[]): void {
        let area = 0;
        for (let i = 0; i < points.length; i++) area += points[i].x * points[(i + 1) % points.length].z - points[(i + 1) % points.length].x * points[i].z;
        if (Math.abs(area) < 1e-6) return;
        if (area < 0) points.reverse();
        this.grid.insert(points, Math.min(...points.map(p => p.x)), Math.min(...points.map(p => p.z)),
            Math.max(...points.map(p => p.x)), Math.max(...points.map(p => p.z)));
        this.count++;
    }

    private half(poly: Point[], a: Point, b: Point, inside: boolean): Point[] {
        const side = (p: Point) => ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) * (inside ? 1 : -1);
        const result: Point[] = [];
        for (let i = 0; i < poly.length; i++) {
            const p = poly[i], q = poly[(i + 1) % poly.length], dp = side(p), dq = side(q);
            if (dp >= -1e-8) result.push(p);
            if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
                const t = dp / (dp - dq); result.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
            }
        }
        return result;
    }

    private hasArea(poly: Point[]): boolean {
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length];
            area += a.x * b.z - b.x * a.z;
        }
        return Math.abs(area) > 1e-7;
    }

    apply(geometry: THREE.BufferGeometry, terrain: Pick<ElevationTerrain, 'sample'>): void {
        if (!this.count) return;
        const position = geometry.getAttribute('position'), index = geometry.getIndex();
        const output: number[] = [];
        let changed = false;
        const count = index ? index.count : position.count;
        for (let i = 0; i < count; i += 3) {
            const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
            const points = ids.map(id => ({ x: position.getX(id), z: position.getZ(id) }));
            const candidates = new Set<Point[]>();
            const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
            const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
            for (let x = Math.floor(minX / 20); x <= Math.floor(maxX / 20); x++) for (let z = Math.floor(minZ / 20); z <= Math.floor(maxZ / 20); z++) {
                for (const cut of this.grid.at(x * 20 + 0.001, z * 20 + 0.001)) candidates.add(cut);
            }
            let polygons = [points];
            for (const cut of candidates) {
                const cutMinX = Math.min(...cut.map(p => p.x)), cutMaxX = Math.max(...cut.map(p => p.x));
                const cutMinZ = Math.min(...cut.map(p => p.z)), cutMaxZ = Math.max(...cut.map(p => p.z));
                const next: Point[][] = [];
                for (const poly of polygons) {
                    if (poly.every(p => p.x < cutMinX) || poly.every(p => p.x > cutMaxX)
                        || poly.every(p => p.z < cutMinZ) || poly.every(p => p.z > cutMaxZ)) {
                        next.push(poly); continue;
                    }
                    let remaining = poly;
                    for (let edge = 0; edge < cut.length && remaining.length >= 3; edge++) {
                        const a = cut[edge], b = cut[(edge + 1) % cut.length];
                        const outside = this.half(remaining, a, b, false);
                        if (outside.length >= 3 && this.hasArea(outside)) next.push(outside);
                        remaining = this.half(remaining, a, b, true);
                    }
                }
                polygons = next;
            }
            if (candidates.size) changed = true;
            for (const poly of polygons) for (let j = 1; j < poly.length - 1; j++) {
                const tri = [poly[0], poly[j], poly[j + 1]];
                const area = (tri[1].x - tri[0].x) * (tri[2].z - tri[0].z) - (tri[1].z - tri[0].z) * (tri[2].x - tri[0].x);
                if (Math.abs(area) < 1e-8) continue;
                for (const p of tri) output.push(p.x, terrain.sample(p.x, p.z).height, p.z);
            }
        }
        if (!changed) return;
        geometry.setIndex(null); geometry.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
        geometry.deleteAttribute('uv'); geometry.deleteAttribute('normal'); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    }
}
