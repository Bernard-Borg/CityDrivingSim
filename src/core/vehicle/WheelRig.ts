/** Wheel extraction for glTF exports with separate or merged wheel geometry. @packageDocumentation */
import * as THREE from "three";

/** Creates four wheel-centred assemblies in vehicle space, leaving brake calipers stationary.
 * @param model - Loaded model containing named tyre and rim meshes.
 * @param body - Vehicle-local parent whose positive Z direction is forward.
 * @returns Spin groups and the front steering pivots, ready for animation.
 */
export function createWheelRig(model: THREE.Object3D, body: THREE.Object3D): {
    spin: THREE.Object3D[];
    front: THREE.Object3D[];
} {
    body.updateWorldMatrix(true, true);
    const inverse = body.matrixWorld.clone().invert();
    const sources: THREE.Mesh[] = [];
    model.traverse(node => {
        if (node instanceof THREE.Mesh && /wheel|tire|tyre/i.test(node.name) &&
            !/steering|spare|calliper|caliper|brake|breaks/i.test(node.name)) sources.push(node);
    });
    const corners = Array.from({ length: 4 }, () => ({
        parts: [] as THREE.Mesh[], bounds: new THREE.Box3(),
    }));
    const point = new THREE.Vector3();
    for (const source of sources) {
        const geometry = source.geometry.clone().applyMatrix4(
            new THREE.Matrix4().multiplyMatrices(inverse, source.matrixWorld));
        const positions = geometry.getAttribute("position");
        const index = geometry.getIndex();
        const indices: number[][] = [[], [], [], []];
        const count = index?.count ?? positions.count;
        for (let i = 0; i < count; i += 3) {
            const triangle = [0, 1, 2].map(offset => index ? index.getX(i + offset) : i + offset);
            const x = triangle.reduce((sum, vertex) => sum + positions.getX(vertex), 0);
            const z = triangle.reduce((sum, vertex) => sum + positions.getZ(vertex), 0);
            indices[(x >= 0 ? 1 : 0) + (z >= 0 ? 2 : 0)]!.push(...triangle);
        }
        indices.forEach((vertices, corner) => {
            if (!vertices.length) return;
            const part = geometry.clone();
            part.setIndex(vertices);
            part.clearGroups();
            // glTF primitives normally have one material; retain the first if exported as an array.
            const mesh = new THREE.Mesh(part, Array.isArray(source.material) ? source.material[0] : source.material);
            mesh.castShadow = source.castShadow;
            mesh.receiveShadow = source.receiveShadow;
            corners[corner]!.parts.push(mesh);
            for (const vertex of vertices) corners[corner]!.bounds.expandByPoint(point.fromBufferAttribute(positions, vertex));
        });
        geometry.dispose();
        source.visible = false;
    }
    const spin: THREE.Object3D[] = [], front: THREE.Object3D[] = [];
    corners.forEach((corner, index) => {
        if (!corner.parts.length) return;
        const centre = corner.bounds.getCenter(new THREE.Vector3());
        const steer = new THREE.Group(), wheel = new THREE.Group();
        steer.name = `wheel_${index}_steerPivot`;
        wheel.name = `wheel_${index}_spinPivot`;
        steer.position.copy(centre);
        steer.userData.baseQuat = steer.quaternion.clone();
        steer.add(wheel);
        body.add(steer);
        corner.parts.forEach(mesh => {
            mesh.geometry.translate(-centre.x, -centre.y, -centre.z);
            // Unused source vertices remain in the buffer; bound only the indexed wheel geometry.
            mesh.geometry.boundingBox = corner.bounds.clone().translate(centre.clone().negate());
            mesh.geometry.boundingSphere = mesh.geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
            wheel.add(mesh);
        });
        spin.push(wheel);
        if (index >= 2) front.push(steer);
    });
    return { spin, front };
}

/** Isolates named cabin steering wheels around their geometric hub and tilted column axis.
 * @param model - Loaded glTF model to inspect.
 * @param body - Vehicle-local parent for the animation pivots.
 * @returns Steering-wheel pivots and column axes; empty when the export has no separate wheel.
 */
export function createSteeringWheelRig(model: THREE.Object3D, body: THREE.Object3D):
    Array<{ pivot: THREE.Group; axis: THREE.Vector3 }> {
    body.updateWorldMatrix(true, true);
    const inverse = body.matrixWorld.clone().invert();
    const sources: THREE.Mesh[] = [];
    model.traverse(node => {
        if (node instanceof THREE.Mesh && /steering[ _:]?wheel/i.test(node.name)) sources.push(node);
    });
    return sources.map(source => {
        const geometry = source.geometry.clone().applyMatrix4(
            new THREE.Matrix4().multiplyMatrices(inverse, source.matrixWorld));
        geometry.computeBoundingBox();
        const centre = geometry.boundingBox!.getCenter(new THREE.Vector3());
        geometry.translate(-centre.x, -centre.y, -centre.z);
        const positions = geometry.getAttribute("position");
        let yy = 0, yz = 0, zz = 0;
        for (let i = 0; i < positions.count; i++) {
            const y = positions.getY(i), z = positions.getZ(i);
            yy += y * y; yz += y * z; zz += z * z;
        }
        const tilt = 0.5 * Math.atan2(2 * yz, yy - zz);
        const axis = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
        const pivot = new THREE.Group();
        pivot.name = "cabinSteeringWheelPivot";
        pivot.position.copy(centre);
        const mesh = new THREE.Mesh(geometry, source.material);
        mesh.castShadow = source.castShadow;
        mesh.receiveShadow = source.receiveShadow;
        pivot.add(mesh);
        body.add(pivot);
        source.visible = false;
        return { pivot, axis };
    });
}
