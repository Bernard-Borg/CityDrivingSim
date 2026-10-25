/**
 * Procedural road noise generator using Web Audio API.
 * Uses filtered noise whose volume and tone depend on speed and surface type.
 */
export class RoadSoundGenerator {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private noiseSource: AudioBufferSourceNode | null = null;
    private noiseGain: GainNode | null = null;
    private lowpassFilter: BiquadFilterNode | null = null;
    private skidSource: AudioBufferSourceNode | null = null;
    private skidFilter: BiquadFilterNode | null = null;
    private skidGain: GainNode | null = null;
    private effects = new Set<AudioBufferSourceNode>();
    private impactBuffer: AudioBuffer | null = null;
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

    constructor() {
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
            this.skidGain = this.audioContext.createGain();
            this.skidGain.gain.value = 0;
            this.skidGain.connect(this.masterGain);
            // Broad, textured friction noise instead of a pitched oscillator beep.
            const skidBuffer = this.audioContext.createBuffer(2, this.audioContext.sampleRate * 3, this.audioContext.sampleRate);
            for (let channel = 0; channel < 2; channel++) {
                const samples = skidBuffer.getChannelData(channel);
                let low = 0, texture = 0;
                for (let i = 0; i < samples.length; i++) {
                    const white = Math.random() * 2 - 1;
                    low = low * 0.96 + white * 0.04;
                    texture = texture * 0.998 + Math.random() * 0.002;
                    const edgeFade = Math.min(1, i / 256, (samples.length - 1 - i) / 256);
                    samples[i] = (white * 0.55 + low * 2) * (0.55 + texture) * edgeFade;
                }
            }
            this.skidFilter = this.audioContext.createBiquadFilter();
            this.skidFilter.type = 'bandpass';
            this.skidFilter.frequency.value = 1400;
            this.skidFilter.Q.value = 0.65;
            this.skidFilter.connect(this.skidGain);
            this.skidSource = this.audioContext.createBufferSource();
            this.skidSource.buffer = skidBuffer;
            this.skidSource.loop = true;
            this.skidSource.connect(this.skidFilter);
            this.skidSource.start();
            this.impactBuffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.25, this.audioContext.sampleRate);
            const impactSamples = this.impactBuffer.getChannelData(0);
            for (let i = 0; i < impactSamples.length; i++) {
                const time = i / this.audioContext.sampleRate;
                impactSamples[i] = ((Math.random() * 2 - 1) * 0.6 + Math.sin(time * 400) * 0.4) * Math.exp(-time * 24);
            }

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
        if (!this.isEnabled || !this.audioContext || !this.impactBuffer || !this.masterGain) return;
        const source = this.audioContext.createBufferSource();
        const gain = this.audioContext.createGain();
        source.buffer = this.impactBuffer;
        gain.gain.value = Math.max(0, Math.min(1, strength));
        source.connect(gain);
        gain.connect(this.masterGain);
        this.effects.add(source);
        source.onended = () => { source.disconnect(); gain.disconnect(); this.effects.delete(source); };
        source.start();
    }

    setSkid(slip: number, speed: number): void {
        if (!this.audioContext || !this.skidGain || !this.skidFilter || !this.skidSource) return;
        const intensity = this.isEnabled && speed > 15 ? Math.max(0, Math.min(1, slip)) : 0;
        const now = this.audioContext.currentTime;
        // Gentle onset/release and restrained volume keep ordinary driving quiet.
        this.skidGain.gain.setTargetAtTime(Math.pow(intensity, 1.3) * 0.14, now, 0.12);
        this.skidFilter.frequency.setTargetAtTime(900 + intensity * 900, now, 0.15);
        this.skidSource.playbackRate.setTargetAtTime(0.85 + Math.min(1, speed / 160) * 0.3, now, 0.2);
    }

    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (this.masterGain && this.audioContext) this.masterGain.gain.setTargetAtTime(enabled ? 0.6 : 0, this.audioContext.currentTime, 0.02);
        if (!enabled) {
            this.stop();
        }
    }

    stop(): void {
        if (this.skidGain) this.skidGain.gain.value = 0;
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
        this.skidSource?.stop();
        this.skidSource?.disconnect();
        this.skidFilter?.disconnect();
        this.skidGain?.disconnect();
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
