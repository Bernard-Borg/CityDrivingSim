<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import "./styles/screens.css";
import LoadError from "./parts/LoadError.vue";
import MainMenu from "./parts/MainMenu.vue";
import Overlay from "./parts/Overlay.vue";
import CitySelection from "./parts/CitySelection.vue";
import LoadingScreen from "./parts/LoadingScreen.vue";
import { useSimulatorStore } from "./stores/simulator";
import { useStateStore } from "./stores/state";

const attributionUrl = `${import.meta.env.BASE_URL}attribution.html`;

const canvasContainer = ref<HTMLElement | null>(null);
const simulator = useSimulatorStore();
const state = useStateStore();

onMounted(async () => {
    if (canvasContainer.value) await simulator.mount(canvasContainer.value);
});

onUnmounted(() => simulator.dispose());
</script>

<template>
    <div class="relative w-screen h-screen overflow-hidden">
        <!-- Three.js Canvas Container -->
        <div ref="canvasContainer" class="absolute inset-0"></div>

        <MainMenu v-if="state.showMainMenu && !state.isLoading" />

        <CitySelection v-if="state.showCityMenu" />

        <Overlay v-if="!state.showMainMenu" />

        <LoadError v-if="state.loadError" />

        <LoadingScreen v-if="state.isLoading" />
        <footer class="attribution-links">
            <a :href="attributionUrl" target="_blank" rel="noopener noreferrer"
                >Attribution &amp; licenses</a
            >
        </footer>
    </div>
</template>

<style scoped>
.attribution-links {
    position: absolute;
    bottom: max(2px, env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    padding: 3px 9px;
    border-radius: 5px;
    background: #101d20ed;
    color: #dce8e1;
    font: 12px/1.5 system-ui;
    white-space: nowrap;
}
.attribution-links a {
    text-decoration: underline;
    text-underline-offset: 2px;
}
@media (max-width: 420px) {
    .attribution-links {
        font-size: 10px;
    }
}
</style>
