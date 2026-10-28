/** Spatial parent/part association for OSM building polygons. @packageDocumentation */
import type { GeoJSONFeature } from '@/types';
import { SpatialGrid, closestPoint, type Point } from './CollisionWorld';

interface Footprint { feature: GeoJSONFeature; rings: Point[][]; area: number; }
export interface BuildingPartSelection {
    features: GeoJSONFeature[];
    parents: Map<GeoJSONFeature, GeoJSONFeature>;
    suppressed: number;
}

/** Tests ring interior without assuming winding order.
 * @param point - Local horizontal point.
 * @param ring - Closed or open polygon ring.
 * @returns Whether ray crossing places the point inside the ring.
 */
function inside(point: Point, ring: Point[]): boolean {
    let result = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.z > point.z) !== (b.z > point.z)
            && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) result = !result;
    }
    return result;
}

/** Accepts coincident boundaries within three centimetres without including nearby buildings.
 * @param point - Local horizontal point.
 * @param ring - Footprint boundary.
 * @returns Whether the point is on the boundary within numerical tolerance.
 */
function onBoundary(point: Point, ring: Point[]): boolean {
    return ring.some((a, i) => {
        const q = closestPoint(point, a, ring[(i + 1) % ring.length]);
        return Math.hypot(q.x - point.x, q.z - point.z) <= 0.03;
    });
}

/** Matches parts to the smallest enclosing building and suppresses replaced outlines.
 * Each matched part retains its own dimensions and roof geometry. Only building type
 * and appearance materials/colours inherit from the outline. Unmatched parts still render.
 * Parts are authoritative: an outline with matched parts is not separately extruded.
 * @param input - Building features; input objects are not modified.
 * @param project - Converts OSM longitude/latitude pairs to local metres.
 * @returns Renderable polygons, their parent associations and the suppressed-outline count.
 */
export function selectBuildingParts(input: GeoJSONFeature[], project: (coordinate: [number, number]) => Point): BuildingPartSelection {
    const polygons: GeoJSONFeature[] = [];
    for (const feature of input) {
        if (feature.geometry.type === 'Polygon') polygons.push(feature);
        else if (feature.geometry.type === 'MultiPolygon') for (const coordinates of feature.geometry.coordinates)
            polygons.push({ ...feature, geometry: { type: 'Polygon', coordinates } });
    }
    const grid = new SpatialGrid<Footprint>(100);
    const parts: Footprint[] = [];
    for (const feature of polygons) {
        if (feature.geometry.type !== 'Polygon') continue;
        const rings = feature.geometry.coordinates.map(r => r.map(project)).filter(r => r.length >= 3);
        if (!rings[0]) continue;
        let area = 0;
        const ring = rings[0];
        for (let i = 0; i < ring.length; i++) area += ring[i].x * ring[(i + 1) % ring.length].z - ring[(i + 1) % ring.length].x * ring[i].z;
        const footprint = { feature, rings, area: Math.abs(area) / 2 };
        const part = feature.properties['building:part'];
        if (part !== undefined && part !== 'no' && part !== false) parts.push(footprint);
        else if (feature.properties.building && !['no', 'ship', 'houseboat', 'pier', 'bridge'].includes(String(feature.properties.building))) {
            grid.insert(footprint, Math.min(...ring.map(p => p.x)) - 0.03, Math.min(...ring.map(p => p.z)) - 0.03,
                Math.max(...ring.map(p => p.x)) + 0.03, Math.max(...ring.map(p => p.z)) + 0.03);
        }
    }
    const parents = new Map<GeoJSONFeature, GeoJSONFeature>();
    const replacements = new Map<GeoJSONFeature, GeoJSONFeature>();
    const suppressed = new Set<GeoJSONFeature>();
    for (const part of parts) {
        const ring = part.rings[0], point = ring[0];
        let parent: Footprint | undefined;
        for (const candidate of grid.at(point.x, point.z)) {
            if (candidate.area + 0.01 < part.area || parent && candidate.area >= parent.area) continue;
            let contained = true;
            for (let i = 0; i < ring.length && contained; i++) for (const t of [0, 0.25, 0.5, 0.75]) {
                const a = ring[i], b = ring[(i + 1) % ring.length];
                const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
                if (!(inside(p, candidate.rings[0]) || onBoundary(p, candidate.rings[0]))
                    || candidate.rings.slice(1).some(hole => inside(p, hole) && !onBoundary(p, hole))) {
                    contained = false; break;
                }
            }
            if (contained) parent = candidate;
        }
        const properties = { ...part.feature.properties };
        const type = String(properties['building:part']);
        if (parent) {
            for (const key of ['building', 'building:colour', 'building:color', 'building:material', 'roof:colour', 'roof:color', 'roof:material'])
                if (properties[key] === undefined) properties[key] = parent.feature.properties[key];
            suppressed.add(parent.feature);
        }
        if (type !== 'yes') properties.building = type;
        const resolved = { ...part.feature, properties };
        replacements.set(part.feature, resolved);
        if (parent) parents.set(resolved, parent.feature);
    }
    return { features: polygons.filter(f => !suppressed.has(f)).map(f => replacements.get(f) ?? f), parents, suppressed: suppressed.size };
}
