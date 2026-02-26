import Phaser from 'phaser';
import { BossZombie } from './BossZombie';
import { BossType, ZombieType, ZombieState } from '../../types/ZombieTypes';
import { BOSS_DATA, ZOMBIE_DATA } from '../../data/ZombieData';
import { EventBus } from '../../utils/EventBus';
import { GameEvents } from '../../types/EventTypes';

/**
 * Hive Boss -- the spawner nightmare.
 *
 * A bloated, pulsating zombie that acts as a mobile hive. Instead of
 * directly overwhelming the player with melee damage, the Hive Boss
 * continuously births new zombies from its body. Destroying it quickly
 * is critical -- the longer it lives, the more the horde grows.
 *
 * It has a **pulsing weak point** (a glowing sac on its torso) that
 * periodically becomes visible. Hitting the weak point deals 2x
 * damage. At all other times, it takes normal damage.
 *
 * Phase 1 (100-60% HP):  Spawns 2 walkers every 8 seconds.
 * Phase 2 (60-30% HP):   Spawns runners instead of walkers.
 *                         Slightly faster approach.
 * Phase 3 (below 30% HP): Spawns a mix of walkers + runners every
 *                         6 seconds. Becomes more aggressive and
 *                         faster. Weak point pulses more frequently.
 */
export class HiveBoss extends BossZombie {
  // ----------------------------------------------------------------
  // Spawn system
  // ----------------------------------------------------------------

  /** Timer tracking when to next spawn minions (ms). */
  private _spawnTimer: number = 0;

  /** Current interval between spawns (ms). */
  private _spawnInterval: number = 8000;

  /** Number of minions to spawn per burst. */
  private _spawnCount: number = 2;

  /** Type(s) of zombie to spawn. */
  private _spawnTypes: ZombieType[] = [ZombieType.WALKER];

  // ----------------------------------------------------------------
  // Weak point
  // ----------------------------------------------------------------

  /** Graphics for the pulsing weak point. */
  private _weakPointGfx: Phaser.GameObjects.Graphics | null = null;

  /** Is the weak point currently visible (vulnerable)? */
  private _weakPointVisible: boolean = false;

  /** Timer controlling the weak point pulse cycle (ms). */
  private _weakPointTimer: number = 0;

  /** Duration the weak point is visible (ms). */
  private _weakPointShowDuration: number = 2500;

  /** Duration the weak point is hidden (ms). */
  private _weakPointHideDuration: number = 5000;

  /** Damage multiplier when weak point is hit. */
  private static readonly WEAK_POINT_MULTIPLIER = 2.0;

  // ----------------------------------------------------------------
  // Phase tracking
  // ----------------------------------------------------------------

