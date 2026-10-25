import { defineStore } from 'pinia';
import { nextTick, ref } from 'vue';

export const useLoadingStore = defineStore('loading', () => {
    const label = ref('Preparing city');
    const detail = ref('');
    const history = ref<Array<{ stage: string; seconds: number }>>([]);
    const startedAt = ref(0);
    const stageStartedAt = ref(0);
    const record = () => {
        if (stageStartedAt.value) history.value.push({ stage: label.value, seconds: (performance.now() - stageStartedAt.value) / 1000 });
    };
    const begin = () => {
        history.value = []; label.value = 'Preparing city'; detail.value = '';
        startedAt.value = stageStartedAt.value = performance.now();
    };
    const stage = async (message: string, extra = '') => {
        if (message !== label.value) { record(); label.value = message; stageStartedAt.value = performance.now(); }
        detail.value = extra;
        await nextTick();
        // Give the updated text a paint before synchronous geometry work blocks JS.
        // The timeout also permits loading to continue in a hidden browser tab.
        if (typeof requestAnimationFrame !== 'undefined') await new Promise<void>(resolve => {
            let frame = 0;
            const fallback = setTimeout(() => { cancelAnimationFrame(frame); resolve(); }, 100);
            frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => { clearTimeout(fallback); resolve(); }); });
        });
    };
    const finish = () => {
        record(); stageStartedAt.value = 0;
        console.table(history.value.map(item => ({ stage: item.stage, seconds: Number(item.seconds.toFixed(2)) })));
    };
    return { label, detail, history, startedAt, stageStartedAt, begin, stage, finish };
});
