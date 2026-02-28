import Phaser from 'phaser';
import { TimeOfDay } from '../types/GameTypes';
import { EventBus } from '../utils/EventBus';
import {
  DAY_PHASE_DURATION_MS,
  NIGHT_ZOMBIE_MULTIPLIER,
  NIGHT_AMBIENT_ALPHA,
} from '../data/BalanceConstants';

/**
 * Manages the day/night cycle with visual lighting changes.
 */
export class DayNightManager {
  private scene!: Phaser.Scene;
  public timeOfDay: TimeOfDay = TimeOfDay.DAY;
  private cycleTimer: number = 0;
  private overlay!: Phaser.GameObjects.Rectangle;

  // Colors for each phase
  private readonly phaseColors: Record<TimeOfDay, { color: number; alpha: number }> = {
    [TimeOfDay.DAWN]: { color: 0xffaa66, alpha: 0.08 },
    [TimeOfDay.DAY]: { color: 0xfffff0, alpha: 0.0 },
    [TimeOfDay.DUSK]: { color: 0xff6633, alpha: 0.12 },
    [TimeOfDay.NIGHT]: { color: 0x112244, alpha: NIGHT_AMBIENT_ALPHA },
  };

  private readonly phaseOrder: TimeOfDay[] = [
    TimeOfDay.DAWN,
    TimeOfDay.DAY,
    TimeOfDay.DUSK,
    TimeOfDay.NIGHT,
  ];

  public create(scene: Phaser.Scene): void {
    this.scene = scene;
    this.timeOfDay = TimeOfDay.DAY;
    this.cycleTimer = 0;

    // Create overlay that covers the whole camera view
    this.overlay = scene.add.rectangle(0, 0, 2000, 2000, 0x000000, 0);
    this.overlay.setDepth(50);
    this.overlay.setScrollFactor(0);
    this.overlay.setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  /** Update the day/night cycle. */
  public update(delta: number): void {
    this.cycleTimer += delta;

    if (this.cycleTimer >= DAY_PHASE_DURATION_MS) {
      this.cycleTimer = 0;
      this.advancePhase();
    }

    // Smooth transition between phases
    const t = this.cycleTimer / DAY_PHASE_DURATION_MS;
    const currentPhase = this.phaseColors[this.timeOfDay];
    const nextPhaseIdx = (this.phaseOrder.indexOf(this.timeOfDay) + 1) % this.phaseOrder.length;
    const nextPhase = this.phaseColors[this.phaseOrder[nextPhaseIdx]];

    // Lerp alpha
    const alpha = currentPhase.alpha + (nextPhase.alpha - currentPhase.alpha) * t;
    this.overlay.setFillStyle(currentPhase.color, alpha);

    // Update overlay position to follow camera
    const cam = this.scene.cameras.main;
    this.overlay.setPosition(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2);
    this.overlay.setDisplaySize(cam.width / cam.zoom + 200, cam.height / cam.zoom + 200);
  }

  private advancePhase(): void {
    const idx = this.phaseOrder.indexOf(this.timeOfDay);
    const nextIdx = (idx + 1) % this.phaseOrder.length;
    this.timeOfDay = this.phaseOrder[nextIdx];
    EventBus.emit('daynight:phase-changed', this.timeOfDay);
  }

  /** Is it nighttime? */
  public isNight(): boolean {
    return this.timeOfDay === TimeOfDay.NIGHT;
  }

  /** Get zombie spawn multiplier based on time. */
  public getZombieMultiplier(): number {
    switch (this.timeOfDay) {
      case TimeOfDay.NIGHT: return NIGHT_ZOMBIE_MULTIPLIER;
      case TimeOfDay.DUSK: return 1.3;
      case TimeOfDay.DAWN: return 1.1;
      default: return 1.0;
    }
  }

  /** Get current time of day as string. */
  public getTimeString(): string {
    const progress = this.cycleTimer / DAY_PHASE_DURATION_MS;
    return `${this.timeOfDay} (${Math.floor(progress * 100)}%)`;
  }

  /** Serialize for save. */
  public serialize(): { timeOfDay: TimeOfDay; dayTime: number } {
    return { timeOfDay: this.timeOfDay, dayTime: this.cycleTimer };
  }

  /** Load from save. */
  public deserialize(data: { timeOfDay: TimeOfDay; dayTime: number }): void {
    this.timeOfDay = data.timeOfDay;
    this.cycleTimer = data.dayTime;
  }
}
