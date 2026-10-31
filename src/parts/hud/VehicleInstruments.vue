<script setup lang="ts">
import { computed } from "vue";
import { useStateStore } from "@/stores/state";

const state = useStateStore();
const speed = computed(() => Math.round(state.speed) || 0);
const speedRatio = computed(() =>
    Math.min(1, Math.abs(state.speed) / state.vehicle.maxSpeed),
);
const rpmRatio = computed(() =>
    Math.min(1, state.vehicle.rpm / state.vehicle.maxRPM),
);
const ticks = computed(() =>
    Array.from({ length: 21 }, (_, i) => {
        const angle = ((150 + i * 12) * Math.PI) / 180;
        return {
            i,
            x: 110 + Math.cos(angle) * 89,
            y: 110 + Math.sin(angle) * 89,
            x2: 110 + Math.cos(angle) * (i % 4 === 0 ? 78 : 83),
            y2: 110 + Math.sin(angle) * (i % 4 === 0 ? 78 : 83),
            tx: 110 + Math.cos(angle) * 66,
            ty: 114 + Math.sin(angle) * 66,
            label: Math.round((i / 20) * state.vehicle.maxSpeed),
        };
    }),
);
</script>
<template>
    <section class="instrument-cluster" aria-label="Vehicle instruments">
        <div class="cluster-topline">
            <span>{{ state.vehicle.name }}</span
            ><span class="engine-status" :class="state.vehicle.engine">{{
                state.vehicle.engine === "starting"
                    ? "IGNITION"
                    : state.vehicle.engine === "off"
                      ? "ENGINE OFF"
                      : "ENGINE RUNNING"
            }}</span>
        </div>
        <div class="cluster-instruments">
            <div class="speed-dial">
                <svg viewBox="0 0 220 188" aria-hidden="true">
                    <path
                        d="M32.06 155 A90 90 0 1 1 187.94 155"
                        class="dial-track"
                    />
                    <path
                        d="M32.06 155 A90 90 0 1 1 187.94 155"
                        class="dial-progress"
                        pathLength="100"
                        :stroke-dasharray="`${speedRatio * 100} 100`"
                    />
                    <g v-for="tick in ticks" :key="tick.i">
                        <line
                            :x1="tick.x"
                            :y1="tick.y"
                            :x2="tick.x2"
                            :y2="tick.y2"
                            class="dial-tick"
                        />
                        <text
                            v-if="tick.i % 4 === 0"
                            :x="tick.tx"
                            :y="tick.ty"
                            class="dial-label"
                        >
                            {{ tick.label }}
                        </text>
                    </g>
                </svg>
                <div class="speed-readout" :class="{ reversing: speed < 0 }">
                    <strong>{{ speed }}</strong
                    ><span>KM/H</span>
                </div>
            </div>
            <div class="drive-information">
                <div class="rpm-label">
                    <span>ENGINE <small>RPM × 1000</small></span
                    ><b>{{ (state.vehicle.rpm / 1000).toFixed(1) }}</b>
                </div>
                <div class="rpm-bars">
                    <i
                        v-for="n in 24"
                        :key="n"
                        :class="{
                            lit: n / 24 <= rpmRatio,
                            redline: n > 20,
                        }"
                    ></i>
                </div>
                <div class="rpm-scale">
                    <span>0</span
                    ><span>{{ Math.round(state.vehicle.maxRPM / 2000) }}</span
                    ><span>{{ Math.round(state.vehicle.maxRPM / 1000) }}</span>
                </div>
                <div class="drive-state">
                    <span
                        class="gear"
                        :class="{ reverse: state.vehicle.gear === 'R' }"
                        >{{ state.vehicle.gear }}</span
                    >
                    <div>
                        <span
                            class="parking-indicator"
                            :class="{ active: state.vehicle.handbrake }"
                            >&#9413;
                            <small>{{
                                state.vehicle.handbrake
                                    ? "BRAKE SET"
                                    : "BRAKE RELEASED"
                            }}</small></span
                        ><span class="drive-caption">{{
                            state.vehicle.engine === "off"
                                ? "PARKED"
                                : state.vehicle.engine === "starting"
                                  ? "STARTING…"
                                  : speed < 0
                                    ? "REVERSE"
                                    : "DRIVE"
                        }}</span>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>
