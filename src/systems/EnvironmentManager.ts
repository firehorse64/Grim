import Phaser from 'phaser';
import { TimeOfDay, Weather } from '../types/GameTypes';
import { GameEvents } from '../types/EventTypes';
import { EventBus } from '../utils/EventBus';
import { GAME_WIDTH, GAME_HEIGHT, WAVES_PER_DAY_CYCLE } from '../data/BalanceConstants';
import { lerp, clamp } from '../utils/MathUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Tint palettes per time-of-day for parallax layers (back → front)
// ─────────────────────────────────────────────────────────────────────────────
interface TimeTint {
  sky: number;
  far: number;
  mid: number;
  near: number;
  ambient: number; // overall multiplicative tint for the game world
}

const TIME_TINTS: Record<TimeOfDay, TimeTint> = {
  [TimeOfDay.DAWN]: {
    sky: 0xffa366,   // warm orange sky
    far: 0xdd8855,
    mid: 0xcc9966,
    near: 0xddaa77,
    ambient: 0xffcc99,
  },
  [TimeOfDay.DAY]: {
    sky: 0x88bbee,   // bright daylight
    far: 0xaaccdd,
    mid: 0xccddee,
    near: 0xeeeeff,
    ambient: 0xffffff,
  },
  [TimeOfDay.DUSK]: {
    sky: 0x8855aa,   // purple dusk
    far: 0x774488,
    mid: 0x886699,
    near: 0x997799,
    ambient: 0xbb88cc,
  },
  [TimeOfDay.NIGHT]: {
    sky: 0x112244,   // deep blue night
    far: 0x0a1833,
    mid: 0x152040,
    near: 0x1a2a50,
    ambient: 0x4466aa,
  },
};

// Phase boundaries within a day cycle (fraction of WAVES_PER_DAY_CYCLE)
const PHASE_RANGES: { phase: TimeOfDay; start: number; end: number }[] = [
  { phase: TimeOfDay.DAWN, start: 0.0, end: 0.15 },
  { phase: TimeOfDay.DAY, start: 0.15, end: 0.50 },
  { phase: TimeOfDay.DUSK, start: 0.50, end: 0.65 },
  { phase: TimeOfDay.NIGHT, start: 0.65, end: 1.0 },
];

// Night zombie spawn rate multiplier
const NIGHT_SPAWN_MULTIPLIER = 1.25;

// Weather configuration
interface WeatherConfig {
  minDuration: number;  // ms
  maxDuration: number;
  weight: number;
}

const WEATHER_CONFIGS: Record<Weather, WeatherConfig> = {
  [Weather.CLEAR]: { minDuration: 20000, maxDuration: 60000, weight: 5 },
  [Weather.RAIN]: { minDuration: 15000, maxDuration: 40000, weight: 2 },
  [Weather.FOG]: { minDuration: 12000, maxDuration: 30000, weight: 1.5 },
  [Weather.STORM]: { minDuration: 10000, maxDuration: 25000, weight: 1 },
};

// ─────────────────────────────────────────────────────────────────────────────
// EnvironmentManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages the day/night cycle and weather system. Tints parallax layers based
 * on the current time of day, applies a dark vignette during night, and
 * randomly triggers weather effects (rain, fog, storm) with particle and
 * overlay visuals.
 */
export class EnvironmentManager {
  private scene!: Phaser.Scene;
  private parallaxManager: any; // ParallaxManager reference

  // ── Day/night state ────────────────────────────────────────────────────
  private currentWave: number = 0;
  private currentPhase: TimeOfDay = TimeOfDay.DAY;
  private cycleProgress: number = 0; // 0-1 within current day cycle

  // ── Night vignette overlay ─────────────────────────────────────────────
  private vignetteOverlay!: Phaser.GameObjects.Graphics;
  private vignetteAlpha: number = 0;

  // ── Weather state ──────────────────────────────────────────────────────
  private currentWeather: Weather = Weather.CLEAR;
  private weatherTimer: number = 0;
  private weatherDuration: number = 0;

