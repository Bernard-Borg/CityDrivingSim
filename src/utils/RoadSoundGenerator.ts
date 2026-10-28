/**
 * RoadSoundGenerator types and implementation for the city driving simulator.
 * @packageDocumentation
 */

/** One-shot vehicle effects only: no speed-based wind/road noise loops. */
import { vehicleSound } from "./VehicleAudio";
import { DEFAULT_VEHICLE } from "@/core/vehicle/VehicleConfig";
import type { VehicleConfig } from "@/core/vehicle/VehicleConfig";

/**
 * Owns procedural ignition and impact buffers and their one-shot playback resources.
 */
export class RoadSoundGenerator {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private effects = new Set<AudioBufferSourceNode>();
    private impactBuffer: AudioBuffer | null = null;
    private ignitionBuffer: AudioBuffer | null = null;
    private isEnabled = true;

    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param config - Subsystem configuration.
     */
    constructor(private config: VehicleConfig["audio"] = DEFAULT_VEHICLE.audio) {
        try {
            const AudioContextClass =
                window.AudioContext ||
                (
                    window as unknown as {
                        webkitAudioContext?: typeof AudioContext;
                    }
                ).webkitAudioContext;
            if (!AudioContextClass) return;
            this.audioContext = new AudioContextClass();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.6;
            this.masterGain.connect(this.audioContext.destination);
            /**
             * Creates a mono Web Audio buffer from procedural ignition or impact samples.
             *
             * @param kind - Road structure or sound variant, as indicated by its type.
             * @param duration - Sound duration in seconds.
             */
            const makeBuffer = (kind: "impact" | "ignition", duration?: number) => {
                const samples = vehicleSound(kind, this.audioContext!.sampleRate, duration);
                const buffer = this.audioContext!.createBuffer(
                    1,
                    samples.length,
                    this.audioContext!.sampleRate,
                );
                buffer.getChannelData(0).set(samples);
                return buffer;
            };
            this.impactBuffer = makeBuffer("impact");
            this.ignitionBuffer = makeBuffer("ignition", config.ignitionDuration);
        } catch (error) {
            console.warn("Failed to initialize vehicle effects:", error);
        }
    }
    /**
     * Starts or resumes enabled audio playback.
     */
    start(): void {
        if (this.isEnabled && this.audioContext?.state === "suspended")
            this.audioContext
                .resume()
                .catch((error) => console.debug("Failed to resume vehicle effects:", error));
    }
    /**
     * Plays an impact effect with strength-dependent gain and playback rate.
     *
     * @param strength - Normalized collision intensity.
     */
    playImpact(strength: number): void {
        this.playEffect(
            this.impactBuffer,
            Math.pow(Math.max(0, Math.min(1, strength)), 0.7) * this.config.impactVolume,
            1.04 - Math.max(0, Math.min(1, strength)) * 0.12,
        );
    }

    /**
     * Resumes audio when permitted and plays the ignition effect.
     */
    playIgnition(): void {
        this.start();
        this.playEffect(this.ignitionBuffer, 0.65);
    }

    /**
     * Plays a one-shot buffer through its own gain node and disconnects resources after playback.
     *
     * @param buffer - Raw signed big-endian HGT elevation bytes.
     * @param volume - Playback gain, normally zero through one.
     * @param rate - Audio playback-rate multiplier.
     */
    private playEffect(buffer: AudioBuffer | null, volume: number, rate = 1): void {
        if (!this.isEnabled || !this.audioContext || !buffer || !this.masterGain) return;
        const source = this.audioContext.createBufferSource();
        const gain = this.audioContext.createGain();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(this.masterGain);
        this.effects.add(source);
        source.onended = () => {
            source.disconnect();
            gain.disconnect();
            this.effects.delete(source);
        };
        source.start();
    }

    /**
     * Enables or disables this subsystem and synchronizes its input or playback state.
     *
     * @param enabled - Whether this subsystem is enabled.
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (this.masterGain && this.audioContext)
            this.masterGain.gain.setTargetAtTime(
                enabled ? 0.6 : 0,
                this.audioContext.currentTime,
                0.02,
            );
        if (!enabled) this.stop();
    }
    /**
     * Stops currently playing audio owned by the instance.
     */
    stop(): void {
        for (const source of this.effects) {
            source.stop();
            source.disconnect();
        }
        this.effects.clear();
    }
    /**
     * Releases owned resources and unregisters scene objects, browser listeners or audio nodes as applicable.
     */
    dispose(): void {
        this.stop();
        if (this.audioContext && this.audioContext.state !== "closed")
            this.audioContext
                .close()
                .catch((error) => console.debug("Failed to close vehicle effects:", error));
        this.audioContext = null;
        this.masterGain = null;
        this.impactBuffer = this.ignitionBuffer = null;
    }
}
