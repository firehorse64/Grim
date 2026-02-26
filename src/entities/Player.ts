import Phaser from 'phaser';
import { Entity } from './Entity';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';
import { InputState, Direction, ZoneType } from '../types/GameTypes';
import { WeaponType, WeaponStats, WeaponState } from '../types/WeaponTypes';
import { WEAPON_DATA } from '../data/WeaponData';
import {
  PLAYER_START_HP,
  PLAYER_MAX_HP,
  PLAYER_SPEED,
  PLAYER_JUMP_VELOCITY,
  PLAYER_INVINCIBILITY_MS,
  PLAYER_START_CURRENCY,
  CAR_FLOOR_Y,
  CAR_ROOF_WALK_Y,
} from '../data/BalanceConstants';
import { angleBetween, clamp } from '../utils/MathUtils';

// ====================================================================
// Animation keys (must match the texture atlas keys generated in the
// preloader / asset-gen pipeline).
// ====================================================================
const Anim = {
  IDLE: 'player-idle',
  RUN: 'player-run',
  JUMP: 'player-jump',
  SHOOT: 'player-shoot',
  HURT: 'player-hurt',
  DIE: 'player-die',
  CLIMB: 'player-climb',
} as const;

// ====================================================================
// Player states (internal finite-state label)
// ====================================================================
enum PlayerState {
  IDLE = 'idle',
  RUNNING = 'running',
  JUMPING = 'jumping',
  SHOOTING = 'shooting',
  HURT = 'hurt',
  CLIMBING = 'climbing',
  DEAD = 'dead',
}

// ====================================================================
// Regen constants
// ====================================================================
const REGEN_INTERVAL_MS = 2000; // heal 1 HP every 2 s when upgrade active
const REGEN_AMOUNT = 1;

/**
 * The player character. Handles movement, jumping, zone transitions
 * (interior / rooftop via ladders), aiming, shooting, weapon
 * management, health, currency, and animation state.
 *
 * The heavy lifting of *creating projectiles* is left to the weapon /
 * combat system -- Player only calls into a `fire()` callback so the
 * combat layer can spawn bullets in whatever pool it manages.
 */
export class Player extends Entity {
  // ------------------------------------------------------------------
  // Identity & state
  // ------------------------------------------------------------------
  public facing: Direction = Direction.RIGHT;
  public isOnRoof: boolean = false;
  public zone: ZoneType = ZoneType.INTERIOR;
  public currency: number = PLAYER_START_CURRENCY;

  private playerState: PlayerState = PlayerState.IDLE;
  private prevState: PlayerState = PlayerState.IDLE;

  // ------------------------------------------------------------------
  // Movement tuning (may be modified by upgrades at runtime)
  // ------------------------------------------------------------------
  public moveSpeed: number = PLAYER_SPEED;

  // ------------------------------------------------------------------
  // Invincibility
  // ------------------------------------------------------------------
  private invincibleUntil: number = 0;
  private invincibilityFlickerTimer: number = 0;

  // ------------------------------------------------------------------
  // Weapons
  // ------------------------------------------------------------------
  public weapons: WeaponState[] = [];
  public currentWeaponIndex: number = 0;

  /**
   * External fire callback. The combat / projectile system should set
   * this after constructing the Player so it can spawn bullets in its
   * own pool. Signature:
   *   (weaponStats, weaponState, originX, originY, angle) => boolean
   * Returns true if the shot was actually fired (had ammo etc.).
   */
  public onFire:
    | ((
        stats: WeaponStats,
        state: WeaponState,
        x: number,
        y: number,
        angle: number,
      ) => boolean)
    | null = null;

  // ------------------------------------------------------------------
  // Upgrades / regen
  // ------------------------------------------------------------------
  public hasRegen: boolean = false;
  private regenTimer: number = 0;

  // Store purchased upgrade IDs so other systems can query.
  public purchasedUpgrades: Set<string> = new Set();

  // ------------------------------------------------------------------
  // Ladder / climb helpers (set externally by the level / train system)
  // ------------------------------------------------------------------
  /** Set to true by the train/level each frame if the player overlaps a ladder. */
  public isOverlappingLadder: boolean = false;
  private isClimbing: boolean = false;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Start with the idle texture; base Entity adds to scene + physics.
    super(scene, x, y, 'player-idle', undefined, PLAYER_MAX_HP);

    this.hp = PLAYER_START_HP;
    this.maxHp = PLAYER_MAX_HP;

