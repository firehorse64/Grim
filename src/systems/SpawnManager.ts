import Phaser from 'phaser';
import { ZombieType, BossType } from '../types/ZombieTypes';
import { ZOMBIE_DATA, BOSS_DATA } from '../data/ZombieData';
import { GAME_WIDTH, GAME_HEIGHT, CAR_FLOOR_Y, CAR_ROOF_WALK_Y } from '../data/BalanceConstants';
import { Entity } from '../entities/Entity';
import { randomBetween, randomChoice } from '../utils/MathUtils';

/**
 * Pool configuration for a single zombie type.
 */
interface PoolConfig {
  key: string;
  maxSize: number;
}

/**
 * The SpawnManager maintains Phaser object-pool Groups for every zombie
 * type (including bosses) and is the single point of entry for spawning
 * zombie entities into the world. It keeps zombies recycled via
 * setActive(false)/setVisible(false) so the garbage collector stays quiet.
 */
export class SpawnManager {
  private scene!: Phaser.Scene;

  // ── Object pools (one per zombie type) ──────────────────────────────
  public walkerPool!: Phaser.Physics.Arcade.Group;
  public runnerPool!: Phaser.Physics.Arcade.Group;
  public tankPool!: Phaser.Physics.Arcade.Group;
  public crawlerPool!: Phaser.Physics.Arcade.Group;
  public spitterPool!: Phaser.Physics.Arcade.Group;
  public bossPool!: Phaser.Physics.Arcade.Group;

  /** Quick lookup from ZombieType / BossType string to its pool. */
  private poolMap!: Map<string, Phaser.Physics.Arcade.Group>;

  // ── Spawn-point helpers ─────────────────────────────────────────────
  /** Margin in pixels beyond the camera edge where zombies materialise. */
  private static readonly OFFSCREEN_MARGIN = 60;

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Initialise all object pools. Call once during the gameplay scene's
   * `create()` phase.
   */
  public create(scene: Phaser.Scene): void {
    this.scene = scene;

    // Build a pool for each regular zombie type.
    this.walkerPool = this.createPool(ZombieType.WALKER, 30);
    this.runnerPool = this.createPool(ZombieType.RUNNER, 20);
    this.tankPool = this.createPool(ZombieType.TANK, 10);
    this.crawlerPool = this.createPool(ZombieType.CRAWLER, 15);
    this.spitterPool = this.createPool(ZombieType.SPITTER, 12);
    this.bossPool = this.createPool('boss', 4);

    this.poolMap = new Map<string, Phaser.Physics.Arcade.Group>([
      [ZombieType.WALKER, this.walkerPool],
      [ZombieType.RUNNER, this.runnerPool],
      [ZombieType.TANK, this.tankPool],
      [ZombieType.CRAWLER, this.crawlerPool],
      [ZombieType.SPITTER, this.spitterPool],
      [BossType.BRUTE, this.bossPool],
      [BossType.HIVE, this.bossPool],
    ]);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Spawning
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Spawn a regular zombie of the given type. If `x` / `y` are omitted a
   * random off-screen position is chosen (left edge, right edge, or
   * rooftop drop-in).
   *
   * Returns the spawned sprite, or `null` if the pool is exhausted.
   */
  public spawnZombie(
    type: ZombieType,
    x?: number,
    y?: number,
  ): Phaser.Physics.Arcade.Sprite | null {
    const pool = this.poolMap.get(type);
    if (!pool) return null;

    const zombie = pool.get() as Phaser.Physics.Arcade.Sprite | null;
    if (!zombie) return null;

    // Determine spawn position if not explicitly provided.
    const pos = this.resolveSpawnPosition(x, y);

    // Activate & position
    zombie.setActive(true);
    zombie.setVisible(true);
    zombie.setPosition(pos.x, pos.y);

    // Re-enable physics body
    const body = zombie.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.enable = true;
      body.setVelocity(0, 0);
    }

    // Reset entity-level HP if the zombie extends Entity
    const stats = ZOMBIE_DATA[type];
    if (stats && typeof (zombie as Entity).hp !== 'undefined') {
      (zombie as Entity).hp = stats.hp;
      (zombie as Entity).maxHp = stats.hp;
    }

    // If the zombie has a custom `spawn()` method (e.g. to reset
    // animation / tints) call it now.
    if (typeof (zombie as any).spawn === 'function') {
      (zombie as any).spawn(pos.x, pos.y, type);
    }

    return zombie;
  }