  /** Base speed saved at spawn. */
  private _baseSpeed: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'boss-hive');
  }

  // ----------------------------------------------------------------
  // Overrides
  // ----------------------------------------------------------------

  public getZombieType(): string {
    return BossType.HIVE;
  }

  protected override onBossSpawn(): void {
    this.setTexture('boss-hive');
    this.setTint(BOSS_DATA[BossType.HIVE].color);

    // 3 phase thresholds: phase 2 at 60%, phase 3 at 30%
    this.phaseThresholds = [1.0, 0.6, 0.3];
    this.totalPhases = 3;

    // Initial spawn config (Phase 1)
    this._spawnTimer = 0;
    this._spawnInterval = 8000;
    this._spawnCount = 2;
    this._spawnTypes = [ZombieType.WALKER];

    // Weak point setup
    this._weakPointVisible = false;
    this._weakPointTimer = 0;
    this._weakPointShowDuration = 2500;
    this._weakPointHideDuration = 5000;
    this.createWeakPointGraphic();

    // Save base speed
    this._baseSpeed = this.speed;

    // Scale
    this.setScale(1.6);
    this.attackRange = 40;
  }

  // ----------------------------------------------------------------
  // Phase transitions
  // ----------------------------------------------------------------

  protected onPhaseChange(oldPhase: number, newPhase: number): void {
    switch (newPhase) {
      case 2:
        this.enterPhase2();
        break;
      case 3:
        this.enterPhase3();
        break;
    }
  }

  private enterPhase2(): void {
    // Switch to spawning runners
    this._spawnTypes = [ZombieType.RUNNER];
    this._spawnCount = 2;
    this._spawnInterval = 7000;

    // Speed up slightly
    this.speed = this._baseSpeed * 1.25;

    // Visual: shift color to a sickly yellow-green
    this.setTint(0x88aa22);

    // Screen feedback
    EventBus.emit(GameEvents.SCREEN_SHAKE, {
      intensity: 4,
      duration: 300,
    });
  }

  private enterPhase3(): void {
    // Spawn mixed horde more frequently
    this._spawnTypes = [ZombieType.WALKER, ZombieType.RUNNER];
    this._spawnCount = 3;
    this._spawnInterval = 6000;

    // Become aggressive
    this.speed = this._baseSpeed * 1.6;
    this.damage = Math.round(this.damage * 1.5);

    // Weak point pulses more frequently
    this._weakPointShowDuration = 3500;
    this._weakPointHideDuration = 3000;

    // Visual: angry red-green
    this.setTint(0xaa4422);

    // Big screen shake for final phase
    EventBus.emit(GameEvents.SCREEN_SHAKE, {
      intensity: 6,
      duration: 400,
    });

    EventBus.emit(GameEvents.SCREEN_FLASH, {
      color: 0x44aa22,
      duration: 200,
    });
  }

  // ----------------------------------------------------------------
  // AI hooks
  // ----------------------------------------------------------------

  protected override onApproach(
    player: Phaser.GameObjects.Sprite,
    time: number,
    delta: number,
    _barricades?: Phaser.GameObjects.Group,
  ): void {
    // --- Minion spawning ---
    this._spawnTimer += delta;
    if (this._spawnTimer >= this._spawnInterval) {
      this._spawnTimer = 0;
      this.spawnMinions(player);
    }

    // --- Weak point pulse ---
    this.updateWeakPoint(time, delta);

    // --- Pulsating body movement (boss "breathes") ---
    const pulse = 1.0 + Math.sin(time * 0.004) * 0.05;
    this.setScale(1.6 * pulse, 1.6 / pulse);
  }

  // ----------------------------------------------------------------
  // Minion spawning
  // ----------------------------------------------------------------

  private spawnMinions(player: Phaser.GameObjects.Sprite): void {
    // Emit spawn events -- the WaveManager / ZombieManager listens
    // and creates the actual zombie instances from the pool.
    for (let i = 0; i < this._spawnCount; i++) {
      // Pick a random type from the allowed list
      const type =
        this._spawnTypes[
          Math.floor(Math.random() * this._spawnTypes.length)
        ];

      const stats = ZOMBIE_DATA[type];

      // Spawn position: offset from the hive boss
      const offsetX = (Math.random() - 0.5) * 40;
      const spawnX = this.x + offsetX;
      const spawnY = this.y;

      // Emit a custom event for the zombie manager to handle
      EventBus.emit('hive-spawn-minion', {
        type,
        stats,
        x: spawnX,
        y: spawnY,
        source: this,
      });
    }

    // Visual: spawn burst effect
    this.playSpawnBurst();
  }

  /**
   * Visual burst effect when spawning minions.
   */
  private playSpawnBurst(): void {
    // Green particle burst from the body
    const particles = this.scene.add.particles(this.x, this.y, 'bullet', {
      speed: { min: 30, max: 80 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      lifespan: { min: 300, max: 500 },
      tint: [0x44aa22, 0x66cc33, 0x88ff44],
      quantity: 6,
      gravityY: 100,
      emitting: false,
    });

    particles.explode(6);

    this.scene.time.delayedCall(600, () => {
      particles.destroy();
    });

    // Brief body flash
    this.setTint(0xaaffaa);
    this.scene.time.delayedCall(200, () => {
      if (this.isAlive()) {
        // Restore phase-appropriate tint
        if (this.currentPhase >= 3) this.setTint(0xaa4422);
        else if (this.currentPhase === 2) this.setTint(0x88aa22);
        else this.setTint(BOSS_DATA[BossType.HIVE].color);
      }
    });
  }

  // ----------------------------------------------------------------
  // Weak point system
  // ----------------------------------------------------------------

  private createWeakPointGraphic(): void {
    this._weakPointGfx?.destroy();
    this._weakPointGfx = this.scene.add.graphics();
    this._weakPointGfx.setDepth(99);
    this._weakPointGfx.setVisible(false);
  }

  private updateWeakPoint(time: number, delta: number): void {
    this._weakPointTimer += delta;

    if (this._weakPointVisible) {
      // Weak point is showing
      if (this._weakPointTimer >= this._weakPointShowDuration) {
        this._weakPointVisible = false;
        this._weakPointTimer = 0;
        this._weakPointGfx?.setVisible(false);
      } else {
        // Draw pulsing circle on the boss's body
        this.drawWeakPoint(time);
      }
    } else {
      // Weak point is hidden
      if (this._weakPointTimer >= this._weakPointHideDuration) {
        this._weakPointVisible = true;
        this._weakPointTimer = 0;
        this._weakPointGfx?.setVisible(true);
      }
    }
  }

  private drawWeakPoint(time: number): void {
    if (!this._weakPointGfx) return;

    this._weakPointGfx.clear();

    // Pulsing glow
    const pulse = Math.sin(time * 0.008) * 0.3 + 0.7;
    const radius = 10 * pulse;

    // Position on the boss's torso area
    const wpX = this.x;
    const wpY = this.y - 4;

    // Outer glow
    this._weakPointGfx.fillStyle(0x44ff44, 0.3 * pulse);
    this._weakPointGfx.fillCircle(wpX, wpY, radius + 6);

    // Inner core
    this._weakPointGfx.fillStyle(0xaaffaa, 0.8 * pulse);
    this._weakPointGfx.fillCircle(wpX, wpY, radius);

    // Bright center
    this._weakPointGfx.fillStyle(0xffffff, 0.9 * pulse);
    this._weakPointGfx.fillCircle(wpX, wpY, radius * 0.4);
  }

  /**
   * When the weak point is visible, incoming damage is doubled.
   */
  protected override modifyIncomingDamage(amount: number): number {
    if (this._weakPointVisible) {
      return Math.round(amount * HiveBoss.WEAK_POINT_MULTIPLIER);
    }
    return amount;
  }

  /**
   * Is the weak point currently exposed?
   * External systems (e.g. damage number display) can check this.
   */
  public isWeakPointVisible(): boolean {
    return this._weakPointVisible;
  }

  // ----------------------------------------------------------------
  // Death
  // ----------------------------------------------------------------

  public override die(): void {
    // Clean up weak point graphic
    this._weakPointGfx?.destroy();
    this._weakPointGfx = null;

    super.die();
  }

  // ----------------------------------------------------------------
  // Animations
  // ----------------------------------------------------------------

  protected override playWalkAnim(): void {
    const key = 'boss-hive-walk';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  protected override playAttackAnim(): void {
    const key = 'boss-hive-attack';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }
}
