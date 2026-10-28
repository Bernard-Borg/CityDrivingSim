/** Shared map-search state and result feedback. @packageDocumentation */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MapLocation } from '@/core/LocationSearch';
export const useNavigationStore = defineStore('navigation', () => {
    const query = ref(''), results = ref<MapLocation[]>([]), error = ref('');
    return { query, results, error };
});
