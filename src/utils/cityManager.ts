export interface SavedPosition {
  lat: number
  lon: number
  y?: number // Optional elevation
}

export interface CityConfig {
  name: string
  file: string
  centerLat: number
  centerLon: number
}

// Available cities configuration
export const CITY_CONFIGS: Record<string, CityConfig> = {
  monaco: {
    name: 'Monaco',
    file: 'monaco.json',
    centerLat: 43.7384,
    centerLon: 7.4246
  },
  rabat: {
    name: 'Rabat',
    file: 'rabat.json',
    centerLat: 34.0209,
    centerLon: -6.8416
  }
}

export class CityManager {
  private static readonly STORAGE_KEY_CITY = 'cityDrivingSim_selectedCity'
  private static readonly STORAGE_KEY_POSITION = 'cityDrivingSim_lastPosition'

  static getSelectedCity(): string | null {
    return localStorage.getItem(this.STORAGE_KEY_CITY)
  }

  static setSelectedCity(city: string): void {
    localStorage.setItem(this.STORAGE_KEY_CITY, city)
  }

  static getSavedPosition(city: string): SavedPosition | null {
    const key = `${this.STORAGE_KEY_POSITION}_${city}`
    const saved = localStorage.getItem(key)
    if (!saved) return null
    try {
      return JSON.parse(saved) as SavedPosition
    } catch {
      return null
    }
  }

  static savePosition(city: string, position: SavedPosition): void {
    const key = `${this.STORAGE_KEY_POSITION}_${city}`
    localStorage.setItem(key, JSON.stringify(position))
  }

  static getCityConfig(city: string): CityConfig | null {
    return CITY_CONFIGS[city] || null
  }

  static getAvailableCities(): string[] {
    return Object.keys(CITY_CONFIGS)
  }

  static async detectAvailableCities(): Promise<string[]> {
    // Try to fetch each city config to see which files exist
    const available: string[] = []
    const cities = Object.keys(CITY_CONFIGS)
    
    for (const city of cities) {
      const config = CITY_CONFIGS[city]
      try {
        const response = await fetch(`/data/${config.file}`, { method: 'HEAD' })
        if (response.ok) {
          available.push(city)
        }
      } catch {
        // File doesn't exist, skip
      }
    }
    
    return available.length > 0 ? available : cities // Fallback to config list
  }
}