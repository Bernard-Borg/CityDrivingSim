<script setup lang="ts">
import { useSimulatorStore } from "@/stores/simulator";
import { ref, onUnmounted } from "vue";
import HudIcon from "./HudIcon.vue";
import { SoundManager } from "@/utils/SoundManager";
import { useSettingsStore } from "@/stores/settings";

const props = defineProps<{ hideTrigger?: boolean }>();

const AUDIO_CHANNELS = [
    { key: "engineVolume", label: "Engine" },
    { key: "musicVolume", label: "Music" },
    { key: "effectsVolume", label: "Effects", hint: "Collisions, horn and ignition" },
] as const;

const HUD_ELEMENTS = [
    { key: "showSpeedometer", label: "Speedometer", hint: "Speed, engine and boost instruments" },
    { key: "showCompass", label: "Compass", hint: "Heading and coordinates" },
    { key: "showSearch", label: "Search", hint: "Street and coordinate search" },
] as const;

const page = ref<"general" | "hud">("general");
const simulator = useSimulatorStore();
const settings = useSettingsStore();
const dialog = ref<HTMLDialogElement | null>(null);

const open = () => {
    simulator.setPauseReason("settings", true);
    dialog.value?.showModal();
};

const close = () => dialog.value?.close();
const closed = () => simulator.setPauseReason("settings", false);
const toggleMute = () => {
    settings.isSoundMuted = !settings.isSoundMuted;
    SoundManager.getInstance().setEnabled(!settings.isSoundMuted);
};

const changeTerrain = () => {
    close();
    simulator.setPauseReason("settings", false);
    simulator.applyTerrain();
};

defineExpose({ open });

onUnmounted(() => {
    simulator.setPauseReason("settings", false);
});
</script>

<template>
    <button v-if="!props.hideTrigger" class="wander-secondary wander-button compact icon settings-button" aria-label="Open settings" title="Settings" @click="open">
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 3 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-3Z" />
            <circle cx="12" cy="11" r="3" />
        </svg>
    </button>
    <dialog
        ref="dialog"
        class="wander-dialog settings-dialog" :class="{ 'wander-secondary': !props.hideTrigger }" aria-labelledby="settings-title"
        @close="closed"
        @click="$event.target === dialog && close()"
        @keydown.stop
    >
        <div class="wander-dialog-head">
            <div><p class="wander-eyebrow">Wander / Preferences</p><h2 id="settings-title">Settings</h2></div>
            <button class="wander-button compact icon" autofocus aria-label="Close settings" @click="close">&#215;</button>
        </div>
        <nav class="settings-pages" aria-label="Settings pages">
            <button class="wander-button compact" :aria-pressed="page === 'general'" @click="page = 'general'">General</button>
            <button class="wander-button compact" :aria-pressed="page === 'hud'" @click="page = 'hud'">HUD</button>
        </nav>
        <section v-if="page === 'general'" aria-label="General settings">
        <h3 class="wander-section-title">Audio</h3>
        <button class="wander-button compact mute-toggle" :aria-pressed="settings.isSoundMuted" @click="toggleMute">
            <HudIcon :name="settings.isSoundMuted ? 'muted' : 'volume'" />
            {{ settings.isSoundMuted ? "Unmute all sound" : "Mute all sound" }}
        </button>
        <label v-for="channel in AUDIO_CHANNELS" :key="channel.key" class="wander-field audio-channel">
            <span
                >{{ channel.label }}<small v-if="'hint' in channel">{{ channel.hint }}</small></span
            >
            <input
                v-model.number="settings[channel.key]"
                :aria-label="`${channel.label} volume`"
                class="wander-range"
                type="range"
                min="0"
                max="1"
                step="0.01"
            />
            <output>{{ Math.round(settings[channel.key] * 100) }}%</output>
        </label>
        <h3 class="wander-section-title">Terrain</h3>
        <label class="wander-field">
            <span
                >Use fallback terrain<small
                    >Use HGT instead of detailed terrain when available. Reloads the current
                    map.</small
                ></span
            >
            <input
                v-model="settings.forceFallbackTerrain"
                class="wander-checkbox"
                type="checkbox"
                @change="changeTerrain"
            />
        </label>
        <h3 class="wander-section-title">Graphics</h3>
        <label class="wander-field">
            <span>Shadows<small>Disable to improve performance</small></span>
            <input
                v-model="settings.shadowsEnabled"
                class="wander-checkbox"
                type="checkbox"
                @change="simulator.applyGraphics()"
            />
        </label>
        <label class="wander-field">
            <span>Render resolution</span>
            <select class="wander-select" v-model.number="settings.renderScale" @change="simulator.applyGraphics()">
                <option :value="0.75">Low</option>
                <option :value="1">Standard</option>
                <option :value="2">High</option>
            </select>
        </label>
        </section>
        <section v-else aria-label="HUD settings">
            <h3 class="wander-section-title">Visible elements</h3>
            <label v-for="element in HUD_ELEMENTS" :key="element.key" class="wander-field">
                <span>{{ element.label }}<small>{{ element.hint }}</small></span>
                <input v-model="settings[element.key]" class="wander-checkbox" type="checkbox" />
            </label>
        </section>
    </dialog>
</template>

<style scoped>
.settings-pages { display: flex; gap: 10px; }
.settings-pages button { flex: 1; }
.settings-button { position: absolute; top: max(20px, env(safe-area-inset-top)); left: 20px; z-index: 23; }
.mute-toggle { width: 100%; justify-content: flex-start; }
.audio-channel { display: grid; grid-template-columns: minmax(90px, 1fr) minmax(60px, 140px) 42px; gap: 12px; }
.audio-channel .wander-range { width: 100%; }
.audio-channel output { color: var(--wander-accent, #d9bd87); font-size: 14px; text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 400px) { .audio-channel { grid-template-columns: 1fr 40px; } .audio-channel > span { grid-column: 1 / -1; } }
</style>
