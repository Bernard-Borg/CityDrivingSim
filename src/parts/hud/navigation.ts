/** The strip follows the original needle convention, opposite the simulation yaw. */
export function compassHeading(simulationHeading: number): number {
    return ((-simulationHeading % 360) + 360) % 360;
}
