<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import HudIcon from "./HudIcon.vue";
import { SoundManager } from "@/utils/SoundManager";
import { useSettingsStore } from "@/stores/settings";

const AUDIO_CHANNELS = [
    { key: "engineVolume", label: "Engine" },
    { key: "musicVolume", label: "Music" },
    { key: "effectsVolume", label: "Effects", hint: "Collisions, horn and ignition" },
] as const;
const settings = useSettingsStore();
const dialog = ref<HTMLDialogElement | null>(null);

const emit = defineEmits<{
    (e: "pauseChanged", paused: boolean): void;
    (e: "graphicsChanged"): void;
}>();

const open = () => {
    emit("pauseChanged", true);
    dialog.value?.showModal();
};

const close = () => dialog.value?.close();
const closed = () => emit("pauseChanged", false);
const toggleMute = () => {
    settings.isSoundMuted = !settings.isSoundMuted;
    SoundManager.getInstance().setEnabled(!settings.isSoundMuted);
};
onUnmounted(() => {
    if (dialog.value?.open) emit("pauseChanged", false);
});
</script>

<template>
    <button class="settings-button" aria-label="Open settings" title="Settings" @click="open">
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 3 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-3Z" />
            <circle cx="12" cy="11" r="3" />
        </svg>
    </button>
    <dialog
        ref="dialog"
        class="graphics-dialog"
        @close="closed"
        @click="$event.target === dialog && close()"
        @keydown.stop
    >
        <div class="dialog-head">
            <h2>Settings</h2>
            <button autofocus aria-label="Close settings" @click="close">✕</button>
        </div>
        <h3>Audio</h3>
        <button class="mute-toggle" :aria-pressed="settings.isSoundMuted" @click="toggleMute">
            <HudIcon :name="settings.isSoundMuted ? 'muted' : 'volume'" />
            {{ settings.isSoundMuted ? "Unmute all sound" : "Mute all sound" }}
        </button>
        <label v-for="channel in AUDIO_CHANNELS" :key="channel.key" class="audio-channel">
            <span
                >{{ channel.label }}<small v-if="'hint' in channel">{{ channel.hint }}</small></span
            >
            <input
                v-model.number="settings[channel.key]"
                :aria-label="`${channel.label} volume`"
                type="range"
                min="0"
                max="1"
                step="0.01"
            />
            <output>{{ Math.round(settings[channel.key] * 100) }}%</output>
        </label>
        <h3>Graphics</h3>
        <label>
            <span>Shadows<small>Disable to improve performance</small></span>
            <input
                v-model="settings.shadowsEnabled"
                type="checkbox"
                @change="emit('graphicsChanged')"
            />
        </label>
        <label>
            <span>Render resolution</span>
            <select v-model.number="settings.renderScale" @change="emit('graphicsChanged')">
                <option :value="0.75">Low</option>
                <option :value="1">Standard</option>
                <option :value="2">High</option>
            </select>
        </label>
    </dialog>
</template>

<style scoped>
.settings-button {
    position: absolute;
    top: max(20px, env(safe-area-inset-top));
    left: 20px;
    z-index: 23;
    background: #101d20ed;
    border: 1px solid #9eb1af70;
    border-radius: 12px;
    width: 46px;
    height: 46px;
    color: white;
    display: grid;
    place-items: center;
}
.settings-button svg {
    width: 25px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
}
.graphics-dialog {
    margin: auto;
    width: min(420px, calc(100vw - 32px));
    padding: 24px;
    border: 1px solid #819c8d;
    background: #101d20;
    color: #ecf4ef;
    border-radius: 18px;
    font: 18px system-ui;
}
.graphics-dialog::backdrop {
    background: #0009;
    backdrop-filter: blur(4px);
}
.dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 24px;
    margin-bottom: 20px;
}
.graphics-dialog h3 {
    color: #9cc6b6;
    margin-bottom: 12px;
}
.graphics-dialog label {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 14px 0;
}
.graphics-dialog small {
    display: block;
    font-size: 14px;
    color: #aebeb8;
}
.graphics-dialog input {
    width: 24px;
    height: 24px;
}
.graphics-dialog select {
    background: #243b33;
    padding: 8px;
    border-radius: 8px;
}
</style>

<style scoped>
.mute-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #294538;
    border-radius: 8px;
    margin-bottom: 10px;
}
.mute-toggle :deep(svg) {
    width: 22px;
    height: 22px;
}
.audio-channel input[type="range"] {
    width: 120px;
    height: 24px;
    accent-color: #a5d3b7;
    flex: 1;
    min-width: 45px;
}
.audio-channel > span {
    min-width: 90px;
}
.audio-channel output {
    width: 44px;
    text-align: right;
    font-size: 15px;
}
.graphics-dialog {
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
}
</style>
