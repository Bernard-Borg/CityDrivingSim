import * as THREE from 'three';
import type { GeoJSON } from '@/types';

export class BuildingGenerator {
    private buildings: THREE.Mesh[] = [];
    private buildingGroup: THREE.Group;
    private sharedMaterial: THREE.MeshStandardMaterial;

    // Default building height per level (in meters)
    private readonly HEIGHT_PER_LEVEL = 3.0; // ~10 feet per story
    private readonly DEFAULT_HEIGHT = 3.0; // Default height if no levels specified

    constructor(private scene: THREE.Scene) {
        this.buildingGroup = new THREE.Group();
        // Mark group so it's not removed during scene clearing
        this.buildingGroup.userData.isBuildingGroup = true;
        this.scene.add(this.buildingGroup);

        // Shared material for all buildings
        this.sharedMaterial = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC, // Light gray for buildings
            roughness: 0.7,
            metalness: 0.1
        });
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
     * Parse building height from properties
     */
    private getBuildingHeight(properties: any): number {
        // Check for 'levels' or 'building:levels' property
        const levels = properties.levels || properties['building:levels'];

        if (levels) {
            const numLevels = typeof levels === 'string' ? parseFloat(levels) : levels;
            if (!isNaN(numLevels) && numLevels > 0) {
                return numLevels * this.HEIGHT_PER_LEVEL;
            }
        }

        return this.DEFAULT_HEIGHT;
    }

    /**
     * Create a 3D building mesh from a polygon
     */
    private createBuildingFromPolygon(
        coordinates: Array<Array<[number, number]>>,
        height: number,
        centerLat: number,
        centerLon: number
    ): THREE.Mesh | null {
        // Polygon coordinates: first array is outer ring, others are holes
        const outerRing = coordinates[0];
        if (!outerRing || outerRing.length < 3) {
            return null; // Need at least 3 points for a polygon
        }

        // Convert coordinates to local space and create a 2D shape
        // GeoJSON Polygon coordinates are [lon, lat] format
        const shape = new THREE.Shape();

        // Convert first point: outerRing[0] is [lon, lat]
        const [firstLon, firstLat] = outerRing[0];
        const firstPoint = this.latLonToLocal(firstLat, firstLon, centerLat, centerLon);
        shape.moveTo(firstPoint.x, firstPoint.z);

        // Check if polygon is already closed (last point == first point)
        const lastPoint = outerRing[outerRing.length - 1];
        const isClosed = outerRing.length > 3 &&
            firstLon === lastPoint[0] &&
            firstLat === lastPoint[1];

        const endIndex = isClosed ? outerRing.length - 1 : outerRing.length;

        for (let i = 1; i < endIndex; i++) {
            // Convert each point: outerRing[i] is [lon, lat]
            const [lon, lat] = outerRing[i];
            const point = this.latLonToLocal(lat, lon, centerLat, centerLon);
            shape.lineTo(point.x, point.z);
        }

        // Close the shape if not already closed
        if (!isClosed) {
            shape.lineTo(firstPoint.x, firstPoint.z);
        }

        // Handle holes (interior rings) if present
        for (let holeIndex = 1; holeIndex < coordinates.length; holeIndex++) {
            const holeRing = coordinates[holeIndex];
            if (holeRing && holeRing.length >= 3) {
                const hole = new THREE.Path();
                // Convert first hole point: holeRing[0] is [lon, lat]
                const [firstHoleLon, firstHoleLat] = holeRing[0];
                const firstHolePoint = this.latLonToLocal(firstHoleLat, firstHoleLon, centerLat, centerLon);
                hole.moveTo(firstHolePoint.x, firstHolePoint.z);

                // Check if hole is already closed
                const lastHolePoint = holeRing[holeRing.length - 1];
                const holeIsClosed = holeRing.length > 3 &&
                    firstHoleLon === lastHolePoint[0] &&
                    firstHoleLat === lastHolePoint[1];
                const holeEndIndex = holeIsClosed ? holeRing.length - 1 : holeRing.length;

                for (let i = 1; i < holeEndIndex; i++) {
                    // Convert each hole point: holeRing[i] is [lon, lat]
                    const [lon, lat] = holeRing[i];
                    const point = this.latLonToLocal(lat, lon, centerLat, centerLon);
                    hole.lineTo(point.x, point.z);
                }

                // Close the hole if not already closed
                if (!holeIsClosed) {
                    hole.lineTo(firstHolePoint.x, firstHolePoint.z);
                }
                shape.holes.push(hole);
            }
        }

        // Extrude the shape to create a 3D building
        const extrudeSettings = {
            depth: height,
            bevelEnabled: false
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // ExtrudeGeometry creates geometry from Shape in XY plane, extruding along +Z
        // Our Shape uses moveTo(x, z), which Shape interprets as (x, y) in its XY plane
        // So ExtrudeGeometry creates: base vertices at (x, z, 0), top vertices at (x, z, depth)
        // where x and z come from our Shape coordinates

        // Rotate -90° around X axis to convert from XY plane (Z-up) to XZ plane (Y-up)
        // rotateX(-90°): (x, y, z) -> (x, z, -y)
        // Base: (x, z, 0) -> (x, 0, -z)
        // Top: (x, z, depth) -> (x, depth, -z)

        // This means the Z coordinate gets negated! To fix this, we need to negate z in the Shape
        // OR we can negate z after rotation. Actually, let me check the rotation more carefully:

        // Standard rotateX(-90°):
        // [1    0       0   ] [x]   [x     ]
        // [0  cos  -sin   ] [y] = [z     ]
        // [0  sin   cos   ] [z]   [-y    ]
        // where cos(-90°)=0, sin(-90°)=-1
        // So: x' = x, y' = z, z' = -y

        // If our Shape has (x, z) as (x, y) in ExtrudeGeometry:
        // Base: (x, z, 0) -> after rotateX(-90°): (x, 0, -z)
        // This negates the Z coordinate! That's why negating dLat "fixes" it - it's double-negating.

        // The fix: negate z when creating the Shape, so after rotation it becomes correct
        // OR rotate differently. Let me use rotateX(+90°) instead, which would be: (x, y, z) -> (x, -z, y)
        // Base: (x, z, 0) -> (x, 0, z) ✓ (but y and z are swapped)

        // Actually, the correct solution: since rotateX(-90°) negates Z, we should negate z in the Shape
        // But wait, that's what changing dLat does... so maybe the issue is we need to negate z AFTER the conversion?

        // Better solution: Don't negate z in latLonToLocal (keep it correct), but negate it when passing to Shape
        // OR: Use rotateX(+90°) and swap coordinates

        // Actually, let me try the simplest fix: negate z coordinate in the Shape after rotation
        geometry.rotateX(-Math.PI / 2);

        // The rotation negates z, so we need to flip it back
        // We can do this by scaling geometry by (1, 1, -1) on Z, or by using the shape coordinates differently

        // Actually, the real fix: when we create the Shape with moveTo(x, z), we need to use -z instead
        // But that would be messy. Better: rotate +90° and adjust, OR use a different approach.

        // Let's try: rotate +90° instead, which gives: (x, y, z) -> (x, -z, y)
        // Base: (x, z, 0) -> (x, 0, z) - wait that's still wrong...

        // The correct solution: The Shape needs to use coordinates in the right order
        // Since ExtrudeGeometry uses XY plane and extrudes along Z, and we want XZ plane with Y-up,
        // we should use Shape coordinates as (x, -z) so after rotation they become (x, z)

        // Recompute normals after rotation
        geometry.computeVertexNormals();

        // Negate Z coordinates to fix the rotation issue
        // rotateX(-90°) transforms (x, y, z) -> (x, z, -y)
        // Since our Shape uses (x, z) as (x, y), after rotation Z gets negated
        // We need to flip Z back to match the correct coordinate system (same as roads/trees)
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            positions.setZ(i, -positions.getZ(i));
        }
        positions.needsUpdate = true;

        const building = new THREE.Mesh(geometry, this.sharedMaterial);
        // Position building base at ground level (y=0.01 to match roads slightly above ground)
        building.position.y = 0.01;
        building.castShadow = true;
        building.receiveShadow = true;

        return building;
    }

    /**
     * Generate buildings from GeoJSON data
     */
    generateBuildingsFromGeoJSON(geoJSON: GeoJSON, centerLat: number, centerLon: number): void {
        let buildingsCreated = 0;

        for (const feature of geoJSON.features) {
            // Only process Polygon geometry types
            const geom = feature.geometry as any;
            if (geom.type !== 'Polygon' || !geom.coordinates) {
                continue;
            }

            const coordinates = geom.coordinates as Array<Array<[number, number]>>;
            const height = this.getBuildingHeight(feature.properties || {});

            const building = this.createBuildingFromPolygon(coordinates, height, centerLat, centerLon);

            if (building) {
                this.buildingGroup.add(building);
                this.buildings.push(building);
                buildingsCreated++;
            }
        }

        console.log(`Generated ${buildingsCreated} buildings`);
    }

    /**
     * Clear all buildings from the scene
     */
    clear(): void {
        // Dispose of all building meshes
        this.buildings.forEach(building => {
            if (building.geometry) {
                building.geometry.dispose();
            }
        });

        // Remove all children from the group
        const children = [...this.buildingGroup.children];
        children.forEach(child => {
            this.buildingGroup.remove(child);
        });

        this.buildings = [];
    }
}
