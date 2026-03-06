/**
 * Core 3D game engine — Three.js setup, game loop, all systems.
 */
import * as THREE from 'three';
import { EventBus } from '../utils/EventBus';
import { InputManager3D } from './InputManager3D';
import { AudioEngine } from './AudioEngine';
import { TrainRenderer, CAR_WIDTH, CAR_LENGTH, CONNECTOR_LENGTH, FLOOR_Y } from '../rendering/TrainRenderer';
import { EnvironmentRenderer } from '../rendering/EnvironmentRenderer';
import {
  CharacterMesh, RagdollPart, createPlayer, createZombie, createNPC,
  animateWalk, animateMeleeSwing, animateZombieLurch, animateZombieAttack,
  animateWindowCrawl, createRagdoll, createBullet, createPickupMesh,
} from '../rendering/CharacterRenderer';
import { HudOverlay, HudData } from '../ui/HudOverlay';
import {
  showMainMenu, showPauseMenu, showGameOver,
  showInventory, showMap, showVictory,
} from '../ui/ScreenOverlays';
import { SurvivalManager } from '../systems/SurvivalManager';
import { InventoryManager } from '../systems/InventoryManager';
import { CraftingManager } from '../systems/CraftingManager';
import { distance, randomBetween, randomInt, randomChoice } from '../utils/MathUtils';
import { getLocation, getRoute, getReachableLocations } from '../data/LocationData';
import {
  GAME_WIDTH, GAME_HEIGHT, NUM_TRAIN_CARS, PLAYER_SPEED, PLAYER_MAX_HP,
  PLAYER_INTERACT_RANGE, EAT_RESTORE_AMOUNT, SLEEP_RESTORE_AMOUNT,
  FUEL_MAX, FUEL_CONSUMPTION_PER_SEC, FUEL_PER_SCRAP,
  TRAIN_SPEED_DEFAULT, TRAIN_SPEED_MIN, TRAIN_SPEED_MAX, TRAIN_SPEED_STEP,
  TRAVEL_SPEED_FACTOR, AMBIENT_ZOMBIE_SPAWN_INTERVAL,
  ZOMBIE_AMBIENT_SPEED, ZOMBIE_CHASE_SPEED, ZOMBIE_AGGRO_RANGE, ZOMBIE_DAMAGE,
  ZOMBIE_ATTACK_COOLDOWN_MS, RIFLE_DAMAGE, RIFLE_RANGE, RIFLE_FIRE_RATE_MS,
  MELEE_DAMAGE, MELEE_RANGE, MELEE_COOLDOWN_MS, BULLET_SPEED,
  EXIT_TRAIN_RANGE, DAY_PHASE_DURATION_MS, NIGHT_ZOMBIE_MULTIPLIER,
  ENGINE_DEGRADE_PER_SEC, BRAKE_DEGRADE_PER_SEC, MAINTENANCE_WARNING_THRESHOLD,
  REPAIR_AMOUNT, REPAIR_MATERIAL_COST, LOW_STAT_THRESHOLD,
  HUNGER_MAX, ENERGY_MAX, ZOMBIE_WINDOW_DAMAGE, WINDOW_MAX_HP,
  ZOMBIE_SPAWN_RADIUS, ZOMBIE_MAX_COUNT,
} from '../data/BalanceConstants';
import { SurvivalState, WeaponType, InventoryItem } from '../types/GameTypes';

type GamePhase = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';
type GameMode = 'TRAVELING' | 'STOPPED' | 'EXPLORING';
type TimeOfDay = 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT';

const FLOOR_SURFACE_Y = FLOOR_Y + 0.05;
const GROUND_Y = 0;

interface ZombieEntity {
  mesh: CharacterMesh;
  alive: boolean;
  hp: number;
  attackCooldown: number;
  ambient: boolean;
  velocity: THREE.Vector3;
  insideTrain: boolean;
}

interface Bullet {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  speed: number;
  life: number;
  damage: number;
}

interface NPCEntity {
  mesh: CharacterMesh;
  name: string;
  wanderTimer: number;
  wanderDir: THREE.Vector3;
}

