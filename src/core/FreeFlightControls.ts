import { useTouchStore } from "@/stores/touch";
/**
 * FreeFlightControls types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";

/** Independent, collision-free camera input; inactive during driving or modal pause. */
export class FreeFlightControls {
    enabled = false;
    paused = false;
    private keys = new Set<string>();
    private dragging = false;
    private yaw = 0;
    private pitch = 0;
    private speed = 30;
    private lastX = 0;
    private lastY = 0;
    private forward = new THREE.Vector3();
    private right = new THREE.Vector3();
    private movement = new THREE.Vector3();
    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param camera - Camera controlled or followed by this operation.
     * @param canvas - Canvas receiving pointer input.
     */
    constructor(
        private camera: THREE.PerspectiveCamera,
        private canvas: HTMLCanvasElement,
    ) {
        document.addEventListener("keydown", this.keyDown);
        document.addEventListener("keyup", this.keyUp);
        canvas.addEventListener("mousedown", this.mouseDown);
        document.addEventListener("mousemove", this.mouseMove);
        document.addEventListener("mouseup", this.resetMouse);
        canvas.addEventListener("wheel", this.wheel, { passive: false });
        window.addEventListener("blur", this.reset);
        document.addEventListener("visibilitychange", this.visibility);
    }
    /**
     * Enables or disables this subsystem and synchronizes its input or playback state.
     *
     * @param enabled - Whether this subsystem is enabled.
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.reset();
        const angles = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
        this.yaw = angles.y;
        this.pitch = angles.x;
        if (enabled) {
            this.canvas.tabIndex = 0;
            this.canvas.focus();
        }
    }
    /**
     * Pauses or resumes control processing and clears held input as required.
     *
     * @param paused - Whether control processing is paused.
     */
    setPaused(paused: boolean): void {
        this.paused = paused;
        this.reset();
    }
    /**
     * Records a held flight key when controls are active and the event is not targeting text input.
     *
     * @param e - Browser input event.
     */
    private keyDown = (e: KeyboardEvent) => {
        if (
            !this.enabled ||
            this.paused ||
            e.ctrlKey ||
            e.metaKey ||
            e.altKey ||
            (e.target as HTMLElement)?.matches('input,textarea,select,[contenteditable="true"]')
        )
            return;
        const key = e.key.toLowerCase();
        if (key === " " && (e.target as HTMLElement)?.matches("button")) return;
        if (
            [
                "w",
                "a",
                "s",
                "d",
                "arrowup",
                "arrowdown",
                "arrowleft",
                "arrowright",
                " ",
                "e",
                "q",
                "shift",
            ].includes(key)
        ) {
            e.preventDefault();
            this.keys.add(key);
        }
    };
    /**
     * Releases a held flight key.
     *
     * @param e - Browser input event.
     */
    private keyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.key.toLowerCase());
    };
    /**
     * Starts pointer-drag look when free-flight controls are active.
     *
     * @param e - Browser input event.
     */
    private mouseDown = (e: MouseEvent) => {
        if (!this.enabled || this.paused || e.button !== 0) return;
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
    };
    /**
     * Updates flight yaw and bounded pitch while pointer dragging is active.
     *
     * @param e - Browser input event.
     */
    private mouseMove = (e: MouseEvent) => {
        if (!this.enabled || this.paused || !this.dragging) return;
        this.yaw -= (e.clientX - this.lastX) * 0.003;
        this.pitch = THREE.MathUtils.clamp(
            this.pitch - (e.clientY - this.lastY) * 0.003,
            -Math.PI / 2 + 0.02,
            Math.PI / 2 - 0.02,
        );
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
    };
    /**
     * Adjusts free-flight speed within the configured range.
     *
     * @param e - Browser input event.
     */
    private wheel = (e: WheelEvent) => {
        if (!this.enabled || this.paused) return;
        e.preventDefault();
        this.speed = THREE.MathUtils.clamp(this.speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 3, 200);
    };
    /**
     * Ends pointer-drag look.
     */
    private resetMouse = () => {
        this.dragging = false;
    };
    /**
     * Clears transient input or simulation state without reconstructing the instance.
     */
    private reset = () => {
        this.keys.clear();
        this.dragging = false;
        useTouchStore().reset();
    };
    /**
     * Clears flight input when the document is hidden.
     */
    private visibility = () => {
        if (document.hidden) this.reset();
    };
    /**
     * Moves the flight camera from held keys and elapsed seconds, supporting vertical motion and a speed multiplier.
     *
     * @param delta - Elapsed time in seconds.
     */
    update(delta: number): void {
        const touch = useTouchStore();
        if (this.enabled && !this.paused) { this.yaw -= touch.lookX * 0.005; this.pitch = THREE.MathUtils.clamp(this.pitch - touch.lookY * 0.005, -1.55, 1.55); touch.lookX = touch.lookY = 0; }
        if (!this.enabled || this.paused || document.hidden || delta > 0.25) return;
        /**
         * Reports whether any supplied keyboard code is currently held.
         *
         * @param keys - Keyboard codes to query.
         */
        const codes: Record<string, string> = { w: 'KeyW', s: 'KeyS', a: 'KeyA', d: 'KeyD', q: 'KeyQ', e: 'Space', ' ': 'Space', shift: 'ShiftLeft' };
        const held = (...keys: string[]) => (keys.some(key => this.keys.has(key) || touch.pressed[codes[key]]) ? 1 : 0);
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
        this.camera.getWorldDirection(this.forward);
        this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this.movement
            .copy(this.forward)
            .multiplyScalar(held("w", "arrowup") - held("s", "arrowdown"));
        this.movement.addScaledVector(this.right, held("d", "arrowright") - held("a", "arrowleft"));
        this.movement.y += held(" ", "e") - held("q");
        if (this.movement.lengthSq() > 0)
            this.camera.position.addScaledVector(
                this.movement.normalize(),
                this.speed * (held("shift") ? 3 : 1) * Math.min(delta, 0.1),
            );
    }
    /**
     * Releases owned resources and unregisters scene objects, browser listeners or audio nodes as applicable.
     */
    dispose(): void {
        this.setEnabled(false);
        document.removeEventListener("keydown", this.keyDown);
        document.removeEventListener("keyup", this.keyUp);
        this.canvas.removeEventListener("mousedown", this.mouseDown);
        document.removeEventListener("mousemove", this.mouseMove);
        document.removeEventListener("mouseup", this.resetMouse);
        this.canvas.removeEventListener("wheel", this.wheel);
        window.removeEventListener("blur", this.reset);
        document.removeEventListener("visibilitychange", this.visibility);
    }
}
