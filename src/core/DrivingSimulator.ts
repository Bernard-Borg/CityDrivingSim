import type { MapLocation } from "./LocationSearch";
/**
 * DrivingSimulator types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import { FreeFlightControls } from "./FreeFlightControls";
import { ProceduralSky } from "./scene/ProceduralSky";
import { useStateStore } from "@/stores/state";
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

export interface VehicleTelemetry {
    engine: EngineState;
    rpm: number;
    maxRPM: number;
    maxSpeed: number;
    handbrake: boolean;
    name: string;
    gear: string;
}
export interface PerformanceSample {
    timeMs: number;
    frameMs: number;
    cpuMs: number;
    calls: number;
    triangles: number;
    meshes: number;
    visibleMeshes: number;
    geometries: number;
    textures: number;
}

/**
 * Owns city loading, the Three.js render loop, camera modes, fixed-step vehicle updates and telemetry subscriptions.
 */
export class DrivingSimulator {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private sceneManager: SceneManager;
    private sky: ProceduralSky;
    private sunlight: THREE.DirectionalLight | null = null;
    private car: Car | null = null;
    private carControls: CarControls | null = null;
    private flight: FreeFlightControls | null = null;
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
    private lastFpsUpdate: number = 0;
    private fpsFrames: number = 0;
    private fps: number = 0;
    private positionSaveInterval: number | null = null;
    private coordinateUpdateCallbacks: Array<(lat: number, lon: number) => void> = [];

    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param container - DOM element receiving the renderer canvas.
     * @param vehicleConfig - Vehicle model and tuning configuration.
     */
    constructor(
        private container: HTMLElement,
        public vehicleConfig: VehicleConfig = DEFAULT_VEHICLE,
    ) {
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
        this.sky = new ProceduralSky(this.scene);

        this.setupEventListeners();
    }

