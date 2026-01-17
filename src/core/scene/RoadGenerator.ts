import * as THREE from 'three';
import type { AmsterdamGeoJSON, AmsterdamFeature } from '@/types';

export class RoadGenerator {
  private roads: THREE.Mesh[] = [];
  private roadGroup: THREE.Group;
  private labelsGroup: THREE.Group;

  constructor(private scene: THREE.Scene) {
    this.roadGroup = new THREE.Group();
    this.labelsGroup = new THREE.Group();
    this.scene.add(this.roadGroup);
    this.scene.add(this.labelsGroup);
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

        // Create road from points
        this.createRoadFromPoints(points, feature.properties.highway, feature.properties.name);
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
  private latLonToLocal(lat: number, lon: number, centerLat: number, centerLon: number): { x: number; z: number } {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat - centerLat) * Math.PI / 180;
    const dLon = (lon - centerLon) * Math.PI / 180;
    
    const x = dLon * R * Math.cos(centerLat * Math.PI / 180);
    const z = dLat * R;
    
    return { x, z };
  }

  /**
   * Create road geometry from array of points
   */
  private createRoadFromPoints(points: Array<{ x: number; z: number }>, highwayType: string, roadName?: string): void {
    const roadWidth = this.getRoadWidth(highwayType);
    const roadHeight = 0.01; // Slightly above ground to avoid z-fighting

    // Create segments between consecutive points
    for (let i = 0; i < points.length - 1; i++) {
      const start = new THREE.Vector3(points[i].x, roadHeight, points[i].z);
      const end = new THREE.Vector3(points[i + 1].x, roadHeight, points[i + 1].z);
      
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      
      if (length < 0.1) continue; // Skip very short segments
      
      direction.normalize();

      // Create road surface (grey)
      this.createRoadSegment(start, end, direction, length, roadWidth);

      // Create yellow edge lines
    //   this.createEdgeLines(start, end, direction, length, roadWidth);
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
    width: number
  ): void {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666, // Grey color
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
    const angle = Math.atan2(direction.x, direction.z);
    leftLine.rotation.x = -Math.PI / 2; // Lay flat
    leftLine.rotation.y = angle; // Face correct direction
    leftLine.rotation.z = 0;
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
    rightLine.rotation.x = -Math.PI / 2; // Lay flat
    rightLine.rotation.y = angle; // Face correct direction
    rightLine.rotation.z = 0;
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
  private createStreetLabel(position: { x: number; z: number }, rotation: number, name: string): void {
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
