import Phaser from 'phaser';
import { Entity } from '../Entity';
import { ZombieState, ZombieStats } from '../../types/ZombieTypes';
import { EventBus } from '../../utils/EventBus';
import { GameEvents } from '../../types/EventTypes';
import { KNOCKBACK_FORCE, CAR_FLOOR_Y } from '../../data/BalanceConstants';

/**
 * Abstract base zombie class. Every zombie variant extends this class
 * and inherits a full AI state machine with five states:
 *
 *   SPAWNING -> APPROACHING -> ATTACKING -> (back to APPROACHING when target moves)
 *                                 ^
 *   Any state  ->  STUNNED  ------'
 *   Any state  ->  DYING
 *
 * The base class handles movement, target selection, attack cooldowns,
 * hit flash / knockback, death rewards, and blood particle spawning.
 * Subclasses override hooks to inject custom behaviour (leap, ranged
 * attack, armor, etc.) without duplicating the core loop.
 */
export abstract class Zombie extends Entity {
  // ----------------------------------------------------------------
  // Stats (copied from ZombieStats on spawn for per-instance mutation)
  // ----------------------------------------------------------------
  public speed: number = 0;
  public damage: number = 0;
  public attackRate: number = 0;
  public points: number = 0;
  public currencyDrop: number = 0;

  // Flags from data
  public canClimbBarricade: boolean = false;
  public canCrawlUnder: boolean = false;
  public isRanged: boolean = false;

  // ----------------------------------------------------------------
  // AI
  // ----------------------------------------------------------------
  public state: ZombieState = ZombieState.SPAWNING;

  /** The thing we are walking toward / hitting. */
  protected target: Phaser.GameObjects.Sprite | null = null;

  /** Whether current target is a barricade (vs player). */
  protected targetIsBarricade: boolean = false;

  /** Horizontal direction of movement: -1 = left, 1 = right. */
  protected facing: number = -1;

  /** Range at which melee attacks connect. */
  protected attackRange: number = 32;

  // ----------------------------------------------------------------
  // Timers (ms)
  // ----------------------------------------------------------------
  private _lastAttackTime: number = 0;
  private _spawnEndTime: number = 0;
  private _stunEndTime: number = 0;
  private _dyingEndTime: number = 0;

  /** Duration the zombie stays frozen after spawn-in (ms). */
  private static readonly SPAWN_PAUSE_MS = 400;

  /** Duration of the stun / knockback window (ms). */
  private static readonly STUN_DURATION_MS = 250;

  /** Duration for the death animation before pool recycle (ms). */
  private static readonly DEATH_ANIM_MS = 500;

  /** Small per-zombie random speed variance factor (0.9 – 1.1). */
  private _speedVariance: number = 1;

  /** The texture key so we can restore tint after flash. */
  protected baseColor: number = 0xffffff;

  declare body: Phaser.Physics.Arcade.Body;

