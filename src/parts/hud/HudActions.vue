<script setup lang="ts">
import { useSimulatorStore } from "@/stores/simulator";
import { ref } from "vue";
import { useStateStore } from "@/stores/state";
import { useSettingsStore } from "@/stores/settings";
import { useCitiesStore } from "@/stores/cities";
import CarRadio from "./CarRadio.vue";
import VehicleSelector from "./VehicleSelector.vue";
import HudIcon from "./HudIcon.vue";

const simulator = useSimulatorStore();
const state = useStateStore();
const settings = useSettingsStore();
const cityStore = useCitiesStore();

const helpButton = ref<HTMLButtonElement | null>(null);

const emit = defineEmits<{ (e: "help"): void }>();

const openHelp = () => emit("help");

const switchCity = (city: string) => {
    state.showCitySwitcher = false;
    if (city !== state.currentCity) void simulator.selectCity(city);
};

defineExpose({ focusHelp: () => helpButton.value?.focus() });
</script>
<template>
    <div class="wander-secondary hud-tools">
        <div class="utility-row">
            <button
                ref="helpButton"
                class="wander-button compact hud-button icon-button"
                aria-label="Open controls help"
                title="Controls (?)"
                @click="openHelp"
            >
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01" />
                </svg>
            </button>
            <button
                class="wander-button compact hud-button icon-button"
                :class="{ selected: state.showPerformance }"
                aria-label="Toggle performance graphs"
                :aria-pressed="state.showPerformance"
                title="Performance (F3)"
                @click="simulator.togglePerformance"
            >
                <svg viewBox="0 0 24 24">
                    <path d="M4 4v16h17M6 15l4-5 4 3 6-8" />
                </svg>
            </button>
            <button
                v-if="!state.creativeMode"
                class="wander-button compact hud-button ignition-button"
                :class="{ selected: state.vehicle.engine !== 'off' }"
                :aria-label="
                    state.vehicle.engine === 'off' ? 'Start engine' : 'Switch off engine and park'
                "
                @click="simulator.toggleIgnition()"
            >
                <svg viewBox="0 0 24 24">
                    <path d="M12 2v10M6.3 5.3a9 9 0 1 0 11.4 0" /></svg
                ><span>{{
                    state.vehicle.engine === "off"
                        ? "START"
                        : state.vehicle.engine === "starting"
                          ? "CANCEL"
                          : "STOP"
                }}</span>
            </button>
        </div>
        <VehicleSelector />
        <CarRadio v-if="!state.creativeMode" />
        <div class="settings-tools">
            <button
                class="wander-button compact hud-button"
                :class="{ selected: state.creativeMode }"
                :aria-pressed="state.creativeMode"
                title="Toggle creative mode (C)"
                @click="simulator.setCreativeMode(!state.creativeMode)"
            >
                {{ state.creativeMode ? "Drive (C)" : "Fly (C)" }}
            </button>
            <button class="wander-button compact hud-button" @click="simulator.resetLocation()">
                {{ state.creativeMode ? "Reset view" : "Reset location" }}
            </button>
            <button
                class="wander-button compact hud-button"
                :class="{ selected: settings.showStreetNames }"
                :aria-pressed="settings.showStreetNames"
                @click="simulator.toggleStreetNames()"
            >
                Street names
            </button>
            <div class="city-switcher">
                <button
                    class="wander-button compact hud-button"
                    :aria-expanded="state.showCitySwitcher"
                    @click="state.showCitySwitcher = !state.showCitySwitcher"
                >
                    <HudIcon name="city" /><span>Switch city</span>
                </button>
                <div v-if="state.showCitySwitcher" class="wander-panel city-menu">
                    <button
                        class="wander-menu-item"
                        v-for="city in cityStore.availableCities"
                        :key="city"
                        :class="{ selected: city === state.currentCity }"
                        @click="switchCity(city)"
                    >
                        {{ cityStore.getCityName(city) }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
<style scoped>
.hud-tools { position: absolute; right: 20px; bottom: 24px; z-index: 15; width: 228px; display: flex; flex-direction: column; gap: 10px; }
.utility-row { display: flex; gap: 7px; }
.icon-button { width: 44px; padding: 10px; }
.ignition-button { flex: 1; }
.settings-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.settings-tools .hud-button { width: 100%; padding: 10px 6px; font-size: 13px; }
.city-switcher { position: relative; }
.city-menu { position: absolute; bottom: 100%; right: 0; margin-bottom: 9px; min-width: 190px; overflow: hidden; }
@media (max-width: 800px) { .hud-tools { right: 16px; bottom: 230px; width: 214px; } }
@media (max-width: 420px) { .hud-tools { bottom: 210px; } }
@media (pointer: coarse) { .hud-tools { right: 12px; top: 158px; bottom: auto; width: 145px; max-height: 32vh; overflow-y: auto; } .settings-tools .hud-button { font-size: 12px; } }
</style>
