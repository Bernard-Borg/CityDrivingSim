/**
 * EngineSoundGenerator types and implementation for the city driving simulator.
 * @packageDocumentation
 */

/**
 * Procedural engine sound generator using Web Audio API
 * Generates dynamic engine sounds that react to car speed and acceleration
 */

import { DEFAULT_VEHICLE, targetEngineRPM } from "@/core/vehicle/VehicleConfig";
import type { VehicleConfig } from "@/core/vehicle/VehicleConfig";

/**
 * Owns a Web Audio oscillator graph for procedural engine tones.
 */
export class EngineSoundGenerator {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private engineGain: GainNode | null = null;
    private lowpassFilter: BiquadFilterNode | null = null;
    private distortion: WaveShaperNode | null = null;
    private exhaustFilter: BiquadFilterNode | null = null;
    private limiter: DynamicsCompressorNode | null = null;
    private outputLimiter: DynamicsCompressorNode | null = null;
    private isPlaying: boolean = false;
    private currentRPM: number = 0;

    // Oscillators for engine sound components
    private oscillators: OscillatorNode[] = [];
    private gainNodes: GainNode[] = [];

    // Sound parameters
    /**
     * Returns configured engine base frequency in hertz.
     */
    private get BASE_FREQUENCY() {
        return this.config.baseFrequency;
    }
    /**
     * Returns configured idle RPM.
     */
    private get MIN_RPM() {
        return this.config.idleRPM;
    }
    /**
     * Returns configured maximum RPM.
     */
    private get MAX_RPM() {
        return this.config.maxRPM;
    }
    /**
     * Returns current engine speed in revolutions per minute.
     */
    getRPM(): number {
        return this.isPlaying ? this.currentRPM : 0;
    }
    /**
     * Attempts to resume the audio context following a browser user gesture.
     */
    unlock(): void {
        if (this.audioContext?.state === "suspended") this.audioContext.resume().catch(() => {});
    }

    private isEnabled: boolean = true;

    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param config - Subsystem configuration.
     * @param MAX_CAR_SPEED - Speed normalization limit in km/h for audio synthesis.
     */
    constructor(
        private config: VehicleConfig["audio"] = DEFAULT_VEHICLE.audio,
        private MAX_CAR_SPEED = DEFAULT_VEHICLE.physics.boostSpeed,
    ) {
        // Initialize AudioContext (may need user interaction first)
        this.initAudioContext();
    }

