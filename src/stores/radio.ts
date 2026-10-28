/** Shared in-car radio playlist, playback state and volume preferences. @packageDocumentation */
import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { useSettingsStore } from "./settings";

export const useRadioStore = defineStore("radio", () => {
    const tracks = [
        { title: "Radio 1", url: `${import.meta.env.BASE_URL}music/Radio_1.mp3` },
        { title: "Radio 2", url: `${import.meta.env.BASE_URL}music/Radio_2.mp3` },
    ];
    const settings = useSettingsStore();
    const index = ref(0);
    const playing = ref(false);
    const error = ref("");
    const volume = useLocalStorage("cityDrivingSim_radioVolume", 0.35);
    const track = computed(() => tracks[index.value]!);
    let audio: HTMLAudioElement | null = null;
    let request = 0;

    /** Lazily creates the audio element so music is only fetched after user interaction. */
    const player = () => {
        if (!audio) {
            audio = new Audio(track.value.url);
            audio.preload = "none";
            audio.onended = () => { void changeTrack(1); };
            audio.onerror = () => {
                playing.value = false;
                error.value = "Unable to load this track. Try the next one.";
            };
        }
        audio.volume = Math.max(0, Math.min(1, Number(volume.value) || 0));
        audio.muted = settings.isSoundMuted;
        return audio;
    };
    /** Resumes the selected track, reporting playback restrictions without unhandled rejections. */
    const play = async () => {
        const current = ++request;
        error.value = "";
        playing.value = true;
        try { await player().play(); }
        catch (cause) {
            if (current !== request) return;
            playing.value = false;
            error.value = cause instanceof DOMException && cause.name === "NotAllowedError"
                ? "Tap play to enable the radio." : "Unable to play this track.";
        }
    };
    /** Pauses playback while preserving the current song position. */
    const pause = () => {
        request++;
        playing.value = false;
        audio?.pause();
    };
    /** Toggles radio playback from a user gesture. */
    const toggle = () => { if (playing.value) pause(); else void play(); };
    /** Selects a track with playlist wrapping and continues playback if the radio was on.
     * @param direction - Signed number of tracks to move through the playlist.
     */
    const changeTrack = async (direction: number) => {
        const resume = playing.value;
        pause();
        index.value = (index.value + direction + tracks.length) % tracks.length;
        error.value = "";
        if (audio) { audio.src = track.value.url; audio.load(); }
        if (resume) await play();
    };
    /** Stops playback and releases the media resource when leaving the car HUD. */
    const stop = () => {
        pause();
        if (audio) {
            audio.onended = audio.onerror = null;
            audio.removeAttribute("src");
            audio.load();
            audio = null;
        }
    };
    watch([volume, () => settings.isSoundMuted], () => { if (audio) player(); });
    return { tracks, index, track, playing, volume, error, toggle, changeTrack, stop };
});
