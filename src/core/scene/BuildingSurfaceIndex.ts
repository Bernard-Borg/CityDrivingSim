/**
 * BuildingSurfaceIndex types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";
import { SpatialGrid, type Point } from "./CollisionWorld";

/** Remove overlapping coplanar surfaces, including opposite-facing shared walls. */
export class BuildingSurfaceIndex {
    private planes = new Map<string, SpatialGrid<Point[]>>();
    trimmedTriangles = 0;

    /**
     * Applies the active surface subtraction in place and rebuilds affected vertex attributes.
     *
     * @param geometry - Buffer geometry modified in place.
     */
    apply(geometry: THREE.BufferGeometry): void {
        const attrs = Object.entries(geometry.attributes).filter(([name]) => name !== "normal");
        const offsets: number[] = [];
        let stride = 0;
        for (const [, a] of attrs) {
            offsets.push(stride);
            stride += a.itemSize;
        }
        const pos = offsets[attrs.findIndex(([name]) => name === "position")];
        const index = geometry.getIndex(),
            count = index?.count ?? geometry.getAttribute("position").count;
        const output = attrs.map(() => [] as number[]);
        for (let i = 0; i < count; i += 3) {
            const source = [0, 1, 2].map((j) => {
                const id = index ? index.getX(i + j) : i + j,
                    v: number[] = [];
                for (const [, a] of attrs)
                    for (let k = 0; k < a.itemSize; k++) v.push(a.array[id * a.itemSize + k]);
                return v;
            });
            const points = source.map((v) => new THREE.Vector3(v[pos], v[pos + 1], v[pos + 2]));
            const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
            if (normal.lengthSq() < 1e-12) continue;
            normal.normalize();
            let axis = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)].indexOf(
                Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)),
            );
            if (normal.getComponent(axis) < 0) normal.negate();
            const n = normal.toArray().map((v) => Math.round(v * 100000));
            axis = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
            const key = `${n.join(",")}:${Math.round(normal.dot(points[0]) * 1000)}`;
            const axes = [0, 1, 2].filter((k) => k !== axis);
            /**
             * Projects the input coordinates into the local coordinate system used by the current operation.
             *
             * @param v - Vertex or scalar being evaluated.
             */
            const project = (v: number[]): Point => ({
                x: v[pos + axes[0]],
                z: v[pos + axes[1]],
            });
            const projected = source.map(project);
            /**
             * Calculates signed polygon area on the active two-dimensional projection.
             *
             * @param poly - Polygon vertices to clip.
             */
            const signedArea = (poly: Point[]) =>
                poly.reduce((sum, a, j) => {
                    const b = poly[(j + 1) % poly.length];
                    return sum + a.x * b.z - b.x * a.z;
                }, 0);
            /**
             * Calculates polygon area on the active surface projection.
             *
             * @param poly - Polygon vertices to clip.
             */
            const area = (poly: number[][]) => Math.abs(signedArea(poly.map(project)));
            let grid = this.planes.get(key);
            if (!grid) {
                grid = new SpatialGrid<Point[]>(20);
                this.planes.set(key, grid);
            }
            const minX = Math.min(...projected.map((p) => p.x)),
                maxX = Math.max(...projected.map((p) => p.x));
            const minZ = Math.min(...projected.map((p) => p.z)),
                maxZ = Math.max(...projected.map((p) => p.z));
            const candidates = new Set<Point[]>();
            for (let x = Math.floor(minX / 20); x <= Math.floor(maxX / 20); x++)
                for (let z = Math.floor(minZ / 20); z <= Math.floor(maxZ / 20); z++)
                    for (const tri of grid.at(x * 20 + 0.001, z * 20 + 0.001)) candidates.add(tri);
            /**
             * Clips a polygon to one half-space, interpolating vertices where edges cross the boundary.
             *
             * @param poly - Polygon vertices to clip.
             * @param a - First segment endpoint or face vertex.
             * @param b - Second segment endpoint or face vertex.
             * @param positive - Whether to retain the positive half-space.
             */
            const half = (poly: number[][], a: Point, b: Point, positive: boolean) => {
                /**
                 * Evaluates the signed orientation of a point against the active clipping boundary.
                 *
                 * @param v - Vertex or scalar being evaluated.
                 */
                const side = (v: number[]) => {
                    const p = project(v);
                    const d =
                        ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) *
                        (positive ? 1 : -1);
                    return Math.abs(d) < 1e-8 ? 0 : d;
                };
                const result: number[][] = [];
                if (!positive && poly.every((v) => side(v) === 0)) return result;
                for (let j = 0; j < poly.length; j++) {
                    const p = poly[j],
                        q = poly[(j + 1) % poly.length],
                        dp = side(p),
                        dq = side(q);
                    if (dp >= 0) result.push(p);
                    if (dp * dq < 0) {
                        const t = dp / (dp - dq);
                        result.push(p.map((v, k) => v + (q[k] - v) * t));
                    }
                }
                return result;
            };
            let polys = [source];
            for (const cut of candidates) {
                const next: number[][][] = [];
                for (const poly of polys) {
                    const pp = poly.map(project);
                    if (
                        cut.some((a, j) => {
                            const b = cut[(j + 1) % 3];
                            return pp.every(
                                (p) =>
                                    (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) <= 1e-8,
                            );
                        })
                    ) {
                        next.push(poly);
                        continue;
                    }
                    let remaining = poly;
                    for (let edge = 0; edge < 3 && remaining.length >= 3; edge++) {
                        const outside = half(remaining, cut[edge], cut[(edge + 1) % 3], false);
                        if (outside.length >= 3 && area(outside) > 1e-8) next.push(outside);
                        remaining = half(remaining, cut[edge], cut[(edge + 1) % 3], true);
                    }
                }
                polys = next;
                if (!polys.length) break;
            }
            if (polys.reduce((sum, poly) => sum + area(poly), 0) < area(source) - 1e-6)
                this.trimmedTriangles++;
            if (polys.length) {
                if (signedArea(projected) < 0) projected.reverse();
                grid.insert(projected, minX, minZ, maxX, maxZ);
            }
            for (const poly of polys)
                for (let j = 1; j < poly.length - 1; j++) {
                    const triangle = [poly[0], poly[j], poly[j + 1]];
                    if (area(triangle) < 1e-8) continue;
                    for (const v of triangle)
                        attrs.forEach(([, a], k) => {
                            for (let c = 0; c < a.itemSize; c++) output[k].push(v[offsets[k] + c]);
                        });
                }
        }
        geometry.setIndex(null);
        attrs.forEach(([name, a], k) =>
            geometry.setAttribute(name, new THREE.Float32BufferAttribute(output[k], a.itemSize)),
        );
    }
}
