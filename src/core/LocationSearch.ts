/** Offline location-search contracts. @packageDocumentation */
export interface MapLocation { label: string; lat: number; lon: number; y?: number; }

/** Parses decimal latitude/longitude pairs, separated by a comma, semicolon or whitespace.
 * @param query - User-entered latitude followed by longitude.
 * @returns Geographic coordinates, or null when the input is not a valid coordinate pair.
 */
export function parseCoordinates(query: string): { lat: number; lon: number } | null {
    const match = query.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*°?\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)\s*°?$/);
    if (!match) return null;
    const lat = Number(match[1]), lon = Number(match[2]);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
