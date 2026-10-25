import * as THREE from 'three';
import { ElevationTerrain } from './ElevationTerrain';
import type { SurfaceSample } from './ElevationTerrain';
import type { GeoJSON } from '@/types';
import { RoadProfileNetwork, DEFAULT_ROAD_LEVELS } from './RoadProfiles';
import type { RoadProfile, RoadInput, RoadLevelSettings, RoadContact } from './RoadProfiles';
import { RoadCutouts } from './RoadCutouts';
import { SpatialGrid, closestPoint, CollisionWorld } from './CollisionWorld';

export const ROAD_HEIGHT = 0.06;
interface RoadSegment { a: THREE.Vector3; b: THREE.Vector3; halfWidth: number; surface: string; profile: RoadProfile; }

export class RoadGenerator {
    private terrain: ElevationTerrain | null = null;
    private activeProfile: RoadProfile | null = null;
    private profiles: RoadProfile[] = [];
    private settings: RoadLevelSettings = DEFAULT_ROAD_LEVELS;
    private cutouts = new RoadCutouts();
    setTerrain(terrain: ElevationTerrain | null): void { this.terrain = terrain; }
    private groundSample(x: number, z: number): SurfaceSample {
        return this.terrain?.sample(x, z) ?? { height: 0, slopeX: 0, slopeZ: 0 };
    }
    private roadHeight(x: number, z: number): number { return this.activeProfile?.sample(x, z).height ?? this.groundSample(x, z).height + ROAD_HEIGHT; }

    private drapeSurface(geometry: THREE.BufferGeometry, clearance: number): void {
        if (!this.terrain && !this.activeProfile) return;
        const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
        const index = geometry.getIndex();
        const positions: number[] = [], uvs: number[] = [];
        const count = index ? index.count : position.count;
        for (let i = 0; i < count; i += 3) {
            const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
            const tri = ids.map(id => ({ x: position.getX(id), z: position.getZ(id) }));
            const [a, b, c] = tri;
            const det = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
            if (Math.abs(det) < 1e-10) continue;
            for (const poly of this.terrain && this.activeProfile?.input.kind === 'ground' ? this.terrain.cutTriangle(tri) : [tri]) {
                for (let j = 1; j < poly.length - 1; j++) for (const p of [poly[0], poly[j], poly[j + 1]]) {
                    positions.push(p.x, this.roadHeight(p.x, p.z) + clearance - ROAD_HEIGHT, p.z);
                    if (uv) {
                        const v = ((p.x - a.x) * (c.z - a.z) - (p.z - a.z) * (c.x - a.x)) / det;
                        const w = ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) / det;
                        const u = 1 - v - w;
                        uvs.push(uv.getX(ids[0]) * u + uv.getX(ids[1]) * v + uv.getX(ids[2]) * w,
                            uv.getY(ids[0]) * u + uv.getY(ids[1]) * v + uv.getY(ids[2]) * w);
                    }
                }
            }
        }
        geometry.setIndex(null);
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        if (uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
    }

