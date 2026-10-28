# Wander 🚗

A virtual city driving simulator built with **Vue 3**, **TypeScript**, **Three.js**, and **Tailwind CSS**. Practice driving in virtual cities to get comfortable with new locations before your actual visit!

## Features

- **3D City Environment**: Drive through procedurally generated city streets
- **Realistic Vehicle Physics**: Smooth acceleration, braking, and steering
- **Multiple Road Types**: Primary, secondary, residential, and tertiary roads
- **Interactive Controls**: WASD or Arrow keys for driving, mouse for camera
- **Modern UI**: Beautiful Tailwind CSS styling with glassmorphism effects
- **TypeScript**: Fully typed codebase for better development experience
- **Extensible Architecture**: Easy to add real city data from OpenStreetMap

## Tech Stack

- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe JavaScript
- **Three.js** - 3D graphics library
- **Vite** - Next generation frontend build tool
- **Tailwind CSS** - Utility-first CSS framework

## Getting Started

### Prerequisites

- Node.js 24 or newer
- npm or yarn or pnpm

### Installation

1. Clone or download this repository
2. Install dependencies:

    ```bash
    npm install
    ```

3. Start the development server:

    ```bash
    npm run dev
    ```

4. Open your browser to the URL shown (typically `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` folder.

### Preview Production Build

```bash
npm run preview
```

See [Driving simulation](docs/DRIVING.md) for physics, collisions, audio, and validation details.

## Controls

- **W / ↑ Arrow**: Accelerate forward
- **S / ↓ Arrow**: Reverse
- **A / ← Arrow**: Steer left
- **D / → Arrow**: Steer right
- **Space**: Brake
- **Mouse Drag**: Rotate camera view around the car

## Project Structure

```
CityDrivingSim/
├── src/
│   ├── core/
│   │   ├── DrivingSimulator.ts    # Main simulator class
│   │   ├── scene/
│   │   │   ├── SceneManager.ts    # Scene, lighting, buildings
│   │   │   └── RoadGenerator.ts   # Road mesh generation
│   │   └── vehicle/
│   │       ├── Car.ts             # Car model & physics
│   │       └── CarControls.ts     # Input handling
│   ├── types/
│   │   └── index.ts               # TypeScript type definitions
│   ├── utils/
│   │   └── sampleCityData.ts      # Sample city road data
│   ├── App.vue                    # Main Vue component
│   ├── main.ts                    # Vue app entry point
│   └── style.css                  # Tailwind CSS imports
├── index.html                     # HTML entry point
├── vite.config.ts                 # Vite configuration
├── tsconfig.json                  # TypeScript configuration
└── tailwind.config.js             # Tailwind CSS configuration
```

## Adding Real City Data

To use real city data from OpenStreetMap:

1. **Get OSM Data**: Visit [OpenStreetMap](https://www.openstreetmap.org) or use [Overpass API](https://overpass-turbo.eu)

2. **Convert to JSON**: Process OSM data to extract roads with coordinates

3. **Update Data Format**: Convert lat/lon to local coordinates using the helper function in `sampleCityData.ts`

4. **Load in SceneManager**: Update `SceneManager.ts` to load your city data

Example Overpass Query:

```
[out:json];
(
  way["highway"~"^(primary|secondary|tertiary|residential|service)$"]({{bbox}});
);
out body;
>;
out skel qt;
```

## Customization

### Adding More Cities

1. Create a new TypeScript file in `src/utils/` with your city data
2. Export city data in the format shown in `sampleCityData.ts`
3. Load it in `SceneManager.loadCityMap()`

### Adjusting Vehicle Physics

Edit `src/core/vehicle/Car.ts`:

- `maxSpeed`: Maximum vehicle speed
- `maxAcceleration`: How quickly the car accelerates
- `friction`: How quickly the car slows down
- `maxSteeringAngle`: Maximum steering angle

### Customizing Graphics

- Edit materials in `RoadGenerator.ts` for different road appearances
- Modify `Car.ts` to change vehicle appearance
- Adjust lighting in `DrivingSimulator.ts`

### Styling with Tailwind

The UI components use Tailwind CSS utility classes. You can customize:

- Colors in `tailwind.config.js`
- UI components in `App.vue`

## Scripts

- `npm run typecheck` - Check Vue and TypeScript
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Future Enhancements

- [ ] Traffic simulation with AI vehicles
- [ ] Real OpenStreetMap integration
- [ ] Multiple cities selection
- [ ] GPS navigation system
- [ ] Weather effects (rain, fog, day/night cycle)
- [ ] Sound effects and music
- [ ] Multiplayer support
- [ ] VR support
- [ ] Mobile device controls
- [ ] City selector component

## TypeScript

This project is fully written in TypeScript for type safety. All Three.js interactions are properly typed, and custom types are defined in `src/types/index.ts`.

## Contributing

Feel free to fork this project and add your own improvements. Some areas that could use work:

- Better OSM data integration
- More realistic vehicle physics
- Traffic AI
- Better graphics and textures
- Performance optimizations
- Vue composables for game state management

## License

MIT License - feel free to use this project for learning or as a starting point for your own projects!

## Acknowledgments

- Vue.js team for the amazing framework
- Three.js community for excellent documentation
- OpenStreetMap for providing free map data
- All contributors to open-source tools used in this project

---

Enjoy practicing your driving skills! 🚦✨
