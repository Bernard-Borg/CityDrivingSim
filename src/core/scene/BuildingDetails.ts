/** Named storefronts, building identifiers and animated windmill sails. @packageDocumentation */
import * as THREE from "three";
import type { Point } from "./CollisionWorld";

/** Owns specialized building details and their disposable materials and sign textures. */
export class BuildingDetails {
    private rotors: THREE.Group[] = [];
    private resources: THREE.Material[] = [];

    /** Adds details to a selected building footprint, using its longest wall as the facade.
     * @param parent - Building group receiving the detail objects.
     * @param ring - Outer footprint in local metres.
     * @param tags - Resolved OSM building tags.
     * @param base - Building base elevation.
     * @param top - Building top elevation.
     */
    add(
        parent: THREE.Group,
        ring: Point[],
        tags: Record<string, unknown>,
        base: number,
        top: number,
    ): void {
        const kind = String(tags.building ?? "");
        const kiosk = kind === "kiosk" || tags.shop === "kiosk";
        const market = kind === "supermarket" || tags.shop === "supermarket";
        const hospital = kind === "hospital" || tags.amenity === "hospital";
        const toilets = kind === "toilets" || tags.amenity === "toilets";
        const windmill = kind === "windmill" || tags.man_made === "windmill";
        if (!(kiosk || market || hospital || toilets || windmill)) return;
        let area = 0;
        ring.forEach((a, i) => {
            const b = ring[(i + 1) % ring.length]!;
            area += a.x * b.z - b.x * a.z;
        });
        const edges = ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length]! }));
        edges.sort(
            (a, b) =>
                Math.hypot(b.b.x - b.a.x, b.b.z - b.a.z) - Math.hypot(a.b.x - a.a.x, a.b.z - a.a.z),
        );
        const { a, b } = edges[0]!;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const nx = ((area >= 0 ? 1 : -1) * (b.z - a.z)) / length;
        const nz = ((area >= 0 ? -1 : 1) * (b.x - a.x)) / length;
        const group = new THREE.Group();
        group.position.set((a.x + b.x) / 2, base, (a.z + b.z) / 2);
        group.rotation.y = Math.atan2(nx, nz);
        parent.add(group);
        const material = new THREE.MeshStandardMaterial({
            color: kiosk ? "#28634d" : "#65777c",
            roughness: 0.7,
        });
        this.resources.push(material);
        /** Adds one local box detail with dimensions in metres. */
        const box = (
            x: number,
            y: number,
            z: number,
            w: number,
            h: number,
            d: number,
            mat = material,
        ) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            mesh.position.set(x, y, z);
            mesh.castShadow = mesh.receiveShadow = true;
            group.add(mesh);
            return mesh;
        };
        const height = top - base;
        if (kiosk) {
            box(0, Math.min(height * 0.55, 1.4), 0.12, Math.min(length * 0.75, 3), 1, 0.14);
            box(0, Math.min(height * 0.55, 1.4) + 0.6, 0.5, Math.min(length, 3.6), 0.16, 1.2);
        }
        if (hospital) {
            // One solid, extruded cross silhouette; no font glyph or textured plane.
            const width = Math.max(0.1, Math.min(3, length * 0.6, height * 0.5));
            const outer = width / 2, arm = width / 6;
            const outline = new THREE.Shape();
            outline.moveTo(-arm, outer);
            for (const [x, y] of [[arm, outer], [arm, arm], [outer, arm],
                [outer, -arm], [arm, -arm], [arm, -outer], [-arm, -outer],
                [-arm, -arm], [-outer, -arm], [-outer, arm], [-arm, arm]])
                outline.lineTo(x!, y!);
            outline.closePath();
            const red = new THREE.MeshStandardMaterial({ color: 0xdf2424, roughness: 0.65 });
            this.resources.push(red);
            const cross = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, {
                depth: Math.min(0.18, width * 0.06), bevelEnabled: false, steps: 1,
            }), red);
            cross.name = "Hospital red cross";
            cross.position.set(0, Math.min(height - outer, Math.max(outer, height * 0.7)), 0.12);
            cross.castShadow = cross.receiveShadow = true;
            group.add(cross);
        }
        const text = hospital ? "" : toilets ? "WC  ?  ? / ?" : String(tags.name ?? tags.brand ?? "");
        if (text) {
            const canvas = document.createElement("canvas");
            canvas.width = 1024;
            canvas.height = 256;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = kiosk ? "#28634d" : "#1b343f";
            ctx.fillRect(0, 0, 1024, 256);
            ctx.fillStyle = "#fff6dd";
            const font = kiosk ? '"Trebuchet MS", cursive' : "Arial, sans-serif";
            let size = 120;
            ctx.font = `bold ${size}px ${font}`;
            while (ctx.measureText(text).width > 960 && size > 24) {
                size -= 2;
                ctx.font = `bold ${size}px ${font}`;
            }
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, 512, 133);
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            const signMaterial = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
            });
            this.resources.push(signMaterial);
            const width = Math.min(6, length * 0.85);
            const sign = new THREE.Mesh(
                new THREE.PlaneGeometry(width, width / 4),
                signMaterial,
            );
            sign.position.set(
                0,
                Math.max(0.5, Math.min(height - 0.5, 2.7)),
                0.22,
            );
            group.add(sign);
        }
        if (market && length > 3) {
            // Open trolley basket, handle and four dark wheels, outside the facade.
            for (const x of [-0.32, 0.32]) {
                box(x, 0.65, 1.5, 0.04, 0.45, 0.8);
                box(x, 0.4, 1.5, 0.04, 0.5, 0.04);
                for (const z of [1.2, 1.8]) box(x, 0.13, z, 0.12, 0.2, 0.12);
            }
            box(0, 0.45, 1.5, 0.65, 0.04, 0.8);
            box(0, 0.9, 1.9, 0.7, 0.05, 0.05);
            for (const z of [1.1, 1.9]) box(0, 0.65, z, 0.65, 0.04, 0.04);
        }
        if (windmill) {
            const radius = Math.max(1.5, Math.min(7, height * 0.42));
            const rotor = new THREE.Group();
            rotor.position.set(0, Math.max(radius + 0.5, height * 0.7), 0.65);
            const sailMaterial = new THREE.MeshStandardMaterial({
                color: "#e4d7ad",
                side: THREE.DoubleSide,
            });
            this.resources.push(sailMaterial);
            for (let i = 0; i < 4; i++) {
                const arm = new THREE.Group();
                arm.rotation.z = (i * Math.PI) / 2;
                const sail = new THREE.Mesh(
                    new THREE.BoxGeometry(radius * 0.25, radius, 0.1),
                    sailMaterial,
                );
                sail.position.y = radius * 0.65;
                arm.add(sail);
                rotor.add(arm);
            }
            group.add(rotor);
            this.rotors.push(rotor);
        }
    }
    /** Updates only the small set of animated windmill rotors from elapsed scene time.
     * @param time - Scene time in seconds.
     */
    update(time: number): void {
        for (const rotor of this.rotors) rotor.rotation.z = time * 0.45;
    }
    /** Releases detail materials and textures; the owning building group disposes geometry. */
    clear(): void {
        for (const material of this.resources) {
            if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
            material.dispose();
        }
        this.resources = [];
        this.rotors = [];
    }
}
