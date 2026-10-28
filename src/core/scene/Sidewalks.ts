/** OSM sidewalk-side and width parsing. @packageDocumentation */
export interface SidewalkWidths { left: number; right: number; }

/** Resolves attached sidewalks independently of carriageway lane width.
 * Side-specific presence tags override both-side and general tags. Separately mapped
 * sidewalks are excluded to avoid inventing a second sidewalk beside their own geometry.
 * @param tags - OSM road tags; widths are interpreted in metres unless suffixed with feet.
 * @returns Width on each side of the OSM way direction, defaulting to 2.2 m when present.
 */
export function sidewalkWidths(tags: Record<string, unknown>): SidewalkWidths {
    const widths: SidewalkWidths = { left: 0, right: 0 };
    for (const side of ['left', 'right'] as const) {
        const general = String(tags.sidewalk ?? '').toLowerCase();
        const presence = String(tags[`sidewalk:${side}`] ?? tags['sidewalk:both']
            ?? (general === 'both' || general === 'yes' || general === side ? 'yes' : general)).toLowerCase();
        if (presence !== 'yes') continue;
        const raw = String(tags[`sidewalk:${side}:width`] ?? tags['sidewalk:both:width'] ?? tags['sidewalk:width'] ?? '2.2');
        const parsed = parseFloat(raw) * (/\bft\b|feet|'/i.test(raw) ? 0.3048 : 1);
        widths[side] = Number.isFinite(parsed) && parsed > 0 ? Math.max(0.3, Math.min(8, parsed)) : 2.2;
    }
    return widths;
}
