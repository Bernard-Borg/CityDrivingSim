import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager';
import { Car } from './vehicle/Car';
import { PhysicsClock } from './vehicle/VehiclePhysics';
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
    private lastFrame = performance.now();
    private physicsClock = new PhysicsClock();
    private firstPersonView = false;
    private disposed = false;
    private loading = false;
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
    private coordinateUpdateCallbacks: Array<(lat: number, lon: number) => void> = [];

    constructor(private container: HTMLElement) {
        // Initialize Three.js core
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.5,
            3000
        );

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x87CEEB, 1); // Sky blue background
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.sceneManager = new SceneManager(this.scene);


        this.setupEventListeners();
    }

    async init(city: string, savedPosition?: { lat: number; lon: number; y?: number; }): Promise<void> {
        if (this.loading || this.disposed) throw new Error('Simulator is unavailable');
        this.loading = true;
        this.savePosition();
        this.isLoaded = false;
        this.carControls?.dispose();
        this.carControls = null;
        this.car?.dispose();
        this.car = null;
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
            if (this.disposed) return;

            // Initialize vehicle
            const startPosition = this.sceneManager.getStartPosition();
            this.car = new Car(this.scene);
            await this.car.ready;
            if (this.disposed) return;
            this.car.setWorld(this.sceneManager.collisions, (x, z, y) => this.sceneManager.getRoadState(x, z, y));
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

            this.lastFrame = performance.now();
            this.physicsClock.reset();
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
            this.carControls?.dispose();
            this.car?.dispose();
            this.carControls = null;
            this.car = null;
            throw error;
        } finally {
            this.loading = false;
        }
    }

    private startPositionSaving(): void {
        // Clear existing interval
        if (this.positionSaveInterval) {
            clearInterval(this.positionSaveInterval);
        }

        this.positionSaveInterval = window.setInterval(() => this.savePosition(), 5000);
    }

    private savePosition(): void {
        if (!this.car || !this.isLoaded) return;
        const pos = this.car.getPosition();
        const coords = this.sceneManager.localToLatLon(pos.x, pos.z);
        try {
            CityManager.savePosition(this.sceneManager.getCurrentCity(), { ...coords, y: pos.y });
        } catch (error) {
            console.warn('Could not save driving position:', error);
        }
    }

    async reloadCity(city: string): Promise<void> {
        const savedPos = CityManager.getSavedPosition(city);
        await this.init(city, savedPos ? { lat: savedPos.lat, lon: savedPos.lon, y: savedPos.y } : undefined);
    }

    private animate = (): void => {
        this.animationId = requestAnimationFrame(this.animate);

        const nowFrame = performance.now();
        const elapsed = (nowFrame - this.lastFrame) / 1000;
        this.lastFrame = nowFrame;
        const delta = Math.min(elapsed, 0.1);

        if (this.isLoaded && this.carControls && this.car) {
            const preUpdatePosition = this.car.getPosition();
            const surface = this.sceneManager.getRoadSurfaceAtPosition(preUpdatePosition);
            this.carControls.setRoadSurface(surface);
            if (!document.hidden) {
                this.physicsClock.advance(elapsed, dt => {
                    this.carControls!.update(dt);
                    this.car!.update(dt);
                });
                this.carControls.updateAudio(delta);
            } else this.physicsClock.reset();

            const carPosition = this.car.getPosition();
            const carQuaternion = this.car.getRotation();
            const firstPerson = this.carControls.isFirstPerson();
            const viewChanged = firstPerson !== this.firstPersonView;
            if (viewChanged) {
                this.firstPersonView = firstPerson;
                // A small near plane keeps the dashboard and cabin visible.
                this.camera.near = firstPerson ? 0.03 : 0.5;
                this.camera.fov = firstPerson ? 75 : 45;
                this.camera.updateProjectionMatrix();
            }

            if (firstPerson) {
                // Mount directly to the car: chase-camera lag would pull the eye
                // through the body during acceleration, braking and sharp turns.
                this.camera.position.copy(this.car.getDriverEyePosition());
                const yaw = this.carControls.getFirstPersonYaw();
                const lookDirection = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
                    .applyQuaternion(carQuaternion);
                this.camera.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(carQuaternion));
                this.camera.lookAt(this.camera.position.clone().add(lookDirection));
            } else {
                this.camera.up.set(0, 1, 0);
                const cameraTarget = this.car.getCameraTargetPosition();
                const angle = this.carControls.getCameraAngle();
                const pitch = this.carControls.getCameraPitch();
                const distance = this.carControls.getCameraZoomDistance();
                const horizontalDistance = Math.cos(pitch) * distance;
                const offset = new THREE.Vector3(
                    Math.sin(angle) * horizontalDistance,
                    Math.sin(pitch) * distance,
                    -Math.cos(angle) * horizontalDistance
                ).applyQuaternion(carQuaternion);
                const targetPosition = carPosition.clone().add(offset);
                targetPosition.y = Math.max(targetPosition.y, cameraTarget.y,
                    this.sceneManager.getRoadState(targetPosition.x, targetPosition.z, targetPosition.y).height + 0.6);
                if (viewChanged) this.camera.position.copy(targetPosition);
                else this.camera.position.lerp(targetPosition, Math.min(delta * 5, 1));
                this.camera.position.y = Math.max(this.camera.position.y,
                    this.sceneManager.getRoadState(this.camera.position.x, this.camera.position.z, this.camera.position.y).height + 0.6);
                this.camera.lookAt(cameraTarget);
            }

            // Update speed callbacks
            const speedKmh = Math.abs(this.car.getSpeed());
            this.speedUpdateCallbacks.forEach(callback => callback(speedKmh));

            // Update heading callbacks
            const carHeading = this.getCarHeading();
            this.headingUpdateCallbacks.forEach(callback => callback(carHeading));

            // Update boost callbacks
            const boostAmount = this.car.getBoostAmount();
            this.boostUpdateCallbacks.forEach(callback => callback(boostAmount));

            // Update coordinate callbacks
            const coords = this.sceneManager.localToLatLon(carPosition.x, carPosition.z);
            this.coordinateUpdateCallbacks.forEach(callback => callback(coords.lat, coords.lon));
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

    onCoordinateUpdate(callback: (lat: number, lon: number) => void): void {
        this.coordinateUpdateCallbacks.push(callback);
    }

    getCarHeading(): number {
        if (!this.car) return 0;
        const direction = this.car.getDirection();
        // Convert direction vector to heading angle in degrees
        // Direction is in car's local space: +Z is forward (North)
        // Math.atan2(x, z) gives: 0° = +Z (North), 90° = +X (East), -90° = -X (West), 180°/-180° = -Z (South)
        // However, compass convention: 0° = North, 90° = East, 180° = South, 270° = West
        // The compass arrow should rotate opposite to show where North is relative to the car
        // So we negate the angle so turning right (positive angle) shows the arrow rotating correctly
        let angle = Math.atan2(direction.x, direction.z) * (180 / Math.PI);
        // Normalize to 0-360 range (make negative angles positive)
        if (angle < 0) angle += 360;
        // Compass arrow rotates opposite - when car turns right (heading 90°), arrow should point right (rotate -90°)
        // So we negate: compass arrow rotation = -heading
        return angle;
    }

    /**
     * Toggle visibility of street name labels
     */
    setLabelsVisible(visible: boolean): void {
        this.sceneManager.setLabelsVisible(visible);
    }

    /**
     * Get current visibility state of street name labels
     */
    getLabelsVisible(): boolean {
        return this.sceneManager.getLabelsVisible();
    }

    /**
     * Reset car to map center position (default spawn location)
     */
    resetCarPosition(): void {
        if (!this.car || !this.sceneManager) return;

        // Use map center position (default spawn location when no saved position)
        const centerPosition = this.sceneManager.getCenterPosition();
        this.car.setPosition(centerPosition.x, centerPosition.y, centerPosition.z);

        // Reset car rotation to default (facing forward/North)
        this.car.setRotation(0);

        // Reset car physics (speed, steering, etc.)
        this.car.resetPhysics();
        this.carControls?.resetInput();
        this.physicsClock.reset();

        // Reset camera position behind car
        const carPos = this.car.getPosition();
        const carDir = this.car.getDirection();
        const cameraOffset = carDir.clone().multiplyScalar(-10); // Behind car
        cameraOffset.y = 5; // Height above car
        this.camera.position.copy(carPos).add(cameraOffset);
    }

    setupEventListeners(): void {
        window.addEventListener('resize', this.handleResize);
        document.addEventListener('visibilitychange', this.handleVisibility);
        this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    private handleVisibility = (): void => {
        this.lastFrame = performance.now();
        this.physicsClock.reset();
    };

    private handleResize = (): void => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    dispose(): void {
        if (this.disposed) return;
        this.savePosition();
        this.disposed = true;
        this.isLoaded = false;
        document.removeEventListener('visibilitychange', this.handleVisibility);
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
        this.car?.dispose();
        this.sceneManager.dispose();
        this.scene.traverse(object => {
            if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
        });
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
