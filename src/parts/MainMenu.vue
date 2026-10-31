<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { MenuScene } from "@/core/MenuScene";
import { VEHICLES, DEFAULT_VEHICLE } from "@/core/vehicle/VehicleConfig";
import { useCitiesStore } from "@/stores/cities";
import { useVehiclesStore } from "@/stores/vehicles";
import { useSettingsStore } from "@/stores/settings";
import { useSimulatorStore } from "@/stores/simulator";
import VehicleShowroom from "./VehicleShowroom.vue";
import Settings from "./hud/Settings.vue";

const TIPS = [
    "Take the scenic route.",
    "No destination required.",
    "Yes, you can honk. Press H.",
    "Press C. Become the camera.",
    "Objects in the mirror may be moai.",
    "The world is your wrong turn.",
];

const background = ref<HTMLElement | null>(null);
const showroom = ref<InstanceType<typeof VehicleShowroom> | null>(null);
const settingsDialog = ref<InstanceType<typeof Settings> | null>(null);
const tip = ref(0);
const moaiHovered = ref(false);
const cities = useCitiesStore();
const vehicles = useVehiclesStore();
const settings = useSettingsStore();
const simulator = useSimulatorStore();
let preview: MenuScene | null = null;
let moaiSound: HTMLAudioElement | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

const hasSavedCity = computed(() => Boolean(cities.selectedCity));
const canContinue = computed(() => cities.availableCities.includes(cities.selectedCity));
const savedCityName = computed(() => cities.getCityName(cities.selectedCity));

const isMoaiHit = (event: MouseEvent) => {
    if ((event.target as Element).closest(".menu-content, dialog, button, a")) return false;
    return preview?.hitsMoai(event.clientX, event.clientY) ?? false;
};
const hoverMoai = (event: PointerEvent) => {
    moaiHovered.value = isMoaiHit(event);
};
const playMoai = (event: MouseEvent) => {
    if (!isMoaiHit(event) || !moaiSound || settings.isSoundMuted) return;
    moaiSound.volume = Math.max(
        0,
        Math.min(1, Number.isFinite(settings.effectsVolume) ? settings.effectsVolume : 1),
    );
    moaiSound.currentTime = 0;
    void moaiSound.play().catch((error) => console.warn("Moai sound could not play", error));
};

watch(
    () => [settings.isSoundMuted, settings.effectsVolume] as const,
    ([muted, volume]) => {
        if (!moaiSound) return;
        moaiSound.muted = muted;
        moaiSound.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
    },
);
watch(
    () => [settings.shadowsEnabled, settings.renderScale] as const,
    ([shadows, scale]) => preview?.setGraphics(shadows, scale),
);
watch(() => vehicles.selectedId, () => {
    preview?.dispose();
    if (background.value) {
        try {
            preview = new MenuScene(background.value, VEHICLES[vehicles.selectedId] ?? DEFAULT_VEHICLE);
            preview.setGraphics(settings.shadowsEnabled, settings.renderScale);
        } catch (error) { console.warn("Menu preview unavailable", error); }
    }
});
onMounted(() => {
    moaiSound = new Audio(`${import.meta.env.BASE_URL}sounds/Moai.mp3`);
    moaiSound.preload = "none";
    moaiSound.muted = settings.isSoundMuted;
    if (background.value) {
        try {
            preview = new MenuScene(
                background.value,
                VEHICLES[vehicles.selectedId] ?? DEFAULT_VEHICLE,
            );
            preview.setGraphics(settings.shadowsEnabled, settings.renderScale);
        } catch (error) {
            console.warn("Menu background unavailable", error);
        }
    }
    timer = setInterval(() => {
        tip.value = (tip.value + 1) % TIPS.length;
    }, 5500);
});
onUnmounted(() => {
    clearInterval(timer);
    preview?.dispose();
    moaiSound?.pause();
    if (moaiSound) moaiSound.src = "";
    moaiSound = null;
});
</script>

<template>
    <main
        class="main-menu"
        :class="{ 'moai-hovered': moaiHovered }"
        aria-label="Main menu"
        @click="playMoai"
        @pointermove="hoverMoai"
        @pointerleave="moaiHovered = false"
    >
        <div ref="background" class="menu-background" aria-hidden="true"></div>
        <div class="menu-shade" aria-hidden="true"></div>
        <section class="menu-content">
            <h1>WANDER<span class="title-dot">.</span></h1>
            <div class="tip-slot">
                <Transition name="tip" mode="out-in">
                    <p :key="tip" class="menu-tip">{{ TIPS[tip] }}</p>
                </Transition>
            </div>
            <nav class="menu-buttons" aria-label="Game">
                <button class="menu-button primary" @click="simulator.chooseMap()">
                    <span>Play</span><span aria-hidden="true">↗</span>
                </button>
                <button
                    v-if="hasSavedCity"
                    class="menu-button"
                    :disabled="!canContinue"
                    @click="simulator.continueGame()"
                >
                    <span
                        >Continue<small>{{ savedCityName }}</small></span
                    >
                    <span aria-hidden="true">→</span>
                </button>
                <button class="menu-button" @click="showroom?.open()"><span>Choose car</span><span aria-hidden="true">?</span></button>
                <div class="menu-spacer" aria-hidden="true"></div>
                <button class="menu-button settings-entry" @click="settingsDialog?.open()">
                    <span>Settings</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M4 17h16M8 4v6M16 14v6" />
                    </svg>
                </button>
            </nav>
        </section>
        <VehicleShowroom ref="showroom" />
        <Settings ref="settingsDialog" hide-trigger />
    </main>
