/**
 * RoadGenerator types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import { sidewalkWidths } from "./Sidewalks";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three";
import { ElevationTerrain } from "./ElevationTerrain";
import type { SurfaceSample } from "./ElevationTerrain";
import type { GeoJSON } from "@/types";
import { RoadProfileNetwork, DEFAULT_ROAD_LEVELS } from "./RoadProfiles";
import type { RoadProfile, RoadInput, RoadLevelSettings, RoadContact } from "./RoadProfiles";
import { RoadCutouts } from "./RoadCutouts";
import { RoadCorridors } from "./RoadCorridors";
import { SpatialGrid, closestPoint, CollisionWorld } from "./CollisionWorld";

export const ROAD_HEIGHT = 0.06;
interface RoadSegment {
    a: THREE.Vector3;
    b: THREE.Vector3;
    halfWidth: number;
    surface: string;
    profile: RoadProfile;
    startT?: number;
    endT?: number;
}

/**
 * Builds and owns road surfaces, markings, bridge sides, tunnel linings and street labels.
 * Coordinates use local metres: X points east, Z points south, and Y is elevation relative to the city reference.
 * The caller owns the scene, collision world and terrain; dispose releases generated rendering resources.
 */
export class RoadGenerator {
    private terrain: ElevationTerrain | null = null;
    private activeProfile: RoadProfile | null = null;
    private profiles: RoadProfile[] = [];
    private settings: RoadLevelSettings = DEFAULT_ROAD_LEVELS;
    private cutouts = new RoadCutouts();
    private corridors = new RoadCorridors();
    /**
     * Checks whether a world-space point lies within a generated tunnel corridor.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     * @param y - Local elevation in metres; contact queries expect the vehicle centre, approximately 0.4 metres above the deck.
     * @returns True when the point is inside a tunnel corridor.
     */
    isInTunnel(x: number, z: number, y: number): boolean {
        return this.corridors.contains(x, z, y);
    }
    /**
     * Checks whether another road corridor opens into the specified road at a point.
     * Includes surface and bridge corridors, excluding the owning road itself.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     * @param y - Local elevation in metres; contact queries expect the vehicle centre, approximately 0.4 metres above the deck.
     * @param owner - Road identifier excluded from the opening query.
     * @returns True when another corridor covers the point.
     */
    isTunnelOpening(x: number, z: number, y: number, owner: string): boolean {
        return this.corridors.contains(x, z, y, owner, false);
    }
    /**
     * Subtracts tunnel corridor volumes from scenery geometry in place, preserving interpolated vertex attributes.
     *
     * @param geometry - Buffer geometry to modify in place.
     */
    cutSceneryGeometry(geometry: THREE.BufferGeometry): void {
        this.corridors.cut(geometry);
    }
    /**
     * Sets the borrowed height field used for subsequent road generation and contact queries.
     *
     * @param terrain - Shared terrain sampler, or null for a flat map.
     */
    setTerrain(terrain: ElevationTerrain | null): void {
        this.terrain = terrain;
    }
    /**
     * Samples terrain height and slopes, or returns a flat zero-height surface when no terrain is configured.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     * @returns Terrain height and X/Z slopes in local units.
     */
    private groundSample(x: number, z: number): SurfaceSample {
        return this.terrain?.sample(x, z) ?? { height: 0, slopeX: 0, slopeZ: 0 };
    }
    /**
     * Samples the road currently being generated, falling back to terrain plus the road clearance.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     * @returns Road surface elevation in local metres.
     */
    private roadHeight(x: number, z: number): number {
        return (
            this.activeProfile?.sample(x, z).height ?? this.groundSample(x, z).height + ROAD_HEIGHT
        );
    }

