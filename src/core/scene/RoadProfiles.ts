import * as THREE from 'three';
import { SpatialGrid, closestPoint } from './CollisionWorld';
import type { Point } from './CollisionWorld';
import type { SurfaceSample } from './ElevationTerrain';

export type RoadKind = 'ground' | 'bridge' | 'tunnel';
export interface RoadLevelOverride {
    kind?: RoadKind;
    startHeight?: number;
    endHeight?: number;
    heightOffset?: number;
    clearance?: number;
    headroom?: number;
}
export interface RoadLevelSettings {
    layerSeparation: number;
    tunnelCover: number;
    tunnelHeadroom: number;
    rampLength: number;
    maxGrade: number;
    deckThickness: number;
    overrides: Record<string, RoadLevelOverride>;
}
export const DEFAULT_ROAD_LEVELS: RoadLevelSettings = {
    layerSeparation: 5, tunnelCover: 2, tunnelHeadroom: 3.5,
    rampLength: 35, maxGrade: 0.22, deckThickness: 0.5, overrides: {}
};
export interface RoadInput {
    id: string; points: Point[]; kind: RoadKind; layer: number;
    halfWidth: number; surface: string; lanes?: number; headroom?: number;
}
interface Node extends Point {
    ground: number; height: number;
    links: Array<{ node: Node; length: number; kind: RoadKind }>;
    kinds: Set<RoadKind>; layers: number[];
}
interface Segment { a: Node; b: Node; road: RoadProfile; }
export interface RoadContact extends SurfaceSample {
    surface: string; grip: number; structure: RoadKind; roadId?: string; ceiling?: number;
}

const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };

export class RoadProfile {
    readonly nodes: Node[];
    readonly curve: THREE.Curve<THREE.Vector3>;
    readonly headroom: number;
    private grid = new SpatialGrid<Segment>();
    private segments: Segment[] = [];
    constructor(readonly input: RoadInput, nodes: Node[], private groundAt: (x: number, z: number) => SurfaceSample, settings: RoadLevelSettings) {
        this.nodes = nodes;
        this.headroom = settings.overrides[input.id]?.headroom ?? input.headroom ?? settings.tunnelHeadroom;
        const profile = this;
        const path = new THREE.CatmullRomCurve3(nodes.map(p => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
        this.curve = new class extends THREE.Curve<THREE.Vector3> {
            constructor() { super(); }
            getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
                path.getPoint(t, target);
                target.y = profile.sample(target.x, target.z).height;
                return target;
            }
        }();
        for (let i = 1; i < nodes.length; i++) {
            const segment = { a: nodes[i - 1], b: nodes[i], road: this };
            this.segments.push(segment);
            this.grid.insert(segment, Math.min(segment.a.x, segment.b.x) - input.halfWidth - 3,
                Math.min(segment.a.z, segment.b.z) - input.halfWidth - 3,
                Math.max(segment.a.x, segment.b.x) + input.halfWidth + 3,
                Math.max(segment.a.z, segment.b.z) + input.halfWidth + 3);
        }
    }

    sample(x: number, z: number): RoadContact {
        let best: Segment | undefined, distance = Infinity, along = 0;
        const nearby = [...this.grid.at(x, z)];
        for (const segment of nearby.length ? nearby : this.segments) {
            const q = closestPoint({ x, z }, segment.a, segment.b), d = Math.hypot(q.x - x, q.z - z);
            if (d < distance) {
                distance = d; best = segment;
                const length = Math.hypot(segment.b.x - segment.a.x, segment.b.z - segment.a.z);
                along = length ? Math.hypot(q.x - segment.a.x, q.z - segment.a.z) / length : 0;
            }
        }
        const ground = this.groundAt(x, z);
        let height = ground.height + 0.06, slopeX = ground.slopeX, slopeZ = ground.slopeZ;
        if (best) {
            const { a, b } = best, dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz || 1;
            if (this.input.kind === 'ground') {
                const oa = a.height - a.ground, ob = b.height - b.ground;
                height += oa + (ob - oa) * along;
                slopeX += (ob - oa) * dx / length2; slopeZ += (ob - oa) * dz / length2;
            } else {
                height = a.height + (b.height - a.height) * along;
                slopeX = (b.height - a.height) * dx / length2; slopeZ = (b.height - a.height) * dz / length2;
            }
        }
        const surface = this.input.surface;
        const grip = ['gravel', 'dirt', 'ground', 'sand'].includes(surface) ? 0.6 : surface === 'cobblestone' ? 0.8 : 1;
        return { height, slopeX, slopeZ, surface, grip, structure: this.input.kind, roadId: this.input.id,
            ceiling: this.input.kind === 'tunnel' ? height + this.headroom : undefined };
    }
}

/** Estimated road profiles: OSM supplies ordering/connectivity, not surveyed metre heights. */
export class RoadProfileNetwork {
    readonly profiles: RoadProfile[] = [];
    private nodes = new Map<string, Node>();
    private segments: Segment[] = [];
    readonly settings: RoadLevelSettings;

