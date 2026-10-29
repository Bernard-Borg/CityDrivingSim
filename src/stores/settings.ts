/**
 * Persistent sound and street-label preferences.
 * @packageDocumentation
 */

import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";

export const useSettingsStore = defineStore("settings", () => {
    const isSoundMuted = useLocalStorage<boolean>("cityDrivingSim_soundMuted", false);
    const engineVolume = useLocalStorage<number>("cityDrivingSim_engineVolume", 1);
    const effectsVolume = useLocalStorage<number>("cityDrivingSim_effectsVolume", 1);
    const musicVolume = useLocalStorage<number>("cityDrivingSim_radioVolume", 0.35);
    const showStreetNames = useLocalStorage<boolean>("cityDrivingSim_showStreetNames", true);

    const shadowsEnabled = useLocalStorage<boolean>("cityDrivingSim_shadows", true);
    const renderScale = useLocalStorage<number>("cityDrivingSim_renderScale", 2);
    return {
        engineVolume,
        effectsVolume,
        musicVolume,
        isSoundMuted,
        showStreetNames,
        shadowsEnabled,
        renderScale,
    };
});
