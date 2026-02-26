import Phaser from 'phaser';
import { GameEvents, EnvironmentEvent } from '../types/EventTypes';
import { EventBus } from '../utils/EventBus';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  TUNNEL_DURATION_MS,
  BRIDGE_DURATION_MS,
  STATION_DURATION_MS,
} from '../data/BalanceConstants';
import { EVENT_DEFINITIONS, GameEventDef, getRandomEvent } from '../data/EventData';

// ─────────────────────────────────────────────────────────────────────────────
// EventManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages procedural environment events (tunnel, bridge, station) that occur
 * during waves. Each event has distinct visual and gameplay effects:
 *
 * - **Tunnel**: near-total darkness, spotlight around player, 1.5x zombie spawns
 * - **Bridge**: camera shake, wind particles, zombies can fall off edges
 * - **Station**: train stops scrolling, platform spawns on one side, heavy
 *   zombie spawns, chance to find a survivor NPC
 *
 * Events are triggered randomly based on each wave's `eventChance` and have a
 * fixed duration, after which they auto-end.
 */
export class EventManager {
  private scene!: Phaser.Scene;
  private parallaxManager: any;

  // ── Active event state ─────────────────────────────────────────────────
  private activeEvent: GameEventDef | null = null;
  private eventTimer: number = 0;
  private isEventActive: boolean = false;

  // ── Visual overlays ────────────────────────────────────────────────────
  private tunnelOverlay!: Phaser.GameObjects.Graphics;
  private tunnelSpotlightRadius: number = 90;

  private windEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  private stationPlatform: Phaser.GameObjects.Rectangle | null = null;
  private stationSide: 'left' | 'right' = 'left';

  // ── Pre-event state (for restoration) ──────────────────────────────────
  private originalScrollSpeed: number = 0;

  // ── Player reference for spotlight tracking ────────────────────────────
  private playerRef: Phaser.GameObjects.Sprite | null = null;

  // ── Cooldown to prevent back-to-back events ────────────────────────────
  private eventCooldown: number = 0;
  private static readonly EVENT_COOLDOWN_MS = 5000;

  // ── Bridge shake timer ─────────────────────────────────────────────────
  private bridgeShakeTimer: number = 0;
  private static readonly BRIDGE_SHAKE_INTERVAL = 2000;

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Initialise the event manager. Call once during scene create().
   */
  public create(scene: Phaser.Scene, parallaxManager?: any): void {
    this.scene = scene;
    this.parallaxManager = parallaxManager ?? null;

    // ── Tunnel darkness overlay ──────────────────────────────────────
    this.tunnelOverlay = scene.add.graphics();
    this.tunnelOverlay.setDepth(88);
    this.tunnelOverlay.setScrollFactor(0);
    this.tunnelOverlay.setVisible(false);

    // Listen for wave starts to potentially trigger events
    EventBus.on(GameEvents.WAVE_START, this.onWaveStart, this);
  }

  /**
   * Set a reference to the player sprite for tunnel spotlight tracking.
   */
  public setPlayerRef(player: Phaser.GameObjects.Sprite): void {
    this.playerRef = player;
  }

  /**
   * Per-frame update. Manages event timers and visual effects.
   */
  public update(_time: number, delta: number): void {
    // Tick cooldown
    if (this.eventCooldown > 0) {
      this.eventCooldown -= delta;
    }

    // If no active event, nothing to update
    if (!this.isEventActive || !this.activeEvent) return;

    // Advance event timer
    this.eventTimer += delta;

    // Check for event expiry
    if (this.eventTimer >= this.activeEvent.duration) {
      this.endEvent();
      return;
    }

    // Per-event-type updates
    switch (this.activeEvent.type) {
      case 'tunnel':
        this.updateTunnel();
        break;
      case 'bridge':
        this.updateBridge(delta);
        break;
      case 'station':
        this.updateStation();
        break;
    }
  }

