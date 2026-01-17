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
    <div v-if="!showCityMenu && !isLoading" class="absolute bottom-24 right-8 z-10">
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
          <p><strong class="text-white">E</strong> for handbrake (drift)</p>
          <p><strong class="text-white">Shift</strong> for boost</p>
          <p><strong class="text-white">Space</strong> for brake</p>
          <p><strong class="text-white">Mouse</strong> to look around</p>
          <p><strong class="text-white">Scroll Wheel</strong> to zoom camera</p>
        </div>
      </div>
    </div>

    <!-- Coordinates Display -->
    <div v-if="!showCityMenu && !isLoading" class="absolute top-5 left-80 z-10">
      <div class="bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/20">
        <div class="text-xs text-gray-400 mb-1">Coordinates</div>
        <div class="text-sm text-white font-mono">
          <div>Lat: {{ coordinates.lat.toFixed(6) }}</div>
          <div>Lon: {{ coordinates.lon.toFixed(6) }}</div>
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
              <!-- Compass arrow rotates opposite to car heading to show North relative to car -->
              <div 
                class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-out"
                :style="{ transform: `translate(-50%, -50%) rotate(${-displayedHeading}deg)` }"
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

    <!-- Boost Meter -->
    <div class="absolute bottom-8 left-64 z-10">
      <div class="bg-black/70 backdrop-blur-md p-4 rounded-2xl border-2 border-white/20">
        <div class="text-xs uppercase tracking-wider text-gray-400 mb-2">Boost</div>
        <div class="w-32 h-4 bg-gray-800 rounded-full overflow-hidden border border-gray-600">
          <div 
            class="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 transition-all duration-100"
            :style="{ width: `${boostAmount}%` }"
          ></div>
        </div>
        <div class="text-xs text-gray-400 mt-1 text-center">{{ Math.round(boostAmount) }}%</div>
      </div>
    </div>

    <!-- Control Buttons -->
    <div v-if="!showCityMenu && !isLoading" class="absolute bottom-8 right-8 z-10 flex gap-3">
      <button
        @click="resetLocation"
        class="bg-black/70 hover:bg-black/80 backdrop-blur-md px-4 py-2 rounded-lg border-2 border-white/20 text-gray-300 hover:text-white transition-colors text-sm font-medium"
      >
        <span class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
          </svg>
          Reset Location
        </span>
      </button>
      
      <button
        @click="toggleStreetNames"
        :class="[
          'bg-black/70 hover:bg-black/80 backdrop-blur-md px-4 py-2 rounded-lg border-2 transition-colors text-sm font-medium',
          showStreetNames 
            ? 'border-green-500/50 text-green-400' 
            : 'border-white/20 text-gray-300'
        ]"
      >
        <span class="flex items-center gap-2">
          <svg v-if="showStreetNames" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
          Street Names
        </span>
      </button>
      
      <button
        @click="toggleMute"
        :class="[
          'bg-black/70 hover:bg-black/80 backdrop-blur-md px-4 py-2 rounded-lg border-2 transition-colors text-sm font-medium',
          !isSoundMuted 
            ? 'border-blue-500/50 text-blue-400' 
            : 'border-red-500/50 text-red-400'
        ]"
      >
        <span class="flex items-center gap-2">
          <svg v-if="!isSoundMuted" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.793L4.447 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.447l3.936-3.793a1 1 0 011.617.793zm2.489 1.349a1 1 0 011.414 0 7.003 7.003 0 010 9.9 1 1 0 11-1.414-1.414 5.003 5.003 0 000-7.072 1 1 0 010-1.414zm2.828 2.828a1 1 0 011.415 0 3 3 0 010 4.243 1 1 0 11-1.415-1.415 1 1 0 000-1.414 1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.793L4.447 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.447l3.936-3.793a1 1 0 011.617.793zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clip-rule="evenodd" />
          </svg>
          {{ isSoundMuted ? 'Unmute' : 'Mute' }}
        </span>
      </button>
    </div>

    <!-- Loading Screen -->
    <div v-if="isLoading" class="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
      <div class="text-white text-2xl">Loading City Map...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { DrivingSimulator } from './core/DrivingSimulator';
import { CityManager } from './utils/cityManager';
import { SoundManager } from './utils/SoundManager';
import type { Ref } from 'vue';

const canvasContainer: Ref<HTMLElement | null> = ref(null)
const speed = ref(0)
const fps = ref(0)
const heading = ref(0)
const displayedHeading = ref(0)
const boostAmount = ref(100)
const isLoading = ref(true)
const showCityMenu = ref(false)
const showCitySwitcher = ref(false)
const availableCities = ref<string[]>([])
const currentCity = ref<string | null>(null)
const showStreetNames = ref(true)
const coordinates = ref({ lat: 0, lon: 0 })
const isSoundMuted = ref(false)

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
  
  simulator.onBoostUpdate((newBoost: number) => {
    boostAmount.value = newBoost
  })
  
  simulator.onCoordinateUpdate((lat: number, lon: number) => {
    coordinates.value = { lat, lon }
  })
  
  simulator.onLoadComplete(() => {
    isLoading.value = false
    // Initialize street names visibility state
    if (simulator) {
      showStreetNames.value = simulator.getLabelsVisible()
    }
  })
  
  await simulator.init(city, savedPos ? { lat: savedPos.lat, lon: savedPos.lon, y: savedPos.y } : undefined)
}

const toggleStreetNames = () => {
  if (simulator) {
    showStreetNames.value = !showStreetNames.value
    simulator.setLabelsVisible(showStreetNames.value)
  }
}

const resetLocation = () => {
  if (simulator) {
    simulator.resetCarPosition()
  }
}

const toggleMute = () => {
  const soundManager = SoundManager.getInstance()
  isSoundMuted.value = !soundManager.toggleMute()
  // Save mute state to localStorage
  localStorage.setItem('cityDrivingSim_soundMuted', isSoundMuted.value.toString())
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
    // Restore street names visibility state after city reload
    simulator.setLabelsVisible(showStreetNames.value)
  }
  
  isLoading.value = false
}

onMounted(async () => {
  if (!canvasContainer.value) return

  // Initialize mute state from localStorage or SoundManager
  const savedMuteState = localStorage.getItem('cityDrivingSim_soundMuted')
  if (savedMuteState !== null) {
    isSoundMuted.value = savedMuteState === 'true'
    const soundManager = SoundManager.getInstance()
    soundManager.setEnabled(!isSoundMuted.value)
  } else {
    // Initialize from SoundManager default state
    const soundManager = SoundManager.getInstance()
    isSoundMuted.value = !soundManager.getEnabled()
  }

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