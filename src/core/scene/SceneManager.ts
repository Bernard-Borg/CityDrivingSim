import * as THREE from "three";
import { CollisionWorld } from "./CollisionWorld";
import { RoadGenerator, ROAD_HEIGHT } from "./RoadGenerator";
import { TreeGenerator } from "./TreeGenerator";
import { BuildingGenerator } from "./BuildingGenerator";
import { ElevationTerrain, HgtTile } from "./ElevationTerrain";
import type { GeoJSON, GeoJSONFeature } from "@/types";
import type { RoadLevelSettings } from "./RoadProfiles";
import { useCitiesStore } from "@/stores/cities";

export class SceneManager {
    readonly collisions = new CollisionWorld();
    private disposed = false;
    private roadGenerator: RoadGenerator;
    private treeGenerator: TreeGenerator;
    private buildingGenerator: BuildingGenerator;
    private startPosition: THREE.Vector3;
    private centerLat: number = 0;
    private centerLon: number = 0;
    private currentCity: string = "";
    private groundGroup: THREE.Group | null = null;
    private groundMaterial: THREE.MeshStandardMaterial | null = null;
    private terrain: ElevationTerrain | null = null;
    private elevationTile: HgtTile | null = null;

    constructor(private scene: THREE.Scene) {
        this.roadGenerator = new RoadGenerator(scene, this.collisions);
        this.treeGenerator = new TreeGenerator(scene);
        this.buildingGenerator = new BuildingGenerator(scene, this.collisions);
        this.startPosition = new THREE.Vector3(0, ROAD_HEIGHT + 0.4, 0);
    }

    private coordinates(feature: GeoJSONFeature): Array<[number, number]> {
        const geometry = feature.geometry;
        if (geometry.type === "Point") return [geometry.coordinates];
        if (geometry.type === "LineString") return geometry.coordinates;
        return geometry.coordinates.flat();
    }

    private coveredData(data: GeoJSON, label: string): GeoJSON {
        if (!this.elevationTile) return data;
        const features = data.features.filter((feature) =>
            this.coordinates(feature).every(([lon, lat]) => {
                if (!this.elevationTile!.covers(lat, lon)) return false;
                const p = this.latLonToLocal(lat, lon);
                return !this.terrain || this.terrain.contains(p.x, p.z);
            }),
        );
        const omitted = data.features.length - features.length;
        if (omitted)
            console.warn(
                `Omitted ${omitted} ${label} features outside the supplied elevation coverage.`,
            );
        return { ...data, features };
    }

