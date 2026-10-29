<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useLoadingStore } from '@/stores/loading';
import { useStateStore } from '@/stores/state';
import { useCitiesStore } from '@/stores/cities';

const REFRESH_MS = 200;
const loading = useLoadingStore();
const state = useStateStore();
const cities = useCitiesStore();
const now = ref(performance.now());
let timer: ReturnType<typeof setInterval> | undefined;
const cityName = computed(() => state.currentCity ? cities.getCityName(state.currentCity) : 'City');
const elapsed = computed(() => loading.startedAt ? Math.max(0, (now.value - loading.startedAt) / 1000).toFixed(1) : '0.0');
const recentStages = computed(() => loading.history.slice(-5));

onMounted(() => { timer = setInterval(() => { now.value = performance.now(); }, REFRESH_MS); });
onUnmounted(() => { clearInterval(timer); });
</script>

<template>
    <section class="wander-screen loading-screen" role="status" aria-live="polite" aria-labelledby="loading-city">
        <div class="wander-card loading-card">
            <p class="wander-eyebrow">Wander / Preparing your drive</p>
            <h2 id="loading-city" class="wander-title">{{ cityName }}<span class="loading-dot">.</span></h2>
            <div class="loading-stage">
                <span class="stage-marker" aria-hidden="true"></span>
                <h3>{{ loading.label }}</h3>
            </div>
            <p v-if="loading.detail" class="loading-detail">{{ loading.detail }}</p>
            <div class="loading-track" aria-hidden="true"><span /></div>
            <div class="loading-meta" aria-hidden="true"><span>Getting everything ready</span><span>{{ elapsed }}s</span></div>
            <ol v-if="recentStages.length" class="loading-history" aria-label="Completed loading stages">
                <li v-for="(item, index) in recentStages" :key="index"><span>{{ item.stage }}</span><span>{{ item.seconds.toFixed(1) }}s</span></li>
            </ol>
        </div>
    </section>
</template>

<style scoped>
.loading-card { width: min(620px, 100%); }
.loading-dot { color: #d9bd87; }
.loading-stage { display: flex; align-items: center; gap: 12px; margin-top: 32px; }
.stage-marker { width: 7px; height: 7px; border-radius: 50%; background: #d9bd87; box-shadow: 0 0 16px #d9bd8750; flex-shrink: 0; }
h3 { font-size: 22px; font-weight: 500; line-height: 1.4; margin: 0; }
.loading-detail { color: #bdcec4; font-size: 16px; line-height: 1.5; overflow-wrap: anywhere; margin: 10px 0 0 19px; }
.loading-track { overflow: hidden; height: 3px; border-radius: 4px; background: #dce9df1a; margin-top: 30px; }
.loading-track span { display: block; width: 35%; height: 100%; background: #d9bd87; animation: loading-slide 1.5s ease-in-out infinite alternate; }
.loading-meta { display: flex; justify-content: space-between; gap: 16px; color: #bdcec4; font-size: 14px; margin-top: 12px; font-variant-numeric: tabular-nums; }
.loading-history { padding: 18px 0 0; margin: 26px 0 0; border-top: 1px solid #dce9df26; list-style: none; }
.loading-history li { display: flex; justify-content: space-between; gap: 20px; margin: 11px 0; font-size: 14px; line-height: 1.4; color: #aabeb4; }
.loading-history li > span:last-child { flex-shrink: 0; color: #d9bd87b3; font-variant-numeric: tabular-nums; }
@keyframes loading-slide { from { transform: translateX(-100%); } to { transform: translateX(285%); } }
@media (prefers-reduced-motion: reduce) { .loading-track span { animation: none; width: 100%; opacity: .6; } }
</style>