    /**
     * Loads a city and vehicle, installs controls and initializes rendering; loading failures propagate to the caller.
     *
     * @param city - Configured city identifier.
     * @param savedPosition - Optional saved WGS84 coordinates and local elevation.
     */
    async init(
        city: string,
        savedPosition?: { lat: number; lon: number; y?: number },
    ): Promise<void> {
        if (this.loading || this.disposed) throw new Error("Simulator is unavailable");
        this.loading = true;
        this.savePosition();
        this.isLoaded = false;
        this.flight?.dispose();
        this.flight = null;
        this.carControls?.dispose();
        this.carControls = null;
        this.car?.dispose();
        this.car = null;
        try {
            // Add lighting (only if not already added)
            if (
                this.scene.children.filter((child) => child instanceof THREE.AmbientLight)
                    .length === 0
            ) {
                const ambientLight = new THREE.AmbientLight(0xdbe9ff, 0.22);
                this.scene.add(ambientLight);
                this.scene.add(new THREE.HemisphereLight(0xc6e1ff, 0x75664a, 0.65));

                const directionalLight = new THREE.DirectionalLight(0xffebcf, 2.4);
                directionalLight.position.copy(ProceduralSky.sunDirection).multiplyScalar(375);
                directionalLight.castShadow = true;
                // Reduced shadow map size for performance
                directionalLight.shadow.mapSize.width = 1024;
                directionalLight.shadow.mapSize.height = 1024;
                directionalLight.shadow.camera.near = 0.5;
                directionalLight.shadow.camera.far = 1000;
                directionalLight.shadow.camera.left = -100;
                directionalLight.shadow.camera.right = 100;
                directionalLight.shadow.camera.top = 100;
                directionalLight.shadow.camera.bottom = -100;
                directionalLight.shadow.bias = -0.00015;
                directionalLight.shadow.normalBias = 0.12;
                this.sunlight = directionalLight;
                this.scene.add(directionalLight);
                this.scene.add(directionalLight.target);
            }

            // Add fog for depth
            this.scene.fog = new THREE.Fog(ProceduralSky.horizonColor, 450, 1200);

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
            this.car.setPosition(startPosition.x, startPosition.y, startPosition.z);

            if (!this.car) {
                throw new Error("Car initialization failed");
            }

            await useLoadingStore().stage("Preparing controls and audio");
            if (this.disposed) return;
            this.carControls = new CarControls(this.car, this.camera, this.renderer.domElement);

            // Position camera behind car (looking forward)
            const carPos = this.car.getPosition();
            const carDir = this.car.getDirection();
            const cameraOffset = carDir.clone().multiplyScalar(-10); // Behind car
            cameraOffset.y = 5; // Height above car
            this.camera.position.copy(carPos).add(cameraOffset);

            await useLoadingStore().stage("Rendering first frame");
            if (this.disposed) return;
            this.sky.update(this.camera, performance.now() / 1000);
            this.updateSunlight();
            this.renderer.render(this.scene, this.camera);
            this.lastFrame = performance.now();
            this.physicsClock.reset();
            this.cameraReset = true;
            this.isLoaded = true;
            this.flight = new FreeFlightControls(this.camera, this.renderer.domElement);
            if (useStateStore().creativeMode) this.setCreativeMode(true);
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

    /** Loads a replacement vehicle without rebuilding the city; preserves position and heading.
     * The replacement starts parked with its ignition off. A failed load leaves the old car usable.
     * @param config - Model and handling configuration for the replacement vehicle.
     * @returns Whether the replacement was installed before the simulator was disposed.
     */
    async switchVehicle(config: VehicleConfig): Promise<boolean> {
        if (!this.isLoaded || !this.car || this.disposed) return false;
        if (this.vehicleConfig.id === config.id) return true;
        const previous = this.car;
        const replacement = new Car(this.scene, config);
        replacement.setVisible(false);
        let controls: CarControls | null = null;
        try {
            await replacement.ready;
            if (this.disposed || this.car !== previous) {
                replacement.dispose();
                return false;
            }
            replacement.setWorld(this.sceneManager.collisions, (x, z, y) =>
                this.sceneManager.getRoadState(x, z, y));
            const position = previous.getPosition();
            const direction = previous.getDirection();
            replacement.setPosition(position.x, position.y, position.z);
            replacement.setRotation(Math.atan2(direction.x, direction.z));
            controls = new CarControls(replacement, this.camera, this.renderer.domElement);
            controls.setPaused(this.paused || !!this.flight?.enabled);
            this.carControls?.dispose();
            previous.dispose();
            this.car = replacement;
            this.carControls = controls;
            this.vehicleConfig = config;
            replacement.setVisible(!this.flight?.enabled);
            this.firstPersonView = false;
            this.cameraReset = true;
            this.physicsClock.reset();
            return true;
        } catch (error) {
            controls?.dispose();
            replacement.dispose();
            throw error;
        }
    }

    /**
     * Starts periodic persistence of the current vehicle position for the active city.
     */
    private startPositionSaving(): void {
        // Clear existing interval
        if (this.positionSaveInterval) {
            clearInterval(this.positionSaveInterval);
        }

        this.positionSaveInterval = window.setInterval(() => this.savePosition(), 5000);
    }

    /**
     * Persists the current vehicle position under its city identifier.
     */
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

    /**
     * Reloads the requested city through the simulator initialization lifecycle.
     *
     * @param city - Configured city identifier.
     */
    async reloadCity(city: string): Promise<void> {
        const cityStore = useCitiesStore();
        const savedPos = cityStore.getSavedPosition(city);
        await this.init(
            city,
            savedPos ? { lat: savedPos.lat, lon: savedPos.lon, y: savedPos.y } : undefined,
        );
    }

    /**
     * Processes one render frame, advances fixed physics steps or free flight, and publishes enabled telemetry.
     */
    private animate = (): void => {
        this.animationId = requestAnimationFrame(this.animate);

        const nowFrame = performance.now();
        const elapsed = (nowFrame - this.lastFrame) / 1000;
        this.lastFrame = nowFrame;
        const delta = Math.min(elapsed, 0.1);

        if (this.isLoaded && this.carControls && this.car) {
            if (this.flight?.enabled) {
                this.physicsClock.reset();
                if (!this.paused) this.flight.update(elapsed);
                this.sceneManager.update(nowFrame / 1000, this.camera.position);
                const coords = this.sceneManager.localToLatLon(
                    this.camera.position.x,
                    this.camera.position.z,
                );
                this.coordinateUpdateCallbacks.forEach((callback) =>
                    callback(coords.lat, coords.lon),
                );
                const direction = this.camera.getWorldDirection(new THREE.Vector3());
                const heading =
                    ((Math.atan2(direction.x, direction.z) * 180) / Math.PI + 360) % 360;
                this.headingUpdateCallbacks.forEach((callback) => callback(heading));
            } else {
                if (!document.hidden && !this.paused) {
                    if (elapsed > 0.25) this.car.resetInterpolation();
                    let touchedWater = false;
                    this.physicsClock.advance(elapsed, (dt) => {
                        if (touchedWater) return;
                        const previousPosition = this.car!.getPosition();
                        this.carControls!.update(dt);
                        this.car!.update(dt);
                        touchedWater = this.sceneManager.isInWater(this.car!.getPosition(),
                            this.car!.config.collision, this.car!.physics.yaw, previousPosition);
                    });
                    if (touchedWater) this.resetCarPosition();
                    this.carControls.updateAudio(delta);
                } else {
                    this.physicsClock.reset();
                    this.carControls.silenceAudio();
                }
                this.car.render(this.paused || document.hidden ? 1 : this.physicsClock.alpha);
                this.sceneManager.update(nowFrame / 1000, this.car.getRenderPosition());

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
                    this.camera.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(carQuaternion));
                    this.camera.lookAt(this.camera.position.clone().add(lookDirection));
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
                    const snap =
                        viewChanged || this.cameraReset || inTunnel !== this.cameraInTunnel;
                    const cameraTarget = rawTarget;
                    const targetPosition = chaseOrbitPosition(
                        cameraTarget,
                        yaw,
                        angle,
                        pitch,
                        distance,
                    );
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
                    const cameraY = snap
                        ? targetPosition.y
                        : THREE.MathUtils.lerp(this.camera.position.y, targetPosition.y, blend);
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
                    else
                        this.camera.position.y = THREE.MathUtils.clamp(
                            this.camera.position.y,
                            contact.height + 0.7,
                            (contact.ceiling ?? contact.height + 3.5) - 0.4,
                        );
                    this.camera.lookAt(cameraTarget);
                    this.cameraInTunnel = inTunnel;
                }
                this.cameraReset = false;

                // Update speed callbacks
                const speedKmh = this.car.getSpeed();
                this.speedUpdateCallbacks.forEach((callback) => callback(speedKmh));
                const engine = this.car.getEngineState();
                const gearIndex = this.vehicleConfig.audio.gears.findIndex(
                    (end) => Math.abs(speedKmh) < end,
                );
                this.vehicleCallbacks.forEach((callback) =>
                    callback({
                        engine,
                        rpm: this.carControls!.getRPM(),
                        maxRPM: this.vehicleConfig.audio.maxRPM,
                        maxSpeed: this.vehicleConfig.physics.maxSpeed,
                        handbrake: engine !== "running" || this.car!.isHandbrakeActive(),
                        name: this.vehicleConfig.name,
                        gear:
                            engine === "off"
                                ? "P"
                                : engine === "starting"
                                  ? "N"
                                  : speedKmh < -0.5
                                    ? "R"
                                    : `D${gearIndex < 0 ? this.vehicleConfig.audio.gears.length : gearIndex + 1}`,
                    }),
                );

                // Update heading callbacks
                const carHeading = this.getCarHeading();
                this.headingUpdateCallbacks.forEach((callback) => callback(carHeading));


                // Update coordinate callbacks
                const coords = this.sceneManager.localToLatLon(carPosition.x, carPosition.z);
                this.coordinateUpdateCallbacks.forEach((callback) =>
                    callback(coords.lat, coords.lon),
                );
            }
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

        this.sky.update(this.camera, nowFrame / 1000);
        this.updateSunlight();
        this.renderer.render(this.scene, this.camera);
        if (this.performanceEnabled) {
            this.peakFrameMs = Math.max(this.peakFrameMs, elapsed * 1000);
            this.peakCpuMs = Math.max(this.peakCpuMs, performance.now() - nowFrame);
        }
        if (this.performanceEnabled && nowFrame - this.lastPerformanceUpdate >= 100) {
            this.lastPerformanceUpdate = nowFrame;
            let meshes = 0,
                visibleMeshes = 0;
            const frustum = new THREE.Frustum().setFromProjectionMatrix(
                new THREE.Matrix4().multiplyMatrices(
                    this.camera.projectionMatrix,
                    this.camera.matrixWorldInverse,
                ),
            );
            this.scene.traverse((object) => {
                if (object instanceof THREE.Mesh) meshes++;
            });
            this.scene.traverseVisible((object) => {
                if (
                    object instanceof THREE.Mesh &&
                    object.layers.test(this.camera.layers) &&
                    (!object.frustumCulled || frustum.intersectsObject(object))
                )
                    visibleMeshes++;
            });
            const info = this.renderer.info;
            const sample = {
                timeMs: nowFrame,
                frameMs: this.peakFrameMs,
                cpuMs: this.peakCpuMs,
                calls: info.render.calls,
                triangles: info.render.triangles,
                meshes,
                visibleMeshes,
                geometries: info.memory.geometries,
                textures: info.memory.textures,
            };
            this.performanceCallbacks.forEach((callback) => callback(sample));
            this.peakFrameMs = this.peakCpuMs = 0;
        }
    };

    /**
     * Registers a subscriber for speed update notifications.
     *
     * @param callback - Subscriber invoked for the corresponding telemetry update.
     */
    onSpeedUpdate(callback: SpeedUpdateCallback): void {
        this.speedUpdateCallbacks.push(callback);
    }
    /**
     * Registers a subscriber for vehicle update notifications.
     *
     * @param callback - Subscriber invoked for the corresponding telemetry update.
     */
    onVehicleUpdate(callback: (data: VehicleTelemetry) => void): void {
        this.vehicleCallbacks.push(callback);
    }
    /**
     * Registers a subscriber for performance update notifications.
     *
     * @param callback - Subscriber invoked for the corresponding telemetry update.
     */
    onPerformanceUpdate(callback: (data: PerformanceSample) => void): void {
        this.performanceCallbacks.push(callback);
    }
    /**
     * Enables or disables frame diagnostics and resets sampling accumulators.
     *
     * @param enabled - Whether this subsystem is enabled.
     */
    setPerformanceEnabled(enabled: boolean): void {
        this.performanceEnabled = enabled;
        this.peakFrameMs = this.peakCpuMs = 0;
        this.lastPerformanceUpdate = performance.now();
    }
    /**
     * Pauses or resumes control processing and clears held input as required.
     *
     * @param paused - Whether control processing is paused.
     */
    setPaused(paused: boolean): void {
        this.paused = paused;
        this.carControls?.setPaused(paused || !!this.flight?.enabled);
        this.flight?.setPaused(paused);
        this.physicsClock.reset();
        this.car?.resetInterpolation();
    }
    /**
     * Switches between driving and free flight, transferring the current position and elevation.
     *
     * @param enabled - Whether this subsystem is enabled.
     */
    setCreativeMode(enabled: boolean): void {
        if (!this.car || !this.carControls || !this.flight || this.paused) return;
        if (enabled === this.flight.enabled) return;
        if (enabled) this.camera.position.copy(this.car.getPosition());
        else {
            const direction = this.camera.getWorldDirection(new THREE.Vector3());
            if (Math.hypot(direction.x, direction.z) > 1e-6)
                this.car.setRotation(Math.atan2(direction.x, direction.z));
            this.car.setPosition(
                this.camera.position.x,
                this.camera.position.y,
                this.camera.position.z,
                true,
            );
        }
        useStateStore().creativeMode = enabled;
        if (enabled && this.car.getEngineState() !== "off") this.car.toggleIgnition();
        this.car.resetPhysics();
        this.car.setVisible(!enabled);
        this.carControls.setPaused(enabled);
        this.flight.setEnabled(enabled);
        this.physicsClock.reset();
        this.cameraReset = true;
        this.camera.up.set(0, 1, 0);
        this.camera.near = enabled ? 0.1 : 0.5;
        this.camera.fov = enabled ? 65 : 45;
        this.camera.updateProjectionMatrix();
        if (!enabled) {
            this.car.resetInterpolation();
            this.firstPersonView = false;
            this.visibilityRefresh();
        }
    }
    /**
     * Forces nearby scenery activation to refresh around the current car position.
     */
    private visibilityRefresh(): void {
        if (this.car)
            this.sceneManager.update(performance.now() / 1000, this.car.getPosition(), true);
    }
    /**
     * Toggles ignition between starting and off; the controls wrapper also coordinates ignition audio.
     */
    toggleIgnition(): void {
        if (!this.flight?.enabled) this.carControls?.toggleIgnition();
    }

    /**
     * Registers a subscriber for load complete notifications.
     *
     * @param callback - Subscriber invoked for the corresponding telemetry update.
     */
    onLoadComplete(callback: LoadCompleteCallback): void {
        this.loadCompleteCallbacks.push(callback);
    }

    /**
     * Registers a subscriber for fps update notifications.
     *
     * @param callback - Subscriber invoked for the corresponding telemetry update.
     */
    onFpsUpdate(callback: SpeedUpdateCallback): void {
        this.fpsUpdateCallbacks.push(callback);
    }

    /**
     * Registers a subscriber for heading update notifications.
     *
     * @param callback - Subscriber invoked for the corresponding telemetry update.
     */
    onHeadingUpdate(callback: SpeedUpdateCallback): void {
        this.headingUpdateCallbacks.push(callback);
    }


    /**
     * Registers a subscriber for coordinate update notifications.
     *
     * @param callback - Subscriber invoked for the corresponding telemetry update.
     */
    onCoordinateUpdate(callback: (lat: number, lon: number) => void): void {
        this.coordinateUpdateCallbacks.push(callback);
    }

    /**
     * Returns the current vehicle heading used by navigation telemetry.
     */
    getCarHeading(): number {
        if (!this.car) return 0;
        const direction = this.car.getDirection();
        // Raw simulation yaw: +Z is south and +X is east. The HUD converts to north bearings.
        let angle = Math.atan2(direction.x, direction.z) * (180 / Math.PI);
        if (angle < 0) angle += 360;
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

        if (this.flight?.enabled) {
            this.camera.position
                .copy(this.sceneManager.getCenterPosition())
                .add(new THREE.Vector3(0, 15, 0));
            this.sceneManager.update(performance.now() / 1000, this.camera.position, true);
            return;
        }
        // Use map center position (default spawn location when no saved position)
        const centerPosition = this.sceneManager.getCenterPosition();
        this.car.setPosition(centerPosition.x, centerPosition.y, centerPosition.z);

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

    /**
     * Registers the browser event handlers owned by this instance.
     */
    setupEventListeners(): void {
        window.addEventListener("resize", this.handleResize);
        document.addEventListener("visibilitychange", this.handleVisibility);
        this.renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    /**
     * Clears stale input or frame timing when browser visibility changes.
     */
    private handleVisibility = (): void => {
        this.lastFrame = performance.now();
        this.physicsClock.reset();
        this.car?.resetInterpolation();
    };

    /**
     * Updates the camera projection and renderer size to match the browser viewport.
     */
    private handleResize = (): void => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    /**
     * Moves the sunlight shadow volume with the camera while retaining the configured sun direction.
     */
    /** Unlocks vehicle audio during a touch gesture. */
    unlockTouchAudio(): void { this.carControls?.unlockTouchAudio(); }

    /** Applies live renderer quality preferences without rebuilding the city.
     * @param shadows - Whether shadow maps should be rendered.
     * @param scale - Maximum device pixel ratio used for rendering (0.75?2).
     */
    setGraphics(shadows: boolean, scale = 1): void {
        this.renderer.shadowMap.enabled = shadows;
        this.renderer.shadowMap.needsUpdate = true;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Math.max(0.75, Math.min(2, scale))));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.scene.traverse(object => {
            if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.needsUpdate = true;
        });
    }

    /** Searches locations in the active city only. */
    searchLocations(query: string): MapLocation[] { return this.isLoaded ? this.sceneManager.searchLocations(query) : []; }

    /** Teleports the active camera or stopped vehicle to a validated map location.
     * @param location - Destination from coordinate input or the active city street search.
     */
    teleportTo(location: MapLocation): void {
        if (!this.isLoaded || !this.car) return;
        const position = this.sceneManager.teleportPosition(location.lat, location.lon, location.y);
        this.carControls?.resetInput();
        if (this.flight?.enabled) this.camera.position.copy(position).add(new THREE.Vector3(0, 3, 0));
        else { this.car.resetPhysics(); this.car.setPosition(position.x, position.y, position.z); this.car.resetInterpolation(); this.cameraReset = true; }
        this.physicsClock.reset();
        this.sceneManager.update(performance.now() / 1000, this.flight?.enabled ? this.camera.position : position, true);
        this.coordinateUpdateCallbacks.forEach(callback => callback(location.lat, location.lon));
    }

    private updateSunlight(): void {
        if (!this.sunlight) return;
        // Anchor the shadow volume locally, snapped to shadow texels to limit shimmer.
        const texel = 200 / this.sunlight.shadow.mapSize.width;
        const target = this.sunlight.target.position;
        target.copy(this.camera.position).divideScalar(texel).floor().multiplyScalar(texel);
        this.sunlight.position.copy(target).addScaledVector(ProceduralSky.sunDirection, 375);
        this.sunlight.target.updateMatrixWorld();
    }

    /**
     * Releases owned resources and unregisters scene objects, browser listeners or audio nodes as applicable.
     */
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
        this.flight?.dispose();
        this.car?.dispose();
        this.sceneManager.dispose();
        this.sky.dispose();
        this.scene.traverse((object) => {
            if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
        });
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
