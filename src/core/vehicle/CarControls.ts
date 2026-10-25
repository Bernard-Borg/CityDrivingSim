import * as THREE from 'three';
import { Car } from './Car';
import { SoundManager } from '@/utils/SoundManager';
import { EngineSoundGenerator } from '@/utils/EngineSoundGenerator';
import { RoadSoundGenerator } from '@/utils/RoadSoundGenerator';
import type { InputState, MouseState } from '@/types';

export class CarControls {
    private keys: InputState = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        brake: false,
        boost: false,
        handbrake: false
    };

    private soundManager: SoundManager;
    private engineSoundGenerator: EngineSoundGenerator;
    private roadSoundGenerator: RoadSoundGenerator;
    private focused = true;
    private soundCooldown = 0;
    private currentSurface: string = 'asphalt';

    private throttleInput: number = 0;
    private brakeInput: number = 0;
    private steeringInput: number = 0;

    private readonly throttleRiseRate = 3.5;
    private readonly throttleFallRate = 5.0;
    private readonly steerRate = 14.0;
    private readonly steerReturnRate = 18.0;

    private mouse: MouseState = {
        x: 0,
        y: 0,
        isDown: false
    };

    private keyDownHandler: (e: KeyboardEvent) => void;
    private keyUpHandler: (e: KeyboardEvent) => void;
    private mouseDownHandler: (e: MouseEvent) => void;
    private mouseUpHandler: () => void;
    private mouseMoveHandler: (e: MouseEvent) => void;
    private wheelHandler: (e: WheelEvent) => void;
    private contextMenuHandler: (e: Event) => void;

    private cameraZoomDistance: number = 9; // Default camera distance
    private readonly minZoom: number = 4;
    private readonly maxZoom: number = 20;
    private cameraAngle: number = 0; // Smoothed yaw
    private cameraPitch: number = 0.25; // Smoothed pitch
    private cameraAngleTarget: number = 0;
    private cameraPitchTarget: number = 0.25;
    private readonly minPitch: number = 0.05;
    private readonly maxPitch: number = 0.9;
    private readonly cameraRotateSpeed = 0.005;
    private readonly cameraPitchSpeed = 0.004;
    private readonly cameraSmoothRate = 10;
    private firstPerson = false;
    private firstPersonYaw = 0;
    private firstPersonYawTarget = 0;
    private readonly firstPersonYawLimit = THREE.MathUtils.degToRad(80);

    constructor(
        private car: Car,
        private camera: THREE.PerspectiveCamera,
        private canvas: HTMLCanvasElement
    ) {
        // Bind handlers to preserve 'this' context
        this.keyDownHandler = this.handleKeyDown.bind(this);
        this.keyUpHandler = this.handleKeyUp.bind(this);
        this.mouseDownHandler = this.handleMouseDown.bind(this);
        this.mouseUpHandler = this.handleMouseUp.bind(this);
        this.mouseMoveHandler = this.handleMouseMove.bind(this);
        this.wheelHandler = this.handleWheel.bind(this);
        this.contextMenuHandler = (e: Event) => e.preventDefault();

        this.soundManager = SoundManager.getInstance();
        this.engineSoundGenerator = new EngineSoundGenerator();
        this.roadSoundGenerator = new RoadSoundGenerator();

        this.setupEventListeners();

    }

    private setupEventListeners(): void {
        // Keyboard controls
        window.addEventListener('blur', this.handleBlur);
        window.addEventListener('focus', this.handleFocus);
        document.addEventListener('visibilitychange', this.handleVisibility);
        document.addEventListener('keydown', this.keyDownHandler);
        document.addEventListener('keyup', this.keyUpHandler);

        // Mouse controls
        this.canvas.addEventListener('mousedown', this.mouseDownHandler);
        document.addEventListener('mouseup', this.mouseUpHandler);
        this.canvas.addEventListener('mousemove', this.mouseMoveHandler);
        this.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });

        // Prevent right-click menu
        this.canvas.addEventListener('contextmenu', this.contextMenuHandler);
    }

    private handleWheel(e: WheelEvent): void {
        e.preventDefault();
        if (this.firstPerson) return;
        const zoomDelta = e.deltaY > 0 ? 1.5 : -1.5;
        this.cameraZoomDistance = Math.max(this.minZoom, Math.min(this.maxZoom, this.cameraZoomDistance + zoomDelta));
    }

    getCameraZoomDistance(): number {
        return this.cameraZoomDistance;
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (this.soundManager.getEnabled() && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
            this.engineSoundGenerator.start();
            this.roadSoundGenerator.start();
        }
        switch (e.key.toLowerCase()) {
            case 'v':
                e.preventDefault();
                if (!e.repeat) {
                    this.firstPerson = !this.firstPerson;
                    this.firstPersonYaw = this.firstPersonYawTarget = 0;
                }
                break;
            case 'w':
            case 'arrowup':
                this.keys.forward = true;
                e.preventDefault();
                break;
            case 's':
            case 'arrowdown':
                this.keys.backward = true;
                e.preventDefault();
                break;
            case 'a':
            case 'arrowleft':
                this.keys.left = true;
                e.preventDefault();
                break;
            case 'd':
            case 'arrowright':
                this.keys.right = true;
                e.preventDefault();
                break;
            case ' ':
                this.keys.brake = true;
                e.preventDefault();
                break;
            case 'shift':
                this.keys.boost = true;
                e.preventDefault();
                break;
            case 'e':
                this.keys.handbrake = true;
                e.preventDefault();
                break;
        }
    }

    private handleKeyUp(e: KeyboardEvent): void {
        switch (e.key.toLowerCase()) {
            case 'w':
            case 'arrowup':
                this.keys.forward = false;
                break;
            case 's':
            case 'arrowdown':
                this.keys.backward = false;
                break;
            case 'a':
            case 'arrowleft':
                this.keys.left = false;
                break;
            case 'd':
            case 'arrowright':
                this.keys.right = false;
                break;
            case ' ':
                this.keys.brake = false;
                break;
            case 'shift':
                this.keys.boost = false;
                break;
            case 'e':
                this.keys.handbrake = false;
                break;
        }
    }

    private handleMouseDown(e: MouseEvent): void {
        this.mouse.isDown = true;
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
    }

    private handleMouseUp(): void {
        this.mouse.isDown = false;
    }

    private handleMouseMove(e: MouseEvent): void {
        if (this.mouse.isDown) {
            const deltaX = e.clientX - this.mouse.x;
            const deltaY = e.clientY - this.mouse.y;

            if (this.firstPerson) {
                this.firstPersonYawTarget = THREE.MathUtils.clamp(
                    this.firstPersonYawTarget - deltaX * this.cameraRotateSpeed,
                    -this.firstPersonYawLimit,
                    this.firstPersonYawLimit
                );
            } else {
                this.cameraAngleTarget -= deltaX * this.cameraRotateSpeed;
                this.cameraPitchTarget = Math.max(this.minPitch, Math.min(this.maxPitch, this.cameraPitchTarget - deltaY * this.cameraPitchSpeed));
            }

            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        }
    }

    getCameraAngle(): number {
        return this.cameraAngle;
    }

    getCameraPitch(): number {
        return this.cameraPitch;
    }

    isFirstPerson(): boolean {
        return this.firstPerson;
    }

    getFirstPersonYaw(): number {
        return this.firstPersonYaw;
    }

    setRoadSurface(surface: string): void {
        this.currentSurface = surface || 'asphalt';
    }

    update(delta: number): void {
        // Smooth camera angles to reduce jank
        this.cameraAngle = THREE.MathUtils.damp(this.cameraAngle, this.cameraAngleTarget, this.cameraSmoothRate, delta);
        this.cameraPitch = THREE.MathUtils.damp(this.cameraPitch, this.cameraPitchTarget, this.cameraSmoothRate, delta);
        this.firstPersonYaw = THREE.MathUtils.damp(this.firstPersonYaw, this.firstPersonYawTarget, this.cameraSmoothRate, delta);
        // Throttle with smoother input response
        const speed = this.car.getSpeed();
        const changingDirection = (this.keys.backward && speed > 1) || (this.keys.forward && speed < -1);
        let targetThrottle = 0;
        if (this.focused && !changingDirection) {
            if (this.keys.forward) {
                targetThrottle = 1;
            } else if (this.keys.backward) {
                targetThrottle = -1; // Reverse throttle
            }
        }

        // Brake input (separate from throttle)
        const targetBrake = this.keys.brake || changingDirection ? 1 : 0;

        // Smooth throttle and brake
        const throttleRate = targetThrottle > this.throttleInput ? this.throttleRiseRate : this.throttleFallRate;
        this.throttleInput = THREE.MathUtils.damp(this.throttleInput, targetThrottle, throttleRate, delta);
        this.brakeInput = targetBrake;

        // Steering input (speed-dependent)
        const rawSteer = (this.keys.left ? 1 : 0) + (this.keys.right ? -1 : 0);

        const targetSteer = rawSteer;
        const steerRate = Math.abs(targetSteer) > Math.abs(this.steeringInput) ? this.steerRate : this.steerReturnRate;
        this.steeringInput = THREE.MathUtils.damp(this.steeringInput, targetSteer, steerRate, delta);

        this.car.setThrottle(this.throttleInput);
        this.car.setBrake(this.brakeInput);
        this.car.setSteering(this.steeringInput * this.car.maxSteeringAngle);

        // Handbrake - enables drift
        this.car.setHandbrake(this.keys.handbrake);

        // Boost
        this.car.setBoost(this.keys.boost && this.car.getBoostAmount() > 0);

    }

    updateAudio(delta: number): void {
        this.soundCooldown = Math.max(0, this.soundCooldown - delta);
        const enabled = this.soundManager.getEnabled() && this.focused;
        this.engineSoundGenerator.setEnabled(enabled);
        this.roadSoundGenerator.setEnabled(enabled);
        const impact = this.car.consumeImpact();
        if (!enabled) return;
        const speed = Math.abs(this.car.getSpeed());
        const throttle = Math.abs(this.throttleInput);
        this.engineSoundGenerator.start();
        this.engineSoundGenerator.update(speed, throttle, throttle > 0.1, delta);
        this.roadSoundGenerator.update(speed, this.currentSurface);
        if (impact > 1.5 && this.soundCooldown === 0) {
            this.roadSoundGenerator.playImpact(Math.min(1, impact / 15));
            this.soundCooldown = 0.18;
        }
        // Dead zone keeps ordinary cornering quiet; loose surfaces crunch rather than squeal.
        const tireSlip = Math.max(0, this.car.physics.slip - 1.2);
        const onPavement = ['asphalt', 'concrete', 'paved', 'cobblestone'].includes(this.currentSurface);
        this.roadSoundGenerator.setSkid(onPavement ? Math.min(1, tireSlip / 5) : 0, speed);
    }

    resetInput(): void {
        for (const key of Object.keys(this.keys) as Array<keyof InputState>) this.keys[key] = false;
        this.throttleInput = this.brakeInput = this.steeringInput = 0;
        this.mouse.isDown = false;
        this.car.setThrottle(0);
        this.car.setBrake(0);
        this.car.setSteering(0);
        this.car.setBoost(false);
        this.car.setHandbrake(false);
    }

    private handleBlur = (): void => {
        this.focused = false;
        this.resetInput();
        this.engineSoundGenerator.stop();
        this.roadSoundGenerator.stop();
    };
    private handleFocus = (): void => { this.focused = !document.hidden; };
    private handleVisibility = (): void => {
        if (document.hidden) this.handleBlur();
        else this.handleFocus();
    };

    dispose(): void {
        // Stop and dispose procedural engine sound
        if (this.engineSoundGenerator) {
            this.engineSoundGenerator.dispose();
        }
        if (this.roadSoundGenerator) {
            this.roadSoundGenerator.dispose();
        }

        window.removeEventListener('blur', this.handleBlur);
        window.removeEventListener('focus', this.handleFocus);
        document.removeEventListener('visibilitychange', this.handleVisibility);
        document.removeEventListener('keydown', this.keyDownHandler);
        document.removeEventListener('keyup', this.keyUpHandler);
        document.removeEventListener('mouseup', this.mouseUpHandler);
        this.canvas.removeEventListener('mousedown', this.mouseDownHandler);
        this.canvas.removeEventListener('mousemove', this.mouseMoveHandler);
        this.canvas.removeEventListener('wheel', this.wheelHandler);
        this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
    }
}
