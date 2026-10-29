import { parseCoordinates, type MapLocation } from "../LocationSearch";
/**
 * SceneManager types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import { SceneVisibility } from "./SceneVisibility";
import { useLoadingStore } from "@/stores/loading";
import * as THREE from "three";
import { CollisionWorld } from "./CollisionWorld";
import { RoadGenerator, ROAD_HEIGHT } from "./RoadGenerator";
import { TreeGenerator } from "./TreeGenerator";
import { BuildingGenerator } from "./BuildingGenerator";
import type { TerrainBounds } from "./ElevationTerrain";
import { ElevationTerrain, HgtTile } from "./ElevationTerrain";
import { WaterGenerator } from "./WaterGenerator";
import { NaturalGenerator } from "./NaturalGenerator";
import { DecorGenerator } from "./DecorGenerator";
import type { GeoJSON, GeoJSONFeature } from "@/types";
import type { RoadLevelSettings } from "./RoadProfiles";
import { useCitiesStore } from "@/stores/cities";

/**
 * Loads city data and coordinates terrain, road, water, scenery, collision and visibility generation.
 */
export class SceneManager {
    readonly collisions = new CollisionWorld();
    private disposed = false;
    private visibility = new SceneVisibility();
    private sceneryRoots: THREE.Object3D[] = [];
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
    private flatBounds: TerrainBounds | null = null;
    private elevationTile: HgtTile | null = null;
    private water: WaterGenerator;
    private natural: NaturalGenerator;
    private decor: DecorGenerator;

    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param scene - Scene receiving generated objects; ownership remains with the caller.
     */
    constructor(private scene: THREE.Scene) {
        const existing = new Set(scene.children);
        this.roadGenerator = new RoadGenerator(scene, this.collisions);
        this.treeGenerator = new TreeGenerator(scene);
        this.buildingGenerator = new BuildingGenerator(scene, this.collisions);
        this.buildingGenerator.setGeometryCutter((geometry) =>
            this.roadGenerator.cutSceneryGeometry(geometry),
        );
        this.water = new WaterGenerator(scene);
        this.natural = new NaturalGenerator(scene);
        this.decor = new DecorGenerator(scene, this.collisions);
        this.sceneryRoots = scene.children.filter((object) => !existing.has(object));
        this.startPosition = new THREE.Vector3(0, ROAD_HEIGHT + 0.4, 0);
    }

    /**
     * Extracts coordinate pairs from a supported GeoJSON feature for elevation coverage checks.
     *
     * @param feature - GeoJSON feature to inspect.
     */
    private coordinates(feature: GeoJSONFeature): Array<[number, number]> {
        const geometry = feature.geometry;
        if (geometry.type === "Point") return [geometry.coordinates];
        if (geometry.type === "LineString") return geometry.coordinates;
        return geometry.type === "MultiPolygon"
            ? geometry.coordinates.flat(2)
            : geometry.coordinates.flat();
    }

    /**
     * Filters features outside the elevation tile or generated terrain coverage.
     *
     * @param data - OSM-derived GeoJSON collection.
     * @param label - Feature category for coverage diagnostics.
     */
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

    /**
     * Fetches optional scenery GeoJSON, returning null when loading fails or the resource is unavailable.
     *
     * @param path - Resource URL.
     */
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

