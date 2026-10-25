import * as THREE from 'three';
import type { GeoJSON } from '@/types';

/** Two shared primitives per 200 m cell instead of two meshes per tree. */
export class TreeGenerator {
    private treeGroup = new THREE.Group();
    private trunk = new THREE.CylinderGeometry(1, 1.2, 1, 8);
    private canopy = new THREE.ConeGeometry(1, 1, 8);
    private bark = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });
    private leaves = new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.8 });
    constructor(private scene: THREE.Scene) {
        this.treeGroup.userData.isTreeGroup = true; this.treeGroup.userData.cullDistance = 650;
        this.treeGroup.name = 'Trees'; scene.add(this.treeGroup);
    }
    generateTreesFromGeoJSON(data: GeoJSON, centerLat: number, centerLon: number, heightAt: (x: number, z: number) => number = () => 0): void {
        this.clear();
        const cells = new Map<string, { trunks: THREE.Matrix4[]; leaves: THREE.Matrix4[] }>();
        const scale = Math.PI / 180 * 6371000; let count = 0;
        for (const f of data.features) {
            if (f.properties.natural !== 'tree' || f.geometry.type !== 'Point') continue;
            const [lon, lat] = f.geometry.coordinates, x = (lon - centerLon) * scale * Math.cos(centerLat * Math.PI / 180), z = -(lat - centerLat) * scale;
            const key = `${Math.floor(x / 200)},${Math.floor(z / 200)}`;
            let cell = cells.get(key); if (!cell) { cell = { trunks: [], leaves: [] }; cells.set(key, cell); }
            let seed = 2166136261; for (const c of String(f.id ?? f.properties['@id'] ?? `${lon},${lat}`)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
            const random = (shift: number) => ((seed >>> shift) % 1000) / 1000;
            const h = (2.5 + random(0) * 1.5) * 0.5, radius = (0.15 + random(4) * 0.1) * 0.5;
            const crown = h * (0.8 + random(8) * 0.4), y = heightAt(x, z);
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random(3) * Math.PI * 2);
            cell.trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + h / 2, z), q, new THREE.Vector3(radius, h, radius)));
            cell.leaves.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + h + crown / 2, z), q, new THREE.Vector3(crown * 0.6, crown, crown * 0.6)));
            count++;
        }
        for (const cell of cells.values()) for (const [matrices, geometry, material] of [[cell.trunks, this.trunk, this.bark], [cell.leaves, this.canopy, this.leaves]] as const) {
            const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
            matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.computeBoundingSphere();
            mesh.castShadow = mesh.receiveShadow = true; this.treeGroup.add(mesh);
        }
        this.treeGroup.userData.treeCount = count;
        console.log(`Generated ${count} trees in ${this.treeGroup.children.length} spatial batches`);
    }
    clear(): void { for (const mesh of this.treeGroup.children) (mesh as THREE.InstancedMesh).dispose(); this.treeGroup.clear(); }
    dispose(): void { this.clear(); this.trunk.dispose(); this.canopy.dispose(); this.bark.dispose(); this.leaves.dispose(); this.scene.remove(this.treeGroup); }
}
