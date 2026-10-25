<script setup lang="ts">
import { useCitiesStore } from "@/stores/cities";

const store = useCitiesStore();

defineEmits<{
    (e: "citySelected", city: string): void;
}>();
</script>

<template>
    <!-- City Selection Menu -->
    <div
        class="absolute inset-0 z-50 flex items-center justify-center bg-black/90"
    >
        <div
            class="bg-gray-900/95 backdrop-blur-md p-8 rounded-2xl border border-white/20 max-w-2xl w-full mx-4"
        >
            <h2 class="text-3xl font-bold text-white mb-6 text-center">
                Select a City
            </h2>
            <div
                v-if="store.availableCities.length === 0"
                class="text-center text-gray-400"
            >
                Loading cities...
            </div>
            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                    v-for="city in store.availableCities"
                    :key="city"
                    @click="$emit('citySelected', city)"
                    class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg"
                >
                    {{ store.getCityName(city) }}
                </button>
            </div>
        </div>
    </div>
</template>