<style scoped>
.instrument-cluster {
    position: absolute;
    bottom: 22px;
    left: 20px;
    transform: none;
    width: min(600px, calc(100vw - 32px));
    z-index: 10;
    padding: 12px 24px 2px;
    color: #e6f1ed;
    border: 1px solid #60756d70;
    border-top: 2px solid #94b6a288;
    border-radius: 30px 30px 18px 18px;
    background: radial-gradient(ellipse at 50% 0, #253932c9, #09110fef 65%);
    box-shadow:
        0 16px 55px #0009,
        inset 0 1px 0 #d1f6de12;
    backdrop-filter: blur(14px);
    font-family: system-ui, sans-serif;
}
.cluster-topline {
    display: flex;
    justify-content: space-between;
    padding: 0 8px;
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 2px;
    color: #90a69b;
}
.engine-status.running {
    color: #a6d3b4;
}
.engine-status.off {
    color: #e89b83;
}
.engine-status.starting {
    color: #e9c58b;
}
.cluster-instruments {
    display: grid;
    grid-template-columns: 220px 1fr;
    align-items: center;
    gap: 12px;
}
.speed-dial {
    position: relative;
    width: 220px;
    height: 188px;
}
.speed-dial svg {
    width: 100%;
    height: 100%;
}
.dial-track,
.dial-progress {
    fill: none;
    stroke-width: 3;
}
.dial-track {
    stroke: #52695e55;
}
.dial-progress {
    stroke: #c1ead1;
    filter: drop-shadow(0 0 4px #9bd3b566);
    stroke-linecap: round;
}
.dial-tick {
    stroke: #9db7a7;
    stroke-width: 1;
}
.dial-label {
    fill: #8fa79a;
    text-anchor: middle;
    font-size: 8px;
    font-family: ui-monospace, monospace;
}
.speed-readout {
    position: absolute;
    inset: 66px 0 auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
}
.speed-readout strong {
    font-family: ui-monospace, monospace;
    font-size: 48px;
    line-height: 1.1;
    font-weight: 500;
    letter-spacing: -3px;
    font-variant-numeric: tabular-nums;
}
.speed-readout span {
    font-size: 9px;
    letter-spacing: 3px;
    color: #8ba295;
    margin: 5px 0 0 3px;
}
.speed-readout.reversing strong,
.gear.reverse {
    color: #f1c287;
}
.drive-information {
    padding: 10px 12px 16px 0;
}
.rpm-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9px;
    letter-spacing: 1px;
    color: #b5c9bd;
}
.rpm-label small {
    font-size: 7px;
    color: #718b7c;
    margin-left: 6px;
}
.rpm-label b {
    font-family: ui-monospace, monospace;
    color: #dcece3;
    font-size: 13px;
}
.rpm-bars {
    display: flex;
    gap: 3px;
    margin-top: 6px;
    height: 10px;
}
.rpm-bars i {
    flex: 1;
    background: #415d493d;
    border-radius: 1px;
}
.rpm-bars i.lit {
    background: #b4d7b9;
    box-shadow: 0 0 8px #b4d7b933;
}
.rpm-bars i.redline {
    background: #784a413d;
}
.rpm-bars i.redline.lit {
    background: #e1937e;
}
.rpm-scale {
    display: flex;
    justify-content: space-between;
    color: #718b7c;
    font:
        8px ui-monospace,
        monospace;
    margin-top: 3px;
}
.drive-state {
    display: flex;
    align-items: center;
    gap: 18px;
    margin: 10px 0 13px;
}
.gear {
    font:
        500 38px ui-monospace,
        monospace;
    min-width: 60px;
    letter-spacing: -2px;
}
.parking-indicator {
    color: #486052;
    font-size: 19px;
    display: flex;
    align-items: center;
    gap: 6px;
}
.parking-indicator.active {
    color: #ee9f8b;
}
.parking-indicator small {
    font-size: 7px;
    letter-spacing: 1px;
}
.drive-caption {
    font-size: 8px;
    letter-spacing: 2px;
    color: #97afa0;
    display: block;
    margin-top: 3px;
}
@media (max-width: 1050px) {
    .instrument-cluster {
        left: 20px;
        transform: none;
        width: 560px;
    }
}
@media (max-width: 800px) {
    .instrument-cluster {
        width: min(540px, calc(100vw - 32px));
        left: 16px;
        bottom: 16px;
        padding: 10px 14px 0;
    }
    .cluster-instruments {
        grid-template-columns: 190px 1fr;
        gap: 4px;
    }
    .speed-dial {
        width: 190px;
        height: 170px;
    }
    .speed-readout {
        inset: 60px 0 auto;
    }
    .speed-readout strong {
        font-size: 42px;
    }
    .drive-information {
        padding-right: 0;
    }
    .cluster-topline {
        font-size: 8px;
        letter-spacing: 1px;
    }
}
@media (max-width: 420px) {
    .cluster-instruments {
        grid-template-columns: 155px 1fr;
    }
    .speed-dial {
        width: 155px;
        height: 155px;
    }
    .speed-readout {
        inset: 49px 0 auto;
    }
    .speed-readout strong {
        font-size: 36px;
    }
    .drive-information {
        padding-bottom: 12px;
    }
    .drive-state {
        gap: 4px;
        margin: 7px 0;
    }
    .gear {
        font-size: 30px;
        min-width: 44px;
    }
    .rpm-label small {
        display: none;
    }
    .parking-indicator small {
        font-size: 6px;
        letter-spacing: 0;
    }
}
.cluster-topline {
    font-size: 12px;
    letter-spacing: 1px;
}
.rpm-label {
    font-size: 12px;
}
.rpm-label small,
.rpm-scale,
.drive-caption {
    font-size: 11px;
}
.parking-indicator small {
    font-size: 10px;
    letter-spacing: 0;
}
.rpm-label b {
    font-size: 16px;
}
@media (max-width: 420px) {
    .cluster-topline {
        font-size: 10px;
    }
.rpm-label {
        font-size: 10px;
    }
    .parking-indicator small {
        font-size: 9px;
    }
}
@media (pointer: coarse) {
    .instrument-cluster { left: 12px; bottom: 155px; transform: scale(0.58); transform-origin: bottom left; width: min(600px, calc(100vw - 24px)); }
}
</style>
