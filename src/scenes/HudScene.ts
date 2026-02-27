import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';
import { WeaponType } from '../types/WeaponTypes';
import { WEAPON_DATA } from '../data/WeaponData';
import { GAME_WIDTH, GAME_HEIGHT, NUM_TRAIN_CARS } from '../data/BalanceConstants';
import { HealthBar } from '../ui/HealthBar';
import { DamageNumbers } from '../ui/DamageNumbers';
import { clamp } from '../utils/MathUtils';
import { isMobileDevice } from '../systems/TouchDetect';

/**
 * HudScene - Heads-up display overlay running in parallel with GameScene.
 *
 * All data is received through EventBus events; the HUD never directly
 * references GameScene objects, keeping the two scenes fully decoupled.
 */
export class HudScene extends Phaser.Scene {
  // ---- Health bar (top-left) ----
  private healthBar!: HealthBar;
  private healthText!: Phaser.GameObjects.Text;

  // ---- Ammo display (bottom-left) ----
  private weaponNameText!: Phaser.GameObjects.Text;
  private ammoText!: Phaser.GameObjects.Text;

  // ---- Wave indicator (top-right) ----
  private waveText!: Phaser.GameObjects.Text;
  private zombieCountText!: Phaser.GameObjects.Text;

  // ---- Score (top-right, below wave) ----
  private scoreText!: Phaser.GameObjects.Text;

  // ---- Currency ----
  private currencyIcon!: Phaser.GameObjects.Graphics;
  private currencyText!: Phaser.GameObjects.Text;

  // ---- Weapon slots (bottom center) ----
  private weaponSlots: Phaser.GameObjects.Container[] = [];
  private currentWeaponIndex: number = 0;

  // ---- Wave announcement (center) ----
  private waveAnnounce!: Phaser.GameObjects.Text;
  private waveAnnounceSub!: Phaser.GameObjects.Text;

  // ---- Boss health bar (top center) ----
  private bossHealthBar!: HealthBar;
  private bossNameText!: Phaser.GameObjects.Text;
  private bossActive: boolean = false;

  // ---- Minimap (top-right corner) ----
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private minimapBorder!: Phaser.GameObjects.Graphics;
  private showMinimap: boolean = true;

  // ---- Damage numbers ----
  private damageNumbers!: DamageNumbers;

  // ---- Countdown ----
  private countdownText!: Phaser.GameObjects.Text;

  // ---- State cache ----
  private cachedScore: number = 0;
  private cachedCurrency: number = 0;
  private cachedWave: number = 0;
  private cachedZombiesRemaining: number = 0;
  private cachedTotalZombies: number = 0;
  private cachedHp: number = 100;
  private cachedMaxHp: number = 100;
  private cachedWeaponName: string = 'Pistol';
  private cachedAmmo: number = 12;
  private cachedClipSize: number = 12;
  private cachedReserve: number = 999;
  private cachedIsReloading: boolean = false;

