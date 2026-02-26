import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';
import { ZombieType, BossType } from '../types/ZombieTypes';
import { getWaveDefinition, WaveDefinition, WaveSpawn } from '../data/WaveData';
import {
  WAVE_COUNTDOWN_MS,
  WAVE_BONUS_CURRENCY,
} from '../data/BalanceConstants';
import { SpawnManager } from './SpawnManager';

// ─── Wave state machine ────────────────────────────────────────────────
enum WaveState {
  /** Breathing room between waves; countdown timer ticking. */
  COUNTDOWN = 'COUNTDOWN',
  /** Zombies are actively being spawned and fought. */
  ACTIVE = 'ACTIVE',
  /** Every zombie for the current wave has been killed. */
  COMPLETE = 'COMPLETE',
}

/**
 * WaveManager orchestrates wave progression for the survival game loop.
 *
 * Lifecycle per wave:
 *   COUNTDOWN  ->  ACTIVE  ->  COMPLETE  ->  COUNTDOWN (next wave) ...
 *
 * During COUNTDOWN the manager emits `WAVE_COUNTDOWN` with the remaining
 * seconds so the UI can display a timer. When the countdown reaches zero
 * it transitions to ACTIVE, emits `WAVE_START`, and begins spawning
 * zombies through the SpawnManager at the wave's configured interval.
 *
 * The wave ends (COMPLETE) once every zombie from the wave composition
 * has been spawned *and* killed. A currency bonus is awarded and the
 * cycle repeats for the next wave.
 */
export class WaveManager {
  private scene!: Phaser.Scene;
  private spawnManager!: SpawnManager;

  // ── State ────────────────────────────────────────────────────────────
  private state: WaveState = WaveState.COUNTDOWN;
  private currentWave: number = 0;
  private waveDefinition!: WaveDefinition;

  // ── Countdown ────────────────────────────────────────────────────────
  private countdownTimer: number = 0;
  /** Tracks the last whole-second value emitted so we only emit once per second. */
  private lastEmittedSecond: number = -1;

  // ── Spawning bookkeeping ─────────────────────────────────────────────
  /** Flat queue of zombie types still to be spawned this wave. */
  private spawnQueue: (ZombieType | BossType)[] = [];
  /** Total zombies that must die to end the wave (regular + boss). */
  private totalZombiesInWave: number = 0;
  /** How many have been killed so far. */
  private zombiesKilled: number = 0;
  /** How many have been spawned so far. */
  private zombiesSpawned: number = 0;
  /** Accumulator for spawn interval timing. */
  private spawnAccumulator: number = 0;
  /** Current wave's spawn interval (ms). */
  private spawnInterval: number = 1800;
  /** Whether this wave includes a boss. */
  private hasBoss: boolean = false;
  /** Boss type for the current wave, if any. */
  private bossType: BossType | undefined;
  /** Whether the boss has already been spawned. */
  private bossSpawned: boolean = false;

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Initialise the manager. Call once during the gameplay scene's
   * `create()`.
   */
  public create(scene: Phaser.Scene, spawnManager: SpawnManager): void {
    this.scene = scene;
    this.spawnManager = spawnManager;

    // Listen for zombie deaths so we can track kills.
    EventBus.on(GameEvents.ZOMBIE_KILLED, this.onZombieKilled, this);
    EventBus.on(GameEvents.BOSS_DEFEATED, this.onBossDefeated, this);

    // Start with a countdown into wave 1.
    this.state = WaveState.COUNTDOWN;
    this.currentWave = 0;
    this.countdownTimer = WAVE_COUNTDOWN_MS;
    this.lastEmittedSecond = -1;
  }

  /**
   * Per-frame tick. Drive the state machine forward.
   */
  public update(_time: number, delta: number): void {
    switch (this.state) {
      case WaveState.COUNTDOWN:
        this.updateCountdown(delta);
        break;
      case WaveState.ACTIVE:
        this.updateActive(delta);
        break;
      case WaveState.COMPLETE:
        // COMPLETE is a transient state; transition happens immediately
        // in completeWave(). Nothing to do here per-frame.
        break;
    }
  }

  /**
   * Manually begin the next wave. Typically called when exiting the shop
   * scene so the player can control when the action resumes.
   */
  public startNextWave(): void {
    this.beginWave(this.currentWave + 1);
  }

  // ── Getters ──────────────────────────────────────────────────────────

  /** The 1-based wave number currently in progress (or the last completed one). */
  public getCurrentWave(): number {
    return this.currentWave;
  }

  /** Zombies remaining = total - killed. */
  public getZombiesRemaining(): number {
    return Math.max(0, this.totalZombiesInWave - this.zombiesKilled);
  }

  /** True while we are in the ACTIVE state (spawning / fighting). */
  public isWaveActive(): boolean {
    return this.state === WaveState.ACTIVE;
  }

  /** Expose the raw state for UI / debug. */
  public getState(): WaveState {
    return this.state;
  }

