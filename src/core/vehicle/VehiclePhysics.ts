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
    private boostLocked = false;
    constructor(readonly config: VehicleConfig['physics'] = DEFAULT_VEHICLE.physics) {}

    get forwardSpeed(): number {
        return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
    }

    reset(): void {
        this.vx = this.vz = this.yawRate = this.slip = 0;
        this.boosting = false;
        this.boostLocked = false;
    }

    step(dt: number, input: VehicleInput, grip = 1, slopeX = 0, slopeZ = 0): void {
        if (input.parkingBrake) { this.reset(); return; }
        const cfg = this.config;
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        let forward = this.forwardSpeed;
        let lateral = this.vx * cos - this.vz * sin;
        if (!input.boost) this.boostLocked = false;
        if (this.boost < 1) this.boostLocked = true;
        this.boosting = input.boost && !this.boostLocked && input.throttle > 0.1 && forward >= 0 && this.boost > 1;
        this.boost = Math.max(0, Math.min(100, this.boost + (this.boosting ? -cfg.boostDrain : cfg.boostRecharge) * dt));

        // Brake has priority over throttle; holding W must not lengthen stopping distance.
        const pedal = Math.max(input.handbrake ? 1 : 0, Math.max(0, Math.min(1, input.brake)));
        const throttle = Math.max(-1, Math.min(1, input.throttle)) * (1 - pedal);
        const limit = (throttle < 0 ? cfg.reverseSpeed : this.boosting ? cfg.boostSpeed : cfg.maxSpeed) / 3.6;
        // Taper power toward the top speed; ordinary drag no longer caps speed at 74 km/h.
        const acceleration = throttle * (throttle < 0 ? cfg.reverseAcceleration : this.boosting ? cfg.boostAcceleration : cfg.acceleration)
            * Math.max(0, 1 - Math.pow(Math.max(0, forward * Math.sign(throttle)) / limit, 4));
        // Project gravity onto the road plane. The sign naturally handles reverse
        // travel, uphill rollback and downhill coasting without throttle.
        const plane = 1 + slopeX * slopeX + slopeZ * slopeZ;
        const forwardGrade = slopeX * sin + slopeZ * cos;
        const sideGrade = slopeX * cos - slopeZ * sin;
        forward += (acceleration / Math.sqrt(1 + forwardGrade * forwardGrade) - 9.81 * forwardGrade / plane) * dt;
        lateral -= 9.81 * sideGrade / plane * dt;
        const braking = pedal * (input.handbrake ? cfg.handbrakeDeceleration : cfg.brakeDeceleration) * grip + cfg.rollingResistance + cfg.drag * forward * forward
            + (Math.abs(throttle) < 0.05 ? cfg.engineResistance : 0);
        forward = Math.sign(forward) * Math.max(0, Math.abs(forward) - braking * dt);

        // Parking-speed steering uses the actual scaled wheelbase and full lock.
        // Only reduce steering authority once speed makes tight turns unstable.
        const speed = Math.abs(forward);
        const steer = input.steering / (1 + Math.pow(speed / cfg.steeringSpeedScale, 2));
        const desiredYaw = forward / cfg.wheelbase * Math.tan(steer);
        const maxYaw = Math.min(cfg.maxYawRate, cfg.cornerGrip * grip / Math.max(1, speed));
        const targetYaw = Math.max(-maxYaw, Math.min(maxYaw, desiredYaw));
        const yawResponse = speed < 10 ? 20 : 12;
        this.yawRate += (targetYaw - this.yawRate) * (1 - Math.exp(-yawResponse * dt));
        const yawDelta = this.yawRate * dt;
        this.yaw += yawDelta;
        // Grip driving: steering carries the travel direction with the body.
        // Residual sideways motion (from slopes or wall contact) decays without a drift mode.
        const nextSin = Math.sin(this.yaw), nextCos = Math.cos(this.yaw);
        lateral *= Math.exp(-cfg.lateralDamping * grip * dt);
        if (input.handbrake) lateral = Math.sign(lateral) * Math.max(0, Math.abs(lateral) - cfg.handbrakeDeceleration * grip * dt);
        this.vx = nextSin * forward + nextCos * lateral;
        this.vz = nextCos * forward - nextSin * lateral;
        if (input.handbrake && Math.abs(throttle) < 0.1 && Math.hypot(this.vx, this.vz) < 0.15) this.vx = this.vz = this.yawRate = 0;
        this.x += this.vx * dt;
        this.z += this.vz * dt;
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
