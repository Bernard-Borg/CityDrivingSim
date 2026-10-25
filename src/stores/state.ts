import { defineStore } from "pinia";
import { ref } from "vue";

export const useStateStore = defineStore("state", () => {
    /* UI State */
    const showCitySwitcher = ref<boolean>(false);
    const showCityMenu = ref<boolean>(false);
    const isLoading = ref<boolean>(true);
    const loadError = ref("");

    /* Game State */
    const fps = ref(0);
    const speed = ref(0);
    const boostAmount = ref(100);
    const currentCity = ref<string | null>(null);
    const coordinates = ref({ lat: 0, lon: 0 });

    const heading = ref(0);
    const displayedHeading = ref(0);

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
        loadError,
    };
});
