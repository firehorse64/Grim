import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';
import { GameState } from '../types/GameTypes';
import { SaveData, SAVE_KEY, SAVE_VERSION } from '../types/SaveTypes';
import { WeaponType } from '../types/WeaponTypes';
import { InputManager } from '../systems/InputManager';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_START_HP,
  PLAYER_MAX_HP,
  PLAYER_START_CURRENCY,
  NUM_TRAIN_CARS,
  CAR_WIDTH,
  CAR_GAP,
  CAR_FLOOR_Y,
  TRAIN_SCROLL_SPEED,
  WAVE_COUNTDOWN_MS,
  BASE_CURRENCY_PER_KILL,
  WAVE_BONUS_CURRENCY,
} from '../data/BalanceConstants';
import { getWaveDefinition, WaveDefinition } from '../data/WaveData';

/**
 * GameScene - The core gameplay scene.
 *
 * Initialises all game systems, runs the update loop, and coordinates
 * game state transitions (pause, shop, game-over). Actual gameplay
 * entities (Player, Train, Zombies) are managed via their respective
 * manager classes which are instantiated here.
 *
 * The HudScene runs in parallel as an overlay and communicates via
 * EventBus events exclusively.
 */
export class GameScene extends Phaser.Scene {
  // ---- Game state ----
  private gameState: GameState = GameState.PLAYING;
  private score: number = 0;
  private currency: number = 0;
  private currentWave: number = 0;
  private zombiesKilled: number = 0;
  private survivorsRescued: number = 0;
  private purchasedUpgrades: string[] = [];

  // ---- Input ----
  private inputManager!: InputManager;

  // ---- Managers (will be class instances when those files are created) ----
  // For now we store references as `any` so the scene compiles even before
  // the manager source files exist.  Replace `any` with concrete types once
  // the managers are implemented.
  private parallaxManager: any = null;
  private train: any = null;
  private player: any = null;
  private spawnManager: any = null;
  private collisionManager: any = null;
  private waveManager: any = null;
  private environmentManager: any = null;
  private eventManager: any = null;
  private particleManager: any = null;
  private cameraManager: any = null;
  private audioManager: any = null;

  // ---- Parallax (simple built-in fallback) ----
  private bgLayers: Phaser.GameObjects.TileSprite[] = [];
  private scrollOffset: number = 0;

  // ---- Wave state ----
  private waveActive: boolean = false;
  private waveZombiesTotal: number = 0;
  private waveZombiesRemaining: number = 0;
  private waveSpawnQueue: { type: string; count: number }[] = [];
  private waveSpawnTimer: number = 0;
  private waveSpawnInterval: number = 1800;
  private waveCountdownTimer: number = 0;
  private betweenWaves: boolean = false;

  // ---- Pause control ----
  private escWasDown: boolean = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  init(data?: { newGame?: boolean; saveData?: SaveData }): void {
    // Reset state
    this.gameState = GameState.PLAYING;
    this.score = 0;
    this.currency = PLAYER_START_CURRENCY;
    this.currentWave = 0;
    this.zombiesKilled = 0;
    this.survivorsRescued = 0;
    this.purchasedUpgrades = [];
    this.waveActive = false;
    this.betweenWaves = false;
    this.scrollOffset = 0;

    // Load from save if continuing
    if (data && !data.newGame && data.saveData) {
      this.loadFromSave(data.saveData);
    }
  }