    private roads: THREE.Mesh[] = [];
    private roadGroup: THREE.Group;
    private labelsGroup: THREE.Group;
    private tunnelGroup: THREE.Group;
    private labelTextures: THREE.CanvasTexture[] = [];
    private roadSurfaceSamples: Array<{ points: THREE.Vector3[]; halfWidth: number; surface: string; profile: RoadProfile; }> = [];
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
            side: THREE.DoubleSide
        }),
        tunnelMaterial: new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.9,
            metalness: 0.1,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide
        }),
        edgeLineMaterial: new THREE.MeshStandardMaterial({
            color: 0xFFFF00,
            emissive: 0xFFFF00,
            emissiveIntensity: 0.5,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
            side: THREE.DoubleSide
        }),
        laneDividerMaterial: new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            emissive: 0xFFFFFF,
            emissiveIntensity: 0.3,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
            side: THREE.DoubleSide
        }),
        ceilingMaterial: new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.8,
            metalness: 0.2,
            side: THREE.DoubleSide
        })
    };

    constructor(private scene: THREE.Scene, private collisions?: CollisionWorld) {
        this.roadGroup = new THREE.Group();
        this.labelsGroup = new THREE.Group();
        this.tunnelGroup = new THREE.Group();

        // Mark groups so they're not removed during scene clearing
        this.roadGroup.userData.isRoadGroup = true;
        this.labelsGroup.userData.isRoadGroup = true;
        this.tunnelGroup.userData.isRoadGroup = true;

        this.scene.add(this.roadGroup);
        this.scene.add(this.labelsGroup);
        this.scene.add(this.tunnelGroup);
    }

    /**
     * Dispose of Three.js resources (geometries, materials, textures)
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
                    object.material.forEach(material => {
                        if (material.map) material.map.dispose();
                        material.dispose();
                    });
                } else {
                    if (object.material.map) object.material.map.dispose();
                    // Only dispose if not a shared material
                    const materialId = (object.material as any).uuid;
                    const isShared = Object.values(this.sharedMaterials).some(m => m.uuid === materialId);
                    if (!isShared) {
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
            children.forEach(child => this.disposeObject(child));
        }
    }

    /**
     * Clear all roads, labels, and tunnels from the groups and dispose resources
     */
    clear(): void {
        // Dispose all label textures
        this.labelTextures.forEach(texture => texture.dispose());
        this.labelTextures = [];

        // Dispose all objects in groups before removing them
        const groups = [this.roadGroup, this.labelsGroup, this.tunnelGroup];
        groups.forEach(group => {
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
    }

    /**
     * Generate roads from GeoJSON data
     */
    generateRoadsFromGeoJSON(geoJSON: GeoJSON, centerLat: number, centerLon: number, options: Partial<RoadLevelSettings> = {}): void {
        const inputs: RoadInput[] = [];
        const names = new Map<string, string>();
        for (const [index, feature] of geoJSON.features.entries()) {
            if (feature.geometry.type !== 'LineString' || !feature.properties.highway || feature.geometry.coordinates.length < 2) continue;
            const highway = String(feature.properties.highway);
            if (['service', 'footway', 'path', 'steps'].includes(highway)) continue;
            const p = feature.properties;
            const tunnel = p.tunnel === 'yes' || p.tunnel === 'building_passage';
            const bridge = p.bridge !== undefined && p.bridge !== 'no' && p.bridge !== false;
            const parsedLayer = Number(p.layer ?? (tunnel ? -1 : bridge ? 1 : 0));
            const layer = Number.isFinite(parsedLayer) ? parsedLayer : 0;
            const id = String(feature.id ?? p['@id'] ?? `road-${index}`);
            const lanes = Math.max(1, parseInt(String(p.lanes ?? 1), 10) || 1);
            const parsedHeadroom = parseFloat(String(p.maxheight ?? ''));
            inputs.push({ id, points: feature.geometry.coordinates.map(([lon, lat]) => this.latLonToLocal(lat, lon, centerLat, centerLon)),
                kind: tunnel || layer < 0 ? 'tunnel' : bridge || layer > 0 ? 'bridge' : 'ground', layer,
                halfWidth: this.getRoadWidth(highway, lanes) / 2, lanes, surface: String(p.surface ?? 'asphalt').toLowerCase(),
                headroom: Number.isFinite(parsedHeadroom) && parsedHeadroom >= 2 ? parsedHeadroom : undefined });
            if (typeof p.name === 'string') names.set(id, p.name);
        }
        const network = new RoadProfileNetwork(inputs, (x, z) => this.groundSample(x, z), options, this.terrain?.referenceHeight ?? 0);
        this.settings = network.settings;
        this.profiles = network.profiles;
        for (const profile of this.profiles) {
            this.activeProfile = profile;
            this.createRoadFromProfile(profile, names.get(profile.input.id));
        }
        this.activeProfile = null;
        console.log(`Created ${this.profiles.length} road profiles (${this.profiles.filter(p => p.input.kind === 'bridge').length} bridges, ${this.profiles.filter(p => p.input.kind === 'tunnel').length} tunnels)`);
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
     * Create road geometry from array of points using a single smooth curve mesh
     */
    private createRoadFromProfile(profile: RoadProfile, roadName?: string): void {
        const roadWidth = profile.input.halfWidth * 2;
        const isTunnel = profile.input.kind === 'tunnel';
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
            this.createLaneDividersAlongCurve(curve, roadWidth, lanesCount, numSegments, curveLength);
        }

        this.createProfileSides(profile, curve, roadWidth, numSegments);
        if (roadName) {
            const point = curve.getPoint(0.5), tangent = curve.getTangent(0.5);
            this.createStreetLabel(point, Math.atan2(tangent.x, tangent.z), roadName);
        }
    }

    private createProfileSides(profile: RoadProfile, curve: THREE.Curve<THREE.Vector3>, width: number, segments: number): void {
        const vertices: number[] = [];
        const face = (a: THREE.Vector3, b: THREE.Vector3, lowA: number, lowB: number, highA: number, highB: number) => {
            vertices.push(a.x, lowA, a.z, b.x, lowB, b.z, a.x, highA, a.z,
                a.x, highA, a.z, b.x, lowB, b.z, b.x, highB, b.z);
        };
        for (let i = 0; i < segments; i++) {
            const a = curve.getPoint(i / segments), b = curve.getPoint((i + 1) / segments);
            const pa = new THREE.Vector3(-curve.getTangent(i / segments).z, 0, curve.getTangent(i / segments).x).normalize();
            const pb = new THREE.Vector3(-curve.getTangent((i + 1) / segments).z, 0, curve.getTangent((i + 1) / segments).x).normalize();
            const ga = this.groundSample(a.x, a.z).height, gb = this.groundSample(b.x, b.z).height;
            const lowered = Math.min(a.y - ga, b.y - gb) < -0.02;
            const portal = profile.input.kind === 'tunnel' && Math.min(ga - a.y, gb - b.y) < profile.headroom + this.settings.tunnelCover;
            if (portal || profile.input.kind !== 'tunnel' && lowered) {
                const half = width / 2 + 0.2;
                this.cutouts.add([a.clone().addScaledVector(pa, half), b.clone().addScaledVector(pb, half),
                    b.clone().addScaledVector(pb, -half), a.clone().addScaledVector(pa, -half)]);
            }
            const raised = Math.max(a.y - ga, b.y - gb) > 0.2;
            if (profile.input.kind === 'ground' && !lowered && !raised) continue;
            for (const side of [-1, 1]) {
                const ea = a.clone().addScaledVector(pa, side * width / 2);
                const eb = b.clone().addScaledVector(pb, side * width / 2);
                ea.y = profile.sample(ea.x, ea.z).height; eb.y = profile.sample(eb.x, eb.z).height;
                if (profile.input.kind === 'bridge' || profile.input.kind === 'ground' && raised) {
                    const lowA = profile.input.kind === 'bridge' ? ea.y - this.settings.deckThickness : Math.min(ga, ea.y - this.settings.deckThickness);
                    const lowB = profile.input.kind === 'bridge' ? eb.y - this.settings.deckThickness : Math.min(gb, eb.y - this.settings.deckThickness);
                    face(ea, eb, lowA, lowB, ea.y + 0.45, eb.y + 0.45);
                    if (profile.input.kind === 'bridge' && lowered) {
                        face(ea, eb, ea.y + 0.45, eb.y + 0.45,
                            Math.max(ea.y + 0.45, this.groundSample(ea.x, ea.z).height),
                            Math.max(eb.y + 0.45, this.groundSample(eb.x, eb.z).height));
                    }
                    const oa = ea.clone().addScaledVector(pa, side * 0.15), ob = eb.clone().addScaledVector(pb, side * 0.15);
                    this.collisions?.addPolygon([[ea, eb, ob, oa]], Math.min(ea.y, eb.y) - this.settings.deckThickness,
                        Math.max(ea.y, eb.y) + 0.45, 'road');
                } else if (lowered || portal) {
                    const topA = Math.max(ea.y, this.groundSample(ea.x, ea.z).height), topB = Math.max(eb.y, this.groundSample(eb.x, eb.z).height);
                    face(ea, eb, ea.y - 0.1, eb.y - 0.1, topA, topB);
                    if (profile.input.kind === 'ground') {
                        const oa = ea.clone().addScaledVector(pa, side * 0.2), ob = eb.clone().addScaledVector(pb, side * 0.2);
                        this.collisions?.addPolygon([[ea, eb, ob, oa]], Math.min(ea.y, eb.y) - 0.1, Math.max(topA, topB), 'road');
                    }
                }
            }
            if (profile.input.kind === 'bridge') {
                const la = a.clone().addScaledVector(pa, width / 2), ra = a.clone().addScaledVector(pa, -width / 2);
                const lb = b.clone().addScaledVector(pb, width / 2), rb = b.clone().addScaledVector(pb, -width / 2);
                for (const p of [la, ra, lb, ra, rb, lb]) vertices.push(p.x, profile.sample(p.x, p.z).height - this.settings.deckThickness, p.z);
            }
        }
        if (vertices.length) {
            const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(geometry, this.sharedMaterials.ceilingMaterial); mesh.castShadow = mesh.receiveShadow = true;
            this.roadGroup.add(mesh);
        }
    }

    /**
     * Store simplified surface samples along a curve for surface lookup
     */
    private storeSurfaceSamples(
        curve: THREE.Curve<THREE.Vector3>,
        roadWidth: number,
        curveLength: number,
        surface: string
    ): void {
        const sampleCount = Math.max(2, Math.ceil(curveLength / this.surfaceSampleSpacing));
        const points = curve.getPoints(sampleCount);
        this.roadSurfaceSamples.push({ points, halfWidth: roadWidth * 0.5, surface, profile: this.activeProfile! });
        for (let i = 1; i < points.length; i++) {
            const segment = { a: points[i - 1], b: points[i], halfWidth: roadWidth * 0.5, surface, profile: this.activeProfile! };
            this.surfaceGrid.insert(segment,
                Math.min(segment.a.x, segment.b.x) - segment.halfWidth,
                Math.min(segment.a.z, segment.b.z) - segment.halfWidth,
                Math.max(segment.a.x, segment.b.x) + segment.halfWidth,
                Math.max(segment.a.z, segment.b.z) + segment.halfWidth);
        }
    }

    /**
     * Get the road surface type at a given world position
     */
    getSurfaceAtPosition(position: THREE.Vector3): string {
        return this.getRoadState(position.x, position.z, position.y).surface;
    }

    getRoadState(x: number, z: number, y: number, snap = false): RoadContact {
        const ground = this.groundSample(x, z);
        let result: RoadContact = { ...ground, surface: 'ground', grip: 0.55, structure: 'ground' };
        let best = Infinity;
        const checked = new Set<RoadProfile>();
        for (const road of this.surfaceGrid.at(x, z)) {
            const q = closestPoint({ x, z }, road.a, road.b);
            const distance = Math.hypot(x - q.x, z - q.z);
            if (distance > road.halfWidth || checked.has(road.profile)) continue;
            checked.add(road.profile);
            const contact = road.profile.sample(x, z);
            const verticalDistance = Math.abs(y - 0.4 - contact.height);
            // Reachable contact only: an overhead bridge or buried road cannot attract a car on another level.
            if (!snap && verticalDistance > 1.5) continue;
            const score = verticalDistance * 4 + distance * 0.05;
            if (score < best) { best = score; result = contact; }
        }
        return result;
    }

    cutTerrainGeometry(geometry: THREE.BufferGeometry): void {
        this.cutouts.apply(geometry, this.terrain ?? { sample: () => ({ height: 0, slopeX: 0, slopeZ: 0 }) });
    }


    getSpawnPosition(): THREE.Vector3 {
        let closest: THREE.Vector3 | null = null;
        let distance = Infinity;
        const groundRoads = this.roadSurfaceSamples.filter(road => road.profile.input.kind === 'ground');
        for (const road of groundRoads.length ? groundRoads : this.roadSurfaceSamples) for (const point of road.points) {
            const d = point.x * point.x + point.z * point.z;
            if (d < distance) { distance = d; closest = point; }
        }
        return closest ? closest.clone().add(new THREE.Vector3(0, 0.4, 0)) : new THREE.Vector3(0, ROAD_HEIGHT + 0.4, 0);
    }

    dispose(): void {
        this.clear();
        Object.values(this.sharedMaterials).forEach(material => material.dispose());
        for (const group of [this.roadGroup, this.labelsGroup, this.tunnelGroup]) this.scene.remove(group);
    }

    /**
     * Create a single road mesh along a curve
     */
    private createRoadMeshAlongCurve(
        curve: THREE.Curve<THREE.Vector3>,
        roadWidth: number,
        numSegments: number,
        isTunnel: boolean = false
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
            const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            // Calculate left and right edge points
            const leftPoint = point.clone().add(perp.clone().multiplyScalar(halfWidth));
            const rightPoint = point.clone().add(perp.clone().multiplyScalar(-halfWidth));

            // Add vertices (left edge)
            vertices.push(leftPoint.x, leftPoint.y, leftPoint.z);

            // Add vertices (right edge)
            vertices.push(rightPoint.x, rightPoint.y, rightPoint.z);
        }

        // Validate we have enough vertices
        if (vertices.length < 6) {
            console.warn('Road geometry has too few vertices, skipping');
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
            console.warn('Road geometry has too few indices, skipping');
            return;
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));

        // Compute normals from geometry (don't set manually, let Three.js calculate them)
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.computeVertexNormals();

        // Use shared material to avoid memory leaks
        const roadMaterial = isTunnel ? this.sharedMaterials.tunnelMaterial : this.sharedMaterials.roadMaterial;

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
     * Create 3D tunnel structure (walls and ceiling) above the road along a curve
     */
    private createTunnelStructureAlongCurve(
        curve: THREE.Curve<THREE.Vector3>,
        roadWidth: number,
        numSegments: number,
        curveLength: number
    ): void {
        const tunnelHeight = this.activeProfile?.headroom ?? this.settings.tunnelHeadroom; // Height of tunnel interior
        const wallThickness = 1; // Thickness of tunnel walls
        const roadY = ROAD_HEIGHT;
        const halfWidth = roadWidth / 2;

        // Use shared material
        const ceilingMaterial = this.sharedMaterials.ceilingMaterial;

        // Create tunnel structure segments along the curve
        for (let i = 0; i < numSegments; i++) {
            const t1 = i / numSegments;
            const t2 = (i + 1) / numSegments;

            const point1 = curve.getPoint(t1);
            const point2 = curve.getPoint(t2);
            const tangent1 = curve.getTangent(t1);
            const tangent2 = curve.getTangent(t2);

            // Average tangent for this segment
            const tangent = tangent1.clone().add(tangent2).normalize();
            const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            const segmentLength = point1.distanceTo(point2);
            if (segmentLength < 0.1) continue;

            // Match the rendered arch edges; leave both tunnel entrances open.
            for (const side of [-1, 1]) {
                const edge = (point: THREE.Vector3, normal: THREE.Vector3, width: number) => ({
                    x: point.x + normal.x * width * side,
                    z: point.z + normal.z * width * side
                });
                const n1 = new THREE.Vector3(-tangent1.z, 0, tangent1.x).normalize();
                const n2 = new THREE.Vector3(-tangent2.z, 0, tangent2.x).normalize();
                this.collisions?.addPolygon([[
                    edge(point1, n1, halfWidth), edge(point2, n2, halfWidth),
                    edge(point2, n2, halfWidth + wallThickness), edge(point1, n1, halfWidth + wallThickness)
                ]], Math.min(point1.y, point2.y), Math.max(point1.y, point2.y) + tunnelHeight, 'road');
            }

            const midpoint = point1.clone().add(point2).multiplyScalar(0.5);
            const yawAngle = Math.atan2(tangent.x, tangent.z);

            // Create semi-circular arch ceiling with thickness (3D structure)
            const archRadius = tunnelHeight; // Inner radius of the arch
            const outerArchRadius = archRadius + wallThickness; // Outer radius
            const numArchSegments = 16; // Number of segments for smooth arch
            const archLengthSegments = 2; // Split each tunnel segment along length for smoother curve following

            // Create arch vertices and indices for thick 3D structure
            const archVertices: number[] = [];
            const archIndices: number[] = [];

            // Create vertices for both inner and outer arch surfaces
            for (let lenSeg = 0; lenSeg <= archLengthSegments; lenSeg++) {
                const lenT = lenSeg / archLengthSegments;
                const archPoint = point1.clone().lerp(point2, lenT);

                // Get tangent at this point along the curve
                const t = t1 + (t2 - t1) * lenT;
                const curveTangent = curve.getTangent(t);
                const curvePerp = new THREE.Vector3(-curveTangent.z, 0, curveTangent.x).normalize();

                // Create vertices for inner surface (tunnel interior)
                for (let w = 0; w <= numArchSegments; w++) {
                    const widthT = w / numArchSegments; // 0 to 1 across the width
                    const archAngle = widthT * Math.PI; // 0 to PI (semi-circle)

                    // Calculate position along arch curve (semi-circle)
                    const archY = Math.sin(archAngle) * archRadius;

                    // Calculate position across road width (inner edge)
                    const innerLeftEdge = archPoint.clone().add(curvePerp.clone().multiplyScalar(-halfWidth));
                    const innerRightEdge = archPoint.clone().add(curvePerp.clone().multiplyScalar(halfWidth));
                    const innerArchPos = innerLeftEdge.clone().lerp(innerRightEdge, widthT);
                    innerArchPos.y = this.roadHeight(innerArchPos.x, innerArchPos.z) + archY;

                    archVertices.push(innerArchPos.x, innerArchPos.y, innerArchPos.z);
                }

                // Create vertices for outer surface (tunnel exterior - offset by wallThickness)
                for (let w = 0; w <= numArchSegments; w++) {
                    const widthT = w / numArchSegments;
                    const archAngle = widthT * Math.PI;

                    // Calculate position along arch curve with outer radius
                    const archY = Math.sin(archAngle) * outerArchRadius;

                    // Calculate position across road width (outer edge)
                    const outerLeftEdge = archPoint.clone().add(curvePerp.clone().multiplyScalar(-halfWidth - wallThickness));
                    const outerRightEdge = archPoint.clone().add(curvePerp.clone().multiplyScalar(halfWidth + wallThickness));
                    const outerArchPos = outerLeftEdge.clone().lerp(outerRightEdge, widthT);
                    outerArchPos.y = this.roadHeight(outerArchPos.x, outerArchPos.z) + archY;

                    archVertices.push(outerArchPos.x, outerArchPos.y, outerArchPos.z);
                }
            }

            // Create triangles for thick 3D structure
            const widthVerts = numArchSegments + 1;
            const totalVertsPerLength = widthVerts * 2; // Inner + outer vertices per length segment

            // Inner surface triangles (facing downward into tunnel)
            for (let lenSeg = 0; lenSeg < archLengthSegments; lenSeg++) {
                for (let w = 0; w < numArchSegments; w++) {
                    const base = lenSeg * totalVertsPerLength + w;
                    const nextBase = (lenSeg + 1) * totalVertsPerLength + w;

                    // Inner surface (counter-clockwise when viewed from inside tunnel)
                    archIndices.push(base, base + 1, nextBase);
                    archIndices.push(base + 1, nextBase + 1, nextBase);
                }
            }

            // Outer surface triangles (facing outward)
            for (let lenSeg = 0; lenSeg < archLengthSegments; lenSeg++) {
                for (let w = 0; w < numArchSegments; w++) {
                    const base = lenSeg * totalVertsPerLength + widthVerts + w;
                    const nextBase = (lenSeg + 1) * totalVertsPerLength + widthVerts + w;

                    // Outer surface (counter-clockwise when viewed from outside)
                    archIndices.push(base, nextBase, base + 1);
                    archIndices.push(base + 1, nextBase, nextBase + 1);
                }
            }

            // Side triangles connecting inner to outer surfaces (create thickness)
            for (let lenSeg = 0; lenSeg < archLengthSegments; lenSeg++) {
                for (let w = 0; w < numArchSegments; w++) {
                    const innerBase = lenSeg * totalVertsPerLength + w;
                    const innerNextBase = (lenSeg + 1) * totalVertsPerLength + w;
                    const outerBase = lenSeg * totalVertsPerLength + widthVerts + w;
                    const outerNextBase = (lenSeg + 1) * totalVertsPerLength + widthVerts + w;

                    // Left side of arch (connect inner to outer)
                    archIndices.push(innerBase, outerBase, innerNextBase);
                    archIndices.push(outerBase, outerNextBase, innerNextBase);

                    // Right side of arch (connect inner to outer)
                    archIndices.push(innerBase + 1, innerNextBase + 1, outerBase + 1);
                    archIndices.push(outerBase + 1, innerNextBase + 1, outerNextBase + 1);
                }
            }

            // End caps (connect inner to outer at segment ends to close the structure)
            if (i === 0 || i === numSegments - 1) {
                const lenSeg = i === 0 ? 0 : archLengthSegments;
                for (let w = 0; w < numArchSegments; w++) {
                    const innerBase = lenSeg * totalVertsPerLength + w;
                    const outerBase = lenSeg * totalVertsPerLength + widthVerts + w;

                    // Create triangles connecting inner to outer at the end
                    archIndices.push(innerBase, innerBase + 1, outerBase);
                    archIndices.push(innerBase + 1, outerBase + 1, outerBase);
                }
            }

            if (archVertices.length >= 6 && archIndices.length >= 3) {
                const archGeometry = new THREE.BufferGeometry();
                archGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(archVertices), 3));
                archGeometry.setIndex(new THREE.BufferAttribute(new Uint16Array(archIndices), 1));
                archGeometry.computeVertexNormals();

                const archMesh = new THREE.Mesh(archGeometry, ceilingMaterial);
                archMesh.receiveShadow = true;
                archMesh.castShadow = true; // Now it can cast shadows as a 3D object
                this.tunnelGroup.add(archMesh);
            }
        }
    }

    /**
     * Create a rounded corner patch at a road junction to fill gaps
     */
    private createRoundedCorner(
        cornerPoint: THREE.Vector3,
        incomingDir: THREE.Vector3,
        outgoingDir: THREE.Vector3,
        roadWidth: number,
        cornerRadius: number,
        isTunnel: boolean = false,
        layer: number = 0
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
        const innerStart = cornerPoint.clone().add(incomingDir.clone().multiplyScalar(-offsetDistance))
            .add(incomingPerp.clone().multiplyScalar(-halfWidth));
        const innerEnd = cornerPoint.clone().add(outgoingDir.clone().multiplyScalar(offsetDistance))
            .add(outgoingPerp.clone().multiplyScalar(-halfWidth));
        const outerStart = cornerPoint.clone().add(incomingDir.clone().multiplyScalar(-offsetDistance))
            .add(incomingPerp.clone().multiplyScalar(halfWidth));
        const outerEnd = cornerPoint.clone().add(outgoingDir.clone().multiplyScalar(offsetDistance))
            .add(outgoingPerp.clone().multiplyScalar(halfWidth));

        // Create a quad (two triangles) to fill the corner gap
        const geometry = new THREE.BufferGeometry();

        // Create vertices forming a quadrilateral
        const vertices = new Float32Array([
            innerStart.x, roadY, innerStart.z,  // 0: Inner start
            innerEnd.x, roadY, innerEnd.z,      // 1: Inner end
            outerEnd.x, roadY, outerEnd.z,      // 2: Outer end
            outerStart.x, roadY, outerStart.z   // 3: Outer start
        ]);

        // Create indices for two triangles (quad)
        const indices = new Uint16Array([
            0, 1, 2,  // First triangle: inner start, inner end, outer end
            0, 2, 3   // Second triangle: inner start, outer end, outer start
        ]);

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        // Use shared material
        const roadMaterial = isTunnel ? this.sharedMaterials.tunnelMaterial : this.sharedMaterials.roadMaterial;

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
     * Create edge lines along a curve as continuous curved ribbons (like the road surface)
     */
    private createEdgeLinesAlongCurve(
        curve: THREE.Curve<THREE.Vector3>,
        roadWidth: number,
        numSegments: number,
        curveLength: number
    ): void {
        const lineWidth = 0.15;
        const lineHeight = 0.015;
        const halfWidth = roadWidth / 2;

        // Create ribbon geometry for edge lines (similar to road surface)
        const createEdgeRibbon = (offsetMultiplier: number): THREE.Mesh | null => {
            const vertices: number[] = [];
            const indices: number[] = [];

            // Generate vertices along the curve for both edges of the line ribbon
            for (let i = 0; i <= numSegments; i++) {
                const t = i / numSegments;
                const point = curve.getPoint(t);
                const tangent = curve.getTangent(t);
                const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

                // Calculate position along the edge
                const edgePoint = point.clone().add(perp.clone().multiplyScalar(halfWidth * offsetMultiplier));
                edgePoint.y = lineHeight;

                // Create two vertices for the width of the line (ribbon)
                const halfLineWidth = lineWidth / 2;
                const leftEdge = edgePoint.clone().add(perp.clone().multiplyScalar(-halfLineWidth * offsetMultiplier));
                const rightEdge = edgePoint.clone().add(perp.clone().multiplyScalar(halfLineWidth * offsetMultiplier));

                vertices.push(leftEdge.x, this.roadHeight(leftEdge.x, leftEdge.z) + 0.015, leftEdge.z);
                vertices.push(rightEdge.x, this.roadHeight(rightEdge.x, rightEdge.z) + 0.015, rightEdge.z);
            }

            if (vertices.length < 6) return null;

            // Create indices for ribbon (triangles connecting adjacent segments)
            for (let i = 0; i < numSegments; i++) {
                const base = i * 2;
                indices.push(base, base + 2, base + 1);
                indices.push(base + 2, base + 3, base + 1);
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
            geometry.computeVertexNormals();

            const material = new THREE.MeshStandardMaterial({
                color: 0xFFFF00,
                emissive: 0xFFFF00,
                emissiveIntensity: 0.5,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4,
                side: THREE.DoubleSide
            });

            this.drapeSurface(geometry, ROAD_HEIGHT + 0.015);
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
     * Create lane dividers along a curve as continuous ribbons with repeating pattern
     */
    private createLaneDividersAlongCurve(
        curve: THREE.Curve<THREE.Vector3>,
        roadWidth: number,
        lanesCount: number,
        numSegments: number,
        curveLength: number
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
                const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

                // Accumulate arc length (distance from previous point)
                if (lastPoint !== null) {
                    cumulativeArcLength += lastPoint.distanceTo(point);
                }
                lastPoint = point;

                // Calculate position along divider line
                const dividerPoint = point.clone().add(perp.clone().multiplyScalar(offsetFromCenter));
                dividerPoint.y = dividerHeight;

                // Create two vertices for the width of the divider (ribbon)
                const halfWidth = dividerWidth / 2;
                const leftEdge = dividerPoint.clone().add(perp.clone().multiplyScalar(-halfWidth));
                const rightEdge = dividerPoint.clone().add(perp.clone().multiplyScalar(halfWidth));

                vertices.push(leftEdge.x, this.roadHeight(leftEdge.x, leftEdge.z) + 0.015, leftEdge.z);
                vertices.push(rightEdge.x, this.roadHeight(rightEdge.x, rightEdge.z) + 0.015, rightEdge.z);

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

            // Create texture for dashed pattern (white -> transparent -> white -> transparent)
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 32;
            const context = canvas.getContext('2d')!;

            const dashPixelLength = (dashLength / patternLength) * canvas.width;
            const gapPixelLength = (gapLength / patternLength) * canvas.width;

            // Clear entire canvas (transparent background)
            context.clearRect(0, 0, canvas.width, canvas.height);

            // Draw white dashes with alpha
            let x = 0;
            while (x < canvas.width) {
                // White dash
                context.fillStyle = '#FFFFFF';
                context.fillRect(x, 0, dashPixelLength, canvas.height);
                // Gap is transparent (already cleared)
                x += dashPixelLength + gapPixelLength;
            }

            const patternTexture = new THREE.CanvasTexture(canvas);
            patternTexture.wrapS = THREE.RepeatWrapping;
            patternTexture.wrapT = THREE.ClampToEdgeWrapping;
            patternTexture.needsUpdate = true;

            // Create geometry
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
            geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
            geometry.computeVertexNormals();

            // Calculate how many pattern repeats along the curve
            const patternRepeats = curveLength / patternLength;

            // Create material with pattern texture
            const material = new THREE.MeshStandardMaterial({
                map: patternTexture,
                emissive: 0xFFFFFF,
                emissiveIntensity: 0.3,
                transparent: true,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4,
                alphaTest: 0.01, // Low threshold for transparency
                side: THREE.DoubleSide
            });

            // Texture repeat is handled by UV coordinates and RepeatWrapping

            this.drapeSurface(geometry, ROAD_HEIGHT + 0.015);
            const divider = new THREE.Mesh(geometry, material);
            divider.castShadow = false;
            divider.receiveShadow = false;
            this.roadGroup.add(divider);
        }
    }

    /**
     * Get road width based on highway type and number of lanes
     * Each lane must be at least car width (1.9m) + 20% = 2.28m, rounded to 2.5m for comfort
     */
    private getRoadWidth(highwayType: string, lanesCount: number = 1): number {
        // Car width is 1.9 units, so minimum lane width is 1.9 * 1.2 = 2.28
        // We'll use 2.5 as a comfortable minimum lane width
        const carWidth = 1.9;
        const minLaneWidth = carWidth * 1.2; // At least car width + 20%
        const comfortableLaneWidth = 2.5; // Comfortable lane width for navigation

        // Minimum road widths per highway type (for single-lane roads)
        const minWidths: Record<string, number> = {
            'motorway': 5.2,
            'trunk': 4.5,
            'primary': 4.2,
            'secondary': 3.9,
            'tertiary': 3.75,
            'residential': 3.6,
            'service': 3.4,
            'unclassified': 3.6
        };

        // Get minimum width for this highway type
        let minRoadWidth = minWidths['residential']; // Default
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
     * Create a street name label as a sprite
     */
    private createStreetLabel(position: { x: number; z: number; }, rotation: number, name: string): void {
        // Create canvas for text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        // Set canvas size
        canvas.width = 192;
        canvas.height = 14;

        // Draw text with shadow for better visibility
        const fontSize = 10;
        context.font = `${fontSize}px Arial`;

        // Measure text to center it
        const metrics = context.measureText(name);
        const textWidth = metrics.width;

        // Draw shadow/background for better readability
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Draw text
        context.fillStyle = '#FFFFFF';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(name, canvas.width / 2, canvas.height / 2);

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        this.labelTextures.push(texture); // Track for disposal

        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1
        });

        // Create sprite
        const sprite = new THREE.Sprite(spriteMaterial);

        // Scale sprite (adjust size as needed)
        const scale = 2; // Size of the label in world units
        sprite.scale.set(scale * (textWidth / fontSize), scale, 1);

        // Position sprite above the road
        sprite.position.set(position.x, this.roadHeight(position.x, position.z) + 6, position.z); // 3 units above ground

        // Rotate sprite to face the road direction (sprite already faces camera, so just rotate Y)
        sprite.rotation.y = rotation;

        this.labelsGroup.add(sprite);
    }

    getRoads(): THREE.Mesh[] {
        return this.roads;
    }

    /**
     * Toggle visibility of street name labels
     */
    setLabelsVisible(visible: boolean): void {
        this.labelsGroup.visible = visible;
    }

    /**
     * Get current visibility state of street name labels
     */
    getLabelsVisible(): boolean {
        return this.labelsGroup.visible;
    }
}