    /**
     * Rebuilds surface geometry at the active road elevation and requested clearance.
     * Ground roads are split along terrain triangles; UVs are interpolated and normals and bounds are recomputed.
     *
     * @param geometry - Buffer geometry to modify in place.
     * @param clearance - Surface clearance in metres; ROAD_HEIGHT denotes the road surface itself.
     */
    private drapeSurface(geometry: THREE.BufferGeometry, clearance: number): void {
        if (!this.terrain && !this.activeProfile) return;
        const position = geometry.getAttribute("position"),
            uv = geometry.getAttribute("uv");
        const index = geometry.getIndex();
        const positions: number[] = [],
            uvs: number[] = [];
        const count = index ? index.count : position.count;
        for (let i = 0; i < count; i += 3) {
            const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
            const tri = ids.map((id) => ({
                x: position.getX(id),
                z: position.getZ(id),
            }));
            const [a, b, c] = tri;
            const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
            if (Math.abs(det) < 1e-10) continue;
            for (const poly of this.terrain && this.activeProfile?.input.kind === "ground"
                ? this.terrain.cutTriangle(tri)
                : [tri]) {
                for (let j = 1; j < poly.length - 1; j++)
                    for (const p of [poly[0], poly[j], poly[j + 1]]) {
                        positions.push(
                            p.x,
                            this.roadHeight(p.x, p.z) + clearance - ROAD_HEIGHT,
                            p.z,
                        );
                        if (uv) {
                            const v = ((p.x - a.x) * (c.z - a.z) - (p.z - a.z) * (c.x - a.x)) / det;
                            const w = ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) / det;
                            const u = 1 - v - w;
                            uvs.push(
                                uv.getX(ids[0]) * u + uv.getX(ids[1]) * v + uv.getX(ids[2]) * w,
                                uv.getY(ids[0]) * u + uv.getY(ids[1]) * v + uv.getY(ids[2]) * w,
                            );
                        }
                    }
            }
        }
        geometry.setIndex(null);
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        if (uv) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
    }

    private roads: THREE.Mesh[] = [];
    private roadGroup: THREE.Group;
    private labelsGroup: THREE.Group;
    private tunnelGroup: THREE.Group;
    private labelTextures: THREE.CanvasTexture[] = [];
    private roadSurfaceSamples: Array<{
        points: THREE.Vector3[];
        halfWidth: number;
        surface: string;
        profile: RoadProfile;
    }> = [];
    private surfaceGrid = new SpatialGrid<RoadSegment>();
    private readonly surfaceSampleSpacing = 2; // meters between surface samples

    // Shared materials to avoid creating duplicates
    private sharedMaterials = {
        roadMaterial: new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.9,
            metalness: 0.1,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide,
        }),
        tunnelMaterial: new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.9,
            metalness: 0.1,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide,
        }),
        edgeLineMaterial: new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0xffff00,
            emissiveIntensity: 0.5,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
            side: THREE.DoubleSide,
        }),
        laneDividerMaterial: new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.3,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
            side: THREE.DoubleSide,
        }),
        sidewalkMaterial: new THREE.MeshStandardMaterial({ color: 0x999b9b, roughness: 0.95, side: THREE.DoubleSide }),
        ceilingMaterial: new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.8,
            metalness: 0.2,
            side: THREE.DoubleSide,
        }),
    };

    /**
     * Creates road, tunnel and label groups and attaches them to the supplied scene.
     *
     * @param scene - Scene receiving generated groups; remains owned by the caller.
     * @param collisions - Optional collision world receiving generated road barriers.
     * @returns function Object() { [native code] }
     */
    constructor(
        private scene: THREE.Scene,
        private collisions?: CollisionWorld,
    ) {
        this.roadGroup = new THREE.Group();
        this.labelsGroup = new THREE.Group();
        this.tunnelGroup = new THREE.Group();

        // Mark groups so they're not removed during scene clearing
        this.roadGroup.userData.isRoadGroup = true;
        this.labelsGroup.userData.isRoadGroup = true;
        this.tunnelGroup.userData.isRoadGroup = true;

        this.roadGroup.userData.cullDistance = 1200;
        this.tunnelGroup.userData.cullDistance = 1200;
        this.labelsGroup.userData.cullDistance = 220;
        this.scene.add(this.roadGroup);
        this.scene.add(this.labelsGroup);
        this.scene.add(this.tunnelGroup);
    }

    /**
     * Releases generated object resources recursively while retaining shared materials on single-material meshes.
     *
     * @param object - Generated object whose owned resources should be released.
     */
    private disposeObject(object: THREE.Object3D): void {
        if (object instanceof THREE.Mesh) {
            // Dispose geometry
            if (object.geometry) {
                object.geometry.dispose();
            }

            // Dispose material(s)
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach((material) => {
                        if (material.map) material.map.dispose();
                        material.dispose();
                    });
                } else {
                    // Only dispose if not a shared material
                    const materialId = (object.material as any).uuid;
                    const isShared = Object.values(this.sharedMaterials).some(
                        (m) => m.uuid === materialId,
                    );
                    if (!isShared) {
                        object.material.map?.dispose();
                        object.material.dispose();
                    }
                }
            }
        } else if (object instanceof THREE.Sprite) {
            // Dispose sprite material and texture
            if (object.material) {
                if (object.material.map) {
                    object.material.map.dispose();
                }
                object.material.dispose();
            }
        } else if (object instanceof THREE.Group) {
            // Recursively dispose children
            const children = [...object.children];
            children.forEach((child) => this.disposeObject(child));
        }
    }

    /**
     * Removes generated roads, tunnels and labels, releases their resources, and clears spatial lookup data.
     * Shared materials and scene groups remain available for another generation pass.
     */
    clear(): void {
        // Dispose all label textures
        this.labelTextures.forEach((texture) => texture.dispose());
        this.labelTextures = [];

        // Dispose all objects in groups before removing them
        const groups = [this.roadGroup, this.labelsGroup, this.tunnelGroup];
        groups.forEach((group) => {
            while (group.children.length > 0) {
                const child = group.children[0];
                this.disposeObject(child);
                group.remove(child);
            }
        });

        this.roads = [];
        this.roadSurfaceSamples = [];
        this.surfaceGrid.clear();
        this.activeProfile = null;
        this.profiles = [];
        this.cutouts.clear();
        this.corridors.clear();
    }

    /**
     * Parses supported OSM highway ways, solves road profiles, generates geometry and batches compatible meshes.
     * Skips service roads, footways, paths and steps. Progress callbacks are awaited between generation stages.
     *
     * @param geoJSON - OSM-derived GeoJSON collection containing highway LineStrings.
     * @param centerLat - City origin latitude in decimal degrees.
     * @param centerLon - City origin longitude in decimal degrees.
     * @param options - Road elevation settings and per-way overrides.
     * @param report - Optional asynchronous progress callback; rejection aborts generation.
     * @returns Resolves once geometry generation and batching finish.
     * @throws Propagates profile generation errors and rejected progress callbacks.
     */
    async generateRoadsFromGeoJSON(
        geoJSON: GeoJSON,
        centerLat: number,
        centerLon: number,
        options: Partial<RoadLevelSettings> = {},
        report?: (stage: string, detail?: string) => Promise<void>,
    ): Promise<void> {
        const inputs: RoadInput[] = [];
        const names = new Map<string, string>();
        for (const [index, feature] of geoJSON.features.entries()) {
            if (
                feature.geometry.type !== "LineString" ||
                !feature.properties.highway ||
                feature.geometry.coordinates.length < 2
            )
                continue;
            const highway = String(feature.properties.highway);
            if (["service", "footway", "path", "steps"].includes(highway)) continue;
            const p = feature.properties;
            const tunnel = p.tunnel === "yes" || p.tunnel === "building_passage";
            const bridge = p.bridge !== undefined && p.bridge !== "no" && p.bridge !== false;
            const parsedLayer = Number(p.layer ?? (tunnel ? -1 : bridge ? 1 : 0));
            const layer = Number.isFinite(parsedLayer) ? parsedLayer : 0;
            const id = String(feature.id ?? p["@id"] ?? `road-${index}`);
            const lanes = Math.max(1, parseInt(String(p.lanes ?? 1), 10) || 1);
            const parsedHeadroom = parseFloat(String(p.maxheight ?? ""));
            inputs.push({
                id,
                name: typeof p.name === "string" ? p.name : undefined,
                points: feature.geometry.coordinates.map(([lon, lat]) =>
                    this.latLonToLocal(lat, lon, centerLat, centerLon),
                ),
                kind: tunnel || layer < 0 ? "tunnel" : bridge || layer > 0 ? "bridge" : "ground",
                layer,
                halfWidth: this.getRoadWidth(highway, lanes) / 2,
                sidewalks: sidewalkWidths(p, bridge || layer > 0),
                lanes,
                surface: String(p.surface ?? "asphalt").toLowerCase(),
                headroom:
                    Number.isFinite(parsedHeadroom) && parsedHeadroom >= 2
                        ? parsedHeadroom
                        : undefined,
            });
            if (typeof p.name === "string") names.set(id, p.name);
        }
        await report?.(
            "Solving road elevations and tunnel connections",
            `${inputs.length.toLocaleString()} drivable roads`,
        );
        const network = new RoadProfileNetwork(
            inputs,
            (x, z) => this.groundSample(x, z),
            options,
            this.terrain?.referenceHeight ?? 0,
        );
        this.settings = network.settings;
        this.profiles = network.profiles;
        await report?.("Preparing road and tunnel corridors");
        this.corridors.build(this.profiles);
        for (const [index, profile] of this.profiles.entries()) {
            if (index % 100 === 0)
                await report?.(
                    "Generating roads and markings",
                    `${index.toLocaleString()} / ${this.profiles.length.toLocaleString()} roads`,
                );
            this.activeProfile = profile;
            this.createRoadFromProfile(profile, names.get(profile.input.id));
        }
        this.activeProfile = null;
        await report?.("Batching nearby road geometry");
        this.batchRoadGeometry();
        console.log(
            `Created ${this.profiles.length} road profiles (${this.profiles.filter((p) => p.input.kind === "bridge").length} bridges, ${this.profiles.filter((p) => p.input.kind === "tunnel").length} tunnels)`,
        );
    }

    /**
     * Merges compatible geometry by material, vertex layout and 200-metre spatial cell.
     * Disposes replaced geometry and refreshes the road mesh list without changing road contact profiles.
     */
    private batchRoadGeometry(): void {
        this.roadGroup.userData.unbatchedMeshes =
            this.roadGroup.children.length + this.tunnelGroup.children.length;
        for (const group of [this.roadGroup, this.tunnelGroup]) {
            const batches = new Map<string, THREE.Mesh[]>();
            for (const object of [...group.children]) {
                if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) continue;
                object.geometry.computeBoundingSphere();
                const center = object.geometry.boundingSphere!.center;
                const key = `${Math.floor(center.x / 200)},${Math.floor(center.z / 200)},${object.material.uuid},${Object.keys(object.geometry.attributes).sort().join(",")}`;
                const batch = batches.get(key) ?? [];
                batch.push(object);
                batches.set(key, batch);
            }
            for (const meshes of batches.values()) {
                if (meshes.length < 2) continue;
                const temporary: THREE.BufferGeometry[] = [];
                const geometries = meshes.map((mesh) => {
                    if (!mesh.geometry.index) return mesh.geometry;
                    const geometry = mesh.geometry.toNonIndexed();
                    temporary.push(geometry);
                    return geometry;
                });
                const geometry = mergeGeometries(geometries, false);
                temporary.forEach((g) => g.dispose());
                if (!geometry) continue;
                geometry.computeBoundingSphere();
                const mesh = new THREE.Mesh(geometry, meshes[0].material);
                mesh.castShadow = meshes.some((m) => m.castShadow);
                mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
                for (const old of meshes) {
                    group.remove(old);
                    old.geometry.dispose();
                }
                group.add(mesh);
            }
        }
        this.roads = [...this.roadGroup.children, ...this.tunnelGroup.children].filter(
            (o): o is THREE.Mesh =>
                o instanceof THREE.Mesh &&
                (o.material === this.sharedMaterials.roadMaterial ||
                    o.material === this.sharedMaterials.tunnelMaterial),
        );
    }

    /**
     * Projects WGS84 latitude and longitude into the local city coordinate system using a spherical approximation.
     *
     * @param lat - WGS84 latitude in decimal degrees.
     * @param lon - WGS84 longitude in decimal degrees.
     * @param centerLat - City origin latitude in decimal degrees.
     * @param centerLon - City origin longitude in decimal degrees.
     * @returns Local X/Z position in metres.
     */
    private latLonToLocal(
        lat: number,
        lon: number,
        centerLat: number,
        centerLon: number,
    ): { x: number; z: number } {
        const R = 6371000; // Earth radius in meters
        const dLat = ((lat - centerLat) * Math.PI) / 180;
        const dLon = ((lon - centerLon) * Math.PI) / 180;

        const x = dLon * R * Math.cos((centerLat * Math.PI) / 180);
        const z = -dLat * R;

        return { x, z };
    }

    /**
     * Generates a solved road profile with its surface, contact samples, markings, structural sides and optional label.
     * Uses the active profile set by the generation loop.
     *
     * @param profile - Solved road profile supplying elevations, widths and join directions.
     * @param roadName - Optional street name displayed above the road.
     */
    private createRoadFromProfile(profile: RoadProfile, roadName?: string): void {
        const roadWidth = profile.input.halfWidth * 2;
        const isTunnel = profile.input.kind === "tunnel";
        const curve = profile.curve;
        const surface = profile.input.surface;
        const lanesCount = profile.input.lanes ?? 1;
        // Get total curve length
        const curveLength = curve.getLength();

        if (curveLength < 0.1) return; // Skip very short curves

        // Number of segments along the curve (more segments = smoother but more vertices)
        // Adjust based on curve length - roughly one segment per 2 meters for balance
        const numSegments = Math.max(2, Math.ceil(curveLength * 0.5));

        // Create the main road mesh along the curve
        // Tunnels use the same rendering as regular roads, just with darker color
        this.createRoadMeshAlongCurve(curve, roadWidth, numSegments, isTunnel);

        // Store surface samples for road audio
        this.storeSurfaceSamples(curve, roadWidth, curveLength, surface);

        // Create 3D tunnel structure above the road if it's a tunnel
        if (isTunnel) {
            this.createTunnelStructureAlongCurve(curve, roadWidth, numSegments, curveLength);
        }

        // Create yellow edge lines along the curve
        this.createEdgeLinesAlongCurve(curve, roadWidth, numSegments, curveLength);

        // Create lane dividers along the curve if multiple lanes
        if (lanesCount > 1) {
            this.createLaneDividersAlongCurve(
                curve,
                roadWidth,
                lanesCount,
                numSegments,
                curveLength,
            );
        }

        this.createProfileSides(profile, curve, roadWidth, numSegments);
        this.createSidewalks(profile, numSegments);
        if (roadName) {
            const point = curve.getPoint(0.5);
            this.createStreetLabel(point, roadName);
        }
    }

    /**
     * Builds bridge decks, side barriers and retaining faces, registering road collisions and terrain cutouts.
     *
     * @param profile - Solved road profile supplying elevations, widths and join directions.
     * @param curve - Road centreline in local metres.
     * @param width - Nominal full road width in metres.
     * @param segments - Number of longitudinal mesh subdivisions.
     */
    /** Builds grey sidewalk ribbons and 15 cm curb faces outside the carriageway.
     * @param profile - Road profile with widths relative to the OSM way direction.
     * @param segments - Longitudinal subdivisions shared with the road mesh.
     */
    private createSidewalks(profile: RoadProfile, segments: number): void {
        const tops: number[] = [], sides: number[] = [];
        for (const side of [-1, 1]) {
            const width = profile.input.sidewalks?.[side === 1 ? 'right' : 'left'] ?? 0;
            if (!width) continue;
            for (let i = 0; i < segments; i++) {
                const t = i / segments, u = (i + 1) / segments;
                const a = profile.curve.getPoint(t), b = profile.curve.getPoint(u);
                const na = profile.perpendicularAt(t), nb = profile.perpendicularAt(u);
                const innerA = a.clone().addScaledVector(na, profile.halfWidthAt(t) * side);
                const innerB = b.clone().addScaledVector(nb, profile.halfWidthAt(u) * side);
                const outerA = innerA.clone().addScaledVector(na, width * side);
                const outerB = innerB.clone().addScaledVector(nb, width * side);
                for (const p of [innerA, innerB, outerA, outerA, innerB, outerB]) tops.push(p.x, 0, p.z);
                for (const [p, q] of [[innerA, innerB], [outerB, outerA]]) {
                    const lowP = profile.sample(p.x, p.z).height, lowQ = profile.sample(q.x, q.z).height;
                    sides.push(p.x, lowP, p.z, q.x, lowQ, q.z, p.x, lowP + 0.15, p.z,
                        p.x, lowP + 0.15, p.z, q.x, lowQ, q.z, q.x, lowQ + 0.15, q.z);
                }
            }
        }
        for (const [positions, top] of [[tops, true], [sides, false]] as const) {
            if (!positions.length) continue;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            if (top) this.drapeSurface(geometry, ROAD_HEIGHT + 0.15);
            this.corridors.cut(geometry, profile.input.id, false, false);
            geometry.computeVertexNormals(); geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, this.sharedMaterials.sidewalkMaterial);
            mesh.name = 'Sidewalk'; mesh.castShadow = mesh.receiveShadow = true; this.roadGroup.add(mesh);
        }
    }

    private createProfileSides(
        profile: RoadProfile,
        curve: THREE.Curve<THREE.Vector3>,
        width: number,
        segments: number,
    ): void {
        const vertices: number[] = [];
        /** Appends two triangles for a vertical structural face using endpoint base and top elevations. */
        const face = (
            a: THREE.Vector3,
            b: THREE.Vector3,
            lowA: number,
            lowB: number,
            highA: number,
            highB: number,
        ) => {
            vertices.push(
                a.x,
                lowA,
                a.z,
                b.x,
                lowB,
                b.z,
                a.x,
                highA,
                a.z,
                a.x,
                highA,
                a.z,
                b.x,
                lowB,
                b.z,
                b.x,
                highB,
                b.z,
            );
        };
        for (let i = 0; i < segments; i++) {
            const a = curve.getPoint(i / segments),
                b = curve.getPoint((i + 1) / segments);
            const pa = profile.perpendicularAt(i / segments);
            const pb = profile.perpendicularAt((i + 1) / segments);
            const ga = this.groundSample(a.x, a.z).height,
                gb = this.groundSample(b.x, b.z).height;
            const lowered = Math.min(a.y - ga, b.y - gb) < -0.02;
            const portal =
                profile.input.kind === "tunnel" &&
                Math.min(ga - a.y, gb - b.y) < profile.headroom + this.settings.tunnelCover;
            if (portal || (profile.input.kind !== "tunnel" && lowered)) {
                const half = width / 2 + 0.2 + Math.max(profile.input.sidewalks?.left ?? 0, profile.input.sidewalks?.right ?? 0);
                this.cutouts.add([
                    a.clone().addScaledVector(pa, half),
                    b.clone().addScaledVector(pb, half),
                    b.clone().addScaledVector(pb, -half),
                    a.clone().addScaledVector(pa, -half),
                ]);
            }
            // Tunnel lining supplies the side walls; extending a second wall to the surface
            // exposes two strips above buried tunnels and blocks their junctions.
            if (profile.input.kind === "tunnel") continue;
            const raised = Math.max(a.y - ga, b.y - gb) > 0.2;
            if (profile.input.kind === "ground" && !lowered && !raised) continue;
            for (const side of [-1, 1]) {
                const ea = a.clone().addScaledVector(pa, side * (profile.halfWidthAt(i / segments) + (profile.input.sidewalks?.[side === 1 ? "right" : "left"] ?? 0)));
                const eb = b
                    .clone()
                    .addScaledVector(pb, side * (profile.halfWidthAt((i + 1) / segments) + (profile.input.sidewalks?.[side === 1 ? "right" : "left"] ?? 0)));
                ea.y = profile.sample(ea.x, ea.z).height;
                eb.y = profile.sample(eb.x, eb.z).height;
                if (
                    profile.input.kind === "bridge" ||
                    (profile.input.kind === "ground" && raised)
                ) {
                    const lowA = ea.y - this.settings.deckThickness;
                    const lowB = eb.y - this.settings.deckThickness;
                    face(ea, eb, lowA, lowB, ea.y + 0.45, eb.y + 0.45);
                    if (profile.input.kind === "bridge" && lowered) {
                        face(
                            ea,
                            eb,
                            ea.y + 0.45,
                            eb.y + 0.45,
                            Math.max(ea.y + 0.45, this.groundSample(ea.x, ea.z).height),
                            Math.max(eb.y + 0.45, this.groundSample(eb.x, eb.z).height),
                        );
                    }
                    const oa = ea.clone().addScaledVector(pa, side * 0.15),
                        ob = eb.clone().addScaledVector(pb, side * 0.15);
                    this.collisions?.addPolygon(
                        [[ea, eb, ob, oa]],
                        Math.min(ea.y, eb.y) - this.settings.deckThickness,
                        Math.max(ea.y, eb.y) + 0.45,
                        "road",
                        profile.input.id,
                    );
                } else if (lowered || portal) {
                    const topA = Math.max(ea.y, this.groundSample(ea.x, ea.z).height),
                        topB = Math.max(eb.y, this.groundSample(eb.x, eb.z).height);
                    face(ea, eb, ea.y - 0.1, eb.y - 0.1, topA, topB);
                    if (profile.input.kind === "ground") {
                        const oa = ea.clone().addScaledVector(pa, side * 0.2),
                            ob = eb.clone().addScaledVector(pb, side * 0.2);
                        this.collisions?.addPolygon(
                            [[ea, eb, ob, oa]],
                            Math.min(ea.y, eb.y) - 0.1,
                            Math.max(topA, topB),
                            "road",
                            profile.input.id,
                        );
                    }
                }
            }
            if (profile.input.kind === "bridge" || (profile.input.kind === "ground" && raised)) {
                const la = a.clone().addScaledVector(pa, (profile.halfWidthAt(i / segments) + (profile.input.sidewalks?.right ?? 0))),
                    ra = a.clone().addScaledVector(pa, -(profile.halfWidthAt(i / segments) + (profile.input.sidewalks?.left ?? 0)));
                const lb = b.clone().addScaledVector(pb, (profile.halfWidthAt((i + 1) / segments) + (profile.input.sidewalks?.right ?? 0))),
                    rb = b.clone().addScaledVector(pb, -(profile.halfWidthAt((i + 1) / segments) + (profile.input.sidewalks?.left ?? 0)));
                for (const p of [la, ra, lb, ra, rb, lb])
                    vertices.push(
                        p.x,
                        profile.sample(p.x, p.z).height - this.settings.deckThickness,
                        p.z,
                    );
            }
        }
        // Bridge approaches use open supports rather than non-colliding retaining skirts.
        if (profile.input.kind !== "tunnel") this.createDeckStilts(profile);
        if (vertices.length) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
            this.corridors.cut(geometry, profile.input.id, false, false);
            geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(geometry, this.sharedMaterials.ceilingMaterial);
            mesh.castShadow = mesh.receiveShadow = true;
            this.roadGroup.add(mesh);
        }
    }

    /** Adds spaced collision-bearing stilts wherever a deck is raised above terrain.
     * @param profile - Solved bridge or approach profile supplying deck elevations and widths.
     */
    private createDeckStilts(profile: RoadProfile): void {
        const count = Math.max(1, Math.ceil(profile.curve.getLength() / 18));
        for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count;
            const centre = profile.curve.getPoint(t);
            const perpendicular = profile.perpendicularAt(t);
            const halfWidth = profile.halfWidthAt(t);
            for (const side of [-1, 1]) {
                const point = centre.clone().addScaledVector(perpendicular, side * Math.max(0.5, halfWidth - 0.8));
                const base = this.groundSample(point.x, point.z).height;
                const top = profile.sample(point.x, point.z).height - this.settings.deckThickness;
                const height = top - base;
                if (height < 0.4) continue;
                const radius = 0.3;
                const geometry = new THREE.BoxGeometry(radius * 2, height, radius * 2);
                const mesh = new THREE.Mesh(geometry, this.sharedMaterials.ceilingMaterial);
                mesh.name = "Deck stilt";
                mesh.position.set(point.x, base + height / 2, point.z);
                mesh.castShadow = mesh.receiveShadow = true;
                this.roadGroup.add(mesh);
                this.collisions?.addPolygon([[
                    { x: point.x - radius, z: point.z - radius },
                    { x: point.x + radius, z: point.z - radius },
                    { x: point.x + radius, z: point.z + radius },
                    { x: point.x - radius, z: point.z + radius },
                ]], base, top, "road", profile.input.id);
            }
        }
    }

    /**
     * Samples a road curve into short segments for spatial surface lookup, including tapered width bounds.
     *
     * @param curve - Road centreline in local metres.
     * @param roadWidth - Nominal full road width in metres.
     * @param curveLength - Curve length in metres.
     * @param surface - OSM surface name stored with contact samples.
     */
    private storeSurfaceSamples(
        curve: THREE.Curve<THREE.Vector3>,
        roadWidth: number,
        curveLength: number,
        surface: string,
    ): void {
        const sampleCount = Math.max(2, Math.ceil(curveLength / this.surfaceSampleSpacing));
        const points = curve.getPoints(sampleCount);
        this.roadSurfaceSamples.push({
            points,
            halfWidth: roadWidth * 0.5,
            surface,
            profile: this.activeProfile!,
        });
        for (let i = 1; i < points.length; i++) {
            const segment = {
                a: points[i - 1],
                b: points[i],
                halfWidth: Math.max(
                    this.activeProfile!.halfWidthAt((i - 1) / sampleCount),
                    this.activeProfile!.halfWidthAt(i / sampleCount),
                ) + Math.max(this.activeProfile!.input.sidewalks?.left ?? 0, this.activeProfile!.input.sidewalks?.right ?? 0),
                surface,
                profile: this.activeProfile!,
                startT: (i - 1) / sampleCount,
                endT: i / sampleCount,
            };
            this.surfaceGrid.insert(
                segment,
                Math.min(segment.a.x, segment.b.x) - segment.halfWidth,
                Math.min(segment.a.z, segment.b.z) - segment.halfWidth,
                Math.max(segment.a.x, segment.b.x) + segment.halfWidth,
                Math.max(segment.a.z, segment.b.z) + segment.halfWidth,
            );
        }
    }

    /**
     * Looks up the reachable road surface at a vehicle position, falling back to ground.
     *
     * @param position - Local position used for contact lookup or label placement.
     * @returns Selected surface name, or ground when no road is reachable.
     */
    getSurfaceAtPosition(position: THREE.Vector3): string {
        return this.getRoadState(position.x, position.z, position.y).surface;
    }

    /**
     * Selects a road contact by horizontal coverage and vertical proximity, or returns the terrain contact.
     * Normal queries reject decks more than 1.5 metres from the expected vehicle base; snap queries bypass that limit.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     * @param y - Local elevation in metres; contact queries expect the vehicle centre, approximately 0.4 metres above the deck.
     * @param snap - Whether to allow selection of vertically distant decks.
     * @returns Selected road profile contact or terrain fallback.
     */
    getRoadState(x: number, z: number, y: number, snap = false): RoadContact {
        const ground = this.groundSample(x, z);
        let result: RoadContact = {
            ...ground,
            surface: "ground",
            grip: 0.8,
            structure: "ground",
        };
        let best = Infinity;
        const checked = new Set<RoadProfile>();
        const nearest = new Map<RoadProfile, { road: RoadSegment; distance: number }>();
        for (const road of this.surfaceGrid.at(x, z)) {
            const q = closestPoint({ x, z }, road.a, road.b);
            const distance = Math.hypot(x - q.x, z - q.z);
            if (distance < (nearest.get(road.profile)?.distance ?? Infinity)) nearest.set(road.profile, { road, distance });
        }
        for (const { road } of nearest.values()) {
            const q = closestPoint({ x, z }, road.a, road.b);
            const distance = Math.hypot(x - q.x, z - q.z);
            const segmentLength = Math.hypot(road.b.x - road.a.x, road.b.z - road.a.z);
            const fraction = segmentLength
                ? Math.hypot(q.x - road.a.x, q.z - road.a.z) / segmentLength
                : 0;
            const width = road.profile.halfWidthAt(
                THREE.MathUtils.lerp(road.startT ?? 0, road.endT ?? 1, fraction),
            );
            const rightSide = (x - q.x) * -(road.b.z - road.a.z) + (z - q.z) * (road.b.x - road.a.x) >= 0;
            const sidewalk = road.profile.input.sidewalks?.[rightSide ? 'right' : 'left'] ?? 0;
            if (distance > width + sidewalk || checked.has(road.profile)) continue;
            checked.add(road.profile);
            const contact = road.profile.sample(x, z);
            if (distance > width && sidewalk > 0) { contact.height += 0.15; contact.surface = "concrete"; contact.grip = 1; }
            const verticalDistance = Math.abs(y - 0.4 - contact.height);
            // Reachable contact only: an overhead bridge or buried road cannot attract a car on another level.
            if (!snap && verticalDistance > 1.5) continue;
            const score = verticalDistance * 4 + distance * 0.05;
            if (score < best) {
                best = score;
                result = contact;
            }
        }
        return result;
    }

    /**
     * Finds a nearby positive-layer bridge deck for an elevated roadside wall or barrier.
     * Only matching layers within the road half-width plus eight metres qualify; otherwise returns terrain height.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     * @param layer - OSM relative layer; zero and negative layers retain terrain placement.
     * @returns Wall base elevation in local metres.
     */
    /** Finds up to eight named roads in the loaded map using case/accent-insensitive matching.
     * @param query - Street name fragment.
     * @returns Unique street names and positions on their solved road decks.
     */
    findStreets(query: string): Array<{ name: string; position: THREE.Vector3 }> {
        const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const needle = normalize(query.trim());
        if (!needle) return [];
        const found = new Map<string, { name: string; position: THREE.Vector3 }>();
        for (const profile of this.profiles) {
            const name = profile.input.name;
            if (!name || !normalize(name).includes(needle) || found.has(name)) continue;
            found.set(name, { name, position: profile.curve.getPoint(0.5).add(new THREE.Vector3(0, 0.4, 0)) });
        }
        return [...found.values()].sort((a, b) => Number(normalize(b.name) === needle) - Number(normalize(a.name) === needle) || a.name.localeCompare(b.name)).slice(0, 8);
    }

    getWallHeight(x: number, z: number, layer: number): number {
        const ground = this.groundSample(x, z).height;
        if (layer <= 0) return ground;
        let height = ground,
            best = Infinity;
        // Walls may sit beside the asphalt. Search nearby bridge segments on their own layer.
        const candidates = new Set(this.surfaceGrid.at(x, z));
        for (const dx of [-20, 0, 20])
            for (const dz of [-20, 0, 20])
                for (const road of this.surfaceGrid.at(x + dx, z + dz)) candidates.add(road);
        for (const road of candidates) {
            if (road.profile.input.kind !== "bridge" || road.profile.input.layer !== layer)
                continue;
            const q = closestPoint({ x, z }, road.a, road.b);
            const distance = Math.hypot(x - q.x, z - q.z);
            if (distance > road.halfWidth + 8 || distance >= best) continue;
            best = distance;
            height = road.profile.sample(q.x, q.z).height;
        }
        return height;
    }

    /**
     * Subtracts registered road approach and portal openings from terrain geometry in place.
     *
     * @param geometry - Buffer geometry to modify in place.
     */
    cutTerrainGeometry(geometry: THREE.BufferGeometry): void {
        this.cutouts.apply(
            geometry,
            this.terrain ?? {
                sample: () => ({ height: 0, slopeX: 0, slopeZ: 0 }),
            },
        );
    }

    /**
     * Selects the sampled ground-road point nearest the city origin, falling back to any road and then the origin.
     * @returns A new vehicle-centre position 0.4 metres above the chosen deck.
     */
    getSpawnPosition(): THREE.Vector3 {
        let closest: THREE.Vector3 | null = null;
        let distance = Infinity;
        const groundRoads = this.roadSurfaceSamples.filter(
            (road) => road.profile.input.kind === "ground",
        );
        for (const road of groundRoads.length ? groundRoads : this.roadSurfaceSamples)
            for (const point of road.points) {
                const d = point.x * point.x + point.z * point.z;
                if (d < distance) {
                    distance = d;
                    closest = point;
                }
            }
        return closest
            ? closest.clone().add(new THREE.Vector3(0, 0.4, 0))
            : new THREE.Vector3(0, ROAD_HEIGHT + 0.4, 0);
    }

    /**
     * Clears generated content, releases shared materials and textures, and removes owned groups from the scene.
     */
    dispose(): void {
        this.clear();
        Object.values(this.sharedMaterials).forEach((material) => {
            material.map?.dispose();
            material.dispose();
        });
        for (const group of [this.roadGroup, this.labelsGroup, this.tunnelGroup])
            this.scene.remove(group);
    }

    /**
     * Creates the draped asphalt ribbon using tapered widths and shared join directions, then adds it to the road group.
     *
     * @param curve - Road centreline in local metres.
     * @param roadWidth - Nominal full road width in metres.
     * @param numSegments - Number of longitudinal mesh subdivisions.
     * @param isTunnel - Whether to use the darker tunnel road material.
     */
    private createRoadMeshAlongCurve(
        curve: THREE.Curve<THREE.Vector3>,
        roadWidth: number,
        numSegments: number,
        isTunnel: boolean = false,
    ): void {
        const halfWidth = roadWidth / 2;
        const vertices: number[] = [];
        const indices: number[] = [];

        // Generate vertices along the curve
        for (let i = 0; i <= numSegments; i++) {
            const t = i / numSegments;

            // Get point on curve
            const point = curve.getPoint(t);

            // Get tangent (direction) at this point
            const tangent = curve.getTangent(t);

            // Calculate perpendicular vector (for road width) - normalize to ensure consistent width
            const perp =
                this.activeProfile?.perpendicularAt(t) ??
                new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            // Calculate left and right edge points
            const leftPoint = point
                .clone()
                .add(perp.clone().multiplyScalar(this.activeProfile?.halfWidthAt(t) ?? halfWidth));
            const rightPoint = point
                .clone()
                .add(
                    perp.clone().multiplyScalar(-(this.activeProfile?.halfWidthAt(t) ?? halfWidth)),
                );

            // Add vertices (left edge)
            vertices.push(leftPoint.x, leftPoint.y, leftPoint.z);

            // Add vertices (right edge)
            vertices.push(rightPoint.x, rightPoint.y, rightPoint.z);
        }

        // Validate we have enough vertices
        if (vertices.length < 6) {
            console.warn("Road geometry has too few vertices, skipping");
            return;
        }

        // Create triangle indices (two triangles per segment)
        // Winding order: counter-clockwise when viewed from above (positive Y)
        for (let i = 0; i < numSegments; i++) {
            const base = i * 2;

            // Validate indices are within bounds
            const maxIndex = (numSegments + 1) * 2 - 1;
            if (base + 3 > maxIndex) continue;

            // First triangle: left(i) -> left(i+1) -> right(i) (counter-clockwise from above)
            indices.push(base, base + 2, base + 1);

            // Second triangle: left(i+1) -> right(i+1) -> right(i) (counter-clockwise from above)
            indices.push(base + 2, base + 3, base + 1);
        }

        // Validate we have indices
        if (indices.length < 3) {
            console.warn("Road geometry has too few indices, skipping");
            return;
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3));

        // Compute normals from geometry (don't set manually, let Three.js calculate them)
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.computeVertexNormals();

        // Use shared material to avoid memory leaks
        const roadMaterial = isTunnel
            ? this.sharedMaterials.tunnelMaterial
            : this.sharedMaterials.roadMaterial;

        this.drapeSurface(geometry, ROAD_HEIGHT);
        const roadMesh = new THREE.Mesh(geometry, roadMaterial);
        roadMesh.receiveShadow = true;

        // Add to appropriate group based on whether it's a tunnel
        if (isTunnel) {
            this.tunnelGroup.add(roadMesh);
        } else {
            this.roadGroup.add(roadMesh);
        }
        this.roads.push(roadMesh);
    }

    /**
     * Builds tunnel side walls and ceiling with tapered cross-sections, clipping junction openings and registering wall collisions.
     *
     * @param curve - Road centreline in local metres.
     * @param roadWidth - Nominal full road width in metres.
     * @param numSegments - Number of longitudinal mesh subdivisions.
     * @param curveLength - Curve length in metres.
     */
    private createTunnelStructureAlongCurve(
        curve: THREE.Curve<THREE.Vector3>,
        roadWidth: number,
        numSegments: number,
        curveLength: number,
    ): void {
        const profile = this.activeProfile!;
        const vertices: number[] = [],
            height = profile.headroom;
        /** Appends two triangles for a four-corner tunnel face in the shared vertex buffer. */
        const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
            for (const p of [a, b, c, c, b, d]) vertices.push(p.x, p.y, p.z);
        };
        for (let i = 0; i < numSegments; i++) {
            const a = curve.getPoint(i / numSegments),
                b = curve.getPoint((i + 1) / numSegments);
            const na = profile.perpendicularAt(i / numSegments);
            const nb = profile.perpendicularAt((i + 1) / numSegments);
            const edges: THREE.Vector3[] = [];
            for (const side of [-1, 1]) {
                const ea = a
                        .clone()
                        .addScaledVector(na, (profile.halfWidthAt(i / numSegments) + (profile.input.sidewalks?.[side === 1 ? "right" : "left"] ?? 0)) * side),
                    eb = b
                        .clone()
                        .addScaledVector(nb, (profile.halfWidthAt((i + 1) / numSegments) + (profile.input.sidewalks?.[side === 1 ? "right" : "left"] ?? 0)) * side);
                ea.y = profile.sample(ea.x, ea.z).height;
                eb.y = profile.sample(eb.x, eb.z).height;
                const ta = ea.clone().add(new THREE.Vector3(0, height, 0)),
                    tb = eb.clone().add(new THREE.Vector3(0, height, 0));
                face(ea, eb, ta, tb);
                edges.push(ta, tb);
                const oa = ea.clone().addScaledVector(na, side * 0.25),
                    ob = eb.clone().addScaledVector(nb, side * 0.25);
                this.collisions?.addPolygon(
                    [[ea, eb, ob, oa]],
                    Math.min(ea.y, eb.y) - 0.1,
                    Math.max(ea.y, eb.y) + height,
                    "road",
                    profile.input.id,
                );
            }
            // Full-width headroom, with no end caps across entrances or shared nodes.
            face(edges[0], edges[1], edges[2], edges[3]);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        this.corridors.cut(geometry, profile.input.id, false, false);
        const mesh = new THREE.Mesh(geometry, this.sharedMaterials.ceilingMaterial);
        mesh.name = `Tunnel lining ${profile.input.id}`;
        mesh.castShadow = mesh.receiveShadow = true;
        this.tunnelGroup.add(mesh);
    }

    /**
     * Builds a curved road patch around a corner using the supplied incoming and outgoing directions.
     *
     * @param cornerPoint - Corner position in local metres.
     * @param incomingDir - Direction of the incoming road.
     * @param outgoingDir - Direction of the outgoing road.
     * @param roadWidth - Nominal full road width in metres.
     * @param cornerRadius - Geometry input used to construct the corner patch.
     * @param isTunnel - Whether to use the darker tunnel road material.
     * @param layer - OSM relative layer; zero and negative layers retain terrain placement.
     */
    private createRoundedCorner(
        cornerPoint: THREE.Vector3,
        incomingDir: THREE.Vector3,
        outgoingDir: THREE.Vector3,
        roadWidth: number,
        cornerRadius: number,
        isTunnel: boolean = false,
        layer: number = 0,
    ): void {
        const roadY = ROAD_HEIGHT;

        // Calculate the angle between incoming and outgoing directions
        const angle = Math.acos(Math.max(-1, Math.min(1, incomingDir.dot(outgoingDir))));

        // Skip if the angle is too small or too large (almost straight or reverse)
        if (angle < 0.1 || angle > Math.PI - 0.1) return;

        // Calculate perpendicular vectors for each direction
        const incomingPerp = new THREE.Vector3(-incomingDir.z, 0, incomingDir.x);
        const outgoingPerp = new THREE.Vector3(-outgoingDir.z, 0, outgoingDir.x);

        // Calculate offset distance based on the angle and desired corner radius
        // This ensures the corner patch extends enough to cover gaps
        const offsetDistance = Math.min(cornerRadius, roadWidth * 0.3);

        // Calculate points along each edge where we'll create the corner
        const halfWidth = roadWidth / 2;
        const innerStart = cornerPoint
            .clone()
            .add(incomingDir.clone().multiplyScalar(-offsetDistance))
            .add(incomingPerp.clone().multiplyScalar(-halfWidth));
        const innerEnd = cornerPoint
            .clone()
            .add(outgoingDir.clone().multiplyScalar(offsetDistance))
            .add(outgoingPerp.clone().multiplyScalar(-halfWidth));
        const outerStart = cornerPoint
            .clone()
            .add(incomingDir.clone().multiplyScalar(-offsetDistance))
            .add(incomingPerp.clone().multiplyScalar(halfWidth));
        const outerEnd = cornerPoint
            .clone()
            .add(outgoingDir.clone().multiplyScalar(offsetDistance))
            .add(outgoingPerp.clone().multiplyScalar(halfWidth));

        // Create a quad (two triangles) to fill the corner gap
        const geometry = new THREE.BufferGeometry();

        // Create vertices forming a quadrilateral
        const vertices = new Float32Array([
            innerStart.x,
            roadY,
            innerStart.z, // 0: Inner start
            innerEnd.x,
            roadY,
            innerEnd.z, // 1: Inner end
            outerEnd.x,
            roadY,
            outerEnd.z, // 2: Outer end
            outerStart.x,
            roadY,
            outerStart.z, // 3: Outer start
        ]);

        // Create indices for two triangles (quad)
        const indices = new Uint16Array([
            0,
            1,
            2, // First triangle: inner start, inner end, outer end
            0,
            2,
            3, // Second triangle: inner start, outer end, outer start
        ]);

        geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        // Use shared material
        const roadMaterial = isTunnel
            ? this.sharedMaterials.tunnelMaterial
            : this.sharedMaterials.roadMaterial;

        this.drapeSurface(geometry, ROAD_HEIGHT);
        const cornerMesh = new THREE.Mesh(geometry, roadMaterial);
        cornerMesh.receiveShadow = true;

        if (isTunnel) {
            // Adjust Y for tunnel depth
            // OSM layer is ordering, not a measured tunnel depth.
            this.tunnelGroup.add(cornerMesh);
        } else {
            this.roadGroup.add(cornerMesh);
        }
        this.roads.push(cornerMesh);
    }

    /**
     * Adds yellow edge ribbons following the road taper, draping and clipping them at overlapping corridors.
     *
     * @param curve - Road centreline in local metres.
     * @param roadWidth - Nominal full road width in metres.
     * @param numSegments - Number of longitudinal mesh subdivisions.
     * @param curveLength - Curve length in metres.
     */
    private createEdgeLinesAlongCurve(
        curve: THREE.Curve<THREE.Vector3>,
        roadWidth: number,
        numSegments: number,
        curveLength: number,
    ): void {
        const lineWidth = 0.15;
        const lineHeight = 0.015;
        const halfWidth = roadWidth / 2;

        // Create ribbon geometry for edge lines (similar to road surface)
        /** Builds one draped, junction-clipped edge ribbon; returns null when no valid strip can be built.
         * @param offsetMultiplier - Side selector: 1 for the left edge and -1 for the right edge.
         * @returns A mesh using the shared edge material, or null for insufficient vertices.
         */
        const createEdgeRibbon = (offsetMultiplier: number): THREE.Mesh | null => {
            const vertices: number[] = [];
            const indices: number[] = [];

            // Generate vertices along the curve for both edges of the line ribbon
            for (let i = 0; i <= numSegments; i++) {
                const t = i / numSegments;
                const point = curve.getPoint(t);
                const tangent = curve.getTangent(t);
                const perp =
                    this.activeProfile?.perpendicularAt(t) ??
                    new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

                // Calculate position along the edge
                const edgePoint = point
                    .clone()
                    .add(
                        perp
                            .clone()
                            .multiplyScalar(
                                (this.activeProfile?.halfWidthAt(t) ?? halfWidth) *
                                    offsetMultiplier,
                            ),
                    );
                edgePoint.y = lineHeight;

                // Create two vertices for the width of the line (ribbon)
                const halfLineWidth = lineWidth / 2;
                const leftEdge = edgePoint
                    .clone()
                    .add(perp.clone().multiplyScalar(-halfLineWidth * offsetMultiplier));
                const rightEdge = edgePoint
                    .clone()
                    .add(perp.clone().multiplyScalar(halfLineWidth * offsetMultiplier));

                vertices.push(
                    leftEdge.x,
                    this.roadHeight(leftEdge.x, leftEdge.z) + 0.015,
                    leftEdge.z,
                );
                vertices.push(
                    rightEdge.x,
                    this.roadHeight(rightEdge.x, rightEdge.z) + 0.015,
                    rightEdge.z,
                );
            }

            if (vertices.length < 6) return null;

            // Create indices for ribbon (triangles connecting adjacent segments)
            for (let i = 0; i < numSegments; i++) {
                const base = i * 2;
                indices.push(base, base + 2, base + 1);
                indices.push(base + 2, base + 3, base + 1);
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                "position",
                new THREE.BufferAttribute(new Float32Array(vertices), 3),
            );
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
            geometry.computeVertexNormals();

            const material = this.sharedMaterials.edgeLineMaterial;

            this.drapeSurface(geometry, ROAD_HEIGHT + 0.015);
            this.corridors.cut(geometry, this.activeProfile?.input.id, true);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            return mesh;
        };

        // Create left edge line (offsetMultiplier = 1)
        const leftEdge = createEdgeRibbon(1);
        if (leftEdge) this.roadGroup.add(leftEdge);

        // Create right edge line (offsetMultiplier = -1)
        const rightEdge = createEdgeRibbon(-1);
        if (rightEdge) this.roadGroup.add(rightEdge);
    }

    /**
     * Adds dashed lane-divider ribbons with distance-based texture repetition.
     * Divider offsets follow road width changes and line widths taper out at lane-count transitions.
     *
     * @param curve - Road centreline in local metres.
     * @param roadWidth - Nominal full road width in metres.
     * @param lanesCount - Number of lanes used to estimate width or position divider markings.
     * @param numSegments - Number of longitudinal mesh subdivisions.
     * @param curveLength - Curve length in metres.
     */
    private createLaneDividersAlongCurve(
        curve: THREE.Curve<THREE.Vector3>,
        roadWidth: number,
        lanesCount: number,
        numSegments: number,
        curveLength: number,
    ): void {
        // Only create dividers for roads with 2+ lanes
        if (lanesCount < 2) return;

        const dividerWidth = 0.1;
        const dividerHeight = 0.02;
        const laneWidth = roadWidth / lanesCount;

        // Create pattern: dash length and gap length
        const dashLength = 2.0;
        const gapLength = 1.0;
        const patternLength = dashLength + gapLength;

        // Create dividers between lanes (not at edges)
        for (let i = 1; i < lanesCount; i++) {
            const offsetFromCenter = (i - lanesCount / 2) * laneWidth;

            // Create continuous ribbon geometry along the curve
            const vertices: number[] = [];
            const indices: number[] = [];
            const uvs: number[] = []; // UV coordinates for pattern texture

            // Track cumulative arc length for accurate UV mapping
            // This ensures the pattern stays consistent regardless of curve curvature
            let cumulativeArcLength = 0;
            let lastPoint: THREE.Vector3 | null = null;

            // Generate vertices along the curve with arc-length-based UV coordinates
            for (let j = 0; j <= numSegments; j++) {
                const t = j / numSegments;
                const point = curve.getPoint(t);
                const tangent = curve.getTangent(t);
                const perp =
                    this.activeProfile?.perpendicularAt(t) ??
                    new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

                // Accumulate arc length (distance from previous point)
                if (lastPoint !== null) {
                    cumulativeArcLength += lastPoint.distanceTo(point);
                }
                lastPoint = point;

                // Calculate position along divider line
                const dividerPoint = point
                    .clone()
                    .add(
                        perp
                            .clone()
                            .multiplyScalar(
                                (offsetFromCenter *
                                    (this.activeProfile?.halfWidthAt(t) ?? roadWidth / 2)) /
                                    (roadWidth / 2),
                            ),
                    );
                dividerPoint.y = dividerHeight;

                // Create two vertices for the width of the divider (ribbon)
                const halfWidth = (dividerWidth / 2) * (this.activeProfile?.dividerScaleAt(t) ?? 1);
                const leftEdge = dividerPoint.clone().add(perp.clone().multiplyScalar(-halfWidth));
                const rightEdge = dividerPoint.clone().add(perp.clone().multiplyScalar(halfWidth));

                vertices.push(
                    leftEdge.x,
                    this.roadHeight(leftEdge.x, leftEdge.z) + 0.015,
                    leftEdge.z,
                );
                vertices.push(
                    rightEdge.x,
                    this.roadHeight(rightEdge.x, rightEdge.z) + 0.015,
                    rightEdge.z,
                );

                // Calculate UV coordinates using actual accumulated arc length
                // This ensures pattern remains consistent even in tight corners
                const u = cumulativeArcLength / patternLength; // Will repeat with RepeatWrapping

                // V coordinate (0 = left edge, 1 = right edge)
                uvs.push(u, 0); // Left edge
                uvs.push(u, 1); // Right edge
            }

            if (vertices.length < 6) continue;

            // Create indices for ribbon
            for (let j = 0; j < numSegments; j++) {
                const base = j * 2;
                indices.push(base, base + 2, base + 1);
                indices.push(base + 2, base + 3, base + 1);
            }

            let patternTexture = this.sharedMaterials.laneDividerMaterial.map;
            if (!patternTexture) {
                const canvas = document.createElement("canvas");
                canvas.width = 256;
                canvas.height = 32;
                const context = canvas.getContext("2d")!;
                context.clearRect(0, 0, 256, 32);
                context.fillStyle = "#ffffff";
                context.fillRect(0, 0, (dashLength / patternLength) * 256, 32);
                patternTexture = new THREE.CanvasTexture(canvas);
                patternTexture.wrapS = THREE.RepeatWrapping;
                this.sharedMaterials.laneDividerMaterial.map = patternTexture;
                this.sharedMaterials.laneDividerMaterial.transparent = true;
                this.sharedMaterials.laneDividerMaterial.alphaTest = 0.01;
                this.sharedMaterials.laneDividerMaterial.needsUpdate = true;
            }

            // Create geometry
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                "position",
                new THREE.BufferAttribute(new Float32Array(vertices), 3),
            );
            geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
            geometry.computeVertexNormals();

            // Calculate how many pattern repeats along the curve
            const patternRepeats = curveLength / patternLength;

            // Create material with pattern texture
            const material = this.sharedMaterials.laneDividerMaterial;

            // Texture repeat is handled by UV coordinates and RepeatWrapping

            this.drapeSurface(geometry, ROAD_HEIGHT + 0.015);
            this.corridors.cut(geometry, this.activeProfile?.input.id, true);
            const divider = new THREE.Mesh(geometry, material);
            divider.castShadow = false;
            divider.receiveShadow = false;
            this.roadGroup.add(divider);
        }
    }

    /**
     * Estimates full road width from highway classification and lane count, respecting a class-specific minimum.
     *
     * @param highwayType - OSM highway classification.
     * @param lanesCount - Number of lanes used to estimate width or position divider markings.
     * @returns Full road width in metres.
     */
    private getRoadWidth(highwayType: string, lanesCount: number = 1): number {
        // Car width is 1.9 units, so minimum lane width is 1.9 * 1.2 = 2.28
        // We'll use 2.5 as a comfortable minimum lane width
        const carWidth = 1.9;
        const minLaneWidth = carWidth * 1.2; // At least car width + 20%
        const comfortableLaneWidth = 2.5; // Comfortable lane width for navigation

        // Minimum road widths per highway type (for single-lane roads)
        const minWidths: Record<string, number> = {
            motorway: 5.2,
            trunk: 4.5,
            primary: 4.2,
            secondary: 3.9,
            tertiary: 3.75,
            residential: 3.6,
            service: 3.4,
            unclassified: 3.6,
        };

        // Get minimum width for this highway type
        let minRoadWidth = minWidths["residential"]; // Default
        for (const [type, width] of Object.entries(minWidths)) {
            if (highwayType.toLowerCase().includes(type)) {
                minRoadWidth = width;
                break;
            }
        }

        // Calculate lane width - use comfortable width for multi-lane roads,
        // but ensure minimum is respected
        const laneWidth = Math.max(minLaneWidth, comfortableLaneWidth);

        // For single-lane roads, use the highway-specific minimum width
        // For multi-lane roads, use lane width * number of lanes
        if (lanesCount === 1) {
            return Math.max(minRoadWidth, laneWidth);
        } else {
            return lanesCount * laneWidth;
        }
    }

    /**
     * Rasterizes a wrapped street name into a canvas texture and adds an aspect-correct sprite above the road.
     * Does nothing when a 2D canvas context is unavailable.
     *
     * @param position - Local position used for contact lookup or label placement.
     * @param name - Street name to render.
     */
    private createStreetLabel(position: { x: number; z: number }, name: string): void {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return;
        const font = "600 44px system-ui, sans-serif";
        context.font = font;
        const maxWidth = 720,
            padding = 24,
            lineHeight = 58;
        const lines: string[] = [""];
        // Wrap at word boundaries; very long unbroken names are split rather than squeezed.
        for (const word of name.trim().split(/\s+/)) {
            const parts: string[] = [];
            let part = "";
            for (const character of Array.from(word)) {
                if (part && context.measureText(part + character).width > maxWidth) {
                    parts.push(part);
                    part = "";
                }
                part += character;
            }
            if (part) parts.push(part);
            for (const text of parts) {
                const last = lines.length - 1,
                    candidate = lines[last] ? `${lines[last]} ${text}` : text;
                if (lines[last] && context.measureText(candidate).width > maxWidth)
                    lines.push(text);
                else lines[last] = candidate;
            }
        }
        canvas.width = Math.ceil(
            Math.max(100, ...lines.map((line) => context.measureText(line).width)) + padding * 2,
        );
        canvas.height = lines.length * lineHeight + padding;
        // Resizing clears canvas state: restore typography at the final texture resolution.
        context.font = font;
        context.fillStyle = "rgba(19, 30, 40, 0.92)";
        context.beginPath();
        context.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 16);
        context.fill();
        context.strokeStyle = "rgba(220, 234, 243, 0.38)";
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = "#f4f7fa";
        context.textAlign = "center";
        context.textBaseline = "middle";
        lines.forEach((line, i) =>
            context.fillText(line, canvas.width / 2, padding / 2 + lineHeight * (i + 0.5)),
        );
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.labelTextures.push(texture);
        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.03,
                depthWrite: false,
                toneMapped: false,
            }),
        );
        // Match the actual canvas aspect ratio: every name has identical letter proportions.
        const metresPerPixel = 1.35 / lineHeight;
        sprite.scale.set(canvas.width * metresPerPixel, canvas.height * metresPerPixel, 1);
        sprite.name = `Street: ${name}`;
        sprite.position.set(position.x, this.roadHeight(position.x, position.z) + 6, position.z);
        this.labelsGroup.add(sprite);
    }

    /**
     * Returns the current road and tunnel surface mesh array, including meshes produced by batching.
     * @returns The internal mesh array; callers should treat it as read-only.
     */
    getRoads(): THREE.Mesh[] {
        return this.roads;
    }

    /**
     * Sets visibility of the entire street-label group.
     *
     * @param visible - Whether street labels should be visible.
     */
    setLabelsVisible(visible: boolean): void {
        this.labelsGroup.visible = visible;
    }

    /**
     * Reports whether the street-label group is enabled.
     * @returns True when the label group is enabled.
     */
    getLabelsVisible(): boolean {
        return this.labelsGroup.visible;
    }
}
