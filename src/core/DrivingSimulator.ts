import { useLoadingStore } from "@/stores/loading";
import * as THREE from "three";
import { SceneManager } from "./scene/SceneManager";
import { Car } from "./vehicle/Car";
import { PhysicsClock } from "./vehicle/VehiclePhysics";
import { CarControls } from "./vehicle/CarControls";
import type { SpeedUpdateCallback, LoadCompleteCallback } from "@/types";
import { useCitiesStore } from "@/stores/cities";
import { DEFAULT_VEHICLE } from "./vehicle/VehicleConfig";
import { chaseOrbitPosition } from "./vehicle/ChaseCameraRig";
import type { VehicleConfig, EngineState } from "./vehicle/VehicleConfig";

export interface VehicleTelemetry { engine: EngineState; rpm: number; maxRPM: number; maxSpeed: number; handbrake: boolean; name: string; gear: string; }
export interface PerformanceSample { timeMs: number; frameMs: number; cpuMs: number; calls: number; triangles: number; meshes: number; visibleMeshes: number; geometries: number; textures: number; }

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
    private cameraReset = true;
    private cameraInTunnel = false;
    private paused = false;
    private performanceEnabled = false;
    private lastPerformanceUpdate = 0;
    private peakFrameMs = 0;
    private peakCpuMs = 0;
    private vehicleCallbacks: Array<(data: VehicleTelemetry) => void> = [];
    private performanceCallbacks: Array<(data: PerformanceSample) => void> = [];
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
    private coordinateUpdateCallbacks: Array<
        (lat: number, lon: number) => void
    > = [];

    constructor(private container: HTMLElement, readonly vehicleConfig: VehicleConfig = DEFAULT_VEHICLE) {
        // Initialize Three.js core
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.5,
            3000,
        );

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x87ceeb, 1); // Sky blue background
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.sceneManager = new SceneManager(this.scene);

        this.setupEventListeners();
    }

    async init(
        city: string,
        savedPosition?: { lat: number; lon: number; y?: number },
    ): Promise<void> {
        if (this.loading || this.disposed)
            throw new Error("Simulator is unavailable");
        this.loading = true;
        this.savePosition();
        this.isLoaded = false;
        this.carControls?.dispose();
        this.carControls = null;
        this.car?.dispose();
        this.car = null;
        try {
            // Add lighting (only if not already added)
            if (
                this.scene.children.filter(
                    (child) => child instanceof THREE.AmbientLight,
                ).length === 0
            ) {
                const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
                this.scene.add(ambientLight);

                const directionalLight = new THREE.DirectionalLight(
                    0xffffff,
                    0.8,
                );
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
            this.scene.fog = new THREE.Fog(0x87ceeb, 500, 2000);

            // Load city map with saved position
            await this.sceneManager.loadCityMap(city, savedPosition);
            if (this.disposed) return;

            await useLoadingStore().stage("Loading car model and textures");
            if (this.disposed) return;
            // Initialize vehicle
            const startPosition = this.sceneManager.getStartPosition();
            this.car = new Car(this.scene, this.vehicleConfig);
            await this.car.ready;
            if (this.disposed) return;
            this.car.setWorld(this.sceneManager.collisions, (x, z, y) =>
                this.sceneManager.getRoadState(x, z, y),
            );
            this.car.setPosition(
                startPosition.x,
                startPosition.y,
                startPosition.z,
            );

            if (!this.car) {
                throw new Error("Car initialization failed");
            }

            await useLoadingStore().stage("Preparing controls and audio");
            if (this.disposed) return;
            this.carControls = new CarControls(
                this.car,
                this.camera,
                this.renderer.domElement,
            );

            // Position camera behind car (looking forward)
            const carPos = this.car.getPosition();
            const carDir = this.car.getDirection();
            const cameraOffset = carDir.clone().multiplyScalar(-10); // Behind car
            cameraOffset.y = 5; // Height above car
            this.camera.position.copy(carPos).add(cameraOffset);

            await useLoadingStore().stage("Rendering first frame");
            if (this.disposed) return;
            this.renderer.render(this.scene, this.camera);
            this.lastFrame = performance.now();
            this.physicsClock.reset();
            this.cameraReset = true;
            this.isLoaded = true;
            this.loadCompleteCallbacks.forEach((callback) => callback());

            // Start saving position periodically
            this.startPositionSaving();

            // Start animation loop
            if (!this.animationId) {
                this.animate();
            }
        } catch (error) {
            console.error("Error initializing simulator:", error);
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

        this.positionSaveInterval = window.setInterval(
            () => this.savePosition(),
            5000,
        );
    }

    private savePosition(): void {
        if (!this.car || !this.isLoaded) return;
        const pos = this.car.getPosition();
        const coords = this.sceneManager.localToLatLon(pos.x, pos.z);
        try {
            const cityStore = useCitiesStore();
            cityStore.savePosition(this.sceneManager.getCurrentCity(), {
                ...coords,
                y: pos.y,
            });
        } catch (error) {
            console.warn("Could not save driving position:", error);
        }
    }

    async reloadCity(city: string): Promise<void> {
        const cityStore = useCitiesStore();
        const savedPos = cityStore.getSavedPosition(city);
        await this.init(
            city,
            savedPos
                ? { lat: savedPos.lat, lon: savedPos.lon, y: savedPos.y }
                : undefined,
        );
    }

    private animate = (): void => {
        this.animationId = requestAnimationFrame(this.animate);

        const nowFrame = performance.now();
        const elapsed = (nowFrame - this.lastFrame) / 1000;
        this.lastFrame = nowFrame;
        const delta = Math.min(elapsed, 0.1);

        if (this.isLoaded && this.carControls && this.car) {
            if (!document.hidden && !this.paused) {
                if (elapsed > 0.25) this.car.resetInterpolation();
                let enteredWater = false;
                this.physicsClock.advance(elapsed, (dt) => {
                    if (enteredWater) return;
                    this.carControls!.update(dt);
                    this.car!.update(dt);
                    enteredWater = this.sceneManager.isInWater(this.car!.getPosition());
                });
                if (enteredWater) this.resetCarPosition();
                this.carControls.updateAudio(delta);
            } else { this.physicsClock.reset(); this.carControls.silenceAudio(); }
            this.car.render(this.paused || document.hidden ? 1 : this.physicsClock.alpha);
            this.sceneManager.update(nowFrame / 1000);

            const carPosition = this.car.getRenderPosition();
            const carQuaternion = this.car.getRenderRotation();
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
                const lookDirection = new THREE.Vector3(
                    Math.sin(yaw),
                    0,
                    Math.cos(yaw),
                ).applyQuaternion(carQuaternion);
                this.camera.up.copy(
                    new THREE.Vector3(0, 1, 0).applyQuaternion(carQuaternion),
                );
                this.camera.lookAt(
                    this.camera.position.clone().add(lookDirection),
                );
            } else {
                this.camera.up.set(0, 1, 0);
                const rawTarget = this.car.getCameraTargetPosition();
                const angle = this.carControls.getCameraAngle();
                const pitch = this.carControls.getCameraPitch();
                const contact = this.sceneManager.getRoadState(
                    carPosition.x,
                    carPosition.z,
                    carPosition.y,
                );
                const inTunnel = contact.structure === "tunnel";
                const distance = Math.min(
                    this.carControls.getCameraZoomDistance(),
                    inTunnel ? 3 : 20,
                );
                const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuaternion);
                const yaw = Math.atan2(forward.x, forward.z);
                const blend = 1 - Math.exp(-this.vehicleConfig.camera.followRate * delta);
                const snap = viewChanged || this.cameraReset || inTunnel !== this.cameraInTunnel;
                const cameraTarget = rawTarget;
                const targetPosition = chaseOrbitPosition(cameraTarget, yaw, angle, pitch, distance);
                if (inTunnel) {
                    targetPosition.y = THREE.MathUtils.clamp(
                        targetPosition.y,
                        contact.height + 0.7,
                        (contact.ceiling ?? contact.height + 3.5) - 0.4,
                    );
                } else {
                    targetPosition.y = Math.max(
                        targetPosition.y,
                        cameraTarget.y,
                        this.sceneManager.getRoadState(
                            targetPosition.x,
                            targetPosition.z,
                            targetPosition.y,
                        ).height + 0.6,
                    );
                }
                // Orbit the current car, never a horizontally lagged position.
                const cameraY = snap ? targetPosition.y : THREE.MathUtils.lerp(this.camera.position.y, targetPosition.y, blend);
                this.camera.position.copy(targetPosition);
                this.camera.position.y = cameraY;
                if (!inTunnel)
                    this.camera.position.y = Math.max(
                        this.camera.position.y,
                        this.sceneManager.getRoadState(
                            this.camera.position.x,
                            this.camera.position.z,
                            this.camera.position.y,
                        ).height + 0.6,
                    );
                else this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y,
                    contact.height + 0.7, (contact.ceiling ?? contact.height + 3.5) - 0.4);
                this.camera.lookAt(cameraTarget);
                this.cameraInTunnel = inTunnel;
            }
            this.cameraReset = false;

            // Update speed callbacks
            const speedKmh = this.car.getSpeed();
            this.speedUpdateCallbacks.forEach((callback) => callback(speedKmh));
            const engine = this.car.getEngineState();
            const gearIndex = this.vehicleConfig.audio.gears.findIndex(end => Math.abs(speedKmh) < end);
            this.vehicleCallbacks.forEach(callback => callback({ engine, rpm: this.carControls!.getRPM(),
                maxRPM: this.vehicleConfig.audio.maxRPM, maxSpeed: this.vehicleConfig.physics.boostSpeed,
                handbrake: engine !== 'running' || this.car!.isHandbrakeActive(), name: this.vehicleConfig.name,
                gear: engine === 'off' ? 'P' : engine === 'starting' ? 'N' : speedKmh < -0.5 ? 'R' : `D${gearIndex < 0 ? this.vehicleConfig.audio.gears.length : gearIndex + 1}` }));

            // Update heading callbacks
            const carHeading = this.getCarHeading();
            this.headingUpdateCallbacks.forEach((callback) =>
                callback(carHeading),
            );

            // Update boost callbacks
            const boostAmount = this.car.getBoostAmount();
            this.boostUpdateCallbacks.forEach((callback) =>
                callback(boostAmount),
            );

            // Update coordinate callbacks
            const coords = this.sceneManager.localToLatLon(
                carPosition.x,
                carPosition.z,
            );
            this.coordinateUpdateCallbacks.forEach((callback) =>
                callback(coords.lat, coords.lon),
            );
        }

        // Calculate FPS
        this.fpsFrames++;
        const now = performance.now();
        if (now >= this.lastFpsUpdate + 1000) {
            this.fps = this.fpsFrames;
            this.fpsFrames = 0;
            this.lastFpsUpdate = now;
            this.fpsUpdateCallbacks.forEach((callback) => callback(this.fps));
        }

        this.renderer.render(this.scene, this.camera);
        if (this.performanceEnabled) {
            this.peakFrameMs = Math.max(this.peakFrameMs, elapsed * 1000);
            this.peakCpuMs = Math.max(this.peakCpuMs, performance.now() - nowFrame);
        }
        if (this.performanceEnabled && nowFrame - this.lastPerformanceUpdate >= 100) {
            this.lastPerformanceUpdate = nowFrame;
            let meshes = 0, visibleMeshes = 0;
            const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
            this.scene.traverse(object => { if (object instanceof THREE.Mesh) meshes++; });
            this.scene.traverseVisible(object => {
                if (object instanceof THREE.Mesh && object.layers.test(this.camera.layers) && (!object.frustumCulled || frustum.intersectsObject(object))) visibleMeshes++;
            });
            const info = this.renderer.info;
            const sample = { timeMs: nowFrame, frameMs: this.peakFrameMs, cpuMs: this.peakCpuMs,
                calls: info.render.calls, triangles: info.render.triangles, meshes, visibleMeshes,
                geometries: info.memory.geometries, textures: info.memory.textures };
            this.performanceCallbacks.forEach(callback => callback(sample));
            this.peakFrameMs = this.peakCpuMs = 0;
        }
    };

    onSpeedUpdate(callback: SpeedUpdateCallback): void {
        this.speedUpdateCallbacks.push(callback);
    }
    onVehicleUpdate(callback: (data: VehicleTelemetry) => void): void { this.vehicleCallbacks.push(callback); }
    onPerformanceUpdate(callback: (data: PerformanceSample) => void): void { this.performanceCallbacks.push(callback); }
    setPerformanceEnabled(enabled: boolean): void {
        this.performanceEnabled = enabled; this.peakFrameMs = this.peakCpuMs = 0;
        this.lastPerformanceUpdate = performance.now();
    }
    setPaused(paused: boolean): void {
        this.paused = paused; this.carControls?.setPaused(paused); this.physicsClock.reset();
        this.car?.resetInterpolation();
    }
    toggleIgnition(): void { this.carControls?.toggleIgnition(); }

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
        this.car.setPosition(
            centerPosition.x,
            centerPosition.y,
            centerPosition.z,
        );

        // Reset car rotation to default (facing forward/North)
        this.car.setRotation(0);

        // Reset car physics (speed, steering, etc.)
        this.car.resetPhysics();
        this.carControls?.resetInput();
        this.physicsClock.reset();
        this.cameraReset = true;

        // Reset camera position behind car
        const carPos = this.car.getPosition();
        const carDir = this.car.getDirection();
        const cameraOffset = carDir.clone().multiplyScalar(-10); // Behind car
        cameraOffset.y = 5; // Height above car
        this.camera.position.copy(carPos).add(cameraOffset);
    }

    setupEventListeners(): void {
        window.addEventListener("resize", this.handleResize);
        document.addEventListener("visibilitychange", this.handleVisibility);
        this.renderer.domElement.addEventListener("contextmenu", (e) =>
            e.preventDefault(),
        );
    }

    private handleVisibility = (): void => {
        this.lastFrame = performance.now();
        this.physicsClock.reset();
        this.car?.resetInterpolation();
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
        document.removeEventListener("visibilitychange", this.handleVisibility);
        window.removeEventListener("resize", this.handleResize);
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
        this.scene.traverse((object) => {
            if (object instanceof THREE.DirectionalLight)
                object.shadow.dispose();
        });
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
