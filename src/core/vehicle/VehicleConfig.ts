/**
 * VehicleConfig types and implementation for the city driving simulator.
 * @packageDocumentation
 */

export type EngineState = "off" | "starting" | "running";
/** Model, handling, collision, presentation and audio tuning for one vehicle. */
export interface VehicleConfig {
    /** Stable identifier used as the vehicle registry key. */
    id: string;
    /** Human-readable name shown in the vehicle selector. */
    name: string;
    /** Visual asset dimensions and first-person seating position. */
    model: {
        /** Public URL of the glTF model. */
        path: string;
        /** Target model length along its local Z axis, in metres. */
        length: number;
        /** Effective tyre radius in metres, used to animate wheel rotation. */
        wheelRadius: number;
        /** Driver-eye offset [X, Y, Z] as fractions of the scaled model width, height and length; positive Z is forward. */
        eye: [number, number, number];
    };
    /** Parameters for the planar vehicle dynamics and boost system. */
    physics: {
        /** Normal forward speed limit in km/h. */
        maxSpeed: number;
        /** Maximum reverse speed magnitude in km/h. */
        reverseSpeed: number;
        /** Forward speed limit while boosting, in km/h. */
        boostSpeed: number;
        /** Base forward engine acceleration in metres per second squared. */
        acceleration: number;
        /** Fraction of uphill gravity compensated by the engine under throttle. */
        hillClimbAssist: number;
        /** Base reverse engine acceleration magnitude in metres per second squared. */
        reverseAcceleration: number;
        /** Base engine acceleration while boosting, in metres per second squared. */
        boostAcceleration: number;
        /** Service-brake deceleration magnitude in metres per second squared. */
        brakeDeceleration: number;
        /** Handbrake deceleration magnitude in metres per second squared. */
        handbrakeDeceleration: number;
        /** Distance between front and rear axles in metres. */
        wheelbase: number;
        /** Maximum front-wheel steering angle magnitude in radians. */
        maxSteeringAngle: number;
        /** Vehicle mass in kilograms. */
        mass: number;
        /** Fraction of static vehicle weight carried by the front axle, from 0 to 1. */
        frontWeight: number;
        /** Centre-of-mass height above the contact plane in metres, used for weight transfer. */
        centreOfMassHeight: number;
        /** Rotational inertia about the vertical axis in kilogram metres squared. */
        yawInertia: number;
        /** Front-axle lateral force response to tyre slip angle, in newtons per radian. */
        frontCornerStiffness: number;
        /** Rear-axle lateral force response to tyre slip angle, in newtons per radian. */
        rearCornerStiffness: number;
        /** Fraction of braking force assigned to the front axle, from 0 to 1. */
        brakeBias: number;
        /** Multiplier on the speed-dependent grip-limited steering angle. */
        steeringAssist: number;
        /** Maximum yaw angular speed magnitude in radians per second. */
        maxYawRate: number;
        /** Base lateral acceleration budget in metres per second squared, scaled by surface grip. */
        cornerGrip: number;
        /** Rate in inverse seconds at which yaw speed approaches the assisted target. */
        yawDamping: number;
        /** Constant rolling deceleration in metres per second squared. */
        rollingResistance: number;
        /** Extra coasting deceleration in metres per second squared when throttle is released. */
        engineResistance: number;
        /** Quadratic drag coefficient in inverse metres; multiplied by speed squared in SI units. */
        drag: number;
        /** Boost charge consumed per second while active, on a 0?100 scale. */
        boostDrain: number;
        /** Boost charge restored per second while inactive, on a 0?100 scale. */
        boostRecharge: number;
    };
    /** Dimensions of the simplified vehicle collision volume. */
    collision: {
        /** Horizontal collision radius in metres. */
        radius: number;
        /** Half-length of the longitudinal collision span in metres. */
        halfLength: number;
        /** Half-height of the collision volume in metres. */
        halfHeight: number;
    };
    /** Input smoothing rates; higher values produce faster responses. */
    controls: {
        /** Throttle application response rate in inverse seconds. */
        throttleRise: number;
        /** Throttle release response rate in inverse seconds. */
        throttleFall: number;
        /** Steering application response rate in inverse seconds. */
        steerRise: number;
        /** Steering centring response rate in inverse seconds. */
        steerReturn: number;
    };
    /** Cosmetic suspension lean, independent of collision geometry. */
    bodyMotion: {
        /** Body roll in radians per metre per second squared of lateral acceleration. */
        rollGain: number;
        /** Body pitch in radians per metre per second squared of longitudinal acceleration. */
        pitchGain: number;
        /** Body-lean smoothing response rate in inverse seconds. */
        response: number;
    };
    /** Camera follow tuning and terrain-orientation smoothing. */
    camera: {
        /** Chase-camera position response rate in inverse seconds. */
        followRate: number;
        /** Grounded vehicle alignment response rate in inverse seconds. */
        terrainTiltRate: number;
        /** Base chase-camera distance from its vehicle target in metres. */
        distance: number;
    };
    /** Synthesized engine, ignition and impact sound tuning. */
    audio: {
        /** Engine idle speed in revolutions per minute. */
        idleRPM: number;
        /** Upper engine speed limit in revolutions per minute. */
        maxRPM: number;
        /** Base engine oscillator frequency in hertz. */
        baseFrequency: number;
        /** Engine sound gain multiplier. */
        engineVolume: number;
        /** Collision sound gain multiplier. */
        impactVolume: number;
        /** Minimum collision impact speed in metres per second required to play a crash sound. */
        impactThreshold: number;
        /** Ignition startup duration in seconds. */
        ignitionDuration: number;
        /** Ascending gear speed boundaries in km/h used to estimate engine RPM. */
        gears: number[];
    };
}

