/**
 * SceneVisibility types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";

/** Buffered distance activation; normal Three.js frustum culling still handles camera direction. */
export class SceneVisibility {
    private entries: Array<{
        object: THREE.Object3D;
        sphere: THREE.Sphere;
        range: number;
    }> = [];
    private roots: THREE.Object3D[] = [];
    private lastUpdate = -Infinity;
    /**
     * Rebuilds the spatial representation from the supplied scene objects or solved road profiles.
     *
     * @param roots - Static scenery roots to register.
     */
    build(roots: THREE.Object3D[]): void {
        this.clear();
        this.roots = roots;
        for (const root of roots) {
            root.updateMatrixWorld(true);
            const range = Number(root.userData.cullDistance ?? 1200);
            /**
             * Collects renderable bounds, treating an LOD hierarchy as one activation entry.
             *
             * @param object - Scene node whose renderable descendants should be registered.
             */
            const visit = (object: THREE.Object3D) => {
                if (object instanceof THREE.LOD) {
                    const box = new THREE.Box3().setFromObject(object);
                    this.entries.push({
                        object,
                        sphere: box.getBoundingSphere(new THREE.Sphere()),
                        range,
                    });
                    return;
                }
                if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
                    let sphere: THREE.Sphere;
                    if (object instanceof THREE.Sprite)
                        sphere = new THREE.Sphere(
                            object.getWorldPosition(new THREE.Vector3()),
                            object.getWorldScale(new THREE.Vector3()).length() / 2,
                        );
                    else if (object instanceof THREE.InstancedMesh) {
                        object.computeBoundingSphere();
                        sphere = object.boundingSphere!.clone().applyMatrix4(object.matrixWorld);
                    } else {
                        object.geometry.computeBoundingSphere();
                        sphere = object.geometry
                            .boundingSphere!.clone()
                            .applyMatrix4(object.matrixWorld);
                    }
                    if (Number.isFinite(sphere.radius))
                        this.entries.push({ object, sphere, range });
                }
                object.children.forEach(visit);
            };
            visit(root);
            root.traverse((object) => {
                object.matrixAutoUpdate = false;
                object.matrixWorldAutoUpdate = false;
            });
        }
    }
    /**
     * Updates distance activation at 10 Hz unless forced, with extra exit range for currently visible objects.
     *
     * @param position - Local position or saved geographic position, as indicated by the parameter type.
     * @param seconds - Animation time in seconds.
     * @param force - Whether to bypass the normal refresh interval.
     */
    update(position: THREE.Vector3, seconds: number, force = false): void {
        if (!force && seconds - this.lastUpdate < 0.1) return;
        this.lastUpdate = seconds;
        for (const { object, sphere, range } of this.entries) {
            const distance = range + sphere.radius + (object.visible ? 100 : 0);
            object.visible = sphere.center.distanceToSquared(position) <= distance * distance;
        }
    }
    /**
     * Clears generated content and cached lookup data so the instance can be reused.
     */
    clear(): void {
        for (const root of this.roots)
            root.traverse((object) => {
                object.matrixAutoUpdate = true;
                object.matrixWorldAutoUpdate = true;
            });
        for (const { object } of this.entries) object.visible = true;
        this.roots = [];
        this.entries = [];
        this.lastUpdate = -Infinity;
    }
}
