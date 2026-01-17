import * as THREE from 'three';
import { RoadGenerator } from './RoadGenerator';
import type { AmsterdamGeoJSON } from '@/types';

export class SceneManager {
  private roadGenerator: RoadGenerator;
  private startPosition: THREE.Vector3;
  private centerLat: number = 0;
  private centerLon: number = 0;

  constructor(private scene: THREE.Scene) {
    this.roadGenerator = new RoadGenerator(scene);
    this.startPosition = new THREE.Vector3(0, 1, 0);
  }

  async loadCityMap(): Promise<void> {
    try {
      // Load Amsterdam GeoJSON data
      const response = await fetch('/data/amsterdam.json');
      if (!response.ok) {
        throw new Error(`Failed to load amsterdam.json: ${response.status}`);
      }
      
      const geoJSON: AmsterdamGeoJSON = await response.json();
      
      // Amsterdam center coordinates (used for coordinate conversion)
      this.centerLat = 52.3676;
      this.centerLon = 4.9041;
      
      // Create ground plane
      this.createGround();
      
      // Generate roads from GeoJSON
      this.roadGenerator.generateRoadsFromGeoJSON(geoJSON, this.centerLat, this.centerLon);
      
      // Set starting position from first feature
      if (geoJSON.features.length > 0) {
        const firstFeature = geoJSON.features[0];
        if (firstFeature.geometry.type === 'LineString' && firstFeature.geometry.coordinates.length > 0) {
          const [lon, lat] = firstFeature.geometry.coordinates[0];
          const local = this.latLonToLocal(lat, lon);
          this.startPosition.set(local.x, 1, local.z);
          console.log(`Starting position: (${local.x.toFixed(2)}, ${local.z.toFixed(2)})`);
        }
      }
      
      console.log(`Loaded ${geoJSON.features.length} road features from Amsterdam`);
    } catch (error) {
      console.error('Failed to load Amsterdam data:', error);
      throw error;
    }
  }

  private createGround(): void {
    const groundGeometry = new THREE.PlaneGeometry(20000, 20000);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x7CB342, // Bright green grass color
      roughness: 0.8,
      metalness: 0
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private latLonToLocal(lat: number, lon: number): { x: number; z: number } {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat - this.centerLat) * Math.PI / 180;
    const dLon = (lon - this.centerLon) * Math.PI / 180;
    
    const x = dLon * R * Math.cos(this.centerLat * Math.PI / 180);
    const z = dLat * R;
    
    return { x, z };
  }

  getStartPosition(): THREE.Vector3 {
    return this.startPosition.clone();
  }
}
