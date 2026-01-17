<template>
  <div class="relative w-screen h-screen overflow-hidden">
    <!-- Three.js Canvas Container -->
    <div ref="canvasContainer" class="absolute inset-0"></div>

    <!-- City Selection Menu -->
    <div v-if="showCityMenu" class="absolute inset-0 z-50 flex items-center justify-center bg-black/90">
      <div class="bg-gray-900/95 backdrop-blur-md p-8 rounded-2xl border border-white/20 max-w-2xl w-full mx-4">
        <h2 class="text-3xl font-bold text-white mb-6 text-center">Select a City</h2>
        <div v-if="availableCities.length === 0" class="text-center text-gray-400">
          Loading cities...
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            v-for="city in availableCities"
            :key="city"
            @click="selectCity(city)"
            class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg"
          >
            {{ getCityName(city) }}
          </button>
        </div>
      </div>
    </div>

    <!-- City Switcher Button (when in game) -->
    <div v-if="!showCityMenu && !isLoading" class="absolute bottom-8 right-8 z-10">
      <button
        @click="showCitySwitcher = !showCitySwitcher"
        class="bg-black/60 hover:bg-black/80 backdrop-blur-md px-4 py-2 rounded-lg border border-white/20 text-white text-sm transition-colors"
      >
        Switch City
      </button>
      
      <!-- City Switcher Dropdown -->
      <div v-if="showCitySwitcher" class="absolute bottom-full right-0 mb-2 bg-gray-900/95 backdrop-blur-md rounded-lg border border-white/20 overflow-hidden min-w-[150px]">
        <button
          v-for="city in availableCities"
          :key="city"
          @click="switchCity(city)"
          :class="[
            'block w-full text-left px-4 py-2 hover:bg-blue-600 text-white text-sm transition-colors',
            city === currentCity ? 'bg-blue-700' : ''
          ]"
        >
          {{ getCityName(city) }}
        </button>
      </div>
    </div>

    <!-- UI Overlay -->
    <div class="absolute top-5 left-5 z-10">
      <div class="bg-black/60 backdrop-blur-md p-4 rounded-lg border border-white/20">
        <h3 class="text-xl font-bold text-white mb-2">🏙️ City Driving Simulator</h3>
        <div class="space-y-1 text-sm text-gray-300">
          <p><strong class="text-white">WASD</strong> or <strong class="text-white">Arrow Keys</strong> to drive</p>
          <p><strong class="text-white">Space</strong> for brake</p>
          <p><strong class="text-white">Mouse</strong> to look around</p>
        </div>
      </div>
    </div>

    <!-- FPS Counter -->
    <div class="absolute top-5 right-5 z-10">
      <div class="bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/20">
        <div class="text-sm text-gray-300">
          <span class="text-white font-bold">{{ fps }}</span> FPS
        </div>
      </div>
    </div>

    <!-- Compass -->
    <div class="absolute top-5 right-24 z-10">
      <div class="bg-black/60 backdrop-blur-md p-4 rounded-lg border border-white/20">
        <div class="relative w-28 h-28">
          <!-- Compass background circle -->
          <div class="absolute inset-0 rounded-full border-2 border-white/30 bg-black/40"></div>
          
          <!-- Compass rose -->
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="relative w-full h-full">
              <!-- North -->
              <div class="absolute top-0.5 left-1/2 -translate-x-1/2 text-red-500 font-bold text-xs">N</div>
              <!-- South -->
              <div class="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-white/70 font-bold text-xs">S</div>
              <!-- East (right side) -->
              <div class="absolute right-0.5 top-1/2 -translate-y-1/2 text-white/70 font-bold text-xs">E</div>
              <!-- West (left side) -->
              <div class="absolute left-0.5 top-1/2 -translate-y-1/2 text-white/70 font-bold text-xs">W</div>
              
              <!-- Direction indicator (rotating needle) -->
              <div 
                class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-out"
                :style="{ transform: `translate(-50%, -50%) rotate(${displayedHeading}deg)` }"
              >
                <!-- Arrow pointing up (North) -->
                <div class="relative">
                  <!-- Arrow shaft -->
                  <div class="absolute left-1/2 -translate-x-1/2 -translate-y-full w-0.5 h-6 bg-red-500"></div>
                  <!-- Arrow head (triangle) -->
                  <div class="absolute left-1/2 -translate-x-1/2 -translate-y-full -mt-6">
                    <svg width="12" height="12" viewBox="0 0 12 12" class="text-red-500">
                      <path d="M6 0 L0 12 L12 12 Z" fill="currentColor" />
                    </svg>
                  </div>
                </div>
              </div>
              
              <!-- Center dot -->
              <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/50"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Speedometer -->
    <div class="absolute bottom-8 left-8 z-10">
      <div class="bg-black/70 backdrop-blur-md p-6 rounded-2xl border-2 border-white/20">
        <div class="text-xs uppercase tracking-wider text-gray-400 mb-1">Speed</div>
        <div class="flex items-baseline gap-2">
          <span class="text-5xl font-bold text-green-500">{{ Math.round(speed) }}</span>
          <span class="text-2xl text-gray-500">km/h</span>
        </div>
      </div>
    </div>

    <!-- Loading Screen -->
    <div v-if="isLoading" class="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
      <div class="text-white text-2xl">Loading City Map...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { DrivingSimulator } from './core/DrivingSimulator'
