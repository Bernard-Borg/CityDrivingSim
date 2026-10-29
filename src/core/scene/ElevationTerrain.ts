/**
 * ElevationTerrain types and implementation for the city driving simulator.
 * @packageDocumentation
 */

export interface SurfaceSample {
    height: number;
    slopeX: number;
    slopeZ: number;
}
export interface TerrainBounds {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
}
/** Geographic coverage in WGS84 decimal degrees. */
export interface ElevationBounds {
    /** Southern latitude. */
    south: number;
    /** Western longitude. */
    west: number;
    /** Northern latitude. */
    north: number;
    /** Eastern longitude. */
    east: number;
}

/** Synchronous sampling contract shared by decoded HGT and GeoTIFF sources. */
export interface ElevationSampler {
    /** Reports whether the source can provide elevation at a WGS84 position. */
    covers(lat: number, lon: number): boolean;
    /** Returns elevation in source-datum metres at a WGS84 position. */
    sample(lat: number, lon: number): number;
    /** Returns geographic bounds used to limit terrain generation. */
    getBounds(): ElevationBounds;
}

/** Existing HGT configuration; omitting format preserves legacy city settings. */
export interface HgtElevationConfig {
    /** Optional explicit format selector. */
    format?: "hgt";
    /** Asset filename under public/data/elevation. */
    file: string;
    /** Latitude of the southern tile edge. */
    south: number;
    /** Longitude of the western tile edge. */
    west: number;
}

/** GeoTIFF configuration, including explicit projection and missing-data policy. */
export interface TiffElevationConfig {
    /** Selects the GeoTIFF loader. */
    format: "geotiff";
    /** Asset filename under public/data/elevation. */
    file: string;
    /** Optional CRS override for exports lacking a standard EPSG GeoKey. */
    crs?: "EPSG:2154" | "EPSG:4326";
    /** Terrain triangle spacing in metres; does not change the source raster. */
    meshSpacing?: number;
    /** Optional HGT coverage for missing or out-of-bounds raster samples. */
    fallback?: HgtElevationConfig;
}

/** Discriminated source configuration shared by city loading. */
export type ElevationSource = HgtElevationConfig | TiffElevationConfig;

/** NASA HGT: signed big-endian metres, rows from north to south, one degree per tile. */
export class HgtTile implements ElevationSampler {
    readonly size: number;
    private data: DataView;
    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param buffer - Raw signed big-endian HGT elevation bytes.
     * @param south - Latitude of the HGT tile southern edge.
     * @param west - Longitude of the HGT tile western edge.
     */
    constructor(
        buffer: ArrayBuffer,
        readonly south: number,
        readonly west: number,
    ) {
        this.size = Math.sqrt(buffer.byteLength / 2);
        if (![1201, 3601].includes(this.size))
            throw new Error("Unsupported HGT size: expected 1201 or 3601 square samples.");
        this.data = new DataView(buffer);
    }

    /** Returns the exact one-degree HGT coverage without changing legacy sampling. */
    getBounds(): ElevationBounds {
        return { south: this.south, west: this.west, north: this.south + 1, east: this.west + 1 };
    }

    /**
     * Reports whether a WGS84 point lies inside the configured elevation tile.
     *
     * @param lat - WGS84 latitude in decimal degrees.
     * @param lon - WGS84 longitude in decimal degrees.
     */
    covers(lat: number, lon: number): boolean {
        return (
            lat >= this.south && lat <= this.south + 1 && lon >= this.west && lon <= this.west + 1
        );
    }

