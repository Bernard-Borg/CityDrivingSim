/** One-shot vehicle effects only: no speed-based wind/road noise loops. */
import { vehicleSound } from './VehicleAudio';
import { DEFAULT_VEHICLE } from '@/core/vehicle/VehicleConfig';
import type { VehicleConfig } from '@/core/vehicle/VehicleConfig';

export class RoadSoundGenerator {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private effects = new Set<AudioBufferSourceNode>();
    private impactBuffer: AudioBuffer | null = null;
    private ignitionBuffer: AudioBuffer | null = null;
    private isEnabled = true;

    constructor(private config: VehicleConfig['audio'] = DEFAULT_VEHICLE.audio) {
        try {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) return;
            this.audioContext = new AudioContextClass();
            this.masterGain = this.audioContext.createGain(); this.masterGain.gain.value = 0.6;
            this.masterGain.connect(this.audioContext.destination);
            const makeBuffer = (kind: 'impact' | 'ignition', duration?: number) => {
                const samples = vehicleSound(kind, this.audioContext!.sampleRate, duration);
                const buffer = this.audioContext!.createBuffer(1, samples.length, this.audioContext!.sampleRate);
                buffer.getChannelData(0).set(samples); return buffer;
            };
            this.impactBuffer = makeBuffer('impact'); this.ignitionBuffer = makeBuffer('ignition', config.ignitionDuration);
        } catch (error) { console.warn('Failed to initialize vehicle effects:', error); }
    }
    start(): void {
        if (this.isEnabled && this.audioContext?.state === 'suspended')
            this.audioContext.resume().catch(error => console.debug('Failed to resume vehicle effects:', error));
    }
    playImpact(strength: number): void {
        this.playEffect(this.impactBuffer, Math.pow(Math.max(0, Math.min(1, strength)), 0.7) * this.config.impactVolume, 1.04 - Math.max(0, Math.min(1, strength)) * 0.12);
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
        if (!enabled) this.stop();
    }
    stop(): void {
        for (const source of this.effects) { source.stop(); source.disconnect(); }
        this.effects.clear();
    }
    dispose(): void {
        this.stop();
        if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close().catch(error => console.debug('Failed to close vehicle effects:', error));
        this.audioContext = null; this.masterGain = null; this.impactBuffer = this.ignitionBuffer = null;
    }
}
