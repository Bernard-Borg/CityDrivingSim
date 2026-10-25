/** Reusable procedural SFX buffers, independent of AudioContext for offline inspection. */
export function vehicleSound(kind: 'impact' | 'ignition', sampleRate: number, duration = kind === 'impact' ? 0.65 : 0.95): Float32Array {
    const samples = new Float32Array(Math.ceil(sampleRate * duration));
    let seed = 17029, low = 0, phase = 0;
    const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
    for (let i = 0; i < samples.length; i++) {
        const t = i / sampleRate, u = t / duration, white = noise();
        low = low * 0.92 + white * 0.08;
        const fade = Math.min(1, t / 0.003, (duration - t) / 0.025);
        if (kind === 'impact') {
            const body = Math.sin(2 * Math.PI * (73 * t - 25 * t * t)) * Math.exp(-t * 15);
            const metal = (Math.sin(2 * Math.PI * 347 * t) + 0.5 * Math.sin(2 * Math.PI * 581 * t)) * Math.exp(-t * 22);
            samples[i] = (body * 0.65 + metal * 0.12 + white * Math.exp(-t * 55) * 0.3 + low * Math.exp(-t * 10) * 0.3) * fade;
        } else {
            // Starter motor and compression pulses, followed by combustion catch.
            const crankRate = 10 + u * 7;
            phase += 2 * Math.PI * crankRate / sampleRate;
            const compression = Math.pow(0.5 + 0.5 * Math.sin(phase), 5);
            const starter = Math.min(1, t / 0.035) * Math.exp(-Math.max(0, u - 0.58) * 16);
            const motor = Math.sin(2 * Math.PI * (160 * t + 65 * t * t)) * 0.075;
            const gear = Math.sin(2 * Math.PI * 1380 * t) * 0.018;
            const catchLevel = Math.max(0, Math.min(1, (u - 0.57) / 0.12));
            const firing = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * (22 * t + 6 * t * t)), 4);
            const body = (low * 1.6 + white * 0.10) * (0.35 + firing * 0.65) * catchLevel;
            const keyClick = white * Math.exp(-t * 180) * 0.16;
            samples[i] = (starter * ((motor + gear) * (0.45 + compression * 0.55) + low * compression * 0.6)
                + body * 0.7 + keyClick) * fade;
        }
    }
    let peak = 0;
    for (const value of samples) peak = Math.max(peak, Math.abs(value));
    if (peak > 0.95) for (let i = 0; i < samples.length; i++) samples[i] *= 0.95 / peak;
    return samples;
}
