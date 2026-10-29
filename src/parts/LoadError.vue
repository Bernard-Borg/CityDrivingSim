<script setup lang="ts">
import { useStateStore } from "@/stores/state";
import { useSimulatorStore } from "@/stores/simulator";

const state = useStateStore();
const simulator = useSimulatorStore();

const retry = () => {
    if (state.currentCity) void simulator.selectCity(state.currentCity);
};
</script>

<template>
    <section class="wander-screen" role="alert" aria-labelledby="load-error-title">
        <div class="wander-card error-card">
            <p class="wander-eyebrow">Wander / A bump in the road</p>
            <div class="error-mark" aria-hidden="true">!</div>
            <h2 id="load-error-title" class="wander-title">Couldn't start<br />this drive.</h2>
            <p class="wander-description">{{ state.loadError }}</p>
            <div class="wander-actions">
                <button class="wander-button primary" @click="retry">Try again</button>
                <button class="wander-button" @click="simulator.chooseMap()">Choose Map</button>
            </div>
            <button class="wander-back error-back" @click="simulator.returnToMenu()">
                <span aria-hidden="true"><</span> Main menu
            </button>
        </div>
    </section>
</template>

<style scoped>
.error-card {
    max-width: 620px;
}
.error-mark {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid #d9bd8755;
    border-radius: 50%;
    color: #d9bd87;
    font-size: 24px;
    margin: 24px 0;
}
.error-back {
    margin: 26px 0 0;
}
</style>
