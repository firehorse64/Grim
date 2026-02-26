import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TRAIN_SCROLL_SPEED } from '../data/BalanceConstants';
import { SAVE_KEY } from '../types/SaveTypes';
import { EventBus } from '../utils/EventBus';

/**
 * MenuScene - Title screen with dark, atmospheric aesthetic.
 *
 * Features:
 *   - "ZOMBIE TRAIN" title with red glow, "SURVIVAL" subtitle
 *   - Parallax scrolling background layers depicting a moving train
 *   - Rain particle effect and occasional lightning flashes
 *   - Menu buttons: NEW GAME, CONTINUE, SETTINGS
 *   - High score display from localStorage
 *   - Keyboard (Enter/Space) and mouse support
 */
export class MenuScene extends Phaser.Scene {
  // Parallax layers (drawn with graphics, no assets required)
  private skyLayer!: Phaser.GameObjects.TileSprite;
  private mountainLayer!: Phaser.GameObjects.TileSprite;
  private treesLayer!: Phaser.GameObjects.TileSprite;
  private groundLayer!: Phaser.GameObjects.TileSprite;
  private trainLayer!: Phaser.GameObjects.Graphics;

  // UI elements
  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private buttons: Phaser.GameObjects.Container[] = [];
  private selectedIndex: number = 0;
  private highScoreText!: Phaser.GameObjects.Text;

  // Rain
  private rainParticles: { x: number; y: number; speed: number; length: number }[] = [];
  private rainGraphics!: Phaser.GameObjects.Graphics;

  // Lightning
  private lightningOverlay!: Phaser.GameObjects.Rectangle;
  private nextLightningTime: number = 0;

  // Title glow
  private titleGlow!: Phaser.GameObjects.Text;
  private glowPulse: number = 0;

  // Input
  private enterKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private wKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;

  // Parallax scroll offsets
  private scrollOffset: number = 0;

  // Train wheel animation
  private trainTime: number = 0;

  // Has a save file?
  private hasSave: boolean = false;

