/**
 * Sound Manager for handling game audio
 * Place audio files in public/sounds/ directory
 */
export class SoundManager {
    private static instance: SoundManager | null = null;
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private isEnabled: boolean = true;
    private masterVolume: number = 0.7;

    private constructor() {
        // Private constructor for singleton
    }

    static getInstance(): SoundManager {
        if (!SoundManager.instance) {
            SoundManager.instance = new SoundManager();
        }
        return SoundManager.instance;
    }

    /**
     * Load a sound file
     */
    async loadSound(name: string, path: string): Promise<void> {
        try {
            const audio = new Audio(path);
            audio.volume = this.masterVolume;
            audio.preload = 'auto';
            this.sounds.set(name, audio);
        } catch (error) {
            console.warn(`Failed to load sound: ${name}`, error);
        }
    }

    /**
     * Play a sound (if loaded)
     * Returns the audio element for external control.
     * Reuses the same element to avoid creating too many WebMediaPlayers.
     */
    play(name: string, volume: number = 1.0, loop: boolean = false): HTMLAudioElement | null {
        if (!this.isEnabled) return null;

        const audio = this.sounds.get(name);
        if (audio) {
            // Reuse the same element to avoid WebMediaPlayer exhaustion
            audio.pause();
            audio.currentTime = 0;
            audio.volume = this.masterVolume * volume;
            audio.loop = loop;
            audio.play().catch((err) => {
                // Autoplay policies may prevent this, that's okay
                console.debug(`Could not play sound ${name}:`, err);
            });
            return audio;
        }
        return null;
    }

    /**
     * Stop a specific sound
     */
    stop(name: string): void {
        const audio = this.sounds.get(name);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    /**
     * Stop all sounds
     */
    stopAll(): void {
        this.sounds.forEach((audio) => {
            audio.pause();
            audio.currentTime = 0;
        });
    }

    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (!enabled) {
            this.stopAll();
        }
    }

    getEnabled(): boolean {
        return this.isEnabled;
    }

    toggleMute(): boolean {
        this.isEnabled = !this.isEnabled;
        if (!this.isEnabled) {
            this.stopAll();
        }
        return this.isEnabled;
    }

    setMasterVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }
}