  /**
   * Spawn a boss zombie. Bosses always appear from the right side of the
   * screen at ground level.
   */
  public spawnBoss(type: BossType): Phaser.Physics.Arcade.Sprite | null {
    const pool = this.bossPool;
    const zombie = pool.get() as Phaser.Physics.Arcade.Sprite | null;
    if (!zombie) return null;

    const camera = this.scene.cameras.main;
    const bossData = BOSS_DATA[type];

    // Position boss slightly off the right edge of the camera
    const bx = camera.scrollX + camera.width + SpawnManager.OFFSCREEN_MARGIN + 40;
    const by = CAR_FLOOR_Y - (bossData.height / 2);

    zombie.setActive(true);
    zombie.setVisible(true);
    zombie.setPosition(bx, by);

    const body = zombie.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.enable = true;
      body.setVelocity(0, 0);
    }

    // Reset boss HP
    if (typeof (zombie as Entity).hp !== 'undefined') {
      (zombie as Entity).hp = bossData.hp;
      (zombie as Entity).maxHp = bossData.hp;
    }

    if (typeof (zombie as any).spawn === 'function') {
      (zombie as any).spawn(bx, by, type);
    }

    return zombie;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Queries
  // ──────────────────────────────────────────────────────────────────────

  /** Returns the total number of active (alive) zombies across all pools. */
  public getActiveZombieCount(): number {
    let count = 0;
    this.poolMap.forEach((pool) => {
      count += pool.countActive(true);
    });
    // Avoid double-counting bosses (brute + hive reference same pool)
    // Only count bossPool once, and we added it twice via brute/hive keys.
    // Subtract the duplicate count.
    count -= this.bossPool.countActive(true);
    return count;
  }

  /**
   * Returns a flat array of every currently active (alive) zombie sprite.
   * Useful for collision checks and distance queries.
   */
  public getAllActiveZombies(): Phaser.Physics.Arcade.Sprite[] {
    const result: Phaser.Physics.Arcade.Sprite[] = [];
    const visited = new Set<Phaser.Physics.Arcade.Group>();

    this.poolMap.forEach((pool) => {
      if (visited.has(pool)) return;
      visited.add(pool);
      const children = pool.getChildren() as Phaser.Physics.Arcade.Sprite[];
      for (const child of children) {
        if (child.active) {
          result.push(child);
        }
      }
    });

    return result;
  }

  /**
   * Returns an array of all pool Groups (de-duplicated). Handy for
   * registering overlap / collider against every zombie type at once.
   */
  public getAllPools(): Phaser.Physics.Arcade.Group[] {
    return [
      this.walkerPool,
      this.runnerPool,
      this.tankPool,
      this.crawlerPool,
      this.spitterPool,
      this.bossPool,
    ];
  }

  // ──────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Create a physics group that acts as an object pool.
   * Phaser's built-in `maxSize` handles recycling for us.
   */
  private createPool(key: string, maxSize: number): Phaser.Physics.Arcade.Group {
    return this.scene.physics.add.group({
      classType: Phaser.Physics.Arcade.Sprite,
      maxSize,
      active: false,
      visible: false,
      key, // used as the default texture key for `group.get()`
      createCallback: (obj: Phaser.GameObjects.GameObject) => {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        sprite.setActive(false);
        sprite.setVisible(false);
        // Physics body created but disabled until explicitly spawned.
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        if (body) {
          body.enable = false;
        }
      },
    });
  }

  /**
   * If explicit coordinates are provided, use them. Otherwise pick a
   * random spawn strategy:
   *   1) Left edge of camera   (ground level)
   *   2) Right edge of camera  (ground level)
   *   3) Rooftop drop-in       (above rooftop, falls down)
   */
  private resolveSpawnPosition(
    x?: number,
    y?: number,
  ): { x: number; y: number } {
    if (x !== undefined && y !== undefined) {
      return { x, y };
    }

    const camera = this.scene.cameras.main;
    const margin = SpawnManager.OFFSCREEN_MARGIN;

    const strategies = ['left', 'right', 'rooftop'] as const;
    const strategy = randomChoice([...strategies]);

    switch (strategy) {
      case 'left': {
        return {
          x: camera.scrollX - margin,
          y: CAR_FLOOR_Y - randomBetween(20, 40),
        };
      }
      case 'right': {
        return {
          x: camera.scrollX + camera.width + margin,
          y: CAR_FLOOR_Y - randomBetween(20, 40),
        };
      }
      case 'rooftop': {
        // Drop in from above onto the roof of a train car
        return {
          x: randomBetween(camera.scrollX + 60, camera.scrollX + camera.width - 60),
          y: CAR_ROOF_WALK_Y - margin - randomBetween(20, 80),
        };
      }
    }
  }
}
