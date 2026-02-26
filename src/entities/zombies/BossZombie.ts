import Phaser from 'phaser';
import { Zombie } from './Zombie';
import { ZombieState, ZombieStats } from '../../types/ZombieTypes';
import { EventBus } from '../../utils/EventBus';
import { GameEvents } from '../../types/EventTypes';

/**
 * Abstract boss zombie base class.
 *
 * Bosses extend the regular Zombie AI but layer a **phase system**
 * on top. As the boss loses HP it transitions through numbered
 * phases, each of which can unlock new attack patterns, change
 * movement behaviour, or spawn minions.
 *
 * Common boss features handled here:
 *   - Phase tracking with configurable HP thresholds.
 *   - Boss health bar emission via EventBus.
 *   - BOSS_INCOMING / BOSS_DEFEATED event lifecycle.
 *   - Larger scale and increased screen presence.
 *   - Resistance to knockback.
 */
export abstract class BossZombie extends Zombie {
  // ----------------------------------------------------------------
  // Phase system
  // ----------------------------------------------------------------

  /** Current phase number (1-based). */
  protected currentPhase: number = 1;

  /** Total number of phases for this boss. */
  protected totalPhases: number = 2;

  /**
   * HP thresholds (as fractions of maxHp) that trigger phase
   * transitions.  E.g. [1.0, 0.5] means phase 1 starts at full
   * HP, phase 2 triggers when HP drops to 50%.
   * Subclasses must populate this.
   */
  protected phaseThresholds: number[] = [1.0, 0.5];

  // ----------------------------------------------------------------
  // Boss health bar
  // ----------------------------------------------------------------

  /** Phaser Graphics object rendered above the boss. */
  private _healthBarBg: Phaser.GameObjects.Graphics | null = null;
  private _healthBarFill: Phaser.GameObjects.Graphics | null = null;

  /** Health bar dimensions. */
  private static readonly BAR_WIDTH = 80;
  private static readonly BAR_HEIGHT = 8;
  private static readonly BAR_OFFSET_Y = -12;

