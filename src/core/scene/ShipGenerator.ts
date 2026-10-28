/** Procedural moored vessels derived from OSM building footprints. @packageDocumentation */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Point, CollisionWorld } from './CollisionWorld';
import type { GeoJSONFeature } from '@/types';

/** Creates water-seated hulls and ship details; shared materials are owned by this generator. */
export class ShipGenerator {
    private materials = {
        hull: new THREE.MeshStandardMaterial({ color: 0x27383c, roughness: 0.65, side: THREE.DoubleSide }),
        keel: new THREE.MeshStandardMaterial({ color: 0x793e32, roughness: 0.8, side: THREE.DoubleSide }),
        deck: new THREE.MeshStandardMaterial({ color: 0xa68c67, roughness: 0.9, side: THREE.DoubleSide }),
        cabin: new THREE.MeshStandardMaterial({ color: 0xe6e3d8, roughness: 0.7 }),
        glass: new THREE.MeshStandardMaterial({ color: 0x203f4c, roughness: 0.3, metalness: 0.15 }),
    };

    /** Builds a vessel in local metres with its waterline fixed to the supplied water elevation.
     * @param outer - Projected OSM footprint without the repeated closing vertex.
     * @param tags - Ship name, height and ship-type tags.
     * @param water - Local mapped water elevation, excluding any visual surface offset.
     * @param collisions - Optional world receiving the vessel hull obstacle.
     * @returns A group whose geometry is owned by the caller; materials remain shared here.
     */
    generate(outer: Point[], tags: GeoJSONFeature['properties'], water: number, collisions?: CollisionWorld): THREE.Group {
        const group = new THREE.Group(); group.name = String(tags.name ?? 'Moored ship');
        const cx = outer.reduce((n, p) => n + p.x, 0) / outer.length;
        const cz = outer.reduce((n, p) => n + p.z, 0) / outer.length;
        let xx = 0, zz = 0, xz = 0;
        for (const p of outer) { xx += (p.x - cx) ** 2; zz += (p.z - cz) ** 2; xz += (p.x - cx) * (p.z - cz); }
        const angle = 0.5 * Math.atan2(2 * xz, xx - zz), cos = Math.cos(angle), sin = Math.sin(angle);
        const ring = outer.map(p => new THREE.Vector2((p.x - cx) * cos + (p.z - cz) * sin, -(p.x - cx) * sin + (p.z - cz) * cos));
        const minX = Math.min(...ring.map(p => p.x)), maxX = Math.max(...ring.map(p => p.x));
        const minZ = Math.min(...ring.map(p => p.y)), maxZ = Math.max(...ring.map(p => p.y));
        const length = maxX - minX, width = maxZ - minZ, midX = (minX + maxX) / 2, midZ = (minZ + maxZ) / 2;
        const freeboard = THREE.MathUtils.clamp(width * 0.16, 0.7, 2.5), draft = Math.min(2, width * 0.2);
        const batches = new Map<keyof ShipGenerator['materials'], THREE.BufferGeometry[]>();
        /** Queues owned geometry for merging by material. */
        const add = (kind: keyof ShipGenerator['materials'], geometry: THREE.BufferGeometry): void => {
            const list = batches.get(kind) ?? []; list.push(geometry); batches.set(kind, list);
        };
        /** Adds an axis-aligned ship-local box with its centre at the supplied location. */
        const box = (kind: keyof ShipGenerator['materials'], x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
            add(kind, new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));
        };
        /** Builds a hull band between two scaled footprint rings. */
        const band = (kind: 'hull' | 'keel', low: number, high: number, inset: number): void => {
            const positions: number[] = [];
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i], b = ring[(i + 1) % ring.length];
                const v = [[midX + (a.x - midX) * inset, low, midZ + (a.y - midZ) * inset],
                    [midX + (b.x - midX) * inset, low, midZ + (b.y - midZ) * inset], [a.x, high, a.y], [b.x, high, b.y]];
                for (const j of [0, 1, 2, 2, 1, 3]) positions.push(...v[j]);
            }
            const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals(); add(kind, geometry);
        };
        band('keel', -draft, 0.05, 0.55); band('hull', 0.05, freeboard, 1);
        const shape = new THREE.Shape(ring);
        const deck = new THREE.ShapeGeometry(shape); deck.rotateX(Math.PI / 2); deck.translate(0, freeboard, 0); add('deck', deck);
        const sailing = /sail|rigged/i.test(String(tags['ship:type'] ?? '') + ' ' + String(tags['description:en'] ?? ''));
        const taggedHeight = parseFloat(String(tags.height ?? ''));
        const cabinHeight = sailing ? 1.3 : THREE.MathUtils.clamp(Number.isFinite(taggedHeight) ? taggedHeight - freeboard : width * 0.35, 1.5, 6);
        box('cabin', midX - length * 0.1, freeboard + cabinHeight / 2, midZ, length * 0.42, cabinHeight, width * 0.58);
        box('deck', midX - length * 0.1, freeboard + cabinHeight + 0.12, midZ, length * 0.46, 0.24, width * 0.64);
        const windows = Math.min(24, Math.max(2, Math.floor(length * 0.4 / 2.4)));
        for (const side of [-1, 1]) for (let i = 0; i < windows; i++) {
            box('glass', midX - length * 0.3 + length * 0.4 * (i + 0.5) / windows, freeboard + cabinHeight * 0.6,
                midZ + side * width * 0.292, Math.min(1.2, length * 0.22 / windows), cabinHeight * 0.38, 0.08);
        }
        if (!sailing) {
            box('cabin', midX + length * 0.1, freeboard + cabinHeight + 0.8, midZ, length * 0.12, 1.6, width * 0.5);
            box('glass', midX + length * 0.162, freeboard + cabinHeight + 0.9, midZ, 0.08, 0.65, width * 0.42);
            box('hull', midX - length * 0.22, freeboard + cabinHeight + 1.1, midZ, Math.max(0.6, width * 0.13), 2.2, width * 0.16);
        }
        const mastHeight = sailing ? Math.min(28, length * 0.42) : cabinHeight + 3;
        for (const fraction of sailing ? [-0.27, 0, 0.27] : [0.3]) {
            const x = midX + length * fraction;
            add('deck', new THREE.CylinderGeometry(0.09, 0.16, mastHeight, 6).translate(x, freeboard + mastHeight / 2, midZ));
            if (sailing) for (const tier of [0.45, 0.65, 0.83]) box('hull', x, freeboard + mastHeight * tier, midZ, 0.12, 0.12, width * (1.4 - tier));
        }
        for (const [kind, geometries] of batches) {
            // Match attribute layouts before merging primitive and custom hull geometry.
            for (let i = 0; i < geometries.length; i++) {
                if (geometries[i].index) { const old = geometries[i]; geometries[i] = old.toNonIndexed(); old.dispose(); }
                geometries[i].deleteAttribute('uv');
            }
            const geometry = mergeGeometries(geometries, false);
            for (const g of geometries) g.dispose();
            if (!geometry) continue;
            const mesh = new THREE.Mesh(geometry, this.materials[kind]); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
        }
        group.rotation.y = -angle; group.position.set(cx, water, cz);
        collisions?.addPolygon([outer], water - draft, water + freeboard + cabinHeight);
        return group;
    }

    /** Releases shared ship materials; callers dispose generated geometry separately. */
    dispose(): void { for (const material of Object.values(this.materials)) material.dispose(); }
}
