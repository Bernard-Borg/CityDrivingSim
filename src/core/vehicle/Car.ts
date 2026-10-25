import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VehiclePhysics } from './VehiclePhysics';
import type { CollisionWorld } from '../scene/CollisionWorld';
import type { SurfaceSample } from '../scene/ElevationTerrain';
import { DEFAULT_VEHICLE, targetEngineRPM } from './VehicleConfig';
import type { VehicleConfig, EngineState } from './VehicleConfig';

export class Car {
    readonly physics: VehiclePhysics;
    private engineState: EngineState = 'running';
    private ignitionRemaining = 0;
    private rpm = 0;
    private previousPosition = new THREE.Vector3();
    private previousRotation = new THREE.Quaternion();
    private renderPosition = new THREE.Vector3();
    private renderRotation = new THREE.Quaternion();
    readonly ready: Promise<void>;
    private disposed = false;
    private groundOffset = 0.4;
    private world: CollisionWorld | null = null;
    private surface: (x: number, z: number, y: number) => SurfaceSample & { grip: number } = () => ({ height: 0.06, grip: 1, slopeX: 0, slopeZ: 0 });
    private groundNormal = new THREE.Vector3(0, 1, 0);
    private impact = 0;
    private mesh: THREE.Group = new THREE.Group();
    private scene: THREE.Scene;
    private cameraTargetOffset = new THREE.Vector3(0, 0.8, 0.3);
    private driverEyeOffset = new THREE.Vector3(0.2, 0.2, -0.2);
    private gltfWheelSpinMeshes: THREE.Object3D[] = [];
    private gltfFrontWheelPivots: THREE.Object3D[] = [];

    // Physics properties
    private position: THREE.Vector3;
    private rotation: THREE.Quaternion;
    private speed: number = 0; // km/h
    get maxSpeed(): number { return this.config.physics.maxSpeed; }
    private throttleInput: number = 0;
    private brakeInput: number = 0;
    private steeringAngle: number = 0;
    get maxSteeringAngle(): number { return this.config.physics.maxSteeringAngle; }

    // Drift/handbrake properties
    private handbrakeActive: boolean = false;

    // Boost properties
    private isBoosting: boolean = false;
    private boostAmount: number = 100; // Boost meter (0-100)

    constructor(scene: THREE.Scene, readonly config: VehicleConfig = DEFAULT_VEHICLE) {
        this.physics = new VehiclePhysics(config.physics);
        this.rpm = config.audio.idleRPM;
        this.scene = scene;
        this.position = new THREE.Vector3(0, 0.25, 0);
        this.rotation = new THREE.Quaternion();

        let timeout: ReturnType<typeof setTimeout> | undefined;
        this.ready = Promise.race([
            this.loadCarModel(),
            new Promise<void>((_, reject) => {
                timeout = setTimeout(() => reject(new Error('Vehicle loading timed out. Please retry.')), 30000);
            })
        ]).finally(() => clearTimeout(timeout));
    }

    private async loadCarModel(): Promise<void> {
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(this.config.model.path);
        if (this.disposed) {
            this.disposeModel(gltf.scene);
            return;
        }
        const model = gltf.scene;
        model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        // Scale model to a reasonable car size and center it
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetLength = this.config.model.length;
        const scaleFactor = size.z > 0 ? targetLength / size.z : 1;
        model.scale.setScalar(scaleFactor);

        const centeredBox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        const centeredSize = new THREE.Vector3();
        centeredBox.getCenter(center);
        centeredBox.getSize(centeredSize);
        model.position.sub(center);
        this.groundOffset = centeredSize.y / 2;
        // Eye point inside the cabin, below the roof and behind the windshield.
        // Use the scaled model bounds so this remains relative to the actual car.
        this.driverEyeOffset.set(centeredSize.x * this.config.model.eye[0], centeredSize.y * this.config.model.eye[1], centeredSize.z * this.config.model.eye[2]);

        this.mesh.add(model);
        this.mesh.position.copy(this.position);

        // Base scale (model-specific scaling happens after GLTF loads)
        this.mesh.scale.set(1, 1, 1);
        this.scene.add(this.mesh);

        // Update camera target offset based on model bounds
        this.cameraTargetOffset.set(
            0,
            centeredSize.y * 0.5,
            centeredSize.z * 0.15
        );

        // Cache wheel spin targets (polySurface parent or mesh) and wheel pivots for steering
        this.gltfWheelSpinMeshes = [];
        this.gltfFrontWheelPivots = [];
        const frontWheelNodes: THREE.Object3D[] = [];
        model.traverse((child) => {
            // Spin meshes: polySurface..._frontL/_frontR/_rearL/_rearR
            if (child instanceof THREE.Mesh) {
                const name = child.name.toLowerCase();
                if (name.includes('polysurface') && (name.includes('_front') || name.includes('_rear'))) {
                    const spinTarget = child.parent ?? child;
                    if (!this.gltfWheelSpinMeshes.includes(spinTarget)) {
                        spinTarget.matrixAutoUpdate = true;
                        this.gltfWheelSpinMeshes.push(spinTarget);
                    }
                }
            }

            // Steering nodes: 3DWheel Front L/R (wrap in a pivot for clean yaw)
            const normalizedName = child.name.replace(/\s+/g, '_');
            if (normalizedName === '3DWheel_Front_L' || normalizedName === '3DWheel_Front_R') {
                frontWheelNodes.push(child);
            }
        });

        // Create steering pivots after traversal to avoid duplicate creation
        frontWheelNodes.forEach((wheelNode) => {
            if (this.gltfFrontWheelPivots.some(pivot => pivot.name === `${wheelNode.name}_steerPivot`)) {
                return;
            }
            const parent = wheelNode.parent;
            if (!parent) return;
            let pivot: THREE.Object3D | null = null;
            if (parent.name.endsWith('_steerPivot')) {
                pivot = parent;
            } else {
                pivot = new THREE.Object3D();
                pivot.name = `${wheelNode.name}_steerPivot`;
                // Place pivot at wheel position in parent space
                pivot.position.copy(wheelNode.position);
                // Keep pivot unrotated so yaw is clean around local Y
                pivot.quaternion.identity();
                pivot.scale.set(1, 1, 1);
                parent.add(pivot);
                pivot.updateMatrixWorld(true);
                pivot.attach(wheelNode); // preserve world transform
            }
            pivot.userData.baseQuat = pivot.quaternion.clone();
            this.gltfFrontWheelPivots.push(pivot);
        });

        if (this.gltfFrontWheelPivots.length === 0) {
            console.warn('No front wheel nodes found for steering.');
        }
    }

