<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useStateStore } from "@/stores/state";
import VehicleInstruments from "./hud/VehicleInstruments.vue";
import NavigationCompass from "./hud/NavigationCompass.vue";
import HudActions from "./hud/HudActions.vue";
import ControlsHelp from "./hud/ControlsHelp.vue";
import PerformancePanel from "./hud/PerformancePanel.vue";

const state = useStateStore();

const help = ref<InstanceType<typeof ControlsHelp> | null>(null);
const actions = ref<InstanceType<typeof HudActions> | null>(null);

const playing = computed(
    () => !state.showCityMenu && !state.isLoading && !state.loadError,
);

const emit = defineEmits<{
    (e: "toggleStreetNames"): void;
    (e: "resetLocation"): void;
    (e: "citySelected", city: string): void;
    (e: "toggleIgnition"): void;
    (e: "creativeChanged", enabled: boolean): void;
    (e: "pauseChanged", paused: boolean): void;
    (e: "performanceChanged", enabled: boolean): void;
}>();

const togglePerformance = () => {
    state.showPerformance = !state.showPerformance;
    if (state.showPerformance) state.performanceHistory = [];
    emit("performanceChanged", state.showPerformance);
};

const onKey = (e: KeyboardEvent) => {
    if (
        !playing.value ||
        (e.target as HTMLElement)?.matches(
            'input,textarea,select,[contenteditable="true"]',
        )
    )
        return;
    if (
        e.key.toLowerCase() === "c" &&
        !e.repeat &&
        !help.value?.isOpen() &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
    ) {
        e.preventDefault();
        emit("creativeChanged", !state.creativeMode);
    }
    if (e.key === "F3") {
        e.preventDefault();
        if (!e.repeat) togglePerformance();
    }
    if (e.key === "?" && !help.value?.isOpen()) {
        e.preventDefault();
        help.value?.open();
    }
};

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>
<template>
    <template v-if="playing">
        <NavigationCompass />
        <VehicleInstruments v-if="!state.creativeMode" />
        <HudActions
            ref="actions"
            @creative-changed="emit('creativeChanged', $event)"
            @help="help?.open()"
            @performance="togglePerformance"
            @toggle-ignition="emit('toggleIgnition')"
            @reset-location="emit('resetLocation')"
            @toggle-street-names="emit('toggleStreetNames')"
            @city-selected="emit('citySelected', $event)"
        />
        <PerformancePanel
            v-if="state.showPerformance"
            @close="togglePerformance"
        />
    </template>
    <div
        v-if="!playing || !state.showPerformance"
        class="absolute top-5 right-5 z-10"
    >
        <div
            class="bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/20"
        >
            <div class="text-sm text-gray-300">
                <span class="text-white font-bold">{{ state.fps }}</span> FPS
            </div>
        </div>
    </div>
    <ControlsHelp
        ref="help"
        @pause-changed="emit('pauseChanged', $event)"
        @closed="actions?.focusHelp()"
    />
</template>
