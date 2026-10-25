import * as THREE from 'three';

export interface BuildingTheme {
    wallColors: string[];
    roofColors: string[];
    shutterColors: string[];
    floorHeight: number;
    windowSpacing: number;
    weathering: number;
    balconyChance: number;
    residentialLevels: [number, number];
    wallMaterial: string;
}
export const MALTA_BUILDINGS: BuildingTheme = {
    wallColors: ['#d9c594', '#cdb785', '#e4d3ab', '#c4ad7d', '#e1cda0'],
    roofColors: ['#b7aa91', '#c1b499', '#a99c86'], shutterColors: ['#305b47', '#683e36', '#35546b', '#7c6543'],
    floorHeight: 3.1, windowSpacing: 2.8, weathering: 0.36, balconyChance: 0.35, residentialLevels: [1, 3], wallMaterial: 'limestone',
};
export const MONACO_BUILDINGS: BuildingTheme = {
    wallColors: ['#ead7bf', '#e3bfae', '#eee6d4', '#d8c9b4', '#e6cfaa', '#f0e9dc'],
    roofColors: ['#a96e51', '#b87d5b', '#aa9d8d'], shutterColors: ['#52685d', '#6b7374', '#637c8b'],
    floorHeight: 3, windowSpacing: 3.2, weathering: 0.18, balconyChance: 0.6, residentialLevels: [2, 5], wallMaterial: 'plaster',
};
export type BuildingStyle = 'home' | 'apartments' | 'church' | 'civic' | 'commercial' | 'industrial' | 'garage' | 'greenhouse' | 'ruins' | 'construction' | 'canopy' | 'parking' | 'bunker';
type Tags = Record<string, string | number | boolean | undefined>;
export function buildingSeed(id: string): number {
    let value = 2166136261;
    for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
    return value >>> 0;
}
export function buildingStyle(p: Tags): BuildingStyle {
    const type = String(p.building ?? '').toLowerCase();
    if (['church', 'chapel', 'cathedral', 'synagogue', 'mosque', 'temple'].includes(type) || p.amenity === 'place_of_worship') return 'church';
    if (type === 'ruins' || p.ruins === 'yes') return 'ruins';
    if (type === 'construction') return 'construction';
    if (['roof', 'carport', 'tent'].includes(type) || p.amenity === 'shelter') return 'canopy';
    if (type === 'greenhouse') return 'greenhouse';
    if (type === 'parking') return 'parking';
    if (type === 'bunker') return 'bunker';
    if (['garage', 'garages', 'shed', 'service', 'toilets'].includes(type)) return 'garage';
    if (['industrial', 'warehouse', 'hangar', 'barn'].includes(type)) return 'industrial';
    if (['apartments', 'hotel', 'residential', 'terrace', 'terraced'].includes(type)) return 'apartments';
    if (['retail', 'commercial', 'office', 'restaurant', 'kiosk'].includes(type) || type.includes('bureaux') || ['restaurant', 'bank', 'cafe', 'casino'].includes(String(p.amenity))) return 'commercial';
    if (['public', 'civic', 'school', 'hospital', 'college', 'university', 'government', 'museum', 'police', 'stadium', 'train_station'].includes(type)
        || ['school', 'hospital', 'library', 'courthouse', 'police', 'community_centre'].includes(String(p.amenity)) || p.historic) return 'civic';
    return 'home';
}
function color(value: unknown, fallback: string): THREE.Color {
    const text = String(value ?? '').toLowerCase().trim();
    return new THREE.Color(/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(text) || Object.hasOwn(THREE.Color.NAMES, text) ? text : fallback);
}
export function resolveBuildingAppearance(p: Tags, seed: number, theme: BuildingTheme) {
    const style = buildingStyle(p), pick = (colors: string[], shift = 0) => colors.length ? colors[(seed + shift) % colors.length] : '#d2c5aa';
    const material = String(p['building:material'] ?? (style === 'church' || style === 'ruins' ? 'stone' : style === 'industrial' ? 'metal' : style === 'greenhouse' ? 'glass' : style === 'parking' || style === 'bunker' ? 'concrete' : theme.wallMaterial));
    const defaults: Record<BuildingStyle, number> = { home: theme.residentialLevels[0] + seed % Math.max(1, theme.residentialLevels[1] - theme.residentialLevels[0] + 1),
        apartments: 4 + seed % 3, church: p.building === 'cathedral' ? 7 : p.building === 'chapel' ? 2 : 4,
        civic: 3, commercial: 3, industrial: 2, garage: 1, greenhouse: 1, ruins: 1, construction: 3, canopy: 1, parking: 3, bunker: 1 };
    const taggedLevels = Number(p['building:levels'] ?? p.levels);
    const levels = Number.isFinite(taggedLevels) && taggedLevels > 0 ? taggedLevels : defaults[style];
    const taggedHeight = parseFloat(String(p.height ?? ''));
    const height = Number.isFinite(taggedHeight) && taggedHeight > 0 ? taggedHeight : style === 'ruins' ? 1.8 : levels * theme.floorHeight;
    const roofShape = String(p['roof:shape'] ?? (p.building === 'tent' ? 'pyramidal' : style === 'church' && ['church', 'chapel', 'cathedral'].includes(String(p.building)) || style === 'industrial' || style === 'greenhouse' ? 'gabled' : 'flat'));
    const roofMaterial = String(p['roof:material'] ?? (style === 'greenhouse' ? 'glass' : style === 'industrial' ? 'metal' : roofShape === 'flat' ? 'concrete' : 'roof_tiles'));
    const wallFallback = material === 'brick' ? '#aa7057' : material === 'glass' ? '#83a9b1' : material === 'metal' ? '#a7adae'
        : material === 'wood' ? '#937452' : pick(theme.wallColors);
    return { style, levels, height, roofShape, roofMaterial, material,
        wallColor: color(p['building:colour'] ?? p.colour, wallFallback),
        roofColor: color(p['roof:colour'], roofMaterial === 'grass' ? '#71865c' : roofMaterial === 'wood' ? '#937452' : roofMaterial === 'metal' ? '#959fa2' : pick(theme.roofColors, 1)),
        shutterColor: color(undefined, pick(theme.shutterColors, 2)),
        balcony: (style === 'home' || style === 'apartments') && seed % 100 < theme.balconyChance * 100,
    };
}
export type BuildingAppearance = ReturnType<typeof resolveBuildingAppearance>;

