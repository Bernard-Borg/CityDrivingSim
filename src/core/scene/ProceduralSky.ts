/**
 * ProceduralSky types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";

/** Camera-centred daytime sky: one draw call, no textures or volumetric ray marching. */
export class ProceduralSky {
    static readonly sunDirection = new THREE.Vector3(200, 75, 100).normalize();
    static readonly horizonColor = new THREE.Color(0xc4ddeb);
    private material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
            skyTime: { value: 0 },
            sunDirection: { value: ProceduralSky.sunDirection.clone() },
            horizonColor: { value: ProceduralSky.horizonColor.clone() },
            zenithColor: { value: new THREE.Color(0x438bd1) },
            cloudColor: { value: new THREE.Color(0xf9fbff) },
        },
        vertexShader: `
            varying vec3 skyDirection;
            void main() {
                skyDirection = position;
                vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_Position = clip.xyww;
            }`,
        fragmentShader: `
            uniform float skyTime;
            uniform vec3 sunDirection, horizonColor, zenithColor, cloudColor;
            varying vec3 skyDirection;
            float skyHash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            float skyNoise(vec2 p) {
                vec2 cell = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(skyHash(cell), skyHash(cell + vec2(1, 0)), f.x),
                    mix(skyHash(cell + vec2(0, 1)), skyHash(cell + vec2(1, 1)), f.x), f.y);
            }
            float cloudNoise(vec2 p) {
                float value = 0.0, weight = 0.55;
                for (int i = 0; i < 4; i++) {
                    value += weight * skyNoise(p);
                    p = mat2(1.6, -1.2, 1.2, 1.6) * p + 13.7;
                    weight *= 0.5;
                }
                return value;
            }
            void main() {
                vec3 direction = normalize(skyDirection);
                float altitude = max(direction.y, 0.0);
                vec3 color = mix(horizonColor, zenithColor, pow(altitude, 0.55));
                float alignment = max(dot(direction, sunDirection), 0.0);
                color += vec3(1.0, 0.77, 0.43) * pow(alignment, 48.0) * 0.32;
                color += vec3(1.0, 0.85, 0.60) * pow(alignment, 1200.0) * 0.45;
                float sunEdge = cos(0.009);
                float sunAA = max(fwidth(alignment), 0.000001);
                float disc = smoothstep(sunEdge - sunAA, sunEdge + sunAA, alignment);

                // A distant cloud sheet, faded before its horizon projection becomes singular.
                vec2 cloudUV = direction.xz / max(direction.y, 0.12) * 2.4;
                cloudUV += vec2(skyTime * 0.006, skyTime * 0.002);
                float density = cloudNoise(cloudUV);
                float coverage = smoothstep(0.50, 0.72, density)
                    * smoothstep(0.06, 0.24, direction.y);
                float sunward = cloudNoise(cloudUV + sunDirection.xz * 0.18);
                vec3 cloudLight = cloudColor * (0.74 + 0.26 * smoothstep(0.45, 0.75, sunward));
                color = mix(color, cloudLight, coverage * 0.94);
                // Thin cloud attenuates the disc without erasing it completely.
                color = mix(color, vec3(3.0, 2.7, 2.0), disc * (1.0 - coverage * 0.75));
                gl_FragColor = vec4(color, 1.0);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }`,
    });
    private mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.material);

    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param scene - Scene receiving generated objects; ownership remains with the caller.
     */
    constructor(private scene: THREE.Scene) {
        this.mesh.name = "Procedural sky";
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = -1000;
        scene.add(this.mesh);
    }

    /**
     * Centres the sky on the camera and updates cloud animation time in seconds.
     *
     * @param camera - Camera controlled or followed by this operation.
     * @param seconds - Animation time in seconds.
     */
    update(camera: THREE.Camera, seconds: number): void {
        this.mesh.position.copy(camera.position);
        this.material.uniforms.skyTime.value = seconds;
    }

    /**
     * Releases owned resources and unregisters scene objects, browser listeners or audio nodes as applicable.
     */
    dispose(): void {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}
