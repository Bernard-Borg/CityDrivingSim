/**
 * VehicleConfig types and implementation for the city driving simulator.
 * @packageDocumentation
 */

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
        hillClimbAssist: number;
        reverseAcceleration: number;
        boostAcceleration: number;
        brakeDeceleration: number;
        handbrakeDeceleration: number;
        wheelbase: number;
        maxSteeringAngle: number;
        mass: number;
        frontWeight: number;
        centreOfMassHeight: number;
        yawInertia: number;
        frontCornerStiffness: number;
        rearCornerStiffness: number;
        brakeBias: number;
        steeringAssist: number;
        maxYawRate: number;
        cornerGrip: number;
        yawDamping: number;
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
    bodyMotion: { rollGain: number; pitchGain: number; response: number };
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
        reverseSpeed: 55,
        boostSpeed: 250,
        acceleration: 8.5,
        hillClimbAssist: 0.65,
        reverseAcceleration: 4,
        boostAcceleration: 15,
        brakeDeceleration: 20,
        handbrakeDeceleration: 30,
        wheelbase: 1.9,
        maxSteeringAngle: 0.65,
        mass: 1280,
        frontWeight: 0.46,
        centreOfMassHeight: 0.3,
        yawInertia: 1450,
        frontCornerStiffness: 150000,
        rearCornerStiffness: 190000,
        brakeBias: 0.64,
        steeringAssist: 1,
        maxYawRate: 2.8,
        cornerGrip: 15.5,
        yawDamping: 0.9,
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
        steerRise: 16,
        steerReturn: 20,
    },
    bodyMotion: { rollGain: 0.0023, pitchGain: 0.0016, response: 8 },
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

/**
 * Estimates RPM from signed speed in km/h, throttle load and configured gear speed boundaries.
 *
 * @param speed - Signed vehicle speed in km/h.
 * @param throttle - Normalized signed throttle request.
 * @param audio - Engine sound and gear tuning.
 */
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
        Math.min(1, (Math.abs(speed) - start) / Math.max(1, audio.gears[gear] - start)),
    );
    return Math.min(
        audio.maxRPM,
        audio.idleRPM + ratio * (audio.maxRPM - audio.idleRPM) * 0.77 + Math.abs(throttle) * 1500,
    );
}
