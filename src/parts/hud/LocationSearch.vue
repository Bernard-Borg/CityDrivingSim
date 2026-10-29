<script setup lang="ts">
import { useSimulatorStore } from "@/stores/simulator";
import { ref, onUnmounted } from "vue";
import { useNavigationStore } from "@/stores/navigation";
import type { MapLocation } from "@/core/LocationSearch";

const simulator = useSimulatorStore();
const navigation = useNavigationStore();
const input = ref<HTMLInputElement | null>(null);
const focused = ref(false);
const active = ref(0);

const focus = () => {
    focused.value = true;
    simulator.setPauseReason("search", true);
};

const blur = () => {
    focused.value = false;
    simulator.setPauseReason("search", false);
};

const choose = (location: MapLocation) => {
    simulator.teleport(location);
    input.value?.blur();
};

const submit = () => {
    simulator.searchLocations(navigation.query);
    const location = navigation.results[active.value] ?? navigation.results[0];
    if (location) choose(location);
};

const search = () => {
    active.value = 0;
    simulator.searchLocations(navigation.query);
};

const move = (step: number) => {
    active.value = Math.max(0, Math.min(navigation.results.length - 1, active.value + step));
};

onUnmounted(() => {
    simulator.setPauseReason("search", false);
});
</script>
<template>
    <form class="location-search" role="search" @submit.prevent="submit" @keydown.stop>
        <label class="search-field">
            <span aria-hidden="true" class="relative">
                <!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.-->
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                    <path
                        d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376C296.3 401.1 253.9 416 208 416 93.1 416 0 322.9 0 208S93.1 0 208 0 416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"
                    />
                </svg>
            </span>
            <input
                ref="input"
                v-model="navigation.query"
                aria-label="Search street or latitude, longitude"
                placeholder="Street or latitude, longitude"
                autocomplete="off"
                @focus="focus"
                @blur="blur"
                @input="search"
                @keydown.down.prevent="move(1)"
                @keydown.up.prevent="move(-1)"
                @keydown.esc="input?.blur()"
            />
            <button type="submit" aria-label="Teleport to first result">Go</button>
        </label>
        <div v-if="focused && navigation.query" class="search-results">
            <button
                v-for="(location, index) in navigation.results"
                :key="index"
                :class="{ active: index === active }"
                type="button"
                @pointerdown.prevent
                @click="choose(location)"
            >
                {{ location.label }}
                <small>{{ location.lat.toFixed(5) }}, {{ location.lon.toFixed(5) }}</small>
            </button>
            <p v-if="!navigation.results.length">
                {{ navigation.error || "No matching streets in this map." }}
            </p>
        </div>
        <p v-if="navigation.error && !focused" role="status" class="search-results">
            {{ navigation.error }}
        </p>
    </form>
</template>
<style scoped>
.location-search {
    width: min(390px, calc(100vw - 32px));
    z-index: 22;
    color: #f1f5f4;
    font: 16px system-ui;
}

.search-field {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 12px;
    background: #0c1412;
    border: 1px solid #6b8977;
    border-radius: 12px;
}

.search-field input {
    min-width: 0;
    flex: 1;
    background: transparent;
    outline: none;
}

.search-field button {
    padding: 4px 9px;
    border-radius: 6px;
    background: #6b8977;
}

.search-results {
    margin-top: 5px;
    background: #101d20f5;
    border-radius: 10px;
    max-height: 240px;
    overflow: auto;
}
.search-results button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 12px;
    border-bottom: 1px solid #ffffff20;
}
.search-results button.active,
.search-results button:hover,
.search-results button:focus-visible {
    background: #0d1412;
}
small {
    display: block;
    color: #a8bcb7;
}
.search-results p,
p.search-results {
    padding: 12px;
}
@media (max-width: 600px) {
    .location-search {
        top: 104px;
        font-size: 14px;
        width: calc(100vw - 32px);
    }
}
</style>