  constructor() {
    super({ key: 'HudScene' });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  create(): void {
    this.createHealthBar();
    this.createAmmoDisplay();
    this.createWaveIndicator();
    this.createScoreDisplay();
    this.createCurrencyDisplay();
    this.createWeaponSlots();
    this.createWaveAnnouncement();
    this.createBossHealthBar();
    this.createMinimap();
    this.createCountdown();
    this.damageNumbers = new DamageNumbers(this, 50);

    this.registerEvents();
  }

  update(_time: number, delta: number): void {
    this.healthBar.update();
    if (this.bossActive) {
      this.bossHealthBar.update();
    }
    this.damageNumbers.update(delta);
    this.updateMinimap();
  }

  // ------------------------------------------------------------------
  // Health bar (top-left)
  // ------------------------------------------------------------------

  private createHealthBar(): void {
    this.healthBar = new HealthBar(this, {
      x: 16,
      y: 16,
      width: 200,
      height: 18,
      showText: false,
      borderColor: 0x554444,
      bgColor: 0x1a0a0a,
    });
    this.healthBar.setValueInstant(this.cachedHp, this.cachedMaxHp);

    // HP number text
    this.healthText = this.add.text(16 + 200 + 8, 16, `${this.cachedHp}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#cc4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(1001);

    // Label
    this.add.text(16, 36, 'HP', {
      fontFamily: '"Courier New", monospace',
      fontSize: '10px',
      color: '#886666',
    }).setOrigin(0, 0).setDepth(1001);
  }

  // ------------------------------------------------------------------
  // Ammo display (bottom-left)
  // ------------------------------------------------------------------

  private createAmmoDisplay(): void {
    const mobile = isMobileDevice();
    // On mobile, move ammo info higher to avoid touch controls area
    const ammoY = mobile ? GAME_HEIGHT - 130 : GAME_HEIGHT - 60;
    const clipY = mobile ? GAME_HEIGHT - 110 : GAME_HEIGHT - 40;

    this.weaponNameText = this.add.text(16, ammoY, this.cachedWeaponName, {
      fontFamily: '"Courier New", monospace',
      fontSize: mobile ? '12px' : '14px',
      color: '#8888aa',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(1001);

    this.ammoText = this.add.text(16, clipY, this.formatAmmo(), {
      fontFamily: '"Courier New", monospace',
      fontSize: mobile ? '18px' : '22px',
      color: '#ccccee',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(1001);
  }

  private formatAmmo(): string {
    if (this.cachedIsReloading) {
      return 'RELOADING...';
    }
    const reserveStr = this.cachedReserve >= 9999 ? 'INF' : String(this.cachedReserve);
    return `${this.cachedAmmo}/${this.cachedClipSize} [${reserveStr}]`;
  }

  // ------------------------------------------------------------------
  // Wave indicator (top-right)
  // ------------------------------------------------------------------

  private createWaveIndicator(): void {
    this.waveText = this.add.text(GAME_WIDTH - 16, 16, 'WAVE 0', {
      fontFamily: '"Courier New", monospace',
      fontSize: '20px',
      color: '#cc8844',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(1001);

    this.zombieCountText = this.add.text(GAME_WIDTH - 16, 40, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: '#886644',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(1001);
  }

  // ------------------------------------------------------------------
  // Score (top-right, below wave)
  // ------------------------------------------------------------------

  private createScoreDisplay(): void {
    this.scoreText = this.add.text(GAME_WIDTH - 16, 60, '0', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#aaaacc',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(1001);
  }

  // ------------------------------------------------------------------
  // Currency
  // ------------------------------------------------------------------

  private createCurrencyDisplay(): void {
    // Coin icon (small yellow circle)
    this.currencyIcon = this.add.graphics().setDepth(1001);
    this.currencyIcon.fillStyle(0xffcc22, 1);
    this.currencyIcon.fillCircle(GAME_WIDTH - 180, 24, 7);
    this.currencyIcon.lineStyle(1, 0xaa8800, 1);
    this.currencyIcon.strokeCircle(GAME_WIDTH - 180, 24, 7);
    // "$" on coin
    this.add.text(GAME_WIDTH - 180, 24, '$', {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: '#886600',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(1002);

    this.currencyText = this.add.text(GAME_WIDTH - 168, 16, '0', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#ffcc44',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(1001);
  }

  // ------------------------------------------------------------------
  // Weapon slots (bottom center)
  // ------------------------------------------------------------------

  private createWeaponSlots(): void {
    const mobile = isMobileDevice();
    const weapons = [
      { key: '1', name: 'Pistol', type: WeaponType.PISTOL },
      { key: '2', name: 'Shotgun', type: WeaponType.SHOTGUN },
      { key: '3', name: 'SMG', type: WeaponType.SMG },
      { key: '4', name: 'Rifle', type: WeaponType.RIFLE },
      { key: '5', name: 'Grenades', type: WeaponType.GRENADE },
    ];

    const slotSize = mobile ? 38 : 48;
    const gap = mobile ? 4 : 6;
    const totalWidth = weapons.length * slotSize + (weapons.length - 1) * gap;
    const startX = (GAME_WIDTH - totalWidth) / 2;
    // On mobile, move weapon slots higher to avoid overlap with touch controls
    const y = mobile ? GAME_HEIGHT - 100 : GAME_HEIGHT - 60;

    for (let i = 0; i < weapons.length; i++) {
      const x = startX + i * (slotSize + gap) + slotSize / 2;

      const container = this.add.container(x, y).setDepth(1001);

      // Background
      const bg = this.add.rectangle(0, 0, slotSize, slotSize, 0x111122, 0.7)
        .setStrokeStyle(1, 0x333355);

      // Key number (hidden on mobile - no keyboard)
      const keyText = this.add.text(-slotSize / 2 + 4, -slotSize / 2 + 2, weapons[i].key, {
        fontFamily: '"Courier New", monospace',
        fontSize: '10px',
        color: '#666688',
      });
      if (mobile) keyText.setVisible(false);

      // Weapon abbreviation
      const nameAbbr = weapons[i].name.substring(0, 3).toUpperCase();
      const nameText = this.add.text(0, mobile ? 0 : 4, nameAbbr, {
        fontFamily: '"Courier New", monospace',
        fontSize: mobile ? '10px' : '12px',
        color: '#888899',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5);

      container.add([bg, keyText, nameText]);
      container.setData('bg', bg);
      container.setData('nameText', nameText);

      // On mobile, make weapon slots tappable to switch weapons
      if (mobile) {
        container.setSize(slotSize, slotSize);
        container.setInteractive(
          new Phaser.Geom.Rectangle(-slotSize / 2, -slotSize / 2, slotSize, slotSize),
          Phaser.Geom.Rectangle.Contains
        );
        container.on('pointerdown', () => {
          EventBus.emit(GameEvents.WEAPON_SWITCH_REQUEST, { slot: i + 1 });
        });
      }

      this.weaponSlots.push(container);
    }

    this.highlightWeaponSlot(0);
  }

  private highlightWeaponSlot(index: number): void {
    for (let i = 0; i < this.weaponSlots.length; i++) {
      const container = this.weaponSlots[i];
      const bg = container.getData('bg') as Phaser.GameObjects.Rectangle;
      const nameText = container.getData('nameText') as Phaser.GameObjects.Text;

      if (i === index) {
        bg.setFillStyle(0x222244, 0.9);
        bg.setStrokeStyle(2, 0x6688cc);
        nameText.setColor('#ccccff');
      } else {
        bg.setFillStyle(0x111122, 0.7);
        bg.setStrokeStyle(1, 0x333355);
        nameText.setColor('#888899');
      }
    }
    this.currentWeaponIndex = index;
  }

  // ------------------------------------------------------------------
  // Wave announcement (center screen)
  // ------------------------------------------------------------------

  private createWaveAnnouncement(): void {
    this.waveAnnounce = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '', {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '64px',
      color: '#cc3333',
      fontStyle: 'bold',
      stroke: '#220000',
      strokeThickness: 4,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#000000',
        blur: 12,
        fill: true,
        stroke: false,
      },
    })
      .setOrigin(0.5, 0.5)
      .setDepth(1100)
      .setAlpha(0);

    this.waveAnnounceSub = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#886644',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    })
      .setOrigin(0.5, 0.5)
      .setDepth(1100)
      .setAlpha(0);
  }

  private showWaveAnnouncement(wave: number, totalZombies: number, boss: string | null): void {
    this.waveAnnounce.setText(`WAVE ${wave}`);
    this.waveAnnounce.setAlpha(1);
    this.waveAnnounce.setScale(1.3);

    const subText = boss
      ? `${totalZombies} ZOMBIES  //  BOSS INCOMING`
      : `${totalZombies} ZOMBIES INCOMING`;
    this.waveAnnounceSub.setText(subText);
    this.waveAnnounceSub.setAlpha(0);

    // Animate in
    this.tweens.add({
      targets: this.waveAnnounce,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });

    this.tweens.add({
      targets: this.waveAnnounceSub,
      alpha: 1,
      duration: 400,
      delay: 300,
    });

    // Fade out
    this.tweens.add({
      targets: [this.waveAnnounce, this.waveAnnounceSub],
      alpha: 0,
      duration: 600,
      delay: 2200,
      ease: 'Power2',
    });
  }

  // ------------------------------------------------------------------
  // Boss health bar (top center)
  // ------------------------------------------------------------------

  private createBossHealthBar(): void {
    this.bossHealthBar = new HealthBar(this, {
      x: GAME_WIDTH / 2 - 200,
      y: 52,
      width: 400,
      height: 14,
      showText: false,
      borderColor: 0x883333,
      bgColor: 0x220a0a,
    });
    this.bossHealthBar.hide();

    this.bossNameText = this.add.text(GAME_WIDTH / 2, 46, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: '#cc4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    })
      .setOrigin(0.5, 1)
      .setDepth(1001)
      .setVisible(false);
  }

  private showBossBar(name: string, hp: number, maxHp: number): void {
    this.bossActive = true;
    this.bossNameText.setText(name.toUpperCase());
    this.bossNameText.setVisible(true);
    this.bossHealthBar.setValueInstant(hp, maxHp);
    this.bossHealthBar.show();
  }

  private hideBossBar(): void {
    this.bossActive = false;
    this.bossNameText.setVisible(false);
    this.bossHealthBar.hide();
  }

  // ------------------------------------------------------------------
  // Minimap (top-right corner)
  // ------------------------------------------------------------------

  private createMinimap(): void {
    // Hide minimap on mobile to avoid cluttering the touch controls area
    if (isMobileDevice()) {
      this.showMinimap = false;
      this.minimapBorder = this.add.graphics().setDepth(1001).setVisible(false);
      this.minimapGraphics = this.add.graphics().setDepth(1002).setVisible(false);
      return;
    }

    const mmX = GAME_WIDTH - 130;
    const mmY = 90;
    const mmW = 114;
    const mmH = 50;

    // Border
    this.minimapBorder = this.add.graphics().setDepth(1001);
    this.minimapBorder.lineStyle(1, 0x444466, 1);
    this.minimapBorder.strokeRect(mmX, mmY, mmW, mmH);
    this.minimapBorder.fillStyle(0x0a0a18, 0.7);
    this.minimapBorder.fillRect(mmX, mmY, mmW, mmH);

    this.minimapGraphics = this.add.graphics().setDepth(1002);
  }

  private updateMinimap(): void {
    if (!this.showMinimap) return;

    const mmX = GAME_WIDTH - 130;
    const mmY = 90;
    const mmW = 114;
    const mmH = 50;

    this.minimapGraphics.clear();

    // Draw train cars as small rectangles
    const carW = (mmW - 10) / NUM_TRAIN_CARS;
    const carH = 12;
    const carY = mmY + mmH / 2 - carH / 2;

    for (let i = 0; i < NUM_TRAIN_CARS; i++) {
      const cx = mmX + 5 + i * (carW + 1);
      this.minimapGraphics.fillStyle(0x222244, 1);
      this.minimapGraphics.fillRect(cx, carY, carW - 1, carH);
      this.minimapGraphics.lineStyle(1, 0x333366, 0.5);
      this.minimapGraphics.strokeRect(cx, carY, carW - 1, carH);
    }

    // Player position dot (default to first car center)
    const playerMmX = mmX + 5 + carW / 2;
    const playerMmY = carY + carH / 2;
    this.minimapGraphics.fillStyle(0x4488ff, 1);
    this.minimapGraphics.fillCircle(playerMmX, playerMmY, 3);

    // Label
    this.minimapGraphics.fillStyle(0x666688, 1);
  }

  // ------------------------------------------------------------------
  // Countdown
  // ------------------------------------------------------------------

  private createCountdown(): void {
    this.countdownText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '28px',
      color: '#888899',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    })
      .setOrigin(0.5, 0.5)
      .setDepth(1100)
      .setAlpha(0);
  }

  // ------------------------------------------------------------------
  // Event listeners
  // ------------------------------------------------------------------

  private registerEvents(): void {
    // Health changes
    EventBus.on(GameEvents.HEALTH_CHANGED, this.onHealthChanged, this);

    // Weapon switched
    EventBus.on(GameEvents.WEAPON_SWITCHED, this.onWeaponSwitched, this);

    // Ammo changes
    EventBus.on(GameEvents.AMMO_CHANGED, this.onAmmoChanged, this);

    // Reloading
    EventBus.on(GameEvents.WEAPON_RELOADING, this.onReloading, this);
    EventBus.on(GameEvents.WEAPON_RELOADED, this.onReloaded, this);

    // Wave events
    EventBus.on(GameEvents.WAVE_START, this.onWaveStart, this);
    EventBus.on(GameEvents.WAVE_COMPLETE, this.onWaveCompleteHud, this);
    EventBus.on(GameEvents.WAVE_COUNTDOWN, this.onWaveCountdown, this);

    // Boss
    EventBus.on(GameEvents.BOSS_INCOMING, this.onBossIncoming, this);
    EventBus.on(GameEvents.BOSS_DEFEATED, this.onBossDefeatedHud, this);

    // Score / currency
    EventBus.on(GameEvents.SCORE_CHANGED, this.onScoreChanged, this);
    EventBus.on(GameEvents.CURRENCY_CHANGED, this.onCurrencyChanged, this);

    // Zombie damaged (for damage numbers)
    EventBus.on(GameEvents.ZOMBIE_DAMAGED, this.onZombieDamaged, this);

    // Zombie killed (decrement counter)
    EventBus.on(GameEvents.ZOMBIE_KILLED, this.onZombieKilledHud, this);

    // Screen effects
    EventBus.on(GameEvents.SCREEN_SHAKE, this.onScreenShake, this);
    EventBus.on(GameEvents.SCREEN_FLASH, this.onScreenFlash, this);

    // Cleanup
    this.events.once('shutdown', this.cleanupEvents, this);
    this.events.once('destroy', this.cleanupEvents, this);
  }

  private cleanupEvents(): void {
    EventBus.off(GameEvents.HEALTH_CHANGED, this.onHealthChanged, this);
    EventBus.off(GameEvents.WEAPON_SWITCHED, this.onWeaponSwitched, this);
    EventBus.off(GameEvents.AMMO_CHANGED, this.onAmmoChanged, this);
    EventBus.off(GameEvents.WEAPON_RELOADING, this.onReloading, this);
    EventBus.off(GameEvents.WEAPON_RELOADED, this.onReloaded, this);
    EventBus.off(GameEvents.WAVE_START, this.onWaveStart, this);
    EventBus.off(GameEvents.WAVE_COMPLETE, this.onWaveCompleteHud, this);
    EventBus.off(GameEvents.WAVE_COUNTDOWN, this.onWaveCountdown, this);
    EventBus.off(GameEvents.BOSS_INCOMING, this.onBossIncoming, this);
    EventBus.off(GameEvents.BOSS_DEFEATED, this.onBossDefeatedHud, this);
    EventBus.off(GameEvents.SCORE_CHANGED, this.onScoreChanged, this);
    EventBus.off(GameEvents.CURRENCY_CHANGED, this.onCurrencyChanged, this);
    EventBus.off(GameEvents.ZOMBIE_DAMAGED, this.onZombieDamaged, this);
    EventBus.off(GameEvents.ZOMBIE_KILLED, this.onZombieKilledHud, this);
    EventBus.off(GameEvents.SCREEN_SHAKE, this.onScreenShake, this);
    EventBus.off(GameEvents.SCREEN_FLASH, this.onScreenFlash, this);

    this.healthBar.destroy();
    this.bossHealthBar.destroy();
    this.damageNumbers.destroy();
  }

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  private onHealthChanged(data: { entity: any; hp: number; maxHp: number; amount: number }): void {
    // Check if this is the player's health (entity === null for placeholder,
    // or entity with an 'isPlayer' flag)
    const isPlayer = !data.entity || data.entity?.isPlayer === true;

    if (isPlayer) {
      this.cachedHp = data.hp;
      this.cachedMaxHp = data.maxHp;
      this.healthBar.setValue(data.hp, data.maxHp);
      this.healthText.setText(`${Math.ceil(data.hp)}`);

      // Flash red if damaged
      if (data.amount < 0) {
        this.cameras.main.flash(120, 80, 0, 0, true);
      }
    }

    // Boss health
    if (data.entity?.isBoss) {
      this.bossHealthBar.setValue(data.hp, data.maxHp);
    }
  }

  private onWeaponSwitched(data: { index: number; type: WeaponType; ammo: number; clipSize: number; reserve: number }): void {
    this.currentWeaponIndex = data.index;
    this.cachedWeaponName = WEAPON_DATA[data.type]?.name ?? data.type;
    this.cachedAmmo = data.ammo;
    this.cachedClipSize = data.clipSize;
    this.cachedReserve = data.reserve;
    this.cachedIsReloading = false;

    this.weaponNameText.setText(this.cachedWeaponName);
    this.ammoText.setText(this.formatAmmo());
    this.highlightWeaponSlot(data.index);
  }

  private onAmmoChanged(data: { ammo: number; clipSize: number; reserve: number }): void {
    this.cachedAmmo = data.ammo;
    this.cachedClipSize = data.clipSize;
    this.cachedReserve = data.reserve;
    this.ammoText.setText(this.formatAmmo());

    // Flash ammo text red if low
    if (this.cachedAmmo <= 2 && this.cachedAmmo > 0) {
      this.ammoText.setColor('#ff4444');
    } else if (this.cachedAmmo === 0) {
      this.ammoText.setColor('#ff0000');
    } else {
      this.ammoText.setColor('#ccccee');
    }
  }

  private onReloading(): void {
    this.cachedIsReloading = true;
    this.ammoText.setText(this.formatAmmo());
    this.ammoText.setColor('#888866');
  }

  private onReloaded(data: { ammo: number; clipSize: number; reserve: number }): void {
    this.cachedIsReloading = false;
    this.cachedAmmo = data.ammo;
    this.cachedClipSize = data.clipSize;
    this.cachedReserve = data.reserve;
    this.ammoText.setText(this.formatAmmo());
    this.ammoText.setColor('#ccccee');
  }

  private onWaveStart(data: { wave: number; totalZombies: number; boss: string | null }): void {
    this.cachedWave = data.wave;
    this.cachedTotalZombies = data.totalZombies;
    this.cachedZombiesRemaining = data.totalZombies;

    this.waveText.setText(`WAVE ${data.wave}`);
    this.zombieCountText.setText(`${this.cachedZombiesRemaining} remaining`);

    // Hide countdown
    this.countdownText.setAlpha(0);

    // Show wave announcement
    this.showWaveAnnouncement(data.wave, data.totalZombies, data.boss);
  }

  private onWaveCompleteHud(data: { wave: number }): void {
    this.zombieCountText.setText('COMPLETE');
    this.zombieCountText.setColor('#44aa44');

    // Flash complete
    this.tweens.add({
      targets: this.zombieCountText,
      alpha: { from: 1, to: 0.3 },
      yoyo: true,
      repeat: 3,
      duration: 300,
      onComplete: () => {
        this.zombieCountText.setColor('#886644');
        this.zombieCountText.setAlpha(1);
      },
    });
  }

  private onWaveCountdown(data: { wave: number; timeMs: number }): void {
    const seconds = Math.ceil(data.timeMs / 1000);
    this.countdownText.setText(`Next wave in ${seconds}...`);
    this.countdownText.setAlpha(0.8);

    // Start a countdown timer updating every second
    let remaining = seconds;
    const timerEvent = this.time.addEvent({
      delay: 1000,
      repeat: seconds - 1,
      callback: () => {
        remaining--;
        if (remaining > 0) {
          this.countdownText.setText(`Next wave in ${remaining}...`);
        } else {
          this.countdownText.setAlpha(0);
        }
      },
    });
  }

  private onBossIncoming(data: { wave: number; bossType: string }): void {
    const name = data.bossType === 'brute' ? 'THE BRUTE' : 'THE HIVE MOTHER';
    // Show boss bar after a short delay
    this.time.delayedCall(3000, () => {
      this.showBossBar(name, 1, 1); // Will be updated by health events
    });
  }

  private onBossDefeatedHud(): void {
    // Flash boss bar then hide
    this.tweens.add({
      targets: this.bossNameText,
      alpha: 0,
      duration: 800,
      onComplete: () => {
        this.hideBossBar();
      },
    });
  }

  private onScoreChanged(score: number): void {
    this.cachedScore = score;
    this.scoreText.setText(score.toLocaleString());

    // Quick scale pop
    this.tweens.add({
      targets: this.scoreText,
      scale: { from: 1.2, to: 1 },
      duration: 200,
    });
  }

  private onCurrencyChanged(currency: number): void {
    const prev = this.cachedCurrency;
    this.cachedCurrency = currency;
    this.currencyText.setText(String(currency));

    // Flash green if gained, red if spent
    if (currency > prev) {
      this.currencyText.setColor('#44ff44');
      this.time.delayedCall(300, () => {
        this.currencyText.setColor('#ffcc44');
      });
    } else if (currency < prev) {
      this.currencyText.setColor('#ff4444');
      this.time.delayedCall(300, () => {
        this.currencyText.setColor('#ffcc44');
      });
    }
  }

  private onZombieDamaged(data: {
    x: number;
    y: number;
    damage: number;
    isCrit: boolean;
  }): void {
    this.damageNumbers.spawn(data.x, data.y - 20, data.damage, data.isCrit);
  }

  private onZombieKilledHud(_data: any): void {
    this.cachedZombiesRemaining = Math.max(0, this.cachedZombiesRemaining - 1);
    this.zombieCountText.setText(`${this.cachedZombiesRemaining} remaining`);
  }

  private onScreenShake(data: { intensity?: number; duration?: number }): void {
    const intensity = data?.intensity ?? 0.005;
    const duration = data?.duration ?? 150;
    this.cameras.main.shake(duration, intensity);
  }

  private onScreenFlash(data: { duration?: number; r?: number; g?: number; b?: number }): void {
    const duration = data?.duration ?? 100;
    this.cameras.main.flash(duration, data?.r ?? 255, data?.g ?? 255, data?.b ?? 255, true);
  }
}
