<script setup lang="ts">
import { computed, ref, nextTick, onUnmounted } from "vue";

import { useSimulatorStore } from "@/stores/simulator";
import { useStateStore } from "@/stores/state";

const DRIVING_CONTROLS = [
    ["W / Up", "Accelerate"],
    ["S / Down", "Brake, then reverse"],
    ["A / D / Arrows", "Steer"],
    ["Space (hold)", "Handbrake"],
    ["Q / E", "Nose down / up (airborne)"],
    ["I", "Ignition / park"],
    ["H (hold)", "Horn"],
    ["R", "Radio on / off"],
    ["Delete", "Reset position when stuck"],
    ["V", "First / third person"],
    ["C", "Creative mode / fly"],
    ["Mouse drag", "Look around (first person: ±80°)"],
    ["Scroll", "Third-person zoom"],
    ["?", "Open help"],
];

const FLIGHT_CONTROLS = [
    ["WASD / Arrows", "Fly forward, backward and sideways"],
    ["Space / E", "Fly up"],
    ["Q", "Fly down"],
    ["Shift (hold)", "Fly faster"],
    ["Mouse drag", "Look around freely"],
    ["Scroll", "Adjust flight speed"],
    ["C", "Return to parked car"],
    ["?", "Open help"],
];

const simulator = useSimulatorStore();
const state = useStateStore();
const helpDialog = ref<HTMLDialogElement | null>(null);

const controls = computed(() => (state.creativeMode ? FLIGHT_CONTROLS : DRIVING_CONTROLS));

const emit = defineEmits<{
    (e: "closed"): void;
}>();

const open = async () => {
    simulator.setPauseReason("help", true);
    await nextTick();
    helpDialog.value?.showModal();
};

const closeHelp = () => {
    helpDialog.value?.close();
    simulator.setPauseReason("help", false);
    emit("closed");
};

const isOpen = () => helpDialog.value?.open ?? false;

defineExpose({ open, isOpen });

onUnmounted(() => {
    simulator.setPauseReason("help", false);
});
</script>
<template>
    <dialog
        ref="helpDialog"
        class="wander-secondary wander-dialog help-dialog"
        aria-labelledby="help-title"
        @cancel.prevent="closeHelp"
        @click="
            (e) => {
                if (e.target === helpDialog) closeHelp();
            }
        "
    >
        <div class="panel-title">
            <h2 id="help-title">DRIVER'S HANDBOOK</h2>
            <button
                class="wander-button compact icon"
                aria-label="Close controls help"
                @click="closeHelp"
            >
                ×
            </button>
        </div>
        <dl class="controls-list">
            <div v-for="[key, action] in controls" :key="key">
                <dt>
                    <kbd>{{ key }}</kbd>
                </dt>
                <dd>{{ action }}</dd>
            </div>
        </dl>
        <p class="help-note">
            Switching off the engine applies the parking brake and holds the car on hills. Starting
            releases it after ignition.
        </p>
        <button class="wander-button primary resume-button" @click="closeHelp">
            Back to driving <small>ESC</small>
        </button>
    </dialog>
</template>
<style scoped>
.help-dialog {
    width: min(600px, calc(100vw - 32px));
}
.panel-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    letter-spacing: 0.14em;
    font-size: 12px;
    color: var(--wander-accent, #d9bd87);
}
.help-dialog h2 {
    font-size: 30px;
    font-weight: 650;
    letter-spacing: -0.04em;
    margin-top: 20px;
}
.help-intro,
.help-note {
    font-size: 15px;
    line-height: 1.6;
    color: #bdcec4;
    margin-top: 10px;
}
.controls-list {
    margin-top: 22px;
}
.controls-list div {
    display: grid;
    grid-template-columns: 170px 1fr;
    align-items: center;
    gap: 14px;
    padding: 10px 0;
    border-bottom: 1px solid #dce9df18;
}
.controls-list kbd {
    font:
        13px ui-monospace,
        monospace;
    color: var(--wander-accent-text, #e8cfa5);
    border: 1px solid var(--wander-accent-subtle, #d9bd8745);
    border-radius: 5px;
    padding: 5px 8px;
    background: var(--wander-accent-soft, #d9bd8710);
}
.controls-list dd {
    font-size: 15px;
    color: #bdcec4;
}
.resume-button {
    width: 100%;
    margin-top: 24px;
}
.resume-button small {
    font-size: 12px;
    opacity: 0.7;
}
@media (max-width: 420px) {
    .controls-list div {
        grid-template-columns: 125px 1fr;
        gap: 10px;
    }
    .controls-list dd {
        font-size: 14px;
    }
}
</style>
