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
}

// Available cities configuration
export const CITY_CONFIGS: Record<string, CityConfig> = {
    monaco: {
        name: 'Monaco',
        file: 'monaco.json',
        elevation: { file: 'Monaco.hgt', south: 43, west: 7 },
        centerLat: 43.7384,
        centerLon: 7.4246
    },
    rabat: {
        name: 'Rabat',
        file: 'rabat.json',
        elevation: { file: 'Rabat.hgt', south: 35, west: 14 },
        centerLat: 35.8807,
        centerLon: 14.3977
    },
    balzan: {
        name: 'Ħal Balzan',
        file: 'balzan.json',
        centerLat: 35.9005,
        centerLon: 14.4504
    },
    qrendi: {
        name: 'Il-Qrendi',
        file: 'qrendi.json',
        centerLat: 35.8343,
        centerLon: 14.4579
    }
};

export class CityManager {
    private static readonly STORAGE_KEY_CITY = 'cityDrivingSim_selectedCity';
    private static readonly STORAGE_KEY_POSITION = 'cityDrivingSim_lastPosition';

    static getSelectedCity(): string | null {
        try { return localStorage.getItem(this.STORAGE_KEY_CITY); } catch { return null; }
    }

    static setSelectedCity(city: string): void {
        try { localStorage.setItem(this.STORAGE_KEY_CITY, city); } catch { /* Storage may be disabled. */ }
    }

    static getSavedPosition(city: string): SavedPosition | null {
        const key = `${this.STORAGE_KEY_POSITION}_${city}`;
        try {
            const saved = localStorage.getItem(key);
            if (!saved) return null;
            const position = JSON.parse(saved) as SavedPosition;
            return position && Number.isFinite(position.lat) && Number.isFinite(position.lon)
                && Math.abs(position.lat) <= 90 && Math.abs(position.lon) <= 180 ? position : null;
        } catch {
            return null;
        }
    }

    static savePosition(city: string, position: SavedPosition): void {
        const key = `${this.STORAGE_KEY_POSITION}_${city}`;
        localStorage.setItem(key, JSON.stringify(position));
    }

    static getCityConfig(city: string): CityConfig | null {
        return CITY_CONFIGS[city] || null;
    }

    static getAvailableCities(): string[] {
        return Object.keys(CITY_CONFIGS);
    }

    static async detectAvailableCities(): Promise<string[]> {
        // Try to fetch each city config to see which files exist
        const available: string[] = [];
        const cities = Object.keys(CITY_CONFIGS);

        for (const city of cities) {
            const config = CITY_CONFIGS[city];
            try {
                const response = await fetch(`/data/roads/${config.file}`, { method: 'HEAD' });
                if (response.ok) {
                    available.push(city);
                }
            } catch {
                // File doesn't exist, skip
            }
        }

        return available.length > 0 ? available : cities; // Fallback to config list
    }
}