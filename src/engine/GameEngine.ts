/**
 * Core 3D game engine — sets up Three.js, manages game loop,
 * and orchestrates all game systems.
 */
import * as THREE from 'three';
import { EventBus } from '../utils/EventBus';
import { InputManager3D } from './InputManager3D';
import { AudioEngine } from './AudioEngine';
import { TrainRenderer, CAR_WIDTH, CAR_LENGTH, CONNECTOR_LENGTH, FLOOR_Y } from '../rendering/TrainRenderer';
import { EnvironmentRenderer } from '../rendering/EnvironmentRenderer';
import {
  CharacterMesh, createPlayer, createZombie, createNPC,
  animateWalk, createBullet, createPickupMesh,
} from '../rendering/CharacterRenderer';
import { HudOverlay, HudData } from '../ui/HudOverlay';
import { showMainMenu, showPauseMenu, showGameOver, showInventory, showMap, showVictory } from '../ui/ScreenOverlays';
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
  HUNGER_MAX, ENERGY_MAX,
} from '../data/BalanceConstants';
import { SurvivalState, WeaponType, InventoryItem } from '../types/GameTypes';

type GamePhase = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';
type GameMode = 'TRAVELING' | 'STOPPED' | 'EXPLORING';
type TimeOfDay = 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT';

interface ZombieEntity {
  mesh: CharacterMesh;
  alive: boolean;
  hp: number;
  attackCooldown: number;
  ambient: boolean; // ambient = scrolls with environment
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
  // Three.js core
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  // Lights
  private ambientLight!: THREE.AmbientLight;
  private directionalLight!: THREE.DirectionalLight;

  // Renderers
  private trainRenderer!: TrainRenderer;
  private envRenderer!: EnvironmentRenderer;

  // Player
  private playerMesh!: CharacterMesh;
  private playerPos = new THREE.Vector3(0, FLOOR_Y, 6);
  private playerFacing = new THREE.Vector3(0, 0, 1);
  private playerSpeedMult = 1.0;

  // Game state
  private phase: GamePhase = 'MENU';
  private mode: GameMode = 'STOPPED';
  private survival!: SurvivalState;
  private survivalManager!: SurvivalManager;
  private inventory!: InventoryManager;
  private crafting!: CraftingManager;

  // Train state
  private trainMoving = false;
  private trainSpeed = TRAIN_SPEED_DEFAULT;
  private fuel = FUEL_MAX;
  private headlightsOn = false;
  private interiorLightsOn = true;

  // Maintenance
  private engineHp = 100;
  private brakeHp = 100;

  // Travel
  private currentLocationId = 'riverside';
  private destinationId: string | null = null;
  private travelProgress = 0;
  private travelDistance = 0;

  // Day/night
  private timeOfDay: TimeOfDay = 'DAY';
  private dayTimer = 0;

  // Combat
  private currentWeapon: WeaponType = WeaponType.RIFLE;
  private lastFireTime = 0;
  private lastMeleeTime = 0;
  private bullets: Bullet[] = [];

  // Zombies
  private zombies: ZombieEntity[] = [];
  private zombieSpawnTimer = 0;

  // NPCs
  private npcs: NPCEntity[] = [];

  // Exploration
  private explorationActive = false;
  private explorationPickups: { mesh: THREE.Mesh; type: string; name: string; collected: boolean }[] = [];

  // Input & audio
  private input!: InputManager3D;
  private audio!: AudioEngine;
  private hud!: HudOverlay;

