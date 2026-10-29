<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useSettingsStore } from "@/stores/settings";
import { useRadioStore } from "@/stores/radio";
import { useStateStore } from "@/stores/state";
import VehicleInstruments from "./hud/VehicleInstruments.vue";
import NavigationCompass from "./hud/NavigationCompass.vue";
import HudActions from "./hud/HudActions.vue";
import ControlsHelp from "./hud/ControlsHelp.vue";
import LocationSearch from "./hud/LocationSearch.vue";
import Settings from "./hud/Settings.vue";
import MobileControls from "./hud/MobileControls.vue";
import { useSimulatorStore } from "@/stores/simulator";
import PerformancePanel from "./hud/PerformancePanel.vue";

const state = useStateStore();
const radio = useRadioStore();
const settings = useSettingsStore();
const simulator = useSimulatorStore();

const help = ref<InstanceType<typeof ControlsHelp> | null>(null);
const actions = ref<InstanceType<typeof HudActions> | null>(null);

const playing = computed(() => !state.showMainMenu && !state.showCityMenu && !state.isLoading && !state.loadError);

const onKey = (e: KeyboardEvent) => {
    if (
        !playing.value ||
        (e.target as HTMLElement)?.matches('input,textarea,select,[contenteditable="true"]')
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
        simulator.setCreativeMode(!state.creativeMode);
    }
    if (
        e.key.toLowerCase() === "r" && !e.repeat &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        !simulator.isPaused && !state.creativeMode
    ) {
        e.preventDefault();
        radio.toggle();
    }
    if (e.key === "Delete" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !simulator.isPaused) {
        e.preventDefault();
        simulator.resetLocation();
    }
    if (e.key === "F3") {
        e.preventDefault();
        if (!e.repeat) simulator.togglePerformance();
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
        <NavigationCompass v-if="settings.showCompass" />
        <Settings />
        <MobileControls v-if="!simulator.isPaused" />
        <VehicleInstruments v-if="settings.showSpeedometer && !state.creativeMode" />
        <HudActions ref="actions" @help="help?.open()" />
        <PerformancePanel v-if="state.showPerformance" @close="simulator.togglePerformance" />
    </template>
    <div v-if="!playing || !state.showPerformance" class="absolute flex gap-3 top-5 right-5 z-10">
        <LocationSearch v-if="settings.showSearch" />
        <div
            class="bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border flex items-center max-h-12 border-white/20"
        >
            <div class="text-sm text-gray-300">
                <span class="text-white font-bold">{{ state.fps }}</span> FPS
            </div>
        </div>
    </div>
    <ControlsHelp ref="help" @closed="actions?.focusHelp()" />
</template>
