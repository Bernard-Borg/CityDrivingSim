import * as THREE from 'three';
import type { AmsterdamGeoJSON, AmsterdamFeature } from '@/types';

export class RoadGenerator {
    private roads: THREE.Mesh[] = [];
    private roadGroup: THREE.Group;
    private labelsGroup: THREE.Group;
    private tunnelGroup: THREE.Group;

    constructor(private scene: THREE.Scene) {
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
     * Clear all roads, labels, and tunnels from the groups
     */
    clear(): void {
        // Clear all children from groups
        while (this.roadGroup.children.length > 0) {
            this.roadGroup.remove(this.roadGroup.children[0]);
        }
        while (this.labelsGroup.children.length > 0) {
            this.labelsGroup.remove(this.labelsGroup.children[0]);
        }
        while (this.tunnelGroup.children.length > 0) {
            this.tunnelGroup.remove(this.tunnelGroup.children[0]);
        }
        this.roads = [];
    }

    /**
     * Generate roads from Amsterdam GeoJSON data
     */
    generateRoadsFromGeoJSON(geoJSON: AmsterdamGeoJSON, centerLat: number, centerLon: number): void {
        if (!geoJSON || !geoJSON.features) {
            console.warn('No GeoJSON features provided');
            return;
        }

        console.log(`Processing ${geoJSON.features.length} features...`);

        let roadsCreated = 0;
        let roadsSkipped = 0;

        geoJSON.features.forEach((feature: AmsterdamFeature) => {
            if (feature.geometry.type === 'LineString' && feature.properties.highway) {
                const coordinates = feature.geometry.coordinates;

                if (coordinates.length < 2) {
                    roadsSkipped++;
                    return;
                }

                // Convert coordinates from [lon, lat] to local [x, z]
                const points = coordinates.map(([lon, lat]) => {
                    return this.latLonToLocal(lat, lon, centerLat, centerLon);
                });

                // Check if this is a tunnel or bridge
                const isTunnel = feature.properties.tunnel === 'yes' || feature.properties.tunnel === 'building_passage';
                const layer = feature.properties.layer ? parseInt(feature.properties.layer, 10) : 0;

                // Create road from points
                this.createRoadFromPoints(points, feature.properties.highway, feature.properties.name, isTunnel, layer);
                roadsCreated++;
            } else {
                roadsSkipped++;
            }
        });

        console.log(`Created ${roadsCreated} roads, skipped ${roadsSkipped} features`);
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
     * Create road geometry from array of points
     */
    private createRoadFromPoints(
        points: Array<{ x: number; z: number; }>,
        highwayType: string,
        roadName?: string,
        isTunnel: boolean = false,
        layer: number = 0
    ): void {
        const roadWidth = this.getRoadWidth(highwayType);

        // Regular roads: slightly above ground (0.01)
        // Tunnels: render at ground level with 3D structure
        const roadY = 0.01;

        // Create segments between consecutive points
        for (let i = 0; i < points.length - 1; i++) {
            const start = new THREE.Vector3(points[i].x, roadY, points[i].z);
            const end = new THREE.Vector3(points[i + 1].x, roadY, points[i + 1].z);

            const direction = new THREE.Vector3().subVectors(end, start);
            const length = direction.length();

            if (length < 0.1) continue; // Skip very short segments

            direction.normalize();

            if (isTunnel) {
                // Create 3D tunnel structure
                this.createTunnelSegment(start, end, direction, length, roadWidth, layer);
            } else {
                // Create regular road surface
                this.createRoadSegment(start, end, direction, length, roadWidth, false);
            }

            // Create yellow edge lines
            this.createEdgeLines(start, end, direction, length, roadWidth);
        }

        // Add street name label on the middle segment of the road
        if (roadName && points.length >= 2) {
            const middleIndex = Math.floor(points.length / 2);
            const midPoint = points[middleIndex];
            const nextPoint = points[Math.min(middleIndex + 1, points.length - 1)];
            const labelDirection = Math.atan2(nextPoint.x - midPoint.x, nextPoint.z - midPoint.z);
            this.createStreetLabel(midPoint, labelDirection, roadName);
        }
    }

    /**
     * Create a road segment (grey surface)
     */
    private createRoadSegment(
        start: THREE.Vector3,
        end: THREE.Vector3,
        direction: THREE.Vector3,
        length: number,
        width: number,
        isTunnel: boolean = false
    ): void {
        // Tunnels use darker material
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: isTunnel ? 0x333333 : 0x666666, // Darker grey for tunnels
            roughness: 0.9,
            metalness: 0.1
        });

        const roadGeometry = new THREE.PlaneGeometry(width, length);
        const road = new THREE.Mesh(roadGeometry, roadMaterial);

        // Position and orient the road - ensure it's flat on the ground
        const midpoint = start.clone().add(end).multiplyScalar(0.5);
        road.position.copy(midpoint);

        // PlaneGeometry is created in XY plane. To lay it flat on XZ plane (ground):
        // Using 'YXZ' Euler order: first rotate Y (yaw/direction), then X (pitch/lay flat)
        const yawAngle = Math.atan2(direction.x, direction.z);
        const euler = new THREE.Euler(-Math.PI / 2, yawAngle, 0, 'YXZ');
        road.rotation.copy(euler);

        road.receiveShadow = true;
        this.roadGroup.add(road);
        this.roads.push(road);
    }

