/**
 * Persistent audio, graphics, terrain and street-label preferences.
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

    /** Visibility of the driving instrument cluster. */
    const showSpeedometer = useLocalStorage<boolean>("cityDrivingSim_showSpeedometer", true);
    /** Visibility of the compass and coordinates. */
    const showCompass = useLocalStorage<boolean>("cityDrivingSim_showCompass", true);
    /** Visibility of the location search control. */
    const showSearch = useLocalStorage<boolean>("cityDrivingSim_showSearch", true);

    /** Bypasses detailed GeoTIFF terrain in favour of its configured HGT fallback. */
    const forceFallbackTerrain = useLocalStorage<boolean>("cityDrivingSim_forceFallbackTerrain", false);

    const shadowsEnabled = useLocalStorage<boolean>("cityDrivingSim_shadows", true);
    const renderScale = useLocalStorage<number>("cityDrivingSim_renderScale", 2);
    return {
        engineVolume,
        effectsVolume,
        musicVolume,
        isSoundMuted,
        showStreetNames,
        showSpeedometer,
        showCompass,
        showSearch,
        forceFallbackTerrain,
        shadowsEnabled,
        renderScale,
    };
});
