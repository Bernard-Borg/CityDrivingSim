<script setup lang="ts">
import { ref } from "vue";
import { VEHICLES } from "@/core/vehicle/VehicleConfig";
import { useVehiclesStore } from "@/stores/vehicles";
import VehiclePreview from "./VehiclePreview.vue";

const options = Object.values(VEHICLES);
const dialog = ref<HTMLDialogElement | null>(null);
const visible = ref(false);
const vehicles = useVehiclesStore();

/** Opens the showroom and mounts previews only while it is visible. */
function open(): void { visible.value = true; dialog.value?.showModal(); }
/** Persists the next gameplay vehicle without loading a city. */
function select(id: string): void { vehicles.selectedId = id; }
defineExpose({ open });
</script>

<template>
    <dialog ref="dialog" class="wander-dialog showroom" @close="visible = false" @keydown.stop>
        <header class="wander-dialog-head">
            <h2 class="wander-title">Choose your car</h2>
            <button class="wander-button compact" @click="dialog?.close()">Done</button>
        </header>
        <div v-if="visible" class="cars">
            <button v-for="vehicle in options" :key="vehicle.id" class="wander-panel car-card"
                :class="{ selected: vehicles.selectedId === vehicle.id }" :aria-pressed="vehicles.selectedId === vehicle.id"
                @click="select(vehicle.id)">
                <VehiclePreview :vehicle="vehicle" />
                <strong>{{ vehicle.name }}</strong>
                <span>{{ vehicle.physics.maxSpeed }} km/h · {{ vehicles.selectedId === vehicle.id ? 'Selected' : 'Select car' }}</span>
            </button>
        </div>
    </dialog>
</template>

<style scoped>
.showroom { width: min(1150px, calc(100vw - 32px)); max-width: none; }
.cars { display: grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap: 16px; overflow-x: auto; padding: 8px 4px 20px; }
.car-card { cursor: pointer; padding: 0 12px 24px; text-align: center; color: inherit; }
.car-card.selected { border-color: var(--wander-accent, #d9bd87); }
.car-card:focus-visible { outline: 3px solid var(--wander-accent, #d9bd87); }
strong { display: block; font-size: 21px; margin-bottom: 8px; }
span { color: #bdcec4; font-size: 15px; }
</style>
