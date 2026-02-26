import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';
import { Entity } from '../entities/Entity';
import { Bullet } from '../entities/projectiles/Bullet';
import { Pellet } from '../entities/projectiles/Pellet';
import { Barricade } from '../entities/Barricade';
import { SpawnManager } from './SpawnManager';
import { KNOCKBACK_FORCE, BARRICADE_ELECTRIC_DAMAGE } from '../data/BalanceConstants';
import { distance } from '../utils/MathUtils';

/**
 * CollisionManager wires up every Phaser Arcade Physics overlap and
 * collider needed by the gameplay scene. It owns the callbacks that
 * execute when projectiles hit zombies, zombies reach the player, acid
 * blobs land, etc.
 *
 * All callbacks are arrow-function class properties so `this` is bound
 * correctly without needing `.bind()`.
 */
export class CollisionManager {
  private scene!: Phaser.Scene;
  private player!: Phaser.Physics.Arcade.Sprite;
  private spawnManager!: SpawnManager;

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Register all overlap and collider handlers. Call once after every
   * relevant group has been created.
   *
   * @param scene          The active gameplay scene.
   * @param player         The player sprite (extends Entity).
   * @param spawnManager   SpawnManager that owns the zombie pools.
   * @param bulletGroups   An object containing the bullet and pellet pool
   *                       Groups used by the player's weapons.
   * @param barricadeGroup A Phaser Group (or Physics.Arcade.Group)
   *                       holding all placed Barricade sprites.
   * @param acidGroup      Optional group for Spitter acid blobs. May be
   *                       undefined if not yet implemented.
   * @param trainColliders Optional static groups for floor / roof.
   * @param pickupGroup    Optional group for pickup items.
   */
  public setup(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    spawnManager: SpawnManager,
    bulletGroups: {
      bullets: Phaser.Physics.Arcade.Group;
      pellets: Phaser.Physics.Arcade.Group;
    },
    barricadeGroup: Phaser.Physics.Arcade.Group,
    acidGroup?: Phaser.Physics.Arcade.Group,
    trainColliders?: {
      floor: Phaser.Physics.Arcade.StaticGroup;
      roof: Phaser.Physics.Arcade.StaticGroup;
    },
    pickupGroup?: Phaser.Physics.Arcade.Group,
  ): void {
    this.scene = scene;
    this.player = player;
    this.spawnManager = spawnManager;

    const zombiePools = spawnManager.getAllPools();

    // ── 1. Player bullets / pellets vs zombies ────────────────────────
    for (const pool of zombiePools) {
      scene.physics.add.overlap(
        bulletGroups.bullets,
        pool,
        this.onBulletHitZombie as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this,
      );

      scene.physics.add.overlap(
        bulletGroups.pellets,
        pool,
        this.onPelletHitZombie as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this,
      );
    }

    // ── 2. Zombies vs player ──────────────────────────────────────────
    for (const pool of zombiePools) {
      scene.physics.add.overlap(
        player,
        pool,
        this.onZombieHitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this,
      );
    }

    // ── 3. Zombies vs barricades ──────────────────────────────────────
    for (const pool of zombiePools) {
      scene.physics.add.collider(
        pool,
        barricadeGroup,
        this.onZombieHitBarricade as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this,
      );
    }

    // ── 4. Acid blobs vs player ───────────────────────────────────────
    if (acidGroup) {
      scene.physics.add.overlap(
        acidGroup,
        player,
        this.onAcidHitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this,
      );
    }

    // ── 5. Player vs train floor / roof colliders ─────────────────────
    if (trainColliders) {
      scene.physics.add.collider(player, trainColliders.floor);
      scene.physics.add.collider(player, trainColliders.roof);

      // Zombies should also collide with the train surfaces.
      for (const pool of zombiePools) {
        scene.physics.add.collider(pool, trainColliders.floor);
        scene.physics.add.collider(pool, trainColliders.roof);
      }
    }

    // ── 6. Player vs pickup items ─────────────────────────────────────
    if (pickupGroup) {
      scene.physics.add.overlap(
        player,
        pickupGroup,
        this.onPlayerPickup as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this,
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Grenade explosion (area-of-effect, no physics overlap)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Process a grenade explosion at the given world position. Instead of
   * using a physics overlap (which would require a transient body), we
   * iterate over all active zombies and distance-check against the blast
   * radius.
   */
  public processGrenadeExplosion(
    worldX: number,
    worldY: number,
    explosionDamage: number,
    explosionRadius: number,
    knockback: number,
  ): void {
    const activeZombies = this.spawnManager.getAllActiveZombies();

    for (const zombie of activeZombies) {
      const dist = distance(worldX, worldY, zombie.x, zombie.y);
      if (dist > explosionRadius) continue;

      // Damage falls off linearly from centre to edge.
      const falloff = 1 - dist / explosionRadius;
      const finalDamage = Math.round(explosionDamage * falloff);

      if (typeof (zombie as Entity).takeDamage === 'function') {
        (zombie as Entity).takeDamage(finalDamage);
      }

      // Apply radial knockback.
      const body = zombie.body as Phaser.Physics.Arcade.Body;
      if (body) {
        const angle = Phaser.Math.Angle.Between(worldX, worldY, zombie.x, zombie.y);
        const kbForce = knockback * falloff;
        body.setVelocity(
          body.velocity.x + Math.cos(angle) * kbForce,
          body.velocity.y + Math.sin(angle) * kbForce,
        );
      }
    }

    EventBus.emit(GameEvents.GRENADE_EXPLODED, {
      x: worldX,
      y: worldY,
      radius: explosionRadius,
    });

    // Screen shake for feedback.
    EventBus.emit(GameEvents.SCREEN_SHAKE, { intensity: 0.01, duration: 200 });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Collision callbacks
  // ──────────────────────────────────────────────────────────────────────

  /**
   * A Bullet (single-projectile) hit a zombie.
   */
  private onBulletHitZombie = (
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    zombieObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void => {
    const bullet = bulletObj as Bullet;
    const zombie = zombieObj as Phaser.Physics.Arcade.Sprite;

    if (!bullet.active || !zombie.active) return;

    // Deal damage
    const dmg = bullet.damage;
    if (typeof (zombie as Entity).takeDamage === 'function') {
      (zombie as Entity).takeDamage(dmg);
    }

    // Knockback
    if (bullet.knockback > 0) {
      this.applyKnockback(zombie, bullet.x, bullet.knockback);
    }

    // Deactivate the bullet (unless piercing)
    bullet.onHit();

    // Spawn blood particles
    this.spawnBloodParticles(zombie.x, zombie.y);

    // Play hit sound
    this.playHitSound();

    // Emit damage event
    EventBus.emit(GameEvents.ZOMBIE_DAMAGED, {
      zombie,
      damage: dmg,
      x: zombie.x,
      y: zombie.y,
    });
  };

  /**
   * A Pellet (shotgun sub-projectile) hit a zombie.
   */
  private onPelletHitZombie = (
    pelletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    zombieObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void => {
    const pellet = pelletObj as Pellet;
    const zombie = zombieObj as Phaser.Physics.Arcade.Sprite;

    if (!pellet.active || !zombie.active) return;

    const dmg = pellet.damage;
    if (typeof (zombie as Entity).takeDamage === 'function') {
      (zombie as Entity).takeDamage(dmg);
    }

    if (pellet.knockback > 0) {
      this.applyKnockback(zombie, pellet.x, pellet.knockback);
    }

    pellet.onHit();
    this.spawnBloodParticles(zombie.x, zombie.y);
    this.playHitSound();

    EventBus.emit(GameEvents.ZOMBIE_DAMAGED, {
      zombie,
      damage: dmg,
      x: zombie.x,
      y: zombie.y,
    });
  };

  /**
   * A zombie overlapped the player. The zombie entity is responsible
   * for its own attack cooldown, so we just forward the collision.
   */
  private onZombieHitPlayer = (
    playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    zombieObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void => {
    const zombie = zombieObj as Phaser.Physics.Arcade.Sprite;
    if (!zombie.active) return;

    // Delegate to the zombie's own attack method which respects cooldown.
    if (typeof (zombie as any).attackTarget === 'function') {
      (zombie as any).attackTarget(this.player);
    }
  };

  /**
   * A zombie collided with a barricade.
   */
  private onZombieHitBarricade = (
    zombieObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    barricadeObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void => {
    const zombie = zombieObj as Phaser.Physics.Arcade.Sprite;
    const barricade = barricadeObj as Barricade;

    if (!zombie.active || !barricade.active) return;

    // Zombie attacks the barricade (delegates to zombie's own cooldown).
    if (typeof (zombie as any).attackTarget === 'function') {
      (zombie as any).attackTarget(barricade);
    }

    // Electric barricades deal damage back to the zombie on contact.
    if (barricade.barricadeType === 'electric') {
      if (typeof (zombie as Entity).takeDamage === 'function') {
        (zombie as Entity).takeDamage(BARRICADE_ELECTRIC_DAMAGE);
      }
    }
  };

  /**
   * An acid blob (Spitter projectile) hit the player.
   */
  private onAcidHitPlayer = (
    acidObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void => {
    const acid = acidObj as Phaser.Physics.Arcade.Sprite;
    if (!acid.active) return;

    // Read damage from the acid blob if available, otherwise default.
    const dmg = (acid as any).damage ?? 18;

    if (typeof (this.player as Entity).takeDamage === 'function') {
      (this.player as Entity).takeDamage(dmg);
    }

    EventBus.emit(GameEvents.PLAYER_DAMAGED, {
      amount: dmg,
      source: 'acid',
      x: acid.x,
      y: acid.y,
    });

    // Deactivate the acid blob.
    acid.setActive(false);
    acid.setVisible(false);
    const acidBody = acid.body as Phaser.Physics.Arcade.Body;
    if (acidBody) {
      acidBody.enable = false;
    }

    // Create a lingering acid pool effect at impact location.
    this.createAcidPoolEffect(acid.x, acid.y);
  };

  /**
   * The player overlapped a pickup item.
   */
  private onPlayerPickup = (
    playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    pickupObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void => {
    const pickup = pickupObj as Phaser.Physics.Arcade.Sprite;
    if (!pickup.active) return;

    // If the pickup has a collect method, invoke it.
    if (typeof (pickup as any).collect === 'function') {
      (pickup as any).collect(this.player);
    } else {
      // Fallback: just deactivate.
      pickup.setActive(false);
      pickup.setVisible(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Push a zombie away from the bullet impact point horizontally.
   */
  private applyKnockback(
    zombie: Phaser.Physics.Arcade.Sprite,
    sourceX: number,
    force: number,
  ): void {
    const body = zombie.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    const dir = zombie.x > sourceX ? 1 : -1;
    body.setVelocityX(body.velocity.x + dir * force);
  }

  /**
   * Emit a short-lived blood particle burst at the given world position.
   * Uses a simple Phaser particle emitter that auto-stops.
   */
  private spawnBloodParticles(x: number, y: number): void {
    // Only create particles if the scene has the blood texture loaded.
    if (!this.scene.textures.exists('blood-particle')) return;

    const particles = this.scene.add.particles(x, y, 'blood-particle', {
      speed: { min: 30, max: 100 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      lifespan: 300,
      quantity: 4,
      tint: 0x880000,
      emitting: false,
    });

    particles.explode(4, x, y);

    // Destroy the emitter after particles have expired.
    this.scene.time.delayedCall(400, () => {
      particles.destroy();
    });
  }

  /**
   * Play a short hit / impact sound effect.
   */
  private playHitSound(): void {
    if (this.scene.sound.get('hit-flesh')) {
      this.scene.sound.play('hit-flesh', { volume: 0.3 });
    }
  }

  /**
   * Create a temporary acid-pool tinted rectangle on the ground that
   * fades out. This is purely visual feedback.
   */
  private createAcidPoolEffect(x: number, y: number): void {
    const pool = this.scene.add.rectangle(x, y + 10, 28, 8, 0x66ff22, 0.6);
    pool.setDepth(-1);

    this.scene.tweens.add({
      targets: pool,
      alpha: 0,
      scaleX: 1.4,
      duration: 2500,
      onComplete: () => pool.destroy(),
    });
  }
}
