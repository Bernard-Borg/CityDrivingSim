import type { MeshStandardMaterial } from "three";

/** Adds altitude-based snow to terrain or ground-cover shading without changing geometry. */
export function applyAltitudeSnow(material: MeshStandardMaterial, referenceHeight: number): void {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.uniforms.snowDatum = { value: referenceHeight };
        shader.vertexShader = "varying float snowElevation;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>",
            "#include <begin_vertex>\nsnowElevation = (modelMatrix * vec4(position, 1.0)).y;");
        shader.fragmentShader = "uniform float snowDatum;\nvarying float snowElevation;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>",
            "diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.96, 0.98), smoothstep(2490.0, 2500.0, snowElevation + snowDatum));\n#include <roughnessmap_fragment>");
    };
    material.customProgramCacheKey = () => previousKey + "-altitude-snow-v1";
}
