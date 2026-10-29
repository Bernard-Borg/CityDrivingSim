<script setup lang="ts">
import { onUnmounted } from "vue";
import { useRadioStore } from "@/stores/radio";

const radio = useRadioStore();

onUnmounted(() => radio.stop());
</script>

<template>
    <section class="wander-secondary wander-panel car-radio" aria-label="Car radio" @keydown.stop>
        <div class="radio-display"><span>RADIO</span><strong>{{ radio.track.title }}</strong></div>
        <div class="radio-controls">
            <button class="wander-button compact" aria-label="Previous radio track" title="Previous track" @click="radio.changeTrack(-1)">◀◀</button>
            <button class="wander-button compact" :aria-label="radio.playing ? 'Pause radio (R)' : 'Play radio (R)'" title="Toggle radio (R)" :aria-pressed="radio.playing" @click="radio.toggle()">
                {{ radio.playing ? 'Pause' : 'Play' }}
            </button>
            <button class="wander-button compact" aria-label="Next radio track" title="Next track" @click="radio.changeTrack(1)">▶▶</button>
        </div>
        <label>Volume <input class="wander-range" v-model.number="radio.volume" aria-label="Radio volume" type="range" min="0" max="1" step="0.01" /></label>
        <p v-if="radio.error" role="status" class="wander-notice">{{ radio.error }}</p>
    </section>
</template>

<style scoped>
.car-radio { margin: 2px 0; padding: 14px; font-size: 14px; }
.radio-display { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
.radio-display span { color: var(--wander-accent, #d9bd87); font-size: 11px; letter-spacing: .15em; }
.radio-display strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.radio-controls { display: flex; gap: 6px; }
.radio-controls button { flex: 1; min-width: 0; padding: 8px; }
label { display: flex; gap: 12px; align-items: center; margin-top: 12px; color: #bdcec4; }
input { min-width: 0; width: 100%; }
p { margin-top: 8px; }
</style>