  /**
   * Manually trigger an event. If a type is provided, that event is used;
   * otherwise a random event is selected.
   */
  public triggerEvent(type?: 'tunnel' | 'bridge' | 'station'): void {
    if (this.isEventActive) return; // One event at a time

    let eventDef: GameEventDef;
    if (type) {
      const found = EVENT_DEFINITIONS.find((e) => e.type === type);
      eventDef = found ?? getRandomEvent();
    } else {
      eventDef = getRandomEvent();
    }

    this.activeEvent = eventDef;
    this.eventTimer = 0;
    this.isEventActive = true;

    // Start event-specific setup
    switch (eventDef.type) {
      case 'tunnel':
        this.startTunnel();
        break;
      case 'bridge':
        this.startBridge();
        break;
      case 'station':
        this.startStation();
        break;
    }

    // Emit event
    const envEvent: EnvironmentEvent = {
      type: eventDef.type,
      duration: eventDef.duration,
      intensity: eventDef.spawnModifier,
    };
    EventBus.emit(GameEvents.EVENT_TRIGGERED, envEvent);
  }

  /**
   * Manually end the current event early.
   */
  public endEvent(): void {
    if (!this.isEventActive || !this.activeEvent) return;

    const eventType = this.activeEvent.type;

    // Clean up event-specific visuals
    switch (eventType) {
      case 'tunnel':
        this.endTunnel();
        break;
      case 'bridge':
        this.endBridge();
        break;
      case 'station':
        this.endStation();
        break;
    }

    const envEvent: EnvironmentEvent = {
      type: this.activeEvent.type,
      duration: this.activeEvent.duration,
      intensity: this.activeEvent.spawnModifier,
    };

    this.activeEvent = null;
    this.isEventActive = false;
    this.eventTimer = 0;
    this.eventCooldown = EventManager.EVENT_COOLDOWN_MS;

    EventBus.emit(GameEvents.EVENT_ENDED, envEvent);
  }

  /** Whether an event is currently active. */
  public isActive(): boolean {
    return this.isEventActive;
  }

  /** Get the current active event definition (or null). */
  public getActiveEvent(): GameEventDef | null {
    return this.activeEvent;
  }

  /** Get the spawn modifier of the active event (1.0 if none). */
  public getSpawnModifier(): number {
    return this.activeEvent?.spawnModifier ?? 1.0;
  }

