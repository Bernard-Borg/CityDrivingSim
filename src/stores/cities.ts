import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { ref } from "vue";
import {
    MALTA_BUILDINGS,
    MONACO_BUILDINGS,
    STOCKHOLM_BUILDINGS,
} from "@/core/scene/BuildingAppearance";
import type { BuildingTheme } from "@/core/scene/BuildingAppearance";

export interface SavedPosition {
    lat: number;
    lon: number;
    y?: number; // Optional elevation
}

export interface CityConfig {
    name: string;
    file: string;
    centerLat: number;
    centerLon: number;
    elevation?: { file: string; south: number; west: number };
    buildings?: BuildingTheme;
}

// Available cities configuration
export const CITY_CONFIGS: Record<string, CityConfig> = {
    monaco: {
        name: "Monaco",
        buildings: MONACO_BUILDINGS,
        file: "monaco.json",
        elevation: { file: "Monaco.hgt", south: 43, west: 7 },
        centerLat: 43.7384,
        centerLon: 7.4246,
    },
    rabat: {
        name: "Rabat",
        buildings: MALTA_BUILDINGS,
        file: "rabat.json",
        elevation: { file: "Rabat.hgt", south: 35, west: 14 },
        centerLat: 35.8807,
        centerLon: 14.3977,
    },
    balzan: {
        name: "Ħal Balzan",
        file: "balzan.json",
        buildings: MALTA_BUILDINGS,
        centerLat: 35.9005,
        centerLon: 14.4504,
    },
    qrendi: {
        name: "Il-Qrendi",
        file: "qrendi.json",
        buildings: MALTA_BUILDINGS,
        centerLat: 35.8343,
        centerLon: 14.4579,
    },
    stockholm: {
        name: "Stockholm",
        buildings: STOCKHOLM_BUILDINGS,
        file: "stockholm.json",
        centerLat: 59.3253,
        centerLon: 18.0654,
    },
};

export const useCitiesStore = defineStore("cities", () => {
    const STORAGE_KEY_CITY = "cityDrivingSim_selectedCity";
    const STORAGE_KEY_POSITION = "cityDrivingSim_lastPosition";

    const selectedCity = useLocalStorage<string>(STORAGE_KEY_CITY, "");

    const availableCities = ref<string[]>([]);

    const savePosition = (city: string, position: SavedPosition): void => {
        const key = `${STORAGE_KEY_POSITION}_${city}`;
        localStorage.setItem(key, JSON.stringify(position));
    };

    const getSavedPosition = (city: string): SavedPosition | null => {
        const key = `${STORAGE_KEY_POSITION}_${city}`;
        try {
            const saved = localStorage.getItem(key);
            if (!saved) return null;
            const position = JSON.parse(saved) as SavedPosition;
            return position &&
                Number.isFinite(position.lat) &&
                Number.isFinite(position.lon) &&
                Math.abs(position.lat) <= 90 &&
                Math.abs(position.lon) <= 180
                ? position
                : null;
        } catch {
            return null;
        }
    };

    const loadCities = async () => {
        // Try to fetch each city config to see which files exist
        const available: string[] = [];
        const cities = Object.keys(CITY_CONFIGS);

        for (const city of cities) {
            const config = CITY_CONFIGS[city];
            try {
                const response = await fetch(`/data/roads/${config.file}`, {
                    method: "HEAD",
                });
                if (response.ok) {
                    available.push(city);
                }
            } catch {
                // File doesn't exist, skip
            }
        }

        availableCities.value = available.length > 0 ? available : cities; // Fallback to config list;
    };

    const getCityConfig = (city: string): CityConfig | null => {
        return CITY_CONFIGS[city] || null;
    };

    const getCityName = (city: string): string => {
        const config = getCityConfig(city);
        return config?.name || city;
    };

    return {
        selectedCity,
        getCityName,
        savePosition,
        getSavedPosition,
        getCityConfig,
        availableCities,
        loadCities,
    };
});
