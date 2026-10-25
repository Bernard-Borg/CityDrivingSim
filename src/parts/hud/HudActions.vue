<script setup lang="ts">
import {ref} from 'vue';
import {useStateStore} from '@/stores/state';
import {useSettingsStore} from '@/stores/settings';
import {useCitiesStore} from '@/stores/cities';
import {SoundManager} from '@/utils/SoundManager';
import HudIcon from './HudIcon.vue';
const state=useStateStore(),settings=useSettingsStore(),cityStore=useCitiesStore();
const emit=defineEmits<{(e:'help'):void;(e:'performance'):void;(e:'toggleIgnition'):void;(e:'resetLocation'):void;(e:'toggleStreetNames'):void;(e:'citySelected',city:string):void}>();
const helpButton=ref<HTMLButtonElement|null>(null);
const openHelp=()=>emit('help');
const togglePerformance=()=>emit('performance');
const toggleMute=()=>{settings.isSoundMuted=!SoundManager.getInstance().toggleMute();};
const switchCity=(city:string)=>{state.showCitySwitcher=false;if(city!==state.currentCity)emit('citySelected',city);};
defineExpose({focusHelp:()=>helpButton.value?.focus()});
</script>
<template>
<div class="hud-tools">
            <div class="utility-row">
                <button
                    ref="helpButton"
                    class="hud-button icon-button"
                    aria-label="Open controls help"
                    title="Controls (?)"
                    @click="openHelp"
                >
                    <svg viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" />
                        <path
                            d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01"
                        />
                    </svg>
                </button>
                <button
                    class="hud-button icon-button"
                    :class="{ selected: state.showPerformance }"
                    aria-label="Toggle performance graphs"
                    :aria-pressed="state.showPerformance"
                    title="Performance (F3)"
                    @click="togglePerformance"
                >
                    <svg viewBox="0 0 24 24">
                        <path d="M4 4v16h17M6 15l4-5 4 3 6-8" />
                    </svg>
                </button>
                <button
                    class="hud-button ignition-button"
                    :class="{ selected: state.vehicle.engine !== 'off' }"
                    :aria-label="
                        state.vehicle.engine === 'off'
                            ? 'Start engine'
                            : 'Switch off engine and park'
                    "
                    @click="emit('toggleIgnition')"
                >
                    <svg viewBox="0 0 24 24">
                        <path d="M12 2v10M6.3 5.3a9 9 0 1 0 11.4 0" /></svg
                    ><span>{{
                        state.vehicle.engine === "off"
                            ? "START"
                            : state.vehicle.engine === "starting"
                              ? "CANCEL"
                              : "STOP"
                    }}</span>
                </button>
            </div>
            <div class="settings-tools">
                <button class="hud-button" @click="emit('resetLocation')">
                    Reset location
                </button>
                <button
                    class="hud-button"
                    :class="{ selected: settings.showStreetNames }"
                    :aria-pressed="settings.showStreetNames"
                    @click="emit('toggleStreetNames')"
                >
                    Street names
                </button>
                <button
                    class="hud-button"
                    :class="{ selected: !settings.isSoundMuted }"
                    :aria-pressed="settings.isSoundMuted"
                    @click="toggleMute"
                >
<HudIcon :name="settings.isSoundMuted ? 'muted' : 'volume'" /><span>{{ settings.isSoundMuted ? "Unmute" : "Mute" }}</span>
</button>
                <div class="city-switcher">
                    <button
                        class="hud-button"
                        :aria-expanded="state.showCitySwitcher"
                        @click="
                            state.showCitySwitcher = !state.showCitySwitcher
                        "
                    >
                        <HudIcon name="city" /><span>Switch city</span>
                    </button>
                    <div v-if="state.showCitySwitcher" class="city-menu">
                        <button
                            v-for="city in cityStore.availableCities"
                            :key="city"
                            :class="{ selected: city === state.currentCity }"
                            @click="switchCity(city)"
                        >
                            {{ cityStore.getCityName(city) }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
</template>
<style scoped>
.hud-tools {
    position: absolute;
    right: 20px;
    bottom: 24px;
    z-index: 15;
    width: 174px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.utility-row {
    display: flex;
    gap: 6px;
}
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
.icon-button {
    padding: 8px;
    width: 36px;
}
.hud-button svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
}
.ignition-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
}
.settings-tools {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
}
.settings-tools .hud-button {
    width: 100%;
    padding: 8px 5px;
    font-size: 9px;
}
.city-switcher {
    position: relative;
}
.city-menu {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 7px;
    min-width: 160px;
    background: #101c17f5;
    border: 1px solid #6f897966;
    border-radius: 8px;
    overflow: hidden;
}
.city-menu button {
    display: block;
    width: 100%;
    padding: 12px 16px;
    text-align: left;
    font-size: 12px;
    color: #b7c9bd;
    cursor: pointer;
}
.city-menu button:hover,
.city-menu button.selected {
    background: #344d3b;
}
@media (max-width: 1050px) {
    .hud-tools {
        width: 164px;
    }
}
@media (max-width: 800px) {
    .hud-tools {
        right: 16px;
        bottom: 230px;
        width: 164px;
    }
}
@media (max-width: 420px) {
    .hud-tools {
        bottom: 210px;
    }
}
.hud-tools {
    width:220px
}
.hud-button,.settings-tools .hud-button {
    font-size:13px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:7px
}
.settings-tools .hud-button {
    padding:10px 7px
}
.icon-button {
    width:42px
}
.city-menu button {
    font-size:14px
}
.city-menu {
    min-width:185px
}
@media(max-width:800px) {
    .hud-tools {
        width:210px
    }
}
</style>
