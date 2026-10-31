<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import * as THREE from "three";
import { Car } from "@/core/vehicle/Car";
import type { VehicleConfig } from "@/core/vehicle/VehicleConfig";

const props = defineProps<{ vehicle: VehicleConfig }>();
const host = ref<HTMLElement | null>(null);
const loading = ref(true);
const error = ref(false);
let car: Car | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let observer: ResizeObserver | null = null;
let frame = 0;
let disposed = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);

/** Fits the preview to its card without changing the model's configured scale. */
function resize(): void {
    if (!host.value || !renderer) return;
    const width = host.value.clientWidth, height = host.value.clientHeight;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}
/** Slowly rotates the showroom view unless reduced motion was requested. */
function render(): void {
    if (disposed || !renderer) return;
    frame = requestAnimationFrame(render);
    if (document.hidden) return;
    const angle = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.65 : performance.now() * 0.00012;
    camera.position.set(Math.sin(angle) * 8, 3.3, Math.cos(angle) * 8);
    camera.lookAt(0, 0.8, 0);
    renderer.render(scene, camera);
}

onMounted(async () => {
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        host.value!.appendChild(renderer.domElement);
        scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x746b53, 3));
        const light = new THREE.DirectionalLight(0xffebcd, 4);
        light.position.set(4, 7, 5); scene.add(light);
        car = new Car(scene, props.vehicle);
        observer = new ResizeObserver(resize); observer.observe(host.value!);
        resize(); render();
        await car.ready;
        if (!disposed) { car.setPosition(0, 0, 0, false); car.setRotation(0); loading.value = false; }
    } catch { if (!disposed) { error.value = true; loading.value = false; } }
});
onUnmounted(() => {
    disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); car?.dispose();
    renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
});
</script>

<template>
    <div ref="host" class="vehicle-preview" aria-hidden="true">
        <span v-if="loading">Loading model…</span>
        <span v-if="error">Preview unavailable</span>
    </div>
</template>

<style scoped>
.vehicle-preview { height: 220px; position: relative; overflow: hidden; }
.vehicle-preview :deep(canvas) { display: block; width: 100%; height: 100%; }
span { position: absolute; inset: auto 0 16px; text-align: center; color: #bdcec4; font-size: 14px; }
</style>