  // ── Weather overlays & effects ─────────────────────────────────────────
  private fogOverlay!: Phaser.GameObjects.Rectangle;
  private rainEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private lightningTimer: number = 0;
  private lightningCooldown: number = 0;
  private flashOverlay!: Phaser.GameObjects.Rectangle;

  // ── Interpolation targets ──────────────────────────────────────────────
  private targetTint: TimeTint = TIME_TINTS[TimeOfDay.DAY];
  private currentTint: TimeTint = { ...TIME_TINTS[TimeOfDay.DAY] };

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Initialise the environment manager. Call once during scene create().
   * @param scene     The gameplay scene.
   * @param parallaxManager  The parallax scrolling background manager
   *                         (expected to expose `tintLayers(sky, far, mid, near)` or
   *                          individual layer references).
   */
  public create(scene: Phaser.Scene, parallaxManager?: any): void {
    this.scene = scene;
    this.parallaxManager = parallaxManager ?? null;

    // ── Night vignette ───────────────────────────────────────────────
    this.vignetteOverlay = scene.add.graphics();
    this.vignetteOverlay.setDepth(90);
    this.vignetteOverlay.setScrollFactor(0);
    this.vignetteOverlay.setAlpha(0);

    // ── Fog overlay ──────────────────────────────────────────────────
    this.fogOverlay = scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0xcccccc, 0,
    );
    this.fogOverlay.setDepth(85);
    this.fogOverlay.setScrollFactor(0);
    this.fogOverlay.setAlpha(0);