  create(): void {
    // ---------------------------------------------------------------
    // 1. Parallax background (simple fallback until ParallaxManager exists)
    // ---------------------------------------------------------------
    this.createParallaxBackground();

    // ---------------------------------------------------------------
    // 2. Train
    // ---------------------------------------------------------------
    this.createTrainPlatforms();

    // ---------------------------------------------------------------
    // 3. Player placeholder (rectangle)
    // ---------------------------------------------------------------
    this.createPlayerPlaceholder();

    // ---------------------------------------------------------------
    // 4. Input
    // ---------------------------------------------------------------
    this.inputManager = new InputManager();
    this.inputManager.init(this);

    // ---------------------------------------------------------------
    // 5-11. System managers - Attempt dynamic imports; if the modules
    //        do not exist yet, gracefully skip. The scene still runs
    //        with its built-in fallback logic.
    // ---------------------------------------------------------------
    this.initManagers();

    // ---------------------------------------------------------------
    // 12. Launch HUD overlay
    // ---------------------------------------------------------------
    if (!this.scene.isActive('HudScene')) {
      this.scene.launch('HudScene');
    }

    // ---------------------------------------------------------------
    // 12b. Launch touch controls (mobile only, auto-detects)
    // ---------------------------------------------------------------
    if (!this.scene.isActive('TouchControlsScene')) {
      this.scene.launch('TouchControlsScene');
    }

    // ---------------------------------------------------------------
    // Event listeners
    // ---------------------------------------------------------------
    this.registerEvents();

    // ---------------------------------------------------------------
    // Start first wave countdown
    // ---------------------------------------------------------------
    this.beginWaveCountdown();

    // Fade in
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Emit initial state
    EventBus.emit(GameEvents.SCORE_CHANGED, this.score);
    EventBus.emit(GameEvents.CURRENCY_CHANGED, this.currency);
  }

  update(time: number, delta: number): void {
    if (this.gameState !== GameState.PLAYING) return;

    // Input
    this.inputManager.update();
    const input = this.inputManager.state;

    // Pause check
    if (input.pause && !this.escWasDown) {
      this.pauseGame();
    }
    this.escWasDown = input.pause;

    // Parallax scrolling
    this.updateParallax(delta);

    // Player movement (placeholder physics)
    this.updatePlayerMovement(input, delta);

    // Wave logic
    this.updateWave(time, delta);

    // Update managers that exist
    if (this.parallaxManager?.update) this.parallaxManager.update(time, delta);
    if (this.train?.update) this.train.update(time, delta);
    if (this.player?.update) this.player.update(time, delta);
    if (this.spawnManager?.update) this.spawnManager.update(time, delta);
    if (this.collisionManager?.update) this.collisionManager.update(time, delta);
    if (this.waveManager?.update) this.waveManager.update(time, delta);
    if (this.environmentManager?.update) this.environmentManager.update(time, delta);
    if (this.eventManager?.update) this.eventManager.update(time, delta);
    if (this.particleManager?.update) this.particleManager.update(time, delta);
    if (this.cameraManager?.update) this.cameraManager.update(time, delta);
    if (this.audioManager?.update) this.audioManager.update(time, delta);
  }

  // ------------------------------------------------------------------
  // Initialization helpers
  // ------------------------------------------------------------------

  private createParallaxBackground(): void {
    // Procedural sky
    if (!this.textures.exists('game-sky')) {
      const canvas = this.textures.createCanvas('game-sky', GAME_WIDTH, GAME_HEIGHT)!;
      const ctx = canvas.context;
      const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      grad.addColorStop(0, '#0a0a1a');
      grad.addColorStop(0.3, '#101028');
      grad.addColorStop(0.6, '#181838');
      grad.addColorStop(1, '#0e0e22');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      canvas.refresh();
    }

    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'game-sky').setDepth(0).setScrollFactor(0);

    // Distant hills
    if (!this.textures.exists('game-hills')) {
      const hCanvas = this.textures.createCanvas('game-hills', GAME_WIDTH * 2, 180)!;
      const ctx = hCanvas.context;
      ctx.fillStyle = '#0c0c20';
      ctx.beginPath();
      ctx.moveTo(0, 180);
      for (let x = 0; x <= GAME_WIDTH * 2; x += 30) {
        const h = 40 + Math.sin(x * 0.006) * 50 + Math.sin(x * 0.018) * 25;
        ctx.lineTo(x, 180 - h);
      }
      ctx.lineTo(GAME_WIDTH * 2, 180);
      ctx.closePath();
      ctx.fill();
      hCanvas.refresh();
    }

