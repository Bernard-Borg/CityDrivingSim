import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager';
import { Car } from './vehicle/Car';
import { CarControls } from './vehicle/CarControls';
import { CityManager } from '@/utils/cityManager';
import type { SpeedUpdateCallback, LoadCompleteCallback } from '@/types';

export class DrivingSimulator {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private sceneManager: SceneManager;
    private car: Car | null = null;
    private carControls: CarControls | null = null;
    private clock: THREE.Clock;
    private isLoaded = false;
    private animationId: number | null = null;
    private speedUpdateCallbacks: SpeedUpdateCallback[] = [];
    private loadCompleteCallbacks: LoadCompleteCallback[] = [];
    private fpsUpdateCallbacks: SpeedUpdateCallback[] = [];
    private headingUpdateCallbacks: SpeedUpdateCallback[] = [];
    private boostUpdateCallbacks: SpeedUpdateCallback[] = [];
    private lastFpsUpdate: number = 0;
    private fpsFrames: number = 0;
    private fps: number = 0;
    private positionSaveInterval: number | null = null;
    private lastSavedPosition: { x: number; y: number; z: number; } | null = null;

    constructor(private container: HTMLElement) {
        // Initialize Three.js core
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            5000
        );

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x87CEEB, 1); // Sky blue background
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.sceneManager = new SceneManager(this.scene);
        this.clock = new THREE.Clock();

        this.setupEventListeners();
    }

    async init(city: string, savedPosition?: { x: number; y: number; z: number; }): Promise<void> {
        try {
            // Add lighting (only if not already added)
            if (this.scene.children.filter(child => child instanceof THREE.AmbientLight).length === 0) {
                const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
                this.scene.add(ambientLight);

                const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
                directionalLight.position.set(200, 300, 100);
                directionalLight.castShadow = true;
                // Reduced shadow map size for performance
                directionalLight.shadow.mapSize.width = 1024;
                directionalLight.shadow.mapSize.height = 1024;
                directionalLight.shadow.camera.near = 0.5;
                directionalLight.shadow.camera.far = 1000;
                directionalLight.shadow.camera.left = -500;
                directionalLight.shadow.camera.right = 500;
                directionalLight.shadow.camera.top = 500;
                directionalLight.shadow.camera.bottom = -500;
                this.scene.add(directionalLight);
            }

            // Add fog for depth
            this.scene.fog = new THREE.Fog(0x87CEEB, 500, 2000);

            // Load city map with saved position
            await this.sceneManager.loadCityMap(city, savedPosition);

            // Clean up old car and controls if they exist
            if (this.carControls) {
                this.carControls.dispose();
                this.carControls = null;
            }
            if (this.car) {
                // Car mesh is added to scene in constructor, will be cleaned by scene.clearScene()
                this.car = null;
            }

            // Initialize vehicle
            const startPosition = this.sceneManager.getStartPosition();
            this.car = new Car(this.scene);
            this.car.setPosition(startPosition.x, startPosition.y, startPosition.z);

            if (!this.car) {
                throw new Error('Car initialization failed');
            }

            this.carControls = new CarControls(
                this.car,
                this.camera,
                this.renderer.domElement
            );

            // Position camera behind car (looking forward)
            const carPos = this.car.getPosition();
            const carDir = this.car.getDirection();
            const cameraOffset = carDir.clone().multiplyScalar(-10); // Behind car
            cameraOffset.y = 5; // Height above car
            this.camera.position.copy(carPos).add(cameraOffset);

            this.isLoaded = true;
            this.loadCompleteCallbacks.forEach(callback => callback());

            // Start saving position periodically
            this.startPositionSaving();

            // Start animation loop
            if (!this.animationId) {
                this.animate();
            }
        } catch (error) {
            console.error('Error initializing simulator:', error);
            this.loadCompleteCallbacks.forEach(callback => callback()); // Still call callbacks to hide loading
        }
    }

    private startPositionSaving(): void {
        // Clear existing interval
        if (this.positionSaveInterval) {
            clearInterval(this.positionSaveInterval);
        }

        this.positionSaveInterval = window.setInterval(() => {
            if (this.car && this.isLoaded) {
                const pos = this.car.getPosition();
                const currentCity = this.sceneManager.getCurrentCity();

                // Only save if position changed significantly
                if (!this.lastSavedPosition ||
                    Math.abs(pos.x - this.lastSavedPosition.x) > 1 ||
                    Math.abs(pos.z - this.lastSavedPosition.z) > 1) {

                    CityManager.savePosition(currentCity, {
                        x: pos.x,
                        y: pos.y,
                        z: pos.z
                    });
                    this.lastSavedPosition = { x: pos.x, y: pos.y, z: pos.z };
                }
            }
        }, 5000); // Save every 5 seconds
    }

    async reloadCity(city: string): Promise<void> {
        this.isLoaded = false;
        const savedPos = CityManager.getSavedPosition(city);
        await this.init(city, savedPos ? { x: savedPos.x, y: savedPos.y, z: savedPos.z } : undefined);
    }

    private animate = (): void => {
        this.animationId = requestAnimationFrame(this.animate);

        const delta = this.clock.getDelta();

        if (this.isLoaded && this.carControls && this.car) {
            this.carControls.update(delta);

            // Update camera to follow car smoothly
            const carPosition = this.car.getPosition();
            const carDirection = this.car.getDirection();
            const cameraAngle = this.carControls.getCameraAngle();

            // Third-person camera that follows behind the car (zoomable)
            const cameraDistance = this.carControls.getCameraZoomDistance();
            const cameraHeight = 6;

            // Calculate camera offset using car direction rotated by camera angle
            const baseOffset = new THREE.Vector3(0, cameraHeight, cameraDistance);
            const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                cameraAngle
            );
            baseOffset.applyQuaternion(rotationQuaternion);

            // Apply car rotation to camera offset
            const carQuaternion = this.car.getRotation();
            const cameraOffset = baseOffset.clone();
            cameraOffset.applyQuaternion(carQuaternion);

            // Smooth camera movement
            const targetPosition = carPosition.clone().add(cameraOffset);
            this.camera.position.lerp(targetPosition, Math.min(delta * 5, 1)); // Cap lerp at 1

            // Look at a point in front of the car
            const lookAtPosition = carPosition.clone().add(carDirection.clone().multiplyScalar(5));
            lookAtPosition.y += 1.5;

            // Smooth camera lookAt
            const currentLookAt = new THREE.Vector3();
            this.camera.getWorldDirection(currentLookAt);
            currentLookAt.multiplyScalar(20).add(this.camera.position);
            const smoothLookAt = currentLookAt.lerp(lookAtPosition, Math.min(delta * 4, 1));
            this.camera.lookAt(smoothLookAt);

            // Update speed callbacks
            const speedKmh = Math.abs(this.car.getSpeed() * 3.6); // Convert m/s to km/h
            this.speedUpdateCallbacks.forEach(callback => callback(speedKmh));

            // Update heading callbacks
            const carHeading = this.getCarHeading();
            this.headingUpdateCallbacks.forEach(callback => callback(carHeading));

            // Update boost callbacks
            const boostAmount = this.car.getBoostAmount();
            this.boostUpdateCallbacks.forEach(callback => callback(boostAmount));
        }

        // Calculate FPS
        this.fpsFrames++;
        const now = performance.now();
        if (now >= this.lastFpsUpdate + 1000) {
            this.fps = this.fpsFrames;
            this.fpsFrames = 0;
            this.lastFpsUpdate = now;
            this.fpsUpdateCallbacks.forEach(callback => callback(this.fps));
        }

        this.renderer.render(this.scene, this.camera);
    };

    onSpeedUpdate(callback: SpeedUpdateCallback): void {
        this.speedUpdateCallbacks.push(callback);
    }

    onLoadComplete(callback: LoadCompleteCallback): void {
        this.loadCompleteCallbacks.push(callback);
    }

    onFpsUpdate(callback: SpeedUpdateCallback): void {
        this.fpsUpdateCallbacks.push(callback);
    }

    onHeadingUpdate(callback: SpeedUpdateCallback): void {
        this.headingUpdateCallbacks.push(callback);
    }

    onBoostUpdate(callback: SpeedUpdateCallback): void {
        this.boostUpdateCallbacks.push(callback);
    }

    getCarHeading(): number {
        if (!this.car) return 0;
        const direction = this.car.getDirection();
        // Convert direction vector to heading angle in degrees
        // Math.atan2(x, z) gives: 0° = +Z (North), 90° = +X (East), -90° = -X (West), 180°/-180° = -Z (South)
        // Normalize to 0-360 range
        let angle = Math.atan2(direction.x, direction.z) * (180 / Math.PI);
        // Normalize to 0-360 range (make negative angles positive)
        if (angle < 0) angle += 360;
        return angle;
    }

    setupEventListeners(): void {
        window.addEventListener('resize', this.handleResize);
        this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    private handleResize = (): void => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    dispose(): void {
        window.removeEventListener('resize', this.handleResize);
        if (this.positionSaveInterval) {
            clearInterval(this.positionSaveInterval);
        }
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.carControls) {
            this.carControls.dispose();
        }
        this.renderer.dispose();
    }
}
