/**
 * Procedural engine sound generator using Web Audio API
 * Generates dynamic engine sounds that react to car speed and acceleration
 */

export class EngineSoundGenerator {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private engineGain: GainNode | null = null;
    private lowpassFilter: BiquadFilterNode | null = null;
    private distortion: WaveShaperNode | null = null;
    private noiseSource: AudioBufferSourceNode | null = null;
    private noiseGain: GainNode | null = null;
    private isPlaying: boolean = false;
    private currentRPM: number = 0;

    // Oscillators for engine sound components
    private oscillators: OscillatorNode[] = [];
    private gainNodes: GainNode[] = [];

    // Sound parameters
    private readonly BASE_FREQUENCY = 30; // Base engine frequency (Hz) - deep idle rumble
    private readonly MIN_RPM = 800; // Idle RPM
    private readonly MAX_RPM = 6000; // Max RPM
    private readonly MAX_CAR_SPEED = 324; // km/h (max speed with boost)

    private isEnabled: boolean = true;

    constructor() {
        // Initialize AudioContext (may need user interaction first)
        this.initAudioContext();
    }

    private async initAudioContext(): Promise<void> {
        try {
            // Use AudioContext if available
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) {
                console.warn('Web Audio API not supported');
                return;
            }

            this.audioContext = new AudioContextClass();

            // Create master gain node for volume control
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = 0.6; // Master volume

            // Create engine gain node
            this.engineGain = this.audioContext.createGain();
            this.engineGain.connect(this.masterGain);
            this.engineGain.gain.value = 0.8;

            // Low-pass filter to keep the sound deep and remove harsh highs
            this.lowpassFilter = this.audioContext.createBiquadFilter();
            this.lowpassFilter.type = 'lowpass';
            this.lowpassFilter.frequency.value = 180;
            this.lowpassFilter.Q.value = 0.7;

            // Warm saturation to make the engine sound less sterile
            this.distortion = this.audioContext.createWaveShaper();
            this.distortion.curve = this.createWarmDistortionCurve(0.25);
            this.distortion.oversample = '4x';

            // Chain: filter -> distortion -> engine gain -> master
            this.lowpassFilter.connect(this.distortion);
            this.distortion.connect(this.engineGain);
        } catch (error) {
            console.warn('Failed to initialize AudioContext:', error);
        }
    }

    /**
     * Start generating engine sound
     */
    start(): void {
        if (!this.isEnabled || !this.audioContext || this.isPlaying) return;

        // Resume audio context if suspended (browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(err => {
                console.debug('Failed to resume audio context:', err);
            });
        }

        if (!this.engineGain) {
            this.initAudioContext().then(() => {
                if (this.engineGain) {
                    this.createEngineOscillators();
                }
            });
            return;
        }

        this.createEngineOscillators();
        this.isPlaying = true;
    }

    /**
     * Stop engine sound
     */
    stop(): void {
        if (!this.isPlaying) return;

        // Stop all oscillators
        this.oscillators.forEach(osc => {
            try {
                osc.stop();
            } catch (e) {
                // Oscillator may already be stopped
            }
        });

        this.oscillators = [];
        this.gainNodes = [];
        if (this.noiseSource) {
            try {
                this.noiseSource.stop();
            } catch (e) {
                // Ignore if already stopped
            }
            this.noiseSource = null;
        }
        if (this.noiseGain) {
            this.noiseGain.disconnect();
            this.noiseGain = null;
        }
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

        // Create multiple oscillators for realistic deep engine rumble
        // Use triangle/sine to avoid harsh harmonics
        // Main engine tone (fundamental) - this will be updated dynamically
        this.createOscillator(this.BASE_FREQUENCY, 0.7, 'triangle');

        // Deep bass rumble (0.5x - sub-harmonic) - strong low-end foundation
        this.createOscillator(this.BASE_FREQUENCY * 0.5, 0.5, 'sine');

        // Subtle harmonic (1.1x) - mild character without ringing
        this.createOscillator(this.BASE_FREQUENCY * 1.1, 0.12, 'triangle');

        // Add subtle filtered noise for engine texture
        this.createNoiseSource();

        // Start all oscillators
        this.oscillators.forEach(osc => {
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

        oscillator.type = type;
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

    private createNoiseSource(): void {
        if (!this.audioContext || !this.lowpassFilter) return;

        if (this.noiseSource) {
            try {
                this.noiseSource.stop();
            } catch (e) {
                // Ignore if already stopped
            }
            this.noiseSource = null;
        }

        const bufferSize = this.audioContext.sampleRate;
        const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * 0.15;
        }

        this.noiseSource = this.audioContext.createBufferSource();
        this.noiseSource.buffer = noiseBuffer;
        this.noiseSource.loop = true;

        this.noiseGain = this.audioContext.createGain();
        this.noiseGain.gain.value = 0.04;

        this.noiseSource.connect(this.noiseGain);
        this.noiseGain.connect(this.lowpassFilter);
        this.noiseSource.start();
    }

    /**
     * Update engine sound based on car state
     * @param speed Car speed in km/h
     * @param acceleration Current acceleration (0-1)
     * @param isAccelerating Whether the car is actively accelerating
     */
    update(speed: number, acceleration: number, isAccelerating: boolean): void {
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
        const speedBasedRPM = this.MIN_RPM + (speedRatio * (this.MAX_RPM - this.MIN_RPM));

        // Add RPM boost when accelerating (even when speed is low)
        // This makes the sound respond immediately to throttle input
        const accelerationRPMBoost = acceleration > 0 ? acceleration * 1500 : 0;

        // Target RPM is based on speed, with additional boost when accelerating
        const targetRPM = Math.max(this.MIN_RPM, Math.min(this.MAX_RPM, speedBasedRPM + accelerationRPMBoost));

        // Smooth RPM transition for realistic sound changes
        const rpmChangeRate = 8; // RPM change per frame (60fps = ~480 RPM/second)
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
        const frequencyCurve = Math.pow(rpmRatio, 0.7); // Grows very slowly - stays in bass range
        const frequencyRange = 25; // Very limited frequency range (Hz) - deep engine rumble
        const baseFreq = this.BASE_FREQUENCY + (frequencyCurve * frequencyRange); // ~30 Hz to ~55 Hz (deep, rumbly)

        // Update oscillator frequencies - keep everything deep and low-pitched
        if (this.oscillators.length >= 3 && Number.isFinite(baseFreq)) {
            this.oscillators[0].frequency.setTargetAtTime(baseFreq, this.audioContext.currentTime, 0.1); // Main tone
            this.oscillators[1].frequency.setTargetAtTime(baseFreq * 0.5, this.audioContext.currentTime, 0.1); // Deep bass rumble
            this.oscillators[2].frequency.setTargetAtTime(baseFreq * 1.1, this.audioContext.currentTime, 0.1); // Subtle harmonic
        }

        // Dynamically open the low-pass filter slightly with RPM
        if (this.lowpassFilter) {
            const cutoffRaw = 120 + (frequencyCurve * 180); // 120 Hz to 300 Hz
            const cutoff = Number.isFinite(cutoffRaw) ? cutoffRaw : 120;
            this.lowpassFilter.frequency.setTargetAtTime(cutoff, this.audioContext.currentTime, 0.1);
        }

        // Adjust volume based on acceleration (louder when accelerating)
        if (this.engineGain) {
            const volumeBase = 0.7;
            const volumeBoost = acceleration * 0.4;
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
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
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

    getEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Cleanup - stop all sounds and close audio context
     */
    dispose(): void {
        this.stop();
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(err => {
                console.debug('Failed to close audio context:', err);
            });
        }
        this.audioContext = null;
        this.masterGain = null;
        this.engineGain = null;
        this.lowpassFilter = null;
        this.distortion = null;
        this.noiseSource = null;
        this.noiseGain = null;
    }

    private createWarmDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
        const samples = 44100;
        const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
        const k = typeof amount === 'number' ? amount : 0;
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
        }
        return curve;
    }
}
