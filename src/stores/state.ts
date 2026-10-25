import { defineStore } from "pinia";
import { ref } from "vue";
import type { VehicleTelemetry, PerformanceSample } from "@/core/DrivingSimulator";
import { DEFAULT_VEHICLE } from "@/core/vehicle/VehicleConfig";

export const useStateStore = defineStore("state", () => {
    /* UI State */
    const showCitySwitcher = ref<boolean>(false);
    const showCityMenu = ref<boolean>(false);
    const isLoading = ref<boolean>(true);
    const loadError = ref("");
    const creativeMode = ref(false);

    /* Game State */
    const fps = ref(0);
    const speed = ref(0);
    const boostAmount = ref(100);
    const currentCity = ref<string | null>(null);
    const coordinates = ref({ lat: 0, lon: 0 });

    const heading = ref(0);
    const displayedHeading = ref(0);
    const vehicle = ref<VehicleTelemetry>({ engine: 'off', rpm: 0, maxRPM: 6000, maxSpeed: 250, handbrake: true, name: DEFAULT_VEHICLE.name, gear: 'P' });
    const showPerformance = ref(false);
    const performanceHistory = ref<PerformanceSample[]>([]);

    return {
        showCitySwitcher,
        showCityMenu,
        isLoading,
        fps,
        speed,
        boostAmount,
        currentCity,
        coordinates,
        heading,
        displayedHeading,
        vehicle,
        showPerformance,
        performanceHistory,
        loadError,
        creativeMode,
    };
});
