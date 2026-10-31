/**
 * City configuration and saved geographic vehicle positions.
 * @packageDocumentation
 */

import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { ref } from "vue";
import {
    AMSTERDAM_BUILDINGS,
    MALTA_BUILDINGS,
    MONACO_BUILDINGS,
    STOCKHOLM_BUILDINGS,
    VADUZ_BUILDINGS,
} from "@/core/scene/BuildingAppearance";
import type { BuildingTheme } from "@/core/scene/BuildingAppearance";

import type { ElevationSource } from "@/core/scene/ElevationTerrain";

export interface SavedPosition {
    lat: number;
    lon: number;
    y?: number; // Optional elevation
}

export interface CityConfig {
    name: string;
    /** Country displayed beneath the city name in map selection. */
    country: string;
    file: string;
    centerLat: number;
    centerLon: number;
    elevation?: ElevationSource;
    buildings?: BuildingTheme;
}

// Available cities configuration
export const CITY_CONFIGS: Record<string, CityConfig> = {
    amsterdam: {
        name: "Amsterdam",
        country: "Netherlands",
        file: "amsterdam.json",
        buildings: AMSTERDAM_BUILDINGS,
        elevation: { file: "Amsterdam.hgt", south: 52, west: 4 },
        centerLat: 52.3731,
        centerLon: 4.8925,
    },
    monaco: {
        name: "Monaco",
        country: "Monaco",
        buildings: MONACO_BUILDINGS,
        file: "monaco.json",
        elevation: {
            format: "geotiff",
            file: "Monaco.tiff",
            crs: "EPSG:2154",
            meshSpacing: 2,
            fallback: { file: "Monaco.hgt", south: 43, west: 7 },
        },
        centerLat: 43.7384,
        centerLon: 7.4246,
    },
    rabat: {
        name: "Rabat",
        country: "Malta",
        buildings: MALTA_BUILDINGS,
        file: "rabat.json",
        elevation: {
            format: "geotiff",
            file: "Rabat.tiff",
            crs: "EPSG:32633",
            meshSpacing: 3,
            smoothingPasses: 2,
            fallback: { file: "Rabat.hgt", south: 35, west: 14 },
        },
        centerLat: 35.8807,
        centerLon: 14.3977,
    },
    vaduz: {
        name: "Vaduz",
        country: "Liechtenstein",
        file: "vaduz.json",
        buildings: VADUZ_BUILDINGS,
        elevation: { file: "Vaduz.hgt", south: 47, west: 9 },
        centerLat: 47.141,
        centerLon: 9.5215,
    },
    valletta: {
        name: "Valletta",
        country: "Malta",
        buildings: MALTA_BUILDINGS,
        file: "valletta.json",
        elevation: { file: "Valletta.hgt", south: 35, west: 14 },
        centerLat: 35.8997,
        centerLon: 14.5146,
    },
    stockholm: {
        name: "Stockholm",
        country: "Sweden",
        buildings: STOCKHOLM_BUILDINGS,
        file: "stockholm.json",
        elevation: { file: "Stockholm.hgt", south: 59, west: 18 },
        centerLat: 59.3253,
        centerLon: 18.0654,
    },
};

export const useCitiesStore = defineStore("cities", () => {
    const STORAGE_KEY_CITY = "cityDrivingSim_selectedCity";
    const STORAGE_KEY_POSITION = "cityDrivingSim_lastPosition";

    const selectedCity = useLocalStorage<string>(STORAGE_KEY_CITY, "");

    const availableCities = ref<string[]>([]);

    /**
     * Persists the current vehicle position under its city identifier.
     *
     * @param city - Configured city identifier.
     * @param position - Local position or saved geographic position, as indicated by the parameter type.
     */
    const savePosition = (city: string, position: SavedPosition): void => {
        const key = `${STORAGE_KEY_POSITION}_${city}`;
        localStorage.setItem(key, JSON.stringify(position));
    };

    /**
     * Reads and validates a saved geographic position, returning null for missing or malformed data.
     *
     * @param city - Configured city identifier.
     */
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

    /**
     * Checks configured road files concurrently with body-free HEAD requests and populates selectable cities, falling back to the config list.
     */
    const loadCities = async () => {
        const cities = Object.keys(CITY_CONFIGS);
        const checks = await Promise.allSettled(
            cities.map(async (city) => {
                // HEAD checks existence without transferring the large GeoJSON response body.
                const response = await fetch(`/data/roads/${CITY_CONFIGS[city].file}`, {
                    method: "HEAD",
                });
                return response.ok;
            }),
        );

        const available = cities.filter((_, index) => {
            const result = checks[index];
            return result?.status === "fulfilled" && result.value;
        });
        availableCities.value = available.length > 0 ? available : cities;
    };

    /**
     * Returns city configuration or null for an unknown identifier.
     *
     * @param city - Configured city identifier.
     */
    const getCityConfig = (city: string): CityConfig | null => {
        return CITY_CONFIGS[city] || null;
    };

    /**
     * Returns the city display name, falling back to the supplied identifier.
     *
     * @param city - Configured city identifier.
     */
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