    private async optionalData(path: string): Promise<GeoJSON | null> {
        try {
            const response = await fetch(path, {
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.warn(`Optional scenery unavailable: ${path}`, error);
            return null;
        }
    }

    async loadCityMap(
        city: string,
        savedPosition?: { lat: number; lon: number; y?: number },
    ): Promise<void> {
        const cityStore = useCitiesStore();
        const config = cityStore.getCityConfig(city);
        if (!config) throw new Error(`City config not found: ${city}`);
        this.currentCity = city;
        this.centerLat = config.centerLat;
        this.centerLon = config.centerLon;
        const response = await fetch(`/data/roads/${config.file}`, {
            signal: AbortSignal.timeout(30000),
        });
        if (!response.ok)
            throw new Error(
                `Failed to load ${config.file}: ${response.status}`,
            );
        let data: GeoJSON = await response.json();
        if (this.disposed) return;
        this.clearScene();
        this.terrain = null;
        this.elevationTile = null;
        if (config.elevation) {
            const elevationResponse = await fetch(
                `/data/elevation/${config.elevation.file}`,
                { signal: AbortSignal.timeout(60000) },
            );
            if (!elevationResponse.ok)
                throw new Error(
                    `Failed to load elevation: ${elevationResponse.status}`,
                );
            const buffer = await elevationResponse.arrayBuffer();
            if (this.disposed) return;
            this.elevationTile = new HgtTile(
                buffer,
                config.elevation.south,
                config.elevation.west,
            );
            data = this.coveredData(data, "road");
            const bounds = {
                minX: Infinity,
                minZ: Infinity,
                maxX: -Infinity,
                maxZ: -Infinity,
            };
            for (const feature of data.features)
                for (const [lon, lat] of this.coordinates(feature)) {
                    const p = this.latLonToLocal(lat, lon);
                    bounds.minX = Math.min(bounds.minX, p.x);
                    bounds.maxX = Math.max(bounds.maxX, p.x);
                    bounds.minZ = Math.min(bounds.minZ, p.z);
                    bounds.maxZ = Math.max(bounds.maxZ, p.z);
                }
            if (!Number.isFinite(bounds.minX))
                throw new Error("No city roads overlap the supplied HGT tile.");
            this.terrain = new ElevationTerrain(
                this.elevationTile,
                this.centerLat,
                this.centerLon,
                bounds,
            );
            console.log(
                `Elevation enabled: ${this.terrain.columns} x ${this.terrain.rows} terrain grid; reference ${this.terrain.referenceHeight.toFixed(1)} m AMSL`,
            );
        }
        let roadLevels: Partial<RoadLevelSettings> = {};
        const levelsResponse = await fetch("/data/roads/road-levels.json", {
            signal: AbortSignal.timeout(15000),
        });
        if (levelsResponse.ok) {
            const levels = (await levelsResponse.json()) as {
                defaults?: Partial<RoadLevelSettings>;
                cities?: Record<string, Partial<RoadLevelSettings>>;
            };
            roadLevels = {
                ...levels.defaults,
                ...levels.cities?.[city],
                overrides: levels.cities?.[city]?.overrides ?? {},
            };
        }
        if (this.disposed) return;
        this.roadGenerator.setTerrain(this.terrain);
        this.roadGenerator.generateRoadsFromGeoJSON(
            data,
            this.centerLat,
            this.centerLon,
            roadLevels,
        );
        this.collisions.setTunnelQuery(
            (x, z, y) =>
                this.roadGenerator.getRoadState(x, z, y).structure === "tunnel",
        );
        this.collisions.setBounds(this.terrain?.bounds ?? null);
        if (!this.roadGenerator.getRoads().length)
            throw new Error("This city has no drivable roads.");
        this.createGround();
        const [treeData, buildingData] = await Promise.all([
            this.optionalData(`/data/trees/${config.file}`),
            this.optionalData(`/data/buildings/${config.file}`),
        ]);
        if (this.disposed) return;
        const heightAt = (x: number, z: number) =>
            this.terrain?.sample(x, z).height ?? 0;
        if (treeData) {
            const trees = this.coveredData(treeData, "tree");
            this.treeGenerator.generateTreesFromGeoJSON(
                trees,
                this.centerLat,
                this.centerLon,
                heightAt,
            );
            for (const feature of trees.features)
                if (feature.geometry.type === "Point") {
                    const [lon, lat] = feature.geometry.coordinates;
                    const p = this.latLonToLocal(lat, lon);
                    this.collisions.addTrunk(p, 0.25, heightAt(p.x, p.z));
                }
        }
        if (buildingData)
            this.buildingGenerator.generateBuildingsFromGeoJSON(
                this.coveredData(buildingData, "building"),
                this.centerLat,
                this.centerLon,
                heightAt,
            );
        if (savedPosition) {
            const local = this.latLonToLocal(
                savedPosition.lat,
                savedPosition.lon,
            );
            if (!this.terrain || this.terrain.contains(local.x, local.z))
                this.startPosition.set(
                    local.x,
                    Number.isFinite(savedPosition.y)
                        ? savedPosition.y!
                        : heightAt(local.x, local.z) + ROAD_HEIGHT + 0.4,
                    local.z,
                );
            else this.startPosition.copy(this.roadGenerator.getSpawnPosition());
        } else this.startPosition.copy(this.roadGenerator.getSpawnPosition());
        const spawn = {
            x: this.startPosition.x,
            z: this.startPosition.z,
            yaw: 0,
            vx: 0,
            vz: 0,
        };
        this.startPosition.y =
            this.roadGenerator.getRoadState(
                spawn.x,
                spawn.z,
                this.startPosition.y,
                true,
            ).height + 0.4;
        this.collisions.resolve(spawn, this.startPosition.y);
        this.startPosition.set(
            spawn.x,
            this.getRoadState(spawn.x, spawn.z, this.startPosition.y).height +
                0.4,
            spawn.z,
        );
    }

    private clearScene(): void {
        this.collisions.clear();
        if (this.groundGroup) {
            this.groundGroup.traverse((object) => {
                if (object instanceof THREE.Mesh) object.geometry.dispose();
            });
            this.scene.remove(this.groundGroup);
            this.groundGroup = null;
        }
        this.groundMaterial?.dispose();
        this.groundMaterial = null;
        this.roadGenerator.clear();
        this.treeGenerator.clear();
        this.buildingGenerator.clear();
    }

    private createGround(): void {
        this.groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x36b34a,
            roughness: 0.9,
            metalness: 0,
            polygonOffset: true,
            polygonOffsetFactor: 2,
            polygonOffsetUnits: 2,
        });
        this.groundGroup = new THREE.Group();
        this.scene.add(this.groundGroup);
        if (!this.terrain) {
            const geometry = new THREE.PlaneGeometry(50000, 50000);
            geometry.rotateX(-Math.PI / 2);
            this.roadGenerator.cutTerrainGeometry(geometry);
            const mesh = new THREE.Mesh(geometry, this.groundMaterial);
            mesh.receiveShadow = true;
            this.groundGroup.add(mesh);
            return;
        }
        const terrain = this.terrain;
        // Small chunks allow normal frustum culling instead of drawing a whole island per frame.
        const chunk = 32;
        for (let row = 0; row < terrain.rows - 1; row += chunk)
            for (let col = 0; col < terrain.columns - 1; col += chunk) {
                const width = Math.min(chunk, terrain.columns - col - 1),
                    depth = Math.min(chunk, terrain.rows - row - 1);
                const positions: number[] = [],
                    normals: number[] = [],
                    indices: number[] = [];
                for (let j = 0; j <= depth; j++)
                    for (let i = 0; i <= width; i++) {
                        const c = col + i,
                            r = row + j;
                        const x = terrain.bounds.minX + c * terrain.stepX,
                            z = terrain.bounds.minZ + r * terrain.stepZ;
                        positions.push(
                            x,
                            terrain.heights[r * terrain.columns + c],
                            z,
                        );
                        const nx =
                            (terrain.sample(x + 1, z).height -
                                terrain.sample(x - 1, z).height) /
                            2;
                        const nz =
                            (terrain.sample(x, z + 1).height -
                                terrain.sample(x, z - 1).height) /
                            2;
                        const n = new THREE.Vector3(-nx, 1, -nz).normalize();
                        normals.push(n.x, n.y, n.z);
                    }
                for (let j = 0; j < depth; j++)
                    for (let i = 0; i < width; i++) {
                        const a = j * (width + 1) + i,
                            b = a + 1,
                            c = a + width + 1,
                            d = c + 1;
                        indices.push(a, c, b, b, c, d);
                    }
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute(
                    "position",
                    new THREE.Float32BufferAttribute(positions, 3),
                );
                geometry.setAttribute(
                    "normal",
                    new THREE.Float32BufferAttribute(normals, 3),
                );
                geometry.setIndex(indices);
                this.roadGenerator.cutTerrainGeometry(geometry);
                geometry.computeBoundingSphere();
                const mesh = new THREE.Mesh(geometry, this.groundMaterial);
                mesh.receiveShadow = true;
                this.groundGroup.add(mesh);
            }
    }

