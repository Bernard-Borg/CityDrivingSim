/** Shared arched tunnel cross-sections for lining, excavation and collisions. @packageDocumentation */

/** Longitudinal lining thickness in metres. */
export const TUNNEL_THICKNESS = 0.45;
/** Number of planar facets around the curved roof. */
export const TUNNEL_ARCH_STEPS = 16;

/** Produces an open-bottom horseshoe section, from left footing to right footing.
 * Width and height are independent so wider roads retain configured centre headroom.
 * @param left - Distance from road centre to the left wall in metres.
 * @param right - Distance from road centre to the right wall in metres.
 * @param headroom - Height at the crown above the floor in metres.
 * @param thickness - Outward expansion for the outer lining surface.
 * @returns Lateral offsets and heights in road-local cross-section coordinates.
 */
export function tunnelSection(left: number, right: number, headroom: number, thickness = 0): Array<{ u: number; h: number }> {
    const spring = Math.min(1.8, headroom * 0.5);
    const centre = (right - left) / 2;
    const radius = (left + right) / 2 + thickness;
    const section = [{ u: centre - radius, h: -thickness }];
    for (let i = 0; i <= TUNNEL_ARCH_STEPS; i++) {
        const angle = Math.PI * (1 - i / TUNNEL_ARCH_STEPS);
        section.push({ u: centre + radius * Math.cos(angle), h: spring + (headroom - spring + thickness) * Math.sin(angle) });
    }
    section.push({ u: centre + radius, h: -thickness });
    return section;
}
