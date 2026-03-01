import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameState, GameMode, Direction, WeaponType } from '../types/GameTypes';
import { FurnitureType, PlacedFurniture, WindowState, DoorState } from '../types/TrainTypes';
import { InputManager } from '../systems/InputManager';
import { SurvivalManager } from '../systems/SurvivalManager';
import { EnvironmentManager } from '../systems/EnvironmentManager';
import { CameraManager } from '../systems/CameraManager';
import { InventoryManager } from '../systems/InventoryManager';
import { CombatManager } from '../systems/CombatManager';
import { CraftingManager } from '../systems/CraftingManager';
import { ExplorationManager } from '../systems/ExplorationManager';
import { TrainEventManager } from '../systems/TrainEventManager';
import { NPCManager } from '../systems/NPCManager';
import { DayNightManager } from '../systems/DayNightManager';
import { AudioManager } from '../systems/AudioManager';
import { SaveManager } from '../systems/SaveManager';
import { Train } from '../train/Train';
import { Player } from '../entities/Player';
import { Survivor } from '../entities/npcs/Survivor';
import { Zombie } from '../entities/zombies/Zombie';
import { HudUpdateData } from './HudScene';
import {
  getLocation,
  getRoute,
  getReachableLocations,
  MapLocation,
} from '../data/LocationData';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_INTERACT_RANGE,
  AMBIENT_ZOMBIE_SPAWN_INTERVAL,
  CAR_PIXEL_WIDTH,
  TRAIN_SCROLL_SPEED,
  EAT_RESTORE_AMOUNT,
  SLEEP_RESTORE_AMOUNT,
  EXIT_TRAIN_RANGE,
  MELEE_RANGE,
  MELEE_DAMAGE,
  FUEL_PER_SCRAP,
  TRAVEL_SPEED_FACTOR,
  TRAIN_SPEED_DEFAULT,
  TRAIN_SPEED_STEP,
  TRAIN_SPEED_MIN,
  TRAIN_SPEED_MAX,
  TILE_SIZE,
} from '../data/BalanceConstants';

/**
 * GameScene – core gameplay for the survival train game.
 */
export class GameScene extends Phaser.Scene {
  // State
  private gameState: GameState = GameState.PLAYING;
  private gameMode: GameMode = GameMode.TRAVELING;

  // Core systems
  private inputManager!: InputManager;
  private survivalManager!: SurvivalManager;
  private environmentManager!: EnvironmentManager;
  private cameraManager!: CameraManager;
  private inventoryManager!: InventoryManager;
  private combatManager!: CombatManager;
  private craftingManager!: CraftingManager;
  private explorationManager!: ExplorationManager;
  private trainEventManager!: TrainEventManager;
  private npcManager!: NPCManager;
  private dayNightManager!: DayNightManager;
  private audioManager!: AudioManager;
  private saveManager!: SaveManager;

  // Core objects
  private train!: Train;
  private player!: Player;

  // Zombies (ambient)
  private zombies: Zombie[] = [];
  private zombieSpawnTimer: number = 0;

  // Interaction UI
  private interactPromptText!: Phaser.GameObjects.Text;
  private speechBubble!: Phaser.GameObjects.Container;
  private speechText!: Phaser.GameObjects.Text;
  private speechTimer: number = 0;

  // Pause tracking
  private escWasDown: boolean = false;

  // Exploration colliders
  private explorationColliders: Phaser.Physics.Arcade.Collider[] = [];

  // Map/destination system
  private currentLocationId: string = 'riverside';
  private destinationId: string | null = null;
  private travelProgress: number = 0; // 0-1
  private travelDistance: number = 0; // total km for current route

  constructor() {
    super({ key: 'GameScene' });
  }

  init(): void {
    this.gameState = GameState.PLAYING;
    this.gameMode = GameMode.TRAVELING;
    this.zombies = [];
    this.zombieSpawnTimer = 0;
    this.speechTimer = 0;
    this.explorationColliders = [];
    this.travelProgress = 0;
  }

