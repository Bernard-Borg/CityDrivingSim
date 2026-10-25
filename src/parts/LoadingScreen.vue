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
    <div class="loading-screen" role="status" aria-live="polite">
        <section class="loading-card">
            <p class="loading-caption">Loading {{ cityName }}</p>
            <h2>{{ loading.label }}</h2>
            <p v-if="loading.detail" class="loading-detail">{{ loading.detail }}</p>
            <div class="loading-track" aria-hidden="true"><span /></div>
            <p class="loading-time">{{ elapsed }}s elapsed</p>
            <ol v-if="recentStages.length" class="loading-history">
                <li v-for="(item, index) in recentStages" :key="index">
                    <span>{{ item.stage }}</span><span>{{ item.seconds.toFixed(1) }}s</span>
                </li>
            </ol>
        </section>
    </div>
</template>

<style scoped>
.loading-screen { position: absolute; inset: 0; z-index: 50; display: grid; place-items: center; background: rgb(5 12 18 / 94%); color: #f4f7fa; }
.loading-card { width: min(540px, calc(100vw - 40px)); padding: 28px; border: 1px solid #526a7a; border-radius: 16px; background: #101d28; }
.loading-caption { color: #b4cad9; font-size: 18px; margin: 0 0 14px; }
h2 { font-size: 25px; line-height: 1.3; margin: 0; }
.loading-detail { color: #b4cad9; font-size: 17px; margin: 12px 0 0; }
.loading-track { overflow: hidden; height: 4px; border-radius: 4px; background: #293d4c; margin-top: 24px; }
.loading-track span { display: block; width: 35%; height: 100%; background: #8dccea; animation: loading-slide 1.5s ease-in-out infinite alternate; }
.loading-time { color: #b4cad9; font-size: 16px; font-variant-numeric: tabular-nums; }
.loading-history { padding: 16px 0 0; margin: 16px 0 0; border-top: 1px solid #344b5b; list-style: none; }
.loading-history li { display: flex; justify-content: space-between; gap: 20px; margin: 9px 0; font-size: 15px; color: #adc0cd; }
@keyframes loading-slide { from { transform: translateX(-100%); } to { transform: translateX(285%); } }
@media (prefers-reduced-motion: reduce) { .loading-track span { animation: none; width: 100%; opacity: .6; } }
</style>
