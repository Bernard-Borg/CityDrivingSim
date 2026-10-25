export interface VehicleInput {
    throttle: number;
    brake: number;
    steering: number;
    handbrake: boolean;
    boost: boolean;
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

    get forwardSpeed(): number {
        return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
    }

    reset(): void {
        this.vx = this.vz = this.yawRate = this.slip = 0;
        this.boosting = false;
        this.boostLocked = false;
    }

    step(dt: number, input: VehicleInput, grip = 1, slopeX = 0, slopeZ = 0): void {
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        let forward = this.forwardSpeed;
        let lateral = this.vx * cos - this.vz * sin;
        if (!input.boost) this.boostLocked = false;
        if (this.boost < 1) this.boostLocked = true;
        this.boosting = input.boost && !this.boostLocked && input.throttle > 0.1 && forward >= 0 && this.boost > 1;
        this.boost = Math.max(0, Math.min(100, this.boost + (this.boosting ? -30 : 15) * dt));

        // Brake has priority over throttle; holding W must not lengthen stopping distance.
        const pedal = Math.max(0, Math.min(1, input.brake));
        const throttle = Math.max(-1, Math.min(1, input.throttle)) * (1 - pedal);
        const limit = (throttle < 0 ? 35 : this.boosting ? 250 : 200) / 3.6;
        // Taper power toward the top speed; ordinary drag no longer caps speed at 74 km/h.
        const acceleration = throttle * (throttle < 0 ? 4 : this.boosting ? 15 : 9)
            * Math.max(0, 1 - Math.pow(Math.max(0, forward * Math.sign(throttle)) / limit, 4));
        // Project gravity onto the road plane. The sign naturally handles reverse
        // travel, uphill rollback and downhill coasting without throttle.
        const plane = 1 + slopeX * slopeX + slopeZ * slopeZ;
        const forwardGrade = slopeX * sin + slopeZ * cos;
        const sideGrade = slopeX * cos - slopeZ * sin;
        forward += (acceleration / Math.sqrt(1 + forwardGrade * forwardGrade) - 9.81 * forwardGrade / plane) * dt;
        lateral -= 9.81 * sideGrade / plane * dt;
        const braking = pedal * 20 * grip
            + (input.handbrake ? 5 : 0) + 0.15 + 0.00025 * forward * forward
            + (Math.abs(throttle) < 0.05 ? 0.18 : 0);
        forward = Math.sign(forward) * Math.max(0, Math.abs(forward) - braking * dt);

        // Parking-speed steering uses the actual scaled wheelbase and full lock.
        // Only reduce steering authority once speed makes tight turns unstable.
        const speed = Math.abs(forward);
        const steer = input.steering / (1 + Math.pow(speed / 28, 2));
        const desiredYaw = forward / 1.9 * Math.tan(steer) * (input.handbrake ? 1.15 : 1);
        const maxYaw = Math.min(2.4, (input.handbrake ? 16 : 14) * grip / Math.max(1, speed));
        const targetYaw = Math.max(-maxYaw, Math.min(maxYaw, desiredYaw));
        const yawResponse = speed < 10 ? 20 : 12;
        this.yawRate += (targetYaw - this.yawRate) * (1 - Math.exp(-yawResponse * dt));
        lateral *= Math.exp(-(input.handbrake ? 1.8 : 32) * grip * dt);
        const yawDelta = this.yawRate * dt;
        this.yaw += yawDelta;
        // Ordinary tires carry the velocity around the turn. Deliberate drifting
        // retains world-space momentum rather than making every corner feel icy.
        const follow = input.handbrake ? 0.12 : Math.min(1, 0.98 * grip);
        const velocityHeading = this.yaw - yawDelta * (1 - follow);
        this.vx = Math.sin(velocityHeading) * forward + Math.cos(velocityHeading) * lateral;
        this.vz = Math.cos(velocityHeading) * forward - Math.sin(velocityHeading) * lateral;
        this.x += this.vx * dt;
        this.z += this.vz * dt;
        this.slip = Math.abs(this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw));
    }
}

/** Discard suspension time, and cap catch-up work to avoid a spiral after a slow frame. */
export class PhysicsClock {
    private accumulator = 0;
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