export class GameEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  private ambientLight!: THREE.AmbientLight;
  private directionalLight!: THREE.DirectionalLight;

  private trainRenderer!: TrainRenderer;
  private envRenderer!: EnvironmentRenderer;

  private playerMesh!: CharacterMesh;
  private playerPos = new THREE.Vector3(0, FLOOR_SURFACE_Y, 6);
  private playerFacing = new THREE.Vector3(0, 0, 1);
  private playerSpeedMult = 1.0;
  private isSprinting = false;

  private phase: GamePhase = 'MENU';
  private mode: GameMode = 'STOPPED';
  private survival!: SurvivalState;
  private survivalManager!: SurvivalManager;
  private inventory!: InventoryManager;
  private crafting!: CraftingManager;

  private trainMoving = false;
  private trainSpeed = TRAIN_SPEED_DEFAULT;
  private fuel = FUEL_MAX;
  private interiorLightsOn = true;

  private engineHp = 100;
  private brakeHp = 100;

  private currentLocationId = 'riverside';
  private destinationId: string | null = 'millfield'; // auto-set first destination
  private travelProgress = 0;
  private travelDistance = 0;

  private timeOfDay: TimeOfDay = 'DAY';
  private dayTimer = 0;

  private currentWeapon: WeaponType = WeaponType.RIFLE;
  private lastFireTime = 0;
  private lastMeleeTime = 0;
  private bullets: Bullet[] = [];

  private zombies: ZombieEntity[] = [];
  private zombieSpawnTimer = 0;

  private ragdollParts: RagdollPart[] = [];

  private npcs: NPCEntity[] = [];

  private explorationActive = false;
  private explorationPickups: { mesh: THREE.Mesh; type: string; name: string; collected: boolean }[] = [];

  private input!: InputManager3D;
  private audio!: AudioEngine;
  private hud!: HudOverlay;

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_SURFACE_Y);

  private cameraOrbitAngle = Math.PI / 2;
  private cameraOrbitPitch = 0.6;
  private cameraDistance = 12;
  private cameraHeight = 10;

  private uiOpen = false;

  // Occlusion
  private occludedMeshes = new Set<THREE.Mesh>();
  private occludableCache: THREE.Mesh[] | null = null;

  constructor() {}

  public async init(): Promise<void> {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x1a1a2e);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    const container = document.getElementById('game-container')!;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x8899aa, 0.008);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 12, -4);
    this.camera.lookAt(0, FLOOR_Y, 10);

    this.ambientLight = new THREE.AmbientLight(0x8899aa, 0.8);
    this.scene.add(this.ambientLight);

    // Hemisphere light for natural sky/ground color blending
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a7a2a, 0.4);
    this.scene.add(hemiLight);

    this.directionalLight = new THREE.DirectionalLight(0xfff5e0, 1.5);
    this.directionalLight.position.set(15, 25, 10);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 80;
    this.directionalLight.shadow.camera.left = -30;
    this.directionalLight.shadow.camera.right = 30;
    this.directionalLight.shadow.camera.top = 30;
    this.directionalLight.shadow.camera.bottom = -30;
    this.scene.add(this.directionalLight);

    this.envRenderer = new EnvironmentRenderer();
    this.envRenderer.create();
    this.scene.add(this.envRenderer.group);

    this.trainRenderer = new TrainRenderer();
    this.trainRenderer.create();
    this.scene.add(this.trainRenderer.group);

    this.playerMesh = createPlayer();
    this.playerPos.set(0, FLOOR_SURFACE_Y, CAR_LENGTH / 2);
    this.playerMesh.group.position.copy(this.playerPos);
    this.scene.add(this.playerMesh.group);

    this.input = new InputManager3D(this.renderer.domElement);
    this.audio = new AudioEngine();
    this.audio.create();
    this.hud = new HudOverlay();
    this.hud.create();

    this.spawnNPC('Sarah', 0, CAR_LENGTH + CONNECTOR_LENGTH + CAR_LENGTH / 2);

    window.addEventListener('resize', () => this.onResize());
    EventBus.on('survival:death', () => this.gameOver());
    EventBus.on('inventory:use-food', () => {
      this.survivalManager.eat(EAT_RESTORE_AMOUNT);
      this.hud.showFloatingText(`+${EAT_RESTORE_AMOUNT} Food`);
    });
    EventBus.on('inventory:use-medicine', () => {
      this.survivalManager.heal(25);
      this.hud.showFloatingText('+25 Health');
    });

    // Auto-set initial destination
    const initRoute = getRoute('riverside', 'millfield');
    if (initRoute) {
      this.travelDistance = initRoute.distance;
    }

    this.showMenu();
  }

  private showMenu(): void {
    this.phase = 'MENU';
    showMainMenu(() => this.startNewGame());
  }

  private startNewGame(): void {
    this.phase = 'PLAYING';
    this.mode = 'STOPPED';
    this.trainMoving = false;
    this.fuel = FUEL_MAX;
    this.trainSpeed = TRAIN_SPEED_DEFAULT;
    this.engineHp = 100;
    this.brakeHp = 100;
    this.currentLocationId = 'riverside';
    this.destinationId = 'millfield';
    this.travelProgress = 0;
    const initRoute = getRoute('riverside', 'millfield');
    this.travelDistance = initRoute?.distance ?? 30;
    this.timeOfDay = 'DAY';
    this.dayTimer = 0;
    this.currentWeapon = WeaponType.RIFLE;
    this.explorationActive = false;
    this.cameraOrbitAngle = Math.PI / 2;
    this.interiorLightsOn = true;
    this.trainRenderer.setInteriorLights(true);

    // Clear all zombies
    for (const z of this.zombies) {
      this.scene.remove(z.mesh.group);
    }
    this.zombies = [];
    this.zombieSpawnTimer = 0;

    // Clear all bullets
    for (const b of this.bullets) {
      this.scene.remove(b.mesh);
    }
    this.bullets = [];

    // Clear ragdoll parts
    for (const p of this.ragdollParts) {
      this.scene.remove(p.mesh);
    }
    this.ragdollParts = [];

    // Clear exploration pickups
    for (const p of this.explorationPickups) {
      if (!p.collected) this.scene.remove(p.mesh);
    }
    this.explorationPickups = [];
    this.envRenderer.clearExploration();

    // Repair all windows
    for (const w of this.trainRenderer.windows) {
      this.trainRenderer.repairWindow(w);
    }

    this.survival = { hunger: HUNGER_MAX, energy: ENERGY_MAX, health: PLAYER_MAX_HP };
    this.survivalManager = new SurvivalManager(this.survival);
    this.inventory = new InventoryManager();
    this.inventory.create();
    this.crafting = new CraftingManager();
    this.crafting.create();

    // Reset lighting to DAY
    this.updateLighting();
    this.envRenderer.setSkyPhase('DAY');

    this.playerPos.set(0, FLOOR_SURFACE_Y, CAR_LENGTH / 2);
    this.audio.resume();
    this.hud.showFloatingText('Riverside Station — Destination: Millfield. Start the train at the brake panel!');

    this.uiOpen = false;

    if (!this.clock.running) {
      this.clock.start();
      this.animate();
    }
  }

  // ===== GAME LOOP =====

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const dtMs = dt * 1000;
    this.input.update();

    if (this.phase === 'PLAYING' && !this.uiOpen) {
      this.updateGame(dt, dtMs);
    }

    this.updateRagdolls(dt);
    this.updateOcclusion();
    this.updateCamera(dt);
    this.updateFloatingLabels();
    this.renderer.render(this.scene, this.camera);
  };

  private updateGame(dt: number, dtMs: number): void {
    const inp = this.input.state;

    if (inp.pause) {
      this.phase = 'PAUSED';
      showPauseMenu(() => { this.phase = 'PLAYING'; });
      return;
    }
    if (inp.openInventory) {
      this.uiOpen = true;
      showInventory(this.inventory, this.crafting, () => { this.uiOpen = false; });
      return;
    }
    if (inp.openMap) {
      this.uiOpen = true;
      showMap(this.currentLocationId, this.destinationId, (destId) => {
        this.setDestination(destId);
      }, () => { this.uiOpen = false; });
      return;
    }
    if (inp.openTrainMap) {
      this.showTrainMap();
      return;
    }

    if (inp.switchWeapon) {
      this.currentWeapon = this.currentWeapon === WeaponType.RIFLE ? WeaponType.MELEE : WeaponType.RIFLE;
      this.hud.showFloatingText(this.currentWeapon === WeaponType.RIFLE ? 'Rifle' : 'Melee');
    }
    if (inp.speedUp) {
      this.trainSpeed = Math.min(TRAIN_SPEED_MAX, this.trainSpeed + TRAIN_SPEED_STEP);
      this.hud.showFloatingText(`Speed: ${this.trainSpeed}`);
    }
    if (inp.speedDown) {
      this.trainSpeed = Math.max(TRAIN_SPEED_MIN, this.trainSpeed - TRAIN_SPEED_STEP);
      this.hud.showFloatingText(`Speed: ${this.trainSpeed}`);
    }

    // Camera: right-click drag
    if (inp.cameraDeltaX !== 0) this.cameraOrbitAngle += inp.cameraDeltaX * 0.004;
    if (inp.cameraDeltaY !== 0) this.cameraOrbitPitch = Math.max(0.15, Math.min(1.2, this.cameraOrbitPitch + inp.cameraDeltaY * 0.004));
    // Camera: keyboard rotation
    if (inp.cameraRotateLeft) this.cameraOrbitAngle -= 2.0 * dt;
    if (inp.cameraRotateRight) this.cameraOrbitAngle += 2.0 * dt;

    // Sprint
    this.isSprinting = inp.sprint && (inp.moveX !== 0 || inp.moveZ !== 0);

    this.survivalManager.update(dtMs);
    this.playerSpeedMult = this.survivalManager.getSpeedMultiplier();

    this.updatePlayer(dt, inp);

    if (inp.mouseJustPressed) this.handleMouseAttack();
    if (inp.attack) this.handleAttack();

    this.updateBullets(dt);
    this.handleInteractions(inp);

    if (this.trainMoving) {
      const fuelUse = FUEL_CONSUMPTION_PER_SEC * (this.trainSpeed / TRAIN_SPEED_DEFAULT) * dt;
      this.fuel = Math.max(0, this.fuel - fuelUse);
      if (this.fuel <= 0) {
        this.trainMoving = false;
        this.mode = 'STOPPED';
        this.hud.showFloatingText('OUT OF FUEL!');
      }
    }
    if (this.trainMoving && this.destinationId) this.updateTravel(dt);
    if (this.trainMoving) this.envRenderer.scrollEnvironment(this.trainSpeed * 0.02 * dt);

    if (this.trainMoving) {
      this.engineHp = Math.max(0, this.engineHp - ENGINE_DEGRADE_PER_SEC * dt);
      this.brakeHp = Math.max(0, this.brakeHp - BRAKE_DEGRADE_PER_SEC * dt);
    }

    this.updateZombies(dt, dtMs);
    this.updateNPCs(dt);
    this.updateDayNight(dtMs);

    if (this.trainMoving && this.trainRenderer.isInConnector(this.playerPos.x, this.playerPos.z)) {
      this.playerPos.x *= 0.9;
    }

    this.updateRoofVisibility();
    this.emitHud();
  }

  // ===== PLAYER =====

  private updatePlayer(dt: number, inp: InputManager3D['state']): void {
    const sprintMult = this.isSprinting ? 1.8 : 1.0;
    const speed = PLAYER_SPEED * this.playerSpeedMult * sprintMult * dt * 0.02;

    // Sprint drains energy
    if (this.isSprinting) {
      this.survival.energy = Math.max(0, this.survival.energy - 0.3 * dt * 60);
      if (this.survival.energy <= 0) this.isSprinting = false;
    }

    const cos = Math.cos(this.cameraOrbitAngle);
    const sin = Math.sin(this.cameraOrbitAngle);
    const rawX = -inp.moveX;
    const rawZ = -inp.moveZ;
    let dx = rawX * cos - rawZ * sin;
    let dz = rawX * sin + rawZ * cos;

    if (dx !== 0 && dz !== 0) {
      const mag = Math.sqrt(dx * dx + dz * dz);
      dx /= mag;
      dz /= mag;
    }
    dx *= speed;
    dz *= speed;

    const newX = this.playerPos.x + dx;
    const newZ = this.playerPos.z + dz;
    const bounds = this.trainRenderer.getBounds();
    const padding = 0.3;

    if (!this.explorationActive) {
      this.playerPos.x = Math.max(bounds.minX + padding, Math.min(bounds.maxX - padding, newX));
      this.playerPos.z = Math.max(bounds.minZ + padding, Math.min(bounds.maxZ - padding, newZ));
      this.playerPos.y = FLOOR_SURFACE_Y;
    } else {
      this.playerPos.x = Math.max(-30, Math.min(30, newX));
      this.playerPos.z = Math.max(bounds.minZ - 20, Math.min(bounds.maxZ + 30, newZ));
      this.playerPos.y = GROUND_Y;
    }

    if (dx !== 0 || dz !== 0) {
      this.playerFacing.set(dx, 0, dz).normalize();
      this.playerMesh.group.rotation.y = Math.atan2(dx, dz);
    }

    this.playerMesh.group.position.copy(this.playerPos);
    const moveSpeed = Math.abs(dx) + Math.abs(dz);
    animateWalk(this.playerMesh, moveSpeed * 20, dt);
  }

  // ===== COMBAT =====

  private handleAttack(): void {
    const now = performance.now();
    if (this.currentWeapon === WeaponType.RIFLE) {
      if (now - this.lastFireTime < RIFLE_FIRE_RATE_MS) return;
      if (!this.inventory.useAmmo()) { this.hud.showFloatingText('No ammo!'); return; }
      this.lastFireTime = now;
      this.fireRifle(this.playerFacing.clone());
      this.audio.playShot();
    } else {
      if (now - this.lastMeleeTime < MELEE_COOLDOWN_MS) return;
      this.lastMeleeTime = now;
      this.meleeAttack();
      this.audio.playMelee();
    }
  }

  private handleMouseAttack(): void {
    const mouse = new THREE.Vector2(
      (this.input.state.mouseX / window.innerWidth) * 2 - 1,
      -(this.input.state.mouseY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(mouse, this.camera);
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, target);
    if (!target) return;

    const dir = new THREE.Vector3().subVectors(target, this.playerPos).normalize();
    dir.y = 0;
    dir.normalize();
    this.playerFacing.copy(dir);
    this.playerMesh.group.rotation.y = Math.atan2(dir.x, dir.z);

    const now = performance.now();
    if (this.currentWeapon === WeaponType.RIFLE) {
      if (now - this.lastFireTime < RIFLE_FIRE_RATE_MS) return;
      if (!this.inventory.useAmmo()) return;
      this.lastFireTime = now;
      this.fireRifle(dir);
      this.audio.playShot();
    } else {
      if (now - this.lastMeleeTime < MELEE_COOLDOWN_MS) return;
      this.lastMeleeTime = now;
      this.meleeAttack();
      this.audio.playMelee();
    }
  }

  private fireRifle(dir: THREE.Vector3): void {
    const bulletMesh = createBullet();
    bulletMesh.position.copy(this.playerPos).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(bulletMesh);
    this.bullets.push({ mesh: bulletMesh, dir: dir.clone(), speed: BULLET_SPEED * 0.03, life: 2000, damage: RIFLE_DAMAGE });
  }

  private meleeAttack(): void {
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    animateMeleeSwing(this.playerMesh);
    const bounds = this.trainRenderer.getBounds();
    const playerInside = !this.explorationActive;

    for (const z of this.zombies) {
      if (!z.alive) continue;
      const zPos = z.mesh.group.position;
      const dist = distance(px, pz, zPos.x, zPos.z);
      if (dist < 2.0) {
        const toZ = new THREE.Vector3(zPos.x - px, 0, zPos.z - pz).normalize();
        if (this.playerFacing.dot(toZ) > -0.2) {
          // Check wall blocking: if player is inside and zombie is outside,
          // only allow hitting through windows, not through walls
          if (playerInside && !z.insideTrain) {
            const nearWin = this.trainRenderer.getNearestWindow(zPos.x, zPos.z, 2.0);
            if (!nearWin) continue; // blocked by wall
          }

          z.hp -= MELEE_DAMAGE;
          const knock = toZ.clone().multiplyScalar(3);
          knock.y = 1;
          z.velocity.add(knock);
          this.hud.showFloatingText(`-${MELEE_DAMAGE}`);
          if (z.hp <= 0) this.killZombie(z, toZ.multiplyScalar(5));
          this.audio.playHit();
        }
      }
    }
  }

  private updateBullets(dt: number): void {
    const bounds = this.trainRenderer.getBounds();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const prevPos = b.mesh.position.clone();
      b.mesh.position.addScaledVector(b.dir, b.speed * dt * 60);
      b.life -= dt * 1000;

      // Check if bullet crosses a train wall (stop it unless through a window)
      const bulletInside = b.mesh.position.x > bounds.minX && b.mesh.position.x < bounds.maxX &&
                           b.mesh.position.z > bounds.minZ && b.mesh.position.z < bounds.maxZ;
      const wasInside = prevPos.x > bounds.minX && prevPos.x < bounds.maxX &&
                        prevPos.z > bounds.minZ && prevPos.z < bounds.maxZ;
      if (bulletInside !== wasInside) {
        // Bullet crossed a wall boundary — check if there's a window nearby
        const nearWin = this.trainRenderer.getNearestWindow(b.mesh.position.x, b.mesh.position.z, 1.0);
        if (!nearWin) {
          // Blocked by wall
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);
          continue;
        }
      }

      let hit = false;
      for (const z of this.zombies) {
        if (!z.alive) continue;
        if (b.mesh.position.distanceTo(z.mesh.group.position) < 0.5) {
          z.hp -= b.damage;
          const knock = b.dir.clone().multiplyScalar(2);
          knock.y = 0.5;
          z.velocity.add(knock);
          this.hud.showFloatingText(`-${b.damage}`);
          if (z.hp <= 0) this.killZombie(z, b.dir.clone().multiplyScalar(5));
          this.audio.playHit();
          hit = true;
          break;
        }
      }
      if (hit || b.life <= 0) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }

  // ===== INTERACTIONS =====

  private handleInteractions(inp: InputManager3D['state']): void {
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const range = PLAYER_INTERACT_RANGE * 0.03;
    let prompted = false;

    const storageDoorZ = (CAR_LENGTH + CONNECTOR_LENGTH) * 2 + CAR_LENGTH;
    if (this.mode === 'STOPPED' && !this.explorationActive) {
      if (distance(px, pz, 0, storageDoorZ) < EXIT_TRAIN_RANGE * 0.04) {
        this.hud.showInteractPrompt('[E] Exit Train');
        prompted = true;
        if (inp.interact) { this.enterExploration(); return; }
      }
    }
    if (this.explorationActive) {
      if (distance(px, pz, 0, storageDoorZ) < EXIT_TRAIN_RANGE * 0.06) {
        this.hud.showInteractPrompt('[E] Return to Train');
        prompted = true;
        if (inp.interact) { this.exitExploration(); return; }
      }
    }

    if (this.explorationActive) {
      for (const pickup of this.explorationPickups) {
        if (pickup.collected) continue;
        if (distance(px, pz, pickup.mesh.position.x, pickup.mesh.position.z) < range) {
          this.hud.showInteractPrompt(`[E] Pick up ${pickup.name}`);
          prompted = true;
          if (inp.interact) {
            pickup.collected = true;
            this.scene.remove(pickup.mesh);
            this.inventory.addItem(pickup.name.toLowerCase().replace(/ /g, '-'), pickup.name, pickup.type as InventoryItem['type'], 1, '');
            this.hud.showFloatingText(`+1 ${pickup.name}`);
            this.audio.playPickup();
          }
          break;
        }
      }
    }

    if (!this.explorationActive) {
      const nearWin = this.trainRenderer.getNearestBrokenWindow(px, pz, range * 1.5);
      if (nearWin) {
        this.hud.showInteractPrompt('[E] Repair Window');
        prompted = true;
        if (inp.interact) {
          this.trainRenderer.repairWindow(nearWin);
          this.hud.showFloatingText('Window Repaired!');
        }
      }
    }

    for (const npc of this.npcs) {
      if (distance(px, pz, npc.mesh.group.position.x, npc.mesh.group.position.z) < range * 1.5) {
        this.hud.showInteractPrompt(`[E] Talk to ${npc.name}`);
        prompted = true;
        if (inp.interact) {
          this.hud.showFloatingText(randomChoice([
            'Stay safe...', 'Need supplies?', 'The coast is our hope.',
            'Keep the engine running.', 'Port Echo has boats.', 'Watch the fuel.',
          ]));
        }
        break;
      }
    }

    for (const furn of this.trainRenderer.furnitureList) {
      if (distance(px, pz, furn.worldPos.x, furn.worldPos.z) < range) {
        this.hud.showInteractPrompt(`[E] ${this.getFurniturePrompt(furn.type)}`);
        prompted = true;
        if (inp.interact) this.executeFurnitureAction(furn.type);
        break;
      }
    }

    if (!prompted) this.hud.hideInteractPrompt();
  }

  private getFurniturePrompt(type: string): string {
    switch (type) {
      case 'BRAKE_PANEL': return this.trainMoving ? `Stop Train (${this.trainSpeed} km/h)` : 'Start Train';
      case 'WORKBENCH': return 'Repair / Refuel';
      case 'MAP_BOARD': return 'View Map';
      case 'LIGHT_SWITCH': return 'Toggle Lights';
      case 'BED': return 'Sleep';
      case 'COOKING_STOVE': return 'Cook';
      case 'FIRST_AID': return 'Use First Aid';
      case 'PLANT_BOX': return 'Tend Plants';
      case 'STORAGE_CRATE': return 'Eat';
      default: return 'Use';
    }
  }

  private executeFurnitureAction(type: string): void {
    switch (type) {
      case 'BRAKE_PANEL':
        if (this.trainMoving) {
          this.trainMoving = false;
          this.mode = 'STOPPED';
          this.hud.showFloatingText('Train Stopped');
        } else {
          if (this.explorationActive) { this.hud.showFloatingText('Return to train first!'); return; }
          if (this.fuel <= 0) { this.hud.showFloatingText('No fuel!'); return; }
          if (!this.destinationId) {
            // Auto-pick next destination
            this.autoSetDestination();
            if (!this.destinationId) { this.hud.showFloatingText('No route available'); return; }
          }
          this.trainMoving = true;
          this.mode = 'TRAVELING';
          const dest = getLocation(this.destinationId!);
          this.hud.showFloatingText(`Departing for ${dest?.name ?? 'destination'}`);
        }
        break;
      case 'BED':
        this.survivalManager.sleep(SLEEP_RESTORE_AMOUNT);
        this.hud.showFloatingText(`+${SLEEP_RESTORE_AMOUNT} Energy`);
        break;
      case 'COOKING_STOVE': {
        const fc = this.inventory.getCount('canned-food');
        if (fc > 0) {
          this.inventory.removeItem('canned-food', 1);
          const amt = Math.floor(EAT_RESTORE_AMOUNT * 1.5);
          this.survivalManager.eat(amt);
          this.hud.showFloatingText(`+${amt} Cooked Meal`);
        } else {
          this.hud.showFloatingText('Need food to cook');
        }
        break;
      }
      case 'STORAGE_CRATE':
        this.survivalManager.eat(EAT_RESTORE_AMOUNT);
        this.hud.showFloatingText(`+${EAT_RESTORE_AMOUNT} Food`);
        break;
      case 'FIRST_AID':
        if (this.inventory.hasItem('medkit', 1)) {
          this.inventory.removeItem('medkit', 1);
          this.survivalManager.heal(50);
          this.hud.showFloatingText('+50 HP');
        } else {
          this.survivalManager.heal(15);
          this.hud.showFloatingText('+15 HP');
        }
        break;
      case 'WORKBENCH':
        if (this.engineHp < 70 && this.inventory.hasItem('scrap-metal', REPAIR_MATERIAL_COST)) {
          this.inventory.removeItem('scrap-metal', REPAIR_MATERIAL_COST);
          this.engineHp = Math.min(100, this.engineHp + REPAIR_AMOUNT);
          this.hud.showFloatingText('Engine repaired!');
        } else if (this.fuel < 80 && this.inventory.hasItem('scrap-metal', 1)) {
          this.inventory.removeItem('scrap-metal', 1);
          this.fuel = Math.min(FUEL_MAX, this.fuel + FUEL_PER_SCRAP);
          this.hud.showFloatingText(`+${FUEL_PER_SCRAP} Fuel`);
        } else {
          this.uiOpen = true;
          showInventory(this.inventory, this.crafting, () => { this.uiOpen = false; });
        }
        break;
      case 'PLANT_BOX':
        if (this.inventory.hasItem('fertilizer', 1)) {
          this.inventory.removeItem('fertilizer', 1);
          this.inventory.addItem('canned-food', 'Produce', 'food', 2, '');
          this.hud.showFloatingText('+2 Produce');
        } else {
          this.hud.showFloatingText('Need fertilizer...');
        }
        break;
      case 'MAP_BOARD':
        this.uiOpen = true;
        showMap(this.currentLocationId, this.destinationId, (destId) => {
          this.setDestination(destId);
        }, () => { this.uiOpen = false; });
        break;
      case 'LIGHT_SWITCH':
        this.interiorLightsOn = !this.interiorLightsOn;
        this.trainRenderer.setInteriorLights(this.interiorLightsOn);
        this.hud.showFloatingText(this.interiorLightsOn ? 'Lights On' : 'Lights Off');
        break;
    }
  }

  // ===== TRAVEL =====

  private setDestination(destId: string): void {
    const route = getRoute(this.currentLocationId, destId);
    if (!route) return;
    this.destinationId = destId;
    this.travelDistance = route.distance;
    this.travelProgress = 0;
    const loc = getLocation(destId);
    this.hud.showFloatingText(`Destination: ${loc?.name ?? destId}`);
  }

  private autoSetDestination(): void {
    const reachable = getReachableLocations(this.currentLocationId);
    if (reachable.length === 0) return;
    // Prefer unvisited, or closest to port-echo
    const dest = reachable.sort((a, b) => {
      const ax = Math.abs(a.x - 900) + Math.abs(a.y - 300);
      const bx = Math.abs(b.x - 900) + Math.abs(b.y - 300);
      return ax - bx;
    })[0];
    this.setDestination(dest.id);
  }

  private updateTravel(dt: number): void {
    if (!this.destinationId || this.travelDistance <= 0) return;
    const speedFactor = this.trainSpeed / TRAIN_SPEED_DEFAULT;
    this.travelProgress += (TRAVEL_SPEED_FACTOR * speedFactor * dt) / this.travelDistance;
    if (this.travelProgress >= 1) {
      this.travelProgress = 1;
      this.arriveAtDestination();
    }
  }

  private arriveAtDestination(): void {
    if (!this.destinationId) return;
    const loc = getLocation(this.destinationId);
    this.currentLocationId = this.destinationId;
    this.destinationId = null;
    this.travelProgress = 0;
    this.travelDistance = 0;
    this.trainMoving = false;
    this.mode = 'STOPPED';
    this.hud.showFloatingText(`Arrived at ${loc?.name ?? 'destination'}`);

    // Auto-set next destination
    this.autoSetDestination();

    if (this.currentLocationId === 'port-echo') {
      this.phase = 'GAMEOVER';
      showVictory(() => this.startNewGame());
    }
  }

  // ===== ZOMBIES =====

  private updateZombies(dt: number, dtMs: number): void {
    const spawnMult = this.timeOfDay === 'NIGHT' ? NIGHT_ZOMBIE_MULTIPLIER : 1;
    const spawnInterval = AMBIENT_ZOMBIE_SPAWN_INTERVAL / spawnMult;

    this.zombieSpawnTimer += dtMs;
    if (this.zombieSpawnTimer > spawnInterval && this.zombies.length < ZOMBIE_MAX_COUNT) {
      this.zombieSpawnTimer = 0;
      this.spawnAmbientZombie();
    }

    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const aggroRange = 15; // bigger aggro range
    const bounds = this.trainRenderer.getBounds();

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (!z.alive) continue;
      const zPos = z.mesh.group.position;

      // Apply velocity with friction
      if (z.velocity.lengthSq() > 0.001) {
        zPos.x += z.velocity.x * dt;
        zPos.y += z.velocity.y * dt;
        zPos.z += z.velocity.z * dt;
        z.velocity.multiplyScalar(Math.max(0, 1 - 4 * dt));
        if (zPos.y > (z.insideTrain ? FLOOR_SURFACE_Y : GROUND_Y)) {
          z.velocity.y -= 12 * dt;
        } else {
          zPos.y = z.insideTrain ? FLOOR_SURFACE_Y : GROUND_Y;
          z.velocity.y = 0;
        }
      } else {
        zPos.y = z.insideTrain ? FLOOR_SURFACE_Y : GROUND_Y;
      }

      const distToPlayer = distance(zPos.x, zPos.z, px, pz);

      if (z.insideTrain && distToPlayer < aggroRange) {
        // Inside train: chase and attack player directly
        const dir = new THREE.Vector3(px - zPos.x, 0, pz - zPos.z).normalize();
        const spd = ZOMBIE_CHASE_SPEED * 0.015 * dt;
        zPos.x += dir.x * spd;
        zPos.z += dir.z * spd;
        z.mesh.group.rotation.y = Math.atan2(dir.x, dir.z);
        animateZombieLurch(z.mesh, dt);

        if (distToPlayer < 1.0) {
          z.attackCooldown -= dtMs;
          if (z.attackCooldown <= 0) {
            z.attackCooldown = ZOMBIE_ATTACK_COOLDOWN_MS;
            this.survival.health = Math.max(0, this.survival.health - ZOMBIE_DAMAGE);
            this.hud.showFloatingText(`-${ZOMBIE_DAMAGE}`);
            animateZombieAttack(z.mesh);
            if (this.survival.health <= 0) this.gameOver();
          }
        }
      } else if (!z.insideTrain) {
        // Outside: head towards the nearest window
        const nearWin = this.trainRenderer.getNearestWindow(zPos.x, zPos.z, 30);
        if (nearWin) {
          const targetX = nearWin.worldX + (nearWin.side === 'left' ? 0.5 : -0.5);
          const targetZ = nearWin.worldZ;
          const dir = new THREE.Vector3(targetX - zPos.x, 0, targetZ - zPos.z);
          const distToWin = dir.length();
          if (distToWin > 0.1) {
            dir.normalize();
            const spd = ZOMBIE_CHASE_SPEED * 0.015 * dt;
            zPos.x += dir.x * spd;
            zPos.z += dir.z * spd;
            z.mesh.group.rotation.y = Math.atan2(dir.x, dir.z);
          }
          animateZombieLurch(z.mesh, dt);

          // If at a window, attack it or crawl through
          if (distToWin < 1.5) {
            if (!nearWin.broken) {
              z.attackCooldown -= dtMs;
              if (z.attackCooldown <= 0) {
                z.attackCooldown = ZOMBIE_ATTACK_COOLDOWN_MS;
                const justBroke = this.trainRenderer.damageWindow(nearWin, ZOMBIE_WINDOW_DAMAGE);
                animateZombieAttack(z.mesh);
                if (justBroke) this.hud.showFloatingText('Window broken!');
              }
              // Zombie at window can damage player if player is near the window (inside)
              if (this.isPlayerNearWindow(nearWin, 1.5)) {
                z.attackCooldown -= dtMs;
                if (z.attackCooldown <= 0) {
                  z.attackCooldown = ZOMBIE_ATTACK_COOLDOWN_MS;
                  this.survival.health = Math.max(0, this.survival.health - ZOMBIE_DAMAGE);
                  this.hud.showFloatingText(`-${ZOMBIE_DAMAGE}`);
                  if (this.survival.health <= 0) this.gameOver();
                }
              }
            } else {
              // Window is broken, crawl through
              z.insideTrain = true;
              z.ambient = false;
              const insideX = nearWin.side === 'left' ? nearWin.worldX - 0.8 : nearWin.worldX + 0.8;
              zPos.set(insideX, FLOOR_SURFACE_Y, nearWin.worldZ);
              animateWindowCrawl(z.mesh);
              this.hud.showFloatingText('Zombie broke in!');
            }
          }
        } else {
          // No window nearby, wander toward train
          const trainCenterZ = this.trainRenderer.getCenter();
          const toTrainX = -zPos.x * 0.3;
          const toTrainZ = (trainCenterZ - zPos.z) * 0.1;
          const wanderSpeed = ZOMBIE_AMBIENT_SPEED * 0.01 * dt;
          zPos.x += toTrainX * wanderSpeed;
          zPos.z += toTrainZ * wanderSpeed;
          animateZombieLurch(z.mesh, dt);
        }

        if (this.trainMoving) {
          zPos.z += this.trainSpeed * 0.02 * dt;
        }
      } else {
        animateWalk(z.mesh, 0, dt);
      }

      if (!z.insideTrain) {
        this.handleZombieTrainCollision(z, dt, bounds);
      }

      if (Math.abs(zPos.z - pz) > 80) {
        this.scene.remove(z.mesh.group);
        this.zombies.splice(i, 1);
      }
    }
  }

  private handleZombieTrainCollision(z: ZombieEntity, dt: number, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
    const zPos = z.mesh.group.position;
    const zx = zPos.x;
    const zz = zPos.z;
    const margin = 0.4;

    const inX = zx > bounds.minX - margin && zx < bounds.maxX + margin;
    const inZ = zz > bounds.minZ - margin && zz < bounds.maxZ + margin;
    if (!inX || !inZ) return;

    const distLeft = zx - (bounds.minX - margin);
    const distRight = (bounds.maxX + margin) - zx;
    const distFront = zz - (bounds.minZ - margin);
    const distBack = (bounds.maxZ + margin) - zz;
    const minDist = Math.min(distLeft, distRight, distFront, distBack);

    if (minDist === distLeft) zPos.x -= 6 * dt;
    else if (minDist === distRight) zPos.x += 6 * dt;
    else if (minDist === distFront) zPos.z -= 6 * dt;
    else zPos.z += 6 * dt;

    if (this.trainMoving) {
      if (minDist === distFront && distFront < 1.5) {
        z.hp -= 40 * dt;
        const side = zx < 0 ? -1 : 1;
        z.velocity.set(side * 8, 3, 4);
        if (z.hp <= 0) this.killZombie(z, new THREE.Vector3(side * 6, 3, 2));
        return;
      }
      if (minDist === distLeft || minDist === distRight) {
        z.hp -= 15 * dt;
        const side = zx < 0 ? -1 : 1;
        z.velocity.set(side * 3, 0.5, this.trainSpeed * 0.03);
        if (z.hp <= 0) this.killZombie(z, new THREE.Vector3(side * 4, 2, 3));
      }
    }

    // Window interactions are now handled in updateZombies main loop
  }

  private spawnAmbientZombie(): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (CAR_WIDTH / 2 + 3 + Math.random() * ZOMBIE_SPAWN_RADIUS);
    const trainCenter = this.trainRenderer.getCenter();
    const z = trainCenter + (Math.random() - 0.5) * ZOMBIE_SPAWN_RADIUS * 2;
    const mesh = createZombie();
    mesh.group.position.set(x, GROUND_Y, z);
    this.scene.add(mesh.group);
    this.zombies.push({
      mesh, alive: true, hp: 50, attackCooldown: ZOMBIE_ATTACK_COOLDOWN_MS,
      ambient: true, velocity: new THREE.Vector3(), insideTrain: false,
    });
  }

  private killZombie(z: ZombieEntity, force: THREE.Vector3): void {
    z.alive = false;
    const parts = createRagdoll(z.mesh, force);
    for (const p of parts) {
      this.scene.add(p.mesh);
      this.ragdollParts.push(p);
    }
    this.scene.remove(z.mesh.group);
    const idx = this.zombies.indexOf(z);
    if (idx >= 0) this.zombies.splice(idx, 1);
  }

  /** Check if the player is near a specific window (from the inside) */
  private isPlayerNearWindow(win: { worldX: number; worldZ: number; side: string }, maxDist: number): boolean {
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const dz = Math.abs(pz - win.worldZ);
    if (dz > maxDist) return false;
    // Player must be on the inside (opposite side of the window from the zombie)
    if (win.side === 'left') {
      return px > win.worldX - maxDist && px < win.worldX;
    } else {
      return px < win.worldX + maxDist && px > win.worldX;
    }
  }

  /** Check if a zombie is at a window (from the outside) */
  private isZombieAtWindow(zPos: THREE.Vector3): { atWindow: boolean; window: import('../rendering/TrainRenderer').WindowState3D | null } {
    const nearWin = this.trainRenderer.getNearestWindow(zPos.x, zPos.z, 2.0);
    if (!nearWin) return { atWindow: false, window: null };
    return { atWindow: true, window: nearWin };
  }

  // ===== RAGDOLL =====

  private updateRagdolls(dt: number): void {
    for (let i = this.ragdollParts.length - 1; i >= 0; i--) {
      const p = this.ragdollParts[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= 15 * dt;
      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.velocity.y *= -0.3;
        p.velocity.x *= 0.8;
        p.velocity.z *= 0.8;
      }
      p.mesh.rotation.x += p.angularVel.x * dt;
      p.mesh.rotation.y += p.angularVel.y * dt;
      p.mesh.rotation.z += p.angularVel.z * dt;
      p.angularVel.multiplyScalar(Math.max(0, 1 - 2 * dt));
      if (p.life < 0.5) p.mesh.scale.multiplyScalar(0.95);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.ragdollParts.splice(i, 1);
      }
    }
  }

  // ===== OCCLUSION =====

  private updateOcclusion(): void {
    // Restore previously occluded meshes
    for (const mesh of this.occludedMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 1.0;
    }
    this.occludedMeshes.clear();

    // Cache occludable meshes
    if (!this.occludableCache) {
      this.occludableCache = this.trainRenderer.getOccludableMeshes();
    }

    // Ray from camera to player
    const camPos = this.camera.position.clone();
    const playerTarget = this.playerPos.clone();
    playerTarget.y += 0.8;
    const dir = new THREE.Vector3().subVectors(playerTarget, camPos).normalize();
    const dist = camPos.distanceTo(playerTarget);

    this.raycaster.set(camPos, dir);
    const intersects = this.raycaster.intersectObjects(this.occludableCache, false);

    for (const hit of intersects) {
      if (hit.distance < dist) {
        const mesh = hit.object as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.transparent) {
          mat.opacity = 0.12;
          this.occludedMeshes.add(mesh);
        }
      }
    }
  }

  // ===== EXPLORATION =====

  private enterExploration(): void {
    this.mode = 'EXPLORING';
    this.explorationActive = true;
    const trainEnd = this.trainRenderer.totalLength;
    this.envRenderer.generateExploration(trainEnd / 2);

    const types = [
      { name: 'Scrap Metal', type: 'material' },
      { name: 'Canned Food', type: 'food' },
      { name: 'Bandage', type: 'medicine' },
      { name: 'Rifle Ammo', type: 'ammo' },
    ];
    for (let i = 0; i < 8; i++) {
      const t = randomChoice(types);
      const side = Math.random() < 0.5 ? -1 : 1;
      const mesh = createPickupMesh(t.type);
      mesh.position.set(side * (4 + Math.random() * 10), GROUND_Y + 0.5, trainEnd / 2 + randomBetween(-8, 8));
      this.scene.add(mesh);
      this.explorationPickups.push({ mesh, type: t.type, name: t.name, collected: false });
    }
    this.playerPos.set(0, GROUND_Y, trainEnd + 2);
    this.hud.showFloatingText('Exploring...');
  }

  private exitExploration(): void {
    this.mode = 'STOPPED';
    this.explorationActive = false;
    this.envRenderer.clearExploration();
    for (const p of this.explorationPickups) {
      if (!p.collected) this.scene.remove(p.mesh);
    }
    this.explorationPickups = [];
    this.playerPos.set(0, FLOOR_SURFACE_Y, this.trainRenderer.totalLength - 2);
    this.hud.showFloatingText('Back on the train');
  }

  // ===== NPCs =====

  private spawnNPC(name: string, x: number, z: number): void {
    const mesh = createNPC();
    mesh.group.position.set(x, FLOOR_SURFACE_Y, z);
    this.scene.add(mesh.group);
    this.npcs.push({ mesh, name, wanderTimer: 0, wanderDir: new THREE.Vector3() });
  }

  private updateNPCs(dt: number): void {
    const bounds = this.trainRenderer.getBounds();
    for (const npc of this.npcs) {
      npc.wanderTimer -= dt * 1000;
      if (npc.wanderTimer <= 0) {
        npc.wanderTimer = randomBetween(2000, 5000);
        npc.wanderDir.set(randomBetween(-1, 1), 0, randomBetween(-1, 1)).normalize();
      }
      const speed = 0.5 * dt;
      npc.mesh.group.position.x = Math.max(bounds.minX + 0.3, Math.min(bounds.maxX - 0.3, npc.mesh.group.position.x + npc.wanderDir.x * speed));
      npc.mesh.group.position.z = Math.max(bounds.minZ + 0.3, Math.min(bounds.maxZ - 0.3, npc.mesh.group.position.z + npc.wanderDir.z * speed));
      npc.mesh.group.position.y = FLOOR_SURFACE_Y;
      if (npc.wanderDir.lengthSq() > 0.01) npc.mesh.group.rotation.y = Math.atan2(npc.wanderDir.x, npc.wanderDir.z);
      animateWalk(npc.mesh, 0.3, dt);
    }
  }

  // ===== DAY/NIGHT =====

  private updateDayNight(dtMs: number): void {
    this.dayTimer += dtMs;
    if (this.dayTimer > DAY_PHASE_DURATION_MS) {
      this.dayTimer = 0;
      const phases: TimeOfDay[] = ['DAWN', 'DAY', 'DUSK', 'NIGHT'];
      const idx = (phases.indexOf(this.timeOfDay) + 1) % phases.length;
      this.timeOfDay = phases[idx];
      this.envRenderer.setSkyPhase(this.timeOfDay);
      this.updateLighting();
      this.hud.showFloatingText(this.timeOfDay);
    }
  }

  private updateLighting(): void {
    switch (this.timeOfDay) {
      case 'DAY':
        this.ambientLight.intensity = 0.8;
        this.directionalLight.intensity = 1.5;
        this.directionalLight.color.setHex(0xfff5e0);
        this.scene.fog = new THREE.FogExp2(0x9aabbf, 0.006);
        break;
      case 'DAWN':
        this.ambientLight.intensity = 0.5;
        this.directionalLight.intensity = 1.0;
        this.directionalLight.color.setHex(0xffbb77);
        this.scene.fog = new THREE.FogExp2(0xaa8866, 0.008);
        break;
      case 'DUSK':
        this.ambientLight.intensity = 0.4;
        this.directionalLight.intensity = 0.8;
        this.directionalLight.color.setHex(0xee7744);
        this.scene.fog = new THREE.FogExp2(0x776655, 0.01);
        break;
      case 'NIGHT':
        this.ambientLight.intensity = 0.2;
        this.directionalLight.intensity = 0.35;
        this.directionalLight.color.setHex(0x5577bb);
        this.scene.fog = new THREE.FogExp2(0x1a2233, 0.015);
        break;
    }
  }

  // ===== CAMERA =====

  private updateCamera(dt: number): void {
    const orbitX = Math.sin(this.cameraOrbitAngle) * this.cameraDistance;
    const orbitZ = -Math.cos(this.cameraOrbitAngle) * this.cameraDistance;
    const orbitHeight = this.cameraHeight * (0.5 + this.cameraOrbitPitch);

    const targetPos = new THREE.Vector3(
      this.playerPos.x + orbitX,
      this.playerPos.y + orbitHeight,
      this.playerPos.z + orbitZ,
    );
    this.camera.position.lerp(targetPos, 3 * dt);

    const lookTarget = new THREE.Vector3(this.playerPos.x, this.playerPos.y + 1, this.playerPos.z);
    this.camera.lookAt(lookTarget);

    this.directionalLight.position.set(this.playerPos.x + 10, 20, this.playerPos.z + 10);
    this.directionalLight.target.position.copy(this.playerPos);
    this.directionalLight.target.updateMatrixWorld();
  }

  // ===== ROOF / LABELS =====

  private updateRoofVisibility(): void {
    const playerCarIndex = this.trainRenderer.getCarIndexAt(this.playerPos.z);
    for (let i = 0; i < this.trainRenderer.cars.length; i++) {
      const car = this.trainRenderer.cars[i];
      const roofMat = car.roofMesh.material as THREE.MeshStandardMaterial;
      roofMat.transparent = true;
      car.roofMesh.castShadow = false;
      roofMat.opacity = i === playerCarIndex ? 0 : 0.25;
    }
    if (this.explorationActive) {
      for (const car of this.trainRenderer.cars) {
        (car.roofMesh.material as THREE.MeshStandardMaterial).opacity = 0.3;
      }
    }
  }

  private updateFloatingLabels(): void {
    const labels: Array<{ text: string; x: number; y: number; dist: number }> = [];
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const maxDist = 7;

    for (const furn of this.trainRenderer.furnitureList) {
      const d = distance(px, pz, furn.worldPos.x, furn.worldPos.z);
      if (d > maxDist) continue;

      // Project to screen
      const worldPos = new THREE.Vector3(furn.worldPos.x, furn.worldPos.y + 1.5, furn.worldPos.z);
      worldPos.project(this.camera);
      const screenX = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-worldPos.y * 0.5 + 0.5) * window.innerHeight;

      // Only show if in front of camera
      if (worldPos.z > 0 && worldPos.z < 1) {
        labels.push({ text: furn.label, x: screenX, y: screenY, dist: d });
      }
    }

    this.hud.updateLabels(labels);
  }

  // ===== TRAIN MAP =====

  private showTrainMap(): void {
    this.uiOpen = true;
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed; top:0; left:0; right:0; bottom:0;
      background:rgba(0,0,0,0.85); z-index:100;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      font-family:'Courier New',monospace; color:#ccc;
    `;

    const title = document.createElement('h2');
    title.textContent = 'TRAIN LAYOUT';
    title.style.cssText = 'color:#8c8; margin-bottom:20px; font-size:20px;';
    overlay.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.width = 700;
    canvas.height = 200;
    canvas.style.cssText = 'border:1px solid #444; border-radius:6px;';
    overlay.appendChild(canvas);

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 700, 200);

    // Draw train schematic
    const carNames = ['ENGINE', 'LIVING', 'STORAGE'];
    const carX = 50;
    const carY = 40;
    const carW = 180;
    const carH = 120;
    const connW = 30;

    for (let i = 0; i < 3; i++) {
      const x = carX + i * (carW + connW);

      // Car body
      ctx.strokeStyle = '#668';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, carY, carW, carH);
      ctx.fillStyle = '#222';
      ctx.fillRect(x + 1, carY + 1, carW - 2, carH - 2);

      // Car name
      ctx.fillStyle = '#8a8';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(carNames[i], x + carW / 2, carY + 18);

      // Furniture inside
      const car = this.trainRenderer.cars[i];
      ctx.font = '10px monospace';
      ctx.fillStyle = '#aab';
      const furns = this.trainRenderer.furnitureList.filter(f =>
        f.worldPos.z >= car.zStart && f.worldPos.z <= car.zEnd,
      );
      furns.forEach((f, fi) => {
        ctx.fillText(f.label, x + carW / 2, carY + 35 + fi * 14);
      });

      // Windows
      ctx.fillStyle = '#335577';
      for (let w = 0; w < 4; w++) {
        const wy = carY + 30 + w * 22;
        ctx.fillRect(x + 2, wy, 6, 10);
        ctx.fillRect(x + carW - 8, wy, 6, 10);
      }

      // Connector
      if (i < 2) {
        ctx.fillStyle = '#333';
        ctx.fillRect(x + carW, carY + 20, connW, carH - 40);
      }
    }

    // Locomotive nose
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(carX, carY);
    ctx.lineTo(carX - 30, carY + carH / 2);
    ctx.lineTo(carX, carY + carH);
    ctx.fill();
    ctx.fillStyle = '#668';
    ctx.font = '9px monospace';
    ctx.fillText('FRONT', carX - 15, carY + carH / 2 + 4);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close [T]';
    closeBtn.style.cssText = 'margin-top:20px; padding:8px 20px; background:#333; color:#ccc; border:1px solid #555; border-radius:4px; font-family:inherit; font-size:14px; cursor:pointer;';
    closeBtn.onclick = () => {
      overlay.remove();
      this.uiOpen = false;
    };
    overlay.appendChild(closeBtn);

    const keyHandler = (e: KeyboardEvent) => {
      if (e.code === 'KeyT' || e.code === 'Escape') {
        overlay.remove();
        this.uiOpen = false;
        window.removeEventListener('keydown', keyHandler);
      }
    };
    window.addEventListener('keydown', keyHandler);

    document.body.appendChild(overlay);
  }

  // ===== HUD =====

  private emitHud(): void {
    const destLoc = this.destinationId ? getLocation(this.destinationId) : null;
    const curLoc = getLocation(this.currentLocationId);
    const data: HudData = {
      health: this.survival.health,
      hunger: this.survival.hunger,
      energy: this.survival.energy,
      mode: this.mode,
      weapon: this.currentWeapon === WeaponType.RIFLE ? 'Rifle' : 'Melee',
      ammo: this.inventory.getAmmo(),
      timeOfDay: this.timeOfDay,
      engineHp: this.engineHp,
      brakeHp: this.brakeHp,
      hasFire: false,
      npcCount: this.npcs.length,
      fuel: this.fuel,
      trainSpeed: this.trainSpeed,
      destination: destLoc?.name ?? null,
      travelProgress: this.travelProgress,
      currentLocation: curLoc?.name ?? 'Unknown',
      currentLocationId: this.currentLocationId,
      destinationId: this.destinationId,
      isSprinting: this.isSprinting,
    };
    EventBus.emit('hud:update', data);
  }

  // ===== GAME OVER =====

  private gameOver(): void {
    if (this.phase === 'GAMEOVER') return; // prevent double trigger
    this.phase = 'GAMEOVER';
    showGameOver("You didn't survive...", () => this.startNewGame());
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
