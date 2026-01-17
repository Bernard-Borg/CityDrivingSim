import * as THREE from 'three';

export class Car {
  private mesh: THREE.Group
  private wheels: THREE.Group[] = []
  
  // Physics properties
  private position: THREE.Vector3
  private rotation: THREE.Quaternion
  private velocity: THREE.Vector3
  private speed: number = 0 // m/s
  public readonly maxSpeed: number = 60 // m/s (~216 km/h)
  private acceleration: number = 0
  public readonly maxAcceleration: number = 8 // m/s² (more realistic acceleration)
  private readonly friction: number = 0.96 // Less aggressive friction for gradual deceleration
  private readonly coastFriction: number = 0.99 // Minimal friction when coasting
  private steeringAngle: number = 0
  public readonly maxSteeringAngle: number = Math.PI / 4 // 45 degrees
  private readonly turningRadius: number = 20

  constructor(scene: THREE.Scene) {
    this.position = new THREE.Vector3(0, 1, 0)
    this.rotation = new THREE.Quaternion()
    this.velocity = new THREE.Vector3()
    
    this.mesh = this.createCarMesh()
    this.mesh.position.copy(this.position)
    scene.add(this.mesh)
  }

  private createCarMesh(): THREE.Group {
    const group = new THREE.Group()

    // Main car body - more realistic sedan shape
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1a3a5c,
      roughness: 0.4,
      metalness: 0.7
    })

    // Lower body (wider and lower)
    const lowerBodyGeometry = new THREE.BoxGeometry(1.9, 0.6, 4.2)
    const lowerBody = new THREE.Mesh(lowerBodyGeometry, bodyMaterial)
    lowerBody.position.y = 0.3
    lowerBody.castShadow = true
    lowerBody.receiveShadow = true
    group.add(lowerBody)

    // Upper body section (hood area)
    const hoodGeometry = new THREE.BoxGeometry(1.85, 0.4, 1.5)
    const hood = new THREE.Mesh(hoodGeometry, bodyMaterial)
    hood.position.set(0, 0.55, 1.3)
    hood.castShadow = true
    group.add(hood)

    // Trunk area
    const trunkGeometry = new THREE.BoxGeometry(1.85, 0.4, 1.2)
    const trunk = new THREE.Mesh(trunkGeometry, bodyMaterial)
    trunk.position.set(0, 0.55, -1.4)
    trunk.castShadow = true
    group.add(trunk)

    // Car roof - more rounded appearance
    const roofGeometry = new THREE.BoxGeometry(1.5, 0.5, 2.2)
    const roof = new THREE.Mesh(roofGeometry, bodyMaterial)
    roof.position.set(0, 1.15, -0.1)
    roof.castShadow = true
    group.add(roof)

    // Front windshield
    const windshieldGeometry = new THREE.PlaneGeometry(1.4, 0.75)
    const windshieldMaterial = new THREE.MeshStandardMaterial({
      color: 0x87CEEB,
      transparent: true,
      opacity: 0.25,
      roughness: 0.05,
      metalness: 0.95
    })
    const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial)
    windshield.position.set(0, 1.05, 1.25)
    windshield.rotation.x = -0.25
    group.add(windshield)

    // Rear windshield
    const rearWindshield = new THREE.Mesh(windshieldGeometry.clone(), windshieldMaterial)
    rearWindshield.position.set(0, 1.05, -1.45)
    rearWindshield.rotation.x = 0.25
    group.add(rearWindshield)

    // Side windows
    const sideWindowMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a6fa5,
      transparent: true,
      opacity: 0.3,
      roughness: 0.1,
      metalness: 0.9
    })
    
    // Left side windows
    const leftFrontWindow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.6),
      sideWindowMaterial
    )
    leftFrontWindow.position.set(-0.76, 1.05, 0.4)
    leftFrontWindow.rotation.y = Math.PI / 2
    leftFrontWindow.rotation.x = -0.1
    group.add(leftFrontWindow)

    const leftRearWindow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.6),
      sideWindowMaterial
    )
    leftRearWindow.position.set(-0.76, 1.05, -0.6)
    leftRearWindow.rotation.y = Math.PI / 2
    leftRearWindow.rotation.x = -0.1
    group.add(leftRearWindow)

    // Right side windows
    const rightFrontWindow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.6),
      sideWindowMaterial
    )
    rightFrontWindow.position.set(0.76, 1.05, 0.4)
    rightFrontWindow.rotation.y = -Math.PI / 2
    rightFrontWindow.rotation.x = -0.1
    group.add(rightFrontWindow)

    const rightRearWindow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.6),
      sideWindowMaterial
    )
    rightRearWindow.position.set(0.76, 1.05, -0.6)
    rightRearWindow.rotation.y = -Math.PI / 2
    rightRearWindow.rotation.x = -0.1
    group.add(rightRearWindow)

    // Bumpers
    const bumperMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.8,
      metalness: 0.2
    })

    // Front bumper
    const frontBumper = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.25, 0.3),
      bumperMaterial
    )
    frontBumper.position.set(0, 0.15, 2.2)
    frontBumper.castShadow = true
    group.add(frontBumper)

    // Rear bumper
    const rearBumper = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.25, 0.3),
      bumperMaterial
    )
    rearBumper.position.set(0, 0.15, -2.2)
    rearBumper.castShadow = true
    group.add(rearBumper)

    // Wheels - more realistic car wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 24)
    const wheelMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x0a0a0a,
      roughness: 0.95
    })
    const rimGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.32, 16)
    const rimMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xd4d4d4,
      metalness: 0.9,
      roughness: 0.3
    })

    const wheelPositions: Array<[number, number, number]> = [
      [-0.7, 0.4, 1.25],   // Front left
      [0.7, 0.4, 1.25],    // Front right
      [-0.7, 0.4, -1.25],  // Rear left
      [0.7, 0.4, -1.25]    // Rear right
    ]

    wheelPositions.forEach((pos) => {
      const wheelGroup = new THREE.Group()
      
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
      wheel.rotation.z = Math.PI / 2
      wheelGroup.add(wheel)

      const rim = new THREE.Mesh(rimGeometry, rimMaterial)
      rim.rotation.z = Math.PI / 2
      wheelGroup.add(rim)

      wheelGroup.position.set(pos[0], pos[1], pos[2])
      wheelGroup.castShadow = true
      group.add(wheelGroup)
      this.wheels.push(wheelGroup)
    })

    // Headlights - more realistic design
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFFFDD,
      emissive: 0xFFFFAA,
      emissiveIntensity: 0.6,
      metalness: 0.9,
      roughness: 0.1
    })
    
    // Left headlight
    const leftLightGeometry = new THREE.CylinderGeometry(0.12, 0.15, 0.2, 12)
    const leftLight = new THREE.Mesh(leftLightGeometry, lightMaterial)
    leftLight.rotation.z = Math.PI / 2
    leftLight.position.set(-0.65, 0.5, 2.15)
    group.add(leftLight)

    // Right headlight
    const rightLight = new THREE.Mesh(leftLightGeometry.clone(), lightMaterial)
    rightLight.rotation.z = Math.PI / 2
    rightLight.position.set(0.65, 0.5, 2.15)
    group.add(rightLight)

    // Taillights
    const tailLightMaterial = new THREE.MeshStandardMaterial({
      color: 0xFF4444,
      emissive: 0xFF0000,
      emissiveIntensity: 0.4
    })
    
    const tailLightGeometry = new THREE.BoxGeometry(0.15, 0.2, 0.1)
    const leftTailLight = new THREE.Mesh(tailLightGeometry, tailLightMaterial)
    leftTailLight.position.set(-0.65, 0.5, -2.15)
    group.add(leftTailLight)

    const rightTailLight = new THREE.Mesh(tailLightGeometry.clone(), tailLightMaterial)
    rightTailLight.position.set(0.65, 0.5, -2.15)
    group.add(rightTailLight)

    // Side mirrors
    const mirrorMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.8,
      roughness: 0.2
    })
    
    const mirrorGeometry = new THREE.BoxGeometry(0.08, 0.06, 0.12)
    const leftMirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial)
    leftMirror.position.set(-0.96, 0.9, 0.7)
    group.add(leftMirror)

    const rightMirror = new THREE.Mesh(mirrorGeometry.clone(), mirrorMaterial)
    rightMirror.position.set(0.96, 0.9, 0.7)
    group.add(rightMirror)

    return group
  }

  update(delta: number): void {
    // Apply acceleration first
    if (this.acceleration !== 0) {
      this.speed += this.acceleration * delta
      this.speed = Math.max(-this.maxSpeed * 0.5, Math.min(this.maxSpeed, this.speed))
      // No friction when actively accelerating
    } else {
      // Apply stronger friction when not accelerating (coasting/stopping)
      this.speed *= this.friction
    }

    // Stop very slow movement
    if (Math.abs(this.speed) < 0.05) {
      this.speed = 0
    }

    // Update position based on speed and rotation
    const direction = new THREE.Vector3(0, 0, 1)
    direction.applyQuaternion(this.rotation)

    // Apply steering
    if (this.steeringAngle !== 0 && Math.abs(this.speed) > 0.1) {
      const steeringSpeed = this.speed * delta
      const turnRadius = this.turningRadius / Math.abs(this.steeringAngle)
      const angularVelocity = steeringSpeed / turnRadius
      const turnDirection = this.steeringAngle > 0 ? 1 : -1
      
      const rotationDelta = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        angularVelocity * turnDirection
      )
      this.rotation.multiply(rotationDelta)
    }

    // Move forward/backward
    const movement = direction.multiplyScalar(this.speed * delta)
    this.position.add(movement)

    // Update mesh position and rotation
    this.mesh.position.copy(this.position)
    this.mesh.quaternion.copy(this.rotation)

    // Animate wheels (rotate when moving)
    if (Math.abs(this.speed) > 0.1) {
      const wheelRotation = this.speed * delta * 5
      this.wheels.forEach(wheel => {
        const wheelMesh = wheel.children[0] as THREE.Mesh
        const rimMesh = wheel.children[1] as THREE.Mesh
        wheelMesh.rotation.x += wheelRotation / 0.4 // Divide by wheel radius
        rimMesh.rotation.x += wheelRotation / 0.4
      })
    }

    // Rotate front wheels for steering
    if (this.wheels && this.wheels.length >= 2) {
      const frontWheelAngle = this.steeringAngle * 0.7 // Front wheels turn more
      this.wheels[0].rotation.y = frontWheelAngle // Front left
      this.wheels[1].rotation.y = frontWheelAngle // Front right
    }
  }

  setAcceleration(value: number): void {
    this.acceleration = Math.max(-this.maxAcceleration, Math.min(this.maxAcceleration, value))
  }

  setSteering(angle: number): void {
    this.steeringAngle = Math.max(-this.maxSteeringAngle, Math.min(this.maxSteeringAngle, angle))
  }

  brake(factor: number): void {
    this.speed *= (1 - factor)
  }

  getPosition(): THREE.Vector3 {
    return this.position.clone()
  }

  getRotation(): THREE.Quaternion {
    return this.rotation.clone()
  }

  getDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3(0, 0, 1)
    direction.applyQuaternion(this.rotation)
    return direction
  }

  getSpeed(): number {
    return this.speed
  }

  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z)
    this.mesh.position.copy(this.position)
  }
}
