import * as THREE from 'three';
import { Car } from './Car';
import type { InputState, MouseState } from '@/types';

export class CarControls {
  private keys: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    brake: false
  }

  private mouse: MouseState = {
    x: 0,
    y: 0,
    isDown: false
  }

  private keyDownHandler: (e: KeyboardEvent) => void
  private keyUpHandler: (e: KeyboardEvent) => void
  private mouseDownHandler: (e: MouseEvent) => void
  private mouseUpHandler: () => void
  private mouseMoveHandler: (e: MouseEvent) => void
  private contextMenuHandler: (e: Event) => void

  constructor(
    private car: Car,
    private camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement
  ) {
    // Bind handlers to preserve 'this' context
    this.keyDownHandler = this.handleKeyDown.bind(this)
    this.keyUpHandler = this.handleKeyUp.bind(this)
    this.mouseDownHandler = this.handleMouseDown.bind(this)
    this.mouseUpHandler = this.handleMouseUp.bind(this)
    this.mouseMoveHandler = this.handleMouseMove.bind(this)
    this.contextMenuHandler = (e: Event) => e.preventDefault()

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    // Keyboard controls
    document.addEventListener('keydown', this.keyDownHandler)
    document.addEventListener('keyup', this.keyUpHandler)

    // Mouse controls
    this.canvas.addEventListener('mousedown', this.mouseDownHandler)
    document.addEventListener('mouseup', this.mouseUpHandler)
    this.canvas.addEventListener('mousemove', this.mouseMoveHandler)

    // Prevent right-click menu
    this.canvas.addEventListener('contextmenu', this.contextMenuHandler)
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        this.keys.forward = true
        e.preventDefault()
        break
      case 's':
      case 'arrowdown':
        this.keys.backward = true
        e.preventDefault()
        break
      case 'a':
      case 'arrowleft':
        this.keys.left = true
        e.preventDefault()
        break
      case 'd':
      case 'arrowright':
        this.keys.right = true
        e.preventDefault()
        break
      case ' ':
        this.keys.brake = true
        e.preventDefault()
        break
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    switch (e.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        this.keys.forward = false
        break
      case 's':
      case 'arrowdown':
        this.keys.backward = false
        break
      case 'a':
      case 'arrowleft':
        this.keys.left = false
        break
      case 'd':
      case 'arrowright':
        this.keys.right = false
        break
      case ' ':
        this.keys.brake = false
        break
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    this.mouse.isDown = true
    this.mouse.x = e.clientX
    this.mouse.y = e.clientY
  }

  private handleMouseUp(): void {
    this.mouse.isDown = false
  }

  private cameraAngle: number = 0 // Track camera rotation around car

  private handleMouseMove(e: MouseEvent): void {
    if (this.mouse.isDown) {
      const deltaX = e.clientX - this.mouse.x
      
      // Accumulate camera angle
      this.cameraAngle -= deltaX * 0.005
      
      this.mouse.x = e.clientX
      this.mouse.y = e.clientY
    }
  }

  getCameraAngle(): number {
    return this.cameraAngle
  }

  update(delta: number): void {
    // Acceleration
    let acceleration = 0
    if (this.keys.forward) {
      acceleration = 1
    } else if (this.keys.backward) {
      acceleration = -0.5 // Reverse is slower
    }

    // Braking
    if (this.keys.brake) {
      this.car.brake(0.01) // More gradual braking
      acceleration = 0
    }

    this.car.setAcceleration(acceleration * this.car.maxAcceleration)

    // Steering
    let steering = 0
    if (this.keys.left) {
      steering = 1
    } else if (this.keys.right) {
      steering = -1
    }

    // Steering sensitivity based on speed (more responsive at low speeds)
    const speedFactor = Math.max(0.3, Math.min(1, Math.abs(this.car.getSpeed()) / 10))
    this.car.setSteering(steering * this.car.maxSteeringAngle * speedFactor)

    // Update car physics
    this.car.update(delta)
  }

  dispose(): void {
    document.removeEventListener('keydown', this.keyDownHandler)
    document.removeEventListener('keyup', this.keyUpHandler)
    document.removeEventListener('mouseup', this.mouseUpHandler)
    this.canvas.removeEventListener('mousedown', this.mouseDownHandler)
    this.canvas.removeEventListener('mousemove', this.mouseMoveHandler)
    this.canvas.removeEventListener('contextmenu', this.contextMenuHandler)
  }
}
