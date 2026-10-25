/**
 * Procedural road noise generator using Web Audio API.
 * Uses filtered noise whose volume and tone depend on speed and surface type.
 */
import { vehicleSound } from './VehicleAudio';
import { DEFAULT_VEHICLE } from '@/core/vehicle/VehicleConfig';
import type { VehicleConfig } from '@/core/vehicle/VehicleConfig';

export class RoadSoundGenerator {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private noiseSource: AudioBufferSourceNode | null = null;
    private noiseGain: GainNode | null = null;
    private lowpassFilter: BiquadFilterNode | null = null;
    private effects = new Set<AudioBufferSourceNode>();
    private impactBuffer: AudioBuffer | null = null;
    private ignitionBuffer: AudioBuffer | null = null;
    private isEnabled: boolean = true;
    private isPlaying: boolean = false;

    private readonly surfaceProfiles: Record<string, { gain: number; cutoff: number; }> = {
        asphalt: { gain: 0.18, cutoff: 900 },
        concrete: { gain: 0.16, cutoff: 850 },
        paved: { gain: 0.17, cutoff: 900 },
        cobblestone: { gain: 0.24, cutoff: 650 },
        gravel: { gain: 0.26, cutoff: 700 },
        dirt: { gain: 0.22, cutoff: 600 },
        ground: { gain: 0.2, cutoff: 650 },
        sand: { gain: 0.18, cutoff: 550 }
    };

    constructor(private config: VehicleConfig['audio'] = DEFAULT_VEHICLE.audio) {
        this.initAudioContext();
    }

    private async initAudioContext(): Promise<void> {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) {
                console.warn('Web Audio API not supported');
                return;
            }

            this.audioContext = new AudioContextClass();

            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = 0.6;
            const impact = vehicleSound('impact', this.audioContext.sampleRate);
            this.impactBuffer = this.audioContext.createBuffer(1, impact.length, this.audioContext.sampleRate);
            this.impactBuffer.getChannelData(0).set(impact);
            const ignition = vehicleSound('ignition', this.audioContext.sampleRate, this.config.ignitionDuration);
            this.ignitionBuffer = this.audioContext.createBuffer(1, ignition.length, this.audioContext.sampleRate);
            this.ignitionBuffer.getChannelData(0).set(ignition);

            this.lowpassFilter = this.audioContext.createBiquadFilter();
            this.lowpassFilter.type = 'lowpass';
            this.lowpassFilter.frequency.value = 900;
            this.lowpassFilter.Q.value = 0.6;

            this.noiseGain = this.audioContext.createGain();
            this.noiseGain.gain.value = 0;

            this.lowpassFilter.connect(this.noiseGain);
            this.noiseGain.connect(this.masterGain);
        } catch (error) {
            console.warn('Failed to initialize AudioContext:', error);
        }
    }

    start(): void {
        if (!this.isEnabled || !this.audioContext) return;

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(err => {
                console.debug('Failed to resume audio context:', err);
            });
        }

        if (this.isPlaying) return;

        if (!this.noiseGain || !this.lowpassFilter) {
            this.initAudioContext().then(() => {
                if (this.noiseGain && this.lowpassFilter) {
                    this.createNoise();
                }
            });
            return;
        }

        this.createNoise();
        this.isPlaying = true;
    }

    private createNoise(): void {
        if (!this.audioContext || !this.lowpassFilter) return;

        if (this.noiseSource) {
            try {
                this.noiseSource.stop();
                this.noiseSource.disconnect();
            } catch (e) {
                // Ignore if already stopped
            }
            this.noiseSource = null;
        }

        const bufferSize = this.audioContext.sampleRate;
        const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * 0.2;
        }

        this.noiseSource = this.audioContext.createBufferSource();
        this.noiseSource.buffer = noiseBuffer;
        this.noiseSource.loop = true;
        this.noiseSource.connect(this.lowpassFilter);
        this.noiseSource.start();
    }

    update(speed: number, surface: string): void {
        if (!this.isEnabled || !this.audioContext || !this.noiseGain || !this.lowpassFilter) {
            return;
        }

        if (!this.isPlaying && speed > 1) {
            this.start();
        }

        const profile = this.surfaceProfiles[surface] || this.surfaceProfiles.asphalt;
        const speedFactorRaw = Math.min(1, Math.max(0, speed / 110));
        const speedFactor = Number.isFinite(speedFactorRaw) ? speedFactorRaw : 0;

        const targetGain = profile.gain * Math.pow(speedFactor, 1.2);
        const targetCutoff = profile.cutoff + (speedFactor * 400);

        this.noiseGain.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.1);
        this.lowpassFilter.frequency.setTargetAtTime(targetCutoff, this.audioContext.currentTime, 0.1);

        if (speed < 0.5) {
            this.noiseGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.2);
        }
    }

    playImpact(strength: number): void {
        this.playEffect(this.impactBuffer, Math.pow(Math.max(0, Math.min(1, strength)), 0.7) * this.config.impactVolume, 0.85 + strength * 0.3);
    }

    playIgnition(): void { this.start(); this.playEffect(this.ignitionBuffer, 0.65); }

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
        source.onended = () => { source.disconnect(); gain.disconnect(); this.effects.delete(source); };
        source.start();
    }

    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (this.masterGain && this.audioContext) this.masterGain.gain.setTargetAtTime(enabled ? 0.6 : 0, this.audioContext.currentTime, 0.02);
        if (!enabled) {
            this.stop();
        }
    }

    stop(): void {
        this.effects.forEach(source => source.stop());
        this.effects.clear();
        if (this.noiseSource) {
            try {
                this.noiseSource.stop();
                this.noiseSource.disconnect();
            } catch (e) {
                // Ignore if already stopped
            }
            this.noiseSource = null;
        }
        if (this.noiseGain) {
            this.noiseGain.gain.value = 0;
        }
        this.isPlaying = false;
    }

    dispose(): void {
        this.stop();
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(err => {
                console.debug('Failed to close audio context:', err);
            });
        }
        this.audioContext = null;
        this.masterGain = null;
        this.noiseGain = null;
        this.lowpassFilter = null;
    }
}