  // ----------------------------------------------------------------
  // Constructor
  // ----------------------------------------------------------------

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    frame?: string | number,
  ) {
    super(scene, x, y, texture, frame, 50);

    // Start invisible; spawn() will activate.
    this.setActive(false);
    this.setVisible(false);

    this.body.setAllowGravity(true);
  }

  // ----------------------------------------------------------------
  // Spawn / object-pool reuse
  // ----------------------------------------------------------------

  /**
   * Activate this zombie at the given world position with the supplied
   * stats.  Everything is reset so it can be reused from a pool.
   */
  public spawn(x: number, y: number, stats: ZombieStats, waveFactor: number = 1): void {
    // Position
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.setAlpha(1);
    this.setScale(1);

    // Physics body
    this.body.setEnable(true);
    this.body.setSize(stats.width, stats.height);
    this.body.setOffset(
      (this.width - stats.width) / 2,
      this.height - stats.height,
    );
    this.body.setVelocity(0, 0);

    // Copy stats (scale HP & speed by wave difficulty factor)
    this.maxHp = Math.round(stats.hp * waveFactor);
    this.hp = this.maxHp;
    this.speed = stats.speed * (1 + (waveFactor - 1) * 0.3);
    this.damage = stats.damage;
    this.attackRate = stats.attackRate;
    this.points = stats.points;
    this.currencyDrop = stats.currencyDrop;
    this.canClimbBarricade = stats.canClimbBarricade;
    this.canCrawlUnder = stats.canCrawlUnder;
    this.isRanged = stats.isRanged;
    this.baseColor = stats.color;

    // Tint to the zombie's configured color
    this.setTint(this.baseColor);

    // Per-zombie speed variance so hordes don't stack perfectly
    this._speedVariance = 0.9 + Math.random() * 0.2;

    // Timers
    this._lastAttackTime = 0;
    this._spawnEndTime = this.scene.time.now + Zombie.SPAWN_PAUSE_MS;
    this._stunEndTime = 0;
    this._dyingEndTime = 0;

    // AI
    this.state = ZombieState.SPAWNING;
    this.target = null;
    this.targetIsBarricade = false;

    // Facing: zombies typically come from the right and move left
    this.facing = -1;
    this.setFlipX(this.facing > 0);

    // Subclass-specific spawn init
    this.onSpawn();
  }

  /**
   * Override in subclasses for custom spawn setup (animations, scale, etc.).
   */
  protected onSpawn(): void {
    // default: no-op
  }

  // ----------------------------------------------------------------
  // AI State Machine
  // ----------------------------------------------------------------

  /**
   * Main update tick. Call this every frame from the scene / manager.
   *
   * @param player   - the player sprite (used for target selection)
   * @param time     - current game time in ms
   * @param delta    - ms since last frame
   * @param barricades - optional group of barricades to target
   */
  public updateAI(
    player: Phaser.GameObjects.Sprite,
    time: number,
    delta: number,
    barricades?: Phaser.GameObjects.Group,
  ): void {
    if (!this.active) return;

    // Flash bookkeeping (from Entity base)
    this.updateFlash(time);

    switch (this.state) {
      case ZombieState.SPAWNING:
        this.stateSpawning(time);
        break;
      case ZombieState.APPROACHING:
        this.stateApproaching(player, time, delta, barricades);
        break;
      case ZombieState.ATTACKING:
        this.stateAttacking(time, delta);
        break;
      case ZombieState.STUNNED:
        this.stateStunned(time);
        break;
      case ZombieState.DYING:
        this.stateDying(time);
        break;
    }
  }

  // -- SPAWNING ------------------------------------------------------

  private stateSpawning(time: number): void {
    // Brief pause: zombie climbs onto the train / stands up
    this.body.setVelocityX(0);
    if (time >= this._spawnEndTime) {
      this.transitionTo(ZombieState.APPROACHING);
    }
  }

  // -- APPROACHING ---------------------------------------------------

  private stateApproaching(
    player: Phaser.GameObjects.Sprite,
    time: number,
    delta: number,
    barricades?: Phaser.GameObjects.Group,
  ): void {
    // Target selection: find nearest barricade in our path first
    this.selectTarget(player, barricades);

    if (!this.target || !this.target.active) {
      // Fallback to player
      this.target = player;
      this.targetIsBarricade = false;
    }

    // Direction toward target
    const dx = this.target.x - this.x;
    this.facing = dx < 0 ? -1 : 1;
    this.setFlipX(this.facing > 0);

    // Check if in attack range
    const dist = Math.abs(dx);
    if (dist <= this.attackRange) {
      this.transitionTo(ZombieState.ATTACKING);
      return;
    }

    // Custom approach behavior (subclasses can override)
    this.onApproach(player, time, delta, barricades);

    // Default horizontal movement
    const moveSpeed = this.speed * this._speedVariance;
    this.body.setVelocityX(this.facing * moveSpeed);

    // Play walk animation if available
    this.playWalkAnim();
  }

  /**
   * Hook for subclasses to inject behaviour while approaching
   * (e.g. Runner leap detection, Spitter range check).
   * Called before default movement is applied.
   */
  protected onApproach(
    _player: Phaser.GameObjects.Sprite,
    _time: number,
    _delta: number,
    _barricades?: Phaser.GameObjects.Group,
  ): void {
    // default: no-op
  }

  // -- ATTACKING -----------------------------------------------------

  private stateAttacking(time: number, _delta: number): void {
    this.body.setVelocityX(0);

    // Validate target still exists and in range
    if (!this.target || !this.target.active) {
      this.transitionTo(ZombieState.APPROACHING);
      return;
    }

    const dist = Math.abs(this.target.x - this.x);
    if (dist > this.attackRange * 1.5) {
      // Target moved away
      this.transitionTo(ZombieState.APPROACHING);
      return;
    }

    // Attack on cooldown
    if (time - this._lastAttackTime >= this.attackRate) {
      this._lastAttackTime = time;
      this.performAttack();
    }

    this.playAttackAnim();
  }

  /**
   * Execute the actual attack logic. Subclasses can override for ranged
   * attacks, area damage, etc.
   */
  protected performAttack(): void {
    if (!this.target || !this.target.active) return;

    // Deal damage to whatever our target is
    if (this.targetIsBarricade) {
      EventBus.emit(GameEvents.BARRICADE_DAMAGED, {
        barricade: this.target,
        damage: this.damage,
        source: this,
      });
    } else {
      EventBus.emit(GameEvents.PLAYER_DAMAGED, {
        damage: this.damage,
        source: this,
      });
    }
  }

  // -- STUNNED -------------------------------------------------------

  private stateStunned(time: number): void {
    if (time >= this._stunEndTime) {
      this.body.setVelocityX(0);
      this.transitionTo(ZombieState.APPROACHING);
    }
  }

  // -- DYING ---------------------------------------------------------

  private stateDying(time: number): void {
    // Fade out during death animation
    const remaining = this._dyingEndTime - time;
    const progress = 1 - Math.max(0, remaining / Zombie.DEATH_ANIM_MS);
    this.setAlpha(1 - progress * 0.8);

    if (time >= this._dyingEndTime) {
      // Fully dead; recycle into pool
      this.setActive(false);
      this.setVisible(false);
      this.body.setEnable(false);
    }
  }

  // ----------------------------------------------------------------
  // State transitions
  // ----------------------------------------------------------------

  protected transitionTo(newState: ZombieState): void {
    const oldState = this.state;
    this.state = newState;
    this.onStateChanged(oldState, newState);
  }

  /**
   * Hook for subclasses to respond to state transitions.
   */
  protected onStateChanged(_from: ZombieState, _to: ZombieState): void {
    // default: no-op
  }

  // ----------------------------------------------------------------
  // Target selection
  // ----------------------------------------------------------------

  /**
   * Pick the nearest barricade that is between us and the player.
   * If none found, target the player directly.
   */
  protected selectTarget(
    player: Phaser.GameObjects.Sprite,
    barricades?: Phaser.GameObjects.Group,
  ): void {
    if (!barricades || barricades.getLength() === 0) {
      this.target = player;
      this.targetIsBarricade = false;
      return;
    }

    let nearest: Phaser.GameObjects.Sprite | null = null;
    let nearestDist = Infinity;

    const children = barricades.getChildren() as Phaser.GameObjects.Sprite[];
    for (const b of children) {
      if (!b.active) continue;

      // Only target barricades that are between us and the player
      const barricadeBetween =
        (this.facing < 0 && b.x < this.x && b.x > player.x) ||
        (this.facing > 0 && b.x > this.x && b.x < player.x);

      // Also target barricades directly ahead even if player is behind
      const barricadeAhead =
        (this.facing < 0 && b.x < this.x) ||
        (this.facing > 0 && b.x > this.x);

      if (barricadeBetween || barricadeAhead) {
        const dist = Math.abs(b.x - this.x);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = b;
        }
      }
    }

    if (nearest && this.shouldTargetBarricade(nearest)) {
      this.target = nearest;
      this.targetIsBarricade = true;
    } else {
      this.target = player;
      this.targetIsBarricade = false;
    }
  }

  /**
   * Subclasses can override to skip barricades (e.g. Crawler crawls
   * under them, Runner leaps over them).
   */
  protected shouldTargetBarricade(_barricade: Phaser.GameObjects.Sprite): boolean {
    return true;
  }

  // ----------------------------------------------------------------
  // Damage overrides
  // ----------------------------------------------------------------

  /**
   * Override Entity.takeDamage to add knockback and stun.
   */
  public override takeDamage(amount: number): void {
    if (!this.isAlive()) return;
    if (this.state === ZombieState.DYING) return;

    // Allow subclasses to modify incoming damage (e.g. Tank armor)
    const finalDamage = this.modifyIncomingDamage(amount);
    if (finalDamage <= 0) return;

    // Apply damage via parent (handles flash, HP reduction, death)
    this.hp = Math.max(0, this.hp - finalDamage);

    // Visual flash
    this.setTintFill(0xffffff);
    (this as any)._flashUntil = this.scene.time.now + 120;

    // Emit damage event
    EventBus.emit(GameEvents.ZOMBIE_DAMAGED, {
      zombie: this,
      damage: finalDamage,
      hp: this.hp,
      maxHp: this.maxHp,
    });

    if (this.hp <= 0) {
      this.die();
      return;
    }

    // Knockback and brief stun
    this.applyKnockback();
  }

  /**
   * Subclasses override to modify incoming damage (e.g. Tank armor).
   * Return the final damage to apply.
   */
  protected modifyIncomingDamage(amount: number): number {
    return amount;
  }

  /**
   * Apply horizontal knockback away from the damage source (assumed
   * to be from the side opposite our facing direction).
   */
  protected applyKnockback(force: number = KNOCKBACK_FORCE): void {
    // Knock the zombie backward (opposite of facing)
    this.body.setVelocityX(-this.facing * force);
    this.body.setVelocityY(-force * 0.3);

    this._stunEndTime = this.scene.time.now + Zombie.STUN_DURATION_MS;
    this.transitionTo(ZombieState.STUNNED);
  }

  // ----------------------------------------------------------------
  // Death
  // ----------------------------------------------------------------

  /**
   * Override Entity.die to play death sequence: award points, spawn
   * blood particles, then fade out before deactivating.
   */
  public override die(): void {
    if (this.state === ZombieState.DYING) return;

    this.hp = 0;

    // Award rewards via EventBus
    EventBus.emit(GameEvents.ZOMBIE_KILLED, {
      zombie: this,
      points: this.points,
      currency: this.currencyDrop,
      x: this.x,
      y: this.y,
    });

    EventBus.emit(GameEvents.SCORE_CHANGED, {
      delta: this.points,
    });

    EventBus.emit(GameEvents.CURRENCY_CHANGED, {
      delta: this.currencyDrop,
    });

    // Spawn blood particles
    this.spawnBloodParticles();

    // Stop moving
    this.body.setVelocityX(0);
    this.body.setVelocityY(0);

    // Enter dying state for the fade-out animation
    this._dyingEndTime = this.scene.time.now + Zombie.DEATH_ANIM_MS;
    this.transitionTo(ZombieState.DYING);

    // Subclass death hook
    this.onDeath();
  }

  /**
   * Spawn a burst of blood-red particles at the zombie's position.
   */
  protected spawnBloodParticles(): void {
    // Create a simple particle burst using scene's particle system
    const particles = this.scene.add.particles(this.x, this.y, 'bullet', {
      speed: { min: 40, max: 120 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.6, end: 0 },
      lifespan: { min: 300, max: 600 },
      tint: [0x880000, 0xaa0000, 0x660000],
      quantity: 8,
      gravityY: 200,
      emitting: false,
    });

    particles.explode(8);

    // Auto-destroy the emitter after particles expire
    this.scene.time.delayedCall(700, () => {
      particles.destroy();
    });
  }

  // ----------------------------------------------------------------
  // Animation helpers
  // ----------------------------------------------------------------

  /**
   * Play the walk animation for this zombie type.
   * Subclasses should override to use their specific animation key.
   */
  protected playWalkAnim(): void {
    const key = `${this.texture.key}-walk`;
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  /**
   * Play the attack animation for this zombie type.
   */
  protected playAttackAnim(): void {
    const key = `${this.texture.key}-attack`;
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  /**
   * Play the death animation for this zombie type.
   */
  protected playDeathAnim(): void {
    const key = `${this.texture.key}-die`;
    if (this.anims.exists(key)) {
      this.play(key, true);
    }
  }

  // ----------------------------------------------------------------
  // Utility
  // ----------------------------------------------------------------

  /**
   * Get the effective movement speed (base * variance).
   */
  protected getEffectiveSpeed(): number {
    return this.speed * this._speedVariance;
  }

  /**
   * Returns the horizontal distance to the given game object.
   */
  protected distanceTo(obj: Phaser.GameObjects.Sprite): number {
    return Math.abs(this.x - obj.x);
  }

  /**
   * Returns the full Euclidean distance to the given game object.
   */
  protected fullDistanceTo(obj: Phaser.GameObjects.Sprite): number {
    const dx = this.x - obj.x;
    const dy = this.y - obj.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * The abstract zombie type name (for pool identification, etc.).
   */
  public abstract getZombieType(): string;
}