import { CityManager } from './utils/cityManager'
import type { Ref } from 'vue'

const canvasContainer: Ref<HTMLElement | null> = ref(null)
const speed = ref(0)
const fps = ref(0)
const heading = ref(0)
const displayedHeading = ref(0)
const isLoading = ref(true)
const showCityMenu = ref(false)
const showCitySwitcher = ref(false)
const availableCities = ref<string[]>([])
const currentCity = ref<string | null>(null)

let simulator: DrivingSimulator | null = null

const getCityName = (city: string): string => {
  const config = CityManager.getCityConfig(city)
  return config?.name || city
}

const selectCity = async (city: string) => {
  currentCity.value = city
  CityManager.setSelectedCity(city)
  showCityMenu.value = false
  isLoading.value = true
  
  if (simulator) {
    simulator.dispose()
  }
  
  const savedPos = CityManager.getSavedPosition(city)
  simulator = new DrivingSimulator(canvasContainer.value!)
  
  // Subscribe to all callbacks
  simulator.onSpeedUpdate((newSpeed: number) => {
    speed.value = newSpeed
  })
  
  simulator.onFpsUpdate((newFps: number) => {
    fps.value = newFps
  })
  
  simulator.onHeadingUpdate((newHeading: number) => {
    heading.value = newHeading
    
    // Normalize angle to 0-360 range
    const normalizeAngle = (angle: number) => {
      while (angle < 0) angle += 360
      while (angle >= 360) angle -= 360
      return angle
    }
    
    let current = normalizeAngle(displayedHeading.value)
    let target = normalizeAngle(newHeading)
    
    // Handle wrap-around (e.g., going from 359° to 1° should go the short way)
    let diff = target - current
    if (diff > 180) diff -= 360
    if (diff < -180) diff += 360
    
    // Update displayed heading (smooth interpolation)
    displayedHeading.value = normalizeAngle(current + diff)
  })
  
  simulator.onLoadComplete(() => {
    isLoading.value = false
  })
  
  await simulator.init(city, savedPos ? { x: savedPos.x, y: savedPos.y, z: savedPos.z } : undefined)
}

const switchCity = async (city: string) => {
  if (city === currentCity.value) {
    showCitySwitcher.value = false
    return
  }
  
  showCitySwitcher.value = false
  isLoading.value = true
  
  const savedPos = CityManager.getSavedPosition(city)
  currentCity.value = city
  CityManager.setSelectedCity(city)
  
  if (simulator) {
    await simulator.reloadCity(city)
  }
  
  isLoading.value = false
}

onMounted(async () => {
  if (!canvasContainer.value) return

  // Detect available cities
  availableCities.value = await CityManager.detectAvailableCities()
  
  // Check if user has a saved city preference
  const savedCity = CityManager.getSelectedCity()
  
  if (savedCity && availableCities.value.includes(savedCity)) {
    // Load saved city
    await selectCity(savedCity)
  } else {
    // Show city selection menu
    showCityMenu.value = true
    isLoading.value = false
  }
})

onUnmounted(() => {
  if (simulator) {
    simulator.dispose()
  }
})
</script>