    /**
     * Samples the represented surface height and, where available, slopes and contact metadata.
     *
     * @param lat - WGS84 latitude in decimal degrees.
     * @param lon - WGS84 longitude in decimal degrees.
     */
    sample(lat: number, lon: number): number {
        if (!this.covers(lat, lon))
            throw new Error("Requested elevation lies outside the supplied HGT tile.");
        const x = (lon - this.west) * (this.size - 1);
        const y = (this.south + 1 - lat) * (this.size - 1);
        const col = Math.min(this.size - 2, Math.floor(x));
        const row = Math.min(this.size - 2, Math.floor(y));
        const u = x - col,
            v = y - row;
        let sum = 0,
            weight = 0;
        for (let j = 0; j < 2; j++)
            for (let i = 0; i < 2; i++) {
                const value = this.data.getInt16(((row + j) * this.size + col + i) * 2, false);
                const w = (i ? u : 1 - u) * (j ? v : 1 - v);
                if (value !== -32768) {
                    sum += value * w;
                    weight += w;
                }
            }
        if (weight > 0) return sum / weight;
        // Small isolated voids use nearby valid data; never turn missing data into a pit.
        for (let radius = 1; radius <= 8; radius++) {
            for (let j = -radius; j <= radius; j++)
                for (let i = -radius; i <= radius; i++) {
                    if (Math.abs(i) !== radius && Math.abs(j) !== radius) continue;
                    const r = row + j,
                        c = col + i;
                    if (r < 0 || c < 0 || r >= this.size || c >= this.size) continue;
                    const value = this.data.getInt16((r * this.size + c) * 2, false);
                    if (value !== -32768) return value;
                }
        }
        throw new Error(
            "Elevation contains a large NoData region. Supply a void-filled SRTM tile.",
        );
    }
}

/** One triangulated height field shared by rendering, scenery and vehicle contact. */
export class ElevationTerrain {
    readonly columns: number;
    readonly rows: number;
    readonly heights: Float32Array;
    readonly stepX: number;
    readonly stepZ: number;
    readonly referenceHeight: number;
    readonly bounds: TerrainBounds;
    private lonScale: number;
    private latScale = (Math.PI / 180) * 6371000;

    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param tile - Decoded elevation source, or null for a flat terrain grid.
     * @param centerLat - City origin latitude in decimal degrees.
     * @param centerLon - City origin longitude in decimal degrees.
     * @param bounds - Local horizontal bounds in metres.
     * @param spacingMetres - Optional mesh spacing; omitted HGT settings retain the original 20 m grid.
     */
    constructor(
        tile: ElevationSampler | null,
        readonly centerLat: number,
        readonly centerLon: number,
        bounds: TerrainBounds,
        spacingMetres?: number,
    ) {
        this.lonScale = this.latScale * Math.cos((centerLat * Math.PI) / 180);
        this.referenceHeight = tile?.sample(centerLat, centerLon) ?? 0;
        const coverage = tile?.getBounds();
        // Keep all vertices inside the real tile, including the scenery margin.
        this.bounds = coverage
            ? {
                  minX: Math.max(bounds.minX - 600, (coverage.west - centerLon) * this.lonScale + 0.01),
                  maxX: Math.min(
                      bounds.maxX + 600,
                      (coverage.east - centerLon) * this.lonScale - 0.01,
                  ),
                  minZ: Math.max(
                      bounds.minZ - 600,
                      -(coverage.north - centerLat) * this.latScale + 0.01,
                  ),
                  maxZ: Math.min(
                      bounds.maxZ + 600,
                      -(coverage.south - centerLat) * this.latScale - 0.01,
                  ),
              }
            : { ...bounds };
        const spacing = spacingMetres !== undefined && Number.isFinite(spacingMetres) && spacingMetres > 0
            ? Math.max(1, spacingMetres) : tile ? 20 : 40;
        this.columns = Math.max(2, Math.ceil((this.bounds.maxX - this.bounds.minX) / spacing) + 1);
        this.rows = Math.max(2, Math.ceil((this.bounds.maxZ - this.bounds.minZ) / spacing) + 1);
        this.stepX = (this.bounds.maxX - this.bounds.minX) / (this.columns - 1);
        this.stepZ = (this.bounds.maxZ - this.bounds.minZ) / (this.rows - 1);
        this.heights = new Float32Array(this.columns * this.rows);
        for (let row = 0; row < this.rows; row++)
            for (let col = 0; col < this.columns; col++) {
                const x = this.bounds.minX + col * this.stepX,
                    z = this.bounds.minZ + row * this.stepZ;
                this.heights[row * this.columns + col] =
                    (tile?.sample(centerLat - z / this.latScale, centerLon + x / this.lonScale) ??
                        0) - this.referenceHeight;
            }
    }

    /**
     * Raises each terrain vertex to at least the supplied minimum local elevation.
     *
     * @param minimumAt - Minimum allowed local elevation at a grid point.
     */
    raiseMinimum(minimumAt: (x: number, z: number) => number): void {
        for (let row = 0; row < this.rows; row++)
            for (let col = 0; col < this.columns; col++) {
                const x = this.bounds.minX + col * this.stepX,
                    z = this.bounds.minZ + row * this.stepZ;
                const index = row * this.columns + col;
                this.heights[index] = Math.max(this.heights[index], minimumAt(x, z));
            }
    }

