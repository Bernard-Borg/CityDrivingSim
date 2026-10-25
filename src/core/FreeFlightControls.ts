import * as THREE from 'three';

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
    constructor(private camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement) {
        document.addEventListener('keydown', this.keyDown); document.addEventListener('keyup', this.keyUp);
        canvas.addEventListener('mousedown', this.mouseDown); document.addEventListener('mousemove', this.mouseMove);
        document.addEventListener('mouseup', this.resetMouse); canvas.addEventListener('wheel', this.wheel, { passive: false });
        window.addEventListener('blur', this.reset); document.addEventListener('visibilitychange', this.visibility);
    }
    setEnabled(enabled: boolean): void {
        this.enabled = enabled; this.reset();
        const angles = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.yaw = angles.y; this.pitch = angles.x;
        if (enabled) { this.canvas.tabIndex = 0; this.canvas.focus(); }
    }
    setPaused(paused: boolean): void { this.paused = paused; this.reset(); }
    private keyDown = (e: KeyboardEvent) => {
        if (!this.enabled || this.paused || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.matches('input,textarea,select,[contenteditable="true"]')) return;
        const key = e.key.toLowerCase();
        if (key === ' ' && (e.target as HTMLElement)?.matches('button')) return;
        if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','e','q','shift'].includes(key)) { e.preventDefault(); this.keys.add(key); }
    };
    private keyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
    private mouseDown = (e: MouseEvent) => {
        if (!this.enabled || this.paused || e.button !== 0) return;
        this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
    };
    private mouseMove = (e: MouseEvent) => {
        if (!this.enabled || this.paused || !this.dragging) return;
        this.yaw -= (e.clientX - this.lastX) * 0.003;
        this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this.lastY) * 0.003, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
        this.lastX = e.clientX; this.lastY = e.clientY;
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    };
    private wheel = (e: WheelEvent) => {
        if (!this.enabled || this.paused) return;
        e.preventDefault(); this.speed = THREE.MathUtils.clamp(this.speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 3, 200);
    };
    private resetMouse = () => { this.dragging = false; };
    private reset = () => { this.keys.clear(); this.dragging = false; };
    private visibility = () => { if (document.hidden) this.reset(); };
    update(delta: number): void {
        if (!this.enabled || this.paused || document.hidden || delta > 0.25) return;
        const held = (...keys: string[]) => keys.some(key => this.keys.has(key)) ? 1 : 0;
        this.camera.getWorldDirection(this.forward);
        this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this.movement.copy(this.forward).multiplyScalar(held('w','arrowup') - held('s','arrowdown'));
        this.movement.addScaledVector(this.right, held('d','arrowright') - held('a','arrowleft'));
        this.movement.y += held(' ','e') - held('q');
        if (this.movement.lengthSq() > 0) this.camera.position.addScaledVector(this.movement.normalize(), this.speed * (held('shift') ? 3 : 1) * Math.min(delta, 0.1));
    }
    dispose(): void {
        this.setEnabled(false);
        document.removeEventListener('keydown', this.keyDown); document.removeEventListener('keyup', this.keyUp);
        this.canvas.removeEventListener('mousedown', this.mouseDown); document.removeEventListener('mousemove', this.mouseMove);
        document.removeEventListener('mouseup', this.resetMouse); this.canvas.removeEventListener('wheel', this.wheel);
        window.removeEventListener('blur', this.reset); document.removeEventListener('visibilitychange', this.visibility);
    }
}
