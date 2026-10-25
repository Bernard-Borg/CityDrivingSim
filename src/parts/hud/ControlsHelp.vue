<script setup lang="ts">
import {ref,nextTick,onUnmounted} from 'vue';
const emit=defineEmits<{(e:'pauseChanged',paused:boolean):void;(e:'closed'):void}>();
const helpDialog=ref<HTMLDialogElement|null>(null);
const open=async()=>{emit('pauseChanged',true);await nextTick();helpDialog.value?.showModal();};
const closeHelp=()=>{helpDialog.value?.close();emit('pauseChanged',false);emit('closed');};
const isOpen=()=>helpDialog.value?.open??false;
defineExpose({open,isOpen});
onUnmounted(()=>{if(isOpen())emit('pauseChanged',false);});
const controls = [
    ["W / Up", "Accelerate"],
    ["S / Down", "Brake, then reverse"],
    ["A / D / Arrows", "Steer"],
    ["Space", "Service brake"],
    ["E (hold)", "Handbrake"],
    ["Shift", "Boost"],
    ["I", "Ignition / park"],
    ["V", "First / third person"],
    ["Mouse drag", "Look around (first person: ±80°)"],
    ["Scroll", "Third-person zoom"],
    ["F3", "Performance graphs"],
    ["?", "Open help"],
];

</script>
<template>
<dialog
        ref="helpDialog"
        class="help-dialog"
        aria-labelledby="help-title"
        @cancel.prevent="closeHelp"
        @click="
            (e) => {
                if (e.target === helpDialog) closeHelp();
            }
        "
    >
        <div class="panel-title">
            <span id="help-title">DRIVER'S HANDBOOK</span
            ><button aria-label="Close controls help" @click="closeHelp">
                ×
            </button>
        </div>
        <h2>Make yourself at home.</h2>
        <p class="help-intro">
            The simulation is paused while this guide is open.
        </p>
        <dl class="controls-list">
            <div v-for="[key, action] in controls" :key="key">
                <dt>
                    <kbd>{{ key }}</kbd>
                </dt>
                <dd>{{ action }}</dd>
            </div>
        </dl>
        <p class="help-note">
            Switching off the engine applies the parking brake and holds the car
            on hills. Starting releases it after ignition. First-person looking
            stays horizontal.
        </p>
        <button class="hud-button resume-button" @click="closeHelp">
            Back to driving <small>ESC</small>
        </button>
    </dialog>
</template>
<style scoped>
.hud-button {
    border: 1px solid #63776a66;
    border-radius: 7px;
    background: #0c1613d9;
    color: #b7c9bd;
    padding: 9px 11px;
    font:
        10px system-ui,
        sans-serif;
    letter-spacing: 0.5px;
    cursor: pointer;
    backdrop-filter: blur(10px);
    transition:
        background 0.15s,
        border-color 0.15s;
}
.hud-button:hover {
    background: #263a2fe8;
    border-color: #a9c2ad;
}
.hud-button:focus-visible {
    outline: 2px solid #d6bd8d;
    outline-offset: 3px;
}
.hud-button.selected {
    color: #e5eddc;
    border-color: greenyellow;
}
.hud-button svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
}
.settings-tools .hud-button {
    width: 100%;
    padding: 8px 5px;
    font-size: 9px;
}
.panel-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    letter-spacing: 2px;
    font-size: 10px;
    color: #9ab7a4;
}
.panel-title small {
    font-size: 7px;
    color: #678775;
    margin-left: 6px;
    letter-spacing: 1px;
}
.panel-title button {
    font-size: 20px;
    cursor: pointer;
    padding: 0 3px;
    color: #9ab7a4;
}
.help-dialog {
    overflow: auto;
    color: #d4e2d8;
    background: #111e18f7;
    border: 1px solid #779b8188;
    border-radius: 20px;
    padding: 26px;
    width: min(560px, calc(100vw - 32px));
    max-height: 85vh;
    box-shadow: 0 25px 90px #0009;
}
.help-dialog::backdrop {
    background: #030806b3;
    backdrop-filter: blur(8px);
}
.help-dialog h2 {
    font-size: 26px;
    font-weight: 400;
    letter-spacing: -0.5px;
    margin-top: 18px;
}
.help-intro {
    font-size: 12px;
    color: #92aa9a;
    margin-top: 6px;
}
.controls-list {
    margin-top: 18px;
}
.controls-list div {
    display: grid;
    grid-template-columns: 155px 1fr;
    align-items: center;
    padding: 7px 0;
    border-bottom: 1px solid #6f8c7722;
}
.controls-list kbd {
    font:
        10px ui-monospace,
        monospace;
    color: #e0c69b;
    border: 1px solid #8c795644;
    border-radius: 4px;
    padding: 3px 6px;
    background: #9d7d4211;
}
.controls-list dd {
    font-size: 12px;
    color: #b9cdbf;
}
.help-note {
    font-size: 11px;
    line-height: 1.8;
    color: #91aa98;
    margin-top: 18px;
}
.resume-button {
    width: 100%;
    margin-top: 20px;
    padding: 12px;
}
.resume-button small {
    margin-left: 14px;
    opacity: 0.5;
    font-size: 8px;
}
@media (max-width: 420px) {
    .controls-list div {
        grid-template-columns: 125px 1fr;
    }
}
.panel-title {
    font-size:14px
}
.controls-list kbd,.controls-list dd,.help-intro,.help-note {
    font-size:14px
}
.hud-button {
    font-size:14px
}
.resume-button small {
    font-size:11px
}
.controls-list div {
    padding:9px 0
}
.help-dialog {
    width:min(620px,calc(100vw - 32px))
}
</style>
