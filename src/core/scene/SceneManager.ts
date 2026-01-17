import * as THREE from 'three';
import { RoadGenerator } from './RoadGenerator';
import { TreeGenerator } from './TreeGenerator';
import { BuildingGenerator } from './BuildingGenerator';
import type { GeoJSON } from '@/types';
import { CityManager } from '@/utils/cityManager';

export class SceneManager {
    private roadGenerator: RoadGenerator;
    private treeGenerator: TreeGenerator;
    private buildingGenerator: BuildingGenerator;
    private startPosition: THREE.Vector3;
    private centerLat: number = 0;
    private centerLon: number = 0;
    private currentCity: string = '';
    private groundMesh: THREE.Mesh | null = null;

    constructor(private scene: THREE.Scene) {
        this.roadGenerator = new RoadGenerator(scene);
        this.treeGenerator = new TreeGenerator(scene);
        this.buildingGenerator = new BuildingGenerator(scene);
        this.startPosition = new THREE.Vector3(0, 1, 0);
    }

    async loadCityMap(city: string, savedPosition?: { lat: number; lon: number; y?: number; }): Promise<void> {
        try {
            const cityConfig = CityManager.getCityConfig(city);
            if (!cityConfig) {
                throw new Error(`City config not found: ${city}`);
            }

            this.currentCity = city;
            this.centerLat = cityConfig.centerLat;
            this.centerLon = cityConfig.centerLon;

            // Load city GeoJSON data
            const response = await fetch(`/data/roads/${cityConfig.file}`);
            if (!response.ok) {
                throw new Error(`Failed to load ${cityConfig.file}: ${response.status}`);
            }

            const geoJSON: GeoJSON = await response.json();

            // Clear existing scene (except lights)
            this.clearScene();

            // Create ground plane
            this.createGround();

            // Generate roads from GeoJSON
            this.roadGenerator.generateRoadsFromGeoJSON(geoJSON, this.centerLat, this.centerLon);

            // Load and generate trees
            try {
                const treeResponse = await fetch(`/data/trees/${cityConfig.file}`);
                if (treeResponse.ok) {
                    const treeGeoJSON: GeoJSON = await treeResponse.json();
                    this.treeGenerator.generateTreesFromGeoJSON(treeGeoJSON, this.centerLat, this.centerLon);
                } else {
                    console.log(`No tree data found for ${cityConfig.name}`);
                }
            } catch (error) {
                console.warn(`Failed to load tree data for ${city}:`, error);
            }

            // Load and generate buildings
            try {
                const buildingResponse = await fetch(`/data/buildings/${cityConfig.file}`);
                if (buildingResponse.ok) {
                    const buildingGeoJSON: GeoJSON = await buildingResponse.json();
                    this.buildingGenerator.generateBuildingsFromGeoJSON(buildingGeoJSON, this.centerLat, this.centerLon);
                } else {
                    console.log(`No building data found for ${cityConfig.name}`);
                }
            } catch (error) {
                console.warn(`Failed to load building data for ${city}:`, error);
            }

            // Clear GeoJSON reference to allow garbage collection
            // (The geoJSON object will be garbage collected after this scope)

            // Set starting position
            if (savedPosition) {
                // Convert saved lat/lon position to local coordinates
                const local = this.latLonToLocal(savedPosition.lat, savedPosition.lon);
                this.startPosition.set(local.x, savedPosition.y ?? 1, local.z);
                console.log(`Restored position: Lat ${savedPosition.lat.toFixed(6)}, Lon ${savedPosition.lon.toFixed(6)} -> Local (${local.x.toFixed(2)}, ${local.z.toFixed(2)})`);
            } else if (geoJSON.features.length > 0) {
                // Use first feature coordinate
                const firstFeature = geoJSON.features[0];
                if (firstFeature.geometry.type === 'LineString' && firstFeature.geometry.coordinates.length > 0) {
                    const [lon, lat] = firstFeature.geometry.coordinates[0];
                    const local = this.latLonToLocal(lat, lon);
                    this.startPosition.set(local.x, 1, local.z);
                    console.log(`Starting position: (${local.x.toFixed(2)}, ${local.z.toFixed(2)})`);
                }
            }

            console.log(`Loaded ${geoJSON.features.length} road features from ${cityConfig.name}`);
        } catch (error) {
            console.error(`Failed to load ${city} data:`, error);
            throw error;
        }
    }

