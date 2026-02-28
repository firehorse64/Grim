import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameState, GameMode, Direction } from '../types/GameTypes';
import { FurnitureType, PlacedFurniture } from '../types/TrainTypes';
import { InputManager } from '../systems/InputManager';
import { SurvivalManager } from '../systems/SurvivalManager';
import { EnvironmentManager } from '../systems/EnvironmentManager';
import { CameraManager } from '../systems/CameraManager';
import { Train } from '../train/Train';
import { Player } from '../entities/Player';
import { Survivor } from '../entities/npcs/Survivor';
import { Zombie } from '../entities/zombies/Zombie';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_INTERACT_RANGE,
  AMBIENT_ZOMBIE_SPAWN_INTERVAL,
  CAR_PIXEL_WIDTH,
  TILE_SIZE,
  TRAIN_SCROLL_SPEED,
  EAT_RESTORE_AMOUNT,
  SLEEP_RESTORE_AMOUNT,
} from '../data/BalanceConstants';

/**
 * GameScene – core gameplay for the survival train game.
 *
 * The player moves around inside a vertically oriented train viewed
 * from a 3/4 angle. The exterior scrolls when the train is moving.
 * Zombies wander outside. The player manages survival stats (hunger,
 * energy) and can stop the train to explore.
 */
export class GameScene extends Phaser.Scene {
  // ---- State ----
  private gameState: GameState = GameState.PLAYING;
  private gameMode: GameMode = GameMode.TRAVELING;

  // ---- Core objects ----
  private inputManager!: InputManager;
  private survivalManager!: SurvivalManager;
  private environmentManager!: EnvironmentManager;
  private cameraManager!: CameraManager;
  private train!: Train;
  private player!: Player;
  private npc!: Survivor;

  // ---- Zombies ----
  private zombies: Zombie[] = [];
  private zombieSpawnTimer: number = 0;

  // ---- Interaction ----
  private interactPromptText!: Phaser.GameObjects.Text;
  private speechBubble!: Phaser.GameObjects.Container;
  private speechText!: Phaser.GameObjects.Text;
  private speechTimer: number = 0;

  // ---- Pause ----
  private escWasDown: boolean = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  init(): void {
    this.gameState = GameState.PLAYING;
    this.gameMode = GameMode.TRAVELING;
    this.zombies = [];
    this.zombieSpawnTimer = 0;
    this.speechTimer = 0;
  }