    /**
     * Initializes the browser audio context and engine processing graph.
     */
    private async initAudioContext(): Promise<void> {
        try {
            // Use AudioContext if available
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) {
                console.warn("Web Audio API not supported");
                return;
            }

            this.audioContext = new AudioContextClass();

            // Create master gain node for volume control
            this.masterGain = this.audioContext.createGain();
            this.outputLimiter = this.audioContext.createDynamicsCompressor();
            this.outputLimiter.threshold.value = -3;
            this.outputLimiter.knee.value = 0;
            this.outputLimiter.ratio.value = 20;
            this.outputLimiter.attack.value = 0.003;
            this.outputLimiter.release.value = 0.08;
            this.masterGain.connect(this.outputLimiter);
            this.outputLimiter.connect(this.audioContext.destination);
            this.masterGain.gain.value = this.config.engineVolume;

            // Create engine gain node
            this.engineGain = this.audioContext.createGain();
            this.engineGain.connect(this.masterGain);
            this.engineGain.gain.value = 0;

            // Low-pass filter to keep the sound deep and remove harsh highs
            this.lowpassFilter = this.audioContext.createBiquadFilter();
            this.lowpassFilter.type = "lowpass";
            this.lowpassFilter.frequency.value = this.config.filterRange[0];
            this.lowpassFilter.Q.value = 0.7;

            // Warm saturation to make the engine sound less sterile
            this.distortion = this.audioContext.createWaveShaper();
            this.distortion.curve = this.createWarmDistortionCurve(this.config.saturation);
            this.distortion.oversample = "4x";

            // Chain: filter -> distortion -> engine gain -> master
            this.lowpassFilter.connect(this.distortion);
            // A second muffler stage removes harmonics introduced by saturation.
            this.exhaustFilter = this.audioContext.createBiquadFilter();
            this.exhaustFilter.type = "lowpass";
            this.exhaustFilter.frequency.value = 900;
            this.exhaustFilter.Q.value = 0.5;
            this.limiter = this.audioContext.createDynamicsCompressor();
            this.limiter.threshold.value = -18;
            this.limiter.knee.value = 18;
            this.limiter.ratio.value = 6;
            this.limiter.attack.value = 0.008;
            this.limiter.release.value = 0.2;
            this.distortion.connect(this.exhaustFilter);
            this.exhaustFilter.connect(this.limiter);
            this.limiter.connect(this.engineGain);
        } catch (error) {
            console.warn("Failed to initialize AudioContext:", error);
        }
    }

    /**
     * Start generating engine sound
     */
    start(): void {
        if (!this.isEnabled || !this.audioContext) return;

        // Resume audio context if suspended (browser autoplay policy)
        if (this.audioContext.state === "suspended") {
            this.audioContext.resume().catch((err) => {
                console.debug("Failed to resume audio context:", err);
            });
        }

        if (this.isPlaying) return;

        if (!this.engineGain) {
            this.initAudioContext().then(() => {
                if (this.engineGain) {
                    this.createEngineOscillators();
                }
            });
            return;
        }

        this.currentRPM = this.config.idleRPM;
        this.createEngineOscillators();
        this.isPlaying = true;
    }

    /**
     * Stop engine sound
     */
    stop(): void {
        if (!this.isPlaying) return;

        // Stop all oscillators
        this.oscillators.forEach((osc) => {
            try {
                osc.stop();
                osc.disconnect();
            } catch (e) {
                // Oscillator may already be stopped
            }
        });

        this.gainNodes.forEach((gain) => gain.disconnect());
        this.oscillators = [];
        this.gainNodes = [];
        this.isPlaying = false;
        this.currentRPM = 0;
    }

    /**
     * Create multiple oscillators to simulate engine sound
     * Uses multiple harmonics for realistic engine sound
     */
    private createEngineOscillators(): void {
        if (!this.audioContext || !this.engineGain) return;

        // Clear existing oscillators
        this.stop();

        for (const partial of this.config.harmonics)
            this.createOscillator(this.BASE_FREQUENCY * partial.ratio, partial.gain, partial.wave);

        // Start all oscillators
        this.oscillators.forEach((osc) => {
            osc.start();
        });
    }

    /**
     * Create a single oscillator with envelope
     */
    private createOscillator(frequency: number, volume: number, type: OscillatorType): void {
        if (!this.audioContext || !this.engineGain) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = type === "sawtooth" || type === "square" ? "triangle" : type;
        // Smooth, phase-locked compression pulses instead of a piercing lead-synth waveform.
        if (type !== "sine") {
            const real = new Float32Array(17), imaginary = new Float32Array(17);
            for (let harmonic = 1; harmonic < real.length; harmonic++)
                real[harmonic] = Math.exp(-harmonic * 0.65) / harmonic;
            oscillator.setPeriodicWave(this.audioContext.createPeriodicWave(real, imaginary));
        }
        oscillator.frequency.value = frequency;

        gainNode.gain.value = volume;

        oscillator.connect(gainNode);
        if (this.lowpassFilter) {
            gainNode.connect(this.lowpassFilter);
        } else {
            gainNode.connect(this.engineGain);
        }

        this.oscillators.push(oscillator);
        this.gainNodes.push(gainNode);
    }

    /**
     * Update engine sound based on car state
     * @param speed Car speed in km/h
     * @param acceleration Current acceleration (0-1)
     * @param isAccelerating Whether the car is actively accelerating
     */
    update(speed: number, acceleration: number, isAccelerating: boolean, delta = 1 / 60): void {
        if (!this.isEnabled || !this.audioContext || !this.isPlaying) {
            // Auto-start if not playing and we should be
            if (this.isEnabled && isAccelerating && speed > 0.5) {
                this.start();
            }
            return;
        }

        // Calculate speed ratio (0-1) based on max car speed
        const speedRatio = Math.min(1.0, Math.abs(speed) / this.MAX_CAR_SPEED);

        // Calculate base RPM from speed (linear mapping from MIN_RPM to MAX_RPM)
        // When speed is 0, RPM should be around idle (MIN_RPM)
        // When speed is max, RPM should be close to MAX_RPM
        // Approximate automatic gears: pitch falls on upshift, rather than one long drone.

        // Add RPM boost when accelerating (even when speed is low)
        // This makes the sound respond immediately to throttle input

        // Target RPM is based on speed, with additional boost when accelerating
        const targetRPM = targetEngineRPM(speed, acceleration, this.config);

        // Smooth RPM transition for realistic sound changes
        const rpmChangeRate = this.config.rpmResponse * Math.min(delta, 0.1); // RPM change per frame (60fps = ~480 RPM/second)
        if (targetRPM > this.currentRPM) {
            this.currentRPM = Math.min(targetRPM, this.currentRPM + rpmChangeRate);
        } else if (targetRPM < this.currentRPM) {
            // RPM drops faster when decelerating (realistic engine behavior)
            const decelRate = isAccelerating ? rpmChangeRate : rpmChangeRate * 1.5;
            this.currentRPM = Math.max(targetRPM, this.currentRPM - decelRate);
        }

        // Calculate frequency based on RPM using a logarithmic curve
        // Real engines have a deep, rumbly sound that doesn't get very high-pitched
        // Keep frequencies low for a realistic car engine sound
        const rpmRange = this.MAX_RPM - this.MIN_RPM;
        const rpmRatioRaw = rpmRange > 0 ? (this.currentRPM - this.MIN_RPM) / rpmRange : 0;
        const rpmRatio = Math.min(1, Math.max(0, Number.isFinite(rpmRatioRaw) ? rpmRatioRaw : 0)); // 0 to 1
        // Use a cubic curve (even slower growth) to keep frequencies low at all RPMs
        const frequencyCurve = Math.pow(rpmRatio, 0.7);
        // Four-stroke firing order with alternating-pulse body resonance one octave below.
        const idlePulse = this.config.idleRPM * this.config.cylinders / 240;
        const baseFreq = idlePulse * (this.BASE_FREQUENCY / 30) *
            Math.pow(Math.max(1, this.currentRPM / this.config.idleRPM), this.config.pitchTracking);

        // Update oscillator frequencies - keep everything deep and low-pitched
        this.oscillators.forEach((oscillator, index) => {
            oscillator.frequency.setTargetAtTime(baseFreq * this.config.harmonics[index]!.ratio, this.audioContext!.currentTime, 0.06);
        });

        // Dynamically open the low-pass filter slightly with RPM
        if (this.lowpassFilter) {
            const cutoffRaw = this.config.filterRange[0] + frequencyCurve * (this.config.filterRange[1] - this.config.filterRange[0]);
            const cutoff = Number.isFinite(cutoffRaw) ? cutoffRaw : 120;
            this.lowpassFilter.frequency.setTargetAtTime(
                cutoff,
                this.audioContext.currentTime,
                0.1,
            );
        }

        // Adjust volume based on acceleration (louder when accelerating)
        if (this.engineGain) {
            const volumeBase = 0.36;
            const volumeBoost = Math.max(0, Math.min(1, acceleration)) * 0.66;
            const volume = Math.min(1.0, volumeBase + volumeBoost);
            this.engineGain.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.1);
        }

        // Stop if car is completely stopped and not accelerating
        if (speed < 0.05 && !isAccelerating && acceleration === 0) {
            this.currentRPM = Math.max(this.MIN_RPM, this.currentRPM - rpmChangeRate * 2);
            if (this.currentRPM <= this.MIN_RPM) {
                // Keep minimal RPM for idle sound
            }
        }
    }

    /**
     * Set master volume (0-1)
     */
    setVolume(volume: number): void {
        if (this.masterGain) {
            const userGain = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
            const vehicleGain = Number.isFinite(this.config.engineVolume) ? this.config.engineVolume : 0.5;
            this.masterGain.gain.setTargetAtTime(vehicleGain * userGain, this.audioContext!.currentTime, 0.025);
        }
    }

    /**
     * Enable/disable engine sound
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (!enabled) {
            this.stop();
        }
    }

    /**
     * Reports whether audio playback is enabled.
     */
    getEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Cleanup - stop all sounds and close audio context
     */
    dispose(): void {
        this.stop();
        if (this.audioContext && this.audioContext.state !== "closed") {
            this.audioContext.close().catch((err) => {
                console.debug("Failed to close audio context:", err);
            });
        }
        this.audioContext = null;
        this.masterGain = null;
        this.engineGain = null;
        this.lowpassFilter = null;
        this.distortion = null;
        this.exhaustFilter = null;
        this.limiter = null;
        this.outputLimiter = null;
    }

    /**
     * Builds a soft-saturation transfer curve for shaping engine tones.
     *
     * @param amount - Distortion intensity.
     */
    private createWarmDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
        const samples = 44100;
        const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
        const k = typeof amount === "number" ? amount : 0;
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return curve;
    }
}
