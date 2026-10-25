<script setup lang="ts">
import {computed} from 'vue';
import {useStateStore} from '@/stores/state';
const state=useStateStore();
defineEmits<{(e:'close'):void}>();
const latest=computed(()=>state.performanceHistory.at(-1));
const scale=computed(()=>Math.max(33.3,...state.performanceHistory.map(p=>p.frameMs)));
const callsScale=computed(()=>Math.max(1,...state.performanceHistory.map(p=>p.calls)));
const points=(field:'frameMs'|'cpuMs'|'calls',max:number)=>state.performanceHistory.map(p=>`${(1-((latest.value?.timeMs??p.timeMs)-p.timeMs)/12000)*300},${54-Math.min(1,p[field]/max)*50}`).join(' ');
const num=(n=0)=>n.toLocaleString();
</script>
<template>
    <aside class="performance-panel" aria-label="Performance diagnostics">
        <header><strong>{{ state.fps }} <small>FPS</small></strong><button aria-label="Close performance graphs" @click="$emit('close')">&#215;</button></header>
        <div class="graph-label"><span><i class="frame-key"></i> Frame <i class="cpu-key"></i> CPU</span><b>{{ latest?.frameMs.toFixed(1) ?? '-' }} ms</b></div>
        <svg viewBox="0 0 300 58" role="img" aria-label="Frame and CPU time history"><path d="M0 54H300M0 28H300" class="grid"/><polyline :points="points('frameMs',scale)" class="frame"/><polyline :points="points('cpuMs',scale)" class="cpu"/></svg>
        <div class="graph-label"><span>Draw calls</span><b>{{ num(latest?.calls) }}</b></div>
        <svg viewBox="0 0 300 58" role="img" aria-label="Draw call history"><path d="M0 54H300" class="grid"/><polyline :points="points('calls',callsScale)" class="calls"/></svg>
        <dl><div><dt>CPU</dt><dd>{{ latest?.cpuMs.toFixed(1) ?? '-' }} ms</dd></div><div><dt>Triangles</dt><dd>{{ num(latest?.triangles) }}</dd></div><div><dt>Visible / total meshes</dt><dd>{{ num(latest?.visibleMeshes) }} / {{ num(latest?.meshes) }}</dd></div><div><dt>Geometry / textures</dt><dd>{{ num(latest?.geometries) }} / {{ num(latest?.textures) }}</dd></div></dl>
    </aside>
</template>
<style scoped>
.performance-panel {
    position:absolute;
    right:20px;
    top:20px;
    z-index:25;
    width:min(340px,calc(100vw - 32px));
    max-height:calc(100vh - 40px);
    overflow:auto;
    padding:16px;
    background:#0a1411f2;
    border:1px solid #698476;
    border-radius:12px;
    backdrop-filter:blur(12px);
    color:#dcecdf;
    font:13px ui-monospace,monospace;
    box-shadow:0 10px 35px #0005
}
header {
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:12px
}
header strong {
    font-size:26px;
    font-weight:500
}
header small {
    font-size:13px;
    color:#a6c5ae
}
button {
    font-size:24px;
    cursor:pointer;
    padding:0 4px
}
.graph-label {
    display:flex;
    align-items:center;
    justify-content:space-between;
    font-size:12px;
    margin:8px 0
}
.graph-label b {
    font-weight:400
}
.graph-label i {
    display:inline-block;
    width:10px;
    height:3px;
    vertical-align:middle
}
.frame-key {
    background:#b6d7bf
}
.cpu-key {
    background:#d9b17c;
    margin-left:8px
}
svg {
    width:100%;
    height:58px
}
.grid {
    stroke:#68867533;
    fill:none
}
polyline {
    fill:none;
    stroke-width:1.5;
    stroke-linejoin:round
}
.frame {
    stroke:#b6d7bf
}
.cpu {
    stroke:#d9b17c
}
.calls {
    stroke:#93b6d2
}
dl {
    border-top:1px solid #69847644;
    margin-top:8px;
    padding-top:4px
}
dl div {
    display:flex;
    justify-content:space-between;
    gap:12px;
    margin-top:8px
}
dt {
    color:#adc7b5
}
dd {
    font-variant-numeric:tabular-nums
}
button:focus-visible {
    outline:2px solid #d6bd8d
}
</style>
