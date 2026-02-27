import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';
import { isMobileDevice } from '../systems/TouchDetect';

/**
 * GameOverScene - Displayed when the player dies.
 *
 * Shows final stats (score, waves survived, zombies killed, survivors rescued),
 * checks for a new high score, and allows restart or return to menu.
 */

interface GameOverData {
  score: number;
  wave: number;
  zombiesKilled: number;
  survivorsRescued: number;
}

export class GameOverScene extends Phaser.Scene {
  // ---- Stats ----
  private finalScore: number = 0;
  private finalWave: number = 0;
  private finalKills: number = 0;
  private finalSurvivors: number = 0;
  private isNewHighScore: boolean = false;

  // ---- UI ----
  private overlay!: Phaser.GameObjects.Rectangle;
  private redTint!: Phaser.GameObjects.Rectangle;
  private titleText!: Phaser.GameObjects.Text;
  private statsTexts: Phaser.GameObjects.Text[] = [];
  private highScoreText!: Phaser.GameObjects.Text;
  private restartPrompt!: Phaser.GameObjects.Text;
  private menuButton!: Phaser.GameObjects.Container;

  // ---- Input ----
  private rKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;

  // ---- Particles (blood drip effect) ----
  private dripGraphics!: Phaser.GameObjects.Graphics;
  private drips: { x: number; y: number; speed: number; length: number }[] = [];

