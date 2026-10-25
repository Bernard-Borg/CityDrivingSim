import { DEFAULT_VEHICLE } from './VehicleConfig';
import type { VehicleConfig } from './VehicleConfig';

export interface VehicleInput {
    throttle: number;
    brake: number;
    steering: number;
    handbrake: boolean;
    boost: boolean;
    parkingBrake?: boolean;
}

export const FIXED_STEP = 1 / 120;

/** SI units throughout: metres, seconds, radians. Rendering converts speed to km/h. */
export class VehiclePhysics {
    x = 0;
    z = 0;
    yaw = 0;
    vx = 0;
    vz = 0;
    yawRate = 0;
    boost = 100;
    boosting = false;
    slip = 0;
    steeringAngle = 0;
    longitudinalAcceleration = 0;
    lateralAcceleration = 0;
    private boostLocked = false;
    constructor(readonly config: VehicleConfig['physics'] = DEFAULT_VEHICLE.physics) {}

    get forwardSpeed(): number {
        return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
    }

    reset(): void {
        this.vx = this.vz = this.yawRate = this.slip = 0;
        this.steeringAngle = this.longitudinalAcceleration = this.lateralAcceleration = 0;
        this.boosting = false;
        this.boostLocked = false;
    }

    step(dt: number, input: VehicleInput, grip = 1, slopeX = 0, slopeZ = 0): void {
        if (input.parkingBrake) { this.reset(); return; }
        const cfg = this.config;
        const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        const forward = this.forwardSpeed, lateral = this.vx * cos - this.vz * sin;
        const speed = Math.abs(forward), surfaceGrip = clamp(grip, 0.15, 1.5);
        const pedal = Math.max(input.handbrake ? 1 : 0, clamp(input.brake, 0, 1));
        const throttle = clamp(input.throttle, -1, 1) * (1 - pedal);
        if (!input.boost) this.boostLocked = false;
        if (this.boost < 1) this.boostLocked = true;
        this.boosting = input.boost && !this.boostLocked && throttle > 0.1 && forward >= 0 && this.boost > 1;
        this.boost = clamp(this.boost + (this.boosting ? -cfg.boostDrain : cfg.boostRecharge) * dt, 0, 100);
        const limit = (throttle < 0 ? cfg.reverseSpeed : this.boosting ? cfg.boostSpeed : cfg.maxSpeed) / 3.6;
        const plane = 1 + slopeX * slopeX + slopeZ * slopeZ;
        const gravityX = -9.81 * slopeX / plane, gravityZ = -9.81 * slopeZ / plane;
        const gradeScale = 1 / Math.sqrt(1 + (slopeX * sin + slopeZ * cos) ** 2);
        const gravityForward = gravityX * sin + gravityZ * cos;
        const engine = throttle * (throttle < 0 ? cfg.reverseAcceleration : this.boosting ? cfg.boostAcceleration : cfg.acceleration)
            * Math.max(0, 1 - Math.pow(Math.max(0, forward * Math.sign(throttle)) / limit, 4))
            + throttle * Math.max(0, -gravityForward * Math.sign(throttle)) * cfg.hillClimbAssist / gradeScale;
        const resistance = cfg.rollingResistance + cfg.drag * speed * speed + (Math.abs(throttle) < 0.05 ? cfg.engineResistance : 0);
        const brake = pedal * (input.handbrake ? cfg.handbrakeDeceleration : cfg.brakeDeceleration) * surfaceGrip;
        // Never let a braking force reverse the vehicle in a single tick.
        const longitudinal = engine - Math.sign(forward) * Math.min(speed / dt, brake + resistance);
        const availableGrip = cfg.cornerGrip * surfaceGrip;
        // Full parking lock; at speed, keyboard lock asks for the available cornering
        // force instead of oversteering the front tyres far beyond useful slip angles.
        const geometricLock = Math.atan(availableGrip * cfg.wheelbase / Math.max(1, speed * speed));
        const lock = Math.min(cfg.maxSteeringAngle, geometricLock * cfg.steeringAssist);
        this.steeringAngle = clamp(input.steering / cfg.maxSteeringAngle, -1, 1) * lock;
        const steer = this.steeringAngle;
        const frontArm = cfg.wheelbase * (1 - cfg.frontWeight), rearArm = cfg.wheelbase * cfg.frontWeight;
        const previousX = this.vx, previousZ = this.vz;

        if (forward < 3) {
            // Kinematic parking/reverse contact avoids the singular low-speed tyre model.
            const targetYaw = clamp(forward / cfg.wheelbase * Math.tan(steer), -cfg.maxYawRate, cfg.maxYawRate);
            this.yawRate += (targetYaw - this.yawRate) * (1 - Math.exp(-16 * dt));
            this.yaw += this.yawRate * dt;
            let next = forward + (longitudinal * gradeScale + gravityForward) * dt;
            if (pedal && speed < (brake + resistance) * dt && Math.abs(gravityForward) < brake) next = 0;
            const side = lateral * Math.exp(-18 * surfaceGrip * dt);
            this.vx = Math.sin(this.yaw) * next + Math.cos(this.yaw) * side;
            this.vz = Math.cos(this.yaw) * next - Math.sin(this.yaw) * side;
        } else {
            // A dynamic bicycle: each axle develops a bounded lateral force from its
            // slip angle. World momentum changes through forces, not a yaw teleport.
            const loadTransfer = cfg.mass * clamp(this.longitudinalAcceleration - gravityForward, -cfg.brakeDeceleration, cfg.acceleration + Math.abs(gravityForward))
                * cfg.centreOfMassHeight / cfg.wheelbase;
            const frontLoad = clamp(cfg.mass * 9.81 * cfg.frontWeight - loadTransfer, cfg.mass * 9.81 * 0.2, cfg.mass * 9.81 * 0.8);
            const rearLoad = cfg.mass * 9.81 - frontLoad;
            const mu = availableGrip / 9.81;
            const frontCapacity = mu * frontLoad, rearCapacity = mu * rearLoad;
            const frontSlip = steer - Math.atan2(lateral + frontArm * this.yawRate, speed);
            const rearSlip = -Math.atan2(lateral - rearArm * this.yawRate, speed);
            const desiredForce = longitudinal * cfg.mass * gradeScale;
            const braking = longitudinal * forward < 0;
            const frontDemand = braking ? desiredForce * cfg.brakeBias : 0;
            const rearDemand = braking ? desiredForce * (1 - cfg.brakeBias) : desiredForce;
            // ABS keeps a steering reserve under braking; traction control spends
            // remaining tyre capacity on drive rather than breaking rear grip.
            const frontReserve = Math.sqrt(Math.max(frontCapacity * frontCapacity * 0.2,
                frontCapacity * frontCapacity - Math.min(frontCapacity, Math.abs(frontDemand) * 0.75) ** 2));
            const rearReserve = Math.sqrt(Math.max(rearCapacity * rearCapacity * 0.2,
                rearCapacity * rearCapacity - (braking ? Math.min(rearCapacity, Math.abs(rearDemand) * 0.75) ** 2 : 0)));
            const frontForce = frontReserve * Math.tanh(cfg.frontCornerStiffness * frontSlip / frontReserve);
            const rearForce = rearReserve * Math.tanh(cfg.rearCornerStiffness * rearSlip / rearReserve);
            const fxFront = clamp(frontDemand, -Math.sqrt(Math.max(0, frontCapacity ** 2 - frontForce ** 2)), Math.sqrt(Math.max(0, frontCapacity ** 2 - frontForce ** 2)));
            const fxRear = clamp(rearDemand, -Math.sqrt(Math.max(0, rearCapacity ** 2 - rearForce ** 2)), Math.sqrt(Math.max(0, rearCapacity ** 2 - rearForce ** 2)));
            const fx = fxFront * Math.cos(steer) + fxRear - frontForce * Math.sin(steer);
            const fy = frontForce * Math.cos(steer) + rearForce + fxFront * Math.sin(steer);
            const moment = frontArm * (frontForce * Math.cos(steer) + fxFront * Math.sin(steer)) - rearArm * rearForce;
            const targetYaw = clamp(forward / cfg.wheelbase * Math.tan(steer), -cfg.maxYawRate, cfg.maxYawRate);
            const oldYawRate = this.yawRate;
            this.yawRate += (moment / cfg.yawInertia + (targetYaw - this.yawRate) * cfg.yawDamping) * dt;
            this.yawRate = clamp(this.yawRate, -cfg.maxYawRate, cfg.maxYawRate);
            this.vx += (sin * fx / cfg.mass + cos * fy / cfg.mass + gravityX) * dt;
            this.vz += (cos * fx / cfg.mass - sin * fy / cfg.mass + gravityZ) * dt;
            if (forward < 7) {
                const t = clamp((forward - 3) / 4, 0, 1), blend = 1 - t * t * (3 - 2 * t);
                const rate = oldYawRate + (targetYaw - oldYawRate) * (1 - Math.exp(-16 * dt));
                const yaw = this.yaw + rate * dt;
                const next = forward + (longitudinal * gradeScale + gravityForward) * dt;
                const side = lateral * Math.exp(-18 * surfaceGrip * dt);
                this.vx += (Math.sin(yaw) * next + Math.cos(yaw) * side - this.vx) * blend;
                this.vz += (Math.cos(yaw) * next - Math.sin(yaw) * side - this.vz) * blend;
                this.yawRate += (rate - this.yawRate) * blend;
            }
            this.yaw += this.yawRate * dt;
        }
        if (input.handbrake) {
            // Assisted emergency stop: decelerate all travel, including sideways motion,
            // rather than letting the ordinary axle force cap erase handbrake strength.
            const targetSpeed = Math.max(0, Math.hypot(previousX, previousZ) - brake * dt);
            const actualSpeed = Math.hypot(this.vx, this.vz);
            if (actualSpeed > targetSpeed) {
                const scale = targetSpeed / actualSpeed;
                this.vx *= scale; this.vz *= scale;
            }
            if (targetSpeed === 0) this.yawRate = 0;
        }
        if (pedal && Math.hypot(this.vx, this.vz) < 0.12 && Math.hypot(gravityX, gravityZ) < brake) this.vx = this.vz = this.yawRate = 0;
        const response = 1 - Math.exp(-8 * dt);
        this.longitudinalAcceleration += (((this.vx - previousX) * sin + (this.vz - previousZ) * cos) / dt - this.longitudinalAcceleration) * response;
        this.lateralAcceleration += (((this.vx - previousX) * cos - (this.vz - previousZ) * sin) / dt - this.lateralAcceleration) * response;
        this.x += this.vx * dt; this.z += this.vz * dt;
        this.slip = Math.abs(this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw));

    }
}

/** Discard suspension time, and cap catch-up work to avoid a spiral after a slow frame. */
export class PhysicsClock {
    private accumulator = 0;
    get alpha(): number { return Math.max(0, Math.min(1, this.accumulator / FIXED_STEP)); }
    reset(): void { this.accumulator = 0; }
    advance(delta: number, step: (dt: number) => void): void {
        if (!Number.isFinite(delta) || delta < 0 || delta > 0.25) {
            this.reset();
            return;
        }
        this.accumulator += Math.min(delta, 0.1);
        while (this.accumulator + 1e-10 >= FIXED_STEP) {
            step(FIXED_STEP);
            this.accumulator -= FIXED_STEP;
        }
    }
}