    const hills = this.add.tileSprite(
      GAME_WIDTH / 2, CAR_FLOOR_Y - 200, GAME_WIDTH, 180, 'game-hills'
    ).setDepth(1).setScrollFactor(0);
    this.bgLayers.push(hills);

    // Foreground ground/tracks
    if (!this.textures.exists('game-ground')) {
      const gCanvas = this.textures.createCanvas('game-ground', GAME_WIDTH * 2, 300)!;
      const ctx = gCanvas.context;
      ctx.fillStyle = '#080814';
      ctx.fillRect(0, 0, GAME_WIDTH * 2, 300);
      // Rails
      ctx.strokeStyle = '#222240';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(GAME_WIDTH * 2, 8);
      ctx.moveTo(0, 16);
      ctx.lineTo(GAME_WIDTH * 2, 16);
      ctx.stroke();
      for (let x = 0; x < GAME_WIDTH * 2; x += 28) {
        ctx.strokeStyle = '#181830';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, 3);
        ctx.lineTo(x, 21);
        ctx.stroke();
      }
      gCanvas.refresh();
    }

    const ground = this.add.tileSprite(
      GAME_WIDTH / 2, CAR_FLOOR_Y + 100, GAME_WIDTH, 300, 'game-ground'
    ).setDepth(1).setScrollFactor(0);
    this.bgLayers.push(ground);
  }

  private createTrainPlatforms(): void {
    // Draw train car platforms as static physics bodies
    const trainGraphics = this.add.graphics().setDepth(10);
    const totalWidth = NUM_TRAIN_CARS * CAR_WIDTH + (NUM_TRAIN_CARS - 1) * CAR_GAP;
    const startX = (GAME_WIDTH - totalWidth) / 2;

    for (let i = 0; i < NUM_TRAIN_CARS; i++) {
      const x = startX + i * (CAR_WIDTH + CAR_GAP);

      // Car body
      trainGraphics.fillStyle(0x1a1a2e, 1);
      trainGraphics.fillRect(x, CAR_FLOOR_Y - 160, CAR_WIDTH, 200);
      trainGraphics.lineStyle(1, 0x333355, 1);
      trainGraphics.strokeRect(x, CAR_FLOOR_Y - 160, CAR_WIDTH, 200);

      // Floor platform
      trainGraphics.fillStyle(0x222244, 1);
      trainGraphics.fillRect(x, CAR_FLOOR_Y, CAR_WIDTH, 8);

      // Windows
      const windowSpacing = CAR_WIDTH / 6;
      for (let w = 0; w < 5; w++) {
        const wx = x + 20 + w * windowSpacing;
        trainGraphics.fillStyle(0x111122, 1);
        trainGraphics.fillRect(wx, CAR_FLOOR_Y - 140, 40, 25);
        // Dim glow
        trainGraphics.fillStyle(0xffaa33, 0.08);
        trainGraphics.fillRect(wx + 2, CAR_FLOOR_Y - 138, 36, 21);
      }

      // Roof walk area
      trainGraphics.fillStyle(0x191930, 1);
      trainGraphics.fillRect(x, CAR_FLOOR_Y - 168, CAR_WIDTH, 8);

      // Wheels
      trainGraphics.fillStyle(0x333344, 1);
      for (let wh = 0; wh < 4; wh++) {
        trainGraphics.fillCircle(x + 40 + wh * (CAR_WIDTH / 4), CAR_FLOOR_Y + 48, 10);
      }

      // Connector between cars
      if (i < NUM_TRAIN_CARS - 1) {
        trainGraphics.fillStyle(0x111120, 1);
        trainGraphics.fillRect(x + CAR_WIDTH, CAR_FLOOR_Y - 20, CAR_GAP, 24);
      }
    }

    // Create static physics platform for player to stand on
    // (one long invisible platform spanning all cars)
    const platform = this.add.rectangle(
      GAME_WIDTH / 2, CAR_FLOOR_Y + 4,
      totalWidth + (NUM_TRAIN_CARS - 1) * CAR_GAP, 8,
      0x000000, 0
    );
    this.physics.add.existing(platform, true); // true = static
    (this as any)._platform = platform;
  }

  private createPlayerPlaceholder(): void {
    // Simple rectangle sprite for the player until Player entity is created
    const totalWidth = NUM_TRAIN_CARS * CAR_WIDTH + (NUM_TRAIN_CARS - 1) * CAR_GAP;
    const startX = (GAME_WIDTH - totalWidth) / 2;
    const playerX = startX + CAR_WIDTH / 2; // Center of first car
    const playerY = CAR_FLOOR_Y - 24;

    if (!this.textures.exists('player-placeholder')) {
      const canvas = this.textures.createCanvas('player-placeholder', 24, 48)!;
      const ctx = canvas.context;
      // Body
      ctx.fillStyle = '#3366cc';
      ctx.fillRect(4, 12, 16, 28);
      // Head
      ctx.fillStyle = '#ccaa88';
      ctx.beginPath();
      ctx.arc(12, 8, 7, 0, Math.PI * 2);
      ctx.fill();
      // Gun arm
      ctx.fillStyle = '#555555';
      ctx.fillRect(18, 20, 6, 3);
      canvas.refresh();
    }

    const playerSprite = this.physics.add.sprite(playerX, playerY, 'player-placeholder');
    playerSprite.setDepth(20);
    playerSprite.setCollideWorldBounds(false);
    playerSprite.setBounce(0);
    (playerSprite.body as Phaser.Physics.Arcade.Body).setGravityY(800);
    (playerSprite.body as Phaser.Physics.Arcade.Body).setSize(20, 44);

    // Collide with platform
    const platform = (this as any)._platform;
    if (platform) {
      this.physics.add.collider(playerSprite, platform);
    }

    (this as any)._playerSprite = playerSprite;
    (this as any)._playerHp = this.getPlayerHp();
    (this as any)._playerMaxHp = this.getPlayerMaxHp();

    // Emit initial health
    EventBus.emit(GameEvents.HEALTH_CHANGED, {
      entity: null,
      hp: this.getPlayerHp(),
      maxHp: this.getPlayerMaxHp(),
      amount: 0,
    });
  }

  private initManagers(): void {
    // Managers are instantiated here once their source files exist.
    // Each manager is expected to accept (scene: GameScene) in its constructor.
    // Until then, the scene runs with its own built-in fallback logic above.
    //
    // Example (uncomment when managers exist):
    //   this.parallaxManager = new ParallaxManager(this);
    //   this.train = new Train(this);
    //   this.player = new Player(this, startX, startY);
    //   ...
  }

  private registerEvents(): void {
    // Zombie killed -> score + currency
    EventBus.on(GameEvents.ZOMBIE_KILLED, this.onZombieKilled, this);

    // Survivor rescued
    EventBus.on(GameEvents.SURVIVOR_RESCUED, this.onSurvivorRescued, this);

    // Player died
    EventBus.on(GameEvents.PLAYER_DIED, this.onPlayerDied, this);

    // Wave complete
    EventBus.on(GameEvents.WAVE_COMPLETE, this.onWaveComplete, this);

    // Boss defeated
    EventBus.on(GameEvents.BOSS_DEFEATED, this.onBossDefeated, this);

    // Upgrade purchased (from ShopScene)
    EventBus.on(GameEvents.UPGRADE_PURCHASED, this.onUpgradePurchased, this);

    // Item purchased (ammo/health from shop)
    EventBus.on(GameEvents.ITEM_PURCHASED, this.onItemPurchased, this);

    // Game resumed (from PauseScene)
    EventBus.on(GameEvents.GAME_RESUMED, this.onGameResumed, this);

    // Clean up on shutdown
    this.events.once('shutdown', this.cleanup, this);
    this.events.once('destroy', this.cleanup, this);
  }

  private cleanup(): void {
    EventBus.off(GameEvents.ZOMBIE_KILLED, this.onZombieKilled, this);
    EventBus.off(GameEvents.SURVIVOR_RESCUED, this.onSurvivorRescued, this);
    EventBus.off(GameEvents.PLAYER_DIED, this.onPlayerDied, this);
    EventBus.off(GameEvents.WAVE_COMPLETE, this.onWaveComplete, this);
    EventBus.off(GameEvents.BOSS_DEFEATED, this.onBossDefeated, this);
    EventBus.off(GameEvents.UPGRADE_PURCHASED, this.onUpgradePurchased, this);
    EventBus.off(GameEvents.ITEM_PURCHASED, this.onItemPurchased, this);
    EventBus.off(GameEvents.GAME_RESUMED, this.onGameResumed, this);

    this.inputManager.destroy();

    // Stop HUD
    if (this.scene.isActive('HudScene')) {
      this.scene.stop('HudScene');
    }
  }

  // ------------------------------------------------------------------
  // Parallax update
  // ------------------------------------------------------------------

  private updateParallax(delta: number): void {
    const dt = delta / 1000;
    this.scrollOffset += TRAIN_SCROLL_SPEED * dt;

    if (this.bgLayers.length >= 1) {
      this.bgLayers[0].tilePositionX = this.scrollOffset * 0.2; // hills
    }
    if (this.bgLayers.length >= 2) {
      this.bgLayers[1].tilePositionX = this.scrollOffset * 1.0; // ground
    }
  }

  // ------------------------------------------------------------------
  // Player movement (built-in fallback)
  // ------------------------------------------------------------------

  private updatePlayerMovement(input: any, _delta: number): void {
    const sprite = (this as any)._playerSprite as Phaser.Physics.Arcade.Sprite;
    if (!sprite || !sprite.active) return;

    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const speed = 200;

    // Horizontal movement
    body.setVelocityX(input.moveX * speed);

    // Flip sprite based on direction
    if (input.moveX < 0) {
      sprite.setFlipX(true);
    } else if (input.moveX > 0) {
      sprite.setFlipX(false);
    }

    // Jump
    if (input.jumping && body.blocked.down) {
      body.setVelocityY(-420);
    }

    // Clamp to world bounds loosely
    const totalWidth = NUM_TRAIN_CARS * CAR_WIDTH + (NUM_TRAIN_CARS - 1) * CAR_GAP;
    const startX = (GAME_WIDTH - totalWidth) / 2;
    if (sprite.x < startX) sprite.x = startX;
    if (sprite.x > startX + totalWidth) sprite.x = startX + totalWidth;
  }

  // ------------------------------------------------------------------
  // Wave system (built-in fallback)
  // ------------------------------------------------------------------

  private beginWaveCountdown(): void {
    this.betweenWaves = true;
    this.waveCountdownTimer = WAVE_COUNTDOWN_MS;

    const nextWave = this.currentWave + 1;
    EventBus.emit(GameEvents.WAVE_COUNTDOWN, {
      wave: nextWave,
      timeMs: this.waveCountdownTimer,
    });
  }

  private startWave(): void {
    this.currentWave++;
    this.betweenWaves = false;
    this.waveActive = true;

    const waveDef: WaveDefinition = getWaveDefinition(this.currentWave);

    // Build spawn queue
    this.waveSpawnQueue = waveDef.composition.map(c => ({
      type: c.type,
      count: c.count,
    }));
    this.waveSpawnInterval = waveDef.spawnInterval;
    this.waveSpawnTimer = 0;

    this.waveZombiesTotal = waveDef.composition.reduce((s, c) => s + c.count, 0);
    this.waveZombiesRemaining = this.waveZombiesTotal;

    EventBus.emit(GameEvents.WAVE_START, {
      wave: this.currentWave,
      totalZombies: this.waveZombiesTotal,
      boss: waveDef.boss || null,
    });

    if (waveDef.boss) {
      EventBus.emit(GameEvents.BOSS_INCOMING, {
        wave: this.currentWave,
        bossType: waveDef.boss,
      });
    }
  }

  private updateWave(_time: number, delta: number): void {
    if (this.betweenWaves) {
      this.waveCountdownTimer -= delta;
      if (this.waveCountdownTimer <= 0) {
        this.startWave();
      }
      return;
    }

    if (!this.waveActive) return;

    // Spawn zombies from queue
    this.waveSpawnTimer -= delta;
    if (this.waveSpawnTimer <= 0 && this.waveSpawnQueue.length > 0) {
      this.waveSpawnTimer = this.waveSpawnInterval;

      // Find a non-empty entry
      for (let i = 0; i < this.waveSpawnQueue.length; i++) {
        if (this.waveSpawnQueue[i].count > 0) {
          this.waveSpawnQueue[i].count--;

          // Spawn via SpawnManager if available
          if (this.spawnManager?.spawnZombie) {
            this.spawnManager.spawnZombie(this.waveSpawnQueue[i].type);
          }
          // else: zombie spawning is handled by SpawnManager when it exists

          break;
        }
      }

      // Clean up empty entries
      this.waveSpawnQueue = this.waveSpawnQueue.filter(e => e.count > 0);
    }

    // Check if wave is complete (no more spawns and no living zombies)
    if (this.waveSpawnQueue.length === 0 && this.waveZombiesRemaining <= 0) {
      this.waveActive = false;
      EventBus.emit(GameEvents.WAVE_COMPLETE, { wave: this.currentWave });
    }
  }

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  private onZombieKilled(data: { type: string; points: number; currency: number }): void {
    this.zombiesKilled++;
    this.waveZombiesRemaining = Math.max(0, this.waveZombiesRemaining - 1);

    // Score
    const points = data?.points ?? 10;
    this.score += points;
    EventBus.emit(GameEvents.SCORE_CHANGED, this.score);

    // Currency
    const curr = data?.currency ?? BASE_CURRENCY_PER_KILL;
    this.addCurrency(curr);
  }

  private onSurvivorRescued(): void {
    this.survivorsRescued++;
  }

  private onPlayerDied(): void {
    this.gameState = GameState.GAME_OVER;
    this.inputManager.disable();

    // Save high score
    this.saveHighScore();

    // Launch game over scene after a brief delay
    this.time.delayedCall(800, () => {
      this.scene.launch('GameOverScene', {
        score: this.score,
        wave: this.currentWave,
        zombiesKilled: this.zombiesKilled,
        survivorsRescued: this.survivorsRescued,
      });
      this.scene.pause();
    });
  }

  private onWaveComplete(_data: any): void {
    // Award wave bonus
    this.addCurrency(WAVE_BONUS_CURRENCY);

    // Open shop
    this.time.delayedCall(1500, () => {
      if (this.gameState === GameState.PLAYING) {
        this.gameState = GameState.SHOP;
        this.scene.launch('ShopScene', {
          currency: this.currency,
          wave: this.currentWave,
          purchasedUpgrades: [...this.purchasedUpgrades],
        });
        this.scene.pause();
      }
    });
  }

  private onBossDefeated(data: { bossType: string }): void {
    // Extra reward for boss
    this.addCurrency(200);
    this.score += 500;
    EventBus.emit(GameEvents.SCORE_CHANGED, this.score);
  }

  private onUpgradePurchased(data: { upgradeId: string; cost: number }): void {
    if (data.cost <= this.currency) {
      this.currency -= data.cost;
      this.purchasedUpgrades.push(data.upgradeId);
      EventBus.emit(GameEvents.CURRENCY_CHANGED, this.currency);
    }
  }

  private onItemPurchased(data: { itemType: string; cost: number }): void {
    if (data.cost <= this.currency) {
      this.currency -= data.cost;
      EventBus.emit(GameEvents.CURRENCY_CHANGED, this.currency);
    }
  }

  private onGameResumed(): void {
    this.gameState = GameState.PLAYING;
    this.scene.resume();
    this.inputManager.enable();

    // If coming back from shop, start next wave
    if (!this.waveActive && !this.betweenWaves) {
      this.beginWaveCountdown();
    }
  }

  // ------------------------------------------------------------------
  // Pause / Resume
  // ------------------------------------------------------------------

  public pauseGame(): void {
    if (this.gameState !== GameState.PLAYING) return;
    this.gameState = GameState.PAUSED;
    this.scene.launch('PauseScene');
    this.scene.pause();
    EventBus.emit(GameEvents.GAME_PAUSED);
  }

  public resumeGame(): void {
    this.gameState = GameState.PLAYING;
    this.scene.resume();
    EventBus.emit(GameEvents.GAME_RESUMED);
  }

  // ------------------------------------------------------------------
  // Save / Load
  // ------------------------------------------------------------------

  public saveGame(): void {
    const saveData: SaveData = {
      version: SAVE_VERSION,
      wave: this.currentWave,
      score: this.score,
      currency: this.currency,
      playerHp: this.getPlayerHp(),
      playerMaxHp: this.getPlayerMaxHp(),
      weapons: this.getWeaponsSaveData(),
      upgrades: [...this.purchasedUpgrades],
      survivors: this.survivorsRescued,
      settings: this.getSettings(),
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
      EventBus.emit(GameEvents.GAME_SAVED);
    } catch (e) {
      console.error('Failed to save game:', e);
    }
  }

  private loadFromSave(save: SaveData): void {
    this.currentWave = save.wave;
    this.score = save.score;
    this.currency = save.currency;
    this.purchasedUpgrades = save.upgrades || [];
    this.survivorsRescued = save.survivors || 0;

    // Player HP and weapons will be applied in create() once the
    // Player entity is instantiated.
    (this as any)._savedPlayerHp = save.playerHp;
    (this as any)._savedPlayerMaxHp = save.playerMaxHp;
    (this as any)._savedWeapons = save.weapons;
  }

  private saveHighScore(): void {
    try {
      const current = parseInt(localStorage.getItem('grim-zombie-train-highscore') || '0', 10);
      if (this.score > current) {
        localStorage.setItem('grim-zombie-train-highscore', String(this.score));
      }
    } catch {
      // localStorage not available
    }
  }

  // ------------------------------------------------------------------
  // Currency
  // ------------------------------------------------------------------

  private addCurrency(amount: number): void {
    this.currency += amount;
    EventBus.emit(GameEvents.CURRENCY_CHANGED, this.currency);
  }

  public spendCurrency(amount: number): boolean {
    if (this.currency < amount) return false;
    this.currency -= amount;
    EventBus.emit(GameEvents.CURRENCY_CHANGED, this.currency);
    return true;
  }

  // ------------------------------------------------------------------
  // Getters (used by HUD, Shop, etc.)
  // ------------------------------------------------------------------

  public getScore(): number {
    return this.score;
  }

  public getCurrency(): number {
    return this.currency;
  }

  public getCurrentWave(): number {
    return this.currentWave;
  }

  public getZombiesKilled(): number {
    return this.zombiesKilled;
  }

  public getSurvivorsRescued(): number {
    return this.survivorsRescued;
  }

  public getWaveZombiesRemaining(): number {
    return this.waveZombiesRemaining;
  }

  public isWaveActive(): boolean {
    return this.waveActive;
  }

  public getPurchasedUpgrades(): string[] {
    return this.purchasedUpgrades;
  }

  public getPlayerHp(): number {
    if (this.player?.hp != null) return this.player.hp;
    return (this as any)._savedPlayerHp ?? PLAYER_START_HP;
  }

  public getPlayerMaxHp(): number {
    if (this.player?.maxHp != null) return this.player.maxHp;
    return (this as any)._savedPlayerMaxHp ?? PLAYER_MAX_HP;
  }

  public getGameState(): GameState {
    return this.gameState;
  }

  // Stub: weapon save data
  private getWeaponsSaveData(): any[] {
    if (this.player?.getWeaponsSaveData) {
      return this.player.getWeaponsSaveData();
    }
    return [
      { type: WeaponType.PISTOL, ammo: 12, reserve: 999, level: 1 },
    ];
  }

  // Stub: settings
  private getSettings(): any {
    return {
      masterVolume: 0.7,
      musicVolume: 0.5,
      sfxVolume: 0.8,
      screenShake: true,
      showDamageNumbers: true,
      showMinimap: true,
    };
  }
}
