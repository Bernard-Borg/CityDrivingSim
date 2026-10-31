import { useSettingsStore } from "@/stores/settings";
import { useTouchStore } from "@/stores/touch";
/**
 * CarControls types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";
import { Car } from "./Car";
import { SoundManager } from "@/utils/SoundManager";
import { EngineSoundGenerator } from "@/utils/EngineSoundGenerator";
import { RoadSoundGenerator } from "@/utils/RoadSoundGenerator";
import type { InputState, MouseState } from "@/types";

/**
 * Translates browser input into vehicle and camera requests and coordinates vehicle audio playback.
 */
export class CarControls {
    private keys: InputState = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        brake: false,
        noseDown: false,
        noseUp: false,
        handbrake: false,
    };

    private soundManager: SoundManager;
    private engineSoundGenerator: EngineSoundGenerator;
    private roadSoundGenerator: RoadSoundGenerator;
    private focused = true;
    private paused = false;
    private audioUnlocked = false;
    private hornPressed = false;
    private requestedDirection = 0;
    private directionEngaged = false;
    private soundCooldown = 0;

    private throttleInput: number = 0;
    private brakeInput: number = 0;
    private steeringInput: number = 0;

    /**
     * Returns the configured throttle-application response rate.
     */
    private get throttleRiseRate() {
        return this.car.config.controls.throttleRise;
    }
    /**
     * Returns the configured throttle-release response rate.
     */
    private get throttleFallRate() {
        return this.car.config.controls.throttleFall;
    }
    /**
     * Returns the configured steering-application response rate.
     */
    private get steerRate() {
        return this.car.config.controls.steerRise;
    }
    /**
     * Returns the configured steering-centering response rate.
     */
    private get steerReturnRate() {
        return this.car.config.controls.steerReturn;
    }

    private mouse: MouseState = {
        x: 0,
        y: 0,
        isDown: false,
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

    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param car - Vehicle receiving control input.
     * @param camera - Camera controlled or followed by this operation.
     * @param canvas - Canvas receiving pointer input.
     */
    constructor(
        private car: Car,
        private camera: THREE.PerspectiveCamera,
        private canvas: HTMLCanvasElement,
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
        this.engineSoundGenerator = new EngineSoundGenerator(
            car.config.audio,
            car.config.physics.maxSpeed,
        );
        this.roadSoundGenerator = new RoadSoundGenerator(car.config.audio);
        this.cameraZoomDistance = car.config.camera.distance;

        this.setupEventListeners();
    }

    /**
     * Registers the browser event handlers owned by this instance.
     */
    private setupEventListeners(): void {
        // Keyboard controls
        window.addEventListener("blur", this.handleBlur);
        window.addEventListener("focus", this.handleFocus);
        document.addEventListener("visibilitychange", this.handleVisibility);
        document.addEventListener("keydown", this.keyDownHandler);
        document.addEventListener("keyup", this.keyUpHandler);

        // Mouse controls
        this.canvas.addEventListener("mousedown", this.mouseDownHandler);
        document.addEventListener("mouseup", this.mouseUpHandler);
        this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
        this.canvas.addEventListener("wheel", this.wheelHandler, {
            passive: false,
        });

        // Prevent right-click menu
        this.canvas.addEventListener("contextmenu", this.contextMenuHandler);
    }

    /**
     * Adjusts chase-camera zoom when vehicle controls are active.
     *
     * @param e - Browser input event.
     */
    private handleWheel(e: WheelEvent): void {
        if (this.paused) return;
        e.preventDefault();
        if (this.firstPerson) return;
        const zoomDelta = e.deltaY > 0 ? 1.5 : -1.5;
        this.cameraZoomDistance = Math.max(
            this.minZoom,
            Math.min(this.maxZoom, this.cameraZoomDistance + zoomDelta),
        );
    }

    /**
     * Returns chase-camera orbit distance in metres.
     */
    getCameraZoomDistance(): number {
        return this.cameraZoomDistance;
    }

    /**
     * Applies vehicle or camera shortcuts and records held controls.
     *
     * @param e - Browser input event.
     */
    private handleKeyDown(e: KeyboardEvent): void {
        const target = e.target as HTMLElement | null;
        if (
            this.paused ||
            e.ctrlKey ||
            e.metaKey ||
            e.altKey ||
            target?.matches('input,textarea,select,[contenteditable="true"]')
        )
            return;
        if (
            ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(
                e.key.toLowerCase(),
            )
        ) {
            this.unlockAudio();
        }
        switch (e.key.toLowerCase()) {
            case "h":
                e.preventDefault();
                this.unlockAudio();
                this.hornPressed = true;
                break;
            case "i":
                e.preventDefault();
                if (!e.repeat) this.toggleIgnition();
                break;
            case "v":
                e.preventDefault();
                if (!e.repeat) {
                    this.firstPerson = !this.firstPerson;
                    this.firstPersonYaw = this.firstPersonYawTarget = 0;
                }
                break;
            case "w":
            case "arrowup":
                this.keys.forward = true;
                e.preventDefault();
                break;
            case "s":
            case "arrowdown":
                this.keys.backward = true;
                e.preventDefault();
                break;
            case "a":
            case "arrowleft":
                this.keys.left = true;
                e.preventDefault();
                break;
            case "d":
            case "arrowright":
                this.keys.right = true;
                e.preventDefault();
                break;
            case " ":
                this.keys.brake = true;
                e.preventDefault();
                break;
            case "q":
                this.keys.noseDown = true;
                e.preventDefault();
                break;
            case "e":
                this.keys.noseUp = true;
                e.preventDefault();
                break;
        }
    }

    /**
     * Releases a held vehicle control.
     *
     * @param e - Browser input event.
     */
    private handleKeyUp(e: KeyboardEvent): void {
        switch (e.key.toLowerCase()) {
            case "h":
                this.hornPressed = false;
                break;
            case "w":
            case "arrowup":
                this.keys.forward = false;
                break;
            case "s":
            case "arrowdown":
                this.keys.backward = false;
                break;
            case "a":
            case "arrowleft":
                this.keys.left = false;
                break;
            case "d":
            case "arrowright":
                this.keys.right = false;
                break;
            case " ":
                this.keys.brake = false;
                break;
            case "q":
                this.keys.noseDown = false;
                break;
            case "e":
                this.keys.noseUp = false;
                break;
        }
    }

    /**
     * Starts camera dragging when vehicle controls are active.
     *
     * @param e - Browser input event.
     */
    private handleMouseDown(e: MouseEvent): void {
        if (this.paused) return;
        this.mouse.isDown = true;
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
    }

    /**
     * Ends camera dragging.
     */
    private handleMouseUp(): void {
        this.mouse.isDown = false;
    }

    /**
     * Updates chase or first-person look while dragging and applies the corresponding angular limits.
     *
     * @param e - Browser input event.
     */
    private handleMouseMove(e: MouseEvent): void {
        if (this.mouse.isDown) {
            const deltaX = e.clientX - this.mouse.x;
            const deltaY = e.clientY - this.mouse.y;

            if (this.firstPerson) {
                this.firstPersonYawTarget = THREE.MathUtils.clamp(
                    this.firstPersonYawTarget - deltaX * this.cameraRotateSpeed,
                    -this.firstPersonYawLimit,
                    this.firstPersonYawLimit,
                );
            } else {
                this.cameraAngleTarget -= deltaX * this.cameraRotateSpeed;
                this.cameraPitchTarget = Math.max(
                    this.minPitch,
                    Math.min(
                        this.maxPitch,
                        this.cameraPitchTarget - deltaY * this.cameraPitchSpeed,
                    ),
                );
            }

            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        }
    }

    /**
     * Returns the filtered horizontal camera orbit angle in radians.
     */
    getCameraAngle(): number {
        return this.cameraAngle;
    }

    /**
     * Returns the filtered camera pitch in radians.
     */
    getCameraPitch(): number {
        return this.cameraPitch;
    }

    /**
     * Reports whether first-person view is selected.
     */
    isFirstPerson(): boolean {
        return this.firstPerson;
    }

    /**
     * Returns the filtered cabin look offset in radians.
     */
    getFirstPersonYaw(): number {
        return this.firstPersonYaw;
    }

    /**
     * Filters held controls, brakes before direction changes and starts ignition on throttle demand.
     *
     * @param delta - Elapsed time in seconds.
     */
    update(delta: number): void {
        const touch = useTouchStore();
        if (touch.viewRequested) { this.firstPerson = !this.firstPerson; this.firstPersonYaw = this.firstPersonYawTarget = 0; touch.viewRequested = false; }
        const keys = { ...this.keys, forward: this.keys.forward || !!touch.pressed.KeyW,
            backward: this.keys.backward || !!touch.pressed.KeyS, left: this.keys.left || !!touch.pressed.KeyA,
            right: this.keys.right || !!touch.pressed.KeyD, handbrake: this.keys.handbrake || !!touch.pressed.Space,
            noseDown: this.keys.noseDown || !!touch.pressed.KeyQ,
            noseUp: this.keys.noseUp || !!touch.pressed.KeyE };
        if (this.firstPerson) this.firstPersonYawTarget = THREE.MathUtils.clamp(this.firstPersonYawTarget - touch.lookX * 0.005, -80 * Math.PI / 180, 80 * Math.PI / 180);
        else { this.cameraAngleTarget -= touch.lookX * 0.005; this.cameraPitchTarget = THREE.MathUtils.clamp(this.cameraPitchTarget + touch.lookY * 0.005, 0.05, 1.3); }
        touch.lookX = touch.lookY = 0;
        // Smooth camera angles to reduce jank
        this.cameraAngle = THREE.MathUtils.damp(
            this.cameraAngle,
            this.cameraAngleTarget,
            this.cameraSmoothRate,
            delta,
        );
        this.cameraPitch = THREE.MathUtils.damp(
            this.cameraPitch,
            this.cameraPitchTarget,
            this.cameraSmoothRate,
            delta,
        );
        this.firstPersonYaw = THREE.MathUtils.damp(
            this.firstPersonYaw,
            this.firstPersonYawTarget,
            this.cameraSmoothRate,
            delta,
        );
        // Throttle with smoother input response
        const speed = this.car.getSpeed();
        const opposingPedals = keys.forward && keys.backward;
        const desiredDirection = opposingPedals ? 0 : keys.forward ? 1 : keys.backward ? -1 : 0;
        if (desiredDirection !== this.requestedDirection) {
            this.requestedDirection = desiredDirection;
            this.directionEngaged = false;
        }
        // Brake genuine opposite travel, then latch the requested gear near standstill.
        // Hill rollback must not repeatedly cancel throttle while it is building up.
        if (desiredDirection && speed * desiredDirection >= -1) this.directionEngaged = true;
        const changingDirection = desiredDirection !== 0 && !this.directionEngaged;
        const handbrake = keys.brake || keys.handbrake;
        let targetThrottle = 0;
        if (this.focused && !changingDirection && !opposingPedals && !handbrake) {
            if (keys.forward) {
                targetThrottle = 1;
            } else if (keys.backward) {
                targetThrottle = -1; // Reverse throttle
            }
        }

        // S/Down brakes forward travel before engaging reverse; W/Up brakes reverse travel.
        const targetBrake = changingDirection || opposingPedals ? 1 : 0;

        if (targetThrottle !== 0 && this.car.getEngineState() === "off") this.toggleIgnition(true);

        // Smooth throttle and brake
        const throttleRate =
            targetThrottle > this.throttleInput ? this.throttleRiseRate : this.throttleFallRate;
        this.throttleInput =
            targetBrake || handbrake
                ? 0
                : THREE.MathUtils.damp(this.throttleInput, targetThrottle, throttleRate, delta);
        this.brakeInput = targetBrake;

        // Steering input (speed-dependent)
        const rawSteer = (keys.left ? 1 : 0) + (keys.right ? -1 : 0);

        const targetSteer = rawSteer;
        const reversingSteer = targetSteer * this.steeringInput < 0;
        const steerRate = reversingSteer
            ? this.steerReturnRate
            : Math.abs(targetSteer) > Math.abs(this.steeringInput)
              ? this.steerRate
              : this.steerReturnRate;
        this.steeringInput = THREE.MathUtils.damp(
            this.steeringInput,
            targetSteer,
            steerRate,
            delta,
        );

        this.car.setThrottle(this.throttleInput);
        this.car.setBrake(this.brakeInput);
        this.car.setSteering(this.steeringInput * this.car.maxSteeringAngle);

        // Space holds the handbrake; Q/E are reserved for airborne pitch.
        this.car.setHandbrake(handbrake);

        // Airborne attitude control does not add propulsion.
        this.car.setPitch(Number(keys.noseDown) - Number(keys.noseUp));
    }

    /**
     * Updates engine tones from telemetry and plays accumulated collision effects.
     *
     * @param delta - Elapsed time in seconds.
     */
    updateAudio(delta: number): void {
        const settings = useSettingsStore();
        this.engineSoundGenerator.setVolume(settings.engineVolume);
        this.roadSoundGenerator.setVolume(settings.effectsVolume);
        this.soundCooldown = Math.max(0, this.soundCooldown - delta);
        const enabled =
            this.audioUnlocked && this.soundManager.getEnabled() && this.focused && !this.paused;
        const running = this.car.getEngineState() === "running";
        this.engineSoundGenerator.setEnabled(enabled && running);
        this.roadSoundGenerator.setEnabled(enabled);
        this.roadSoundGenerator.setHorn(enabled && (this.hornPressed || !!useTouchStore().pressed.KeyH));
        const impact = this.car.consumeImpact();
        if (!enabled) return;
        const speed = Math.abs(this.car.getSpeed());
        const throttle = Math.abs(this.throttleInput);
        if (running) {
            this.engineSoundGenerator.start();
            this.engineSoundGenerator.update(speed, throttle, throttle > 0.1, delta);
        }
        if (impact > this.car.config.audio.impactThreshold && this.soundCooldown === 0) {
            this.roadSoundGenerator.playImpact(Math.min(1, impact / 45));
            this.soundCooldown = 0.25 + Math.min(0.3, impact / 120);
        }
    }

    /**
     * Attempts to resume audio contexts following a browser user gesture.
     */
    /** Resumes vehicle audio synchronously from a touch gesture. */
    unlockTouchAudio(): void { this.unlockAudio(); }

    private unlockAudio(): void {
        this.roadSoundGenerator.setVolume(useSettingsStore().effectsVolume);
        this.audioUnlocked = true;
        this.engineSoundGenerator.unlock();
        this.roadSoundGenerator.setEnabled(this.soundManager.getEnabled());
        this.roadSoundGenerator.start();
    }
    /**
     * Toggles ignition between starting and off; the controls wrapper also coordinates ignition audio.
     */
    toggleIgnition(preserveInput = false): void {
        if (this.paused) return;
        if (!preserveInput) this.resetInput();
        this.silenceAudio();
        const state = this.car.toggleIgnition();
        if (state === "starting") {
            this.unlockAudio();
            this.roadSoundGenerator.playIgnition();
        }
    }
    /**
     * Returns current engine speed in revolutions per minute.
     */
    getRPM(): number {
        return this.car.getRPM();
    }
    /**
     * Stops vehicle audio output.
     */
    silenceAudio(): void {
        this.engineSoundGenerator.stop();
        this.roadSoundGenerator.stop();
    }
    /**
     * Pauses or resumes control processing and clears held input as required.
     *
     * @param paused - Whether control processing is paused.
     */
    setPaused(paused: boolean): void {
        this.paused = paused;
        this.resetInput();
        if (paused) this.silenceAudio();
    }

    /**
     * Clears held keys and filtered values and releases vehicle control requests.
     */
    resetInput(): void {
        this.requestedDirection = 0;
        this.directionEngaged = false;
        this.hornPressed = false;
        this.roadSoundGenerator.setHorn(false);
        useTouchStore().reset();
        for (const key of Object.keys(this.keys) as Array<keyof InputState>) this.keys[key] = false;
        this.throttleInput = this.brakeInput = this.steeringInput = 0;
        this.mouse.isDown = false;
        this.car.setThrottle(0);
        this.car.setBrake(0);
        this.car.setSteering(0);
        this.car.setPitch(0);
        this.car.setHandbrake(false);
    }

    /**
     * Clears held input when the browser loses focus.
     */
    private handleBlur = (): void => {
        this.focused = false;
        this.resetInput();
        this.engineSoundGenerator.stop();
        this.roadSoundGenerator.stop();
    };
    /**
     * Restores the control focus state.
     */
    private handleFocus = (): void => {
        this.focused = !document.hidden;
    };
    /**
     * Clears stale input or frame timing when browser visibility changes.
     */
    private handleVisibility = (): void => {
        if (document.hidden) this.handleBlur();
        else this.handleFocus();
    };

    /**
     * Releases owned resources and unregisters scene objects, browser listeners or audio nodes as applicable.
     */
    dispose(): void {
        // Stop and dispose procedural engine sound
        if (this.engineSoundGenerator) {
            this.engineSoundGenerator.dispose();
        }
        if (this.roadSoundGenerator) {
            this.roadSoundGenerator.dispose();
        }

        window.removeEventListener("blur", this.handleBlur);
        window.removeEventListener("focus", this.handleFocus);
        document.removeEventListener("visibilitychange", this.handleVisibility);
        document.removeEventListener("keydown", this.keyDownHandler);
        document.removeEventListener("keyup", this.keyUpHandler);
        document.removeEventListener("mouseup", this.mouseUpHandler);
        this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
        this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
        this.canvas.removeEventListener("wheel", this.wheelHandler);
        this.canvas.removeEventListener("contextmenu", this.contextMenuHandler);
    }
}
