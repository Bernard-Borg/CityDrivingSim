<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { DrivingSimulator } from "./core/DrivingSimulator";
import { SoundManager } from "./utils/SoundManager";
import type { Ref } from "vue";
import Overlay from "./parts/Overlay.vue";
import CitySelection from "./parts/CitySelection.vue";
import { useCitiesStore } from "./stores/cities.ts";
import { useSettingsStore } from "./stores/settings.ts";
import { useStateStore } from "./stores/state.ts";

const canvasContainer: Ref<HTMLElement | null> = ref(null);

const cityStore = useCitiesStore();
const settings = useSettingsStore();
const state = useStateStore();

let simulator: DrivingSimulator | null = null;
let unmounted = false;

const selectCity = async (city: string) => {
    if (state.isLoading && simulator) return;
    state.loadError = "";
    state.showCitySwitcher = false;
    try {
        state.currentCity = city;
        state.showCityMenu = false;
        state.isLoading = true;

        if (simulator) {
            simulator.dispose();
        }

        const savedPos = cityStore.getSavedPosition(city);
        simulator = new DrivingSimulator(canvasContainer.value!);
        simulator.setPerformanceEnabled(state.showPerformance);
        state.performanceHistory = [];
        simulator.onVehicleUpdate(data => { Object.assign(state.vehicle, data); });
        simulator.onPerformanceUpdate(data => {
            state.performanceHistory.push(data);
            while (state.performanceHistory.length && state.performanceHistory[0].timeMs < data.timeMs - 12000) state.performanceHistory.shift();
        });

        // Subscribe to all callbacks
        simulator.onSpeedUpdate((newSpeed: number) => {
            state.speed = newSpeed;
        });

        simulator.onFpsUpdate((newFps: number) => {
            state.fps = newFps;
        });

        simulator.onHeadingUpdate((newHeading: number) => {
            state.heading = newHeading;

            // Normalize angle to 0-360 range
            const normalizeAngle = (angle: number) => {
                while (angle < 0) angle += 360;
                while (angle >= 360) angle -= 360;
                return angle;
            };

            let current = normalizeAngle(state.displayedHeading);
            let target = normalizeAngle(newHeading);

            // Handle wrap-around (e.g., going from 359° to 1° should go the short way)
            let diff = target - current;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            // Update displayed heading (smooth interpolation)
            state.displayedHeading = normalizeAngle(current + diff);
        });

        simulator.onBoostUpdate((newBoost: number) => {
            state.boostAmount = newBoost;
        });

        simulator.onCoordinateUpdate((lat: number, lon: number) => {
            state.coordinates = { lat, lon };
        });

        simulator.onLoadComplete(() => {
            state.isLoading = false;
            // Initialize street names visibility state
            if (simulator) {
                simulator.setLabelsVisible(settings.showStreetNames);
            }
        });

        await simulator.init(
            city,
            savedPos
                ? { lat: savedPos.lat, lon: savedPos.lon, y: savedPos.y }
                : undefined,
        );
        if (!unmounted) {
            cityStore.selectedCity = city;
            simulator.setLabelsVisible(settings.showStreetNames);
        }
    } catch (error) {
        simulator?.dispose();
        simulator = null;
        if (!unmounted)
            state.loadError =
                error instanceof Error
                    ? error.message
                    : "City or vehicle data could not be loaded.";
    } finally {
        if (!unmounted) state.isLoading = false;
    }
};

const toggleStreetNames = () => {
    if (simulator) {
        settings.showStreetNames = !settings.showStreetNames;
        simulator.setLabelsVisible(settings.showStreetNames);
    }
};

onMounted(async () => {
    if (!canvasContainer.value) return;

    const soundManager = SoundManager.getInstance();
    soundManager.setEnabled(!settings.isSoundMuted);

    await cityStore.loadCities();

    if (
        cityStore.selectedCity &&
        cityStore.availableCities.includes(cityStore.selectedCity)
    ) {
        // Load saved city
        await selectCity(cityStore.selectedCity);
    } else {
        // Show city selection menu
        state.showCityMenu = true;
        state.isLoading = false;
    }
});

onUnmounted(() => {
    unmounted = true;
    if (simulator) {
        simulator.dispose();
    }
});
</script>

<template>
    <div class="relative w-screen h-screen overflow-hidden">
        <!-- Three.js Canvas Container -->
        <div ref="canvasContainer" class="absolute inset-0"></div>

        <CitySelection v-if="state.showCityMenu" @citySelected="selectCity" />

        <Overlay
            @citySelected="selectCity"
            @toggleStreetNames="toggleStreetNames"
            @resetLocation="simulator && simulator.resetCarPosition()"
            @toggleIgnition="simulator?.toggleIgnition()"
            @pauseChanged="simulator?.setPaused($event)"
            @performanceChanged="simulator?.setPerformanceEnabled($event)"
        />

        <div
            v-if="state.loadError"
            role="alert"
            class="absolute inset-0 z-50 flex items-center justify-center bg-black/90"
        >
            <div
                class="max-w-md rounded-xl bg-gray-900 p-8 text-center text-white"
            >
                <h2 class="mb-3 text-2xl font-bold">Unable to start driving</h2>
                <p class="mb-6 text-gray-300">{{ state.loadError }}</p>
                <button
                    class="mr-3 rounded-lg bg-blue-600 px-5 py-3"
                    @click="selectCity(state.currentCity!)"
                >
                    Retry
                </button>
                <button
                    class="rounded-lg bg-gray-700 px-5 py-3"
                    @click="
                        state.loadError = '';
                        state.showCityMenu = true;
                    "
                >
                    Choose city
                </button>
            </div>
        </div>

        <!-- Loading Screen -->
        <div
            v-if="state.isLoading"
            class="absolute inset-0 z-50 flex items-center justify-center bg-black/80"
        >
            <div class="text-white text-2xl">
                Loading City Map ({{ state.currentCity }})...
            </div>
        </div>
    </div>
</template>
