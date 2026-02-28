import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GAME_WIDTH, GAME_HEIGHT, HUNGER_MAX, ENERGY_MAX, PLAYER_MAX_HP, LOW_STAT_THRESHOLD } from '../data/BalanceConstants';
import { GameMode } from '../types/GameTypes';
import { isMobileDevice } from '../systems/TouchDetect';

/**
 * HudScene – overlay showing survival stats, train status, and interaction prompts.
 * Receives all data through EventBus.
 */
export class HudScene extends Phaser.Scene {
  // Stat bars
  private hungerBarBg!: Phaser.GameObjects.Image;
  private hungerBarFill!: Phaser.GameObjects.Image;
  private energyBarBg!: Phaser.GameObjects.Image;
  private energyBarFill!: Phaser.GameObjects.Image;
  private healthBarBg!: Phaser.GameObjects.Image;
  private healthBarFill!: Phaser.GameObjects.Image;

  // Labels
  private hungerLabel!: Phaser.GameObjects.Text;
  private energyLabel!: Phaser.GameObjects.Text;
  private healthLabel!: Phaser.GameObjects.Text;

  // Train status
  private modeText!: Phaser.GameObjects.Text;

  // Warning flash
  private warningOverlay!: Phaser.GameObjects.Rectangle;
  private warningAlpha: number = 0;

  constructor() {
    super({ key: 'HudScene' });
  }

  create(): void {
    const margin = 12;
    const barW = 90;
    const barH = 8;
    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: '#cccccc',
    };

    // ---- Health bar ----
    let yPos = margin;
    this.healthLabel = this.add.text(margin, yPos, 'HP', labelStyle);
    this.healthBarBg = this.add.image(margin + 24, yPos + 4, 'stat-bar-bg').setOrigin(0, 0.5).setDisplaySize(barW, barH);
    this.healthBarFill = this.add.image(margin + 24, yPos + 4, 'bar-health').setOrigin(0, 0.5).setDisplaySize(barW, barH);

    // ---- Hunger bar ----
    yPos += 16;
    this.hungerLabel = this.add.text(margin, yPos, 'FD', labelStyle);
    this.hungerBarBg = this.add.image(margin + 24, yPos + 4, 'stat-bar-bg').setOrigin(0, 0.5).setDisplaySize(barW, barH);
    this.hungerBarFill = this.add.image(margin + 24, yPos + 4, 'bar-hunger').setOrigin(0, 0.5).setDisplaySize(barW, barH);

    // ---- Energy bar ----
    yPos += 16;
    this.energyLabel = this.add.text(margin, yPos, 'EN', labelStyle);
    this.energyBarBg = this.add.image(margin + 24, yPos + 4, 'stat-bar-bg').setOrigin(0, 0.5).setDisplaySize(barW, barH);
    this.energyBarFill = this.add.image(margin + 24, yPos + 4, 'bar-energy').setOrigin(0, 0.5).setDisplaySize(barW, barH);

    // ---- Train mode (top-right) ----
    this.modeText = this.add.text(GAME_WIDTH - margin, margin, 'TRAVELING', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#88cc88',
      fontStyle: 'bold',
    }).setOrigin(1, 0);

    // ---- Warning overlay (red edge tint when low stats) ----
    this.warningOverlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0xcc0000, 0,
    );
    this.warningOverlay.setDepth(100);

    // ---- Controls hint (bottom) ----
    const isMobile = isMobileDevice();
    if (!isMobile) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 12, 'WASD: Move  |  E: Interact  |  ESC: Pause', {
        fontSize: '9px',
        fontFamily: 'monospace',
        color: '#555566',
      }).setOrigin(0.5);
    }

    // ---- Listen for HUD updates ----
    EventBus.on('hud:update', this.onHudUpdate, this);
  }

  private onHudUpdate(data: {
    hunger: number;
    energy: number;
    health: number;
    mode: GameMode;
  }): void {
    const barW = 90;

    // Update bar widths
    this.healthBarFill.setDisplaySize(barW * (data.health / PLAYER_MAX_HP), 8);
    this.hungerBarFill.setDisplaySize(barW * (data.hunger / HUNGER_MAX), 8);
    this.energyBarFill.setDisplaySize(barW * (data.energy / ENERGY_MAX), 8);

    // Mode text
    this.modeText.setText(data.mode);
    switch (data.mode) {
      case GameMode.TRAVELING:
        this.modeText.setColor('#88cc88');
        break;
      case GameMode.STOPPED:
        this.modeText.setColor('#cccc44');
        break;
      case GameMode.EXPLORING:
        this.modeText.setColor('#cc6644');
        break;
    }

    // Warning flash when low stats
    const isLow = data.hunger < LOW_STAT_THRESHOLD || data.energy < LOW_STAT_THRESHOLD;
    this.warningAlpha = isLow
      ? 0.08 + Math.sin(Date.now() * 0.005) * 0.04
      : 0;
    this.warningOverlay.setAlpha(this.warningAlpha);

    // Flash bar colors when low
    this.hungerBarFill.setTint(data.hunger < LOW_STAT_THRESHOLD ? 0xff4444 : 0xffffff);
    this.energyBarFill.setTint(data.energy < LOW_STAT_THRESHOLD ? 0xff4444 : 0xffffff);
  }

  shutdown(): void {
    EventBus.off('hud:update', this.onHudUpdate, this);
  }
}
