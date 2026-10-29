/** GeoTIFF decoding and WGS84 sampling for projected terrain rasters. @packageDocumentation */
import { fromUrl, type GeoTIFFImage } from "geotiff";
import proj4 from "proj4";
import type { ElevationBounds, ElevationSampler, TiffElevationConfig } from "./ElevationTerrain";

proj4.defs("EPSG:2154", "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +units=m +no_defs");

/** Decoded single-band, north-up GeoTIFF with bilinear, NoData-aware sampling. */
export class GeoTiffTile implements ElevationSampler {
    /** Elevation samples in source row order, retaining fractional metres. */
    private readonly heights: Float32Array;
    /** Geographic envelope for coverage filtering. */
    private readonly bounds: ElevationBounds;
    /** Converts geographic coordinates to raster coordinates and back. */
    private readonly projection: proj4.Converter;
    /** Source raster width in pixels. */
    private readonly width: number;
    /** Source raster height in pixels. */
    private readonly height: number;
    /** Projected coordinates of the raster origin. */
    private readonly origin: number[];
    /** Signed projected pixel spacing. */
    private readonly resolution: number[];
    /** Offset from raster corner to the centre of the first sample. */
    private readonly pixelOffset: number;
    /** Declared missing-value sentinel, if present. */
    private readonly noData: number | null;

    /**
     * Creates a sampler from a validated image and its decoded elevation band.
     * @param image - North-up georeferenced elevation image.
     * @param heights - Decoded first-band samples in row order.
     * @param crs - Supported projected or geographic coordinate system.
     * @param fallback - Optional sampler used only where the raster has no elevation.
     */
    private constructor(image: GeoTIFFImage, heights: Float32Array, crs: string,
        private readonly fallback?: ElevationSampler) {
        this.width = image.getWidth(); this.height = image.getHeight();
        this.heights = heights;
        this.origin = image.getOrigin(); this.resolution = image.getResolution();
        this.pixelOffset = image.getGeoKeys()?.GTRasterTypeGeoKey === 2 ? 0 : 0.5;
        this.noData = image.getGDALNoData();
        this.projection = proj4("EPSG:4326", crs);
        const corners = [[0, 0], [this.width, 0], [0, this.height], [this.width, this.height]]
            .map(([x, y]) => this.projection.inverse([
                this.origin[0]! + x! * this.resolution[0]!,
                this.origin[1]! + y! * this.resolution[1]!,
            ]));
        this.bounds = { west: Math.min(...corners.map(p => p[0]!)), east: Math.max(...corners.map(p => p[0]!)),
            south: Math.min(...corners.map(p => p[1]!)), north: Math.max(...corners.map(p => p[1]!)) };
    }

    /**
     * Reads the first elevation band in bounded batches using HTTP range requests.
     * @param url - Same-origin GeoTIFF URL on a server supporting byte ranges.
     * @param config - Projection override and city elevation settings.
     * @param fallback - Optional decoded source for raster gaps.
     * @param signal - Cancels network and raster decoding work.
     */
    static async load(url: string, config: TiffElevationConfig, fallback?: ElevationSampler,
        signal?: AbortSignal): Promise<GeoTiffTile> {
        const options = { allowFullFile: false, blockSize: 1024 * 1024, cacheSize: 16 };
        const tiff = await fromUrl(url, options, signal);
        try {
            const image = await tiff.getImage();
            const keys = image.getGeoKeys();
            const epsg = keys?.ProjectedCSTypeGeoKey ?? keys?.GeographicTypeGeoKey;
            const crs = config.crs ?? (epsg === 2154 || epsg === 4326 ? `EPSG:${epsg}` : undefined);
            if (!crs) throw new Error("Unsupported GeoTIFF CRS. Configure EPSG:2154 or EPSG:4326 explicitly.");
            if (image.getSamplesPerPixel() !== 1) throw new Error("Elevation GeoTIFF must contain one numeric height band, not an RGB image.");
            const resolution = image.getResolution();
            if (image.getFileDirectory().getValue("ModelTransformation") ||
                !(resolution[0]! > 0 && resolution[1]! < 0))
                throw new Error("Elevation GeoTIFF must be north-up without rotation.");
            const width = image.getWidth(), height = image.getHeight();
            if (width < 2 || height < 2) throw new Error("Elevation GeoTIFF must be at least 2 by 2 pixels.");
            const heights = new Float32Array(width * height);
            // Avoid an additional complete decoded-raster allocation during loading.
            for (let row = 0; row < height; row += 256) {
                signal?.throwIfAborted();
                const end = Math.min(height, row + 256);
                const band = await image.readRasters({ window: [0, row, width, end], samples: [0], interleave: true, signal });
                heights.set(band, row * width);
            }
            return new GeoTiffTile(image, heights, crs, fallback);
        } finally {
            await tiff.close();
        }
    }

    /** Returns combined coverage when a fallback is explicitly configured. */
    getBounds(): ElevationBounds {
        if (!this.fallback) return { ...this.bounds };
        const b = this.fallback.getBounds();
        return { west: Math.min(b.west, this.bounds.west), east: Math.max(b.east, this.bounds.east),
            south: Math.min(b.south, this.bounds.south), north: Math.max(b.north, this.bounds.north) };
    }

    /** Converts WGS84 coordinates to fractional sample indices with pixel-centre alignment. */
    private pixel(lat: number, lon: number): [number, number] {
        const p = this.projection.forward([lon, lat]);
        return [(p[0]! - this.origin[0]!) / this.resolution[0]! - this.pixelOffset,
            (p[1]! - this.origin[1]!) / this.resolution[1]! - this.pixelOffset];
    }

    /** Reports geometric raster or fallback coverage; missing raster samples use the configured fallback. */
    covers(lat: number, lon: number): boolean {
        const [x, y] = this.pixel(lat, lon);
        return (x >= -this.pixelOffset && y >= -this.pixelOffset &&
            x < this.width - this.pixelOffset && y < this.height - this.pixelOffset) ||
            (this.fallback?.covers(lat, lon) ?? false);
    }

    /** Returns bilinear elevation, ignoring NoData weights and never treating a sentinel as terrain. */
    sample(lat: number, lon: number): number {
        const [x, y] = this.pixel(lat, lon);
        if (x >= -this.pixelOffset && y >= -this.pixelOffset &&
            x < this.width - this.pixelOffset && y < this.height - this.pixelOffset) {
            const gx = Math.max(0, Math.min(this.width - 1, x)), gy = Math.max(0, Math.min(this.height - 1, y));
            const col = Math.min(this.width - 2, Math.floor(gx)), row = Math.min(this.height - 2, Math.floor(gy));
            const u = gx - col, v = gy - row;
            let sum = 0, weight = 0;
            for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
                const h = this.heights[(row + j) * this.width + col + i]!;
                const w = (i ? u : 1 - u) * (j ? v : 1 - v);
                if (Number.isFinite(h) && h !== this.noData) { sum += h * w; weight += w; }
            }
            if (weight > 0) return sum / weight;
        }
        if (this.fallback?.covers(lat, lon)) return this.fallback.sample(lat, lon);
        throw new Error(`No elevation data at ${lat.toFixed(6)}, ${lon.toFixed(6)}. Configure an elevation fallback or supply complete terrain coverage.`);
    }
}

