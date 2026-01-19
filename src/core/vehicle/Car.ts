import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class Car {
    private mesh: THREE.Group = new THREE.Group();
    private scene: THREE.Scene;
    private cameraTargetOffset = new THREE.Vector3(0, 0.8, 0.3);
    private gltfWheelSpinMeshes: THREE.Object3D[] = [];
    private gltfFrontWheelPivots: THREE.Object3D[] = [];

    // Physics properties
    private position: THREE.Vector3;
    private rotation: THREE.Quaternion;
    private speed: number = 0; // km/h
    public readonly maxSpeed: number = 200; // km/h 
    public readonly maxAcceleration: number = 45; // km/h per s
    private throttleInput: number = 0;
    private brakeInput: number = 0;
    private steeringAngle: number = 0;
    public readonly maxSteeringAngle: number = Math.PI / 3.75; // 45 degrees
    private readonly wheelBase: number = 2.6;
    private readonly dragCoefficient: number = 0.02 / 3.6; // scaled for km/h
    private readonly rollingResistance: number = 0.2; // scaled for km/h
    private readonly engineBraking: number = 2.16; // km/h per s (converted from 0.6 m/s^2)
    private readonly maxBrakeDecel: number = 64.8; // km/h per s (converted from 18 m/s^2)
    private readonly maxReverseSpeed: number = 50.4; // km/h (converted from 14 m/s)

    // Drift/handbrake properties
    private handbrakeActive: boolean = false;
    private readonly driftSteeringMultiplier: number = 1.5; // More steering response during drift

    // Boost properties
    private isBoosting: boolean = false;
    public readonly boostMultiplier: number = 2.0; // 100% accel increase
    public readonly boostMaxSpeed: number = 250; // km/h (converted from 90 m/s)
    private boostAmount: number = 100; // Boost meter (0-100)
    public readonly boostDrainRate: number = 30; // Per second
    public readonly boostRegenRate: number = 15; // Per second

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.position = new THREE.Vector3(0, 0.25, 0);
        this.rotation = new THREE.Quaternion();

        this.loadCarModel();
    }

    private loadCarModel(): void {
        const loader = new GLTFLoader();
        loader.load(
            '/models/car.gltf',
            (gltf) => {
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
                const targetLength = 2.6; // meters (smaller to fit road scale)
                const scaleFactor = size.z > 0 ? targetLength / size.z : 1;
                model.scale.setScalar(scaleFactor);

                const centeredBox = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                const centeredSize = new THREE.Vector3();
                centeredBox.getCenter(center);
                centeredBox.getSize(centeredSize);
                model.position.sub(center);

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
            },
            undefined,
            (error) => {
                console.warn('Failed to load GLTF car model:', error);
            }
        );
    }

    update(delta: number): void {
        // Update boost
        if (this.isBoosting && this.boostAmount > 0) {
            this.boostAmount = Math.max(0, this.boostAmount - this.boostDrainRate * delta);
            if (this.boostAmount <= 0) {
                this.isBoosting = false;
            }
        } else if (!this.isBoosting && this.boostAmount < 100) {
            this.boostAmount = Math.min(100, this.boostAmount + this.boostRegenRate * delta);
        }

        // Determine effective max speed (with boost)
        const effectiveMaxSpeed = this.isBoosting ? this.boostMaxSpeed : this.maxSpeed;


        // Compute longitudinal acceleration (engine, drag, rolling, braking)
        const throttle = THREE.MathUtils.clamp(this.throttleInput, -1, 1);
        const brake = THREE.MathUtils.clamp(this.brakeInput, 0, 1);
        const speedSign = Math.abs(this.speed) < 0.05 ? 0 : Math.sign(this.speed);

        const boostAccelMultiplier = this.isBoosting ? this.boostMultiplier : 1;
        let engineAccel = throttle * this.maxAcceleration * boostAccelMultiplier;
        if (throttle < 0) {
            // Reverse is weaker
            engineAccel *= 0.6;
        }

        const drag = this.dragCoefficient * this.speed * Math.abs(this.speed);
        const rolling = this.rollingResistance * this.speed;
        const engineBrake = Math.abs(throttle) < 0.05 ? this.engineBraking * speedSign : 0;
        const brakeDecel = speedSign !== 0 ? brake * this.maxBrakeDecel * speedSign : 0;

        const netAccel = engineAccel - drag - rolling - engineBrake - brakeDecel;
        this.speed += netAccel * delta;

        // Prevent brake from oscillating around zero speed
        if (brake > 0.1 && Math.abs(this.speed) < 1 && Math.abs(throttle) < 0.05) {
            this.speed = 0;
        }

        // Clamp speed
        if (throttle >= 0) {
            this.speed = Math.min(this.speed, effectiveMaxSpeed);
        }
        if (throttle <= 0) {
            this.speed = Math.max(this.speed, -this.maxReverseSpeed);
        }

        // Stop very slow movement
        if (Math.abs(this.speed) < 0.2 && Math.abs(throttle) < 0.05) {
            this.speed = 0;
        }

        // During handbrake, apply sideways sliding effect
        if (this.handbrakeActive && Math.abs(this.speed) > 2 && Math.abs(this.steeringAngle) > 0.01) {
            const sideDirection = new THREE.Vector3(1, 0, 0);
            sideDirection.applyQuaternion(this.rotation);
            const slideAmount = this.steeringAngle * Math.abs(this.speed) * 0.015 * delta;
            const slideVector = sideDirection.multiplyScalar(slideAmount);
            this.position.add(slideVector);
        }

        // Update position based on speed and rotation
        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyQuaternion(this.rotation);

        // Steering using a simple bicycle model
        if (Math.abs(this.steeringAngle) > 0.001 && Math.abs(this.speed) > 0.1) {
            const steeringMultiplier = this.handbrakeActive ? this.driftSteeringMultiplier : 1.0;
            const speedKmh = Math.abs(this.speed);
            if (speedKmh > 2) {
                const turnRadius = this.wheelBase / Math.tan(this.steeringAngle);
                let angularVelocity = (this.speed / turnRadius) * steeringMultiplier;
                const maxYawRate = 1.1; // rad/s
                angularVelocity = THREE.MathUtils.clamp(angularVelocity, -maxYawRate, maxYawRate);
                const rotationDelta = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    angularVelocity * delta
                );
                this.rotation.multiply(rotationDelta);
            }
        }

        // Move forward/backward
        const speedMps = this.speed / 3.6;
        const movement = direction.multiplyScalar(speedMps * delta);
        this.position.add(movement);

        // Update mesh position and rotation
        this.mesh.position.copy(this.position);
        this.mesh.quaternion.copy(this.rotation);

        // Animate wheels (rotate when moving)
        if (this.gltfWheelSpinMeshes.length > 0) {
            if (Math.abs(this.speed) > 0.5) {
                const wheelRotation = -speedMps * delta * 2.5;
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
        return this.isBoosting;
    }

    setHandbrake(active: boolean): void {
        this.handbrakeActive = active;
    }

    isHandbrakeActive(): boolean {
        return this.handbrakeActive;
    }

    getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    getCameraTargetPosition(): THREE.Vector3 {
        return this.mesh.localToWorld(this.cameraTargetOffset.clone());
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
        this.position.set(x, y, z);
        this.mesh.position.copy(this.position);
    }

    setRotation(y: number): void {
        // Reset rotation to default (facing forward/North)
        // y is rotation around Y-axis in radians
        this.rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), y);
        this.mesh.setRotationFromQuaternion(this.rotation);
        this.steeringAngle = 0;
    }

    setSpeed(speed: number): void {
        this.speed = speed;
        this.throttleInput = 0;
        this.brakeInput = 0;
    }

    /**
     * Reset car physics state (speed, steering, etc.)
     */
    resetPhysics(): void {
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
    dispose(): void {
        const disposeObject = (object: THREE.Object3D): void => {
            if (object instanceof THREE.Mesh) {
                // Dispose geometry
                if (object.geometry) {
                    object.geometry.dispose();
                }

                // Dispose material(s)
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => {
                            if (material.map) material.map.dispose();
                            material.dispose();
                        });
                    } else {
                        if (object.material.map) object.material.map.dispose();
                        object.material.dispose();
                    }
                }
            } else if (object instanceof THREE.Group) {
                // Recursively dispose children
                const children = [...object.children];
                children.forEach(child => disposeObject(child));
            }
        };

        disposeObject(this.mesh);
        this.scene.remove(this.mesh);
    }
}
