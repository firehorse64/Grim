import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  HUNGER_MAX,
  ENERGY_MAX,
  PLAYER_MAX_HP,
  LOW_STAT_THRESHOLD,
  ENGINE_MAX_HP,
  BRAKE_MAX_HP,
  FUEL_MAX,
} from '../data/BalanceConstants';
import { GameMode, WeaponType, TimeOfDay } from '../types/GameTypes';
import { isMobileDevice } from '../systems/TouchDetect';

export interface HudUpdateData {
  hunger: number;
  energy: number;
  health: number;
  mode: GameMode;
  weapon: WeaponType;
  ammo: number;
  timeOfDay: TimeOfDay;
  engineHp: number;
  brakeHp: number;
  hasFire: boolean;
  npcCount: number;
  fuel: number;
  trainSpeed: number;
  destination: string | null;
  travelProgress: number;
  currentLocation: string;
}

/**
 * HudScene – overlay showing survival stats, combat info, train status,
 * maintenance, fuel, destination, and interaction prompts.
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

  // Combat display
  private equippedLabel!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private ammoLabel!: Phaser.GameObjects.Text;
  private ammoText!: Phaser.GameObjects.Text;

  // Time of day
  private timeText!: Phaser.GameObjects.Text;

  // Maintenance bars
  private engineLabel!: Phaser.GameObjects.Text;
  private engineBarBg!: Phaser.GameObjects.Image;
  private engineBarFill!: Phaser.GameObjects.Image;
  private brakeLabel!: Phaser.GameObjects.Text;
  private brakeBarBg!: Phaser.GameObjects.Image;
  private brakeBarFill!: Phaser.GameObjects.Image;

  // Fuel gauge
  private fuelLabel!: Phaser.GameObjects.Text;
  private fuelBarBg!: Phaser.GameObjects.Image;
  private fuelBarFill!: Phaser.GameObjects.Image;

  // Fire warning
  private fireWarning!: Phaser.GameObjects.Text;

  // NPC count
  private npcText!: Phaser.GameObjects.Text;

  // Destination/objective
  private destText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;

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
    const smallBarW = 60;
    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '10px', fontFamily: 'monospace', color: '#cccccc',
    };
    const smallLabelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '9px', fontFamily: 'monospace', color: '#999999',
    };

    // ---- Health bar ----
    let yPos = margin;
    this.healthLabel = this.add.text(margin, yPos, 'Health', labelStyle);
    this.healthBarBg = this.add.image(margin + 46, yPos + 4, 'stat-bar-bg').setOrigin(0, 0.5).setDisplaySize(barW, barH);
    this.healthBarFill = this.add.image(margin + 46, yPos + 4, 'bar-health').setOrigin(0, 0.5).setDisplaySize(barW, barH);

    // ---- Hunger bar ----
    yPos += 16;
    this.hungerLabel = this.add.text(margin, yPos, 'Food', labelStyle);
    this.hungerBarBg = this.add.image(margin + 46, yPos + 4, 'stat-bar-bg').setOrigin(0, 0.5).setDisplaySize(barW, barH);
    this.hungerBarFill = this.add.image(margin + 46, yPos + 4, 'bar-hunger').setOrigin(0, 0.5).setDisplaySize(barW, barH);

    // ---- Energy bar ----
    yPos += 16;
    this.energyLabel = this.add.text(margin, yPos, 'Energy', labelStyle);
    this.energyBarBg = this.add.image(margin + 46, yPos + 4, 'stat-bar-bg').setOrigin(0, 0.5).setDisplaySize(barW, barH);
    this.energyBarFill = this.add.image(margin + 46, yPos + 4, 'bar-energy').setOrigin(0, 0.5).setDisplaySize(barW, barH);

    // ---- Equipped weapon (below stats) ----
    yPos += 22;
    this.equippedLabel = this.add.text(margin, yPos, 'Equipped:', {
      fontSize: '9px', fontFamily: 'monospace', color: '#888899',
    });
    this.weaponText = this.add.text(margin + 65, yPos, 'Rifle', {
      fontSize: '10px', fontFamily: 'monospace', color: '#aaaacc', fontStyle: 'bold',
    });

    yPos += 14;
    this.ammoLabel = this.add.text(margin, yPos, 'Ammo:', {
      fontSize: '9px', fontFamily: 'monospace', color: '#888899',
    });
    this.ammoText = this.add.text(margin + 42, yPos, '15', {
      fontSize: '10px', fontFamily: 'monospace', color: '#cccc88',
    });

    // ---- Top-right: Mode + Time ----
    this.modeText = this.add.text(GAME_WIDTH - margin, margin, 'TRAVELING', {
      fontSize: '11px', fontFamily: 'monospace', color: '#88cc88', fontStyle: 'bold',
    }).setOrigin(1, 0);

    this.timeText = this.add.text(GAME_WIDTH - margin, margin + 16, 'DAY', {
      fontSize: '10px', fontFamily: 'monospace', color: '#cccc88',
    }).setOrigin(1, 0);

    // ---- NPC count ----
    this.npcText = this.add.text(GAME_WIDTH - margin, margin + 32, 'Crew: 1', smallLabelStyle).setOrigin(1, 0);

    // ---- Maintenance bars (top-right) ----
    const maintX = GAME_WIDTH - margin - smallBarW - 42;
    let maintY = margin + 48;

    this.engineLabel = this.add.text(maintX, maintY, 'Engine', smallLabelStyle);
    this.engineBarBg = this.add.image(maintX + 42, maintY + 4, 'stat-bar-bg').setOrigin(0, 0.5).setDisplaySize(smallBarW, 6);
    this.engineBarFill = this.add.image(maintX + 42, maintY + 4, 'bar-health').setOrigin(0, 0.5).setDisplaySize(smallBarW, 6);

    maintY += 14;
    this.brakeLabel = this.add.text(maintX, maintY, 'Brakes', smallLabelStyle);
    this.brakeBarBg = this.add.image(maintX + 42, maintY + 4, 'stat-bar-bg').setOrigin(0, 0.5).setDisplaySize(smallBarW, 6);
    this.brakeBarFill = this.add.image(maintX + 42, maintY + 4, 'bar-health').setOrigin(0, 0.5).setDisplaySize(smallBarW, 6);

    // ---- Fuel gauge ----
    maintY += 14;
    this.fuelLabel = this.add.text(maintX, maintY, 'Fuel', smallLabelStyle);
    this.fuelBarBg = this.add.image(maintX + 42, maintY + 4, 'stat-bar-bg').setOrigin(0, 0.5).setDisplaySize(smallBarW, 6);
    this.fuelBarFill = this.add.image(maintX + 42, maintY + 4, 'bar-energy').setOrigin(0, 0.5).setDisplaySize(smallBarW, 6);

    // ---- Destination / objective (bottom-left) ----
    this.objectiveText = this.add.text(margin, GAME_HEIGHT - 58, 'Objective: Reach Port Echo (The Coast)', {
      fontSize: '9px', fontFamily: 'monospace', color: '#aa8844',
    });
    this.destText = this.add.text(margin, GAME_HEIGHT - 44, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#88aacc',
    });

    // ---- Fire warning ----
    this.fireWarning = this.add.text(GAME_WIDTH / 2, margin + 4, 'FIRE!', {
      fontSize: '14px', fontFamily: 'monospace', color: '#ff4422', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setVisible(false);

    // ---- Warning overlay ----
    this.warningOverlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xcc0000, 0,
    ).setDepth(100);

    // ---- Controls hint ----
    if (!isMobileDevice()) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 12, 'WASD: Move | Click: Fire | E: Interact | TAB: Inventory | M: Map | +/-: Speed | ESC: Pause', {
        fontSize: '8px', fontFamily: 'monospace', color: '#555566',
      }).setOrigin(0.5);
    }

    // ---- Listen for HUD updates ----
    EventBus.on('hud:update', this.onHudUpdate, this);
  }

  private onHudUpdate(data: HudUpdateData): void {
    const barW = 90;
    const smallBarW = 60;

    this.healthBarFill.setDisplaySize(barW * (data.health / PLAYER_MAX_HP), 8);
    this.hungerBarFill.setDisplaySize(barW * (data.hunger / HUNGER_MAX), 8);
    this.energyBarFill.setDisplaySize(barW * (data.energy / ENERGY_MAX), 8);

    // Mode + speed
    const speedSuffix = data.mode === GameMode.TRAVELING ? ` (${data.trainSpeed} km/h)` : '';
    this.modeText.setText(data.mode + speedSuffix);
    switch (data.mode) {
      case GameMode.TRAVELING: this.modeText.setColor('#88cc88'); break;
      case GameMode.STOPPED: this.modeText.setColor('#cccc44'); break;
      case GameMode.EXPLORING: this.modeText.setColor('#cc6644'); break;
    }

    // Weapon & ammo
    const weaponName = data.weapon === WeaponType.RIFLE ? 'Rifle' : 'Melee';
    this.weaponText.setText(weaponName);
    if (data.weapon === WeaponType.RIFLE) {
      this.ammoLabel.setVisible(true);
      this.ammoText.setText(`${data.ammo}`).setVisible(true);
      this.ammoText.setColor(data.ammo <= 3 ? '#ff4444' : '#cccc88');
    } else {
      this.ammoLabel.setVisible(false);
      this.ammoText.setVisible(false);
    }

    // Time of day
    this.timeText.setText(data.timeOfDay);
    switch (data.timeOfDay) {
      case TimeOfDay.DAWN: this.timeText.setColor('#ddaa66'); break;
      case TimeOfDay.DAY: this.timeText.setColor('#cccc88'); break;
      case TimeOfDay.DUSK: this.timeText.setColor('#cc8844'); break;
      case TimeOfDay.NIGHT: this.timeText.setColor('#6666aa'); break;
    }

    // NPC count
    this.npcText.setText(`Crew: ${data.npcCount}`);

    // Maintenance
    this.engineBarFill.setDisplaySize(smallBarW * (data.engineHp / ENGINE_MAX_HP), 6);
    this.brakeBarFill.setDisplaySize(smallBarW * (data.brakeHp / BRAKE_MAX_HP), 6);
    this.engineBarFill.setTint(data.engineHp < 30 ? 0xff4444 : data.engineHp < 60 ? 0xcccc44 : 0xffffff);
    this.brakeBarFill.setTint(data.brakeHp < 30 ? 0xff4444 : data.brakeHp < 60 ? 0xcccc44 : 0xffffff);

    // Fuel
    this.fuelBarFill.setDisplaySize(smallBarW * (data.fuel / FUEL_MAX), 6);
    this.fuelBarFill.setTint(data.fuel < 20 ? 0xff4444 : data.fuel < 40 ? 0xcccc44 : 0xffffff);

    // Destination
    if (data.destination) {
      const pct = Math.floor(data.travelProgress * 100);
      this.destText.setText(`Heading to: ${data.destination} (${pct}%)`);
    } else {
      this.destText.setText(`At: ${data.currentLocation} - Set destination on map [M]`);
    }

    // Fire warning
    if (data.hasFire) {
      this.fireWarning.setVisible(true);
      this.fireWarning.setAlpha(0.5 + Math.sin(Date.now() * 0.01) * 0.5);
    } else {
      this.fireWarning.setVisible(false);
    }

    // Warning flash
    const isLow = data.hunger < LOW_STAT_THRESHOLD || data.energy < LOW_STAT_THRESHOLD;
    this.warningAlpha = isLow ? 0.08 + Math.sin(Date.now() * 0.005) * 0.04 : 0;
    this.warningOverlay.setAlpha(this.warningAlpha);
    this.hungerBarFill.setTint(data.hunger < LOW_STAT_THRESHOLD ? 0xff4444 : 0xffffff);
    this.energyBarFill.setTint(data.energy < LOW_STAT_THRESHOLD ? 0xff4444 : 0xffffff);
  }

  shutdown(): void {
    EventBus.off('hud:update', this.onHudUpdate, this);
  }
}
