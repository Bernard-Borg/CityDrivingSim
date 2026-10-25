import * as THREE from 'three';
import type { GeoJSON } from '@/types';
import type { Point } from './CollisionWorld';
import type { ElevationTerrain } from './ElevationTerrain';

/** Draped OSM land cover; shared materials add world-space grain without image downloads. */
export class NaturalGenerator {
    private group = new THREE.Group();
    private materials = new Map<string, THREE.MeshStandardMaterial>();
    constructor(private scene: THREE.Scene) { this.group.name = 'Natural land cover'; scene.add(this.group); }
    generate(data: GeoJSON, project: (lat: number, lon: number) => Point, terrain: ElevationTerrain | null,
        cut: (geometry: THREE.BufferGeometry) => void): void {
        this.clear();
        const colors: Record<string, number> = { beach: 0xddc594, park: 0x66834b, garden: 0x779757,
            bare_rock: 0x9b9589, scree: 0xa99e8e, shrubbery: 0x526b39, grassland: 0x81915a, wood: 0x4c6a3d, scrub: 0x70804b };
        const counts: Record<string, number> = {};
        for (const feature of data.features) {
            const p = feature.properties;
            const kind = String(p.leisure === 'park' || p.leisure === 'garden' ? p.leisure : p.natural);
            if (!(kind in colors) || feature.geometry.type !== 'Polygon') continue;
            const rings = feature.geometry.coordinates.map(ring => ring.map(([lon, lat]) => {
                const pt = project(lat, lon); return new THREE.Vector2(pt.x, pt.z);
            }));
            if (!rings[0]?.length) continue;
            // Remove the repeated closing vertex before triangulation (including holes).
            for (const ring of rings) if (ring.length > 1 && ring[0].equals(ring[ring.length - 1])) ring.pop();
            const faces = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1));
            const points = rings.flat(), positions: number[] = [];
            for (const face of faces) {
                const triangle = face.map(i => ({ x: points[i].x, z: points[i].y }));
                const polygons = terrain ? terrain.cutTriangle(triangle) : [triangle];
                for (const poly of polygons) for (let i = 1; i < poly.length - 1; i++)
                    for (const v of [poly[0], poly[i + 1], poly[i]]) positions.push(v.x, terrain?.sample(v.x, v.z).height ?? 0, v.z);
            }
            if (!positions.length) continue;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            cut(geometry); // Preserve water openings and tunnel portals in every cover layer.
            const attr = geometry.getAttribute('position');
            const clearance = kind === 'garden' ? 0.028 : kind === 'park' ? 0.02 : 0.035;
            for (let i = 0; i < attr.count; i++) attr.setY(i, attr.getY(i) + clearance);
            geometry.computeVertexNormals(); geometry.computeBoundingSphere();
            let material = this.materials.get(kind);
            if (!material) {
                material = new THREE.MeshStandardMaterial({ color: colors[kind], roughness: 1, side: THREE.DoubleSide });
                material.onBeforeCompile = shader => {
                    shader.vertexShader = 'varying vec2 coverPosition;\n' + shader.vertexShader;
                    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ncoverPosition = position.xz;');
                    shader.fragmentShader = 'varying vec2 coverPosition;\n' + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
                        float grain = fract(sin(dot(floor(coverPosition * 6.0), vec2(12.9898,78.233))) * 43758.5453);
                        float patch = sin(coverPosition.x * 0.19) * sin(coverPosition.y * 0.23);
                        diffuseColor.rgb *= 0.94 + grain * 0.12 + patch * 0.035;`);
                };
                this.materials.set(kind, material);
            }
            const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true;
            mesh.name = String(p.name ?? kind); this.group.add(mesh); counts[kind] = (counts[kind] ?? 0) + 1;
        }
        console.log('Natural land cover:', counts);
    }
    clear(): void { for (const child of this.group.children) (child as THREE.Mesh).geometry.dispose(); this.group.clear(); }
    dispose(): void { this.clear(); for (const m of this.materials.values()) m.dispose(); this.scene.remove(this.group); }
}