  create(): void {
    // ---- Environment (under everything) ----
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

    // ---- NPC ----
    const npcPt = this.train.getNPCSpawnPoint();
    this.npc = new Survivor(this, npcPt.x, npcPt.y, 'Sarah');
    // Set NPC wander bounds to the living car interior
    const livingCar = this.train.getCar(1);
    if (livingCar) {
      const b = livingCar.getInteriorBounds();
      this.npc.setWanderBounds(b.x, b.y, b.w, b.h);
    }

    // ---- Collisions ----
    for (const wallGroup of this.train.getAllWallBodies()) {
      this.physics.add.collider(this.player, wallGroup);
      this.physics.add.collider(this.npc, wallGroup);
    }
    for (const furnGroup of this.train.getAllFurnitureBodies()) {
      this.physics.add.collider(this.player, furnGroup);
      this.physics.add.collider(this.npc, furnGroup);
    }

    // ---- Input ----
    this.inputManager = new InputManager(this);
    this.inputManager.init();

    // ---- Survival ----
    this.survivalManager = new SurvivalManager(this.player.survival);

    // ---- Camera ----
    this.cameraManager = new CameraManager();
    this.cameraManager.create(this, this.player, this.train.getWorldBounds());

    // ---- UI elements (world-space) ----
    this.interactPromptText = this.add.text(0, 0, '', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 6, y: 3 },
    });
    this.interactPromptText.setDepth(25);
    this.interactPromptText.setVisible(false);

    // Speech bubble for NPC dialogue
    this.speechBubble = this.add.container(0, 0);
    this.speechBubble.setDepth(25);
    this.speechBubble.setVisible(false);
    const bubbleBg = this.add.image(0, 0, 'speech-bubble');
    bubbleBg.setScale(2, 1.5);
    this.speechText = this.add.text(0, -4, '', {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#333333',
      wordWrap: { width: 80 },
      align: 'center',
    });
    this.speechText.setOrigin(0.5);
    this.speechBubble.add([bubbleBg, this.speechText]);

    // ---- HUD scene ----
    this.scene.launch('HudScene');

    // ---- Event listeners ----
    EventBus.on('survival:death', () => {
      this.gameOver();
    });

    // Emit initial state
    this.emitHudUpdate();
  }

  // ------------------------------------------------------------------
  // Update loop
  // ------------------------------------------------------------------

  update(time: number, delta: number): void {
    if (this.gameState !== GameState.PLAYING) return;

    // ---- Input ----
    this.inputManager.update();
    const input = this.inputManager.state;

    // ---- Pause ----
    if (input.pause && !this.escWasDown) {
      this.scene.pause();
      this.scene.launch('PauseScene');
    }
    this.escWasDown = input.pause;

    // ---- Survival ----
    this.survivalManager.update(delta);
    this.player.setSpeedMultiplier(this.survivalManager.getSpeedMultiplier());

    // ---- Player ----
    this.player.handleInput(input);
    this.player.update(time, delta);

    // ---- NPC ----
    this.npc.update(time, delta);

    // ---- Interactions ----
    this.handleInteractions(input);

    // ---- Environment ----
    const camY = this.cameraManager.getScrollY();
    this.environmentManager.update(delta, this.train.isMoving, camY);

    // ---- Zombies (ambient) ----
    this.updateZombies(time, delta, camY);

    // ---- Speech bubble ----
    if (this.speechTimer > 0) {
      this.speechTimer -= delta;
      this.speechBubble.setPosition(this.npc.x, this.npc.y - 30);
      if (this.speechTimer <= 0) {
        this.speechBubble.setVisible(false);
      }
    }

    // ---- Camera ----
    this.cameraManager.update(time, delta);

    // ---- HUD update ----
    this.emitHudUpdate();
  }

  // ------------------------------------------------------------------
  // Interactions
  // ------------------------------------------------------------------

  private handleInteractions(input: { interact: boolean }): void {
    const px = this.player.x;
    const py = this.player.y;

    // Check NPC interaction
    const npcDist = Math.sqrt((px - this.npc.x) ** 2 + (py - this.npc.y) ** 2);
    if (npcDist < PLAYER_INTERACT_RANGE + 10) {
      this.showInteractPrompt(this.npc.x, this.npc.y - 24, `[E] Talk to ${this.npc.npcName}`);
      if (this.player.isInteractJustPressed()) {
        this.showSpeechBubble(this.npc.getDialogue());
      }
      return;
    }

    // Check furniture interaction in current car
    const currentCar = this.train.getCarAtPoint(px, py);
    if (currentCar) {
      const furniture = currentCar.findNearestFurniture(px, py, PLAYER_INTERACT_RANGE);
      if (furniture) {
        this.showInteractPrompt(px, py - 24, `[E] ${furniture.interactPrompt}`);
        if (this.player.isInteractJustPressed()) {
          this.executeFurnitureAction(furniture);
        }
        return;
      }
    }

    // Nothing nearby
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
          this.showFloatingText(this.player.x, this.player.y - 20, `+${EAT_RESTORE_AMOUNT} Food`);
          if (furniture.uses <= 0) {
            furniture.interactPrompt = 'Empty';
          }
        } else {
          this.showFloatingText(this.player.x, this.player.y - 20, 'Empty...');
        }
        break;

      case FurnitureType.COOKING_STOVE:
        this.survivalManager.eat(EAT_RESTORE_AMOUNT * 1.5);
        this.showFloatingText(this.player.x, this.player.y - 20, `+${Math.floor(EAT_RESTORE_AMOUNT * 1.5)} Cooked Meal`);
        break;

      case FurnitureType.BRAKE_PANEL:
        if (this.train.isMoving) {
          this.train.stop();
          this.gameMode = GameMode.STOPPED;
          furniture.interactPrompt = 'Start Train';
          this.showFloatingText(this.player.x, this.player.y - 20, 'Train Stopped');
        } else {
          this.train.start();
          this.gameMode = GameMode.TRAVELING;
          furniture.interactPrompt = 'Stop Train';
          this.showFloatingText(this.player.x, this.player.y - 20, 'Train Moving');
        }
        break;

      case FurnitureType.FIRST_AID:
        this.survivalManager.heal(30);
        this.showFloatingText(this.player.x, this.player.y - 20, '+30 Health');
        break;

      case FurnitureType.WORKBENCH:
        this.showFloatingText(this.player.x, this.player.y - 20, 'Nothing to repair... yet');
        break;

      case FurnitureType.PLANT_BOX:
        this.showFloatingText(this.player.x, this.player.y - 20, 'Plants growing...');
        break;
    }
  }

  private showFloatingText(x: number, y: number, text: string): void {
    const ft = this.add.text(x, y, text, {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 2,
    });
    ft.setOrigin(0.5);
    ft.setDepth(30);

    this.tweens.add({
      targets: ft,
      y: y - 30,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => ft.destroy(),
    });
  }

  // ------------------------------------------------------------------
  // Zombies
  // ------------------------------------------------------------------

  private updateZombies(time: number, delta: number, cameraY: number): void {
    // Spawn ambient zombies
    this.zombieSpawnTimer += delta;
    if (this.zombieSpawnTimer > AMBIENT_ZOMBIE_SPAWN_INTERVAL) {
      this.zombieSpawnTimer = 0;
      this.spawnAmbientZombie(cameraY);
    }

    // Update existing zombies
    const scrollSpeed = this.train.isMoving ? TRAIN_SCROLL_SPEED : 0;
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (!z.isAlive()) {
        z.destroy();
        this.zombies.splice(i, 1);
        continue;
      }

      z.updateZombie(time, delta, scrollSpeed);

      // Remove if too far off-screen
      if (z.y > cameraY + GAME_HEIGHT || z.y < cameraY - GAME_HEIGHT) {
        z.destroy();
        this.zombies.splice(i, 1);
      }
    }
  }

  private spawnAmbientZombie(cameraY: number): void {
    if (this.zombies.length >= 15) return; // Cap ambient zombies

    const trainBounds = this.train.getWorldBounds();

    // Spawn on left or right side of train
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
  // Game state
  // ------------------------------------------------------------------

  private emitHudUpdate(): void {
    const s = this.player.survival;
    EventBus.emit('hud:update', {
      hunger: s.hunger,
      energy: s.energy,
      health: s.health,
      mode: this.gameMode,
    });
  }

  private gameOver(): void {
    this.gameState = GameState.GAME_OVER;
    this.scene.stop('HudScene');
    this.scene.start('GameOverScene', {
      message: 'You didn\'t survive...',
    });
  }

  shutdown(): void {
    EventBus.removeAllListeners();
  }
}