    // ── Lightning flash overlay ──────────────────────────────────────
    this.flashOverlay = scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0xffffff, 0,
    );
    this.flashOverlay.setDepth(95);
    this.flashOverlay.setScrollFactor(0);
    this.flashOverlay.setAlpha(0);

    // ── Listen for wave changes ──────────────────────────────────────
    EventBus.on(GameEvents.WAVE_START, this.onWaveStart, this);

    // Initial weather timer
    this.scheduleNextWeather();

    // Draw initial vignette
    this.drawVignette(0);
  }

  /**
   * Per-frame update. Interpolates tint colours, updates weather visuals.
   */
  public update(_time: number, delta: number): void {
    // Smooth-lerp the current tint toward the target
    const lerpSpeed = 0.002 * delta; // ~0.12 per frame at 60 fps
    this.currentTint.sky = this.lerpColor(this.currentTint.sky, this.targetTint.sky, lerpSpeed);
    this.currentTint.far = this.lerpColor(this.currentTint.far, this.targetTint.far, lerpSpeed);
    this.currentTint.mid = this.lerpColor(this.currentTint.mid, this.targetTint.mid, lerpSpeed);
    this.currentTint.near = this.lerpColor(this.currentTint.near, this.targetTint.near, lerpSpeed);
    this.currentTint.ambient = this.lerpColor(this.currentTint.ambient, this.targetTint.ambient, lerpSpeed);

    // Apply tints to parallax layers
    this.applyParallaxTints();

    // Update vignette
    const targetVignetteAlpha = this.currentPhase === TimeOfDay.NIGHT ? 0.55 : 0;
    this.vignetteAlpha = lerp(this.vignetteAlpha, targetVignetteAlpha, 0.003 * delta);
    this.drawVignette(this.vignetteAlpha);

    // Update weather effects
    this.updateWeather(delta);
  }

  /** Returns the current time-of-day phase. */
  public getCurrentTimeOfDay(): TimeOfDay {
    return this.currentPhase;
  }

  /** Returns the current weather state. */
  public getCurrentWeather(): Weather {
    return this.currentWeather;
  }

  /** Returns the night spawn rate multiplier (1.0 during the day, 1.25 at night). */
  public getNightSpawnMultiplier(): number {
    return this.currentPhase === TimeOfDay.NIGHT ? NIGHT_SPAWN_MULTIPLIER : 1.0;
  }

  /** Get the ambient tint color for general world tinting. */
  public getAmbientTint(): number {
    return this.currentTint.ambient;
  }

  /**
   * Clean up listeners and graphics objects.
   */
  public destroy(): void {
    EventBus.off(GameEvents.WAVE_START, this.onWaveStart, this);
    if (this.rainEmitter) {
      this.rainEmitter.stop();
      this.rainEmitter = null;
    }
    this.vignetteOverlay?.destroy();
    this.fogOverlay?.destroy();
    this.flashOverlay?.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────────────────────────────

  /** Called when a new wave starts. Advances the day/night cycle. */
  private onWaveStart = (data: { wave: number }): void => {
    this.currentWave = data.wave;

    // Compute cycle progress (wraps every WAVES_PER_DAY_CYCLE waves)
    this.cycleProgress = ((this.currentWave - 1) % WAVES_PER_DAY_CYCLE) / WAVES_PER_DAY_CYCLE;

    // Determine which phase we're in
    const prevPhase = this.currentPhase;
    for (const range of PHASE_RANGES) {
      if (this.cycleProgress >= range.start && this.cycleProgress < range.end) {
        this.currentPhase = range.phase;
        break;
      }
    }

    // Compute interpolated tint between current and next phase
    this.targetTint = this.computeInterpolatedTint();

    if (prevPhase !== this.currentPhase) {
      EventBus.emit(GameEvents.TIME_CHANGED, {
        timeOfDay: this.currentPhase,
        wave: this.currentWave,
      });
    }
  };

  /**
   * Blend tints between the current phase and the next based on position
   * within the phase.
   */
  private computeInterpolatedTint(): TimeTint {
    let currentRange = PHASE_RANGES[0];
    let currentIndex = 0;
    for (let i = 0; i < PHASE_RANGES.length; i++) {
      if (this.cycleProgress >= PHASE_RANGES[i].start && this.cycleProgress < PHASE_RANGES[i].end) {
        currentRange = PHASE_RANGES[i];
        currentIndex = i;
        break;
      }
    }

    const nextIndex = (currentIndex + 1) % PHASE_RANGES.length;
    const rangeDuration = currentRange.end - currentRange.start;
    const progressInPhase = (this.cycleProgress - currentRange.start) / rangeDuration;

    const fromTint = TIME_TINTS[currentRange.phase];
    const toTint = TIME_TINTS[PHASE_RANGES[nextIndex].phase];

    // Only blend in the last 30% of each phase to create smooth transitions
    const blendZone = 0.3;
    let blendFactor = 0;
    if (progressInPhase > 1 - blendZone) {
      blendFactor = (progressInPhase - (1 - blendZone)) / blendZone;
    }

    return {
      sky: this.lerpColor(fromTint.sky, toTint.sky, blendFactor),
      far: this.lerpColor(fromTint.far, toTint.far, blendFactor),
      mid: this.lerpColor(fromTint.mid, toTint.mid, blendFactor),
      near: this.lerpColor(fromTint.near, toTint.near, blendFactor),
      ambient: this.lerpColor(fromTint.ambient, toTint.ambient, blendFactor),
    };
  }

  /** Apply current tint values to parallax layers if the manager exists. */
  private applyParallaxTints(): void {
    if (!this.parallaxManager) return;

    // The ParallaxManager is expected to expose tintLayers() or individual
    // layer references. Support both patterns.
    if (typeof this.parallaxManager.tintLayers === 'function') {
      this.parallaxManager.tintLayers(
        this.currentTint.sky,
        this.currentTint.far,
        this.currentTint.mid,
        this.currentTint.near,
      );
    } else {
      // Fallback: try to tint individual layer groups
      if (this.parallaxManager.skyLayer) {
        this.tintGameObject(this.parallaxManager.skyLayer, this.currentTint.sky);
      }
      if (this.parallaxManager.farLayer) {
        this.tintGameObject(this.parallaxManager.farLayer, this.currentTint.far);
      }
      if (this.parallaxManager.midLayer) {
        this.tintGameObject(this.parallaxManager.midLayer, this.currentTint.mid);
      }
      if (this.parallaxManager.nearLayer) {
        this.tintGameObject(this.parallaxManager.nearLayer, this.currentTint.near);
      }
    }
  }

  /** Tint a game object or group. */
  private tintGameObject(obj: any, tint: number): void {
    if (typeof obj.setTint === 'function') {
      obj.setTint(tint);
    } else if (typeof obj.getChildren === 'function') {
      // It's a group or container
      const children = obj.getChildren();
      for (const child of children) {
        if (typeof child.setTint === 'function') {
          child.setTint(tint);
        }
      }
    }
  }

  /** Draw a radial vignette overlay for nighttime darkness. */
  private drawVignette(alpha: number): void {
    this.vignetteOverlay.clear();
    if (alpha <= 0.01) {
      this.vignetteOverlay.setAlpha(0);
      return;
    }

    this.vignetteOverlay.setAlpha(1);

    // Draw a dark rectangle with a radial gradient hole in the centre.
    // Since Phaser Graphics doesn't natively support radial gradients,
    // we draw concentric rings from transparent centre to opaque edge.
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const maxRadius = Math.sqrt(cx * cx + cy * cy);
    const steps = 20;

    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const radius = maxRadius * (0.3 + 0.7 * t);
      const ringAlpha = alpha * t * t; // quadratic falloff for soft vignette
      this.vignetteOverlay.fillStyle(0x000011, ringAlpha);
      this.vignetteOverlay.fillCircle(cx, cy, radius);
    }
  }

  // ─── Weather system ────────────────────────────────────────────────────

  /** Schedule the next weather change after the current weather ends. */
  private scheduleNextWeather(): void {
    const config = WEATHER_CONFIGS[this.currentWeather];
    this.weatherDuration = config.minDuration +
      Math.random() * (config.maxDuration - config.minDuration);
    this.weatherTimer = 0;
  }

  /** Per-frame weather update. */
  private updateWeather(delta: number): void {
    this.weatherTimer += delta;

    // Check for weather transition
    if (this.weatherTimer >= this.weatherDuration) {
      this.transitionWeather();
    }

    // Update active weather effects
    switch (this.currentWeather) {
      case Weather.RAIN:
        this.updateRain();
        break;
      case Weather.FOG:
        this.updateFog(delta);
        break;
      case Weather.STORM:
        this.updateStorm(delta);
        break;
      case Weather.CLEAR:
        this.updateClear(delta);
        break;
    }
  }

  /** Pick a new weather state based on weighted random selection. */
  private transitionWeather(): void {
    const prevWeather = this.currentWeather;

    // Weighted random selection
    const types = Object.keys(WEATHER_CONFIGS) as Weather[];
    const weights = types.map((t) => WEATHER_CONFIGS[t].weight);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;

    let newWeather = Weather.CLEAR;
    for (let i = 0; i < types.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        newWeather = types[i];
        break;
      }
    }

    // If night, higher chance of storm/fog
    if (this.currentPhase === TimeOfDay.NIGHT && newWeather === Weather.CLEAR) {
      if (Math.random() < 0.4) {
        newWeather = Math.random() < 0.5 ? Weather.FOG : Weather.STORM;
      }
    }

    this.setWeather(newWeather);

    if (prevWeather !== this.currentWeather) {
      EventBus.emit(GameEvents.WEATHER_CHANGED, {
        weather: this.currentWeather,
      });
    }
  }

  /** Set the active weather and configure visuals. */
  private setWeather(weather: Weather): void {
    // Clean up previous weather
    this.cleanupWeatherEffects();

    this.currentWeather = weather;
    this.scheduleNextWeather();

    // Set up new weather
    switch (weather) {
      case Weather.RAIN:
        this.startRain();
        break;
      case Weather.FOG:
        this.startFog();
        break;
      case Weather.STORM:
        this.startStorm();
        break;
      case Weather.CLEAR:
        // Nothing to set up
        break;
    }
  }

  /** Remove all active weather visual effects. */
  private cleanupWeatherEffects(): void {
    // Stop rain
    if (this.rainEmitter) {
      this.rainEmitter.stop();
      this.rainEmitter = null;
    }

    // Fade out fog
    this.fogOverlay.setAlpha(0);

    // Clear lightning timer
    this.lightningCooldown = 0;
    this.lightningTimer = 0;
  }

  // ── Rain ───────────────────────────────────────────────────────────────

  private startRain(): void {
    if (!this.scene.textures.exists('rain-drop')) {
      // rain-drop texture not loaded; skip particle rain
      return;
    }

    const particles = this.scene.add.particles(0, 0, 'rain-drop', {
      x: { min: 0, max: GAME_WIDTH },
      y: -10,
      lifespan: 800,
      speedY: { min: 400, max: 600 },
      speedX: { min: -30, max: -80 },
      scaleX: { min: 0.3, max: 0.6 },
      scaleY: { min: 0.8, max: 1.2 },
      alpha: { start: 0.6, end: 0.1 },
      quantity: 8,
      frequency: 30,
      tint: 0x8899bb,
    });
    particles.setDepth(80);
    particles.setScrollFactor(0);

    this.rainEmitter = particles;
  }

  private updateRain(): void {
    // Rain is self-updating via particle emitter
    // Just apply slight fog for visibility reduction
    const targetFogAlpha = 0.08;
    this.fogOverlay.setAlpha(
      lerp(this.fogOverlay.alpha, targetFogAlpha, 0.02),
    );
  }

  // ── Fog ────────────────────────────────────────────────────────────────

  private startFog(): void {
    // Fog fades in via update
  }

  private updateFog(delta: number): void {
    // Gradually increase fog opacity
    const targetAlpha = 0.35;
    const speed = 0.0008 * delta;
    this.fogOverlay.setAlpha(
      lerp(this.fogOverlay.alpha, targetAlpha, speed),
    );
  }

  // ── Storm ──────────────────────────────────────────────────────────────

  private startStorm(): void {
    // Start rain
    this.startRain();

    // Increase rain intensity if emitter exists
    if (this.rainEmitter) {
      this.rainEmitter.quantity = 14;
      this.rainEmitter.frequency = 20;
    }

    // Set lightning to fire periodically
    this.lightningCooldown = 3000 + Math.random() * 5000;
    this.lightningTimer = 0;
  }

  private updateStorm(delta: number): void {
    // Rain self-updates via emitter

    // Lightning flashes
    this.lightningTimer += delta;
    if (this.lightningTimer >= this.lightningCooldown) {
      this.triggerLightning();
      this.lightningTimer = 0;
      this.lightningCooldown = 2000 + Math.random() * 6000;
    }

    // Slight fog during storm
    const targetFogAlpha = 0.12;
    this.fogOverlay.setAlpha(
      lerp(this.fogOverlay.alpha, targetFogAlpha, 0.01),
    );
  }

  private triggerLightning(): void {
    // Brief white screen flash
    this.flashOverlay.setAlpha(0.8);
    this.scene.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration: 200,
      ease: 'Power2',
    });

    // Camera shake for thunder
    this.scene.cameras.main.shake(300, 0.005);

    // Emit screen flash event for other systems (e.g. AudioManager to play thunder)
    EventBus.emit(GameEvents.SCREEN_FLASH, { type: 'lightning' });
  }

  // ── Clear ──────────────────────────────────────────────────────────────

  private updateClear(delta: number): void {
    // Fade out any residual fog
    if (this.fogOverlay.alpha > 0.01) {
      const speed = 0.001 * delta;
      this.fogOverlay.setAlpha(lerp(this.fogOverlay.alpha, 0, speed));
    } else {
      this.fogOverlay.setAlpha(0);
    }
  }

  // ─── Colour helpers ────────────────────────────────────────────────────

  /** Linearly interpolate between two 0xRRGGBB colours. */
  private lerpColor(from: number, to: number, t: number): number {
    t = clamp(t, 0, 1);

    const fromR = (from >> 16) & 0xff;
    const fromG = (from >> 8) & 0xff;
    const fromB = from & 0xff;

    const toR = (to >> 16) & 0xff;
    const toG = (to >> 8) & 0xff;
    const toB = to & 0xff;

    const r = Math.round(lerp(fromR, toR, t));
    const g = Math.round(lerp(fromG, toG, t));
    const b = Math.round(lerp(fromB, toB, t));

    return (r << 16) | (g << 8) | b;
  }
}
