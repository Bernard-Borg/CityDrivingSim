<script setup lang="ts">
defineProps<{ name: 'volume' | 'muted' | 'city' }>();
</script>
<template>
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">
        <template v-if="name === 'volume' || name === 'muted'">
            <path d="M11 5 6 9H3v6h3l5 4Z" />
            <path v-if="name === 'muted'" d="m16 9 6 6m0-6-6 6" />
            <path v-else d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
        </template>
        <path v-else d="M2 21h20M4 21V8h6v13m0-16h7v16m0-10h4v10M6 11h2m-2 4h2m4-7h3m-3 4h3m-3 4h3M13 5V2" />
    </svg>
</template>