    /**
     * Loads a city and builds its water, terrain, roads, scenery, collisions and visibility index with progress reporting.
     *
     * @param city - Configured city identifier.
     * @param savedPosition - Optional saved WGS84 coordinates and local elevation.
     */
    async loadCityMap(
        city: string,
        savedPosition?: { lat: number; lon: number; y?: number },
    ): Promise<void> {
        const loading = useLoadingStore();
        /**
         * Publishes a loading stage and checks for disposal before and after yielding to the UI.
         *
         * @param message - Loading stage label.
         * @param detail - Additional loading-stage information shown beneath the stage label.
         */
        const report = async (message: string, detail = "") => {
            if (this.disposed) throw new Error("City loading cancelled");
            await loading.stage(message, detail);
            if (this.disposed) throw new Error("City loading cancelled");
        };
        const cityStore = useCitiesStore();
        const config = cityStore.getCityConfig(city);
        if (!config) throw new Error(`City config not found: ${city}`);
        this.currentCity = city;
        this.centerLat = config.centerLat;
        this.centerLon = config.centerLon;
        await report("Loading road data", config.file);
        const response = await fetch(`/data/roads/${config.file}`, {
            signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error(`Failed to load ${config.file}: ${response.status}`);
        await report("Parsing road data", config.file);
        let data: GeoJSON = await response.json();
        if (this.disposed) return;
        this.clearScene();
        this.terrain = null;
        this.flatBounds = null;
        this.elevationTile = null;
        if (config.elevation) {
            await report("Loading elevation data", config.elevation.file);
            const elevationResponse = await fetch(`/data/elevation/${config.elevation.file}`, {
                signal: AbortSignal.timeout(60000),
            });
            if (!elevationResponse.ok)
                throw new Error(`Failed to load elevation: ${elevationResponse.status}`);
            const buffer = await elevationResponse.arrayBuffer();
            if (this.disposed) return;
            await report("Preparing terrain heights");
            this.elevationTile = new HgtTile(buffer, config.elevation.south, config.elevation.west);
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
        if (!this.terrain) {
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
            if (Number.isFinite(bounds.minX))
                this.flatBounds = {
                    minX: bounds.minX - 600,
                    maxX: bounds.maxX + 600,
                    minZ: bounds.minZ - 600,
                    maxZ: bounds.maxZ + 600,
                };
        }
        if (!this.terrain && this.flatBounds)
            this.terrain = new ElevationTerrain(
                null,
                this.centerLat,
                this.centerLon,
                this.flatBounds,
            );
        await report("Loading scenery data", "Nature, buildings and street furniture");
        const [naturalData, buildingData, decorData] = await Promise.all([
            this.optionalData(`/data/natural/${config.file}`),
            this.optionalData(`/data/buildings/${config.file}`),
            this.optionalData(`/data/decor/${config.file}`),
        ]);
        if (this.disposed) return;
        /**
         * Projects the input coordinates into the local coordinate system used by the current operation.
         *
         * @param lat - WGS84 latitude in decimal degrees.
         * @param lon - WGS84 longitude in decimal degrees.
         */
        const project = (lat: number, lon: number) => this.latLonToLocal(lat, lon);
        /**
         * Samples the represented surface height and, where available, slopes and contact metadata.
         *
         * @param x - Local eastward coordinate in metres.
         * @param z - Local southward coordinate in metres.
         */
        const sample = (x: number, z: number) =>
            this.terrain?.sample(x, z) ?? { height: 0, slopeX: 0, slopeZ: 0 };
        /**
         * Returns the represented surface elevation at a local horizontal position, or no value outside mapped water.
         *
         * @param x - Local eastward coordinate in metres.
         * @param z - Local southward coordinate in metres.
         */
        const heightAt = (x: number, z: number) => sample(x, z).height;
        await report("Generating water and coastlines");
        if (naturalData)
            this.water.generate(
                naturalData,
                project,
                this.terrain?.bounds ??
                    this.flatBounds ?? {
                        minX: -25000,
                        minZ: -25000,
                        maxX: 25000,
                        maxZ: 25000,
                    },
                sample,
                this.terrain?.referenceHeight ?? 0,
                (minimumAt) => {
                    let flatHeight = 0.15;
                    this.terrain?.raiseMinimum((x, z) => {
                        const floor = minimumAt(x, z);
                        flatHeight = Math.max(flatHeight, floor);
                        return floor;
                    });
                    // Without elevation data, retain a level map above its highest mapped water.
                    if (!this.elevationTile) this.terrain?.raiseMinimum(() => flatHeight);
                },
            );
        await report("Loading road-level settings");
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
        await this.roadGenerator.generateRoadsFromGeoJSON(
            data,
            this.centerLat,
            this.centerLon,
            roadLevels,
            (message, detail) => report(message, detail),
        );
        this.collisions.setTunnelQuery((x, z, y) => this.roadGenerator.isInTunnel(x, z, y));
        this.collisions.setRoadOpeningQuery((x, z, y, owner, tunnelsOnly) =>
            this.roadGenerator.isTunnelOpening(x, z, y, owner, tunnelsOnly),
        );
        this.collisions.setBounds(this.elevationTile ? (this.terrain?.bounds ?? null) : null);
        if (!this.roadGenerator.getRoads().length)
            throw new Error("This city has no drivable roads.");
        await report("Building terrain mesh");
        this.createGround();
        if (naturalData) {
            await report("Generating parks and beaches");
            this.natural.generate(naturalData, project, this.terrain, (geometry) => {
                this.roadGenerator.cutTerrainGeometry(geometry);
                this.water.cutTerrain(geometry, sample);
            });
            await report("Generating trees");
            const trees: GeoJSON = {
                ...naturalData,
                features: naturalData.features.filter(
                    (f) => f.properties.natural === "tree" && f.geometry.type === "Point",
                ),
            };
            // Fill mapped tree rows at 8 m intervals; avoid duplicating individually mapped trees.
            const occupied = new Set(
                trees.features.map((f) => {
                    const [lon, lat] = (f.geometry as { coordinates: [number, number] })
                        .coordinates;
                    const q = project(lat, lon);
                    return `${Math.round(q.x / 4)},${Math.round(q.z / 4)}`;
                }),
            );
            for (const f of naturalData.features)
                if (f.properties.natural === "tree_row" && f.geometry.type === "LineString") {
                    const coords = f.geometry.coordinates;
                    for (let i = 1; i < coords.length; i++) {
                        const a = project(coords[i - 1][1], coords[i - 1][0]),
                            b = project(coords[i][1], coords[i][0]);
                        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 8));
                        for (let j = 0; j < steps; j++) {
                            const t = j / steps,
                                x = a.x + (b.x - a.x) * t,
                                z = a.z + (b.z - a.z) * t;
                            const key = `${Math.round(x / 4)},${Math.round(z / 4)}`;
                            if (occupied.has(key)) continue;
                            occupied.add(key);
                            trees.features.push({
                                type: "Feature",
                                properties: { natural: "tree" },
                                geometry: {
                                    type: "Point",
                                    coordinates: [
                                        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
                                        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
                                    ],
                                },
                            });
                        }
                    }
                }
            const coveredTrees = this.coveredData(trees, "tree");
            this.treeGenerator.generateTreesFromGeoJSON(
                coveredTrees,
                this.centerLat,
                this.centerLon,
                heightAt,
            );
            for (const feature of coveredTrees.features)
                if (feature.geometry.type === "Point") {
                    const [lon, lat] = feature.geometry.coordinates,
                        p = project(lat, lon);
                    this.collisions.addTrunk(p, 0.25, heightAt(p.x, p.z));
                }
        }
        const scenery: GeoJSON = {
            type: "FeatureCollection",
            features: [
                ...(decorData?.features ?? []),
                ...(naturalData?.features.filter((f) => f.properties.natural === "shrub") ?? []),
            ],
        };
        await report(
            "Generating street furniture",
            `${scenery.features.length.toLocaleString()} mapped features`,
        );
        this.decor.generate(
            scenery,
            project,
            (x, z, layer, wall) => {
                if (wall) return this.roadGenerator.getWallHeight(x, z, layer);
                const ground = heightAt(x, z);
                const road = this.roadGenerator.getRoadState(x, z, ground + layer * 5 + 0.4, true);
                return road.roadId ? road.height : ground;
            },
            (x, z) => !this.terrain || this.terrain.contains(x, z),
        );
        await report(
            "Generating buildings and tunnel openings",
            `${buildingData?.features.length.toLocaleString() ?? 0} mapped features`,
        );
        if (buildingData)
            this.buildingGenerator.generateBuildingsFromGeoJSON(
                this.coveredData(buildingData, "building"),
                this.centerLat,
                this.centerLon,
                heightAt,
                config.buildings,
                (x, z) => this.water.heightAt(x, z),
                -(this.terrain?.referenceHeight ?? 0),
            );
        await report("Finding starting position");
        if (savedPosition) {
            const local = this.latLonToLocal(savedPosition.lat, savedPosition.lon);
            if (!this.elevationTile || !this.terrain || this.terrain.contains(local.x, local.z))
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
            this.roadGenerator.getRoadState(spawn.x, spawn.z, this.startPosition.y, true).height +
            0.4;
        this.collisions.resolve(spawn, this.startPosition.y);
        this.startPosition.set(
            spawn.x,
            this.getRoadState(spawn.x, spawn.z, this.startPosition.y).height + 0.4,
            spawn.z,
        );
        if (this.isInWater(this.startPosition))
            this.startPosition.copy(this.roadGenerator.getSpawnPosition());
        await report("Preparing nearby scenery");
        this.visibility.build([
            ...this.sceneryRoots,
            ...(this.groundGroup ? [this.groundGroup] : []),
        ]);
        this.visibility.update(this.startPosition, 0, true);
    }

    /**
     * Clears generated city content, collisions and visibility state while retaining reusable generators.
     */
    private clearScene(): void {
        this.visibility.clear();
        this.water.clear();
        this.natural.clear();
        this.decor.clear();
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

    /**
     * Builds chunked terrain and backdrop meshes, subtracting mapped water and road openings.
     */
    private createGround(): void {
        this.groundMaterial = new THREE.MeshStandardMaterial({
            color: 0xa49b80,
            roughness: 0.9,
            metalness: 0,
            polygonOffset: true,
            polygonOffsetFactor: 2,
            polygonOffsetUnits: 2,
        });
        this.groundGroup = new THREE.Group();
        this.scene.add(this.groundGroup);
        if (this.terrain && !this.elevationTile) {
            const b = this.terrain.bounds,
                edge =
                    Math.max(
                        25000,
                        Math.abs(b.minX),
                        Math.abs(b.maxX),
                        Math.abs(b.minZ),
                        Math.abs(b.maxZ),
                    ) + 1;
            for (const [minX, minZ, maxX, maxZ] of [
                [-edge, -edge, edge, b.minZ],
                [-edge, b.maxZ, edge, edge],
                [-edge, b.minZ, b.minX, b.maxZ],
                [b.maxX, b.minZ, edge, b.maxZ],
            ]) {
                const geometry = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);
                geometry.rotateX(-Math.PI / 2);
                geometry.translate((minX + maxX) / 2, this.terrain.heights[0], (minZ + maxZ) / 2);
                const mesh = new THREE.Mesh(geometry, this.groundMaterial);
                mesh.receiveShadow = true;
                this.groundGroup.add(mesh);
            }
        }
        if (!this.terrain) {
            const bounds = this.flatBounds ?? {
                minX: -600,
                minZ: -600,
                maxX: 600,
                maxZ: 600,
            };
            /**
             * Builds one flat ground patch and optionally subtracts road and water openings.
             *
             * @param minX - Western bound in local metres.
             * @param minZ - Northern bound in local metres.
             * @param maxX - Eastern bound in local metres.
             * @param maxZ - Southern bound in local metres.
             * @param cut - Geometry cutter applied to generated surfaces.
             */
            const addPatch = (
                minX: number,
                minZ: number,
                maxX: number,
                maxZ: number,
                cut: boolean,
            ) => {
                const width = maxX - minX,
                    depth = maxZ - minZ;
                if (width <= 0 || depth <= 0) return;
                const geometry = new THREE.PlaneGeometry(
                    width,
                    depth,
                    cut ? Math.ceil(width / 40) : 1,
                    cut ? Math.ceil(depth / 40) : 1,
                );
                geometry.rotateX(-Math.PI / 2);
                geometry.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
                if (cut) {
                    this.roadGenerator.cutTerrainGeometry(geometry);
                    this.water.cutTerrain(geometry, () => ({
                        height: 0,
                        slopeX: 0,
                        slopeZ: 0,
                    }));
                }
                geometry.computeBoundingSphere();
                const mesh = new THREE.Mesh(geometry, this.groundMaterial!);
                mesh.receiveShadow = true;
                this.groundGroup!.add(mesh);
            };
            // Bound clipping work to small triangles near the actual map. Cutting a
            // 50 km plane at once gathers every opening and fragments giant polygons.
            for (let z = bounds.minZ; z < bounds.maxZ; z += 400)
                for (let x = bounds.minX; x < bounds.maxX; x += 400)
                    addPatch(
                        x,
                        z,
                        Math.min(x + 400, bounds.maxX),
                        Math.min(z + 400, bounds.maxZ),
                        true,
                    );
            // Keep the surrounding flat backdrop without running cutouts outside map coverage.
            const edge =
                Math.max(
                    25000,
                    Math.abs(bounds.minX),
                    Math.abs(bounds.maxX),
                    Math.abs(bounds.minZ),
                    Math.abs(bounds.maxZ),
                ) + 1;
            addPatch(-edge, -edge, edge, bounds.minZ, false);
            addPatch(-edge, bounds.maxZ, edge, edge, false);
            addPatch(-edge, bounds.minZ, bounds.minX, bounds.maxZ, false);
            addPatch(bounds.maxX, bounds.minZ, edge, bounds.maxZ, false);
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
                        positions.push(x, terrain.heights[r * terrain.columns + c], z);
                        const nx =
                            (terrain.sample(x + 1, z).height - terrain.sample(x - 1, z).height) / 2;
                        const nz =
                            (terrain.sample(x, z + 1).height - terrain.sample(x, z - 1).height) / 2;
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
                geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
                geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
                geometry.setIndex(indices);
                this.roadGenerator.cutTerrainGeometry(geometry);
                this.water.cutTerrain(geometry, (x, z) => terrain.sample(x, z));
                geometry.computeBoundingSphere();
                const mesh = new THREE.Mesh(geometry, this.groundMaterial);
                mesh.receiveShadow = true;
                this.groundGroup.add(mesh);
            }
    }

    /**
     * Projects WGS84 latitude/longitude into local metres with X east and Z south.
     *
     * @param lat - WGS84 latitude in decimal degrees.
     * @param lon - WGS84 longitude in decimal degrees.
     */
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

    /**
     * Returns the selected vehicle spawn position in local metres.
     */
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

    /**
     * Selects a reachable road contact at a vehicle position, falling back to terrain.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     * @param y - Local elevation in metres.
     */
    getRoadState(x: number, z: number, y: number) {
        return this.roadGenerator.getRoadState(x, z, y);
    }

    /**
     * Checks whether a local position intersects mapped water at its elevation.
     *
     * @param position - Local position or saved geographic position, as indicated by the parameter type.
     */
    isInWater(position: THREE.Vector3): boolean {
        const waterHeight = this.water.heightAt(position.x, position.z);
        if (waterHeight === null) return false;
        const road = this.getRoadState(position.x, position.z, position.y);
        // Bridges and enclosed tunnels retain their own contact even over/under water.
        if (road.roadId && (road.structure === "tunnel" || road.height > waterHeight + 0.15))
            return false;
        return true;
    }

    /**
     * Advances water animation and scenery activation around the supplied observer.
     *
     * @param elapsed - Animation time in seconds.
     * @param position - Local position or saved geographic position, as indicated by the parameter type.
     * @param force - Whether to bypass the normal refresh interval.
     */
    update(elapsed: number, position?: THREE.Vector3, force = false): void {
        this.water.update(elapsed);
        this.buildingGenerator.update(elapsed);
        if (position) this.visibility.update(position, elapsed, force);
    }

    /**
     * Releases owned resources and unregisters scene objects, browser listeners or audio nodes as applicable.
     */
    dispose(): void {
        this.disposed = true;
        this.clearScene();
        this.roadGenerator.dispose();
        this.treeGenerator.dispose();
        this.buildingGenerator.dispose();
        this.water.dispose();
        this.natural.dispose();
        this.decor.dispose();
        this.terrain = null;
        this.elevationTile = null;
        this.roadGenerator.setTerrain(null);
    }

    /**
     * Returns the identifier of the currently loaded city.
     */
    /** Searches loaded street names or a decimal latitude/longitude pair within terrain bounds.
     * @param query - Street name or latitude followed by longitude.
     * @returns Teleport destinations within the loaded map.
     */
    searchLocations(query: string): MapLocation[] {
        const coordinate = parseCoordinates(query);
        if (coordinate) {
            this.teleportPosition(coordinate.lat, coordinate.lon);
            return [{ label: 'Coordinates', ...coordinate }];
        }
        return this.roadGenerator.findStreets(query).filter(item => !this.terrain || this.terrain.contains(item.position.x, item.position.z))
            .map(item => ({ label: item.name, ...this.localToLatLon(item.position.x, item.position.z), y: item.position.y }));
    }

    /** Resolves a map-bounded destination to a vehicle-centre position on its road or terrain.
     * @param lat - WGS84 latitude in degrees.
     * @param lon - WGS84 longitude in degrees.
     * @param y - Optional solved street-deck elevation in local metres.
     * @returns A new local destination vector; rejects points outside loaded terrain.
     */
    teleportPosition(lat: number, lon: number, y?: number): THREE.Vector3 {
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Enter valid latitude and longitude.');
        const point = this.latLonToLocal(lat, lon);
        if (!this.terrain || !this.terrain.contains(point.x, point.z)) throw new Error('That location is outside the loaded map.');
        const ground = this.terrain.sample(point.x, point.z).height;
        const road = this.roadGenerator.getRoadState(point.x, point.z, (y ?? ground + 0.4), true);
        return new THREE.Vector3(point.x, road.height + 0.4, point.z);
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