</template>

<style scoped>
.main-menu {
    position: absolute;
    inset: 0;
    z-index: 30;
    isolation: isolate;
    overflow: hidden;
    background: #263c40;
    color: #f4f3e9;
    font-family: system-ui, sans-serif;
}
.moai-hovered {
    cursor: pointer;
}
.menu-background,
.menu-shade {
    position: absolute;
    inset: 0;
    z-index: -1;
}
.menu-background :deep(canvas) {
    display: block;
    width: 100%;
    height: 100%;
}
.menu-shade {
    background:
        linear-gradient(90deg, #101e23fa 0%, #14262be8 25%, #182d3375 49%, transparent 75%),
        linear-gradient(0deg, #10262d80, transparent 35%);
}
.menu-content {
    width: min(440px, 42vw);
    margin-left: clamp(28px, 7vw, 140px);
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 38px 0 62px;
}
.eyebrow {
    color: #bfccc4;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.24em;
    margin-bottom: 10px;
}
h1 {
    font-size: clamp(50px, 6.8vw, 104px);
    font-weight: 850;
    line-height: 1.05;
    letter-spacing: -0.075em;
    margin-left: -5px;
    text-shadow: 0 4px 32px #0002;
}
.title-dot {
    color: #d9b87a;
}
.tip-slot {
    min-height: 54px;
    margin: 13px 0 28px;
}
.menu-tip {
    color: #e8c889;
    font-size: clamp(15px, 1.4vw, 19px);
    transform-origin: left center;
    animation: tip-pulse 2.6s ease-in-out infinite;
}
.menu-buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 350px;
}
.menu-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 64px;
    width: 100%;
    padding: 13px 22px;
    border: 1px solid #dce9df35;
    border-radius: 7px;
    background: #eff7f00b;
    color: #f4f3e9;
    font-size: 22px;
    font-weight: 550;
    text-align: left;
    cursor: pointer;
    backdrop-filter: blur(12px);
    transition:
        background 0.18s,
        transform 0.18s,
        border-color 0.18s;
}
.menu-button.primary {
    background: #d9bd87;
    border-color: #ead1a2;
    color: #24312e;
}
.menu-button:hover {
    transform: translateX(5px);
    background: #ecf5ed20;
    border-color: #e0eee4a0;
}
.menu-button.primary:hover {
    background: #edd2a0;
}
.menu-button:focus-visible {
    outline: 3px solid #f0d49c;
    outline-offset: 4px;
}
.menu-button:disabled {
    opacity: 0.45;
    cursor: wait;
    transform: none;
}
.menu-button small {
    display: block;
    color: #bdcec4;
    font-size: 13px;
    font-weight: 400;
    margin-top: 2px;
}
.menu-button > span:last-child:not(:first-child) {
    color: inherit;
    opacity: 0.65;
    font-size: 25px;
}
.menu-button svg {
    width: 23px;
    height: 23px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    opacity: 0.6;
}
.menu-spacer {
    height: 18px;
}
.settings-entry {
    background: transparent;
}
.menu-tagline {
    color: #bbc9c0;
    font-size: 13px;
    letter-spacing: 0.06em;
    margin-top: 26px;
}
.scene-caption {
    position: absolute;
    right: 5vw;
    bottom: 48px;
    color: #f1f3e5;
    font-size: 11px;
    letter-spacing: 0.24em;
    display: flex;
    align-items: center;
    gap: 14px;
}
.caption-line {
    width: 48px;
    height: 1px;
    background: #e0bf83;
}
.tip-enter-active,
.tip-leave-active {
    transition:
        opacity 0.3s,
        translate 0.3s;
}
.tip-enter-from {
    opacity: 0;
    translate: 0 7px;
}
.tip-leave-to {
    opacity: 0;
    translate: 0 -7px;
}
@keyframes tip-pulse {
    50% {
        transform: scale(1.035) rotate(-1deg);
    }
}
@media (max-width: 700px) {
    .menu-content {
        width: min(350px, 82vw);
        margin-left: 8vw;
    }
    .menu-shade {
        background: linear-gradient(90deg, #101e23ed, #14262bb3 65%, #182d3320);
    }
    h1 {
        font-size: 68px;
    }
    .scene-caption {
        display: none;
    }
}
@media (max-height: 680px) {
    .menu-content {
        padding-top: 20px;
        padding-bottom: 32px;
    }
    h1 {
        font-size: 58px;
    }
    .tip-slot {
        min-height: 28px;
        margin-bottom: 15px;
    }
    .menu-button {
        min-height: 50px;
        font-size: 20px;
        padding: 10px 18px;
    }
    .menu-spacer {
        height: 6px;
    }
    .menu-tagline {
        margin-top: 14px;
    }
}
@media (max-height: 480px) {
    .menu-content {
        justify-content: flex-start;
        overflow-y: auto;
        width: min(350px, 70vw);
        padding: 16px 0 45px;
    }
    h1 {
        font-size: 42px;
    }
    .eyebrow {
        font-size: 10px;
    }
    .tip-slot {
        margin: 6px 0 10px;
    }
    .menu-tagline {
        display: none;
    }
}
@media (prefers-reduced-motion: reduce) {
    .menu-tip {
        animation: none;
    }
    .menu-button,
    .tip-enter-active,
    .tip-leave-active {
        transition: none;
    }
}
</style>