    update(delta: number): void {
        this.previousPosition.copy(this.position);
        this.previousRotation.copy(this.rotation);
        if (this.engineState === 'starting') {
            this.ignitionRemaining = Math.max(0, this.ignitionRemaining - delta);
            if (this.ignitionRemaining === 0) this.engineState = 'running';
        }
        const contact = this.surface(this.physics.x, this.physics.z, this.position.y);
        this.physics.step(delta, {
            throttle: this.throttleInput,
            brake: this.brakeInput,
            steering: this.steeringAngle,
            handbrake: this.handbrakeActive,
            boost: this.isBoosting,
            parkingBrake: this.engineState !== 'running',
        }, contact.grip, contact.slopeX, contact.slopeZ);
        const proposed = this.surface(this.physics.x, this.physics.z, this.position.y);
        this.impact = Math.max(this.impact, this.engineState === 'running' ? this.world?.resolve(this.physics, proposed.height + this.groundOffset, this.config.collision) ?? 0 : 0);
        const road = this.surface(this.physics.x, this.physics.z, this.position.y);
        this.alignToGround(road, 1 - Math.exp(-this.config.camera.terrainTiltRate * delta));
        this.position.set(this.physics.x, road.height + this.groundOffset / this.groundNormal.y, this.physics.z);
        this.speed = this.physics.forwardSpeed * 3.6;
        const targetRPM = this.engineState === 'running' ? targetEngineRPM(this.speed, this.throttleInput, this.config.audio) : this.engineState === 'starting' ? 240 : 0;
        this.rpm += (targetRPM - this.rpm) * (1 - Math.exp(-7 * delta));
        this.boostAmount = this.physics.boost;
        this.mesh.position.copy(this.position);
        this.mesh.quaternion.copy(this.rotation);
        const speedMps = this.speed / 3.6;

        // Animate wheels (rotate when moving)
        if (this.gltfWheelSpinMeshes.length > 0) {
            if (Math.abs(this.speed) > 0.5) {
                const wheelRotation = -speedMps * delta / this.config.model.wheelRadius;
                this.gltfWheelSpinMeshes.forEach(wheelMesh => {
                    wheelMesh.rotateX(wheelRotation);
                });
            }
            // Rotate front wheel pivots for steering
            if (this.gltfFrontWheelPivots.length > 0) {
                const frontWheelAngle = this.steeringAngle * 0.7;
                const steerQuat = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    frontWheelAngle
                );
                this.gltfFrontWheelPivots.forEach(pivot => {
                    const baseQuat = pivot.userData.baseQuat instanceof THREE.Quaternion
                        ? pivot.userData.baseQuat
                        : pivot.quaternion.clone();
                    pivot.quaternion.copy(baseQuat).multiply(steerQuat);
                });
            }
        }
    }

    setThrottle(value: number): void {
        this.throttleInput = Math.max(-1, Math.min(1, value));
    }

    setBrake(value: number): void {
        this.brakeInput = Math.max(0, Math.min(1, value));
    }

    setSteering(angle: number): void {
        this.steeringAngle = Math.max(-this.maxSteeringAngle, Math.min(this.maxSteeringAngle, angle));
    }

    setBoost(active: boolean): void {
        if (active && this.boostAmount > 0) {
            this.isBoosting = true;
        } else {
            this.isBoosting = false;
        }
    }

    getBoostAmount(): number {
        return this.boostAmount;
    }

    isBoostActive(): boolean {
        return this.physics.boosting;
    }

    setHandbrake(active: boolean): void {
        this.handbrakeActive = active;
    }

    isHandbrakeActive(): boolean {
        return this.handbrakeActive || this.engineState !== 'running';
    }

    getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    getCameraTargetPosition(): THREE.Vector3 {
        return this.cameraTargetOffset.clone().applyQuaternion(this.renderRotation).add(this.renderPosition);
    }

    getDriverEyePosition(): THREE.Vector3 {
        return this.driverEyeOffset.clone().applyQuaternion(this.renderRotation).add(this.renderPosition);
    }

    getRotation(): THREE.Quaternion {
        return this.rotation.clone();
    }

    getDirection(): THREE.Vector3 {
        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyQuaternion(this.rotation);
        return direction;
    }

    getSpeed(): number {
        return this.speed;
    }

    setPosition(x: number, y: number, z: number): void {
        this.physics.x = x;
        this.physics.z = z;
        const road = this.surface(x, z, y);
        this.alignToGround(road, 1);
        this.position.set(x, road.height + this.groundOffset / this.groundNormal.y, z);
        this.mesh.position.copy(this.position);
        this.mesh.quaternion.copy(this.rotation);
        this.snapRenderPose();
    }

    setRotation(y: number): void {
        // Reset rotation to default (facing forward/North)
        // y is rotation around Y-axis in radians
        this.physics.yaw = y;
        this.alignToGround(this.surface(this.physics.x, this.physics.z, this.position.y), 1);
        this.mesh.setRotationFromQuaternion(this.rotation);
        this.steeringAngle = 0;
        this.snapRenderPose();
    }

    setSpeed(speed: number): void {
        this.physics.vx = Math.sin(this.physics.yaw) * speed / 3.6;
        this.physics.vz = Math.cos(this.physics.yaw) * speed / 3.6;
        this.speed = speed;
        this.throttleInput = 0;
        this.brakeInput = 0;
    }

    /**
     * Reset car physics state (speed, steering, etc.)
     */
    resetPhysics(): void {
        this.physics.reset();
        this.impact = 0;
        this.speed = 0;
        this.throttleInput = 0;
        this.brakeInput = 0;
        this.steeringAngle = 0;
        this.handbrakeActive = false;
        this.isBoosting = false;
    }

    /**
     * Dispose of car mesh resources (geometries and materials)
     */
    setWorld(world: CollisionWorld, surface: typeof this.surface): void {
        this.world = world;
        this.surface = surface;
    }

    private alignToGround(road: SurfaceSample, blend: number): void {
        const normal = new THREE.Vector3(-road.slopeX, 1, -road.slopeZ).normalize();
        this.groundNormal.lerp(normal, blend).normalize();
        const x = Math.sin(this.physics.yaw), z = Math.cos(this.physics.yaw);
        const forward = new THREE.Vector3(x, -(this.groundNormal.x * x + this.groundNormal.z * z) / this.groundNormal.y, z).normalize();
        const right = new THREE.Vector3().crossVectors(this.groundNormal, forward).normalize();
        this.rotation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, this.groundNormal, forward));
    }

    consumeImpact(): number {
        const impact = this.impact;
        this.impact = 0;
        return impact;
    }

    render(alpha: number): void {
        this.renderPosition.lerpVectors(this.previousPosition, this.position, alpha);
        this.renderRotation.copy(this.previousRotation).slerp(this.rotation, alpha);
        this.mesh.position.copy(this.renderPosition); this.mesh.quaternion.copy(this.renderRotation);
    }
    getRenderPosition(): THREE.Vector3 { return this.renderPosition.clone(); }
    getRenderRotation(): THREE.Quaternion { return this.renderRotation.clone(); }
    resetInterpolation(): void { this.snapRenderPose(); }
    private snapRenderPose(): void {
        this.previousPosition.copy(this.position); this.renderPosition.copy(this.position);
        this.previousRotation.copy(this.rotation); this.renderRotation.copy(this.rotation);
    }
    getEngineState(): EngineState { return this.engineState; }
    getRPM(): number { return this.rpm; }
    toggleIgnition(): EngineState {
        this.engineState = this.engineState === 'off' ? 'starting' : 'off';
        this.ignitionRemaining = this.engineState === 'starting' ? this.config.audio.ignitionDuration : 0;
        this.rpm = this.engineState === 'starting' ? 240 : 0;
        this.resetPhysics();
        this.snapRenderPose();
        return this.engineState;
    }

    private disposeModel(root: THREE.Object3D): void {
        const textures = new Set<THREE.Texture>();
        root.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            object.geometry.dispose();
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                for (const value of Object.values(material)) {
                    if (value instanceof THREE.Texture) textures.add(value);
                }
                material.dispose();
            }
        });
        textures.forEach(texture => texture.dispose());
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.disposeModel(this.mesh);
        this.scene.remove(this.mesh);
    }
}
