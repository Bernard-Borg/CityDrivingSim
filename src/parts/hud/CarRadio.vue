<script setup lang="ts">
import { onUnmounted } from "vue";
import { useRadioStore } from "@/stores/radio";

const radio = useRadioStore();

onUnmounted(() => radio.stop());
</script>

<template>
    <section class="car-radio" aria-label="Car radio" @keydown.stop>
        <div class="radio-display"><span>RADIO</span><strong>{{ radio.track.title }}</strong></div>
        <div class="radio-controls">
            <button aria-label="Previous radio track" title="Previous track" @click="radio.changeTrack(-1)">◀◀</button>
            <button :aria-label="radio.playing ? 'Pause radio' : 'Play radio'" :aria-pressed="radio.playing" @click="radio.toggle()">
                {{ radio.playing ? 'Pause' : 'Play' }}
            </button>
            <button aria-label="Next radio track" title="Next track" @click="radio.changeTrack(1)">▶▶</button>
        </div>
        <label>Volume <input v-model.number="radio.volume" aria-label="Radio volume" type="range" min="0" max="1" step="0.01" /></label>
        <p v-if="radio.error" role="status" class="wander-notice">{{ radio.error }}</p>
    </section>
</template>

<style scoped>
.car-radio { margin: 10px 0; padding: 12px; border: 1px solid #6f897966; border-radius: 10px; background: #101c17ed; color: #e5f0e9; font: 14px system-ui; }
.radio-display { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.radio-display span { color: #9abca7; font-size: 12px; letter-spacing: .12em; }
.radio-controls { display: flex; gap: 6px; }
button { flex: 1; min-width: 0; min-height: 40px; background: #2a4435; border-radius: 6px; cursor: pointer; }
button:hover { background: #3d5d49; }
label { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
input { min-width: 0; width: 100%; accent-color: #a5d3b7; }
p { color: #ffc2b5; margin-top: 8px; }
</style>
