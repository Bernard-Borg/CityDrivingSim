export type EngineState = "off" | "starting" | "running";
export interface VehicleConfig {
    id: string;
    name: string;
    model: {
        path: string;
        length: number;
        wheelRadius: number;
        eye: [number, number, number];
    };
    physics: {
        maxSpeed: number;
        reverseSpeed: number;
        boostSpeed: number;
        acceleration: number;
        reverseAcceleration: number;
        boostAcceleration: number;
        brakeDeceleration: number;
        handbrakeDeceleration: number;
        wheelbase: number;
        maxSteeringAngle: number;
        steeringSpeedScale: number;
        maxYawRate: number;
        cornerGrip: number;
        driftGrip: number;
        lateralDamping: number;
        driftDamping: number;
        driftLateralGrip: number;
        gripRecoveryRate: number;
        maxDriftAngle: number;
        driftStability: number;
        rollingResistance: number;
        engineResistance: number;
        drag: number;
        boostDrain: number;
        boostRecharge: number;
    };
    collision: { radius: number; halfLength: number; halfHeight: number };
    controls: {
        throttleRise: number;
        throttleFall: number;
        steerRise: number;
        steerReturn: number;
    };
    camera: { followRate: number; terrainTiltRate: number; distance: number };
    audio: {
        idleRPM: number;
        maxRPM: number;
        baseFrequency: number;
        engineVolume: number;
        impactVolume: number;
        impactThreshold: number;
        ignitionDuration: number;
        gears: number[];
    };
}

export const DEFAULT_VEHICLE: VehicleConfig = {
    id: "honda-nsx",
    name: "Honda NSX",
    model: {
        path: "/models/car.gltf",
        length: 2.6,
        wheelRadius: 0.4,
        eye: [0.22, 0.24, -0.08],
    },
    physics: {
        maxSpeed: 200,
        reverseSpeed: 35,
        boostSpeed: 250,
        acceleration: 9,
        reverseAcceleration: 4,
        boostAcceleration: 15,
        brakeDeceleration: 20,
        handbrakeDeceleration: 5,
        wheelbase: 1.9,
        maxSteeringAngle: 0.65,
        steeringSpeedScale: 28,
        maxYawRate: 2.4,
        cornerGrip: 14,
        driftGrip: 16,
        lateralDamping: 32,
        driftDamping: 1.8,
        driftLateralGrip: 2.8,
        gripRecoveryRate: 4,
        maxDriftAngle: 0.55,
        driftStability: 3.5,
        rollingResistance: 0.15,
        engineResistance: 0.18,
        drag: 0.00025,
        boostDrain: 30,
        boostRecharge: 15,
    },
    collision: { radius: 0.55, halfLength: 0.75, halfHeight: 0.4 },
    controls: {
        throttleRise: 3.5,
        throttleFall: 5,
        steerRise: 14,
        steerReturn: 18,
    },
    camera: { followRate: 7, terrainTiltRate: 9, distance: 9 },
    audio: {
        idleRPM: 800,
        maxRPM: 6000,
        baseFrequency: 30,
        engineVolume: 0.6,
        impactVolume: 0.65,
        impactThreshold: 1.5,
        ignitionDuration: 0.95,
        gears: [45, 80, 120, 165, 210, 250],
    },
};
export const VEHICLES: Record<string, VehicleConfig> = {
    [DEFAULT_VEHICLE.id]: DEFAULT_VEHICLE,
};

export function targetEngineRPM(
    speed: number,
    throttle: number,
    audio: VehicleConfig["audio"],
): number {
    const index = audio.gears.findIndex((end) => Math.abs(speed) < end);
    const gear = index < 0 ? audio.gears.length - 1 : index;
    const start = gear === 0 ? 0 : audio.gears[gear - 1] * 0.6;
    const ratio = Math.max(
        0,
        Math.min(
            1,
            (Math.abs(speed) - start) / Math.max(1, audio.gears[gear] - start),
        ),
    );
    return Math.min(
        audio.maxRPM,
        audio.idleRPM +
            ratio * (audio.maxRPM - audio.idleRPM) * 0.77 +
            Math.abs(throttle) * 1500,
    );
}
