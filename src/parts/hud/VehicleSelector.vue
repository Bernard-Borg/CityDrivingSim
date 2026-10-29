<script setup lang="ts">
import { useSimulatorStore } from "@/stores/simulator";
import { VEHICLES, DEFAULT_VEHICLE } from "@/core/vehicle/VehicleConfig";
import { useVehiclesStore } from "@/stores/vehicles";

const options = Object.values(VEHICLES);
const simulator = useSimulatorStore();
const vehicles = useVehiclesStore();

const select = (event: Event) => {
    const input = event.target as HTMLSelectElement;
    simulator.switchVehicle(input.value);
    input.value = VEHICLES[vehicles.selectedId]?.id ?? DEFAULT_VEHICLE.id;
    input.blur();
};
</script>

<template>
    <div class="wander-secondary wander-panel vehicle-selector" @keydown.stop>
        <label for="vehicle-model">Car</label>
        <select class="wander-select"
            id="vehicle-model"
            :value="VEHICLES[vehicles.selectedId]?.id ?? DEFAULT_VEHICLE.id"
            :disabled="vehicles.switching"
            :aria-busy="vehicles.switching"
            @change="select"
        >
            <option v-for="vehicle in options" :key="vehicle.id" :value="vehicle.id">
                {{ vehicle.name }}
            </option>
        </select>
        <p v-if="vehicles.switching" role="status">Loading car…</p>
        <p v-if="vehicles.error" role="alert" class="wander-notice">{{ vehicles.error }}</p>
    </div>
</template>

<style scoped>
.vehicle-selector { margin: 2px 0; padding: 14px; }
label { display: block; margin-bottom: 8px; color: #bdcec4; font-size: 13px; }
select { width: 100%; }
p { margin-top: 8px; font-size: 13px; color: #bdcec4; }
</style>