  /** Clean up. */
  public destroy(): void {
    EventBus.off(GameEvents.WAVE_START, this.onWaveStart, this);
    this.cleanupAllVisuals();
    this.tunnelOverlay?.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Wave listener
  // ─────────────────────────────────────────────────────────────────────────

  private onWaveStart = (data: { wave: number; eventChance?: number }): void => {
    if (this.isEventActive) return;
    if (this.eventCooldown > 0) return;

    const chance = data.eventChance ?? 0;
    if (chance <= 0) return;

    if (Math.random() < chance) {
      // Delay trigger slightly so wave setup completes first
      this.scene.time.delayedCall(1500, () => {
        if (!this.isEventActive) {
          this.triggerEvent();
        }
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Tunnel
  // ─────────────────────────────────────────────────────────────────────────

  private startTunnel(): void {
    this.tunnelOverlay.setVisible(true);
    EventBus.emit(GameEvents.TUNNEL_ENTER, {});
  }

  private updateTunnel(): void {
    this.tunnelOverlay.clear();

    // Draw near-black overlay with a circular transparent area around the player
    const visibility = this.activeEvent?.visibility ?? 0.15;
    const darkness = 1 - visibility; // ~0.85

    // Get player screen position
    let spotX = GAME_WIDTH / 2;
    let spotY = GAME_HEIGHT / 2;

    if (this.playerRef && this.playerRef.active) {
      const camera = this.scene.cameras.main;
      spotX = this.playerRef.x - camera.scrollX;
      spotY = this.playerRef.y - camera.scrollY;
    }

    // Draw the dark overlay using a mask approach:
    // Fill entire screen with dark, then punch a spotlight hole

    // Outer dark fill
    this.tunnelOverlay.fillStyle(0x000000, darkness);
    this.tunnelOverlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Draw spotlight with concentric rings (soft falloff)
    const spotRadius = this.tunnelSpotlightRadius;
    const ringCount = 12;
    for (let i = ringCount; i >= 0; i--) {
      const t = i / ringCount;
      const radius = spotRadius * (0.4 + 0.6 * t);
      // Reduce darkness in the centre by drawing a less-opaque black
      const ringAlpha = darkness * t * t;
      this.tunnelOverlay.fillStyle(0x000000, ringAlpha);
      this.tunnelOverlay.fillCircle(spotX, spotY, radius);
    }

    // Small bright core (slight warm tint to simulate muzzle flash ambient)
    this.tunnelOverlay.fillStyle(0x221100, 0.1);
    this.tunnelOverlay.fillCircle(spotX, spotY, spotRadius * 0.3);
  }

  private endTunnel(): void {
    this.tunnelOverlay.clear();
    this.tunnelOverlay.setVisible(false);
    EventBus.emit(GameEvents.TUNNEL_EXIT, {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bridge
  // ─────────────────────────────────────────────────────────────────────────

  private startBridge(): void {
    this.bridgeShakeTimer = 0;

    // Start wind particles blowing sideways
    if (this.scene.textures.exists('smoke')) {
      const particles = this.scene.add.particles(0, 0, 'smoke', {
        x: GAME_WIDTH + 20,
        y: { min: 0, max: GAME_HEIGHT },
        lifespan: 1500,
        speedX: { min: -350, max: -500 },
        speedY: { min: -20, max: 20 },
        scaleX: { min: 0.2, max: 0.5 },
        scaleY: { min: 0.1, max: 0.3 },
        alpha: { start: 0.3, end: 0 },
        quantity: 3,
        frequency: 80,
        tint: 0xcccccc,
      });
      particles.setDepth(75);
      particles.setScrollFactor(0);
      this.windEmitter = particles;
    }
  }

  private updateBridge(delta: number): void {
    // Periodic gentle camera shake
    this.bridgeShakeTimer += delta;
    if (this.bridgeShakeTimer >= EventManager.BRIDGE_SHAKE_INTERVAL) {
      this.bridgeShakeTimer = 0;
      this.scene.cameras.main.shake(400, 0.003);
    }
  }

  private endBridge(): void {
    if (this.windEmitter) {
      this.windEmitter.stop();
      // Destroy after remaining particles fade
      this.scene.time.delayedCall(2000, () => {
        if (this.windEmitter) {
          this.windEmitter.destroy();
          this.windEmitter = null;
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Station
  // ─────────────────────────────────────────────────────────────────────────

  private startStation(): void {
    // Tell ParallaxManager to slow to 0
    if (this.parallaxManager) {
      this.originalScrollSpeed = this.parallaxManager.scrollSpeed ?? 0;
      if (typeof this.parallaxManager.setScrollSpeed === 'function') {
        this.parallaxManager.setScrollSpeed(0);
      }
    }

    // Decide which side the platform appears on
    this.stationSide = Math.random() < 0.5 ? 'left' : 'right';

    // Create platform visual
    const platformX = this.stationSide === 'left' ? -60 : GAME_WIDTH + 60;
    const platformWidth = 200;
    const platformHeight = 16;
    const platformY = 460; // near floor level

    this.stationPlatform = this.scene.add.rectangle(
      platformX, platformY,
      platformWidth, platformHeight,
      0x555555, 1,
    );
    this.stationPlatform.setDepth(5);
    this.stationPlatform.setStrokeStyle(2, 0x888888);

    // Slide platform into view
    const targetX = this.stationSide === 'left' ? 100 : GAME_WIDTH - 100;
    this.scene.tweens.add({
      targets: this.stationPlatform,
      x: targetX,
      duration: 2000,
      ease: 'Power2',
    });

    EventBus.emit(GameEvents.STATION_ARRIVE, {
      side: this.stationSide,
    });
  }

  private updateStation(): void {
    // Station effects are handled by other systems responding to
    // STATION_ARRIVE. The platform just sits there.
  }

  private endStation(): void {
    // Restore scroll speed
    if (this.parallaxManager && typeof this.parallaxManager.setScrollSpeed === 'function') {
      this.parallaxManager.setScrollSpeed(this.originalScrollSpeed);
    }

    // Slide platform out and destroy
    if (this.stationPlatform) {
      const exitX = this.stationSide === 'left' ? -200 : GAME_WIDTH + 200;
      this.scene.tweens.add({
        targets: this.stationPlatform,
        x: exitX,
        duration: 1500,
        ease: 'Power2',
        onComplete: () => {
          this.stationPlatform?.destroy();
          this.stationPlatform = null;
        },
      });
    }

    EventBus.emit(GameEvents.STATION_DEPART, {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  private cleanupAllVisuals(): void {
    this.tunnelOverlay?.clear();
    this.tunnelOverlay?.setVisible(false);

    if (this.windEmitter) {
      this.windEmitter.destroy();
      this.windEmitter = null;
    }

    if (this.stationPlatform) {
      this.stationPlatform.destroy();
      this.stationPlatform = null;
    }
  }
}