  // Raycasting for mouse aim
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y - 0.5);

  // UI state
  private uiOpen = false;

  constructor() {}

  public async init(): Promise<void> {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x1a1a2e);

    const container = document.getElementById('game-container')!;
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x8899aa, 0.008);

    // Camera — third person, slightly elevated
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 12, -4);
    this.camera.lookAt(0, FLOOR_Y, 10);

    // Lights
    this.ambientLight = new THREE.AmbientLight(0x667788, 0.6);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    this.directionalLight.position.set(10, 20, 10);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 60;
    this.directionalLight.shadow.camera.left = -20;
    this.directionalLight.shadow.camera.right = 20;
    this.directionalLight.shadow.camera.top = 20;
    this.directionalLight.shadow.camera.bottom = -20;
    this.scene.add(this.directionalLight);

    // Environment
    this.envRenderer = new EnvironmentRenderer();
    this.envRenderer.create();
    this.scene.add(this.envRenderer.group);

    // Train
    this.trainRenderer = new TrainRenderer();
    this.trainRenderer.create();
    this.scene.add(this.trainRenderer.group);

    // Player
    this.playerMesh = createPlayer();
    this.playerPos.set(0, FLOOR_Y, CAR_LENGTH / 2);
    this.playerMesh.group.position.copy(this.playerPos);
    this.scene.add(this.playerMesh.group);

    // Input
    this.input = new InputManager3D(this.renderer.domElement);

    // Audio
    this.audio = new AudioEngine();
    this.audio.create();

    // HUD
    this.hud = new HudOverlay();
    this.hud.create();

    // NPC — Sarah starts in living car
    this.spawnNPC('Sarah', 0, CAR_LENGTH + CONNECTOR_LENGTH + CAR_LENGTH / 2);

    // Resize handler
    window.addEventListener('resize', () => this.onResize());

    // Event listeners
    EventBus.on('survival:death', () => this.gameOver());
    EventBus.on('inventory:use-food', () => {
      this.survivalManager.eat(EAT_RESTORE_AMOUNT);
      this.hud.showFloatingText(`+${EAT_RESTORE_AMOUNT} Food`);
    });
    EventBus.on('inventory:use-medicine', () => {
      this.survivalManager.heal(25);
      this.hud.showFloatingText('+25 Health');
    });

    // Show main menu
    this.showMenu();
  }

  private showMenu(): void {
    this.phase = 'MENU';
    showMainMenu(
      () => this.startNewGame(),
    );
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
    this.destinationId = null;
    this.travelProgress = 0;
    this.timeOfDay = 'DAY';
    this.dayTimer = 0;
    this.currentWeapon = WeaponType.RIFLE;
    this.explorationActive = false;

    // Survival
    this.survival = { hunger: HUNGER_MAX, energy: ENERGY_MAX, health: PLAYER_MAX_HP };
    this.survivalManager = new SurvivalManager(this.survival);

    // Inventory
    this.inventory = new InventoryManager();
    this.inventory.create();

    // Crafting
    this.crafting = new CraftingManager();
    this.crafting.create();

    // Reset player pos
    this.playerPos.set(0, FLOOR_Y, CAR_LENGTH / 2);

    this.audio.resume();
    this.hud.showFloatingText('Riverside Station — Set a destination on the map [M]');

    // Start game loop
    if (!this.clock.running) {
      this.clock.start();
      this.animate();
    }
  }

  // ===========================================
  // GAME LOOP
  // ===========================================

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.05); // cap dt
    const dtMs = dt * 1000;

    this.input.update();

    if (this.phase === 'PLAYING' && !this.uiOpen) {
      this.updateGame(dt, dtMs);
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private updateGame(dt: number, dtMs: number): void {
    const inp = this.input.state;

    // Pause
    if (inp.pause) {
      this.phase = 'PAUSED';
      showPauseMenu(() => { this.phase = 'PLAYING'; });
      return;
    }

    // Inventory
    if (inp.openInventory) {
      this.uiOpen = true;
      showInventory(this.inventory, this.crafting, () => { this.uiOpen = false; });
      return;
    }

    // Map
    if (inp.openMap) {
      this.uiOpen = true;
      showMap(this.currentLocationId, this.destinationId, (destId) => {
        this.setDestination(destId);
      }, () => { this.uiOpen = false; });
      return;
    }

    // Weapon switch
    if (inp.switchWeapon) {
      this.currentWeapon = this.currentWeapon === WeaponType.RIFLE ? WeaponType.MELEE : WeaponType.RIFLE;
      this.hud.showFloatingText(this.currentWeapon === WeaponType.RIFLE ? 'Rifle' : 'Melee');
    }

    // Speed control
    if (inp.speedUp) {
      this.trainSpeed = Math.min(TRAIN_SPEED_MAX, this.trainSpeed + TRAIN_SPEED_STEP);
      this.hud.showFloatingText(`Speed: ${this.trainSpeed}`);
    }
    if (inp.speedDown) {
      this.trainSpeed = Math.max(TRAIN_SPEED_MIN, this.trainSpeed - TRAIN_SPEED_STEP);
      this.hud.showFloatingText(`Speed: ${this.trainSpeed}`);
    }

    // Survival
    this.survivalManager.update(dtMs);
    this.playerSpeedMult = this.survivalManager.getSpeedMultiplier();

    // Player movement
    this.updatePlayer(dt, inp);

    // Mouse attack
    if (inp.mouseJustPressed) this.handleMouseAttack();
    if (inp.attack) this.handleAttack();

    // Bullets
    this.updateBullets(dt);

    // Interactions
    this.handleInteractions(inp);

    // Train fuel
    if (this.trainMoving) {
      const fuelUse = FUEL_CONSUMPTION_PER_SEC * (this.trainSpeed / TRAIN_SPEED_DEFAULT) * dt;
      this.fuel = Math.max(0, this.fuel - fuelUse);
      if (this.fuel <= 0) {
        this.trainMoving = false;
        this.mode = 'STOPPED';
        this.hud.showFloatingText('OUT OF FUEL!');
      }
    }

    // Travel progress
    if (this.trainMoving && this.destinationId) {
      this.updateTravel(dt);
    }

    // Environment scrolling
    if (this.trainMoving) {
      this.envRenderer.scrollEnvironment(this.trainSpeed * 0.02 * dt);
    }

    // Maintenance degradation
    if (this.trainMoving) {
      this.engineHp = Math.max(0, this.engineHp - ENGINE_DEGRADE_PER_SEC * dt);
      this.brakeHp = Math.max(0, this.brakeHp - BRAKE_DEGRADE_PER_SEC * dt);
      if (this.engineHp < MAINTENANCE_WARNING_THRESHOLD) {
        this.hud.showFloatingText('Engine needs repair!');
      }
    }

    // Zombies
    this.updateZombies(dt, dtMs);

    // NPCs
    this.updateNPCs(dt);

    // Day/night
    this.updateDayNight(dtMs);

    // Connector restriction
    if (this.trainMoving && this.trainRenderer.isInConnector(this.playerPos.x, this.playerPos.z)) {
      // Push toward center x
      this.playerPos.x *= 0.9;
    }

    // Emit HUD
    this.emitHud();
  }

  // ===========================================
  // PLAYER
  // ===========================================

  private updatePlayer(dt: number, inp: InputManager3D['state']): void {
    const speed = PLAYER_SPEED * this.playerSpeedMult * dt * 0.02; // scale for 3D units
    let dx = inp.moveX * speed;
    let dz = inp.moveZ * speed;

    // Normalize diagonal
    if (dx !== 0 && dz !== 0) {
      const mag = Math.sqrt(dx * dx + dz * dz);
      dx = (dx / mag) * speed;
      dz = (dz / mag) * speed;
    }

    const newX = this.playerPos.x + dx;
    const newZ = this.playerPos.z + dz;

    // Clamp to train interior (when not exploring)
    const bounds = this.trainRenderer.getBounds();
    const padding = 0.3;
    if (!this.explorationActive) {
      this.playerPos.x = Math.max(bounds.minX + padding, Math.min(bounds.maxX - padding, newX));
      this.playerPos.z = Math.max(bounds.minZ + padding, Math.min(bounds.maxZ - padding, newZ));
    } else {
      // Wider bounds for exploration
      this.playerPos.x = Math.max(-30, Math.min(30, newX));
      this.playerPos.z = Math.max(bounds.minZ - 20, Math.min(bounds.maxZ + 30, newZ));
    }

    // Update facing
    if (dx !== 0 || dz !== 0) {
      this.playerFacing.set(dx, 0, dz).normalize();
      this.playerMesh.group.rotation.y = Math.atan2(dx, dz);
    }

    this.playerMesh.group.position.copy(this.playerPos);
    const moveSpeed = Math.abs(dx) + Math.abs(dz);
    animateWalk(this.playerMesh, moveSpeed * 20, dt);
  }

  // ===========================================
  // COMBAT
  // ===========================================

  private handleAttack(): void {
    const now = performance.now();
    if (this.currentWeapon === WeaponType.RIFLE) {
      if (now - this.lastFireTime < RIFLE_FIRE_RATE_MS) return;
      if (!this.inventory.useAmmo()) {
        this.hud.showFloatingText('No ammo!');
        return;
      }
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
    // Raycast to ground plane to find aim direction
    const mouse = new THREE.Vector2(
      (this.input.state.mouseX / window.innerWidth) * 2 - 1,
      -(this.input.state.mouseY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(mouse, this.camera);
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, target);

    if (target) {
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
  }

  private fireRifle(dir: THREE.Vector3): void {
    const bulletMesh = createBullet();
    bulletMesh.position.copy(this.playerPos).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(bulletMesh);
    this.bullets.push({
      mesh: bulletMesh,
      dir: dir.clone(),
      speed: BULLET_SPEED * 0.03,
      life: 2000,
      damage: RIFLE_DAMAGE,
    });
  }

  private meleeAttack(): void {
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const range = MELEE_RANGE * 0.03;

    for (const z of this.zombies) {
      if (!z.alive) continue;
      const dist = distance(px, pz, z.mesh.group.position.x, z.mesh.group.position.z);
      if (dist < range) {
        z.hp -= MELEE_DAMAGE;
        this.hud.showFloatingText(`-${MELEE_DAMAGE}`);
        if (z.hp <= 0) this.killZombie(z);
        this.audio.playHit();
      }
    }
  }

  private updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.mesh.position.addScaledVector(b.dir, b.speed * dt * 60);
      b.life -= dt * 1000;

      // Check hits
      let hit = false;
      for (const z of this.zombies) {
        if (!z.alive) continue;
        const dist = b.mesh.position.distanceTo(z.mesh.group.position);
        if (dist < 0.5) {
          z.hp -= b.damage;
          this.hud.showFloatingText(`-${b.damage}`);
          if (z.hp <= 0) this.killZombie(z);
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

  // ===========================================
  // INTERACTIONS
  // ===========================================

  private handleInteractions(inp: InputManager3D['state']): void {
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const interactRange = PLAYER_INTERACT_RANGE * 0.03; // scale for 3D
    let prompted = false;

    // Check exit/enter train (when stopped, near end of storage car)
    const storageDoorZ = (CAR_LENGTH + CONNECTOR_LENGTH) * 2 + CAR_LENGTH; // end of last car
    if (this.mode === 'STOPPED' && !this.explorationActive) {
      const distToDoor = distance(px, pz, 0, storageDoorZ);
      if (distToDoor < EXIT_TRAIN_RANGE * 0.04) {
        this.hud.showInteractPrompt('[E] Exit Train');
        prompted = true;
        if (inp.interact) {
          this.enterExploration();
          return;
        }
      }
    }

    // Return to train
    if (this.explorationActive) {
      const distToDoor = distance(px, pz, 0, storageDoorZ);
      if (distToDoor < EXIT_TRAIN_RANGE * 0.06) {
        this.hud.showInteractPrompt('[E] Return to Train');
        prompted = true;
        if (inp.interact) {
          this.exitExploration();
          return;
        }
      }
    }

    // Exploration pickups
    if (this.explorationActive) {
      for (const pickup of this.explorationPickups) {
        if (pickup.collected) continue;
        const d = distance(px, pz, pickup.mesh.position.x, pickup.mesh.position.z);
        if (d < interactRange) {
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

    // NPC interaction
    for (const npc of this.npcs) {
      const d = distance(px, pz, npc.mesh.group.position.x, npc.mesh.group.position.z);
      if (d < interactRange * 1.5) {
        this.hud.showInteractPrompt(`[E] Talk to ${npc.name}`);
        prompted = true;
        if (inp.interact) {
          const dialogues = [
            'Stay safe out there...', 'Need any supplies?',
            'The coast is our only hope.', 'Keep the engine running.',
            'I heard Port Echo still has boats.', 'Watch the fuel gauge.',
          ];
          this.hud.showFloatingText(randomChoice(dialogues));
        }
        break;
      }
    }

    // Furniture interaction
    for (const furn of this.trainRenderer.furnitureList) {
      const d = distance(px, pz, furn.worldPos.x, furn.worldPos.z);
      if (d < interactRange) {
        const prompt = this.getFurniturePrompt(furn.type);
        this.hud.showInteractPrompt(`[E] ${prompt}`);
        prompted = true;
        if (inp.interact) {
          this.executeFurnitureAction(furn.type);
        }
        break;
      }
    }

    if (!prompted) this.hud.hideInteractPrompt();
  }

  private getFurniturePrompt(type: string): string {
    switch (type) {
      case 'BRAKE_PANEL': return this.trainMoving ? `Stop Train | Speed: ${this.trainSpeed} | Fuel: ${Math.floor(this.fuel)}%` : 'Start Train';
      case 'WORKBENCH': return 'Repair / Refuel';
      case 'MAP_BOARD': return 'View Map';
      case 'LIGHT_SWITCH': return 'Toggle Lights';
      case 'BED': return 'Sleep';
      case 'COOKING_STOVE': return `Cook (Food: ${this.inventory.getCount('canned-food')})`;
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
          if (this.fuel <= 0) { this.hud.showFloatingText('No fuel! Add scrap at workbench'); return; }
          if (!this.destinationId) { this.hud.showFloatingText('Set a destination on map [M]'); return; }
          this.trainMoving = true;
          this.mode = 'TRAVELING';
          this.hud.showFloatingText('Train Moving');
        }
        break;

      case 'BED':
        this.survivalManager.sleep(SLEEP_RESTORE_AMOUNT);
        this.hud.showFloatingText(`+${SLEEP_RESTORE_AMOUNT} Energy`);
        break;

      case 'COOKING_STOVE': {
        const foodCount = this.inventory.getCount('canned-food');
        if (foodCount > 0) {
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
          this.hud.showFloatingText('+50 Health (Medkit)');
        } else if (this.inventory.hasItem('bandage', 1)) {
          this.inventory.removeItem('bandage', 1);
          this.survivalManager.heal(25);
          this.hud.showFloatingText('+25 Health');
        } else {
          this.survivalManager.heal(15);
          this.hud.showFloatingText('+15 Health');
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
          this.inventory.addItem('canned-food', 'Fresh Produce', 'food', 2, '');
          this.hud.showFloatingText('+2 Fresh Produce');
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
        this.hud.showFloatingText(this.interiorLightsOn ? 'Lights On' : 'Lights Off');
        this.updateInteriorLighting();
        break;
    }
  }

  // ===========================================
  // TRAVEL
  // ===========================================

  private setDestination(destId: string): void {
    const route = getRoute(this.currentLocationId, destId);
    if (!route) return;
    this.destinationId = destId;
    this.travelDistance = route.distance;
    this.travelProgress = 0;
    const loc = getLocation(destId);
    this.hud.showFloatingText(`Destination: ${loc?.name ?? destId}`);
  }

  private updateTravel(dt: number): void {
    if (!this.destinationId || this.travelDistance <= 0) return;
    const speedFactor = this.trainSpeed / TRAIN_SPEED_DEFAULT;
    const kmPerSec = TRAVEL_SPEED_FACTOR * speedFactor;
    this.travelProgress += (kmPerSec * dt) / this.travelDistance;

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

    if (this.currentLocationId === 'port-echo') {
      this.phase = 'GAMEOVER';
      showVictory(() => this.startNewGame());
    }
  }

  // ===========================================
  // ZOMBIES
  // ===========================================

  private updateZombies(dt: number, dtMs: number): void {
    const spawnMult = this.timeOfDay === 'NIGHT' ? NIGHT_ZOMBIE_MULTIPLIER : 1;
    const spawnInterval = AMBIENT_ZOMBIE_SPAWN_INTERVAL / spawnMult;

    this.zombieSpawnTimer += dtMs;
    if (this.zombieSpawnTimer > spawnInterval && this.zombies.length < 15) {
      this.zombieSpawnTimer = 0;
      this.spawnAmbientZombie();
    }

    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const aggroRange = ZOMBIE_AGGRO_RANGE * 0.03;
    const bounds = this.trainRenderer.getBounds();

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (!z.alive) continue;

      const zx = z.mesh.group.position.x;
      const zz = z.mesh.group.position.z;

      // Move toward player if in range
      const distToPlayer = distance(zx, zz, px, pz);
      if (distToPlayer < aggroRange) {
        const dir = new THREE.Vector3(px - zx, 0, pz - zz).normalize();
        const speed = ZOMBIE_CHASE_SPEED * 0.015 * dt;
        z.mesh.group.position.x += dir.x * speed;
        z.mesh.group.position.z += dir.z * speed;
        z.mesh.group.rotation.y = Math.atan2(dir.x, dir.z);
        animateWalk(z.mesh, 1, dt);

        // Attack player
        if (distToPlayer < 1.0) {
          z.attackCooldown -= dtMs;
          if (z.attackCooldown <= 0) {
            z.attackCooldown = ZOMBIE_ATTACK_COOLDOWN_MS;
            this.survival.health = Math.max(0, this.survival.health - ZOMBIE_DAMAGE);
            this.hud.showFloatingText(`-${ZOMBIE_DAMAGE}`);
            if (this.survival.health <= 0) this.gameOver();
          }
        }
      } else if (z.ambient) {
        // Ambient drift
        if (this.trainMoving) {
          z.mesh.group.position.z += this.trainSpeed * 0.02 * dt;
        }
        animateWalk(z.mesh, 0.3, dt);
      }

      // Prevent clipping into train
      if (zx > bounds.minX - 0.5 && zx < bounds.maxX + 0.5 &&
          zz > bounds.minZ && zz < bounds.maxZ) {
        if (zx < 0) z.mesh.group.position.x = bounds.minX - 0.8;
        else z.mesh.group.position.x = bounds.maxX + 0.8;
      }

      // Remove if too far
      if (Math.abs(zz - pz) > 40) {
        this.scene.remove(z.mesh.group);
        this.zombies.splice(i, 1);
      }
    }
  }

  private spawnAmbientZombie(): void {
    const bounds = this.trainRenderer.getBounds();
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (CAR_WIDTH / 2 + 2 + Math.random() * 5);
    const z = this.playerPos.z - 15 - Math.random() * 10;

    const mesh = createZombie();
    mesh.group.position.set(x, FLOOR_Y, z);
    this.scene.add(mesh.group);
    this.zombies.push({
      mesh, alive: true, hp: 50, attackCooldown: ZOMBIE_ATTACK_COOLDOWN_MS, ambient: true,
    });
  }

  private killZombie(z: ZombieEntity): void {
    z.alive = false;
    // Simple death: scale down and remove after delay
    z.mesh.group.scale.y = 0.2;
    z.mesh.group.position.y = FLOOR_Y - 0.2;
    setTimeout(() => {
      this.scene.remove(z.mesh.group);
      const idx = this.zombies.indexOf(z);
      if (idx >= 0) this.zombies.splice(idx, 1);
    }, 1500);
  }

  // ===========================================
  // EXPLORATION
  // ===========================================

  private enterExploration(): void {
    this.mode = 'EXPLORING';
    this.explorationActive = true;

    // Generate buildings + pickups
    const trainEnd = this.trainRenderer.totalLength;
    this.envRenderer.generateExploration(trainEnd / 2);

    // Spawn pickups
    const types: Array<{ name: string; type: string }> = [
      { name: 'Scrap Metal', type: 'material' },
      { name: 'Canned Food', type: 'food' },
      { name: 'Bandage', type: 'medicine' },
      { name: 'Rifle Ammo', type: 'ammo' },
    ];
    for (let i = 0; i < 8; i++) {
      const t = randomChoice(types);
      const side = Math.random() < 0.5 ? -1 : 1;
      const mesh = createPickupMesh(t.type);
      mesh.position.set(side * (4 + Math.random() * 10), FLOOR_Y + 0.5, trainEnd / 2 + randomBetween(-8, 8));
      this.scene.add(mesh);
      this.explorationPickups.push({ mesh, type: t.type, name: t.name, collected: false });
    }

    // Move player outside
    this.playerPos.set(0, FLOOR_Y, trainEnd + 2);
    this.hud.showFloatingText('Exploring...');
  }

  private exitExploration(): void {
    this.mode = 'STOPPED';
    this.explorationActive = false;
    this.envRenderer.clearExploration();

    // Remove remaining pickups
    for (const p of this.explorationPickups) {
      if (!p.collected) this.scene.remove(p.mesh);
    }
    this.explorationPickups = [];

    // Move player back inside
    this.playerPos.set(0, FLOOR_Y, this.trainRenderer.totalLength - 2);
    this.hud.showFloatingText('Back on the train');
  }

  // ===========================================
  // NPCs
  // ===========================================

  private spawnNPC(name: string, x: number, z: number): void {
    const mesh = createNPC();
    mesh.group.position.set(x, FLOOR_Y, z);
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
      const nx = npc.mesh.group.position.x + npc.wanderDir.x * speed;
      const nz = npc.mesh.group.position.z + npc.wanderDir.z * speed;

      // Keep inside train
      npc.mesh.group.position.x = Math.max(bounds.minX + 0.3, Math.min(bounds.maxX - 0.3, nx));
      npc.mesh.group.position.z = Math.max(bounds.minZ + 0.3, Math.min(bounds.maxZ - 0.3, nz));

      if (npc.wanderDir.lengthSq() > 0.01) {
        npc.mesh.group.rotation.y = Math.atan2(npc.wanderDir.x, npc.wanderDir.z);
      }
      animateWalk(npc.mesh, 0.3, dt);
    }
  }

  // ===========================================
  // DAY/NIGHT
  // ===========================================

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
        this.ambientLight.intensity = 0.6;
        this.directionalLight.intensity = 1.2;
        this.directionalLight.color.setHex(0xffeedd);
        this.scene.fog = new THREE.FogExp2(0x8899aa, 0.008);
        break;
      case 'DAWN':
        this.ambientLight.intensity = 0.4;
        this.directionalLight.intensity = 0.8;
        this.directionalLight.color.setHex(0xddaa66);
        this.scene.fog = new THREE.FogExp2(0x887766, 0.01);
        break;
      case 'DUSK':
        this.ambientLight.intensity = 0.35;
        this.directionalLight.intensity = 0.7;
        this.directionalLight.color.setHex(0xcc6644);
        this.scene.fog = new THREE.FogExp2(0x665544, 0.012);
        break;
      case 'NIGHT':
        this.ambientLight.intensity = 0.15;
        this.directionalLight.intensity = 0.3;
        this.directionalLight.color.setHex(0x4466aa);
        this.scene.fog = new THREE.FogExp2(0x112233, 0.02);
        break;
    }
  }

  private updateInteriorLighting(): void {
    for (const car of this.trainRenderer.cars) {
      const alpha = this.interiorLightsOn ? 1.0 : 0.3;
      car.interiorGroup.visible = this.interiorLightsOn;
    }
  }

  // ===========================================
  // CAMERA
  // ===========================================

  private updateCamera(dt: number): void {
    // Third-person follow camera
    const targetPos = new THREE.Vector3(
      this.playerPos.x * 0.3,
      this.playerPos.y + 10,
      this.playerPos.z - 6,
    );
    this.camera.position.lerp(targetPos, 3 * dt);
    const lookTarget = new THREE.Vector3(this.playerPos.x, this.playerPos.y + 1, this.playerPos.z + 4);
    this.camera.lookAt(lookTarget);

    // Shadow light follows player
    this.directionalLight.position.set(
      this.playerPos.x + 10,
      20,
      this.playerPos.z + 10,
    );
    this.directionalLight.target.position.copy(this.playerPos);
    this.directionalLight.target.updateMatrixWorld();
  }

  // ===========================================
  // HUD
  // ===========================================

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
    };
    EventBus.emit('hud:update', data);
  }

  // ===========================================
  // GAME OVER
  // ===========================================

  private gameOver(): void {
    this.phase = 'GAMEOVER';
    showGameOver("You didn't survive...", () => this.startNewGame());
  }

  // ===========================================
  // UTILITY
  // ===========================================

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
