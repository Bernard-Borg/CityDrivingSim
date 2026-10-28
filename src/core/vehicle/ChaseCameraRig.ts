/**
 * ChaseCameraRig types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";

/** Current-frame orbit: horizontal distance cannot grow with vehicle speed. */
export function chaseOrbitPosition(
    anchor: THREE.Vector3,
    yaw: number,
    angle: number,
    pitch: number,
    distance: number,
): THREE.Vector3 {
    const horizontal = Math.cos(pitch) * distance;
    const offset = new THREE.Vector3(
        Math.sin(angle) * horizontal,
        Math.sin(pitch) * distance,
        -Math.cos(angle) * horizontal,
    );
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    return anchor.clone().add(offset);
}