    private latLonToLocal(lat: number, lon: number): { x: number; z: number } {
        const R = 6371000; // Earth radius in meters
        const dLat = ((lat - this.centerLat) * Math.PI) / 180;
        const dLon = ((lon - this.centerLon) * Math.PI) / 180;

        const x = dLon * R * Math.cos((this.centerLat * Math.PI) / 180);
        const z = -dLat * R;

        return { x, z };
    }

    /**
     * Convert local XZ coordinates back to lat/lon
     */
    localToLatLon(x: number, z: number): { lat: number; lon: number } {
        const R = 6371000; // Earth radius in meters
        // Reverse the conversion from latLonToLocal
        const dLat = -z / R; // Reverse z = -dLat * R
        const dLon = x / (R * Math.cos((this.centerLat * Math.PI) / 180)); // Reverse x = dLon * R * cos(centerLat)

        const lat = this.centerLat + (dLat * 180) / Math.PI;
        const lon = this.centerLon + (dLon * 180) / Math.PI;

        return { lat, lon };
    }

    /**
     * Get center coordinates for coordinate conversion
     */
    getCenterCoordinates(): { lat: number; lon: number } {
        return { lat: this.centerLat, lon: this.centerLon };
    }

    getStartPosition(): THREE.Vector3 {
        return this.startPosition.clone();
    }

    /**
     * Get the center position of the map (default spawn location when no saved position)
     */
    getCenterPosition(): THREE.Vector3 {
        const pos = this.roadGenerator.getSpawnPosition();
        const body = { x: pos.x, z: pos.z, yaw: 0, vx: 0, vz: 0 };
        this.collisions.resolve(body, pos.y);
        return new THREE.Vector3(
            body.x,
            this.getRoadState(body.x, body.z, pos.y).height + 0.4,
            body.z,
        );
    }

    getRoadState(x: number, z: number, y: number) {
        return this.roadGenerator.getRoadState(x, z, y);
    }

    dispose(): void {
        this.disposed = true;
        this.clearScene();
        this.roadGenerator.dispose();
        this.treeGenerator.dispose();
        this.buildingGenerator.dispose();
        this.terrain = null;
        this.elevationTile = null;
        this.roadGenerator.setTerrain(null);
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

    /**
     * Get road surface type at a world position (used for road noise)
     */
    getRoadSurfaceAtPosition(position: THREE.Vector3): string {
        return this.roadGenerator.getSurfaceAtPosition(position);
    }
}
