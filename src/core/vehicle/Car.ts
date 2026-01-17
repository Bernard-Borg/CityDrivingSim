import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class Car {
    private mesh: THREE.Group;
    private wheels: THREE.Group[] = [];
    private scene: THREE.Scene;
    private cameraTargetOffset = new THREE.Vector3(0, 0.8, 0.3);
    private gltfWheelMeshes: THREE.Object3D[] = [];
    private gltfFrontWheels: THREE.Object3D[] = [];

    // Physics properties
    private position: THREE.Vector3;
    private rotation: THREE.Quaternion;
    private speed: number = 0; // m/s
    public readonly maxSpeed: number = 160; // m/s (~324 km/h)
    public readonly maxAcceleration: number = 24; // m/s²
    private throttleInput: number = 0;
    private brakeInput: number = 0;
    private steeringAngle: number = 0;
    public readonly maxSteeringAngle: number = Math.PI / 4; // 30 degrees
    private readonly wheelBase: number = 2.6;
    private readonly dragCoefficient: number = 0.02;
    private readonly rollingResistance: number = 0.2;
    private readonly engineBraking: number = 0.6;
    private readonly maxBrakeDecel: number = 18;
    private readonly maxReverseSpeed: number = 14;

    // Drift/handbrake propertiesssssss
    private handbrakeActive: boolean = false;
    private readonly driftSteeringMultiplier: number = 1.5; // More steering response during drift

    // Boost properties
    private isBoosting: boolean = false;
    public readonly boostMultiplier: number = 2.0; // 100% accel increase
    public readonly boostMaxSpeed: number = 90; // m/s (~324 km/h) with boost
    private boostAmount: number = 100; // Boost meter (0-100)
    public readonly boostDrainRate: number = 30; // Per second
    public readonly boostRegenRate: number = 15; // Per second

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.position = new THREE.Vector3(0, 0.25, 0);
        this.rotation = new THREE.Quaternion();

        this.mesh = this.createCarMesh();
        this.mesh.position.copy(this.position);
        // Base scale (model-specific scaling happens after GLTF loads)
        this.mesh.scale.set(1, 1, 1);
        scene.add(this.mesh);

        this.loadCarModel();
    }

    private loadCarModel(): void {
        const loader = new GLTFLoader();
        loader.load(
            '/models/car.gltf',
            (gltf) => {
                // Replace placeholder with GLTF model
                while (this.mesh.children.length > 0) {
                    this.mesh.remove(this.mesh.children[0]);
                }
                this.wheels = [];

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
                const targetLength = 3.4; // meters
                const scaleFactor = size.z > 0 ? targetLength / size.z : 1;
                model.scale.setScalar(scaleFactor);

                const centeredBox = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                const centeredSize = new THREE.Vector3();
                centeredBox.getCenter(center);
                centeredBox.getSize(centeredSize);
                model.position.sub(center);

                this.mesh.add(model);

                // Update camera target offset based on model bounds
                this.cameraTargetOffset.set(
                    0,
                    centeredSize.y * 0.5,
                    centeredSize.z * 0.15
                );

                // Cache wheel meshes for animation (steering + spin)
                this.gltfWheelMeshes = [];
                this.gltfFrontWheels = [];
                const wheelRegex = /(wheel|tire|tyre)/i;
                model.traverse((child) => {
                    if (child instanceof THREE.Mesh && wheelRegex.test(child.name)) {
                        this.gltfWheelMeshes.push(child);
                    }
                });

                if (this.gltfWheelMeshes.length > 0) {
                    // Categorize front wheels by name (e.g., "3DWheel Front L/R")
                    this.gltfWheelMeshes.forEach(mesh => {
                        const name = mesh.name.toLowerCase();
                        if (name.includes('front')) {
                            this.gltfFrontWheels.push(mesh);
                        }
                    });
                }
            },
            undefined,
            (error) => {
                console.warn('Failed to load GLTF car model:', error);
            }
        );
    }

    private createCarMesh(): THREE.Group {
        const group = new THREE.Group();

        // Main car body - more realistic sedan shape
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a3a5c,
            roughness: 0.4,
            metalness: 0.7
        });

        // Lower body (wider and lower)
        const lowerBodyGeometry = new THREE.BoxGeometry(1.9, 0.6, 4.2);
        const lowerBody = new THREE.Mesh(lowerBodyGeometry, bodyMaterial);
        lowerBody.position.y = 0.3;
        lowerBody.castShadow = true;
        lowerBody.receiveShadow = true;
        group.add(lowerBody);

        // Upper body section (hood area)
        const hoodGeometry = new THREE.BoxGeometry(1.85, 0.4, 1.5);
        const hood = new THREE.Mesh(hoodGeometry, bodyMaterial);
        hood.position.set(0, 0.55, 1.3);
        hood.castShadow = true;
        group.add(hood);

        // Trunk area
        const trunkGeometry = new THREE.BoxGeometry(1.85, 0.4, 1.2);
        const trunk = new THREE.Mesh(trunkGeometry, bodyMaterial);
        trunk.position.set(0, 0.55, -1.4);
        trunk.castShadow = true;
        group.add(trunk);

        // Car roof - more rounded appearance
        const roofGeometry = new THREE.BoxGeometry(1.5, 0.5, 2.2);
        const roof = new THREE.Mesh(roofGeometry, bodyMaterial);
        roof.position.set(0, 1.15, -0.1);
        roof.castShadow = true;
        group.add(roof);

        // Front windshield
        const windshieldGeometry = new THREE.PlaneGeometry(1.4, 0.75);
        const windshieldMaterial = new THREE.MeshStandardMaterial({
            color: 0x87CEEB,
            transparent: true,
            opacity: 0.25,
            roughness: 0.05,
            metalness: 0.95
        });
        const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
        windshield.position.set(0, 1.05, 1.25);
        windshield.rotation.x = -0.25;
        group.add(windshield);

        // Rear windshield
        const rearWindshield = new THREE.Mesh(windshieldGeometry.clone(), windshieldMaterial);
        rearWindshield.position.set(0, 1.05, -1.45);
        rearWindshield.rotation.x = 0.25;
        group.add(rearWindshield);

        // Side windows
        const sideWindowMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a6fa5,
            transparent: true,
            opacity: 0.3,
            roughness: 0.1,
            metalness: 0.9
        });

        // Left side windows
        const leftFrontWindow = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.6),
            sideWindowMaterial
        );
        leftFrontWindow.position.set(-0.76, 1.05, 0.4);
        leftFrontWindow.rotation.y = Math.PI / 2;
        leftFrontWindow.rotation.x = -0.1;
        group.add(leftFrontWindow);

        const leftRearWindow = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.6),
            sideWindowMaterial
        );
        leftRearWindow.position.set(-0.76, 1.05, -0.6);
        leftRearWindow.rotation.y = Math.PI / 2;
        leftRearWindow.rotation.x = -0.1;
        group.add(leftRearWindow);

        // Right side windows
        const rightFrontWindow = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.6),
            sideWindowMaterial
        );
        rightFrontWindow.position.set(0.76, 1.05, 0.4);
        rightFrontWindow.rotation.y = -Math.PI / 2;
        rightFrontWindow.rotation.x = -0.1;
        group.add(rightFrontWindow);

        const rightRearWindow = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.6),
            sideWindowMaterial
        );
        rightRearWindow.position.set(0.76, 1.05, -0.6);
        rightRearWindow.rotation.y = -Math.PI / 2;
        rightRearWindow.rotation.x = -0.1;
        group.add(rightRearWindow);

        // Bumpers
        const bumperMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.8,
            metalness: 0.2
        });

        // Front bumper
        const frontBumper = new THREE.Mesh(
            new THREE.BoxGeometry(1.9, 0.25, 0.3),
            bumperMaterial
        );
        frontBumper.position.set(0, 0.15, 2.2);
        frontBumper.castShadow = true;
        group.add(frontBumper);

        // Rear bumper
        const rearBumper = new THREE.Mesh(
            new THREE.BoxGeometry(1.9, 0.25, 0.3),
            bumperMaterial
        );
        rearBumper.position.set(0, 0.15, -2.2);
        rearBumper.castShadow = true;
        group.add(rearBumper);

        // Wheels - more realistic car wheels
        // CylinderGeometry creates cylinder along Y axis, rotate 90° around Z to make horizontal
        const wheelRadius = 0.4;
        const wheelWidth = 0.3;
        const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a0a0a,
            roughness: 0.95
        });
        const rimRadius = 0.25;
        const rimWidth = 0.32;
        const rimGeometry = new THREE.CylinderGeometry(rimRadius, rimRadius, rimWidth, 16);
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xd4d4d4,
            metalness: 0.9,
            roughness: 0.3
        });

        // Wheel positions relative to car body
        // Lower body is at y=0.3 with height 0.6, so bottom is at y=0
        // Wheels should be positioned so they're visible below the car body
        // Position at y=0.15 so wheel center is at 0.15, bottom at -0.25, top at 0.55
        // This makes them clearly visible below the car body
        const wheelYPosition = 0.15; // Lower than before for better visibility
        const wheelPositions: Array<[number, number, number]> = [
            [-0.7, wheelYPosition, 1.25],   // Front left
            [0.7, wheelYPosition, 1.25],    // Front right
            [-0.7, wheelYPosition, -1.25],  // Rear left
            [0.7, wheelYPosition, -1.25]    // Rear right
        ];

        wheelPositions.forEach((pos, index) => {
            const wheelGroup = new THREE.Group();

            // Tire (outer wheel)
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            // Rotate 90° around Z axis to make cylinder horizontal (wheel axis along Y)
            wheel.rotation.z = Math.PI / 2;
            wheel.castShadow = true;
            wheel.receiveShadow = true;
            wheelGroup.add(wheel);

            // Rim (inner wheel)
            const rim = new THREE.Mesh(rimGeometry, rimMaterial);
            // Rotate 90° around Z axis to align with tire
            rim.rotation.z = Math.PI / 2;
            rim.castShadow = true;
            wheelGroup.add(rim);

            // Position wheel group
            wheelGroup.position.set(pos[0], pos[1], pos[2]);
            wheelGroup.castShadow = true;
            group.add(wheelGroup);
            this.wheels.push(wheelGroup);
        });

        // Headlights - more realistic design
        const lightMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFDD,
            emissive: 0xFFFFAA,
            emissiveIntensity: 0.6,
            metalness: 0.9,
            roughness: 0.1
        });

        // Left headlight
        const leftLightGeometry = new THREE.CylinderGeometry(0.12, 0.15, 0.2, 12);
        const leftLight = new THREE.Mesh(leftLightGeometry, lightMaterial);
        leftLight.rotation.z = Math.PI / 2;
        leftLight.position.set(-0.65, 0.5, 2.15);
        group.add(leftLight);

        // Right headlight
        const rightLight = new THREE.Mesh(leftLightGeometry.clone(), lightMaterial);
        rightLight.rotation.z = Math.PI / 2;
        rightLight.position.set(0.65, 0.5, 2.15);
        group.add(rightLight);

        // Taillights
        const tailLightMaterial = new THREE.MeshStandardMaterial({
            color: 0xFF4444,
            emissive: 0xFF0000,
            emissiveIntensity: 0.4
        });

        const tailLightGeometry = new THREE.BoxGeometry(0.15, 0.2, 0.1);
        const leftTailLight = new THREE.Mesh(tailLightGeometry, tailLightMaterial);
        leftTailLight.position.set(-0.65, 0.5, -2.15);
        group.add(leftTailLight);

        const rightTailLight = new THREE.Mesh(tailLightGeometry.clone(), tailLightMaterial);
        rightTailLight.position.set(0.65, 0.5, -2.15);
        group.add(rightTailLight);

        // Side mirrors
        const mirrorMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.8,
            roughness: 0.2
        });

        const mirrorGeometry = new THREE.BoxGeometry(0.08, 0.06, 0.12);
        const leftMirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
        leftMirror.position.set(-0.96, 0.9, 0.7);
        group.add(leftMirror);

        const rightMirror = new THREE.Mesh(mirrorGeometry.clone(), mirrorMaterial);
        rightMirror.position.set(0.96, 0.9, 0.7);
        group.add(rightMirror);

        return group;
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
        const speedSign = this.speed === 0 ? (throttle >= 0 ? 1 : -1) : Math.sign(this.speed);

        const boostAccelMultiplier = this.isBoosting ? this.boostMultiplier : 1;
        let engineAccel = throttle * this.maxAcceleration * boostAccelMultiplier;
        if (throttle < 0) {
            // Reverse is weaker
            engineAccel *= 0.6;
        }

        const drag = this.dragCoefficient * this.speed * Math.abs(this.speed);
        const rolling = this.rollingResistance * this.speed;
        const engineBrake = Math.abs(throttle) < 0.05 ? this.engineBraking * speedSign : 0;
        const brakeDecel = brake * this.maxBrakeDecel * speedSign;

        const netAccel = engineAccel - drag - rolling - engineBrake - brakeDecel;
        this.speed += netAccel * delta;

        // Clamp speed
        if (throttle >= 0) {
            this.speed = Math.min(this.speed, effectiveMaxSpeed);
        }
        if (throttle <= 0) {
            this.speed = Math.max(this.speed, -this.maxReverseSpeed);
        }

        // Stop very slow movement
        if (Math.abs(this.speed) < 0.05 && Math.abs(throttle) < 0.05) {
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
            const turnRadius = this.wheelBase / Math.tan(this.steeringAngle);
            const angularVelocity = (this.speed / turnRadius) * steeringMultiplier;
            const rotationDelta = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                angularVelocity * delta
            );
            this.rotation.multiply(rotationDelta);
        }

        // Move forward/backward
        const movement = direction.multiplyScalar(this.speed * delta);
        this.position.add(movement);

        // Update mesh position and rotation
        this.mesh.position.copy(this.position);
        this.mesh.quaternion.copy(this.rotation);

        // Animate wheels (rotate when moving)
        if (this.gltfWheelMeshes.length > 0) {
            if (Math.abs(this.speed) > 0.1) {
                const wheelRotation = -this.speed * delta * 2.5;
                this.gltfWheelMeshes.forEach(wheel => {
                    wheel.rotation.x += wheelRotation;
                });
            }
            // Rotate front wheels for steering
            if (this.gltfFrontWheels.length > 0) {
                const frontWheelAngle = this.steeringAngle * 0.7;
                this.gltfFrontWheels.forEach(wheel => {
                    wheel.rotation.y = frontWheelAngle;
                });
            }
        } else {
            if (Math.abs(this.speed) > 0.1) {
                const wheelRotation = this.speed * delta * 5;
                this.wheels.forEach(wheel => {
                    const wheelMesh = wheel.children[0] as THREE.Mesh;
                    const rimMesh = wheel.children[1] as THREE.Mesh;
                    wheelMesh.rotation.x += wheelRotation / 0.4; // Divide by wheel radius
                    rimMesh.rotation.x += wheelRotation / 0.4;
                });
            }
            if (this.wheels && this.wheels.length >= 2) {
                const frontWheelAngle = this.steeringAngle * 0.7; // Front wheels turn more
                this.wheels[0].rotation.y = frontWheelAngle; // Front left
                this.wheels[1].rotation.y = frontWheelAngle; // Front right
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
