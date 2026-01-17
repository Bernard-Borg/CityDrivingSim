import * as THREE from 'three';

export class Car {
    private mesh: THREE.Group;
    private wheels: THREE.Group[] = [];
    private scene: THREE.Scene;

    // Physics properties
    private position: THREE.Vector3;
    private rotation: THREE.Quaternion;
    private speed: number = 0; // m/s
    public readonly maxSpeed: number = 60; // m/s (~216 km/h)
    private acceleration: number = 0;
    public readonly maxAcceleration: number = 12; // m/s² (improved acceleration)
    private readonly friction: number = 0.99; // Minimal friction when coasting
    private steeringAngle: number = 0;
    public readonly maxSteeringAngle: number = Math.PI / 4; // 45 degrees
    private readonly turningRadius: number = 10; // Improved turning

    // Drift/handbrake propertiesssssss
    private handbrakeActive: boolean = false;
    private readonly driftSteeringMultiplier: number = 1.5; // More steering response during drift

    // Boost properties
    private isBoosting: boolean = false;
    public readonly boostMultiplier: number = 1.5; // 50% speed increase
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
        // Scale car down by 25% (0.75 = 75% of original size)
        this.mesh.scale.set(0.75, 0.75, 0.75);
        scene.add(this.mesh);
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


        if (this.acceleration !== 0) {
            // Apply acceleration with smoother curve
            const targetSpeed = this.acceleration > 0 ? effectiveMaxSpeed : -this.maxSpeed * 0.5;
            const speedDiff = targetSpeed - this.speed;
            const accelerationRate = Math.abs(this.acceleration) * delta;

            // Non-linear acceleration for more realistic feel
            // During drift, acceleration is slightly reduced (wheelspin)
            const accelFactor = this.handbrakeActive ? 0.7 : (Math.abs(speedDiff) > 5 ? 1.0 : 0.5);
            this.speed += Math.sign(speedDiff) * Math.min(Math.abs(speedDiff), accelerationRate * accelFactor);
        } else {
            // Apply friction when not accelerating (coasting/drifting)
            this.speed *= this.friction;
        }

        // During handbrake, apply sideways sliding effect
        if (this.handbrakeActive && Math.abs(this.speed) > 2 && this.steeringAngle !== 0) {
            // Create sideways momentum for drift effect
            const sideDirection = new THREE.Vector3(1, 0, 0);
            sideDirection.applyQuaternion(this.rotation);
            const slideAmount = this.steeringAngle * Math.abs(this.speed) * 0.02 * delta;
            const slideVector = sideDirection.multiplyScalar(slideAmount);
            this.position.add(slideVector);
        }

        // Stop very slow movement
        if (Math.abs(this.speed) < 0.05) {
            this.speed = 0;
        }

        // Update position based on speed and rotation
        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyQuaternion(this.rotation);

        // Improved steering - speed-dependent steering response with drift support
        if (this.steeringAngle !== 0 && Math.abs(this.speed) > 0.1) {
            // During handbrake/drift, steering is more responsive for counter-steering
            const steeringMultiplier = this.handbrakeActive ? this.driftSteeringMultiplier : 1.0;

            // Steering effectiveness decreases at higher speeds (more realistic)
            // But during drift, we want more control for counter-steering
            const speedRatio = Math.min(1, Math.abs(this.speed) / 30); // Normalize to 0-1 at 30 m/s
            let steeringEffectiveness = 1.2 - (speedRatio * 0.4); // 100% at low speed, 80% at high speed

            if (this.handbrakeActive) {
                // During drift, maintain higher steering effectiveness
                steeringEffectiveness = 1.3 - (speedRatio * 0.3); // Better control during drift
            }

            const steeringSpeed = Math.abs(this.speed) * delta * steeringEffectiveness * steeringMultiplier;

            // Reduced turn radius during drift (tighter turns)
            const effectiveTurnRadius = this.handbrakeActive
                ? this.turningRadius * 0.7  // Tighter turning during drift
                : this.turningRadius;

            const turnRadius = effectiveTurnRadius / (Math.abs(this.steeringAngle) + 0.1);
            const angularVelocity = steeringSpeed / turnRadius;
            const turnDirection = this.steeringAngle > 0 ? 1 : -1;

            const rotationDelta = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                angularVelocity * turnDirection
            );
            this.rotation.multiply(rotationDelta);

            // Smooth steering return (self-centering) - slower during drift
            const steeringReturnRate = this.handbrakeActive ? 0.90 : 0.95;
            this.steeringAngle *= steeringReturnRate;
            if (Math.abs(this.steeringAngle) < 0.01) {
                this.steeringAngle = 0;
            }
        }

        // Move forward/backward
        const movement = direction.multiplyScalar(this.speed * delta);
        this.position.add(movement);

        // Update mesh position and rotation
        this.mesh.position.copy(this.position);
        this.mesh.quaternion.copy(this.rotation);

        // Animate wheels (rotate when moving)
        if (Math.abs(this.speed) > 0.1) {
            const wheelRotation = this.speed * delta * 5;
            this.wheels.forEach(wheel => {
                const wheelMesh = wheel.children[0] as THREE.Mesh;
                const rimMesh = wheel.children[1] as THREE.Mesh;
                wheelMesh.rotation.x += wheelRotation / 0.4; // Divide by wheel radius
                rimMesh.rotation.x += wheelRotation / 0.4;
            });
        }

        // Rotate front wheels for steering
        if (this.wheels && this.wheels.length >= 2) {
            const frontWheelAngle = this.steeringAngle * 0.7; // Front wheels turn more
            this.wheels[0].rotation.y = frontWheelAngle; // Front left
            this.wheels[1].rotation.y = frontWheelAngle; // Front right
        }
    }

    setAcceleration(value: number): void {
        this.acceleration = Math.max(-this.maxAcceleration, Math.min(this.maxAcceleration, value));
    }

    setSteering(angle: number): void {
        this.steeringAngle = Math.max(-this.maxSteeringAngle, Math.min(this.maxSteeringAngle, angle));
    }

    brake(factor: number): void {
        // Improved braking - more effective at higher speeds
        const brakeForce = factor * (1 + Math.abs(this.speed) * 0.01); // Stronger at speed
        this.speed *= (1 - Math.min(brakeForce, 0.15)); // Cap max brake force
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
        this.acceleration = 0;
    }

    /**
     * Reset car physics state (speed, steering, etc.)
     */
    resetPhysics(): void {
        this.speed = 0;
        this.acceleration = 0;
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