  create(): void {
    // ---- Environment ----
    this.environmentManager = new EnvironmentManager();
    const trainX = Math.floor((GAME_WIDTH - CAR_PIXEL_WIDTH) / 2);
    this.environmentManager.create(this, trainX);

    // ---- Train ----
    this.train = new Train();
    this.train.create(this);
    this.train.setDepths(1, 2, 8, 15);

    // ---- Player ----
    const spawnPt = this.train.getPlayerSpawnPoint();
    this.player = new Player(this, spawnPt.x, spawnPt.y);

    // ---- Inventory ----
    this.inventoryManager = new InventoryManager();
    this.inventoryManager.create();

    // ---- Crafting ----
    this.craftingManager = new CraftingManager();
    this.craftingManager.create();

    // ---- Combat ----
    this.combatManager = new CombatManager();
    this.combatManager.create(this, this.inventoryManager);

    // ---- Exploration ----
    this.explorationManager = new ExplorationManager();
    this.explorationManager.create(this);

    // ---- NPC Manager ----
    this.npcManager = new NPCManager();
    this.npcManager.create(this, this.train);

    // Create initial NPC (Sarah)
    const npcPt = this.train.getNPCSpawnPoint();
    const sarah = new Survivor(this, npcPt.x, npcPt.y, 'Sarah');
    const livingCar = this.train.getCar(1);
    if (livingCar) {
      const b = livingCar.getInteriorBounds();
      sarah.setWanderBounds(b.x, b.y, b.w, b.h);
    }
    this.npcManager.addInitialNPC(sarah);

    // ---- Train Events ----
    this.trainEventManager = new TrainEventManager();
    this.trainEventManager.create(this, this.train);

    // ---- Day/Night ----
    this.dayNightManager = new DayNightManager();
    this.dayNightManager.create(this);

    // ---- Audio ----
    this.audioManager = new AudioManager();
    this.audioManager.create(this);

    // ---- Save ----
    this.saveManager = new SaveManager();

    // ---- Collisions ----
    for (const wallGroup of this.train.getAllWallBodies()) {
      this.physics.add.collider(this.player, wallGroup);
    }
    for (const furnGroup of this.train.getAllFurnitureBodies()) {
      this.physics.add.collider(this.player, furnGroup);
    }
    this.npcManager.addCollisions(
      this.train.getAllWallBodies(),
      this.train.getAllFurnitureBodies(),
    );

    // ---- Input ----
    this.inputManager = new InputManager(this);
    this.inputManager.init();

    // ---- Survival ----
    this.survivalManager = new SurvivalManager(this.player.survival);

    // ---- Camera ----
    this.cameraManager = new CameraManager();
    this.cameraManager.create(this, this.player, this.train.getWorldBounds());

    // ---- UI elements ----
    this.interactPromptText = this.add.text(0, 0, '', {
      fontSize: '11px', fontFamily: 'monospace', color: '#ffffff',
      backgroundColor: '#00000088', padding: { x: 6, y: 3 },
    });
    this.interactPromptText.setDepth(25).setVisible(false);

    this.speechBubble = this.add.container(0, 0).setDepth(25).setVisible(false);
    const bubbleBg = this.add.image(0, 0, 'speech-bubble').setScale(2, 1.5);
    this.speechText = this.add.text(0, -4, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#333333',
      wordWrap: { width: 80 }, align: 'center',
    }).setOrigin(0.5);
    this.speechBubble.add([bubbleBg, this.speechText]);

    // ---- HUD ----
    this.scene.launch('HudScene');

    // ---- Events ----
    EventBus.on('survival:death', () => this.gameOver());
    EventBus.on('inventory:use-food', () => {
      this.survivalManager.eat(EAT_RESTORE_AMOUNT);
      this.showFloatingText(this.player.x, this.player.y - 20, `+${EAT_RESTORE_AMOUNT} Food`);
    });
    EventBus.on('inventory:use-medicine', () => {
      this.survivalManager.heal(25);
      this.showFloatingText(this.player.x, this.player.y - 20, '+25 Health');
    });
    EventBus.on('maintenance:warning', (comp: { name: string }) => {
      this.showFloatingText(this.player.x, this.player.y - 30, `${comp.name} needs repair!`);
    });
    EventBus.on('maintenance:engine-failure', () => {
      this.gameMode = GameMode.STOPPED;
      this.showFloatingText(this.player.x, this.player.y - 30, 'ENGINE FAILURE!');
      this.cameraManager.shake(500, 0.01);
    });
    EventBus.on('breach:zombies-entered', (data: { carIndex: number }) => {
      this.showFloatingText(this.player.x, this.player.y - 30, `Breach in car ${data.carIndex + 1}!`);
      this.cameraManager.shake(300, 0.008);
    });
    EventBus.on('fire:started', () => {
      this.showFloatingText(this.player.x, this.player.y - 30, 'FIRE! Put it out!');
    });
    EventBus.on('daynight:phase-changed', (phase: string) => {
      this.showFloatingText(this.player.x, this.player.y - 30, phase);
    });
    EventBus.on('map:set-destination', (destId: string) => {
      this.setDestination(destId);
    });
    EventBus.on('train:out-of-fuel', () => {
      this.gameMode = GameMode.STOPPED;
      this.showFloatingText(this.player.x, this.player.y - 30, 'OUT OF FUEL!');
    });

