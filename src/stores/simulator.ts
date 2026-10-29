/** Owns the simulator lifecycle and the commands shared by UI components. @packageDocumentation */
import { computed, shallowRef, ref } from "vue";
import { defineStore } from "pinia";
import { DrivingSimulator } from "@/core/DrivingSimulator";
import { SoundManager } from "@/utils/SoundManager";
import { VEHICLES, DEFAULT_VEHICLE } from "@/core/vehicle/VehicleConfig";
import type { MapLocation } from "@/core/LocationSearch";
import { useCitiesStore } from "./cities";
import { useSettingsStore } from "./settings";
import { useStateStore } from "./state";
import { useLoadingStore } from "./loading";
import { useNavigationStore } from "./navigation";
import { useVehiclesStore } from "./vehicles";

/** UI surfaces that can independently request a paused simulation. */
export type PauseReason = "help" | "search" | "settings";

/** Central command boundary; Three.js resources are kept outside deep Vue reactivity. */
export const useSimulatorStore = defineStore("simulator", () => {
    const instance = shallowRef<DrivingSimulator | null>(null);
    const pauseReasons = ref(new Set<PauseReason>());
    const isPaused = computed(() => pauseReasons.value.size > 0);
    const cities = useCitiesStore();
    const settings = useSettingsStore();
    const state = useStateStore();
    const loading = useLoadingStore();
    const navigation = useNavigationStore();
    const vehicles = useVehiclesStore();
    const isReady = computed(() => instance.value !== null && !state.isLoading && !state.loadError);
    /** Canvas host owned by the mounted app. */
    let host: HTMLElement | null = null;
    /** Invalidates pending asynchronous lifecycle operations after disposal. */
    let revision = 0;
    /** Prevents overlapping city loads, including the initial renderer preparation. */
    let selecting = false;

    /** Returns a simulator only after loading has completed successfully. */
    const active = () => (isReady.value ? instance.value : null);

    /** Loads a city, preserving saved coordinates and optionally resolving a new surface height. */
    const selectCity = async (city: string, resetElevation = false): Promise<void> => {
        if (!host || selecting) return;
        selecting = true;
        const operation = ++revision;
        const currentHost = host;
        state.loadError = "";
        state.showCitySwitcher = false;
        state.currentCity = city;
        state.showCityMenu = false;
        state.isLoading = true;
        navigation.query = "";
        navigation.results = [];
        navigation.error = "";
        loading.begin();
        try {
            await loading.stage("Preparing renderer");
            if (operation !== revision || host !== currentHost) return;
            instance.value?.dispose();
            instance.value = null;
            const saved = cities.getSavedPosition(city);
            const simulator = new DrivingSimulator(
                currentHost,
                VEHICLES[vehicles.selectedId] ?? DEFAULT_VEHICLE,
            );
            instance.value = simulator;
            simulator.setPerformanceEnabled(state.showPerformance);
            simulator.setGraphics(settings.shadowsEnabled, settings.renderScale);
            state.performanceHistory = [];
            simulator.onVehicleUpdate((data) => {
                if (operation === revision) Object.assign(state.vehicle, data);
            });
            simulator.onPerformanceUpdate((data) => {
                if (operation !== revision) return;
                state.performanceHistory.push(data);
                while (
                    state.performanceHistory.length &&
                    state.performanceHistory[0].timeMs < data.timeMs - 12000
                )
                    state.performanceHistory.shift();
            });
            simulator.onSpeedUpdate((speed) => {
                if (operation === revision) state.speed = speed;
            });
            simulator.onFpsUpdate((fps) => {
                if (operation === revision) state.fps = fps;
            });
            simulator.onHeadingUpdate((heading) => {
                if (operation !== revision) return;
                state.heading = heading;
                state.displayedHeading = ((heading % 360) + 360) % 360;
            });
            simulator.onBoostUpdate((boost) => {
                if (operation === revision) state.boostAmount = boost;
            });
            simulator.onCoordinateUpdate((lat, lon) => {
                if (operation === revision) state.coordinates = { lat, lon };
            });
            await simulator.init(
                city,
                saved
                    ? { lat: saved.lat, lon: saved.lon, y: resetElevation ? undefined : saved.y }
                    : undefined,
            );
            if (operation !== revision) return;
            cities.selectedCity = city;
            simulator.setLabelsVisible(settings.showStreetNames);
            simulator.setPaused(isPaused.value);
        } catch (error) {
            if (operation !== revision) return;
            instance.value?.dispose();
            instance.value = null;
            state.loadError =
                error instanceof Error
                    ? error.message
                    : "City or vehicle data could not be loaded.";
        } finally {
            if (operation === revision) {
                selecting = false;
                state.isLoading = false;
                loading.finish();
            }
        }
    };

    /** Attaches the canvas host and restores the previously selected city, if available. */
    const mount = async (container: HTMLElement): Promise<void> => {
        if (host) return;
        host = container;
        const operation = ++revision;
        SoundManager.getInstance().setEnabled(!settings.isSoundMuted);
        loading.begin();
        await loading.stage("Finding available cities");
        await cities.loadCities();
        if (operation !== revision || host !== container) return;
        if (cities.selectedCity && cities.availableCities.includes(cities.selectedCity)) {
            await selectCity(cities.selectedCity);
        } else {
            loading.finish();
            state.showCityMenu = true;
            state.isLoading = false;
        }
    };

    /** Invalidates pending work and releases the renderer, input handlers and simulation resources. */
    const dispose = (): void => {
        revision++;
        host = null;
        selecting = false;
        pauseReasons.value.clear();
        instance.value?.dispose();
        instance.value = null;
        state.isLoading = false;
        loading.finish();
    };

    /** Updates street-label preference and the currently loaded scene together. */
    const toggleStreetNames = (): void => {
        if (!active()) return;
        settings.showStreetNames = !settings.showStreetNames;
        active()?.setLabelsVisible(settings.showStreetNames);
    };

    /** Searches the loaded city and publishes results or a readable error. */
    const searchLocations = (query: string): void => {
        navigation.error = "";
        try {
            navigation.results = active()?.searchLocations(query) ?? [];
        } catch (error) {
            navigation.results = [];
            navigation.error =
                error instanceof Error ? error.message : "Unable to search this map.";
        }
    };

    /** Teleports within the loaded map, retaining search error feedback. */
    const teleport = (location: MapLocation): void => {
        try {
            active()?.teleportTo(location);
            navigation.error = "";
        } catch (error) {
            navigation.error = error instanceof Error ? error.message : "Unable to teleport.";
        }
    };

    /** Loads a selected vehicle and ignores completion from a replaced simulator. */
    const switchVehicle = async (id: string): Promise<void> => {
        const simulator = active();
        if (!simulator || vehicles.switching || !VEHICLES[id]) return;
        const operation = revision;
        vehicles.switching = true;
        vehicles.error = "";
        try {
            if ((await simulator.switchVehicle(VEHICLES[id])) && operation === revision)
                vehicles.selectedId = id;
        } catch (error) {
            if (operation === revision)
                vehicles.error =
                    error instanceof Error ? error.message : "Unable to load this vehicle.";
        } finally {
            vehicles.switching = false;
        }
    };

    /** Applies the saved graphics preferences to the active renderer. */
    const applyGraphics = (): void =>
        active()?.setGraphics(settings.shadowsEnabled, settings.renderScale);
    /** Reloads the current city after an elevation-source preference changes. */
    const applyTerrain = async (): Promise<void> => {
        if (state.currentCity && !state.isLoading) await selectCity(state.currentCity, true);
    };
    /** Unlocks audio synchronously from a touch gesture. */
    const unlockTouchAudio = (): void => active()?.unlockTouchAudio();
    /** Starts or stops the active vehicle ignition. */
    const toggleIgnition = (): void => active()?.toggleIgnition();
    /** Resets the current vehicle or free-flight view. */
    const resetLocation = (): void => active()?.resetCarPosition();
    /** Changes between driving and free-flight modes. */
    const setCreativeMode = (enabled: boolean): void => active()?.setCreativeMode(enabled);
    /**
     * Registers or releases one UI pause request without clearing other active requests.
     * @param reason - UI surface owning the request.
     * @param paused - Whether that surface currently requires a paused simulation.
     */
    const setPauseReason = (reason: PauseReason, paused: boolean): void => {
        if (paused) pauseReasons.value.add(reason);
        else pauseReasons.value.delete(reason);
        active()?.setPaused(isPaused.value);
    };
    /** Toggles HUD performance graphs and renderer instrumentation together. */
    const togglePerformance = (): void => {
        state.showPerformance = !state.showPerformance;
        if (state.showPerformance) state.performanceHistory = [];
        active()?.setPerformanceEnabled(state.showPerformance);
    };

    return {
        instance,
        isReady,
        pauseReasons,
        isPaused,
        mount,
        dispose,
        selectCity,
        toggleStreetNames,
        searchLocations,
        teleport,
        switchVehicle,
        applyGraphics,
        applyTerrain,
        unlockTouchAudio,
        toggleIgnition,
        resetLocation,
        setCreativeMode,
        setPauseReason,
        togglePerformance,
    };
});
