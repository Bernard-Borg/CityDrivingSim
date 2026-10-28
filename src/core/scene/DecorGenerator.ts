/**
 * DecorGenerator types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";
import type { GeoJSON, GeoJSONFeature } from "@/types";
import { CollisionWorld, type Point } from "./CollisionWorld";
import { BusStopSigns } from "./BusStopSigns";

type Shape = "box" | "cylinder" | "sphere" | "cone";
/** Simple, recognizable street furniture, instanced by primitive/material and 200 m cell. */
export class DecorGenerator {
    private group = new THREE.Group();
    private busStops = new BusStopSigns();
    private geometries: Record<Shape, THREE.BufferGeometry> = {
        box: new THREE.BoxGeometry(1, 1, 1),
        cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
        sphere: new THREE.SphereGeometry(0.5, 8, 6),
        cone: new THREE.ConeGeometry(0.5, 1, 8),
    };
    private materials = new Map<number, THREE.MeshStandardMaterial>();
    private batches = new Map<string, { shape: Shape; color: number; matrices: THREE.Matrix4[] }>();
    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param scene - Scene receiving generated objects; ownership remains with the caller.
     * @param collisions - Shared collision world receiving generated obstacles.
     */
    constructor(
        private scene: THREE.Scene,
        private collisions: CollisionWorld,
    ) {
        this.group.userData.cullDistance = 500;
        this.busStops.group.userData.cullDistance = 150;
        this.group.name = "Street furniture";
        scene.add(this.group);
        scene.add(this.busStops.group);
    }
    /**
     * Generates the supported OSM features using the supplied coordinate and elevation samplers.
     *
     * @param data - OSM-derived GeoJSON collection.
     * @param project - Projection from latitude/longitude to local horizontal coordinates.
     * @param heightAt - Base-elevation sampler in local metres.
     * @param contains - Reports whether a local point is within the supported generation area.
     */
    generate(
        data: GeoJSON,
        project: (lat: number, lon: number) => Point,
        heightAt: (x: number, z: number, layer: number, wall: boolean) => number,
        contains: (x: number, z: number) => boolean,
    ): void {
        this.clear();
        let generated = 0;
        const metal = 0x454e52,
            wood = 0x9c714b,
            stone = 0xb8afa0,
            green = 0x46643c,
            blue = 0x3c779b;
        for (const feature of data.features) {
            const p = feature.properties,
                g = feature.geometry;
            const isBusStop = p.highway === "bus_stop"
                || ((p.public_transport === "platform" || p.highway === "platform") && p.bus === "yes");
            // Keep bus-stop signs, but omit other platform outlines and amenities.
            if (!isBusStop && (p.highway === "platform" || p.public_transport === "platform"
                || p.railway === "platform" || p["construction:railway"] === "platform")) continue;
            const coords =
                g.type === "Point"
                    ? [g.coordinates]
                    : g.type === "LineString"
                      ? g.coordinates
                      : g.type === "Polygon"
                        ? g.coordinates[0]
                        : g.coordinates[0]?.[0];
            if (!coords?.length) continue;
            const points = coords.map(([lon, lat]) => project(lat, lon));
            const layer = Number(p.layer) || 0;
            /**
             * Resolves the current decor feature elevation, passing its layer and barrier classification to the sampler.
             *
             * @param pt - Local horizontal point at which to resolve the current feature base height.
             */
            const height = (pt: Point) =>
                heightAt(
                    pt.x,
                    pt.z,
                    layer,
                    ["wall", "retaining_wall", "fence", "guard_rail", "chain"].includes(
                        String(p.barrier),
                    ) || p.historic === "citywalls",
                );
            const platform = p.highway === "platform" || p.public_transport === "platform";
            const barrier = String(p.barrier ?? (p.historic === "citywalls" ? "wall" : ""));
            const linear =
                [
                    "wall",
                    "retaining_wall",
                    "hedge",
                    "fence",
                    "chain",
                    "guard_rail",
                    "kerb",
                ].includes(barrier) ||
                platform ||
                p.man_made === "embankment" ||
                p.man_made === "cutting";
            if (linear && !isBusStop && points.length > 1) {
                const h = this.dimension(
                    p.height,
                    platform
                        ? 0.1
                        : barrier === "kerb"
                          ? 0.12
                          : barrier === "guard_rail"
                            ? 0.8
                            : barrier === "hedge"
                              ? 1.5
                              : 1.8,
                    0.08,
                    12,
                );
                const width = this.dimension(
                    p.width,
                    platform ? 1.5 : barrier === "kerb" ? 0.18 : barrier === "hedge" ? 0.65 : 0.3,
                    0.08,
                    3,
                );
                let made = false;
                for (let i = 1; i < points.length; i++) {
                    const a = points[i - 1],
                        b = points[i],
                        distance = Math.hypot(b.x - a.x, b.z - a.z);
                    const steps = Math.ceil(distance / 3);
                    for (let j = 0; j < steps; j++) {
                        const t = j / steps,
                            u = (j + 1) / steps;
                        const start = {
                            x: a.x + (b.x - a.x) * t,
                            z: a.z + (b.z - a.z) * t,
                        };
                        const end = {
                            x: a.x + (b.x - a.x) * u,
                            z: a.z + (b.z - a.z) * u,
                        };
                        const mid = {
                            x: (start.x + end.x) / 2,
                            z: (start.z + end.z) / 2,
                        };
                        if (!contains(start.x, start.z) || !contains(end.x, end.z)) continue;
                        const ya = height(start),
                            yb = height(end),
                            length = Math.hypot(end.x - start.x, end.z - start.z);
                        const yaw = Math.atan2(end.x - start.x, end.z - start.z),
                            rail = ["fence", "chain", "guard_rail"].includes(barrier);
                        const y = (ya + yb) / 2;
                        this.part(
                            "box",
                            rail ? metal : barrier === "hedge" ? green : stone,
                            mid.x,
                            y + (rail ? h * 0.7 : h / 2),
                            mid.z,
                            width,
                            rail ? 0.12 : h,
                            Math.hypot(length, yb - ya),
                            yaw,
                            -Math.atan2(yb - ya, length),
                        );
                        if (rail)
                            this.part(
                                "cylinder",
                                metal,
                                start.x,
                                ya + h / 2,
                                start.z,
                                0.09,
                                h,
                                0.09,
                            );
                        if (barrier !== "kerb" && !platform) {
                            const nx = (Math.cos(yaw) * width) / 2,
                                nz = (-Math.sin(yaw) * width) / 2;
                            this.collisions.addPolygon(
                                [
                                    [
                                        { x: start.x + nx, z: start.z + nz },
                                        { x: end.x + nx, z: end.z + nz },
                                        { x: end.x - nx, z: end.z - nz },
                                        { x: start.x - nx, z: start.z - nz },
                                    ],
                                ],
                                Math.min(ya, yb),
                                Math.max(ya, yb) + h,
                            );
                        }
                        made = true;
                    }
                }
                if (made) generated++;
                continue;
            }
            // Polygons use their footprint centroid, not the first corner; line platforms use a midpoint.
            const unique = g.type === "Polygon" && points.length > 1 ? points.slice(0, -1) : points;
            const pt =
                g.type === "Point"
                    ? points[0]
                    : {
                          x: unique.reduce((v, q) => v + q.x, 0) / unique.length,
                          z: unique.reduce((v, q) => v + q.z, 0) / unique.length,
                      };
            if (!contains(pt.x, pt.z)) continue;
            const y = height(pt),
                direction = Number(p.direction),
                yaw = Number.isFinite(direction) ? (direction * Math.PI) / 180 : 0;
            /**
             * Registers an item or generated feature with this instance using the supplied geometry and metadata.
             *
             * @param shape - Primitive kind or vehicle collision dimensions, as indicated by its type.
             * @param color - Primitive material colour.
             * @param x - Local eastward coordinate in metres.
             * @param up - Vertical offset in the current feature frame.
             * @param z - Local southward coordinate in metres.
             * @param sx - Primitive width scale.
             * @param sy - Primitive height scale.
             * @param sz - Primitive depth scale.
             */
            const add = (
                shape: Shape,
                color: number,
                x: number,
                up: number,
                z: number,
                sx: number,
                sy: number,
                sz: number,
            ) => {
                this.part(
                    shape,
                    color,
                    pt.x + x * Math.cos(yaw) + z * Math.sin(yaw),
                    y + up,
                    pt.z - x * Math.sin(yaw) + z * Math.cos(yaw),
                    sx,
                    sy,
                    sz,
                    yaw,
                );
            };
            /**
             * Adds a vertical post in the current decor feature frame.
             *
             * @param h - Post height in metres.
             */
            const post = (h = 2.4) => add("cylinder", metal, 0, h / 2, 0, 0.075, h, 0.075);
            let radius = 0.2,
                solid = true,
                collisionOffset = 0;
            const amenity = String(p.amenity ?? ""),
                man = String(p.man_made ?? "");
            if (amenity === "bench") {
                add("box", wood, 0, 0.48, 0, 1.8, 0.12, 0.5);
                add("box", wood, 0, 0.85, 0.22, 1.8, 0.55, 0.09);
                for (const x of [-0.65, 0.65]) add("box", metal, x, 0.22, 0, 0.08, 0.44, 0.4);
                radius = 0.7;
            } else if (["waste_basket", "recycling", "grit_bin"].includes(amenity)) {
                const scale = amenity === "recycling" ? 1.5 : 1;
                add(
                    "cylinder",
                    amenity === "recycling" ? green : metal,
                    0,
                    0.4 * scale,
                    0,
                    0.48 * scale,
                    0.8 * scale,
                    0.48 * scale,
                );
                add("cylinder", 0x242b2c, 0, 0.82 * scale, 0, 0.52 * scale, 0.08, 0.52 * scale);
                radius = 0.3 * scale;
            } else if (
                p.highway === "street_lamp" ||
                man === "utility_pole" ||
                p.power === "pole" ||
                man === "surveillance"
            ) {
                const h = this.dimension(p.height, 6, 2, 18);
                post(h);
                add("box", metal, 0, h, 0.5, 0.12, 0.12, 1.1);
                add(
                    "box",
                    man === "surveillance" ? stone : 0xf2e2b5,
                    0,
                    h - 0.1,
                    1,
                    0.35,
                    0.16,
                    0.65,
                );
            } else if (isBusStop) {
                post(2.7);
                add("box", metal, 0, 2.35, 0, 1.45, 0.75, 0.12);
                this.busStops.add(p, pt.x, y, pt.z, yaw);
            } else if (p.traffic_sign || p.information || p.advertising || amenity === "clock") {
                post();
                const board = p.advertising || p.information === "map" || p.information === "board";
                add("box", stone, 0, 2, 0, board ? 1.3 : 0.48, board ? 1 : 0.6, 0.1);
                add(
                    "box",
                    p.traffic_sign ? 0xa44237 : blue,
                    0,
                    2,
                    -0.06,
                    board ? 1.15 : 0.38,
                    board ? 0.84 : 0.48,
                    0.015,
                );
            } else if (amenity === "shelter") {
                for (const x of [-1.3, 1.3])
                    for (const z of [-0.6, 0.6]) add("cylinder", metal, x, 1.2, z, 0.09, 2.4, 0.09);
                add("box", metal, 0, 2.45, 0, 3, 0.16, 1.6);
                solid = false;
            } else if (amenity === "bicycle_parking" || barrier === "cycle_barrier") {
                for (const x of [-0.6, 0, 0.6]) {
                    add("box", metal, x, 0.75, 0, 0.06, 0.06, 1.1);
                    for (const z of [-0.5, 0.5])
                        add("cylinder", metal, x, 0.38, z, 0.06, 0.76, 0.06);
                }
                radius = 0.55;
            } else if (amenity === "fountain") {
                add("cylinder", stone, 0, 0.2, 0, 2.2, 0.4, 2.2);
                add("cylinder", blue, 0, 0.42, 0, 1.95, 0.025, 1.95);
                add("cone", 0xb6dce1, 0, 0.9, 0, 0.22, 1, 0.22);
                radius = 1.1;
            } else if (
                ["drinking_water", "post_box", "telephone", "parking_meter"].includes(amenity) ||
                man === "water_tap" ||
                man === "street_cabinet" ||
                p.emergency === "fire_hydrant"
            ) {
                const hydrant = p.emergency === "fire_hydrant";
                add(
                    hydrant ? "cylinder" : "box",
                    hydrant || amenity === "post_box" ? 0xad4033 : metal,
                    0,
                    0.55,
                    0,
                    0.4,
                    1.1,
                    0.35,
                );
                if (hydrant || amenity === "drinking_water" || man === "water_tap")
                    add("box", stone, 0, 0.85, -0.2, 0.5, 0.12, 0.3);
            } else if (
                man === "flagpole" ||
                man === "mast" ||
                man === "tower" ||
                p.power === "tower"
            ) {
                const h = this.dimension(p.height, man === "flagpole" ? 7 : 12, 3, 40);
                post(h);
                if (man === "flagpole") add("box", 0xbe5650, 0.65, h - 0.6, 0, 1.3, 0.8, 0.025);
                else
                    for (const up of [h * 0.65, h * 0.9])
                        add("box", metal, 0, up, 0, 2.4, 0.13, 0.13);
            } else if (p.artwork_type === "statue" || p.artwork_type === "sculpture"
                || p.memorial === "statue" || p.historic === "statue") {
                const scale = this.dimension(p.height, 2.8, 1, 8) / 2.8;
                const rock = 0x827d70, shadow = 0x49483f;
                /** Adds one stone feature in normalized moai coordinates.
                 * @param color - Stone colour for this feature.
                 * @param x - Horizontal offset relative to the statue centre.
                 * @param up - Height above the statue base.
                 * @param z - Depth offset; the face points toward positive local Z.
                 * @param sx - Feature width before height scaling.
                 * @param sy - Feature height before height scaling.
                 * @param sz - Feature depth before height scaling.
                 */
                const stonePart = (color: number, x: number, up: number, z: number, sx: number, sy: number, sz: number): void => {
                    add("box", color, x * scale, up * scale, z * scale, sx * scale, sy * scale, sz * scale);
                };
                stonePart(stone, 0, 0.12, 0, 1.15, 0.24, 0.95); // Plinth.
                stonePart(rock, 0, 0.57, -0.06, 0.92, 0.7, 0.65); // Shoulders.
                stonePart(rock, 0, 1.65, 0, 0.82, 2.05, 0.82); // Long head.
                stonePart(rock, 0, 2.66, -0.06, 0.74, 0.28, 0.72); // Flat crown.
                stonePart(rock, 0, 1.03, 0.15, 0.84, 0.46, 0.78); // Heavy chin.
                for (const side of [-1, 1]) {
                    stonePart(shadow, side * 0.21, 2.05, 0.419, 0.29, 0.14, 0.025); // Recessed eyes.
                    stonePart(rock, side * 0.21, 2.2, 0.46, 0.44, 0.18, 0.22); // Brow ridge.
                    stonePart(rock, side * 0.46, 1.92, -0.01, 0.15, 0.65, 0.31); // Ears.
                }
                stonePart(rock, 0, 1.9, 0.52, 0.18, 0.64, 0.32); // Long nose.
                stonePart(rock, 0, 1.61, 0.59, 0.3, 0.16, 0.36);
                stonePart(shadow, 0, 1.36, 0.548, 0.42, 0.055, 0.025); // Mouth slit.
                stonePart(rock, 0, 1.29, 0.52, 0.46, 0.1, 0.13);
                radius = 0.58 * scale;
            } else if (p.historic || p.tourism === "artwork") {
                add("box", stone, 0, 0.3, 0, 1, 0.6, 1);
                add(
                    p.tourism === "artwork" ? "sphere" : "box",
                    p.tourism === "artwork" ? 0x708b89 : stone,
                    0,
                    1.25,
                    0,
                    0.7,
                    1.3,
                    0.7,
                );
                radius = 0.5;
            } else if (
                [
                    "bollard",
                    "block",
                    "stone",
                    "jersey_barrier",
                    "gate",
                    "lift_gate",
                    "swing_gate",
                    "turnstile",
                ].includes(barrier)
            ) {
                const gate = ["gate", "lift_gate", "swing_gate"].includes(barrier);
                collisionOffset = gate ? 2 : 0;
                add(
                    "cylinder",
                    barrier === "bollard" ? metal : stone,
                    collisionOffset,
                    0.45,
                    0,
                    0.28,
                    0.9,
                    0.28,
                );
                if (gate) add("box", 0xdfd6bc, collisionOffset, 1.6, 0, 0.12, 2.3, 0.12); // Open boom: never invent a closed road.
                if (barrier === "jersey_barrier") add("box", stone, 0, 0.4, 0, 1.8, 0.8, 0.5);
            } else if (p.natural === "shrub") {
                add("sphere", green, 0, 0.5, 0, 1.3, 1, 1.3);
                solid = false;
            } else continue;
            if (solid)
                this.collisions.addTrunk(
                    {
                        x: pt.x + collisionOffset * Math.cos(yaw),
                        z: pt.z - collisionOffset * Math.sin(yaw),
                    },
                    radius,
                    y,
                );
            generated++;
        }
        for (const batch of this.batches.values()) {
            let material = this.materials.get(batch.color);
            if (!material) {
                material = new THREE.MeshStandardMaterial({
                    color: batch.color,
                    roughness: 0.85,
                });
                this.materials.set(batch.color, material);
            }
            const mesh = new THREE.InstancedMesh(
                this.geometries[batch.shape],
                material,
                batch.matrices.length,
            );
            batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
            mesh.computeBoundingSphere();
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.group.add(mesh);
        }
        this.batches.clear();
        console.log(
            `Generated ${generated} decor features in ${this.group.children.length} spatial batches`,
        );
    }
    /**
     * Parses a tagged dimension and clamps it to generation bounds, using a fallback for invalid values.
     *
     * @param value - Input value to normalize, clamp or parse.
     * @param fallback - Value used for missing or invalid input.
     * @param min - Inclusive lower bound.
     * @param max - Inclusive upper bound.
     */
    private dimension(
        value: GeoJSONFeature["properties"][string],
        fallback: number,
        min: number,
        max: number,
    ): number {
        const parsed = parseFloat(String(value));
        return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
    }
    /**
     * Appends a scaled and rotated primitive transform to its material and spatial batch.
     *
     * @param shape - Primitive kind or vehicle collision dimensions, as indicated by its type.
     * @param color - Primitive material colour.
     * @param x - Local eastward coordinate in metres.
     * @param y - Local elevation in metres.
     * @param z - Local southward coordinate in metres.
     * @param sx - Primitive width scale.
     * @param sy - Primitive height scale.
     * @param sz - Primitive depth scale.
     * @param yaw - Horizontal rotation in radians.
     * @param pitch - Vertical rotation in radians.
     */
    private part(
        shape: Shape,
        color: number,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        yaw = 0,
        pitch = 0,
    ): void {
        const key = `${Math.floor(x / 200)},${Math.floor(z / 200)},${shape},${color}`;
        let batch = this.batches.get(key);
        if (!batch) {
            batch = { shape, color, matrices: [] };
            this.batches.set(key, batch);
        }
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
        batch.matrices.push(
            new THREE.Matrix4().compose(
                new THREE.Vector3(x, y, z),
                rotation,
                new THREE.Vector3(sx, sy, sz),
            ),
        );
    }
    /**
     * Clears generated content and cached lookup data so the instance can be reused.
     */
    clear(): void {
        this.busStops.clear();
        for (const child of this.group.children) (child as THREE.InstancedMesh).dispose();
        this.group.clear();
        this.batches.clear();
    }
    /**
     * Releases owned resources and unregisters scene objects, browser listeners or audio nodes as applicable.
     */
    dispose(): void {
        this.clear();
        this.busStops.dispose();
        this.scene.remove(this.busStops.group);
        Object.values(this.geometries).forEach((g) => g.dispose());
        this.materials.forEach((m) => m.dispose());
        this.scene.remove(this.group);
    }
}
