/** Shared vehicle selection and replacement-loading state. @packageDocumentation */
import { defineStore } from "pinia";
import { ref } from "vue";
import { useLocalStorage } from "@vueuse/core";
import { DEFAULT_VEHICLE } from "@/core/vehicle/VehicleConfig";

export const useVehiclesStore = defineStore("vehicles", () => {
    const selectedId = useLocalStorage("cityDrivingSim_vehicle", DEFAULT_VEHICLE.id);
    const switching = ref(false);
    const error = ref("");
    return { selectedId, switching, error };
});