export const DEFAULT_VEHICLE: VehicleConfig = {
    id: "honda-nsx",
    name: "Honda NSX",
    model: {
        path: "/models/nsx/nsx.gltf",
        length: 2.6,
        wheelRadius: 0.4,
        eye: [-0.18, 0.24, 0.05],
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

// 2020 Jeep Gladiator
const JEEP_GLADIATOR: VehicleConfig = {
    id: "jeep-gladiator",
    name: "2020 Jeep Gladiator",
    model: {
        path: "/models/jeep/jeep.gltf",
        length: 2.8,
        wheelRadius: 0.4,
        eye: [0.18, 0.24, 0.08],
    },
    physics: {
        maxSpeed: 180,
        reverseSpeed: 50,
        boostSpeed: 220,
        acceleration: 7.5,
        hillClimbAssist: 0.65,
        reverseAcceleration: 4,
        boostAcceleration: 15,
        brakeDeceleration: 20,
        handbrakeDeceleration: 30,
        wheelbase: 1.9,
        maxSteeringAngle: 0.65,
        mass: 1400,
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

// 1976 VW Golf GTI MK1
const VW_GOLF_MK1: VehicleConfig = {
    id: "vw-golf-mk1",
    name: "1976 VW Golf GTI MK1",
    model: {
        path: "/models/vw/golf.gltf",
        length: 2.5,
        wheelRadius: 0.35,
        eye: [0.18, 0.24, -0.08],
    },
    physics: {
        maxSpeed: 160,
        reverseSpeed: 45,
        boostSpeed: 200,
        acceleration: 6.5,
        hillClimbAssist: 0.65,
        reverseAcceleration: 4,
        boostAcceleration: 15,
        brakeDeceleration: 20,
        handbrakeDeceleration: 30,
        wheelbase: 1.9,
        maxSteeringAngle: 0.65,
        mass: 1100,
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
    [JEEP_GLADIATOR.id]: JEEP_GLADIATOR,
    [VW_GOLF_MK1.id]: VW_GOLF_MK1,
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