  /** Clean up event listeners. Call on scene shutdown. */
  public destroy(): void {
    EventBus.off(GameEvents.ZOMBIE_KILLED, this.onZombieKilled, this);
    EventBus.off(GameEvents.BOSS_DEFEATED, this.onBossDefeated, this);
  }

  // ──────────────────────────────────────────────────────────────────────
  // State handlers
  // ──────────────────────────────────────────────────────────────────────

  private updateCountdown(delta: number): void {
    this.countdownTimer -= delta;

    // Emit WAVE_COUNTDOWN once per whole second remaining.
    const secondsLeft = Math.max(0, Math.ceil(this.countdownTimer / 1000));
    if (secondsLeft !== this.lastEmittedSecond) {
      this.lastEmittedSecond = secondsLeft;
      EventBus.emit(GameEvents.WAVE_COUNTDOWN, { seconds: secondsLeft });
    }

    if (this.countdownTimer <= 0) {
      this.beginWave(this.currentWave + 1);
    }
  }

  private updateActive(delta: number): void {
    // ── Spawn tick ────────────────────────────────────────────────────
    if (this.spawnQueue.length > 0) {
      this.spawnAccumulator += delta;

      while (this.spawnAccumulator >= this.spawnInterval && this.spawnQueue.length > 0) {
        this.spawnAccumulator -= this.spawnInterval;
        const nextType = this.spawnQueue.shift()!;
        this.doSpawn(nextType);
      }
    } else if (!this.bossSpawned && this.hasBoss && this.bossType) {
      // All regular zombies spawned -- now send in the boss.
      EventBus.emit(GameEvents.BOSS_INCOMING, {
        wave: this.currentWave,
        bossType: this.bossType,
      });
      this.spawnManager.spawnBoss(this.bossType);
      this.bossSpawned = true;
      this.zombiesSpawned++;
    }

    // ── Wave completion check ────────────────────────────────────────
    if (
      this.zombiesSpawned >= this.totalZombiesInWave &&
      this.zombiesKilled >= this.totalZombiesInWave
    ) {
      this.completeWave();
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Wave lifecycle
  // ──────────────────────────────────────────────────────────────────────

  private beginWave(waveNumber: number): void {
    this.currentWave = waveNumber;
    this.waveDefinition = getWaveDefinition(waveNumber);
    this.spawnInterval = this.waveDefinition.spawnInterval;

    // Build the flat spawn queue from the composition array.
    this.spawnQueue = [];
    for (const entry of this.waveDefinition.composition) {
      for (let i = 0; i < entry.count; i++) {
        this.spawnQueue.push(entry.type);
      }
    }
    // Shuffle the queue so different types are interleaved.
    Phaser.Utils.Array.Shuffle(this.spawnQueue);

    // Determine total count (regular + optional boss).
    const regularCount = this.spawnQueue.length;
    this.hasBoss = !!this.waveDefinition.boss;
    this.bossType = this.waveDefinition.boss;
    this.bossSpawned = false;
    this.totalZombiesInWave = regularCount + (this.hasBoss ? 1 : 0);
    this.zombiesKilled = 0;
    this.zombiesSpawned = 0;
    this.spawnAccumulator = 0;

    this.state = WaveState.ACTIVE;

    EventBus.emit(GameEvents.WAVE_START, {
      wave: waveNumber,
      totalZombies: this.totalZombiesInWave,
      hasBoss: this.hasBoss,
    });
  }

  private completeWave(): void {
    this.state = WaveState.COMPLETE;

    EventBus.emit(GameEvents.WAVE_COMPLETE, {
      wave: this.currentWave,
    });

    // Award bonus currency.
    EventBus.emit(GameEvents.CURRENCY_CHANGED, {
      amount: WAVE_BONUS_CURRENCY,
      reason: 'wave_bonus',
      wave: this.currentWave,
    });

    // Transition to countdown for the next wave.
    this.state = WaveState.COUNTDOWN;
    this.countdownTimer = WAVE_COUNTDOWN_MS;
    this.lastEmittedSecond = -1;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Spawn helper
  // ──────────────────────────────────────────────────────────────────────

  private doSpawn(type: ZombieType | BossType): void {
    // Regular zombie types are in ZombieType enum values.
    const zombieTypeValues: string[] = Object.values(ZombieType);
    if (zombieTypeValues.includes(type as string)) {
      this.spawnManager.spawnZombie(type as ZombieType);
    } else {
      // Boss type (should normally not appear in the regular queue, but
      // handle gracefully).
      this.spawnManager.spawnBoss(type as BossType);
    }
    this.zombiesSpawned++;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Event handlers
  // ──────────────────────────────────────────────────────────────────────

  private onZombieKilled = (): void => {
    if (this.state === WaveState.ACTIVE) {
      this.zombiesKilled++;
    }
  };

  private onBossDefeated = (): void => {
    if (this.state === WaveState.ACTIVE) {
      this.zombiesKilled++;
    }
  };
}
