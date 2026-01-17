import * as THREE from 'three';
import type { GeoJSON, Feature } from '@/types';

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
     * Generate roads from GeoJSON data
     */
    generateRoadsFromGeoJSON(geoJSON: GeoJSON, centerLat: number, centerLon: number): void {
        if (!geoJSON || !geoJSON.features) {
            console.warn('No GeoJSON features provided');
            return;
        }

        console.log(`Processing ${geoJSON.features.length} features...`);

        let roadsCreated = 0;
        let roadsSkipped = 0;

        geoJSON.features.forEach((feature: Feature) => {
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

                // Parse lanes count (default to 1 if not specified)
                const lanesCount = feature.properties.lanes ? parseInt(feature.properties.lanes, 10) : 1;

                // Create road from points
                this.createRoadFromPoints(points, feature.properties.highway, feature.properties.name, isTunnel, layer, lanesCount);
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
     * Create road geometry from array of points using a single smooth curve mesh
     */
    private createRoadFromPoints(
        points: Array<{ x: number; z: number; }>,
        highwayType: string,
        roadName?: string,
        isTunnel: boolean = false,
        layer: number = 0,
        lanesCount: number = 1
    ): void {
        const roadWidth = this.getRoadWidth(highwayType, lanesCount);
        const roadY = 0.01;

        if (points.length < 2) return;

        // Convert 2D points to 3D vectors
        const curvePoints = points.map(p => new THREE.Vector3(p.x, roadY, p.z));

        // Create a smooth curve through all points using CatmullRom spline
        // This automatically handles smooth transitions between segments
        const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal');

        // Get total curve length
        const curveLength = curve.getLength();

        if (curveLength < 0.1) return; // Skip very short curves

        // Number of segments along the curve (more segments = smoother but more vertices)
        // Adjust based on curve length - roughly one segment per 2 meters for balance
        const numSegments = Math.max(2, Math.ceil(curveLength * 0.5));

        // Create the main road mesh along the curve
        // Tunnels use the same rendering as regular roads, just with darker color
        this.createRoadMeshAlongCurve(curve, roadWidth, numSegments, isTunnel);

        // Create yellow edge lines along the curve
        this.createEdgeLinesAlongCurve(curve, roadWidth, numSegments, curveLength);

        // Create lane dividers along the curve if multiple lanes
        if (lanesCount > 1) {
            this.createLaneDividersAlongCurve(curve, roadWidth, lanesCount, numSegments, curveLength);
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
     * Create a single road mesh along a curve
     */
    private createRoadMeshAlongCurve(
        curve: THREE.CatmullRomCurve3,
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
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
        geometry.computeVertexNormals();

        // Create material - use DoubleSide to ensure visibility from both sides
        // Tunnels use darker color to appear shaded
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: isTunnel ? 0x444444 : 0x666666, // Darker grey for tunnels
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

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
        const roadY = 0.01;

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

        // Create material
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: isTunnel ? 0x333333 : 0x666666,
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide // Render both sides
        });

        const cornerMesh = new THREE.Mesh(geometry, roadMaterial);
        cornerMesh.receiveShadow = true;

        if (isTunnel) {
            // Adjust Y for tunnel depth
            cornerMesh.position.y = -(layer <= 0 ? Math.abs(layer) * 2 : 0);
            this.tunnelGroup.add(cornerMesh);
        } else {
            this.roadGroup.add(cornerMesh);
        }
        this.roads.push(cornerMesh);
    }

    /**
     * Create edge lines along a curve
     */
    private createEdgeLinesAlongCurve(
        curve: THREE.CatmullRomCurve3,
        roadWidth: number,
        numSegments: number,
        curveLength: number
    ): void {
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFF00,
            emissive: 0xFFFF00,
            emissiveIntensity: 0.5
        });

        const lineWidth = 0.15;
        const lineHeight = 0.015;
        const halfWidth = roadWidth / 2;

        // Create edge lines along the curve as small segments
        for (let i = 0; i < numSegments; i++) {
            const t1 = i / numSegments;
            const t2 = (i + 1) / numSegments;

            const point1 = curve.getPoint(t1);
            const point2 = curve.getPoint(t2);
            const tangent = curve.getTangent(t1);
            const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            const segmentLength = point1.distanceTo(point2);
            if (segmentLength < 0.1) continue;

            // Left edge line
            const leftOffset = perp.clone().multiplyScalar(halfWidth);
            const leftPoint1 = point1.clone().add(leftOffset);
            leftPoint1.y = lineHeight;
            const leftPoint2 = point2.clone().add(leftOffset);
            leftPoint2.y = lineHeight;
            const leftMidpoint = leftPoint1.clone().add(leftPoint2).multiplyScalar(0.5);

            const leftLineGeometry = new THREE.PlaneGeometry(lineWidth, segmentLength);
            const leftLine = new THREE.Mesh(leftLineGeometry, lineMaterial);
            leftLine.position.copy(leftMidpoint);

            const yawAngle = Math.atan2(tangent.x, tangent.z);
            const leftEuler = new THREE.Euler(-Math.PI / 2, yawAngle, 0, 'YXZ');
            leftLine.rotation.copy(leftEuler);
            this.roadGroup.add(leftLine);

            // Right edge line
            const rightOffset = perp.clone().multiplyScalar(-halfWidth);
            const rightPoint1 = point1.clone().add(rightOffset);
            rightPoint1.y = lineHeight;
            const rightPoint2 = point2.clone().add(rightOffset);
            rightPoint2.y = lineHeight;
            const rightMidpoint = rightPoint1.clone().add(rightPoint2).multiplyScalar(0.5);

            const rightLineGeometry = new THREE.PlaneGeometry(lineWidth, segmentLength);
            const rightLine = new THREE.Mesh(rightLineGeometry, lineMaterial);
            rightLine.position.copy(rightMidpoint);

            const rightEuler = new THREE.Euler(-Math.PI / 2, yawAngle, 0, 'YXZ');
            rightLine.rotation.copy(rightEuler);
            this.roadGroup.add(rightLine);
        }
    }

    /**
     * Create lane dividers along a curve
     */
    private createLaneDividersAlongCurve(
        curve: THREE.CatmullRomCurve3,
        roadWidth: number,
        lanesCount: number,
        numSegments: number,
        curveLength: number
    ): void {
        const dividerMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            emissive: 0xFFFFFF,
            emissiveIntensity: 0.3
        });

        const dividerWidth = 0.1;
        const dividerHeight = 0.02;
        const laneWidth = roadWidth / lanesCount;

        // Create dividers between lanes (not at edges)
        for (let i = 1; i < lanesCount; i++) {
            const offsetFromCenter = (i - lanesCount / 2) * laneWidth;

            // Create dashed line effect along the curve
            const dashLength = 2.0;
            const gapLength = 1.0;
            const segmentLength = dashLength + gapLength;
            const numDashes = Math.ceil(curveLength / segmentLength);

            for (let dash = 0; dash < numDashes; dash++) {
                const dashStart = dash * segmentLength;
                const dashEnd = Math.min(dashStart + dashLength, curveLength);

                if (dashEnd <= dashStart) continue;

                // Get curve positions for this dash
                const tStart = dashStart / curveLength;
                const tEnd = dashEnd / curveLength;
                const point1 = curve.getPoint(tStart);
                const point2 = curve.getPoint(tEnd);
                const tangent = curve.getTangent(tStart);
                const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

                const dashLengthActual = point1.distanceTo(point2);
                if (dashLengthActual < 0.1) continue;

                const offset = perp.clone().multiplyScalar(offsetFromCenter);
                const dashPoint1 = point1.clone().add(offset);
                dashPoint1.y = dividerHeight;
                const dashPoint2 = point2.clone().add(offset);
                dashPoint2.y = dividerHeight;
                const dashMidpoint = dashPoint1.clone().add(dashPoint2).multiplyScalar(0.5);

                const dividerGeometry = new THREE.PlaneGeometry(dividerWidth, dashLengthActual);
                const divider = new THREE.Mesh(dividerGeometry, dividerMaterial);
                divider.position.copy(dashMidpoint);

                const yawAngle = Math.atan2(tangent.x, tangent.z);
                const dividerEuler = new THREE.Euler(-Math.PI / 2, yawAngle, 0, 'YXZ');
                divider.rotation.copy(dividerEuler);
                this.roadGroup.add(divider);
            }
        }
    }

    /**
     * Create tunnel along a curve (simplified - uses the same ribbon approach)
     */
    private createTunnelAlongCurve(
        curve: THREE.CatmullRomCurve3,
        roadWidth: number,
        numSegments: number,
        curveLength: number,
        layer: number
    ): void {
        // Tunnels use the same ribbon approach as regular roads
        // The road surface should be at the same Y level as regular roads
        const roadY = 0.01;
        // Tunnels are at the same level as roads - the "tunnel" property just means they have tunnel structure
        // Layer can be used for multi-level roads, but default is same as regular roads
        const depthOffset = layer <= 0 ? Math.abs(layer) * 2 : 0;
        const tunnelY = roadY - depthOffset;

        const halfWidth = roadWidth / 2;
        const vertices: number[] = [];
        const indices: number[] = [];

        // Generate vertices along the curve (same as regular road but with Y offset)
        for (let i = 0; i <= numSegments; i++) {
            const t = i / numSegments;
            const point = curve.getPoint(t);
            const tangent = curve.getTangent(t);
            const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            const leftPoint = point.clone().add(perp.clone().multiplyScalar(halfWidth));
            leftPoint.y = tunnelY;
            const rightPoint = point.clone().add(perp.clone().multiplyScalar(-halfWidth));
            rightPoint.y = tunnelY;

            vertices.push(leftPoint.x, leftPoint.y, leftPoint.z);
            vertices.push(rightPoint.x, rightPoint.y, rightPoint.z);
        }

        // Validate we have enough vertices
        if (vertices.length < 6) {
            console.warn('Tunnel geometry has too few vertices, skipping');
            return;
        }

        // Create triangle indices (same winding order fix as regular roads)
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
            console.warn('Tunnel geometry has too few indices, skipping');
            return;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));

        // Compute normals from geometry (don't set manually, let Three.js calculate them)
        geometry.computeVertexNormals();

        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        const roadMesh = new THREE.Mesh(geometry, roadMaterial);
        roadMesh.receiveShadow = true;
        roadMesh.frustumCulled = false; // Ensure it's not culled

        // Debug: log tunnel creation
        console.log(`Created tunnel mesh: ${vertices.length / 3} vertices, ${indices.length / 3} triangles, Y=${tunnelY.toFixed(2)}, layer=${layer}`);

        this.tunnelGroup.add(roadMesh);
        this.roads.push(roadMesh);
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
     * Create lane divider lines for multi-lane roads
     */
    private createLaneDividers(
        start: THREE.Vector3,
        end: THREE.Vector3,
        direction: THREE.Vector3,
        length: number,
        roadWidth: number,
        lanesCount: number
    ): void {
        const dividerMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF, // White color for lane dividers
            emissive: 0xFFFFFF,
            emissiveIntensity: 0.3
        });

        const dividerWidth = 0.1; // Narrow divider line
        const dividerHeight = 0.02; // Slightly above road surface
        const yawAngle = Math.atan2(direction.x, direction.z);

        // Perpendicular vector for offset
        const perp = new THREE.Vector3(-direction.z, 0, direction.x);

        // Calculate lane width
        const laneWidth = roadWidth / lanesCount;

        // Create dividers between lanes (not at edges)
        // For n lanes, we need n-1 dividers
        for (let i = 1; i < lanesCount; i++) {
            // Calculate offset from center (0 is center, positive is right, negative is left)
            // For 2 lanes: divider at 0 (center)
            // For 3 lanes: dividers at -laneWidth/2 and +laneWidth/2
            // For 4 lanes: dividers at -laneWidth, 0, +laneWidth
            const offsetFromCenter = (i - lanesCount / 2) * laneWidth;
            const offset = perp.clone().multiplyScalar(offsetFromCenter);

            // Create dashed line effect by creating multiple segments
            const dashLength = 2.0; // Length of each dash
            const gapLength = 1.0; // Length of gap between dashes
            const segmentLength = dashLength + gapLength;
            const numSegments = Math.ceil(length / segmentLength);

            for (let seg = 0; seg < numSegments; seg++) {
                const segmentStart = seg * segmentLength;
                const segmentEnd = Math.min(segmentStart + dashLength, length);

                if (segmentEnd <= segmentStart) continue;

                // Calculate positions along the road
                const tStart = segmentStart / length;
                const tEnd = segmentEnd / length;

                const segmentStartPos = start.clone().lerp(end, tStart).add(offset);
                segmentStartPos.y = dividerHeight;
                const segmentEndPos = start.clone().lerp(end, tEnd).add(offset);
                segmentEndPos.y = dividerHeight;

                const segmentLengthActual = segmentEndPos.distanceTo(segmentStartPos);
                if (segmentLengthActual < 0.1) continue;

                const segmentMidpoint = segmentStartPos.clone().add(segmentEndPos).multiplyScalar(0.5);

                const dividerGeometry = new THREE.PlaneGeometry(dividerWidth, segmentLengthActual);
                const divider = new THREE.Mesh(dividerGeometry, dividerMaterial);
                divider.position.copy(segmentMidpoint);

                const dividerEuler = new THREE.Euler(-Math.PI / 2, yawAngle, 0, 'YXZ');
                divider.rotation.copy(dividerEuler);
                this.roadGroup.add(divider);
            }
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
        const scale = 2; // Size of the label in world units
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
