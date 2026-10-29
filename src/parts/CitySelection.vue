<script setup lang="ts">
import { useSimulatorStore } from "@/stores/simulator";
import { useCitiesStore } from "@/stores/cities";

const store = useCitiesStore();
const simulator = useSimulatorStore();
</script>

<template>
    <section class="wander-screen map-screen" aria-labelledby="map-title">
        <div class="wander-card map-card">
            <button class="wander-back" @click="simulator.returnToMenu()">
                <span aria-hidden="true"><</span> Main menu
            </button>
            <p class="wander-eyebrow">Wander / Maps</p>
            <h2 id="map-title" class="wander-title">Where to next?</h2>
            <p class="wander-description">Pick a place. Find your own way around.</p>
            <p v-if="store.availableCities.length === 0" class="map-empty" role="status">
                Finding available maps?
            </p>
            <nav v-else class="map-grid" aria-label="Available maps">
                <button
                    v-for="(city, index) in store.availableCities"
                    :key="city"
                    class="wander-button map-option"
                    @click="simulator.selectCity(city)"
                >
                    <span class="map-number" aria-hidden="true">{{
                        String(index + 1).padStart(2, "0")
                    }}</span>
                    <span class="map-name">
                        {{ store.getCityName(city) }}
                        <small>{{ store.getCityConfig(city)?.country }}</small>
                    </span>
                </button>
            </nav>
        </div>
    </section>
</template>

<style scoped>
.map-card {
    width: min(820px, 100%);
}
.map-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}
.map-option {
    min-height: 96px;
    justify-content: flex-start;
    padding: 18px;
}
.map-number {
    font-size: 12px;
    color: #d9bd87;
    font-variant-numeric: tabular-nums;
    align-self: flex-start;
    margin-top: 4px;
}
.map-name {
    font-size: 22px;
    overflow-wrap: anywhere;
}
.map-name small {
    display: block;
    color: #bdcec4;
    font-size: 13px;
    font-weight: 400;
    margin-top: 6px;
}
.map-arrow {
    margin-left: auto;
    color: #d9bd87;
    font-size: 24px;
}
.map-empty {
    color: #bdcec4;
    font-size: 18px;
    padding: 24px 0;
}
@media (max-width: 560px) {
    .map-grid {
        grid-template-columns: 1fr;
    }
    .map-option {
        min-height: 82px;
    }
}
</style>
