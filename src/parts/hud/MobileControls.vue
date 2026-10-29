<script setup lang="ts">
import { useSimulatorStore } from "@/stores/simulator";
import { computed, onMounted, onUnmounted } from "vue";
import { useTouchStore } from "@/stores/touch";
import { useStateStore } from "@/stores/state";

const simulator = useSimulatorStore();
const touch = useTouchStore();
const state = useStateStore();
const pointers = new Map<number, string>();
const lookPointers = new Map<number, { x: number; y: number }>();

const controls = computed(() =>
    state.creativeMode
        ? [
              ["KeyW", "Forward"],
              ["KeyS", "Back"],
              ["Space", "Up"],
              ["KeyQ", "Down"],
              ["ShiftLeft", "Fast"],
          ]
        : [
              ["KeyS", "Brake / R"],
              ["KeyW", "Gas"],
              ["Space", "Handbrake"],
              ["ShiftLeft", "Boost"],
          ],
);

const down = (e: PointerEvent, key: string) => {
    simulator.unlockTouchAudio();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, key);
    touch.pressed[key] = true;
};

const up = (e: PointerEvent) => {
    const key = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (key) touch.pressed[key] = [...pointers.values()].includes(key);
    lookPointers.delete(e.pointerId);
};

const lookDown = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
};

const lookMove = (e: PointerEvent) => {
    const last = lookPointers.get(e.pointerId);
    if (!last) return;
    touch.lookX += e.clientX - last.x;
    touch.lookY += e.clientY - last.y;
    last.x = e.clientX;
    last.y = e.clientY;
};

const reset = () => {
    pointers.clear();
    lookPointers.clear();
    touch.reset();
};

onMounted(() => {
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
});

onUnmounted(() => {
    reset();
    window.removeEventListener("blur", reset);
    document.removeEventListener("visibilitychange", reset);
});
</script>
<template>
    <div class="wander-secondary mobile-controls" aria-label="Touch controls">
        <div class="steering">
            <button class="wander-button compact"
                v-for="[key, label] in [
                    ['KeyA', '←'],
                    ['KeyD', '→'],
                ]"
                :key="key"
                :aria-label="label === '←' ? 'Steer left' : 'Steer right'"
                :class="{ held: touch.pressed[key] }"
                @pointerdown="down($event, key)"
                @pointerup="up"
                @pointercancel="up"
                @lostpointercapture="up"
            >
                {{ label }}
            </button>
        </div>
        <button
            v-if="!state.creativeMode"
            class="wander-button compact horn-button"
            aria-label="Horn (hold)"
            :class="{ held: touch.pressed.KeyH }"
            @pointerdown="down($event, 'KeyH')"
            @pointerup="up"
            @pointercancel="up"
            @lostpointercapture="up"
        >
            Horn
        </button>
        <button class="wander-button compact recovery-button" aria-label="Reset position when stuck" @click="simulator.resetLocation()">Reset</button>
        <div
            class="wander-panel look-pad"
            aria-label="Drag to look around"
            @pointerdown="lookDown"
            @pointermove="lookMove"
            @pointerup="up"
            @pointercancel="up"
            @lostpointercapture="up"
        >
            Look
        </div>
        <div class="pedals">
            <button
                v-if="!state.creativeMode"
                class="wander-button compact view-button"
                @click="touch.viewRequested = true"
            >
                View</button
            ><button class="wander-button compact"
                v-for="[key, label] in controls"
                :key="key"
                :class="{ held: touch.pressed[key] }"
                @pointerdown="down($event, key)"
                @pointerup="up"
                @pointercancel="up"
                @lostpointercapture="up"
            >
                {{ label }}
            </button>
        </div>
    </div>
</template>
<style scoped>
.mobile-controls {
    display: none;
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 18;
}
.steering,
.pedals,
.look-pad {
    position: absolute;
    pointer-events: auto;
    touch-action: none;
    user-select: none;
}
.steering {
    left: 16px;
    bottom: max(18px, env(safe-area-inset-bottom));
    display: flex;
    gap: 12px;
}
.pedals {
    right: 16px;
    bottom: max(18px, env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: repeat(2, 72px);
    gap: 8px;
}
.mobile-controls button, .look-pad { min-width: 64px; min-height: 58px; font: 600 15px system-ui; }
.steering button {
    font-size: 30px;
}
.look-pad {
    right: 20px;
    bottom: 210px;
    width: 100px;
    height: 65px;
    display: grid;
    place-items: center;
    color: #bdcec4;
}
.horn-button {
    position: absolute;
    left: 16px;
    bottom: 90px;
    pointer-events: auto;
    touch-action: none;
}
.recovery-button { position: absolute; left: 16px; bottom: 155px; pointer-events: auto; touch-action: manipulation; }
.view-button {
    grid-column: 1/-1;
    min-height: 40px;
}
@media (pointer: coarse) {
    .mobile-controls {
        display: block;
    }
}
</style>
