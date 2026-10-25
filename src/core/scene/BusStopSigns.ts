import * as THREE from 'three';
import type { GeoJSONFeature } from '@/types';

/** Physical, two-sided name plates; cached artwork is released on each city change. */
export class BusStopSigns {
    readonly group = new THREE.Group();
    private geometry = new THREE.PlaneGeometry(1.4, 0.7);
    private materials = new Map<string, THREE.MeshBasicMaterial>();

    constructor() { this.group.name = 'Bus stop names'; }

    add(properties: GeoJSONFeature['properties'], x: number, y: number, z: number, yaw: number): void {
        const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
        const name = text(properties.name) || text(properties['name:en']) || text(properties.local_ref) || 'Bus stop';
        const ref = text(properties.ref) || text(properties.local_ref);
        const key = JSON.stringify([name, ref]);
        let material = this.materials.get(key);
        if (!material) {
            const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = '#f5f3e9'; ctx.fillRect(0, 0, 512, 256);
            ctx.fillStyle = '#165e91'; ctx.fillRect(0, 0, 512, 68);
            // Small bus pictogram, drawn directly into the shared sign artwork.
            ctx.fillStyle = '#ffffff'; ctx.fillRect(23, 13, 50, 37);
            ctx.fillStyle = '#165e91'; ctx.fillRect(29, 18, 38, 17);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(28, 48, 9, 9); ctx.fillRect(59, 48, 9, 9);
            ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText('BUS STOP', 91, 35);
            ctx.fillStyle = '#172c3a'; ctx.textAlign = 'center';
            const words = name.split(/\s+/);
            let lines: string[] = [name], size = 44;
            for (; size >= 22; size -= 2) {
                ctx.font = `bold ${size}px sans-serif`;
                lines = [''];
                for (const word of words) {
                    const last = lines.length - 1, candidate = lines[last] ? `${lines[last]} ${word}` : word;
                    if (ctx.measureText(candidate).width > 464 && lines[last]) lines.push(word);
                    else lines[last] = candidate;
                }
                if (lines.length <= 2 && lines.every(line => ctx.measureText(line).width <= 464)) break;
            }
            ctx.font = `bold ${Math.max(22, size)}px sans-serif`;
            const displayed = lines.slice(0, 2);
            if (lines.length > 2) displayed[1] += '?';
            displayed.forEach((line, i) => ctx.fillText(line, 256, displayed.length === 1 ? 133 : 109 + i * 47, 464));
            if (ref) { ctx.fillStyle = '#475a65'; ctx.font = '26px sans-serif'; ctx.fillText(`Stop ${ref}`, 256, 218, 464); }
            const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
            material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }); this.materials.set(key, material);
        }
        const sign = new THREE.Group(); sign.name = `Bus stop: ${name}${ref ? ` (${ref})` : ''}`;
        sign.position.set(x, y + 2.35, z); sign.rotation.y = yaw;
        // Separate outward-facing surfaces keep the reverse-side lettering readable.
        for (const side of [-1, 1]) {
            const mesh = new THREE.Mesh(this.geometry, material); mesh.position.z = side * 0.066;
            if (side < 0) mesh.rotation.y = Math.PI;
            sign.add(mesh);
        }
        const lod = new THREE.LOD(); lod.position.copy(sign.position); sign.position.set(0, 0, 0);
        lod.addLevel(sign, 0); lod.addLevel(new THREE.Object3D(), 110); this.group.add(lod);
    }

    clear(): void {
        this.group.clear();
        for (const material of this.materials.values()) { material.map?.dispose(); material.dispose(); }
        this.materials.clear();
    }
    dispose(): void { this.clear(); this.geometry.dispose(); }
}
