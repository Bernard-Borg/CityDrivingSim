import * as THREE from 'three';
import type { GeoJSON } from '@/types';

export class TreeGenerator {
    private trees: THREE.Group[] = [];
    private treeGroup: THREE.Group;
    private sharedMaterials: {
        trunkMaterial: THREE.MeshStandardMaterial;
        leavesMaterial: THREE.MeshStandardMaterial;
    };

    constructor(private scene: THREE.Scene) {
        this.treeGroup = new THREE.Group();
        // Mark group so it's not removed during scene clearing
        this.treeGroup.userData.isTreeGroup = true;
        this.scene.add(this.treeGroup);

        // Shared materials for all trees
        this.sharedMaterials = {
            trunkMaterial: new THREE.MeshStandardMaterial({
                color: 0x8B4513, // Brown
                roughness: 0.9,
                metalness: 0.1
            }),
            leavesMaterial: new THREE.MeshStandardMaterial({
                color: 0x228B22, // Forest green
                roughness: 0.8,
                metalness: 0.0
            })
        };
    }

    /**
     * Convert lat/lon to local 3D coordinates
     */
    private latLonToLocal(lat: number, lon: number, centerLat: number, centerLon: number): { x: number; z: number; } {
        const R = 6371000; // Earth radius in meters
        const dLat = (lat - centerLat) * Math.PI / 180;
        const dLon = (lon - centerLon) * Math.PI / 180;

        const x = dLon * R * Math.cos(centerLat * Math.PI / 180);
        const z = -dLat * R;

        return { x, z };
    }

    /**
     * Create a simple 3D tree model
     */
    private createTreeModel(): THREE.Group {
        const tree = new THREE.Group();

        // Trunk (cylinder)
        const trunkHeight = 2.5 + Math.random() * 1.5; // Random height between 2.5-4m
        const trunkRadius = 0.15 + Math.random() * 0.1; // Random radius between 0.15-0.25m
        const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.2, trunkHeight, 8);
        const trunk = new THREE.Mesh(trunkGeometry, this.sharedMaterials.trunkMaterial);
        trunk.position.y = trunkHeight / 2;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        tree.add(trunk);

        // Leaves (cone or multiple cones for more natural look)
        const leavesHeight = trunkHeight * 0.8 + Math.random() * trunkHeight * 0.4;
        const leavesRadius = leavesHeight * 0.6;
        const leavesGeometry = new THREE.ConeGeometry(leavesRadius, leavesHeight, 8);
        const leaves = new THREE.Mesh(leavesGeometry, this.sharedMaterials.leavesMaterial);
        leaves.position.y = trunkHeight + leavesHeight / 2;
        leaves.castShadow = true;
        leaves.receiveShadow = true;
        tree.add(leaves);

        // Add slight random rotation for variety
        tree.rotation.y = Math.random() * Math.PI * 2;

        return tree;
    }

    /**
     * Generate trees from GeoJSON data
     */
    generateTreesFromGeoJSON(geoJSON: GeoJSON, centerLat: number, centerLon: number): void {
        let treesCreated = 0;

        for (const feature of geoJSON.features) {
            if (feature.geometry.type === 'Point' && feature.geometry.coordinates.length >= 2) {
                const [lon, lat] = feature.geometry.coordinates;

                // Convert to local coordinates
                const local = this.latLonToLocal(lat, lon, centerLat, centerLon);

                // Create tree model
                const tree = this.createTreeModel();
                tree.position.set(local.x, 0, local.z);

                this.treeGroup.add(tree);
                this.trees.push(tree);
                treesCreated++;
            }
        }

        console.log(`Generated ${treesCreated} trees`);
    }

    /**
     * Clear all trees from the scene
     */
    clear(): void {
        // Dispose of all tree meshes
        this.trees.forEach(tree => {
            this.disposeTree(tree);
        });

        // Remove all children from the group
        const children = [...this.treeGroup.children];
        children.forEach(child => {
            this.treeGroup.remove(child);
        });

        this.trees = [];
    }

    /**
     * Dispose of a tree's resources
     */
    private disposeTree(tree: THREE.Group): void {
        tree.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                // Don't dispose shared materials - they're reused
            }
        });
    }
}
