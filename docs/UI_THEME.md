# Wander UI theme

The established theme is **coastal dusk**: deep teal surfaces, warm sand/gold
accents, off-white text and restrained motion. It should feel calm, spacious and
connected to exploring real places. The main menu is the visual reference.

## Implementation references

- [Shared screen styles](../src/styles/screens.css): reusable screen, card,
  button, heading and notice classes. Reuse these instead of introducing another
  palette for each screen.
- [Main menu](../src/parts/MainMenu.vue): branding, primary navigation, animated tips.
- [Menu scene](../src/core/MenuScene.ts): selected car and shared moai geometry,
  soft daylight, slow camera motion and complete resource cleanup.
- [Map chooser](../src/parts/CitySelection.vue),
  [loading screen](../src/parts/LoadingScreen.vue) and
  [load error](../src/parts/LoadError.vue): reference secondary screens.

Some driving HUD elements predate the theme. Apply this guide when updating them;
do not treat their older blue/grey styling as a competing standard. Preserve the
existing speedometer design unless the user specifically requests changes.

## Palette

| Role | Value | Usage |
| --- | --- | --- |
| Deep background | `#101e23` | Screen foundations and left-side menu shade |
| Secondary background | `#14262b` | Subtle gradient depth |
| Scene fallback | `#263c40` | Main-menu backdrop before WebGL is ready |
| Primary text | `#f4f3e9` | Headings and button labels |
| Secondary text | `#bdcec4` | Descriptions and supporting labels |
| Muted text | `#aabeb4` | Completed loading stages |
| Primary accent | `#d9bd87` | Primary buttons, markers and small headings |
| Primary hover | `#edd2a0` | Hovered primary buttons |
| Text on gold | `#24312e` | Contrast on filled primary buttons |
| Focus ring | `#f0d49c` | Visible keyboard focus |
| Notice text | `#e8cfa5` | Readable error/status feedback |
| Notice background | `#18292b` | Inline feedback surfaces |
| Panel border | `#dce9df35` | Thin, translucent outline |
| Secondary control fill | `#eff7f00b` | Quiet translucent buttons |

Opacity suffixes are intentional. Keep enough background opacity to read text
over the sky and 3D scene. Use gold sparingly for emphasis; do not reintroduce
bright blue primary buttons on new screens. Small branding/tip highlights already
use nearby warm gold shades; shared screen controls use the primary accent above.

## Typography

Use `system-ui, sans-serif`; no downloaded font is required.

- Wordmark: large, heavy, tightly spaced; the main menu uses a responsive
  50?104 px heading, weight 850 and `-.075em` letter spacing.
- Screen headings: responsive 32?48 px, weight 700, line-height 1.12,
  `-.045em` letter spacing.
- Primary menu buttons: 22 px. Shared secondary-screen buttons: 18 px, weight 550.
- Descriptions: 17 px with 1.6 line-height.
- Supporting detail: 13?16 px. Reserve 12 px uppercase, widely spaced text for
  short decorative section captions, never essential instructions.
- Use tabular numerals for timing and indices; wrap long filenames and errors.

## Surfaces, layout and controls

Main-menu actions sit on the left, with the car/moai scene visible on the right.
Group Play/Continue/Choose Map together, then leave a clear gap before Settings.
Keep attribution accessible at the bottom across menu, loading and errors.

Secondary screens use a centred card, typically 620?680 px wide; the map chooser
can expand to 820 px. Card padding is responsive (24?46 px), with a 12 px corner
radius, a thin border and a soft shadow. Buttons use a 7 px radius; inline notices
use 6 px. Avoid oversized pill shapes.

Shared buttons are at least 54 px tall, with 13 px vertical and 22 px horizontal
padding. Main-menu buttons are normally 64 px tall. Use 10?12 px between sibling
controls, then 24?32 px between groups. Put secondary explanations below the
primary label rather than cramming them beside it.

Map cards show the city name and its configured country. The last-visited marker
is additional context, not a replacement for country. Use two columns on wide
screens and one below 560 px. Stack error recovery buttons on narrow screens.

