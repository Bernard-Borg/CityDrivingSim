<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { DrivingSimulator } from "./core/DrivingSimulator";
import { SoundManager } from "./utils/SoundManager";
import type { Ref } from "vue";
import { useVehiclesStore } from "./stores/vehicles";
import { VEHICLES, DEFAULT_VEHICLE } from "./core/vehicle/VehicleConfig";
import Overlay from "./parts/Overlay.vue";
import CitySelection from "./parts/CitySelection.vue";
import LoadingScreen from "./parts/LoadingScreen.vue";
import { useNavigationStore } from "./stores/navigation";
import type { MapLocation } from "./core/LocationSearch";
import { useLoadingStore } from "./stores/loading";
import { useCitiesStore } from "./stores/cities.ts";
import { useSettingsStore } from "./stores/settings.ts";
import { useStateStore } from "./stores/state.ts";

const attributionUrl = `${import.meta.env.BASE_URL}attribution.html`;

const canvasContainer: Ref<HTMLElement | null> = ref(null);

const cityStore = useCitiesStore();
const settings = useSettingsStore();
const state = useStateStore();
const loading = useLoadingStore();
const navigation = useNavigationStore();
const vehicles = useVehiclesStore();

let simulator: DrivingSimulator | null = null;
let unmounted = false;

const selectCity = async (city: string, resetElevation = false) => {
    if (state.isLoading && simulator) return;
    state.loadError = "";
    state.showCitySwitcher = false;
    try {
        navigation.query = "";
        navigation.results = [];
        navigation.error = "";
        state.currentCity = city;
        state.showCityMenu = false;
        state.isLoading = true;
        loading.begin();
        await loading.stage("Preparing renderer");

        if (simulator) {
            simulator.dispose();
        }

        const savedPos = cityStore.getSavedPosition(city);
        simulator = new DrivingSimulator(
            canvasContainer.value!,
            VEHICLES[vehicles.selectedId] ?? DEFAULT_VEHICLE,
        );
        simulator.setPerformanceEnabled(state.showPerformance);
        simulator.setGraphics(settings.shadowsEnabled, settings.renderScale);
        state.performanceHistory = [];
        simulator.onVehicleUpdate((data) => {
            Object.assign(state.vehicle, data);
        });
        simulator.onPerformanceUpdate((data) => {
            state.performanceHistory.push(data);
            while (
                state.performanceHistory.length &&
                state.performanceHistory[0].timeMs < data.timeMs - 12000
            )
                state.performanceHistory.shift();
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
            savedPos ? { lat: savedPos.lat, lon: savedPos.lon, y: resetElevation ? undefined : savedPos.y } : undefined,
        );
        loading.finish();
        if (!unmounted) {
            cityStore.selectedCity = city;
            simulator.setLabelsVisible(settings.showStreetNames);
        }
    } catch (error) {
        loading.finish();
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

const searchLocations = (query: string) => {
    navigation.error = "";
    try {
        navigation.results = simulator?.searchLocations(query) ?? [];
    } catch (error) {
        navigation.results = [];
        navigation.error = error instanceof Error ? error.message : "Unable to search this map.";
    }
};
const teleport = (location: MapLocation) => {
    try {
        simulator?.teleportTo(location);
        navigation.error = "";
    } catch (error) {
        navigation.error = error instanceof Error ? error.message : "Unable to teleport.";
    }
};
const switchVehicle = async (id: string) => {
    if (!simulator || vehicles.switching || !VEHICLES[id]) return;
    vehicles.switching = true;
    vehicles.error = "";
    try {
        if (await simulator.switchVehicle(VEHICLES[id])) vehicles.selectedId = id;
    } catch (error) {
        vehicles.error = error instanceof Error ? error.message : "Unable to load this vehicle.";
    } finally {
        vehicles.switching = false;
    }
};
const applyTerrain = () => {
    if (state.currentCity && !state.isLoading) void selectCity(state.currentCity, true);
};
const applyGraphics = () => simulator?.setGraphics(settings.shadowsEnabled, settings.renderScale);

onMounted(async () => {
    if (!canvasContainer.value) return;

    const soundManager = SoundManager.getInstance();
    soundManager.setEnabled(!settings.isSoundMuted);

    loading.begin();
    await loading.stage("Finding available cities");
    await cityStore.loadCities();

    if (cityStore.selectedCity && cityStore.availableCities.includes(cityStore.selectedCity)) {
        // Load saved city
        await selectCity(cityStore.selectedCity);
    } else {
        // Show city selection menu
        loading.finish();
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
            @vehicleSelected="switchVehicle"
            @search="searchLocations"
            @teleport="teleport"
            @graphicsChanged="applyGraphics"
            @terrainChanged="applyTerrain"
            @touchGesture="simulator?.unlockTouchAudio()"
            @citySelected="selectCity"
            @toggleStreetNames="toggleStreetNames"
            @resetLocation="simulator && simulator.resetCarPosition()"
            @toggleIgnition="simulator?.toggleIgnition()"
            @creativeChanged="simulator?.setCreativeMode($event)"
            @pauseChanged="simulator?.setPaused($event)"
            @performanceChanged="simulator?.setPerformanceEnabled($event)"
        />

        <div
            v-if="state.loadError"
            role="alert"
            class="absolute inset-0 z-50 flex items-center justify-center bg-black/90"
        >
            <div class="max-w-md rounded-xl bg-gray-900 p-8 text-center text-white">
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

        <LoadingScreen v-if="state.isLoading" />
        <footer class="attribution-links">
            <a :href="attributionUrl" target="_blank" rel="noopener noreferrer"
                >Attribution &amp; licenses</a
            >
        </footer>
    </div>
</template>

<style scoped>
.attribution-links {
    position: absolute;
    bottom: max(2px, env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    padding: 3px 9px;
    border-radius: 5px;
    background: #101d20ed;
    color: #dce8e1;
    font: 12px/1.5 system-ui;
    white-space: nowrap;
}
.attribution-links a {
    text-decoration: underline;
    text-underline-offset: 2px;
}
@media (max-width: 420px) {
    .attribution-links {
        font-size: 10px;
    }
}
</style>
