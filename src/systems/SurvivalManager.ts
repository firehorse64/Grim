import { SurvivalState } from '../types/GameTypes';
import { EventBus } from '../utils/EventBus';
import {
  HUNGER_MAX,
  ENERGY_MAX,
  HUNGER_DECAY_PER_SEC,
  ENERGY_DECAY_PER_SEC,
  LOW_STAT_THRESHOLD,
  CRITICAL_STAT_THRESHOLD,
  HEALTH_DRAIN_PER_SEC,
  SLEEP_RESTORE_AMOUNT,
  EAT_RESTORE_AMOUNT,
  PLAYER_MAX_HP,
} from '../data/BalanceConstants';

/**
 * Manages hunger, energy, and health decay for the player.
 * Emits events when stats cross warning thresholds.
 */
export class SurvivalManager {
  private state: SurvivalState;

  constructor(state: SurvivalState) {
    this.state = state;
  }

  /** Call each frame. delta is in ms. */
  public update(delta: number): void {
    const dt = delta / 1000; // convert to seconds

    // Decay hunger and energy
    this.state.hunger = Math.max(0, this.state.hunger - HUNGER_DECAY_PER_SEC * dt);
    this.state.energy = Math.max(0, this.state.energy - ENERGY_DECAY_PER_SEC * dt);

    // Health drain when critical
    if (this.state.hunger < CRITICAL_STAT_THRESHOLD || this.state.energy < CRITICAL_STAT_THRESHOLD) {
      this.state.health = Math.max(0, this.state.health - HEALTH_DRAIN_PER_SEC * dt);
    }

    // Emit warning events
    if (this.state.hunger < LOW_STAT_THRESHOLD && this.state.hunger > 0) {
      EventBus.emit('survival:hunger-low', this.state.hunger);
    }
    if (this.state.energy < LOW_STAT_THRESHOLD && this.state.energy > 0) {
      EventBus.emit('survival:energy-low', this.state.energy);
    }
    if (this.state.health <= 0) {
      EventBus.emit('survival:death');
    }
  }

  /** Eat food — restore hunger. */
  public eat(amount: number = EAT_RESTORE_AMOUNT): void {
    this.state.hunger = Math.min(HUNGER_MAX, this.state.hunger + amount);
    EventBus.emit('survival:ate', amount);
  }

  /** Sleep — restore energy. */
  public sleep(amount: number = SLEEP_RESTORE_AMOUNT): void {
    this.state.energy = Math.min(ENERGY_MAX, this.state.energy + amount);
    EventBus.emit('survival:slept', amount);
  }

  /** Heal — restore health. */
  public heal(amount: number): void {
    this.state.health = Math.min(PLAYER_MAX_HP, this.state.health + amount);
  }

  /** Get the current speed multiplier based on energy level. */
  public getSpeedMultiplier(): number {
    if (this.state.energy < LOW_STAT_THRESHOLD) {
      return 0.5; // sluggish when exhausted
    }
    return 1.0;
  }

  /** Is hunger critically low? */
  public isHungerCritical(): boolean {
    return this.state.hunger < CRITICAL_STAT_THRESHOLD;
  }

  /** Is energy critically low? */
  public isEnergyCritical(): boolean {
    return this.state.energy < CRITICAL_STAT_THRESHOLD;
  }

  public getState(): SurvivalState {
    return this.state;
  }
}
