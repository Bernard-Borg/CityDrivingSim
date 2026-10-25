import * as THREE from 'three';
import type { GeoJSON } from '@/types';
import type { CollisionWorld } from './CollisionWorld';

export class BuildingGenerator {
    private buildings: THREE.Mesh[] = [];
    private buildingGroup = new THREE.Group();
    private sharedMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide });

    constructor(private scene: THREE.Scene, private collisions?: CollisionWorld) {
        this.buildingGroup.userData.isBuildingGroup = true;
        scene.add(this.buildingGroup);
    }

    generateBuildingsFromGeoJSON(data: GeoJSON, centerLat: number, centerLon: number, heightAt: (x: number, z: number) => number = () => 0): void {
        const scale = Math.PI / 180 * 6371000;
        const local = ([lon, lat]: [number, number]) => ({ x: (lon - centerLon) * scale * Math.cos(centerLat * Math.PI / 180), z: -(lat - centerLat) * scale });
        for (const feature of data.features) {
            if (feature.geometry.type !== 'Polygon') continue;
            const rings = feature.geometry.coordinates.map(ring => ring.map(local));
            if (!rings[0] || rings[0].length < 3) continue;
            const shape = new THREE.Shape();
            const addRing = (path: THREE.Path, ring: typeof rings[number]) => {
                path.moveTo(ring[0].x, -ring[0].z);
                for (const point of ring.slice(1)) path.lineTo(point.x, -point.z);
                path.closePath();
            };
            addRing(shape, rings[0]);
            for (const ring of rings.slice(1)) {
                if (ring.length < 3) continue;
                const hole = new THREE.Path(); addRing(hole, ring); shape.holes.push(hole);
            }
            const explicit = parseFloat(String(feature.properties.height ?? ''));
            const levels = parseFloat(String(feature.properties['building:levels'] ?? feature.properties.levels ?? 1));
            const height = Number.isFinite(explicit) && explicit > 0 ? explicit : (Number.isFinite(levels) && levels > 0 ? levels : 1) * 3;
            const elevations: number[] = [];
            // Include wall interiors, not only sparse polygon corners, when seating foundations.
            for (const ring of rings) for (let i = 0; i < ring.length; i++) {
                const a = ring[i], b = ring[(i + 1) % ring.length];
                const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 5));
                for (let j = 0; j < steps; j++) elevations.push(heightAt(a.x + (b.x - a.x) * j / steps, a.z + (b.z - a.z) * j / steps));
            }
            const base = Math.min(...elevations) - 0.25;
            const roof = Math.max(...elevations) + height;
            const geometry = new THREE.ExtrudeGeometry(shape, { depth: roof - base, bevelEnabled: false });
            geometry.rotateX(-Math.PI / 2);
            geometry.computeVertexNormals();
            const building = new THREE.Mesh(geometry, this.sharedMaterial);
            building.position.y = base;
            building.castShadow = building.receiveShadow = true;
            this.buildingGroup.add(building);
            this.buildings.push(building);
            this.collisions?.addPolygon(rings, base, roof);
        }
        console.log(`Generated ${this.buildings.length} buildings`);
    }

    clear(): void {
        this.buildings.forEach(building => building.geometry.dispose());
        this.buildingGroup.clear();
        this.buildings = [];
    }

    dispose(): void {
        this.clear();
        this.sharedMaterial.dispose();
        this.scene.remove(this.buildingGroup);
    }
}