## Motion, accessibility and responsive behaviour

Keep transitions around 180 ms. Secondary buttons lift by 2 px; main-menu buttons
move gently right. Tips may pulse and crossfade; the 3D camera and moai move slowly.
Respect `prefers-reduced-motion` for both CSS and the scene. Avoid flashing effects.

Use semantic buttons, labelled navigation and visible keyboard focus. Decorative
icons and the background scene are hidden from assistive technology. Loading uses
`role="status"`; actionable failures use `role="alert"`. Never imply measured
progress with a fabricated percentage: the loading bar is indeterminate, while
actual stage names and timings remain visible.

Support touch, safe areas and short landscape viewports. Keep controls readable,
allow scrolling when necessary, and avoid putting important text directly on the
unshaded scene. Preview WebGL, audio, timers and observers must be disposed when
the menu leaves the screen.

## Feedback and wording

Use short, friendly titles with useful details underneath. Keep the real failure
message available and wrap it safely. Offer clear recovery actions: Try again,
Choose Map and Main menu. Inline search, vehicle and radio failures use the same
warm notice treatment (`wander-notice`), rather than unrelated popup designs.

## Shared class example

```vue
<section class="wander-screen" aria-labelledby="screen-title">
    <div class="wander-card">
        <p class="wander-eyebrow">Wander / Section</p>
        <h2 id="screen-title" class="wander-title">A clear title.</h2>
        <p class="wander-description">Useful supporting information.</p>
        <button class="wander-button primary">Continue</button>
    </div>
</section>
```

Keep reusable visual rules in the shared stylesheet and component-specific layout
in scoped styles. Follow the project's Vue script ordering and use Pinia for shared
state and simulator commands; visual consistency should not add event-forwarding
chains or duplicate state.


## Standard form controls and HUD variants

All reusable form styling lives in [screens.css](../src/styles/screens.css).
Use these classes on native elements; retain native keyboard semantics, labels,
`v-model`, `disabled` and appropriate ARIA state:

| Class | Element / purpose |
| --- | --- |
| `wander-dialog` | Native `<dialog>` surface, backdrop, scrolling and responsive dimensions |
| `wander-dialog-head` | Dialog heading and close-button arrangement |
| `wander-panel` | Opaque-enough floating HUD panel |
| `wander-section-title` | Small gold section heading |
| `wander-field` | Form label, description and control row |
| `wander-checkbox` | Native checkbox, including checked, focus and disabled states |
| `wander-select` | Native select with shared chevron, options, focus and disabled styles |
| `wander-input` | Text input |
| `wander-range` | Native volume slider with matching Chromium/Firefox track and thumb |
| `wander-button compact` | 44 px minimum-height in-game control |
| `wander-button compact icon` | Square icon button; supply an accessible label |
| `wander-menu-item` | Search result or city-switcher entry |

Selected/held buttons use the active palette: warm gold in menus and sage green in-game, never neon green. Keep visual control
rules here instead of adding component-local checkbox, select, slider or button
palettes. Scoped styles should handle placement, widths, grids and responsive
layout. The speedometer remains unchanged.


## Secondary gameplay palette

Keep the previous sage-green hue for in-game buttons, dialogs and form controls.
Gold remains the primary palette for the main menu, map chooser, loading and
error screens. Add `wander-secondary` to a gameplay surface to inherit the green
CSS custom properties from the shared stylesheet; do not duplicate control rules.

- Accent: `#a5d3b7`; hover: `#c0e4cb`; focus: `#b3dfc3`.
- Surface: `#111e18f2`; field surface: `#1b3026`; border: `#6f897966`.
- Text: `#e5f0e9`; supporting text: `#b9cdbf`.
- Selected and held controls use a translucent green fill and green border.

The Settings component uses gold when opened from the main menu and green when
opened during gameplay. Shared geometry, spacing and interaction rules stay the
same for both palettes. Use `var(--wander-accent, #d9bd87)` for component-specific
accent details so they follow the containing palette. Instrument and graph colours
can retain their existing meanings; this is not a speedometer redesign.
