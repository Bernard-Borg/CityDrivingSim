/**
 * RoadCorridors types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";
import { SpatialGrid } from "./CollisionWorld";
import type { RoadProfile } from "./RoadProfiles";

type Plane = { x: number; y: number; z: number; w: number };
interface Volume {
    owner: string;
    tunnel: boolean;
    planes: Plane[];
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

/** Height-aware road volumes shared by junction paint, tunnel openings and building cutouts. */
export class RoadCorridors {
    private grid = new SpatialGrid<Volume>(20);
    /**
     * Clears generated content and cached lookup data so the instance can be reused.
     */
    clear(): void {
        this.grid.clear();
    }
    /**
     * Rebuilds the spatial representation from the supplied scene objects or solved road profiles.
     *
     * @param profiles - Solved road profiles.
     */
    build(profiles: RoadProfile[]): void {
        this.clear();
        for (const profile of profiles) {
            const count = Math.max(2, Math.ceil(profile.curve.getLength() / 2));
            for (let i = 0; i < count; i++) {
                const a = profile.curve.getPoint(i / count),
                    b = profile.curve.getPoint((i + 1) / count);
                const dx = b.x - a.x,
                    dz = b.z - a.z,
                    length = Math.hypot(dx, dz);
                if (length < 1e-6) continue;
                const nx = -dz / length,
                    nz = dx / length,
                    half = Math.max(
                        profile.halfWidthAt(i / count),
                        profile.halfWidthAt((i + 1) / count),
                    );
                const polygon = [
                    { x: a.x + nx * half, z: a.z + nz * half },
                    { x: b.x + nx * half, z: b.z + nz * half },
                    { x: b.x - nx * half, z: b.z - nz * half },
                    { x: a.x - nx * half, z: a.z - nz * half },
                ];
                let area = 0;
                for (let j = 0; j < 4; j++)
                    area +=
                        polygon[j].x * polygon[(j + 1) % 4].z -
                        polygon[(j + 1) % 4].x * polygon[j].z;
                if (area < 0) polygon.reverse();
                const planes: Plane[] = polygon.map((p, j) => {
                    const q = polygon[(j + 1) % 4];
                    const size = Math.hypot(q.x - p.x, q.z - p.z);
                    return {
                        x: -(q.z - p.z) / size,
                        y: 0,
                        z: (q.x - p.x) / size,
                        w: ((q.z - p.z) * p.x - (q.x - p.x) * p.z) / size,
                    };
                });
                const sx = ((b.y - a.y) * dx) / (length * length),
                    sz = ((b.y - a.y) * dz) / (length * length);
                const base = a.y - sx * a.x - sz * a.z;
                planes.push(
                    { x: -sx, y: 1, z: -sz, w: -base + 0.12 },
                    { x: sx, y: -1, z: sz, w: base + profile.headroom - 0.025 },
                );
                const v = {
                    owner: profile.input.id,
                    tunnel: profile.input.kind === "tunnel",
                    planes,
                    minX: Math.min(...polygon.map((p) => p.x)),
                    maxX: Math.max(...polygon.map((p) => p.x)),
                    minZ: Math.min(...polygon.map((p) => p.z)),
                    maxZ: Math.max(...polygon.map((p) => p.z)),
                };
                this.grid.insert(v, v.minX - 0.2, v.minZ - 0.2, v.maxX + 0.2, v.maxZ + 0.2);
            }
        }
    }
    /**
     * Checks whether a point lies inside the represented bounds or corridor region.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     * @param y - Local elevation in metres.
     * @param exclude - Road identifier excluded from lookup.
     * @param tunnelsOnly - Whether to restrict lookup to tunnel corridors.
     */
    contains(x: number, z: number, y: number, exclude?: string, tunnelsOnly = true): boolean {
        for (const volume of this.grid.at(x, z)) {
            if (volume.owner === exclude || (tunnelsOnly && !volume.tunnel)) continue;
            if (volume.planes.every((p) => p.x * x + p.y * y + p.z * z + p.w >= -1e-6)) return true;
        }
        return false;
    }
    /** Subtract convex volumes triangle by triangle, interpolating every custom vertex attribute. */
    cut(geometry: THREE.BufferGeometry, owner?: string, paint = false, tunnelsOnly = true): void {
        const attrs = Object.entries(geometry.attributes).filter(([name]) => name !== "normal");
        const offsets: number[] = [];
        let stride = 0;
        for (const [, attr] of attrs) {
            offsets.push(stride);
            stride += attr.itemSize;
        }
        const posIndex = attrs.findIndex(([name]) => name === "position"),
            posOffset = offsets[posIndex];
        const position = geometry.getAttribute("position"),
            index = geometry.getIndex(),
            count = index?.count ?? position.count;
        const output = attrs.map(() => [] as number[]);
        /**
         * Clips a polygon to one half-space, interpolating vertices where edges cross the boundary.
         *
         * @param poly - Polygon vertices to clip.
         * @param plane - Clipping plane or signed-distance function.
         * @param positive - Whether to retain the positive half-space.
         */
        const half = (poly: number[][], plane: Plane, positive: boolean) => {
            const result: number[][] = [],
                sign = positive ? 1 : -1;
            /**
             * Evaluates signed plane distance for the current packed clipping vertex.
             *
             * @param v - Vertex or scalar being evaluated.
             */
            const distance = (v: number[]) => {
                const d =
                    sign *
                    (plane.x * v[posOffset] +
                        plane.y * v[posOffset + 1] +
                        plane.z * v[posOffset + 2] +
                        plane.w);
                return Math.abs(d) < 1e-8 ? 0 : d;
            };
            if (!positive && poly.every((v) => distance(v) === 0)) return result;
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i],
                    b = poly[(i + 1) % poly.length],
                    da = distance(a),
                    db = distance(b);
                if (da >= 0) result.push(a);
                if (da * db < 0) {
                    const t = da / (da - db);
                    result.push(a.map((v, j) => v + (b[j] - v) * t));
                }
            }
            return result;
        };
        for (let i = 0; i < count; i += 3) {
            const vertices = [0, 1, 2].map((j) => {
                const id = index ? index.getX(i + j) : i + j;
                const v: number[] = [];
                for (const [, attr] of attrs)
                    for (let k = 0; k < attr.itemSize; k++)
                        v.push(attr.array[id * attr.itemSize + k]);
                return v;
            });
            const xs = vertices.map((v) => v[posOffset]),
                zs = vertices.map((v) => v[posOffset + 2]);
            const minX = Math.min(...xs),
                maxX = Math.max(...xs),
                minZ = Math.min(...zs),
                maxZ = Math.max(...zs);
            const candidates = new Set<Volume>();
            for (let x = Math.floor(minX / 20); x <= Math.floor(maxX / 20); x++)
                for (let z = Math.floor(minZ / 20); z <= Math.floor(maxZ / 20); z++)
                    for (const v of this.grid.at(x * 20 + 0.001, z * 20 + 0.001)) {
                        if (
                            v.owner === owner ||
                            (!paint && tunnelsOnly && !v.tunnel) ||
                            maxX < v.minX - 0.2 ||
                            minX > v.maxX + 0.2 ||
                            maxZ < v.minZ - 0.2 ||
                            minZ > v.maxZ + 0.2
                        )
                            continue;
                        candidates.add(v);
                    }
            let polys = [vertices];
            for (const v of candidates) {
                const planes = v.planes.map((p, j) => {
                    if (!paint) return p;
                    // Clip interior paint on either road; keep one owner for coincident outside edges.
                    if (j < 4)
                        return {
                            ...p,
                            w: p.w + (j % 2 === 0 ? (v.owner < (owner ?? "") ? 0.1 : -0.1) : 0),
                        };
                    if (j === 5) return { ...p, w: v.planes[4].w * -1 + 0.12 + 0.25 };
                    return p;
                });
                const next: number[][][] = [];
                for (const poly of polys) {
                    // Reject disjoint height ranges before splitting large building faces.
                    if (
                        planes.some((p) =>
                            poly.every(
                                (q) =>
                                    p.x * q[posOffset] +
                                        p.y * q[posOffset + 1] +
                                        p.z * q[posOffset + 2] +
                                        p.w <
                                    -1e-8,
                            ),
                        )
                    ) {
                        next.push(poly);
                        continue;
                    }
                    let remaining = poly;
                    for (const plane of planes) {
                        if (remaining.length < 3) break;
                        const outside = half(remaining, plane, false);
                        if (outside.length >= 3) next.push(outside);
                        remaining = half(remaining, plane, true);
                    }
                }
                polys = next;
                if (!polys.length) break;
            }
            for (const poly of polys)
                for (let j = 1; j < poly.length - 1; j++) {
                    const tri = [poly[0], poly[j], poly[j + 1]];
                    const a = new THREE.Vector3(
                        ...(tri[0].slice(posOffset, posOffset + 3) as [number, number, number]),
                    );
                    const b = new THREE.Vector3(
                        ...(tri[1].slice(posOffset, posOffset + 3) as [number, number, number]),
                    );
                    const c = new THREE.Vector3(
                        ...(tri[2].slice(posOffset, posOffset + 3) as [number, number, number]),
                    );
                    if (b.sub(a).cross(c.sub(a)).lengthSq() < 1e-14) continue;
                    for (const q of tri)
                        attrs.forEach(([, attr], k) => {
                            for (let n = 0; n < attr.itemSize; n++)
                                output[k].push(q[offsets[k] + n]);
                        });
                }
        }
        geometry.setIndex(null);
        attrs.forEach(([name, attr], i) =>
            geometry.setAttribute(name, new THREE.Float32BufferAttribute(output[i], attr.itemSize)),
        );
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
    }
}