/** One shared facade shader; per-vertex attributes select palettes/styles without per-building textures. */
export function createBuildingMaterials() {
    const wall = new THREE.MeshStandardMaterial({ roughness: 0.88, side: THREE.DoubleSide, vertexColors: true });
    wall.onBeforeCompile = shader => {
        shader.vertexShader = `attribute vec4 facade; attribute vec3 shutters; attribute vec2 finish;
            varying vec4 vFacade; varying vec3 vShutters; varying vec2 vFinish;\n` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade=facade; vShutters=shutters; vFinish=finish;');
        shader.fragmentShader = 'varying vec4 vFacade; varying vec3 vShutters; varying vec2 vFinish;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
            vec3 baseColor = diffuseColor.rgb;
            vec2 metre = vMapUv; vec2 cell = fract(metre / vFacade.xy);
            float style = vFacade.z; float floorNo = floor(metre.y / vFacade.y);
            float grain = fract(sin(dot(floor(metre * 36.0), vec2(12.9898,78.233))) * 43758.5453);
            diffuseColor.rgb *= 1.0 - grain * vFinish.y * 0.18;
            float joint = step(0.96, fract(metre.y / 0.36));
            float brickJoint = step(0.97, fract(metre.x / 0.7 + floor(metre.y / 0.36) * 0.5));
            if (vFinish.x < 1.5 && vFinish.x > 0.5) diffuseColor.rgb *= 1.0 - max(joint, brickJoint) * 0.18;
            if (vFinish.x > 1.5 && vFinish.x < 2.5) diffuseColor.rgb *= 0.95 + 0.05 * sin(metre.x * 24.0);
            if (vFinish.x > 3.5) diffuseColor.rgb *= 0.87 + 0.13 * sin(metre.x * 18.0 + sin(metre.y * 2.0));
            float windowMask = step(0.3,cell.x)*step(cell.x,0.7)*step(0.26,cell.y)*step(cell.y,0.78);
            if (style > 1.5 && style < 2.5) {
                float arch = 0.5 + sqrt(max(0.0, 0.0484 - pow(cell.x - 0.5,2.0)));
                windowMask = step(0.28,cell.x)*step(cell.x,0.72)*step(0.22,cell.y)*step(cell.y,arch);
            }
            if (style > 4.5 && style < 5.5) windowMask *= step(0.68,cell.y);
            if (style > 5.5 && style < 6.5) windowMask = 0.0;
            if (style > 7.5) windowMask = 0.0;
            if (metre.y < 0.25) windowMask = 0.0;
            vec3 glass = mix(vec3(0.10,0.17,0.20), vec3(0.27,0.39,0.44), cell.y);
            if (style > 1.5 && style < 2.5) glass = mix(vec3(0.20,0.27,0.40),vec3(0.50,0.28,0.18),step(0.5,cell.x));
            diffuseColor.rgb = mix(diffuseColor.rgb,glass,windowMask);
            float frame = windowMask * max(1.0-step(0.018,abs(cell.x-0.5)),1.0-step(0.018,abs(cell.y-0.52)));
            diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.53,0.51,0.44),frame);
            if (style > 1.5 && style < 2.5 && metre.x < vFacade.x) {
                float doorTop = 2.0 + sqrt(max(0.0,0.64-pow((cell.x-0.5)*vFacade.x,2.0)));
                float door=step(0.3,cell.x)*step(cell.x,0.7)*step(0.0,metre.y)*step(metre.y,doorTop);
                diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.20,0.13,0.08),door);
            }
            if (style < 1.5) {
                float shutter = (step(0.18,cell.x)*step(cell.x,0.28)+step(0.72,cell.x)*step(cell.x,0.82))*step(0.26,cell.y)*step(cell.y,0.78);
                diffuseColor.rgb = mix(diffuseColor.rgb,vShutters*(0.85+0.15*step(0.5,fract(metre.y*12.0))),shutter);
                if (vFacade.w > 0.5 && floorNo > 0.0) {
                    float rail = step(0.15,cell.x)*step(cell.x,0.85)*step(0.18,cell.y)*step(cell.y,0.32);
                    diffuseColor.rgb = mix(diffuseColor.rgb,vShutters,rail*max(step(0.86,fract(metre.x*7.0)),step(cell.y,0.205)));
                }
            }
            if ((style > 3.5 && style < 6.5) && floorNo < 1.0) {
                float door = step(0.12,cell.x)*step(cell.x,0.88)*step(cell.y,0.72)*step(0.05,cell.y);
                diffuseColor.rgb = mix(diffuseColor.rgb,style < 4.5 ? glass : vec3(0.38)*(0.85+0.15*sin(metre.y*30.0)),door);
            }
            if (style > 6.5 && style < 7.5 || vFinish.x > 2.5 && vFinish.x < 3.5) {
                float grid = max(step(0.95,fract(metre.x/1.2)),step(0.96,fract(metre.y/1.2)));
                diffuseColor.rgb = mix(vec3(0.29,0.48,0.48),vec3(0.65),grid);
            }
            if (style > 8.5 && style < 9.5) diffuseColor.rgb *= mix(0.65,1.0,step(0.12,cell.y));
            if (style > 10.5 && style < 11.5) diffuseColor.rgb *= mix(0.35,1.0,step(cell.y,0.24));
            if (style > 11.5) diffuseColor.rgb *= 1.0-step(0.67,cell.y)*step(cell.y,0.78)*step(0.2,cell.x)*step(cell.x,0.8)*0.8;
            diffuseColor.rgb = mix(baseColor, diffuseColor.rgb, 1.0-smoothstep(0.15,0.9,max(fwidth(metre.x),fwidth(metre.y))));
        `);
        // Enable built-in UV varyings while the facade itself is generated mathematically.
    };
    const roof = new THREE.MeshStandardMaterial({ roughness: 0.92, side: THREE.DoubleSide, vertexColors: true });
    roof.onBeforeCompile = shader => {
        shader.vertexShader = 'attribute float roofFinish; varying float vRoofFinish;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoofFinish=roofFinish;');
        shader.fragmentShader = 'varying float vRoofFinish;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
            vec2 p=vMapUv;
            float noise=fract(sin(dot(floor(p*24.0),vec2(12.9898,78.233)))*43758.5453);
            diffuseColor.rgb *= 0.94+noise*0.06;
            if(vRoofFinish<0.5) {
                float joint=max(step(0.92,fract(p.x/0.3+floor(p.y/0.45)*0.5)),step(0.94,fract(p.y/0.45)));
                diffuseColor.rgb *= 1.0-joint*0.25;
            } else if(vRoofFinish<1.5) diffuseColor.rgb *= 0.9+0.1*sin(p.x*25.0);
            else if(vRoofFinish>2.5 && vRoofFinish<3.5) {
                float grid=max(step(0.95,fract(p.x/1.2)),step(0.96,fract(p.y/1.2)));
                diffuseColor.rgb=mix(vec3(0.29,0.48,0.48),vec3(0.65),grid);
            }
            else if(vRoofFinish>3.5) diffuseColor.rgb *= 0.88+0.12*sin(p.x*20.0+sin(p.y*2.0));
        `);
    };
    // A shared 1px white map enables Three's UV plumbing; detail needs no image assets.
    const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    map.needsUpdate = true; wall.map = map; roof.map = map;
    return { wall, roof, map };
}
