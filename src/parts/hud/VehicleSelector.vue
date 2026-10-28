<script setup lang="ts">
import { VEHICLES, DEFAULT_VEHICLE } from "@/core/vehicle/VehicleConfig";
import { useVehiclesStore } from "@/stores/vehicles";

const options = Object.values(VEHICLES);
const vehicles = useVehiclesStore();
const emit = defineEmits<{ (e: "select", id: string): void }>();

const select = (event: Event) => {
    const input = event.target as HTMLSelectElement;
    emit("select", input.value);
    input.value = VEHICLES[vehicles.selectedId]?.id ?? DEFAULT_VEHICLE.id;
    input.blur();
};
</script>

<template>
    <div class="vehicle-selector" @keydown.stop>
        <label for="vehicle-model">Car</label>
        <select id="vehicle-model" :value="VEHICLES[vehicles.selectedId]?.id ?? DEFAULT_VEHICLE.id"
            :disabled="vehicles.switching" :aria-busy="vehicles.switching" @change="select">
            <option v-for="vehicle in options" :key="vehicle.id" :value="vehicle.id">
                {{ vehicle.name }}
            </option>
        </select>
        <p v-if="vehicles.switching" role="status">Loading car…</p>
        <p v-if="vehicles.error" role="alert">{{ vehicles.error }}</p>
    </div>
</template>

<style scoped>
.vehicle-selector { margin: 10px 0; padding: 12px; border: 1px solid #6f897966; border-radius: 10px; background: #101c17ed; color: #e5f0e9; }
label { display: block; margin-bottom: 6px; font-size: 14px; }
select { width: 100%; min-height: 40px; padding: 6px; border-radius: 6px; background: #24382e; color: inherit; font: 14px system-ui; }
select:disabled { opacity: .6; }
p { margin-top: 8px; font-size: 13px; }
[role="alert"] { color: #ffc2b5; }
</style>
