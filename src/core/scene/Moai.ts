/** Shared moai stone features used by map decor and the main menu. @packageDocumentation */

/** Adds the game's normalized 2.8 m moai through a caller-supplied box builder.
 * @param add - Receives colour, position and dimensions for one stone feature.
 * @param stone - Plinth stone colour.
 */
export function addMoaiParts(
    add: (color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => void,
    stone = 0xa6a091,
): void {
    const rock = 0x827d70, shadow = 0x49483f;
                add(stone, 0, 0.12, 0, 1.15, 0.24, 0.95); // Plinth.
                add(rock, 0, 0.57, -0.06, 0.92, 0.7, 0.65); // Shoulders.
                add(rock, 0, 1.65, 0, 0.82, 2.05, 0.82); // Long head.
                add(rock, 0, 2.66, -0.06, 0.74, 0.28, 0.72); // Flat crown.
                add(rock, 0, 1.03, 0.15, 0.84, 0.46, 0.78); // Heavy chin.
                for (const side of [-1, 1]) {
                    add(shadow, side * 0.21, 2.05, 0.419, 0.29, 0.14, 0.025); // Recessed eyes.
                    add(rock, side * 0.21, 2.2, 0.46, 0.44, 0.18, 0.22); // Brow ridge.
                    add(rock, side * 0.46, 1.92, -0.01, 0.15, 0.65, 0.31); // Ears.
                }
                add(rock, 0, 1.9, 0.52, 0.18, 0.64, 0.32); // Long nose.
                add(rock, 0, 1.61, 0.59, 0.3, 0.16, 0.36);
                add(shadow, 0, 1.36, 0.548, 0.42, 0.055, 0.025); // Mouth slit.
                add(rock, 0, 1.29, 0.52, 0.46, 0.1, 0.13);

}