  constructor() {
    super({ key: 'MenuScene' });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  create(): void {
    this.hasSave = this.checkForSave();

    this.createParallaxTextures();
    this.createParallaxLayers();
    this.createTrain();
    this.createRain();
    this.createLightning();
    this.createTitle();
    this.createButtons();
    this.createHighScore();
    this.createInput();

    // Emit event for AudioManager to start menu music
    EventBus.emit('play-music', 'menu');

    // Initial lightning timer
    this.nextLightningTime = this.time.now + Phaser.Math.Between(5000, 12000);

    // Fade in
    this.cameras.main.fadeIn(800, 0, 0, 0);
  }

  update(time: number, delta: number): void {
    this.updateParallax(delta);
    this.updateRain(delta);
    this.updateLightning(time);
    this.updateTitleGlow(time);
    this.updateTrainAnimation(time, delta);
    this.handleInput();
  }

  // ------------------------------------------------------------------
  // Parallax background - generate textures procedurally
  // ------------------------------------------------------------------

  private createParallaxTextures(): void {
    // Sky gradient
    if (!this.textures.exists('menu-sky')) {
      const skyCanvas = this.textures.createCanvas('menu-sky', GAME_WIDTH, GAME_HEIGHT)!;
      const ctx = skyCanvas.context;
      const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      gradient.addColorStop(0, '#0a0a1a');
      gradient.addColorStop(0.4, '#121230');
      gradient.addColorStop(0.7, '#1a1a3a');
      gradient.addColorStop(1, '#0d0d20');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      skyCanvas.refresh();
    }

    // Mountains silhouette
    if (!this.textures.exists('menu-mountains')) {
      const mCanvas = this.textures.createCanvas('menu-mountains', GAME_WIDTH * 2, 200)!;
      const ctx = mCanvas.context;
      ctx.fillStyle = '#0e0e24';
      ctx.beginPath();
      ctx.moveTo(0, 200);
      for (let x = 0; x < GAME_WIDTH * 2; x += 40) {
        const h = 40 + Math.sin(x * 0.008) * 60 + Math.sin(x * 0.023) * 30 + Math.random() * 10;
        ctx.lineTo(x, 200 - h);
      }
      ctx.lineTo(GAME_WIDTH * 2, 200);
      ctx.closePath();
      ctx.fill();
      mCanvas.refresh();
    }

    // Trees silhouette
    if (!this.textures.exists('menu-trees')) {
      const tCanvas = this.textures.createCanvas('menu-trees', GAME_WIDTH * 2, 160)!;
      const ctx = tCanvas.context;
      ctx.fillStyle = '#080818';
      ctx.beginPath();
      ctx.moveTo(0, 160);
      for (let x = 0; x < GAME_WIDTH * 2; x += 15) {
        const h = 30 + Math.sin(x * 0.04) * 25 + Math.random() * 50;
        ctx.lineTo(x, 160 - h);
        ctx.lineTo(x + 8, 160 - h + 10);
      }
      ctx.lineTo(GAME_WIDTH * 2, 160);
      ctx.closePath();
      ctx.fill();
      mCanvas.refresh();
    }

    // Ground
    if (!this.textures.exists('menu-ground')) {
      const gCanvas = this.textures.createCanvas('menu-ground', GAME_WIDTH * 2, 80)!;
      const ctx = gCanvas.context;
      ctx.fillStyle = '#0a0a16';
      ctx.fillRect(0, 0, GAME_WIDTH * 2, 80);
      // Track rails
      ctx.strokeStyle = '#222244';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(GAME_WIDTH * 2, 10);
      ctx.moveTo(0, 18);
      ctx.lineTo(GAME_WIDTH * 2, 18);
      ctx.stroke();
      // Sleepers
      ctx.strokeStyle = '#1a1a30';
      ctx.lineWidth = 3;
      for (let x = 0; x < GAME_WIDTH * 2; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 5);
        ctx.lineTo(x, 23);
        ctx.stroke();
      }
      gCanvas.refresh();
    }
  }

  private createParallaxLayers(): void {
    // Sky (static background)
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'menu-sky').setDepth(0);

    // Stars
    const starsGfx = this.add.graphics().setDepth(1);
    for (let i = 0; i < 80; i++) {
      const sx = Math.random() * GAME_WIDTH;
      const sy = Math.random() * (GAME_HEIGHT * 0.5);
      const brightness = 0.2 + Math.random() * 0.6;
      const size = Math.random() > 0.9 ? 2 : 1;
      starsGfx.fillStyle(0xffffff, brightness);
      starsGfx.fillRect(sx, sy, size, size);
    }

    // Mountains
    this.mountainLayer = this.add.tileSprite(
      GAME_WIDTH / 2, GAME_HEIGHT - 200, GAME_WIDTH, 200, 'menu-mountains'
    ).setDepth(2);

    // Trees
    this.treesLayer = this.add.tileSprite(
      GAME_WIDTH / 2, GAME_HEIGHT - 120, GAME_WIDTH, 160, 'menu-trees'
    ).setDepth(3);