    constructor(inputs: RoadInput[], groundAt: (x: number, z: number) => SurfaceSample,
        options: Partial<RoadLevelSettings> = {}, referenceHeight = 0) {
        this.settings = { ...DEFAULT_ROAD_LEVELS, ...options, overrides: options.overrides ?? {} };
        for (const key of ['layerSeparation', 'tunnelCover', 'tunnelHeadroom', 'rampLength', 'maxGrade', 'deckThickness'] as const) {
            if (!Number.isFinite(this.settings[key]) || this.settings[key] <= 0) this.settings[key] = DEFAULT_ROAD_LEVELS[key];
        }
        for (const input of inputs) {
            input.kind = this.settings.overrides[input.id]?.kind ?? input.kind;
            const points: Node[] = [];
            for (let i = 0; i < input.points.length - 1; i++) {
                const a = input.points[i], b = input.points[i + 1];
                const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 5));
                for (let j = 0; j < steps; j++) points.push(this.node(a.x + (b.x - a.x) * j / steps, a.z + (b.z - a.z) * j / steps, input, groundAt));
            }
            const last = input.points[input.points.length - 1];
            points.push(this.node(last.x, last.z, input, groundAt));
            const filtered = points.filter((node, i) => !i || node !== points[i - 1]);
            if (filtered.length < 2) continue;
            const profile = new RoadProfile(input, filtered, groundAt, this.settings);
            this.profiles.push(profile);
            for (let i = 1; i < filtered.length; i++) {
                const a = filtered[i - 1], b = filtered[i], length = Math.hypot(b.x - a.x, b.z - a.z);
                a.links.push({ node: b, length, kind: input.kind }); b.links.push({ node: a, length, kind: input.kind });
                this.segments.push({ a, b, road: profile });
            }
        }
        this.plan('bridge'); this.plan('tunnel');
        this.separateCrossings();
        this.limitGrades('bridge'); this.limitGrades('tunnel');
        // Tunnel exits can share nodes with bridges. Reconcile both networks together
        // after planning so changing a shared exit cannot leave a vertical step.
        this.limitGrades('all');
        const offsets = new Map<Node, number[]>();
        for (const road of this.profiles) {
            const override = this.settings.overrides[road.input.id];
            if (!override) continue;
            if (Number.isFinite(override.heightOffset)) for (const node of road.nodes) {
                const values = offsets.get(node) ?? []; values.push(override.heightOffset!); offsets.set(node, values);
            }
        }
        for (const [node, values] of offsets) node.height += values.reduce((a, b) => a + b, 0) / values.length;
        const corrections = new Map<Node, number[]>();
        for (const road of this.profiles) {
            const override = this.settings.overrides[road.input.id];
            if (!override) continue;
            const startDelta = Number.isFinite(override.startHeight) ? override.startHeight! - referenceHeight - road.nodes[0].height : 0;
            const endDelta = Number.isFinite(override.endHeight) ? override.endHeight! - referenceHeight - road.nodes[road.nodes.length - 1].height : 0;
            const lengths = [0];
            for (let i = 1; i < road.nodes.length; i++) lengths.push(lengths[i - 1] + Math.hypot(road.nodes[i].x - road.nodes[i - 1].x, road.nodes[i].z - road.nodes[i - 1].z));
            for (let i = 0; i < road.nodes.length; i++) {
                const t = lengths[i] / lengths[lengths.length - 1];
                const values = corrections.get(road.nodes[i]) ?? [];
                values.push(startDelta * (1 - t) + endDelta * t); corrections.set(road.nodes[i], values);
            }
        }
        for (const [node, values] of corrections) node.height += values.reduce((a, b) => a + b, 0) / values.length;
        this.blendApproaches();
    }

    private node(x: number, z: number, road: RoadInput, groundAt: (x: number, z: number) => SurfaceSample): Node {
        const key = `${x.toFixed(3)},${z.toFixed(3)}`;
        let node = this.nodes.get(key);
        if (!node) {
            const ground = groundAt(x, z).height + 0.06;
            node = { x, z, ground, height: ground, links: [], kinds: new Set(), layers: [] }; this.nodes.set(key, node);
        }
        node.kinds.add(road.kind); node.layers.push(road.layer);
        return node;
    }

    private distances(sources: Node[], kind: RoadKind, limit = Infinity): Map<Node, number> {
        const distance = new Map<Node, number>(sources.map(node => [node, 0])), queue = [...sources];
        for (let i = 0; i < queue.length; i++) {
            const node = queue[i], d = distance.get(node)!;
            for (const link of node.links) {
                if (link.kind !== kind || d + link.length > limit) continue;
                if (d + link.length < (distance.get(link.node) ?? Infinity)) {
                    distance.set(link.node, d + link.length); queue.push(link.node);
                }
            }
        }
        return distance;
    }

    private plan(kind: 'bridge' | 'tunnel'): void {
        const visited = new Set<Node>();
        for (const start of this.nodes.values()) {
            if (visited.has(start) || !start.kinds.has(kind)) continue;
            const component = [start]; visited.add(start);
            for (let i = 0; i < component.length; i++) for (const link of component[i].links) {
                if (link.kind === kind && !visited.has(link.node)) { visited.add(link.node); component.push(link.node); }
            }
            const portals = component.filter(node => node.kinds.size > 1 || node.links.filter(link => link.kind === kind).length === 1);
            const distance = this.distances(portals, kind);
            const anchorDistances = portals.map(portal => ({ portal, distance: this.distances([portal], kind) }));
            const maxDistance = Math.max(1, ...component.map(node => distance.get(node) ?? this.settings.rampLength));
            const clearances = this.profiles.filter(road => road.input.kind === kind && component.includes(road.nodes[0]))
                .map(road => this.settings.overrides[road.input.id]?.clearance)
                .filter((value): value is number => Number.isFinite(value) && value! > 0);
            const clearance = Math.max(this.settings.layerSeparation, ...clearances);
            for (const node of component) {
                const anchors = anchorDistances.map(anchor => ({ y: anchor.portal.ground, d: anchor.distance.get(node) ?? Infinity }))
                    .sort((a, b) => a.d - b.d).slice(0, 2);
                let base = node.ground;
                if (anchors[0]?.d === 0) base = anchors[0].y;
                else if (anchors.length === 1) base = anchors[0].y;
                else if (anchors.length === 2) base = (anchors[0].y * anchors[1].d + anchors[1].y * anchors[0].d) / (anchors[0].d + anchors[1].d);
                const level = Math.max(1, ...node.layers.map(layer => Math.abs(layer)));
                if (kind === 'bridge') node.height = Math.max(base, node.ground + clearance * level);
                else {
                    const blend = smooth((distance.get(node) ?? this.settings.rampLength) / Math.min(this.settings.rampLength, maxDistance));
                    const depth = Math.min(Math.max(clearance * level, this.settings.tunnelHeadroom + this.settings.tunnelCover),
                        maxDistance * this.settings.maxGrade * 0.65);
                    node.height = base - depth * blend;
                }
            }
        }
    }

    private separateCrossings(): void {
        const grid = new SpatialGrid<Segment>(40);
        for (const segment of this.segments) grid.insert(segment, Math.min(segment.a.x, segment.b.x), Math.min(segment.a.z, segment.b.z), Math.max(segment.a.x, segment.b.x), Math.max(segment.a.z, segment.b.z));
        for (let pass = 0; pass < 3; pass++) for (const a of this.segments) {
            if (a.road.input.kind === 'ground') continue;
            const middle = { x: (a.a.x + a.b.x) / 2, z: (a.a.z + a.b.z) / 2 };
            const candidates = new Set([...grid.at(a.a.x, a.a.z), ...grid.at(middle.x, middle.z), ...grid.at(a.b.x, a.b.z)]);
            for (const b of candidates) {
                if (a.road === b.road || a.road.input.layer === b.road.input.layer || [b.a, b.b].includes(a.a) || [b.a, b.b].includes(a.b)) continue;
                const ax = a.b.x - a.a.x, az = a.b.z - a.a.z, bx = b.b.x - b.a.x, bz = b.b.z - b.a.z;
                const det = ax * bz - az * bx;
                if (Math.abs(det) < 1e-8) continue;
                const dx = b.a.x - a.a.x, dz = b.a.z - a.a.z;
                const ta = (dx * bz - dz * bx) / det, tb = (dx * az - dz * ax) / det;
                if (ta < 0 || ta > 1 || tb < 0 || tb > 1) continue;
                const ya = a.a.height + (a.b.height - a.a.height) * ta, yb = b.a.height + (b.b.height - b.a.height) * tb;
                const upper = a.road.input.layer > b.road.input.layer ? a : b;
                const lower = upper === a ? b : a;
                const gap = upper === a ? ya - yb : yb - ya;
                const needed = this.settings.layerSeparation - gap;
                if (needed <= 0.01) continue;
                const adjusted = upper.road.input.kind === 'bridge' ? upper : lower;
                if (adjusted.road.input.kind === 'ground') continue;
                const sign = adjusted === upper ? 1 : -1;
                const spread = this.distances([adjusted.a, adjusted.b], adjusted.road.input.kind,
                    Math.max(this.settings.rampLength, needed * 1.5 / this.settings.maxGrade));
                for (const [node, distance] of spread) node.height += sign * needed * (1 - smooth(distance / Math.max(this.settings.rampLength, needed * 1.5 / this.settings.maxGrade)));
            }
        }
    }

    private limitGrades(kind: 'bridge' | 'tunnel' | 'all'): void {
        const queue = [...this.nodes.values()].filter(node => kind === 'all' ? node.kinds.has('bridge') || node.kinds.has('tunnel') : node.kinds.has(kind));
        for (let i = 0; i < queue.length; i++) {
            const node = queue[i];
            for (const link of node.links) {
                if (kind === 'all' ? link.kind === 'ground' : link.kind !== kind) continue;
                const limit = link.length * this.settings.maxGrade;
                if (kind === 'bridge' && node.height - link.node.height > limit + 0.000001) {
                    link.node.height = node.height - limit; queue.push(link.node);
                } else if (kind !== 'bridge' && link.node.height - node.height > limit + 0.000001) {
                    link.node.height = node.height + limit; queue.push(link.node);
                }
            }
        }
    }

    private blendApproaches(): void {
        const changes = new Map<Node, number>();
        for (const node of this.nodes.values()) {
            if (!node.kinds.has('ground') || node.kinds.size < 2) continue;
            const offset = node.height - node.ground;
            const length = Math.max(this.settings.rampLength, Math.abs(offset) * 1.5 / this.settings.maxGrade);
            for (const [neighbor, distance] of this.distances([node], 'ground', length)) {
                if (neighbor.kinds.size > 1) continue;
                const change = offset * (1 - smooth(distance / length));
                if (Math.abs(change) > Math.abs(changes.get(neighbor) ?? 0)) changes.set(neighbor, change);
            }
        }
        for (const [node, offset] of changes) node.height = node.ground + offset;
    }
}