    // Physics body setup
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 44);
    body.setOffset(4, 4);
    body.setCollideWorldBounds(true);
    body.setMaxVelocityY(600);

    // Give the player a pistol to start with
    this.addWeapon(WeaponType.PISTOL);

    this.setDepth(10);
  }

  // ==================================================================
  // Weapon management
  // ==================================================================

  /**
   * Add a new weapon to the player's inventory. If the weapon type
   * already exists, refill its reserve ammo instead.
   */
  public addWeapon(type: WeaponType): void {
    const existing = this.weapons.find((w) => w.type === type);
    if (existing) {
      const stats = WEAPON_DATA[type];
      existing.reserveAmmo = stats.unlimitedReserve
        ? Infinity
        : stats.maxReserve;
      return;
    }

    const stats = WEAPON_DATA[type];
    const newWeapon: WeaponState = {
      type,
      currentAmmo: stats.clipSize,
      reserveAmmo: stats.unlimitedReserve ? Infinity : stats.maxReserve,
      isReloading: false,
      reloadTimer: 0,
      fireCooldown: 0,
      level: 0,
    };

    this.weapons.push(newWeapon);

    // Auto-switch to newly acquired weapon if it's not the starting pistol
    if (this.weapons.length > 1) {
      this.switchWeapon(this.weapons.length - 1);
    }
  }

  /** Get the currently selected weapon state. */
  public get currentWeapon(): WeaponState {
    return this.weapons[this.currentWeaponIndex];
  }

  /** Get the WeaponStats (from data table) for the current weapon. */
  public get currentWeaponStats(): WeaponStats {
    return WEAPON_DATA[this.currentWeapon.type];
  }

  /**
   * Switch to a weapon by inventory index.
   */
  public switchWeapon(index: number): void {
    if (index < 0 || index >= this.weapons.length) return;
    if (index === this.currentWeaponIndex) return;

    // Cancel any in-progress reload on old weapon
    const old = this.weapons[this.currentWeaponIndex];
    if (old.isReloading) {
      old.isReloading = false;
      old.reloadTimer = 0;
    }

    this.currentWeaponIndex = index;

    EventBus.emit(GameEvents.WEAPON_SWITCHED, {
      type: this.currentWeapon.type,
      index,
    });
    this.emitAmmoChanged();
  }

  // ==================================================================
  // Health overrides
  // ==================================================================

  public override takeDamage(amount: number): void {
    // Ignore damage during invincibility window
    if (this.scene.time.now < this.invincibleUntil) return;

    super.takeDamage(amount);

    if (this.hp > 0) {
      // Start invincibility period
      this.invincibleUntil = this.scene.time.now + PLAYER_INVINCIBILITY_MS;
      this.playerState = PlayerState.HURT;

      EventBus.emit(GameEvents.PLAYER_DAMAGED, {
        hp: this.hp,
        maxHp: this.maxHp,
        amount,
      });

      // Screen feedback
      EventBus.emit(GameEvents.SCREEN_SHAKE, { intensity: 3, duration: 150 });
      EventBus.emit(GameEvents.SCREEN_FLASH, { color: 0xff0000, alpha: 0.2, duration: 100 });
    }
  }

  public override heal(amount: number): void {
    super.heal(amount);

    EventBus.emit(GameEvents.PLAYER_HEALED, {
      hp: this.hp,
      maxHp: this.maxHp,
      amount,
    });
  }

  protected override onDeath(): void {
    this.playerState = PlayerState.DEAD;
    this.playAnim(Anim.DIE, false);
    EventBus.emit(GameEvents.PLAYER_DIED, {});
  }

  // ==================================================================
  // Currency
  // ==================================================================

  public addCurrency(amount: number): void {
    this.currency += amount;
    EventBus.emit(GameEvents.CURRENCY_CHANGED, { currency: this.currency });
  }

  public spendCurrency(amount: number): boolean {
    if (this.currency < amount) return false;
    this.currency -= amount;
    EventBus.emit(GameEvents.CURRENCY_CHANGED, { currency: this.currency });
    return true;
  }

  // ==================================================================
  // Main update (called every frame by the game scene)
  // ==================================================================

  public update(input: InputState, time: number, delta: number): void {
    if (!this.isAlive()) return;

    // Clear damage flash from the base Entity class
    this.updateFlash(time);

    // Update invincibility flicker visual
    this.updateInvincibility(time, delta);

    // Regeneration
    this.updateRegen(time);

    // Weapon cooldowns & reload timers
    this.updateWeapons(delta);

    // --- Process input ---
    this.handleMovement(input);
    this.handleClimbing(input);
    this.handleJump(input);
    this.handleAim(input);
    this.handleShooting(input, time);
    this.handleReload(input);
    this.handleWeaponSwitch(input);

    // Determine animation from state
    this.resolveAnimation();
  }

  // ==================================================================
  // Movement
  // ==================================================================

  private handleMovement(input: InputState): void {
    if (this.isClimbing) return;
    if (this.playerState === PlayerState.HURT) return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    const vx = input.moveX * this.moveSpeed;
    body.setVelocityX(vx);

    // Update running / idle state
    if (this.playerState !== PlayerState.JUMPING) {
      if (vx !== 0) {
        this.playerState = PlayerState.RUNNING;
      } else if (this.playerState === PlayerState.RUNNING) {
        this.playerState = PlayerState.IDLE;
      }
    }
  }

  // ==================================================================
  // Climbing (ladder transitions between interior <-> roof)
  // ==================================================================

  private handleClimbing(input: InputState): void {
    const body = this.body as Phaser.Physics.Arcade.Body;

    // Start climbing if over ladder and pressing up/down
    if (this.isOverlappingLadder && !this.isClimbing) {
      if (input.climbUp && !this.isOnRoof) {
        this.startClimb(true);
        return;
      }
      if (input.climbDown && this.isOnRoof) {
        this.startClimb(false);
        return;
      }
    }

    // While climbing, move vertically and ignore horizontal movement
    if (this.isClimbing) {
      body.setVelocityX(0);
      body.setAllowGravity(false);

      const targetY = this.isOnRoof ? CAR_FLOOR_Y - 24 : CAR_ROOF_WALK_Y - 24;
      const direction = targetY < this.y ? -1 : 1;
      const climbSpeed = 180;

      body.setVelocityY(direction * climbSpeed);

      // Check if we've reached the destination
      if (
        (direction < 0 && this.y <= targetY) ||
        (direction > 0 && this.y >= targetY)
      ) {
        this.finishClimb();
      }
    }
  }

  private startClimb(goingUp: boolean): void {
    this.isClimbing = true;
    this.playerState = PlayerState.CLIMBING;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
    body.setAllowGravity(false);

    // We'll set isOnRoof at the END of the climb
    // goingUp means we will be on the roof when done
    // goingDown means we will be in the interior when done
    // Temporarily store the target in a simple flag
    if (goingUp) {
      // climbing up to roof
      this._climbTarget = true;
    } else {
      // climbing down to interior
      this._climbTarget = false;
    }
  }

  private _climbTarget: boolean = false;

  private finishClimb(): void {
    this.isClimbing = false;
    this.isOnRoof = this._climbTarget;
    this.zone = this.isOnRoof ? ZoneType.ROOFTOP : ZoneType.INTERIOR;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);
    body.setVelocityY(0);

    // Snap to the correct floor Y
    const snapY = this.isOnRoof ? CAR_ROOF_WALK_Y - 24 : CAR_FLOOR_Y - 24;
    this.setY(snapY);

    this.playerState = PlayerState.IDLE;
  }

  // ==================================================================
  // Jumping
  // ==================================================================

  private handleJump(input: InputState): void {
    if (this.isClimbing) return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    if (input.jumping && body.blocked.down) {
      body.setVelocityY(PLAYER_JUMP_VELOCITY);
      this.playerState = PlayerState.JUMPING;
    }

    // Detect landing
    if (this.playerState === PlayerState.JUMPING && body.blocked.down && body.velocity.y >= 0) {
      this.playerState = PlayerState.IDLE;
    }
  }

  // ==================================================================
  // Aiming
  // ==================================================================

  private handleAim(input: InputState): void {
    // Face toward the mouse cursor
    if (input.aimX < this.x) {
      this.facing = Direction.LEFT;
      this.setFlipX(true);
    } else {
      this.facing = Direction.RIGHT;
      this.setFlipX(false);
    }
  }

  // ==================================================================
  // Shooting
  // ==================================================================

  private handleShooting(input: InputState, time: number): void {
    if (!input.shooting) return;
    if (this.isClimbing) return;
    if (this.weapons.length === 0) return;

    const weapon = this.currentWeapon;
    const stats = this.currentWeaponStats;

    // Can't fire while reloading
    if (weapon.isReloading) return;

    // Cooldown check
    if (weapon.fireCooldown > 0) return;

    // Ammo check
    if (weapon.currentAmmo <= 0) {
      EventBus.emit(GameEvents.AMMO_EMPTY, { type: weapon.type });
      this.startReload();
      return;
    }

    // Calculate aim angle from player position to cursor
    const angle = angleBetween(this.x, this.y, input.aimX, input.aimY);

    // Delegate projectile creation to the external handler
    let fired = true;
    if (this.onFire) {
      fired = this.onFire(stats, weapon, this.x, this.y, angle);
    }

    if (fired) {
      weapon.currentAmmo--;
      weapon.fireCooldown = stats.fireRate;

      this.playerState = PlayerState.SHOOTING;

      EventBus.emit(GameEvents.BULLET_FIRED, {
        type: weapon.type,
        x: this.x,
        y: this.y,
        angle,
      });

      this.emitAmmoChanged();
    }
  }

  // ==================================================================
  // Reloading
  // ==================================================================

  private handleReload(input: InputState): void {
    if (!input.reloading) return;
    this.startReload();
  }

  private startReload(): void {
    if (this.weapons.length === 0) return;

    const weapon = this.currentWeapon;
    const stats = this.currentWeaponStats;

    // Already reloading or clip is full
    if (weapon.isReloading) return;
    if (weapon.currentAmmo >= stats.clipSize) return;

    // No reserve ammo (and not unlimited)
    if (!stats.unlimitedReserve && weapon.reserveAmmo <= 0) return;

    weapon.isReloading = true;
    weapon.reloadTimer = stats.reloadTime;

    EventBus.emit(GameEvents.WEAPON_RELOADING, { type: weapon.type });
  }

  // ==================================================================
  // Weapon timers
  // ==================================================================

  private updateWeapons(delta: number): void {
    for (const weapon of this.weapons) {
      // Fire cooldown
      if (weapon.fireCooldown > 0) {
        weapon.fireCooldown = Math.max(0, weapon.fireCooldown - delta);
      }

      // Reload timer
      if (weapon.isReloading) {
        weapon.reloadTimer -= delta;
        if (weapon.reloadTimer <= 0) {
          this.completeReload(weapon);
        }
      }
    }
  }

  private completeReload(weapon: WeaponState): void {
    const stats = WEAPON_DATA[weapon.type];
    const needed = stats.clipSize - weapon.currentAmmo;

    if (stats.unlimitedReserve) {
      weapon.currentAmmo = stats.clipSize;
    } else {
      const toLoad = Math.min(needed, weapon.reserveAmmo);
      weapon.currentAmmo += toLoad;
      weapon.reserveAmmo -= toLoad;
    }

    weapon.isReloading = false;
    weapon.reloadTimer = 0;

    EventBus.emit(GameEvents.WEAPON_RELOADED, { type: weapon.type });
    this.emitAmmoChanged();
  }

  // ==================================================================
  // Weapon switching
  // ==================================================================

  private handleWeaponSwitch(input: InputState): void {
    if (input.weaponSlot < 1) return; // -1 means no switch pressed

    const desiredIndex = input.weaponSlot - 1; // convert 1-based to 0-based
    if (desiredIndex < this.weapons.length) {
      this.switchWeapon(desiredIndex);
    }
  }

  // ==================================================================
  // Invincibility visual
  // ==================================================================

  private updateInvincibility(time: number, delta: number): void {
    if (time < this.invincibleUntil) {
      // Rapid flicker effect (toggle visibility at 60 Hz-ish)
      this.invincibilityFlickerTimer += delta;
      if (this.invincibilityFlickerTimer >= 60) {
        this.invincibilityFlickerTimer = 0;
        this.setAlpha(this.alpha < 1 ? 1 : 0.3);
      }

      // Exit hurt state after a brief period, but keep invincibility
      if (
        this.playerState === PlayerState.HURT &&
        time >= this.invincibleUntil - PLAYER_INVINCIBILITY_MS + 200
      ) {
        this.playerState = PlayerState.IDLE;
      }
    } else if (this.alpha < 1) {
      // Invincibility just ended -- restore full visibility
      this.setAlpha(1);
    }
  }

  // ==================================================================
  // Regeneration
  // ==================================================================

  private updateRegen(time: number): void {
    if (!this.hasRegen) return;
    if (this.hp >= this.maxHp) return;

    if (time >= this.regenTimer) {
      this.heal(REGEN_AMOUNT);
      this.regenTimer = time + REGEN_INTERVAL_MS;
    }
  }

  // ==================================================================
  // Animation
  // ==================================================================

  private resolveAnimation(): void {
    // Only change animation when state actually changes to avoid
    // restarting the same animation every frame.
    if (this.playerState === this.prevState) return;
    this.prevState = this.playerState;

    switch (this.playerState) {
      case PlayerState.IDLE:
        this.playAnim(Anim.IDLE, true);
        break;
      case PlayerState.RUNNING:
        this.playAnim(Anim.RUN, true);
        break;
      case PlayerState.JUMPING:
        this.playAnim(Anim.JUMP, false);
        break;
      case PlayerState.SHOOTING:
        this.playAnim(Anim.SHOOT, false);
        break;
      case PlayerState.HURT:
        this.playAnim(Anim.HURT, false);
        break;
      case PlayerState.CLIMBING:
        this.playAnim(Anim.CLIMB, true);
        break;
      case PlayerState.DEAD:
        // handled in onDeath
        break;
    }
  }

  /**
   * Wrapper around Phaser's play() that safely checks whether the
   * animation key exists before attempting to play it. This prevents
   * console warnings when placeholder textures are in use during early
   * development.
   */
  private playAnim(key: string, loop: boolean): void {
    if (this.anims && this.scene.anims.exists(key)) {
      this.play({ key, repeat: loop ? -1 : 0 }, true);
    } else {
      // If the animation hasn't been registered yet, at least set the
      // texture so we have *some* visual.
      if (this.scene.textures.exists(key)) {
        this.setTexture(key);
      }
    }
  }

  // ==================================================================
  // Event helpers
  // ==================================================================

  private emitAmmoChanged(): void {
    const weapon = this.currentWeapon;
    EventBus.emit(GameEvents.AMMO_CHANGED, {
      type: weapon.type,
      currentAmmo: weapon.currentAmmo,
      reserveAmmo: weapon.reserveAmmo,
      clipSize: this.currentWeaponStats.clipSize,
    });
  }

  // ==================================================================
  // Upgrade application
  // ==================================================================

  /**
   * Apply an upgrade's effect to the player. Called by the shop system
   * after a purchase. The upgradeId is stored so we can serialise what
   * the player has bought.
   */
  public applyUpgrade(upgradeId: string, stat: string, value: number): void {
    this.purchasedUpgrades.add(upgradeId);

    switch (stat) {
      case 'maxHp':
        this.maxHp += value;
        this.hp = Math.min(this.hp + value, this.maxHp); // also heal the added amount
        break;
      case 'speed':
        this.moveSpeed *= 1 + value;
        break;
      case 'regen':
        this.hasRegen = true;
        break;
      default:
        // Weapon-specific upgrades are handled by the weapon system.
        break;
    }
  }

  // ==================================================================
  // Serialisation helpers (for save/load)
  // ==================================================================

  public getState() {
    return {
      hp: this.hp,
      maxHp: this.maxHp,
      currency: this.currency,
      isOnRoof: this.isOnRoof,
      weapons: this.weapons.map((w) => ({
        type: w.type,
        ammo: w.currentAmmo,
        reserve: w.reserveAmmo,
        level: w.level,
      })),
      upgrades: Array.from(this.purchasedUpgrades),
    };
  }

  public restoreState(data: {
    hp: number;
    maxHp: number;
    currency: number;
    isOnRoof: boolean;
    weapons: Array<{
      type: WeaponType;
      ammo: number;
      reserve: number;
      level: number;
    }>;
    upgrades: string[];
  }): void {
    this.hp = data.hp;
    this.maxHp = data.maxHp;
    this.currency = data.currency;
    this.isOnRoof = data.isOnRoof;
    this.zone = data.isOnRoof ? ZoneType.ROOFTOP : ZoneType.INTERIOR;

    this.weapons = data.weapons.map((w) => ({
      type: w.type,
      currentAmmo: w.ammo,
      reserveAmmo: w.reserve,
      isReloading: false,
      reloadTimer: 0,
      fireCooldown: 0,
      level: w.level,
    }));

    this.currentWeaponIndex = 0;
    this.purchasedUpgrades = new Set(data.upgrades);
  }
}