    this.emitHudUpdate();
  }

  // ------------------------------------------------------------------
  // Update loop
  // ------------------------------------------------------------------

  update(time: number, delta: number): void {
    if (this.gameState !== GameState.PLAYING) return;

    // Input
    this.inputManager.update();
    const input = this.inputManager.state;

    // Pause
    if (input.pause && !this.escWasDown) {
      this.scene.pause();
      this.scene.launch('PauseScene');
    }
    this.escWasDown = input.pause;

    // Inventory toggle
    if (this.player.isInventoryJustPressed()) {
      this.openInventory();
      return;
    }

    // Map toggle
    if (this.inputManager.isMJustPressed()) {
      this.openMap();
      return;
    }

    // Weapon switch
    if (this.inputManager.isQJustPressed()) {
      this.combatManager.switchWeapon();
      const wep = this.combatManager.currentWeapon === WeaponType.RIFLE ? 'Rifle' : 'Melee';
      this.showFloatingText(this.player.x, this.player.y - 20, wep);
    }

    // Speed control (+/- keys)
    if (this.inputManager.isPlusJustPressed()) {
      this.train.speedUp();
      this.showFloatingText(this.player.x, this.player.y - 20, `Speed: ${this.train.speed}`);
    }
    if (this.inputManager.isMinusJustPressed()) {
      this.train.speedDown();
      this.showFloatingText(this.player.x, this.player.y - 20, `Speed: ${this.train.speed}`);
    }

    // Survival
    this.survivalManager.update(delta);
    this.player.setSpeedMultiplier(this.survivalManager.getSpeedMultiplier());

    // Player movement
    this.player.handleInput(input);
    this.player.update(time, delta);

    // Mouse aim and fire (left click)
    if (this.inputManager.isMouseJustPressed()) {
      this.handleMouseAttack();
    }

    // Keyboard attack
    if (this.player.isAttackJustPressed()) {
      this.handleAttack();
    }
    this.combatManager.update(delta);
    this.checkCombatHits();

    // NPCs
    this.npcManager.update(time, delta);

    // Interactions
    this.handleInteractions();

    // Environment
    const camY = this.cameraManager.getScrollY();
    this.environmentManager.update(delta, this.train.isMoving, camY);

    // Fuel consumption
    if (this.train.isMoving) {
      this.train.updateFuel(delta);
      if (this.train.fuel <= 0) {
        this.gameMode = GameMode.STOPPED;
      }
    }

    // Travel progress
    if (this.train.isMoving && this.destinationId) {
      this.updateTravelProgress(delta);
    }

    // Ambient zombies
    this.updateZombies(time, delta, camY);

    // Train events
    this.trainEventManager.update(delta, this.gameMode);

    // Exploration
    if (this.explorationManager.active) {
      this.explorationManager.update(delta, this.player.x, this.player.y);
    }

    // Day/night
    this.dayNightManager.update(delta);

    // Audio
    this.audioManager.update(delta);

    // Speech bubble
    if (this.speechTimer > 0) {
      this.speechTimer -= delta;
      const nearest = this.npcManager.findNearest(this.player.x, this.player.y);
      if (nearest) {
        this.speechBubble.setPosition(nearest.npc.x, nearest.npc.y - 30);
      }
      if (this.speechTimer <= 0) this.speechBubble.setVisible(false);
    }

    // Camera
    this.cameraManager.update(time, delta);

    // HUD
    this.emitHudUpdate();
  }

  // ------------------------------------------------------------------
  // Travel / Destination
  // ------------------------------------------------------------------

  private setDestination(destId: string): void {
    const route = getRoute(this.currentLocationId, destId);
    if (!route) return;
    this.destinationId = destId;
    this.travelDistance = route.distance;
    this.travelProgress = 0;

    const loc = getLocation(destId);
    this.showFloatingText(this.player.x, this.player.y - 30, `Destination: ${loc?.name ?? destId}`);
  }

  private updateTravelProgress(delta: number): void {
    if (!this.destinationId || this.travelDistance <= 0) return;
    const dt = delta / 1000;
    const speedFactor = this.train.speed / TRAIN_SPEED_DEFAULT;
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

    // Auto-stop at destination
    this.train.stop();
    this.gameMode = GameMode.STOPPED;

    // Update brake panel prompt
    const engineCar = this.train.getCar(0);
    if (engineCar) {
      const brake = engineCar.layout.furniture.find(f => f.type === FurnitureType.BRAKE_PANEL);
      if (brake) brake.interactPrompt = 'Start Train';
    }

    this.showFloatingText(this.player.x, this.player.y - 30, `Arrived at ${loc?.name ?? 'destination'}`);
    this.cameraManager.flash(0xffffff, 300);

    if (this.currentLocationId === 'port-echo') {
      this.showFloatingText(this.player.x, this.player.y - 50, 'You made it to the coast!');
    }
  }

  // ------------------------------------------------------------------
  // Combat
  // ------------------------------------------------------------------

  private handleAttack(): void {
    const attacked = this.combatManager.attack(this.player.x, this.player.y, this.player.facing);
    if (attacked && this.combatManager.currentWeapon === WeaponType.MELEE) {
      const allZombies = this.getAllZombies();
      const hits = this.combatManager.checkMeleeHits(
        this.player.x, this.player.y, this.player.facing, allZombies,
      );
      for (const hit of hits) {
        (hit.zombie as Zombie).takeDamage(hit.damage);
        this.showFloatingText(hit.zombie.x, hit.zombie.y - 10, `-${hit.damage}`);
      }
    }
  }

  private handleMouseAttack(): void {
    const worldPointer = this.cameraManager.getWorldPointer();
    const attacked = this.combatManager.attackAtTarget(
      this.player.x, this.player.y,
      worldPointer.x, worldPointer.y,
    );
    if (attacked) {
      // Update player facing toward mouse
      const dx = worldPointer.x - this.player.x;
      const dy = worldPointer.y - this.player.y;
      const dir = { x: dx / (Math.sqrt(dx * dx + dy * dy) || 1), y: dy / (Math.sqrt(dx * dx + dy * dy) || 1) };
      this.player.facing = this.combatManager.vecToDirection(dir);

      if (this.combatManager.currentWeapon === WeaponType.MELEE) {
        const allZombies = this.getAllZombies();
        const hits = this.combatManager.checkMeleeHitsDir(
          this.player.x, this.player.y, dir, allZombies,
        );
        for (const hit of hits) {
          (hit.zombie as Zombie).takeDamage(hit.damage);
          this.showFloatingText(hit.zombie.x, hit.zombie.y - 10, `-${hit.damage}`);
        }
      }
    }
  }

  private checkCombatHits(): void {
    const allZombies = this.getAllZombies();
    const hits = this.combatManager.checkBulletHits(allZombies);
    for (const hit of hits) {
      (hit.zombie as Zombie).takeDamage(hit.damage);
      this.showFloatingText(hit.zombie.x, hit.zombie.y - 10, `-${hit.damage}`);
    }
  }

  private getAllZombies(): Zombie[] {
    return [
      ...this.zombies,
      ...this.trainEventManager.getBreachZombies(),
      ...this.explorationManager.getZombies(),
    ];
  }

  // ------------------------------------------------------------------
  // Interactions
  // ------------------------------------------------------------------

  private handleInteractions(): void {
    const px = this.player.x;
    const py = this.player.y;

    // Block exit via connector sides while moving
    if (this.train.isMoving && this.train.isInConnector(px, py)) {
      // Constrain player to connector center
      const trainBounds = this.train.getWorldBounds();
      const centerX = trainBounds.x + trainBounds.w / 2;
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      if (Math.abs(px - centerX) > 20) {
        body.setVelocityX((centerX - px) * 5);
      }
    }

    // Check exit train (when stopped, near storage car exit door)
    if (this.gameMode === GameMode.STOPPED && !this.explorationManager.active) {
      const storageCar = this.train.getCar(2);
      if (storageCar) {
        const door = storageCar.getFrontDoorPos();
        const dist = Math.sqrt((px - door.x) ** 2 + (py - door.y) ** 2);
        if (dist < EXIT_TRAIN_RANGE) {
          this.showInteractPrompt(door.x, door.y - 20, '[E] Exit Train');
          if (this.player.isInteractJustPressed()) {
            this.enterExploration();
          }
          return;
        }
      }
    }

    // Check return to train (when exploring)
    if (this.gameMode === GameMode.EXPLORING) {
      const storageCar = this.train.getCar(2);
      if (storageCar) {
        const door = storageCar.getFrontDoorPos();
        const dist = Math.sqrt((px - door.x) ** 2 + (py - door.y) ** 2);
        if (dist < EXIT_TRAIN_RANGE + 20) {
          this.showInteractPrompt(door.x, door.y - 20, '[E] Return to Train');
          if (this.player.isInteractJustPressed()) {
            this.exitExploration();
          }
          return;
        }
      }
    }

    // Resource pickups (exploration)
    if (this.explorationManager.active) {
      const resource = this.explorationManager.checkPickup(px, py, PLAYER_INTERACT_RANGE);
      if (resource) {
        this.showInteractPrompt(resource.sprite.x, resource.sprite.y - 16, `[E] Pick up ${resource.name}`);
        if (this.player.isInteractJustPressed()) {
          this.inventoryManager.addItem(
            resource.itemId, resource.name, resource.type, resource.quantity, resource.icon,
          );
          this.explorationManager.collectResource(resource);
          this.showFloatingText(px, py - 20, `+${resource.quantity} ${resource.name}`);
        }
        return;
      }
    }

    // NPC interaction
    const nearNpc = this.npcManager.findNearest(px, py);
    if (nearNpc && nearNpc.dist < PLAYER_INTERACT_RANGE + 10) {
      this.showInteractPrompt(nearNpc.npc.x, nearNpc.npc.y - 24, `[E] Talk to ${nearNpc.npc.npcName}`);
      if (this.player.isInteractJustPressed()) {
        this.showSpeechBubble(nearNpc.npc.getDialogue());
      }
      return;
    }

    // Fire extinguish
    if (this.trainEventManager.hasFires()) {
      if (this.player.isInteractJustPressed()) {
        if (this.trainEventManager.extinguishFire(px, py, PLAYER_INTERACT_RANGE + 10)) {
          this.showFloatingText(px, py - 20, 'Fire out!');
          return;
        }
      }
    }

    // Window interaction (stand near a window to open/close it)
    const currentCar = this.train.getCarAtPoint(px, py);
    if (currentCar) {
      const nearWindow = currentCar.findNearestWindow(px, py, PLAYER_INTERACT_RANGE);
      if (nearWindow) {
        const action = nearWindow.open ? 'Close Window' : 'Open Window';
        this.showInteractPrompt(px, py - 24, `[E] ${action}`);
        if (this.player.isInteractJustPressed()) {
          currentCar.toggleWindow(nearWindow);
          this.showFloatingText(px, py - 20, nearWindow.open ? 'Window Opened' : 'Window Closed');
        }
        // Still check furniture below in case window is not the primary interaction
      }

      // Door interaction (car-end doors that can be closed/opened)
      const nearDoor = currentCar.findNearestDoor(px, py, PLAYER_INTERACT_RANGE);
      if (nearDoor && nearDoor.isEndDoor && !nearWindow) {
        const action = nearDoor.open ? 'Close Door' : 'Open Door';
        this.showInteractPrompt(px, py - 24, `[E] ${action}`);
        if (this.player.isInteractJustPressed()) {
          currentCar.toggleDoor(nearDoor);
          this.showFloatingText(px, py - 20, nearDoor.open ? 'Door Opened' : 'Door Closed');
        }
        return;
      }

      // Furniture interaction
      const furniture = currentCar.findNearestFurniture(px, py, PLAYER_INTERACT_RANGE);
      if (furniture && !nearWindow) {
        // Show food info at stove
        if (furniture.type === FurnitureType.COOKING_STOVE) {
          const foodCount = this.inventoryManager.getCount('canned-food');
          this.showInteractPrompt(px, py - 24, `[E] ${furniture.interactPrompt} (Food: ${foodCount})`);
        } else if (furniture.type === FurnitureType.STORAGE_CRATE) {
          const remaining = furniture.uses ?? 0;
          this.showInteractPrompt(px, py - 24, `[E] ${furniture.interactPrompt} (Stores: ${remaining})`);
        } else if (furniture.type === FurnitureType.BRAKE_PANEL) {
          const speedText = `Speed: ${this.train.speed} | Fuel: ${Math.floor(this.train.fuel)}%`;
          this.showInteractPrompt(px, py - 24, `[E] ${furniture.interactPrompt} | ${speedText}`);
        } else {
          this.showInteractPrompt(px, py - 24, `[E] ${furniture.interactPrompt}`);
        }
        if (this.player.isInteractJustPressed()) {
          this.executeFurnitureAction(furniture);
        }
        return;
      }
    }

    this.interactPromptText.setVisible(false);
  }

  private showInteractPrompt(x: number, y: number, text: string): void {
    this.interactPromptText.setText(text);
    this.interactPromptText.setPosition(x - this.interactPromptText.width / 2, y);
    this.interactPromptText.setVisible(true);
  }

  private showSpeechBubble(text: string): void {
    this.speechText.setText(text);
    this.speechBubble.setVisible(true);
    this.speechTimer = 3000;
  }

  private executeFurnitureAction(furniture: PlacedFurniture): void {
    switch (furniture.type) {
      case FurnitureType.BED:
        this.cameraManager.fadeForSleep(() => {
          this.survivalManager.sleep(SLEEP_RESTORE_AMOUNT);
        });
        break;

      case FurnitureType.STORAGE_CRATE:
        if (furniture.uses !== undefined && furniture.uses > 0) {
          furniture.uses--;
          this.survivalManager.eat(EAT_RESTORE_AMOUNT);
          this.showFloatingText(this.player.x, this.player.y - 20, `+${EAT_RESTORE_AMOUNT} Food (${furniture.uses} left)`);
          if (furniture.uses <= 0) furniture.interactPrompt = 'Empty';
        } else {
          this.showFloatingText(this.player.x, this.player.y - 20, 'Empty...');
        }
        break;

      case FurnitureType.COOKING_STOVE: {
        const foodCount = this.inventoryManager.getCount('canned-food');
        if (foodCount > 0) {
          this.inventoryManager.removeItem('canned-food', 1);
          const amount = Math.floor(EAT_RESTORE_AMOUNT * 1.5);
          this.survivalManager.eat(amount);
          this.showFloatingText(this.player.x, this.player.y - 20, `+${amount} Cooked Meal (${foodCount - 1} food left)`);
        } else {
          this.showFloatingText(this.player.x, this.player.y - 20, 'Need food to cook');
        }
        break;
      }

      case FurnitureType.BRAKE_PANEL:
        if (this.train.isMoving) {
          this.train.stop();
          this.gameMode = GameMode.STOPPED;
          furniture.interactPrompt = 'Start Train';
          this.showFloatingText(this.player.x, this.player.y - 20, 'Train Stopped');
        } else {
          if (this.explorationManager.active) {
            this.showFloatingText(this.player.x, this.player.y - 20, 'Return to train first!');
          } else if (this.train.fuel <= 0) {
            this.showFloatingText(this.player.x, this.player.y - 20, 'No fuel! Add scrap metal at workbench');
          } else if (!this.destinationId) {
            this.showFloatingText(this.player.x, this.player.y - 20, 'Set a destination on the map first! [M]');
          } else {
            this.train.start();
            this.gameMode = GameMode.TRAVELING;
            furniture.interactPrompt = 'Stop Train';
            this.showFloatingText(this.player.x, this.player.y - 20, 'Train Moving');
          }
        }
        break;

      case FurnitureType.FIRST_AID:
        if (this.inventoryManager.hasItem('medkit', 1)) {
          this.inventoryManager.removeItem('medkit', 1);
          this.survivalManager.heal(50);
          this.showFloatingText(this.player.x, this.player.y - 20, '+50 Health (Medkit)');
        } else if (this.inventoryManager.hasItem('bandage', 1)) {
          this.inventoryManager.removeItem('bandage', 1);
          this.survivalManager.heal(25);
          this.showFloatingText(this.player.x, this.player.y - 20, '+25 Health');
        } else {
          this.survivalManager.heal(15);
          this.showFloatingText(this.player.x, this.player.y - 20, '+15 Health');
        }
        break;

      case FurnitureType.WORKBENCH:
        if (this.trainEventManager.needsRepair()) {
          const comps = this.trainEventManager.maintenance.sort((a, b) => a.hp - b.hp);
          if (comps.length > 0) {
            if (this.trainEventManager.repair(comps[0].id, this.inventoryManager)) {
              this.showFloatingText(this.player.x, this.player.y - 20, `${comps[0].name} repaired!`);
            } else {
              this.showFloatingText(this.player.x, this.player.y - 20, 'Need materials to repair');
            }
          }
        } else {
          // Try to add fuel if we have scrap metal and fuel is low
          if (this.train.fuel < 80 && this.inventoryManager.hasItem('scrap-metal', 1)) {
            this.inventoryManager.removeItem('scrap-metal', 1);
            this.train.addFuel(FUEL_PER_SCRAP);
            this.showFloatingText(this.player.x, this.player.y - 20, `+${FUEL_PER_SCRAP} Fuel`);
          } else {
            this.openInventory('workbench');
          }
        }
        break;

      case FurnitureType.PLANT_BOX:
        if (this.inventoryManager.hasItem('fertilizer', 1)) {
          this.inventoryManager.removeItem('fertilizer', 1);
          this.inventoryManager.addItem('canned-food', 'Fresh Produce', 'food', 2, 'pickup-food');
          this.showFloatingText(this.player.x, this.player.y - 20, '+2 Fresh Produce');
        } else {
          this.showFloatingText(this.player.x, this.player.y - 20, 'Need fertilizer...');
        }
        break;

      case FurnitureType.MAP_BOARD:
        this.openMap();
        break;

      case FurnitureType.LIGHT_SWITCH:
        this.train.interiorLightsOn = !this.train.interiorLightsOn;
        this.showFloatingText(this.player.x, this.player.y - 20,
          this.train.interiorLightsOn ? 'Lights On' : 'Lights Off');
        this.updateInteriorLighting();
        break;

      case FurnitureType.SPOTLIGHT:
        this.train.headlightsOn = !this.train.headlightsOn;
        this.showFloatingText(this.player.x, this.player.y - 20,
          this.train.headlightsOn ? 'Headlights On' : 'Headlights Off');
        break;
    }
  }

  // ------------------------------------------------------------------
  // Map
  // ------------------------------------------------------------------

  private openMap(): void {
    this.scene.pause();
    this.scene.launch('MapScene', {
      currentLocation: this.currentLocationId,
      destination: this.destinationId,
    });
  }

  // ------------------------------------------------------------------
  // Exploration
  // ------------------------------------------------------------------

  private enterExploration(): void {
    this.gameMode = GameMode.EXPLORING;

    const trainBounds = this.train.getWorldBounds();
    const result = this.explorationManager.generate(trainBounds);

    for (const wallGroup of result.walls) {
      const c = this.physics.add.collider(this.player, wallGroup);
      this.explorationColliders.push(c);
    }

    const fullBounds = {
      x: Math.min(trainBounds.x, result.bounds.x),
      y: trainBounds.y,
      w: Math.max(trainBounds.w, result.bounds.w + Math.abs(result.bounds.x - trainBounds.x)),
      h: trainBounds.h + result.bounds.h + 100,
    };
    this.cameraManager.setExplorationBounds(fullBounds);

    const storageCar = this.train.getCar(2)!;
    const doorPos = storageCar.getFrontDoorPos();
    this.player.setPosition(doorPos.x, doorPos.y + 60);

    this.showFloatingText(this.player.x, this.player.y - 20, 'Exploring...');

    const recruited = this.npcManager.tryRecruit();
    if (recruited) {
      this.showFloatingText(this.player.x, this.player.y - 40, `${recruited.npcName} joined!`);
      this.npcManager.addCollisions(
        this.train.getAllWallBodies(),
        this.train.getAllFurnitureBodies(),
      );
    }
  }

  private exitExploration(): void {
    this.gameMode = GameMode.STOPPED;

    this.explorationManager.cleanup();

    for (const c of this.explorationColliders) {
      c.destroy();
    }
    this.explorationColliders = [];

    this.cameraManager.setExplorationBounds(this.train.getWorldBounds());

    const storageCar = this.train.getCar(2)!;
    const doorPos = storageCar.getFrontDoorPos();
    this.player.setPosition(doorPos.x, doorPos.y - 20);

    this.showFloatingText(this.player.x, this.player.y - 20, 'Back on the train');
  }

  // ------------------------------------------------------------------
  // Inventory
  // ------------------------------------------------------------------

  private openInventory(station: string = 'none'): void {
    this.scene.pause();
    this.scene.launch('InventoryScene', {
      inventory: this.inventoryManager,
      crafting: this.craftingManager,
      nearStation: station,
    });
  }

  // ------------------------------------------------------------------
  // Zombies (ambient)
  // ------------------------------------------------------------------

  private updateZombies(time: number, delta: number, cameraY: number): void {
    const spawnInterval = AMBIENT_ZOMBIE_SPAWN_INTERVAL / this.dayNightManager.getZombieMultiplier();

    this.zombieSpawnTimer += delta;
    if (this.zombieSpawnTimer > spawnInterval) {
      this.zombieSpawnTimer = 0;
      this.spawnAmbientZombie(cameraY);
    }

    const scrollSpeed = this.train.isMoving ? this.train.speed : 0;
    const trainBounds = this.train.getWorldBounds();

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (!z.isAlive()) {
        z.destroy();
        this.zombies.splice(i, 1);
        continue;
      }

      z.updateZombie(time, delta, scrollSpeed);

      // Prevent ambient zombies from clipping into train
      if (z.x > trainBounds.x - 10 && z.x < trainBounds.x + trainBounds.w + 10 &&
          z.y > trainBounds.y && z.y < trainBounds.y + trainBounds.h) {
        // Push zombie away from train
        if (z.x < trainBounds.x + trainBounds.w / 2) {
          z.x = trainBounds.x - 12;
        } else {
          z.x = trainBounds.x + trainBounds.w + 12;
        }
      }

      if (z.y > cameraY + GAME_HEIGHT || z.y < cameraY - GAME_HEIGHT) {
        z.destroy();
        this.zombies.splice(i, 1);
      }
    }

    // Breach zombies damage player
    for (const z of this.trainEventManager.getBreachZombies()) {
      if (!z.isAlive()) continue;
      z.updateZombie(time, delta, 0, this.player.x, this.player.y);
      const dx = this.player.x - z.x;
      const dy = this.player.y - z.y;
      if (dx * dx + dy * dy < 400) {
        const dmg = z.tryAttack();
        if (dmg > 0) {
          this.player.survival.health = Math.max(0, this.player.survival.health - dmg);
          this.cameraManager.shake(100, 0.005);
          this.showFloatingText(this.player.x, this.player.y - 15, `-${dmg}`);
          if (this.player.survival.health <= 0) this.gameOver();
        }
      }
    }

    // Exploration zombies
    if (this.explorationManager.active) {
      for (const z of this.explorationManager.getZombies()) {
        if (!z.isAlive()) continue;
        const dx = this.player.x - z.x;
        const dy = this.player.y - z.y;
        if (dx * dx + dy * dy < 400) {
          const dmg = z.tryAttack();
          if (dmg > 0) {
            this.player.survival.health = Math.max(0, this.player.survival.health - dmg);
            this.cameraManager.shake(100, 0.005);
            this.showFloatingText(this.player.x, this.player.y - 15, `-${dmg}`);
            if (this.player.survival.health <= 0) this.gameOver();
          }
        }
      }
    }
  }

  private spawnAmbientZombie(cameraY: number): void {
    if (this.zombies.length >= 15) return;

    const trainBounds = this.train.getWorldBounds();
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const x = side === 'left'
      ? trainBounds.x - 30 - Math.random() * 100
      : trainBounds.x + trainBounds.w + 30 + Math.random() * 100;
    const y = cameraY - GAME_HEIGHT / 2 - 50;

    const zombie = new Zombie(this, x, y);
    zombie.setAmbient();
    this.zombies.push(zombie);
  }

  // ------------------------------------------------------------------
  // Floating text
  // ------------------------------------------------------------------

  private showFloatingText(x: number, y: number, text: string): void {
    const ft = this.add.text(x, y, text, {
      fontSize: '10px', fontFamily: 'monospace', color: '#ffdd44',
      stroke: '#000000', strokeThickness: 2,
    });
    ft.setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: ft, y: y - 30, alpha: 0, duration: 1200,
      ease: 'Power2', onComplete: () => ft.destroy(),
    });
  }

  // ------------------------------------------------------------------
  // Interior lighting
  // ------------------------------------------------------------------

  private updateInteriorLighting(): void {
    const alpha = this.train.interiorLightsOn ? 1.0 : 0.4;
    for (const car of this.train.cars) {
      car.floorContainer.setAlpha(alpha);
      car.furnitureContainer.setAlpha(alpha);
    }
  }

  // ------------------------------------------------------------------
  // HUD & game state
  // ------------------------------------------------------------------

  private emitHudUpdate(): void {
    const s = this.player.survival;
    const eng = this.trainEventManager.getComponent('engine');
    const brk = this.trainEventManager.getComponent('brake');

    const destLoc = this.destinationId ? getLocation(this.destinationId) : null;
    const curLoc = getLocation(this.currentLocationId);

    const data: HudUpdateData = {
      hunger: s.hunger,
      energy: s.energy,
      health: s.health,
      mode: this.gameMode,
      weapon: this.combatManager.currentWeapon,
      ammo: this.inventoryManager.getAmmo(),
      timeOfDay: this.dayNightManager.timeOfDay,
      engineHp: eng?.hp ?? 100,
      brakeHp: brk?.hp ?? 100,
      hasFire: this.trainEventManager.hasFires(),
      npcCount: this.npcManager.getCount(),
      fuel: this.train.fuel,
      trainSpeed: this.train.speed,
      destination: destLoc?.name ?? null,
      travelProgress: this.travelProgress,
      currentLocation: curLoc?.name ?? 'Unknown',
    };
    EventBus.emit('hud:update', data);
  }

  private gameOver(): void {
    this.gameState = GameState.GAME_OVER;
    this.audioManager.stop();
    this.combatManager.cleanup();
    this.explorationManager.cleanup();
    this.scene.stop('HudScene');
    this.scene.start('GameOverScene', { message: 'You didn\'t survive...' });
  }

  public saveGame(): void {
    const dnData = this.dayNightManager.serialize();
    const saveData = SaveManager.createSaveData(
      this.player.survival,
      this.inventoryManager.serialize(),
      this.gameMode,
      dnData.timeOfDay,
      dnData.dayTime,
      this.train.isMoving,
      this.npcManager.getNames(),
      [],
      {
        engine: this.trainEventManager.getComponent('engine')?.hp ?? 100,
        brake: this.trainEventManager.getComponent('brake')?.hp ?? 100,
        wheels: this.trainEventManager.getComponent('wheels')?.hp ?? 100,
      },
      this.currentLocationId,
      this.destinationId,
      this.travelProgress,
      this.train.fuel,
      this.train.speed,
    );
    this.saveManager.save(saveData);
  }

  shutdown(): void {
    this.audioManager.stop();
    EventBus.removeAllListeners();
  }
}
