import * as THREE from 'three';
import { Car } from './Car';
import { SoundManager } from '@/utils/SoundManager';
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

        this.setupEventListeners();
        this.initSounds();
    }

    private async initSounds(): Promise<void> {
        // Load sound files (if they exist)
        // You can add sound files to public/sounds/ directory
        // Example: await this.soundManager.loadSound('engine', '/sounds/engine.mp3')
        // For now, we'll use placeholders that won't break if files don't exist
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

    private cameraAngle: number = 0; // Track camera rotation around car

    private handleMouseMove(e: MouseEvent): void {
        if (this.mouse.isDown) {
            const deltaX = e.clientX - this.mouse.x;

            // Accumulate camera angle
            this.cameraAngle -= deltaX * 0.005;

            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        }
    }

    getCameraAngle(): number {
        return this.cameraAngle;
    }

    update(delta: number): void {
        // Acceleration with smoother input response
        let acceleration = 0;
        if (this.keys.forward) {
            acceleration = 1;
        } else if (this.keys.backward) {
            acceleration = -0.6; // Reverse speed
        }

        // Braking - improved gradual braking
        if (this.keys.brake) {
            const brakeStrength = 0.12; // Stronger braking
            this.car.brake(brakeStrength * delta * 60); // Frame-rate independent
            if (acceleration > 0) acceleration = 0; // Can't accelerate while braking
        }

        this.car.setAcceleration(acceleration * this.car.maxAcceleration);

        // Handbrake - enables drift
        this.car.setHandbrake(this.keys.handbrake);

        // Boost
        const wasBoosting = this.car.isBoostActive();
        this.car.setBoost(this.keys.boost && this.car.getBoostAmount() > 0);

        // Play boost sound effect if boost state changed
        if (this.car.isBoostActive() && !wasBoosting) {
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

        // Steering - improved with smoother response
        let steering = 0;
        if (this.keys.left) {
            steering = 1;
        } else if (this.keys.right) {
            steering = -1;
        }

        // Improved steering - speed-dependent with smoother curve
        const currentSpeed = Math.abs(this.car.getSpeed());
        const speedFactor = Math.max(0.4, 1 - (currentSpeed / 40) * 0.5); // 100% at 0, 50% at 40 m/s
        this.car.setSteering(steering * this.car.maxSteeringAngle * speedFactor);

        // Update car physics
        this.car.update(delta);
    }

    dispose(): void {
        document.removeEventListener('keydown', this.keyDownHandler);
        document.removeEventListener('keyup', this.keyUpHandler);
        document.removeEventListener('mouseup', this.mouseUpHandler);
        this.canvas.removeEventListener('mousedown', this.mouseDownHandler);
        this.canvas.removeEventListener('mousemove', this.mouseMoveHandler);
        this.canvas.removeEventListener('wheel', this.wheelHandler);
        this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
    }
}
