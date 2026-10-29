/** Lightweight animated menu diorama, independent of city terrain generation. @packageDocumentation */
import * as THREE from "three";
import { Car } from "./vehicle/Car";
import type { VehicleConfig } from "./vehicle/VehicleConfig";
import { addMoaiParts } from "./scene/Moai";

/** Renders the selected car and the same procedural moai used by map decor. */
export class MenuScene {
    /** Scene objects owned by this preview. */
    private readonly scene = new THREE.Scene();
    /** Perspective camera slowly orbits the diorama. */
    private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
    /** Renderer released when the menu unmounts. */
    private readonly renderer: THREE.WebGLRenderer;
    /** Statue pivot for its subtle animation. */
    private readonly moai = new THREE.Group();
    /** Actual configured vehicle, with no input handlers or physics loop. */
    private readonly car: Car;
    /** Tracks container resizing independently of the game canvas. */
    private readonly observer: ResizeObserver;
    /** Animation start time. */
    private readonly started = performance.now();
    /** Prevents late model callbacks from using disposed resources. */
    private disposed = false;
    /** Current animation frame identifier. */
    private frame = 0;
    /** Main light used by the shared shadow preference. */
    private readonly sun = new THREE.DirectionalLight(0xffd6a1, 4);
    /** System preference for reduced camera and statue motion. */
    private readonly reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

    /** Creates a small coastal roadside scene without loading any city datasets. */
    constructor(private readonly host: HTMLElement, vehicle: VehicleConfig) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        host.appendChild(this.renderer.domElement);
        this.scene.background = new THREE.Color(0xbacbd0);
        this.scene.fog = new THREE.Fog(0xbacbd0, 32, 95);
        this.scene.add(new THREE.HemisphereLight(0xe5efff, 0x686950, 3));
        this.sun.position.set(-8, 12, 6);
        this.sun.shadow.mapSize.set(1024, 1024);
        Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, far: 45 });
        this.sun.shadow.bias = -0.0005;
        this.scene.add(this.sun);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(22, 64),
            new THREE.MeshStandardMaterial({ color: 0x79876c, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        const ocean = new THREE.Mesh(new THREE.PlaneGeometry(220, 220),
            new THREE.MeshStandardMaterial({ color: 0x386b7e, roughness: 0.65, metalness: 0.15 }));
        ocean.rotation.x = -Math.PI / 2; ocean.position.y = -0.3;
        this.scene.add(ocean);
        const road = new THREE.Mesh(new THREE.PlaneGeometry(6, 48),
            new THREE.MeshStandardMaterial({ color: 0x353c3d, roughness: 0.95 }));
        road.rotation.x = -Math.PI / 2; road.position.set(-0.8, 0.015, 0); road.receiveShadow = true;
        this.scene.add(road);
        const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xeee4bf });
        for (let z = -21; z < 24; z += 5) {
            const dash = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 2.1), lineMaterial);
            dash.position.set(-0.8, 0.03, z); this.scene.add(dash);
        }
        const box = new THREE.BoxGeometry(1, 1, 1);
        const materials = new Map<number, THREE.MeshStandardMaterial>();
        addMoaiParts((color, x, y, z, sx, sy, sz) => {
            let material = materials.get(color);
            if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: 0.95 }); materials.set(color, material); }
            const part = new THREE.Mesh(box, material);
            part.position.set(x, y, z); part.scale.set(sx, sy, sz);
            part.castShadow = part.receiveShadow = true; this.moai.add(part);
        });
        this.moai.scale.setScalar(1.65);
        this.moai.position.set(4.5, 0.02, -1.8);
        this.scene.add(this.moai);
        for (let i = 0; i < 10; i++) {
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0),
                new THREE.MeshStandardMaterial({ color: i % 2 ? 0x7b8173 : 0x94998a, roughness: 1 }));
            const angle = i * 0.62;
            rock.position.set(Math.cos(angle) * 18, -0.3, Math.sin(angle) * 18);
            rock.scale.set(2.2, 0.7 + (i % 3) * 0.5, 1.8);
            rock.castShadow = rock.receiveShadow = true; this.scene.add(rock);
        }
        this.car = new Car(this.scene, vehicle);
        void this.car.ready.then(() => {
            if (this.disposed) return;
            this.car.setPosition(0, 0, 2, false);
            this.car.setRotation(-0.4);
        }).catch(error => { if (!this.disposed) console.warn("Menu vehicle preview could not load", error); });
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(host);
        this.resize();
        this.animate();
    }

    /**
     * Tests a screen-space pointer against the animated statue's actual geometry.
     * @param clientX - Pointer X in viewport CSS pixels.
     * @param clientY - Pointer Y in viewport CSS pixels.
     */
    hitsMoai(clientX: number, clientY: number): boolean {
        if (this.disposed) return false;
        const bounds = this.renderer.domElement.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return false;
        const pointer = new THREE.Vector2(
            ((clientX - bounds.left) / bounds.width) * 2 - 1,
            -((clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        this.camera.updateMatrixWorld();
        this.moai.updateWorldMatrix(true, true);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(pointer, this.camera);
        return ray.intersectObject(this.moai, true).length > 0;
    }

    /** Applies saved graphics settings to the preview as well as gameplay. */
    setGraphics(shadows: boolean, scale: number): void {
        this.renderer.shadowMap.enabled = shadows;
        this.sun.castShadow = shadows;
        this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Number.isFinite(scale) ? Math.max(0.75, scale) : 1));
        this.resize();
    }

    /** Fits the diorama into the right side while leaving space for menu buttons. */
    private resize(): void {
        const width = this.host.clientWidth, height = this.host.clientHeight;
        if (!width || !height) return;
        this.camera.aspect = width / height;
        this.camera.setViewOffset(width, height, width > 700 ? -width * 0.2 : 0, 0, width, height);
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /** Animates the camera and statue, respecting reduced-motion and background tabs. */
    private animate = (): void => {
        if (this.disposed) return;
        this.frame = requestAnimationFrame(this.animate);
        if (document.hidden) return;
        const time = this.reducedMotion.matches ? 0 : (performance.now() - this.started) / 1000;
        const angle = 0.55 + Math.sin(time * 0.065) * 0.14;
        this.camera.position.set(2 + Math.sin(angle) * 15, 5 + Math.sin(time * 0.12) * 0.2, Math.cos(angle) * 15);
        this.camera.lookAt(2, 1.6, 0);
        this.moai.rotation.y = -0.15 + Math.sin(time * 0.45) * 0.13;
        this.moai.rotation.z = Math.sin(time * 0.65) * 0.015;
        this.renderer.render(this.scene, this.camera);
    };

    /** Releases the vehicle, GPU resources, resize observer and animation loop. */
    dispose(): void {
        this.disposed = true;
        cancelAnimationFrame(this.frame);
        this.observer.disconnect();
        this.car.dispose();
        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        this.scene.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            geometries.add(object.geometry);
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        });
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
        this.sun.shadow.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
