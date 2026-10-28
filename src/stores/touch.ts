/** Shared multi-pointer input consumed by vehicle and flight controls. @packageDocumentation */
import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
export const useTouchStore = defineStore('touch', () => {
    const pressed = reactive<Record<string, boolean>>({});
    const lookX = ref(0), lookY = ref(0), viewRequested = ref(false);
    /** Releases held touch controls and queued camera motion. */
    const reset = () => { for (const key of Object.keys(pressed)) delete pressed[key]; lookX.value = lookY.value = 0; viewRequested.value = false; };
    return { pressed, lookX, lookY, viewRequested, reset };
});