    /**
     * Checks whether a point lies inside the represented bounds or corridor region.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     */
    contains(x: number, z: number): boolean {
        return (
            x >= this.bounds.minX &&
            x <= this.bounds.maxX &&
            z >= this.bounds.minZ &&
            z <= this.bounds.maxZ
        );
    }

    /** Split a road/marking triangle on terrain cell diagonals so it cannot cut through a hill. */
    cutTriangle(points: Array<{ x: number; z: number }>): Array<Array<{ x: number; z: number }>> {
        const minCol = Math.max(
            0,
            Math.floor((Math.min(...points.map((p) => p.x)) - this.bounds.minX) / this.stepX),
        );
        const maxCol = Math.min(
            this.columns - 2,
            Math.floor((Math.max(...points.map((p) => p.x)) - this.bounds.minX) / this.stepX),
        );
        const minRow = Math.max(
            0,
            Math.floor((Math.min(...points.map((p) => p.z)) - this.bounds.minZ) / this.stepZ),
        );
        const maxRow = Math.min(
            this.rows - 2,
            Math.floor((Math.max(...points.map((p) => p.z)) - this.bounds.minZ) / this.stepZ),
        );
        const result: Array<Array<{ x: number; z: number }>> = [];
        for (let row = minRow; row <= maxRow; row++)
            for (let col = minCol; col <= maxCol; col++) {
                const x = this.bounds.minX + col * this.stepX,
                    z = this.bounds.minZ + row * this.stepZ;
                const a = { x, z },
                    b = { x: x + this.stepX, z },
                    c = { x, z: z + this.stepZ },
                    d = { x: x + this.stepX, z: z + this.stepZ };
                for (const cell of [
                    [a, b, c],
                    [b, d, c],
                ]) {
                    let poly = points;
                    for (let edge = 0; edge < 3 && poly.length; edge++) {
                        const start = cell[edge],
                            end = cell[(edge + 1) % 3];
                        /**
                         * Evaluates the signed orientation of a point against the active clipping boundary.
                         *
                         * @param p - Point or OSM tag record, as indicated by its type.
                         */
                        const side = (p: { x: number; z: number }) =>
                            (end.x - start.x) * (p.z - start.z) -
                            (end.z - start.z) * (p.x - start.x);
                        const clipped: typeof poly = [];
                        for (let i = 0; i < poly.length; i++) {
                            const p = poly[i],
                                q = poly[(i + 1) % poly.length],
                                dp = side(p),
                                dq = side(q);
                            if (dp >= -1e-8) clipped.push(p);
                            if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
                                const t = dp / (dp - dq);
                                clipped.push({
                                    x: p.x + (q.x - p.x) * t,
                                    z: p.z + (q.z - p.z) * t,
                                });
                            }
                        }
                        poly = clipped;
                    }
                    if (poly.length >= 3) result.push(poly);
                }
            }
        return result;
    }

    /**
     * Samples the represented surface height and, where available, slopes and contact metadata.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     */
    sample(x: number, z: number): SurfaceSample {
        const gx = Math.max(0, Math.min(this.columns - 1, (x - this.bounds.minX) / this.stepX));
        const gz = Math.max(0, Math.min(this.rows - 1, (z - this.bounds.minZ) / this.stepZ));
        const col = Math.min(this.columns - 2, Math.floor(gx)),
            row = Math.min(this.rows - 2, Math.floor(gz));
        const u = gx - col,
            v = gz - row,
            a = row * this.columns + col;
        const h00 = this.heights[a],
            h10 = this.heights[a + 1];
        const h01 = this.heights[a + this.columns],
            h11 = this.heights[a + this.columns + 1];
        // Match the mesh's b-c diagonal exactly, rather than bilinear contact over a triangle mesh.
        if (u + v <= 1)
            return {
                height: h00 + (h10 - h00) * u + (h01 - h00) * v,
                slopeX: (h10 - h00) / this.stepX,
                slopeZ: (h01 - h00) / this.stepZ,
            };
        return {
            height: h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v),
            slopeX: (h11 - h01) / this.stepX,
            slopeZ: (h11 - h10) / this.stepZ,
        };
    }
}