    // Ground / tracks
    this.groundLayer = this.add.tileSprite(
      GAME_WIDTH / 2, GAME_HEIGHT - 30, GAME_WIDTH, 80, 'menu-ground'
    ).setDepth(5);
  }

  private createTrain(): void {
    this.trainLayer = this.add.graphics().setDepth(4);
  }

  private updateParallax(delta: number): void {
    const dt = delta / 1000;
    this.scrollOffset += TRAIN_SCROLL_SPEED * dt;

    this.mountainLayer.tilePositionX = this.scrollOffset * 0.15;
    this.treesLayer.tilePositionX = this.scrollOffset * 0.4;
    this.groundLayer.tilePositionX = this.scrollOffset * 1.0;
  }

  // ------------------------------------------------------------------
  // Train drawing (procedural)
  // ------------------------------------------------------------------

  private updateTrainAnimation(_time: number, delta: number): void {
    this.trainTime += delta;
    const g = this.trainLayer;
    g.clear();

    const trainY = GAME_HEIGHT - 100;
    const trainX = GAME_WIDTH / 2 - 200;
    const bounce = Math.sin(this.trainTime * 0.004) * 1.5;

    // Locomotive
    g.fillStyle(0x222233, 1);
    g.fillRect(trainX, trainY + bounce, 160, 50);
    g.fillStyle(0x1a1a2a, 1);
    g.fillRect(trainX + 10, trainY - 20 + bounce, 80, 20);
    // Smokestack
    g.fillStyle(0x333344, 1);
    g.fillRect(trainX + 20, trainY - 40 + bounce, 16, 20);
    // Window (lit)
    g.fillStyle(0xffcc44, 0.6);
    g.fillRect(trainX + 110, trainY + 8 + bounce, 20, 16);

    // Cars
    for (let i = 0; i < 3; i++) {
      const cx = trainX + 180 + i * 140;
      const carBounce = Math.sin((this.trainTime + i * 200) * 0.004) * 1.5;
      g.fillStyle(0x1a1a2e, 1);
      g.fillRect(cx, trainY + carBounce, 120, 45);
      g.lineStyle(1, 0x333355, 1);
      g.strokeRect(cx, trainY + carBounce, 120, 45);
      // Lit windows
      for (let w = 0; w < 3; w++) {
        g.fillStyle(0xffaa33, 0.3 + Math.sin(this.trainTime * 0.002 + w + i) * 0.15);
        g.fillRect(cx + 12 + w * 35, trainY + 8 + carBounce, 22, 14);
      }
    }

    // Wheels (animated rotation via visual dots)
    g.fillStyle(0x444455, 1);
    const wheelPositions = [trainX + 30, trainX + 130];
    for (let i = 0; i < 3; i++) {
      wheelPositions.push(trainX + 200 + i * 140);
      wheelPositions.push(trainX + 280 + i * 140);
    }
    for (const wx of wheelPositions) {
      g.fillCircle(wx, trainY + 52 + bounce, 8);
      // Rotating spoke
      const angle = this.scrollOffset * 0.05;
      g.lineStyle(1, 0x666677, 1);
      g.beginPath();
      g.moveTo(wx, trainY + 52 + bounce);
      g.lineTo(
        wx + Math.cos(angle) * 6,
        trainY + 52 + bounce + Math.sin(angle) * 6
      );
      g.strokePath();
    }
  }

  // ------------------------------------------------------------------
  // Rain particles
  // ------------------------------------------------------------------

  private createRain(): void {
    this.rainGraphics = this.add.graphics().setDepth(50);
    this.rainParticles = [];
    for (let i = 0; i < 200; i++) {
      this.rainParticles.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        speed: 300 + Math.random() * 400,
        length: 6 + Math.random() * 10,
      });
    }
  }

  private updateRain(delta: number): void {
    const dt = delta / 1000;
    this.rainGraphics.clear();
    this.rainGraphics.lineStyle(1, 0x6688aa, 0.25);

    for (const drop of this.rainParticles) {
      drop.y += drop.speed * dt;
      drop.x -= 30 * dt; // slight wind angle

      if (drop.y > GAME_HEIGHT) {
        drop.y = -drop.length;
        drop.x = Math.random() * (GAME_WIDTH + 50);
      }
      if (drop.x < -10) {
        drop.x = GAME_WIDTH + 10;
      }

      this.rainGraphics.beginPath();
      this.rainGraphics.moveTo(drop.x, drop.y);
      this.rainGraphics.lineTo(drop.x - 2, drop.y + drop.length);
      this.rainGraphics.strokePath();
    }
  }

  // ------------------------------------------------------------------
  // Lightning
  // ------------------------------------------------------------------

  private createLightning(): void {
    this.lightningOverlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0xccccff, 0
    ).setDepth(60);
  }

  private updateLightning(time: number): void {
    if (time >= this.nextLightningTime) {
      // Flash sequence: quick double flash
      this.tweens.add({
        targets: this.lightningOverlay,
        alpha: { from: 0.4, to: 0 },
        duration: 100,
        onComplete: () => {
          this.time.delayedCall(80, () => {
            this.tweens.add({
              targets: this.lightningOverlay,
              alpha: { from: 0.25, to: 0 },
              duration: 150,
            });
          });
        },
      });

      this.nextLightningTime = time + Phaser.Math.Between(6000, 18000);
    }
  }

  // ------------------------------------------------------------------
  // Title text
  // ------------------------------------------------------------------

  private createTitle(): void {
    const centerX = GAME_WIDTH / 2;

    // Glow layer (behind the main title)
    this.titleGlow = this.add.text(centerX, 140, 'ZOMBIE TRAIN', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '72px',
      color: '#ff0000',
      fontStyle: 'bold',
    })
      .setOrigin(0.5, 0.5)
      .setDepth(100)
      .setAlpha(0.4);

    // Main title
    this.titleText = this.add.text(centerX, 140, 'ZOMBIE TRAIN', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '72px',
      color: '#cc0000',
      fontStyle: 'bold',
      stroke: '#330000',
      strokeThickness: 4,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#000000',
        blur: 8,
        fill: true,
        stroke: true,
      },
    })
      .setOrigin(0.5, 0.5)
      .setDepth(101);

    // Subtitle
    this.subtitleText = this.add.text(centerX, 200, 'S U R V I V A L', {
      fontFamily: '"Courier New", monospace',
      fontSize: '24px',
      color: '#ccaa22',
      fontStyle: 'bold',
      letterSpacing: 8,
      stroke: '#332200',
      strokeThickness: 2,
    })
      .setOrigin(0.5, 0.5)
      .setDepth(101);
  }

  private updateTitleGlow(time: number): void {
    this.glowPulse = (Math.sin(time * 0.003) + 1) * 0.5; // 0-1
    this.titleGlow.setAlpha(0.2 + this.glowPulse * 0.35);
    this.titleGlow.setScale(1.02 + this.glowPulse * 0.02);
  }

  // ------------------------------------------------------------------
  // Menu buttons
  // ------------------------------------------------------------------

  private createButtons(): void {
    const centerX = GAME_WIDTH / 2;
    let startY = 320;

    const buttonDefs: { label: string; action: () => void; enabled: boolean }[] = [
      { label: 'NEW GAME', action: () => this.startNewGame(), enabled: true },
      { label: 'CONTINUE', action: () => this.continueGame(), enabled: this.hasSave },
      { label: 'SETTINGS', action: () => this.openSettings(), enabled: true },
    ];

    for (let i = 0; i < buttonDefs.length; i++) {
      const def = buttonDefs[i];
      const y = startY + i * 60;

      const container = this.add.container(centerX, y).setDepth(110);

      // Background rectangle
      const bg = this.add.rectangle(0, 0, 260, 44, 0x111122, 0.7)
        .setStrokeStyle(1, 0x444466);

      // Text
      const textColor = def.enabled ? '#ccccdd' : '#444455';
      const text = this.add.text(0, 0, def.label, {
        fontFamily: '"Courier New", monospace',
        fontSize: '20px',
        color: textColor,
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5);

      container.add([bg, text]);
      container.setSize(260, 44);

      if (def.enabled) {
        container.setInteractive(
          new Phaser.Geom.Rectangle(-130, -22, 260, 44),
          Phaser.Geom.Rectangle.Contains
        );

        container.on('pointerover', () => {
          this.selectButton(i);
        });

        container.on('pointerdown', () => {
          def.action();
        });
      }

      this.buttons.push(container);
    }

    this.selectButton(0);
  }

  private selectButton(index: number): void {
    // Deselect previous
    for (let i = 0; i < this.buttons.length; i++) {
      const container = this.buttons[i];
      const bg = container.getAt(0) as Phaser.GameObjects.Rectangle;
      const text = container.getAt(1) as Phaser.GameObjects.Text;

      if (i === index) {
        bg.setFillStyle(0x220022, 0.9);
        bg.setStrokeStyle(2, 0xcc3333);
        text.setColor('#ff4444');
        text.setScale(1.05);
      } else {
        const enabled = i !== 1 || this.hasSave;
        bg.setFillStyle(0x111122, 0.7);
        bg.setStrokeStyle(1, 0x444466);
        text.setColor(enabled ? '#ccccdd' : '#444455');
        text.setScale(1.0);
      }
    }
    this.selectedIndex = index;
  }

  // ------------------------------------------------------------------
  // High score
  // ------------------------------------------------------------------

  private createHighScore(): void {
    const highScore = this.getHighScore();
    if (highScore > 0) {
      this.highScoreText = this.add.text(
        GAME_WIDTH / 2, GAME_HEIGHT - 60,
        `HIGH SCORE: ${highScore.toLocaleString()}`,
        {
          fontFamily: '"Courier New", monospace',
          fontSize: '16px',
          color: '#888899',
        }
      )
        .setOrigin(0.5, 0.5)
        .setDepth(110);
    }

    // Version / credits
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, 'v0.1.0', {
      fontFamily: '"Courier New", monospace',
      fontSize: '12px',
      color: '#444455',
    })
      .setOrigin(0.5, 0.5)
      .setDepth(110);
  }

  // ------------------------------------------------------------------
  // Input handling
  // ------------------------------------------------------------------

  private createInput(): void {
    const kb = this.input.keyboard!;
    this.enterKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.upKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.wKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.sKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
  }

  private handleInput(): void {
    // Navigate up
    if (Phaser.Input.Keyboard.JustDown(this.upKey) || Phaser.Input.Keyboard.JustDown(this.wKey)) {
      let newIndex = this.selectedIndex - 1;
      if (newIndex < 0) newIndex = this.buttons.length - 1;
      // Skip disabled buttons
      if (newIndex === 1 && !this.hasSave) {
        newIndex = 0;
      }
      this.selectButton(newIndex);
    }

    // Navigate down
    if (Phaser.Input.Keyboard.JustDown(this.downKey) || Phaser.Input.Keyboard.JustDown(this.sKey)) {
      let newIndex = this.selectedIndex + 1;
      if (newIndex >= this.buttons.length) newIndex = 0;
      // Skip disabled buttons
      if (newIndex === 1 && !this.hasSave) {
        newIndex = 2;
      }
      this.selectButton(newIndex);
    }

    // Confirm
    if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.activateButton(this.selectedIndex);
    }
  }

  private activateButton(index: number): void {
    switch (index) {
      case 0:
        this.startNewGame();
        break;
      case 1:
        if (this.hasSave) this.continueGame();
        break;
      case 2:
        this.openSettings();
        break;
    }
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  private startNewGame(): void {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      EventBus.emit('stop-music');
      this.scene.start('GameScene', { newGame: true });
    });
  }

  private continueGame(): void {
    const saveRaw = localStorage.getItem(SAVE_KEY);
    if (!saveRaw) return;

    try {
      const saveData = JSON.parse(saveRaw);
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        EventBus.emit('stop-music');
        this.scene.start('GameScene', { newGame: false, saveData });
      });
    } catch {
      // Corrupted save - ignore
      console.warn('Failed to parse save data');
    }
  }

  private openSettings(): void {
    // For now, settings could be a sub-menu or its own scene.
    // Emit an event so the game can handle it flexibly.
    EventBus.emit('open-settings');
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private checkForSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data && data.version != null;
    } catch {
      return false;
    }
  }

  private getHighScore(): number {
    try {
      const raw = localStorage.getItem('grim-zombie-train-highscore');
      return raw ? parseInt(raw, 10) || 0 : 0;
    } catch {
      return 0;
    }
  }
}