    /**
     * Create a 3D tunnel segment with walls and ceiling
     */
    private createTunnelSegment(
        start: THREE.Vector3,
        end: THREE.Vector3,
        direction: THREE.Vector3,
        length: number,
        roadWidth: number,
        layer: number
    ): void {
        const tunnelHeight = 6; // Height of tunnel interior
        const wallThickness = 0.5; // Thickness of tunnel walls
        const roadY = 0.01; // Road surface at ground level

        // Calculate depth offset based on layer (negative layers = deeper)
        const depthOffset = layer <= 0 ? Math.abs(layer) * 2 : 0;
        const tunnelY = roadY - depthOffset; // Slightly below ground for visibility

        const midpoint = start.clone().add(end).multiplyScalar(0.5);
        const yawAngle = Math.atan2(direction.x, direction.z);
        const perp = new THREE.Vector3(-direction.z, 0, direction.x); // Perpendicular vector

        // Tunnel materials
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444, // Darker road surface
            roughness: 0.9,
            metalness: 0.1
        });

        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x555555, // Concrete grey
            roughness: 0.8,
            metalness: 0.2
        });

        const ceilingMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a, // Slightly darker ceiling
            roughness: 0.8,
            metalness: 0.2
        });

        // 1. Road surface (floor of tunnel)
        const roadGeometry = new THREE.PlaneGeometry(roadWidth, length);
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.position.copy(midpoint);
        road.position.y = tunnelY;
        road.rotation.set(-Math.PI / 2, yawAngle, 0, 'YXZ');
        this.tunnelGroup.add(road);

        // 2. Left wall
        const leftWallGeometry = new THREE.PlaneGeometry(wallThickness, length);
        const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
        const leftOffset = perp.clone().multiplyScalar(roadWidth / 2);
        leftWall.position.copy(midpoint).add(leftOffset);
        leftWall.position.y = tunnelY + tunnelHeight / 2;
        leftWall.rotation.set(0, yawAngle + Math.PI / 2, 0, 'YXZ');
        this.tunnelGroup.add(leftWall);

        // 3. Right wall
        const rightWallGeometry = new THREE.PlaneGeometry(wallThickness, length);
        const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
        const rightOffset = perp.clone().multiplyScalar(-roadWidth / 2);
        rightWall.position.copy(midpoint).add(rightOffset);
        rightWall.position.y = tunnelY + tunnelHeight / 2;
        rightWall.rotation.set(0, yawAngle + Math.PI / 2, 0, 'YXZ');
        this.tunnelGroup.add(rightWall);

        // 4. Ceiling
        const ceilingGeometry = new THREE.PlaneGeometry(roadWidth + wallThickness * 2, length);
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.position.copy(midpoint);
        ceiling.position.y = tunnelY + tunnelHeight;
        ceiling.rotation.set(-Math.PI / 2, yawAngle, 0, 'YXZ');
        this.tunnelGroup.add(ceiling);

        // 5. Top cover (ground above tunnel) - semi-transparent so tunnel is visible
        const coverWidth = roadWidth + wallThickness * 2 + 2; // Slightly wider than tunnel
        const coverGeometry = new THREE.PlaneGeometry(coverWidth, length);
        const coverMaterial = new THREE.MeshStandardMaterial({
            color: 0x7CB342, // Green grass
            roughness: 0.8,
            metalness: 0,
            transparent: true,
            opacity: 0.6 // Semi-transparent so tunnel is visible from above
        });
        const cover = new THREE.Mesh(coverGeometry, coverMaterial);
        cover.position.copy(midpoint);
        cover.position.y = 0.1; // Just above ground
        cover.rotation.set(-Math.PI / 2, yawAngle, 0, 'YXZ');
        this.tunnelGroup.add(cover);
    }

    /**
     * Create yellow edge lines for the road
     */
    private createEdgeLines(
        start: THREE.Vector3,
        end: THREE.Vector3,
        direction: THREE.Vector3,
        length: number,
        roadWidth: number
    ): void {
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFF00, // Yellow color
            emissive: 0xFFFF00,
            emissiveIntensity: 0.5
        });

        const lineWidth = 0.15;
        const lineHeight = 0.015; // Slightly above road surface
        const halfWidth = roadWidth / 2;

        // Perpendicular vector for offset
        const perp = new THREE.Vector3(-direction.z, 0, direction.x);

        // Left edge line
        const leftOffset = perp.clone().multiplyScalar(halfWidth);
        const leftStart = start.clone().add(leftOffset);
        leftStart.y = lineHeight;
        const leftEnd = end.clone().add(leftOffset);
        leftEnd.y = lineHeight;

        const leftLineGeometry = new THREE.PlaneGeometry(lineWidth, length);
        const leftLine = new THREE.Mesh(leftLineGeometry, lineMaterial);
        const leftMidpoint = leftStart.clone().add(leftEnd).multiplyScalar(0.5);
        leftLine.position.copy(leftMidpoint);

        // Use same rotation approach as createRoadSegment: 'YXZ' Euler order
        const yawAngle = Math.atan2(direction.x, direction.z);
        const leftEuler = new THREE.Euler(-Math.PI / 2, yawAngle, 0, 'YXZ');
        leftLine.rotation.copy(leftEuler);
        this.roadGroup.add(leftLine);

        // Right edge line
        const rightOffset = perp.clone().multiplyScalar(-halfWidth);
        const rightStart = start.clone().add(rightOffset);
        rightStart.y = lineHeight;
        const rightEnd = end.clone().add(rightOffset);
        rightEnd.y = lineHeight;

        const rightLineGeometry = new THREE.PlaneGeometry(lineWidth, length);
        const rightLine = new THREE.Mesh(rightLineGeometry, lineMaterial);
        const rightMidpoint = rightStart.clone().add(rightEnd).multiplyScalar(0.5);
        rightLine.position.copy(rightMidpoint);

        // Use same rotation approach as createRoadSegment: 'YXZ' Euler order
        const rightEuler = new THREE.Euler(-Math.PI / 2, yawAngle, 0, 'YXZ');
        rightLine.rotation.copy(rightEuler);
        this.roadGroup.add(rightLine);
    }

    /**
     * Get road width based on highway type
     */
    private getRoadWidth(highwayType: string): number {
        const widths: Record<string, number> = {
            'motorway': 10,
            'trunk': 8,
            'primary': 7,
            'secondary': 6,
            'tertiary': 5,
            'residential': 4,
            'service': 3,
            'unclassified': 4
        };

        // Check for type in highway string
        for (const [type, width] of Object.entries(widths)) {
            if (highwayType.toLowerCase().includes(type)) {
                return width;
            }
        }

        return widths['residential']; // Default width
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
        canvas.width = 256;
        canvas.height = 64;

        // Draw text with shadow for better visibility
        const fontSize = 12;
        context.font = `${fontSize}px Arial`;

        // Measure text to center it
        const metrics = context.measureText(name);
        const textWidth = metrics.width;
        const textHeight = fontSize;

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

        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1
        });

        // Create sprite
        const sprite = new THREE.Sprite(spriteMaterial);

        // Scale sprite (adjust size as needed)
        const scale = 5; // Size of the label in world units
        sprite.scale.set(scale * (textWidth / fontSize), scale, 1);

        // Position sprite above the road
        sprite.position.set(position.x, 3, position.z); // 3 units above ground

        // Rotate sprite to face the road direction (sprite already faces camera, so just rotate Y)
        sprite.rotation.y = rotation;

        this.labelsGroup.add(sprite);
    }

    getRoads(): THREE.Mesh[] {
        return this.roads;
    }
}