  /** Whether the boss-incoming announcement has been sent. */
  private _announcementSent: boolean = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    frame?: string | number,
  ) {
    super(scene, x, y, texture, frame);
  }

  // ----------------------------------------------------------------
  // Spawn
  // ----------------------------------------------------------------

  public override spawn(
    x: number,
    y: number,
    stats: ZombieStats & { phases?: number },
    waveFactor: number = 1,
  ): void {
    super.spawn(x, y, stats, waveFactor);

    // Boss-specific setup
    this.totalPhases = stats.phases ?? 2;
    this.currentPhase = 1;
    this._announcementSent = false;

    // Bosses are big
    this.setScale(1.6);

    // Create health bar graphics
    this.createHealthBar();

    // Announce arrival
    EventBus.emit(GameEvents.BOSS_INCOMING, {
      boss: this,
      bossType: this.getZombieType(),
    });
    this._announcementSent = true;

    // Screen shake on spawn
    EventBus.emit(GameEvents.SCREEN_SHAKE, {
      intensity: 6,
      duration: 500,
    });

    // Subclass boss init
    this.onBossSpawn();
  }

  /**
   * Override in boss subclasses for phase-specific spawn init.
   */
  protected onBossSpawn(): void {
    // default: no-op
  }

  // ----------------------------------------------------------------
  // Health bar
  // ----------------------------------------------------------------

  private createHealthBar(): void {
    // Destroy old bars if they exist (pool reuse)
    this._healthBarBg?.destroy();
    this._healthBarFill?.destroy();

    this._healthBarBg = this.scene.add.graphics();
    this._healthBarFill = this.scene.add.graphics();

    // Set depth so the bar renders above the boss
    this._healthBarBg.setDepth(100);
    this._healthBarFill.setDepth(101);
  }

  private updateHealthBar(): void {
    if (!this._healthBarBg || !this._healthBarFill) return;
    if (!this.isAlive()) {
      this._healthBarBg.setVisible(false);
      this._healthBarFill.setVisible(false);
      return;
    }

    const barX = this.x - BossZombie.BAR_WIDTH / 2;
    const barY = this.y - this.displayHeight / 2 + BossZombie.BAR_OFFSET_Y;
    const hpFraction = Math.max(0, this.hp / this.maxHp);

    // Background (dark)
    this._healthBarBg.clear();
    this._healthBarBg.fillStyle(0x222222, 0.8);
    this._healthBarBg.fillRect(
      barX - 1,
      barY - 1,
      BossZombie.BAR_WIDTH + 2,
      BossZombie.BAR_HEIGHT + 2,
    );

    // Fill (red -> orange -> green depending on HP)
    this._healthBarFill.clear();
    let barColor = 0x44cc44;
    if (hpFraction < 0.3) barColor = 0xcc4444;
    else if (hpFraction < 0.6) barColor = 0xcc8833;

    this._healthBarFill.fillStyle(barColor, 1);
    this._healthBarFill.fillRect(
      barX,
      barY,
      BossZombie.BAR_WIDTH * hpFraction,
      BossZombie.BAR_HEIGHT,
    );

    // Phase indicator ticks on the bar
    for (let i = 1; i < this.phaseThresholds.length; i++) {
      const tickX = barX + BossZombie.BAR_WIDTH * this.phaseThresholds[i];
      this._healthBarFill.fillStyle(0xffffff, 0.6);
      this._healthBarFill.fillRect(tickX - 1, barY, 2, BossZombie.BAR_HEIGHT);
    }
  }

  // ----------------------------------------------------------------
  // AI Update (extends base to add phase checks + health bar)
  // ----------------------------------------------------------------

  public override updateAI(
    player: Phaser.GameObjects.Sprite,
    time: number,
    delta: number,
    barricades?: Phaser.GameObjects.Group,
  ): void {
    super.updateAI(player, time, delta, barricades);

    // Update visual health bar position
    this.updateHealthBar();

    // Check for phase transitions
    if (this.isAlive()) {
      this.checkPhaseTransition();
    }
  }

  // ----------------------------------------------------------------
  // Phase system
  // ----------------------------------------------------------------

  private checkPhaseTransition(): void {
    const hpFraction = this.hp / this.maxHp;

    // Walk through thresholds and find the highest phase we qualify for
    for (let i = this.phaseThresholds.length - 1; i >= 0; i--) {
      if (hpFraction <= this.phaseThresholds[i] && this.currentPhase < i + 1) {
        const oldPhase = this.currentPhase;
        this.currentPhase = i + 1;
        this.onPhaseChange(oldPhase, this.currentPhase);
        break;
      }
    }
  }

  /**
   * Called when the boss transitions to a new phase.
   * Subclasses MUST override this to define phase behaviour changes.
   */
  protected abstract onPhaseChange(oldPhase: number, newPhase: number): void;

  // ----------------------------------------------------------------
  // Death
  // ----------------------------------------------------------------

  public override die(): void {
    // Clean up health bar
    this._healthBarBg?.destroy();
    this._healthBarFill?.destroy();
    this._healthBarBg = null;
    this._healthBarFill = null;

    // Emit boss defeated before base die() recycles us
    EventBus.emit(GameEvents.BOSS_DEFEATED, {
      boss: this,
      bossType: this.getZombieType(),
      points: this.points,
      currency: this.currencyDrop,
    });

    // Large screen shake
    EventBus.emit(GameEvents.SCREEN_SHAKE, {
      intensity: 8,
      duration: 600,
    });

    // Flash screen
    EventBus.emit(GameEvents.SCREEN_FLASH, {
      color: 0xff0000,
      duration: 300,
    });

    super.die();
  }

  /**
   * Bosses are resistant to knockback.
   */
  protected override applyKnockback(force: number = 50): void {
    // Bosses barely budge
    super.applyKnockback(force * 0.15);
  }

  /**
   * Override blood particles to spawn a bigger burst for bosses.
   */
  protected override spawnBloodParticles(): void {
    const particles = this.scene.add.particles(this.x, this.y, 'bullet', {
      speed: { min: 60, max: 180 },
      angle: { min: 180, max: 360 },
      scale: { start: 1.0, end: 0 },
      lifespan: { min: 500, max: 1000 },
      tint: [0x880000, 0xaa0000, 0x660000, 0xcc2200],
      quantity: 20,
      gravityY: 200,
      emitting: false,
    });

    particles.explode(20);

    this.scene.time.delayedCall(1100, () => {
      particles.destroy();
    });
  }
}
