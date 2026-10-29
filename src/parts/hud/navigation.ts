/**
 * navigation types and implementation for the city driving simulator.
 * @packageDocumentation
 */

/** Converts simulation yaw (+Z south, +X east) to a geographic compass bearing.
 * @param simulationHeading - Degrees measured from +Z toward +X.
 * @returns Clockwise degrees from north in the range [0, 360).
 */
export function compassHeading(simulationHeading: number): number {
    return (((180 - simulationHeading) % 360) + 360) % 360;
}
