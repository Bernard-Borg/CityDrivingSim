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
    private currentAcceleratingSound: HTMLAudioElement | null = null;
    private currentStartupSound: HTMLAudioElement | null = null;
    private previousWasAccelerating: boolean = false;
    private previousForwardPressedAtStandstill: boolean = false;

    private currentSurface: string = 'asphalt';

    private throttleInput: number = 0;
    private brakeInput: number = 0;
    private steeringInput: number = 0;

    private readonly throttleRiseRate = 3.5;
    private readonly throttleFallRate = 5.0;
    private readonly brakeRiseRate = 6.0;
    private readonly brakeFallRate = 8.0;
    private readonly steerRate = 6.0;
    private readonly steerReturnRate = 8.0;

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

    private cameraZoomDistance: number = 12; // Default camera distance
    private readonly minZoom: number = 5;
    private readonly maxZoom: number = 25;
    private cameraAngle: number = 0; // Smoothed yaw
    private cameraPitch: number = 0.35; // Smoothed pitch
    private cameraAngleTarget: number = 0;
    private cameraPitchTarget: number = 0.35;
    private readonly minPitch: number = 0.0;
    private readonly maxPitch: number = 1.1;
    private readonly cameraRotateSpeed = 0.005;
    private readonly cameraPitchSpeed = 0.004;
    private readonly cameraSmoothRate = 10;

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
        this.initSounds();
    }

    private async initSounds(): Promise<void> {
        // Load sound files from public/sounds/ directory
        try {
            await this.soundManager.loadSound('startup', '/sounds/startup.wav');
            await this.soundManager.loadSound('accelerating', '/sounds/accelerating.wav');
        } catch (error) {
            console.warn('Failed to load some sound files:', error);
        }
    }

    private setupEventListeners(): void {
        // Keyboard controls
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
        const zoomDelta = e.deltaY > 0 ? 1.5 : -1.5;
        this.cameraZoomDistance = Math.max(this.minZoom, Math.min(this.maxZoom, this.cameraZoomDistance + zoomDelta));
    }

    getCameraZoomDistance(): number {
        return this.cameraZoomDistance;
    }

    private handleKeyDown(e: KeyboardEvent): void {
        switch (e.key.toLowerCase()) {
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

            // Accumulate camera angle
            this.cameraAngleTarget -= deltaX * this.cameraRotateSpeed;
            this.cameraPitchTarget = Math.max(this.minPitch, Math.min(this.maxPitch, this.cameraPitchTarget - deltaY * this.cameraPitchSpeed));

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

    setRoadSurface(surface: string): void {
        this.currentSurface = surface || 'asphalt';
    }

    update(delta: number): void {
        // Smooth camera angles to reduce jank
        this.cameraAngle = THREE.MathUtils.damp(this.cameraAngle, this.cameraAngleTarget, this.cameraSmoothRate, delta);
        this.cameraPitch = THREE.MathUtils.damp(this.cameraPitch, this.cameraPitchTarget, this.cameraSmoothRate, delta);
        // Check if startup sound is still playing - if so, prevent movement
        const isStartupPlaying = this.currentStartupSound &&
            !this.currentStartupSound.paused &&
            !this.currentStartupSound.ended &&
            this.currentStartupSound.currentTime < this.currentStartupSound.duration;

        // Throttle with smoother input response
        let targetThrottle = 0;
        if (!isStartupPlaying) {
            if (this.keys.forward) {
                targetThrottle = 1;
            } else if (this.keys.backward) {
                targetThrottle = -0.6; // Reverse throttle
            }
        }

        // Brake input (separate from throttle)
        const targetBrake = this.keys.brake ? 1 : 0;

        // Smooth throttle and brake
        const throttleRate = targetThrottle > this.throttleInput ? this.throttleRiseRate : this.throttleFallRate;
        this.throttleInput = THREE.MathUtils.damp(this.throttleInput, targetThrottle, throttleRate, delta);
        const brakeRate = targetBrake > this.brakeInput ? this.brakeRiseRate : this.brakeFallRate;
        this.brakeInput = THREE.MathUtils.damp(this.brakeInput, targetBrake, brakeRate, delta);

        // Steering input (speed-dependent)
        const rawSteer = (this.keys.left ? 1 : 0) + (this.keys.right ? -1 : 0);
        const currentSpeed = Math.abs(this.car.getSpeed());
        const speedFactor = THREE.MathUtils.clamp(1 - currentSpeed / 35, 0.35, 1);
        const targetSteer = rawSteer * speedFactor;
        const steerRate = Math.abs(targetSteer) > Math.abs(this.steeringInput) ? this.steerRate : this.steerReturnRate;
        this.steeringInput = THREE.MathUtils.damp(this.steeringInput, targetSteer, steerRate, delta);

        this.car.setThrottle(this.throttleInput);
        this.car.setBrake(this.brakeInput);
        this.car.setSteering(this.steeringInput * this.car.maxSteeringAngle);

        // Handbrake - enables drift
        this.car.setHandbrake(this.keys.handbrake);

        // Boost
        const wasBoosting = this.car.isBoostActive();
        this.car.setBoost(this.keys.boost && this.car.getBoostAmount() > 0);

        // Sound effects for acceleration
        const isAtStandstill = currentSpeed < 0.1;
        const throttleAmount = Math.max(0, this.throttleInput);
        const isAccelerating = throttleAmount > 0.1 && !this.car.isBoostActive();

        // Play startup sound when at standstill and gas is pressed (only once when key is first pressed)
        const forwardPressedAtStandstill = isAtStandstill && this.keys.forward;
        if (forwardPressedAtStandstill && !this.previousForwardPressedAtStandstill) {
            // Stop any existing startup sound
            if (this.currentStartupSound) {
                this.currentStartupSound.pause();
                this.currentStartupSound.currentTime = 0;
            }
            // Play startup sound and store reference
            this.currentStartupSound = this.soundManager.play('startup', 0.7, false);

            // Clean up startup sound reference when it finishes
            if (this.currentStartupSound) {
                this.currentStartupSound.addEventListener('ended', () => {
                    this.currentStartupSound = null;
                });
            }
        }
        this.previousForwardPressedAtStandstill = forwardPressedAtStandstill;

        // Sync engine sound with mute state
        const isSoundEnabled = this.soundManager.getEnabled();
        this.engineSoundGenerator.setEnabled(isSoundEnabled);
        
        // Update procedural engine sound
        // Wait for startup sound to finish before starting engine sound
        if (!isStartupPlaying && isSoundEnabled) {
            if (isAccelerating || currentSpeed > 0.1) {
                // Start engine sound if not already playing
                if (!this.previousWasAccelerating) {
                    this.engineSoundGenerator.start();
                }
                // Update engine sound based on speed and acceleration
                this.engineSoundGenerator.update(currentSpeed, throttleAmount, isAccelerating);
                this.previousWasAccelerating = true;
            } else {
                // Stop engine sound when car is stopped and not accelerating
                if (this.previousWasAccelerating) {
                    this.engineSoundGenerator.stop();
                }
                this.previousWasAccelerating = false;
            }
        } else {
            // Stop engine sound while startup is playing or when muted
            if (this.previousWasAccelerating) {
                this.engineSoundGenerator.stop();
                this.previousWasAccelerating = false;
            }
        }

        // Road noise based on surface type
        this.roadSoundGenerator.setEnabled(isSoundEnabled);
        if (!isStartupPlaying && isSoundEnabled) {
            this.roadSoundGenerator.update(currentSpeed, this.currentSurface);
        } else {
            this.roadSoundGenerator.stop();
        }

        // Play boost sound effect if boost state changed
        if (this.car.isBoostActive() && !wasBoosting) {
            // Stop accelerating sound when boost starts
            if (this.currentAcceleratingSound) {
                this.currentAcceleratingSound.pause();
                this.currentAcceleratingSound.currentTime = 0;
                this.currentAcceleratingSound = null;
            }
            // this.soundManager.play('boost', 0.8, true)
        } else if (!this.car.isBoostActive() && wasBoosting) {
            // this.soundManager.stop('boost')
        }

        // Play drift sound effect if handbrake state changed
        if (this.keys.handbrake) {
            // this.soundManager.play('drift', 0.6, true)
        }

        // Engine sound (would play based on speed)
        // const speedRatio = Math.abs(this.car.getSpeed()) / this.car.maxSpeed
        // this.soundManager.play('engine', 0.3 + speedRatio * 0.4, true)

        // Update car physics
        this.car.update(delta);
    }

    dispose(): void {
        // Stop any playing sounds
        if (this.currentAcceleratingSound) {
            this.currentAcceleratingSound.pause();
            this.currentAcceleratingSound.currentTime = 0;
            this.currentAcceleratingSound = null;
        }
        if (this.currentStartupSound) {
            this.currentStartupSound.pause();
            this.currentStartupSound.currentTime = 0;
            this.currentStartupSound = null;
        }
        
        // Stop and dispose procedural engine sound
        if (this.engineSoundGenerator) {
            this.engineSoundGenerator.dispose();
        }
        if (this.roadSoundGenerator) {
            this.roadSoundGenerator.dispose();
        }

        document.removeEventListener('keydown', this.keyDownHandler);
        document.removeEventListener('keyup', this.keyUpHandler);
        document.removeEventListener('mouseup', this.mouseUpHandler);
        this.canvas.removeEventListener('mousedown', this.mouseDownHandler);
        this.canvas.removeEventListener('mousemove', this.mouseMoveHandler);
        this.canvas.removeEventListener('wheel', this.wheelHandler);
        this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
    }
}
