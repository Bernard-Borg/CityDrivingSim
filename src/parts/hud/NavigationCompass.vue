<script setup lang="ts">
import { computed } from "vue";
import { useStateStore } from "@/stores/state";
import { compassHeading } from "./navigation";

const state = useStateStore();

const headingValue = computed(() => compassHeading(state.displayedHeading));
const compass = computed(() =>
    Array.from({ length: 24 }, (_, i) => {
        const degree = i * 15;
        const delta = ((degree - headingValue.value + 540) % 360) - 180;

        const labels: Record<number, string> = {
            0: "N",
            45: "NE",
            90: "E",
            135: "SE",
            180: "S",
            225: "SW",
            270: "W",
            315: "NW",
        };

        return {
            degree,
            delta,
            label: labels[degree] ?? "",
            major: degree % 45 === 0,
        };
    }).filter((mark) => Math.abs(mark.delta) < 100),
);

const heading = computed(() => String(Math.round(headingValue.value) % 360).padStart(3, "0"));
</script>
<template>
    <div class="navigation-strip" aria-label="Compass and coordinates">
        <div class="compass-heading">{{ heading }}<span>°</span></div>
        <div class="compass-track">
            <div
                v-for="mark in compass"
                :key="mark.degree"
                class="compass-mark"
                :class="{ major: mark.major, north: mark.degree === 0 }"
                :style="{ left: `calc(50% + ${mark.delta * 2.15}px)` }"
            >
                <span v-if="mark.label">{{ mark.label }}</span
                ><i></i>
            </div>
        </div>
        <div class="compass-pointer"></div>
        <div class="coordinates">
            {{ state.coordinates.lat.toFixed(5) }}° N <span> / </span
            >{{ state.coordinates.lon.toFixed(5) }}° E
        </div>
    </div>
</template>

<style scoped>
.navigation-strip {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    width: min(480px, 62vw);
    z-index: 10;
    color: #e4eee9;
    text-align: center;
    pointer-events: none;
    text-shadow: 0 1px 5px #000;
    font-family: system-ui, sans-serif;
}
.compass-heading {
    font-size: 10px;
    letter-spacing: 3px;
    color: #b9cbc5;
}
.compass-heading span {
    letter-spacing: 0;
}
.compass-track {
    position: relative;
    height: 40px;
    margin-top: 3px;
    overflow: hidden;
    mask-image: linear-gradient(to right, transparent, #000 16%, #000 84%, transparent);
    border-bottom: 1px solid #c4d7cd66;
    background: linear-gradient(transparent, #07101255);
}
.compass-mark {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    height: 31px;
    display: flex;
    align-items: center;
    flex-direction: column;
    justify-content: flex-end;
    gap: 6px;
    font-size: 12px;
    letter-spacing: 1px;
}
.compass-mark i {
    display: block;
    height: 6px;
    width: 1px;
    background: #b4c5be99;
}
.compass-mark.major i {
    height: 10px;
    background: #e6f6ee;
}
.compass-mark.north {
    color: #edb572;
}
.compass-pointer {
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 6px solid #e8f4ed;
    margin: -2px auto 6px;
}
.coordinates {
    font-family: ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 1px;
    color: #c4d4cb;
}
.coordinates span {
    padding: 0 8px;
    color: #8a9d92;
}
@media (max-width: 800px) {
    .navigation-strip {
        width: 65vw;
        left: 40%;
        top: 14px;
    }
    .coordinates {
        font-size: 8px;
        letter-spacing: 0;
    }
}
@media (max-width: 420px) {
    .coordinates span {
        padding: 0 3px;
    }
}
.navigation-strip {
    background: rgba(7, 17, 13, 0.9);
    border: 1px solid #6b8977;
    border-radius: 12px;
    padding: 10px 16px;
    box-shadow: 0 4px 20px #0005;
}
.compass-heading {
    font-size: 16px;
    color: #edf5ef;
}
.coordinates {
    font-size: 14px;
    color: #edf5ef;
    letter-spacing: 0.3px;
}
.compass-mark {
    font-size: 16px;
}
.compass-track {
    height: 43px;
}
@media (max-width: 800px) {
    .coordinates {
        font-size: 11px;
    }
    .compass-heading {
        font-size: 14px;
    }
    .navigation-strip {
        padding: 8px 10px;
    }
}
</style>