    private clearScene(): void {
        // Dispose ground mesh if it exists
        if (this.groundMesh) {
            if (this.groundMesh.geometry) {
                this.groundMesh.geometry.dispose();
            }
            if (this.groundMesh.material instanceof THREE.Material) {
                this.groundMesh.material.dispose();
            }
            this.scene.remove(this.groundMesh);
            this.groundMesh = null;
        }

        // Clear road groups instead of removing them (they're needed by RoadGenerator)
        // Clear the road generator's groups
        this.roadGenerator.clear();

        // Clear trees
        this.treeGenerator.clear();

        // Clear buildings
        this.buildingGenerator.clear();

        // Remove other meshes and groups, but keep lights, camera, road groups, tree groups, and building groups
        const objectsToRemove: THREE.Object3D[] = [];
        this.scene.children.forEach((child) => {
            // Keep lights, camera, road groups, tree groups, and building groups
            if (!(child instanceof THREE.Light) &&
                !(child instanceof THREE.Camera) &&
                !(child instanceof THREE.Group && (child.userData.isRoadGroup || child.userData.isTreeGroup || child.userData.isBuildingGroup))) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach((obj) => {
            this.scene.remove(obj);
        });
    }

    private createGround(): void {
        // Create a much larger ground plane to ensure it covers all roads
        const groundSize = 50000; // 50km x 50km
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0.17, 1, 0.23), // Green grass color
            roughness: 0.8,
            metalness: 0,
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);

        // Rotate to lay flat on XZ plane (Y is up)
        const { x, z } = this.latLonToLocal(this.centerLat, this.centerLon);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(x, -1, z); // Center at origin
        ground.receiveShadow = true;
        // Ensure ground is not culled
        ground.frustumCulled = false;
        this.groundMesh = ground; // Store reference for disposal
        this.scene.add(ground);
    }

    private latLonToLocal(lat: number, lon: number): { x: number; z: number; } {
        const R = 6371000; // Earth radius in meters
        const dLat = (lat - this.centerLat) * Math.PI / 180;
        const dLon = (lon - this.centerLon) * Math.PI / 180;

        const x = dLon * R * Math.cos(this.centerLat * Math.PI / 180);
        const z = -dLat * R;

        return { x, z };
    }

    /**
     * Convert local XZ coordinates back to lat/lon
     */
    localToLatLon(x: number, z: number): { lat: number; lon: number; } {
        const R = 6371000; // Earth radius in meters
        // Reverse the conversion from latLonToLocal
        const dLat = -z / R; // Reverse z = -dLat * R
        const dLon = x / (R * Math.cos(this.centerLat * Math.PI / 180)); // Reverse x = dLon * R * cos(centerLat)

        const lat = this.centerLat + (dLat * 180 / Math.PI);
        const lon = this.centerLon + (dLon * 180 / Math.PI);

        return { lat, lon };
    }

    /**
     * Get center coordinates for coordinate conversion
     */
    getCenterCoordinates(): { lat: number; lon: number; } {
        return { lat: this.centerLat, lon: this.centerLon };
    }

    getStartPosition(): THREE.Vector3 {
        return this.startPosition.clone();
    }

    /**
     * Get the center position of the map (default spawn location when no saved position)
     */
    getCenterPosition(): THREE.Vector3 {
        // Convert centerLat/centerLon to local coordinates
        // This ensures the center position matches where the ground is positioned
        const local = this.latLonToLocal(this.centerLat, this.centerLon);
        return new THREE.Vector3(local.x, 1, local.z);
    }

    getCurrentCity(): string {
        return this.currentCity;
    }

    /**
     * Toggle visibility of street name labels
     */
    setLabelsVisible(visible: boolean): void {
        this.roadGenerator.setLabelsVisible(visible);
    }

    /**
     * Get current visibility state of street name labels
     */
    getLabelsVisible(): boolean {
        return this.roadGenerator.getLabelsVisible();
    }
}