  constructor() {
    super({ key: 'GameOverScene' });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  init(data: GameOverData): void {
    this.finalScore = data?.score ?? 0;
    this.finalWave = data?.wave ?? 0;
    this.finalKills = data?.zombiesKilled ?? 0;
    this.finalSurvivors = data?.survivorsRescued ?? 0;

    // Check high score
    this.isNewHighScore = this.checkHighScore();
  }

  create(): void {
    this.createOverlay();
    this.createDrips();
    this.createTitle();
    this.createStats();
    this.createHighScoreNotice();
    this.createRestartPrompt();
    this.createMenuButton();
    this.createInput();

    // Animate in
    this.animateIn();
  }

  update(_time: number, delta: number): void {
    this.updateDrips(delta);
  }

  // ------------------------------------------------------------------
  // Overlay
  // ------------------------------------------------------------------

  private createOverlay(): void {
    // Dark base
    this.overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x000000, 0
    ).setDepth(0);

    // Red tint
    this.redTint = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x330000, 0
    ).setDepth(1);
  }

  private animateIn(): void {
    this.tweens.add({
      targets: this.overlay,
      alpha: 0.8,
      duration: 600,
    });

    this.tweens.add({
      targets: this.redTint,
      alpha: 0.25,
      duration: 800,
      delay: 200,
    });
  }

  // ------------------------------------------------------------------
  // Blood drip effect
  // ------------------------------------------------------------------

  private createDrips(): void {
    this.dripGraphics = this.add.graphics().setDepth(2);
    this.drips = [];

    // Drips falling from the top
    for (let i = 0; i < 30; i++) {
      this.drips.push({
        x: Math.random() * GAME_WIDTH,
        y: -Math.random() * GAME_HEIGHT * 0.3,
        speed: 20 + Math.random() * 40,
        length: 15 + Math.random() * 40,
      });
    }
  }

  private updateDrips(delta: number): void {
    const dt = delta / 1000;
    this.dripGraphics.clear();

    for (const drip of this.drips) {
      drip.y += drip.speed * dt;

      if (drip.y > GAME_HEIGHT + drip.length) {
        drip.y = -drip.length - Math.random() * 100;
        drip.x = Math.random() * GAME_WIDTH;
      }

      // Draw drip as a thin red line
      this.dripGraphics.lineStyle(2, 0x880000, 0.3);
      this.dripGraphics.beginPath();
      this.dripGraphics.moveTo(drip.x, drip.y);
      this.dripGraphics.lineTo(drip.x, drip.y + drip.length);
      this.dripGraphics.strokePath();

      // Drip head (brighter)
      this.dripGraphics.fillStyle(0xaa0000, 0.5);
      this.dripGraphics.fillCircle(drip.x, drip.y + drip.length, 1.5);
    }
  }

  // ------------------------------------------------------------------
  // Title
  // ------------------------------------------------------------------

  private createTitle(): void {
    this.titleText = this.add.text(GAME_WIDTH / 2, 120, 'GAME OVER', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '72px',
      color: '#cc0000',
      fontStyle: 'bold',
      stroke: '#220000',
      strokeThickness: 4,
      shadow: {
        offsetX: 3,
        offsetY: 3,
        color: '#000000',
        blur: 12,
        fill: true,
        stroke: true,
      },
    })
      .setOrigin(0.5, 0.5)
      .setDepth(10)
      .setAlpha(0);

    // Animate title
    this.tweens.add({
      targets: this.titleText,
      alpha: 1,
      scale: { from: 1.5, to: 1 },
      duration: 600,
      delay: 300,
      ease: 'Back.easeOut',
    });
  }

  // ------------------------------------------------------------------
  // Stats
  // ------------------------------------------------------------------

  private createStats(): void {
    const stats = [
      { label: 'SCORE', value: this.finalScore.toLocaleString() },
      { label: 'WAVES SURVIVED', value: String(this.finalWave) },
      { label: 'ZOMBIES KILLED', value: String(this.finalKills) },
      { label: 'SURVIVORS RESCUED', value: String(this.finalSurvivors) },
    ];

    const startY = 220;
    const spacing = 40;
    const centerX = GAME_WIDTH / 2;

    for (let i = 0; i < stats.length; i++) {
      const y = startY + i * spacing;

      // Label (left-aligned)
      const label = this.add.text(centerX - 140, y, stats[i].label, {
        fontFamily: '"Courier New", monospace',
        fontSize: '16px',
        color: '#886666',
        fontStyle: 'bold',
      })
        .setOrigin(0, 0.5)
        .setDepth(10)
        .setAlpha(0);

      // Value (right-aligned)
      const value = this.add.text(centerX + 140, y, stats[i].value, {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        color: '#ccccdd',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      })
        .setOrigin(1, 0.5)
        .setDepth(10)
        .setAlpha(0);

      // Separator line
      const lineGfx = this.add.graphics().setDepth(10).setAlpha(0);
      lineGfx.lineStyle(1, 0x443333, 0.3);
      lineGfx.beginPath();
      lineGfx.moveTo(centerX - 140, y + 16);
      lineGfx.lineTo(centerX + 140, y + 16);
      lineGfx.strokePath();

      // Staggered fade in
      const delay = 600 + i * 200;
      this.tweens.add({ targets: label, alpha: 1, duration: 400, delay });
      this.tweens.add({ targets: value, alpha: 1, duration: 400, delay: delay + 100 });
      this.tweens.add({ targets: lineGfx, alpha: 1, duration: 400, delay });

      this.statsTexts.push(label, value);
    }
  }

  // ------------------------------------------------------------------
  // High score notice
  // ------------------------------------------------------------------

  private createHighScoreNotice(): void {
    if (!this.isNewHighScore) return;

    this.highScoreText = this.add.text(GAME_WIDTH / 2, 400, 'NEW HIGH SCORE!', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '28px',
      color: '#ffcc00',
      fontStyle: 'bold',
      stroke: '#443300',
      strokeThickness: 2,
    })
      .setOrigin(0.5, 0.5)
      .setDepth(10)
      .setAlpha(0);

    // Animate: fade in + pulsing
    this.tweens.add({
      targets: this.highScoreText,
      alpha: 1,
      duration: 400,
      delay: 1600,
      onComplete: () => {
        this.tweens.add({
          targets: this.highScoreText,
          scale: { from: 1, to: 1.1 },
          alpha: { from: 1, to: 0.7 },
          yoyo: true,
          repeat: -1,
          duration: 600,
        });
      },
    });
  }

  // ------------------------------------------------------------------
  // Restart prompt
  // ------------------------------------------------------------------

  private createRestartPrompt(): void {
    const y = this.isNewHighScore ? 460 : 420;
    const promptText = isMobileDevice() ? 'TAP  TO  RESTART' : 'PRESS  R  TO  RESTART';
    this.restartPrompt = this.add.text(GAME_WIDTH / 2, y, promptText, {
      fontFamily: '"Courier New", monospace',
      fontSize: isMobileDevice() ? '22px' : '18px',
      color: '#888899',
      fontStyle: 'bold',
    })
      .setOrigin(0.5, 0.5)
      .setDepth(10)
      .setAlpha(0);

    // Fade in + gentle blink
    this.tweens.add({
      targets: this.restartPrompt,
      alpha: 1,
      duration: 400,
      delay: 2000,
      onComplete: () => {
        this.tweens.add({
          targets: this.restartPrompt,
          alpha: { from: 1, to: 0.4 },
          yoyo: true,
          repeat: -1,
          duration: 800,
        });
      },
    });
  }

  // ------------------------------------------------------------------
  // Menu button
  // ------------------------------------------------------------------

  private createMenuButton(): void {
    const mobile = isMobileDevice();
    const y = this.isNewHighScore ? 520 : 480;
    const btnW = mobile ? 280 : 220;
    const btnH = mobile ? 48 : 38;
    this.menuButton = this.add.container(GAME_WIDTH / 2, y).setDepth(10).setAlpha(0);

    const bg = this.add.rectangle(0, 0, btnW, btnH, 0x111122, 0.8)
      .setStrokeStyle(1, 0x444466);

    const text = this.add.text(0, 0, 'RETURN TO MENU', {
      fontFamily: '"Courier New", monospace',
      fontSize: mobile ? '18px' : '15px',
      color: '#888899',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    this.menuButton.add([bg, text]);
    this.menuButton.setSize(btnW, btnH);
    this.menuButton.setInteractive(
      new Phaser.Geom.Rectangle(-btnW / 2, -btnH / 2, btnW, btnH),
      Phaser.Geom.Rectangle.Contains
    );

    this.menuButton.on('pointerover', () => {
      bg.setFillStyle(0x1a1a33, 1);
      bg.setStrokeStyle(2, 0x6688cc);
      text.setColor('#aaaacc');
    });

    this.menuButton.on('pointerout', () => {
      bg.setFillStyle(0x111122, 0.8);
      bg.setStrokeStyle(1, 0x444466);
      text.setColor('#888899');
    });

    this.menuButton.on('pointerdown', () => {
      this.returnToMenu();
    });

    // Fade in
    this.tweens.add({
      targets: this.menuButton,
      alpha: 1,
      duration: 400,
      delay: 2200,
    });
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------

  private createInput(): void {
    const kb = this.input.keyboard!;
    this.rKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.enterKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    // R to restart
    kb.on('keydown-R', () => {
      this.restartGame();
    });

    // Click anywhere (after delay) also restarts
    this.time.delayedCall(2500, () => {
      this.restartPrompt.setInteractive();
      this.restartPrompt.on('pointerdown', () => {
        this.restartGame();
      });
    });
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  private restartGame(): void {
    // Stop all overlays
    this.scene.stop('HudScene');
    this.scene.stop('TouchControlsScene');
    this.scene.stop('GameScene');
    this.scene.stop();

    // Start fresh game
    this.scene.start('GameScene', { newGame: true });
  }

  private returnToMenu(): void {
    this.scene.stop('HudScene');
    this.scene.stop('TouchControlsScene');
    this.scene.stop('GameScene');
    this.scene.stop();

    this.scene.start('MenuScene');
  }

  // ------------------------------------------------------------------
  // High score check
  // ------------------------------------------------------------------

  private checkHighScore(): boolean {
    try {
      const current = parseInt(
        localStorage.getItem('grim-zombie-train-highscore') || '0',
        10
      );

      if (this.finalScore > current) {
        localStorage.setItem(
          'grim-zombie-train-highscore',
          String(this.finalScore)
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
