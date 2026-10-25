import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";

export const useSettingsStore = defineStore("settings", () => {
    const isSoundMuted = useLocalStorage<boolean>(
        "cityDrivingSim_soundMuted",
        false,
    );

    const showStreetNames = useLocalStorage<boolean>(
        "cityDrivingSim_showStreetNames",
        true,
    );

    return { isSoundMuted, showStreetNames };
});
