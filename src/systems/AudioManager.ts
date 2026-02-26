import Phaser from 'phaser';
import { GameEvents } from '../types/EventTypes';
import { EventBus } from '../utils/EventBus';
import { clamp } from '../utils/MathUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Sound key definitions
// ─────────────────────────────────────────────────────────────────────────────

export const SfxKeys = {
  // Weapons
  PISTOL_SHOT: 'pistol-shot',
  SHOTGUN_SHOT: 'shotgun-shot',
  SMG_SHOT: 'smg-shot',
  RIFLE_SHOT: 'rifle-shot',
  EXPLOSION: 'explosion',
  RELOAD: 'reload',

  // Combat
  ZOMBIE_GROAN: 'zombie-groan',
  ZOMBIE_HIT: 'zombie-hit',
  ZOMBIE_DEATH: 'zombie-death',
  PLAYER_HIT: 'player-hit',
  PLAYER_DEATH: 'player-death',

  // UI
  UI_CLICK: 'ui-click',
  UI_PURCHASE: 'ui-purchase',
  UI_DENIED: 'ui-denied',

  // Environment
  TRAIN_RUMBLE: 'train-rumble',
  THUNDER: 'thunder',
  WIND: 'wind',

  // Pickups
  AMMO_PICKUP: 'ammo-pickup',
  HEALTH_PICKUP: 'health-pickup',
  CURRENCY_PICKUP: 'currency-pickup',

  // Music
  MUSIC_AMBIENT: 'music-ambient',
} as const;

export type SfxKey = (typeof SfxKeys)[keyof typeof SfxKeys];

// ─────────────────────────────────────────────────────────────────────────────
// SFX config for play variations
// ─────────────────────────────────────────────────────────────────────────────
interface SfxConfig {
  volume?: number;        // 0-1, override base volume
  pan?: number;           // -1 (left) to 1 (right) for positional
  detune?: number;        // cents pitch variation
  loop?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// AudioManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Procedural audio system that generates all game sounds using the Web Audio
 * API (oscillators, noise buffers, filters). No external audio files are
 * required. Provides a simple API for playing sound effects and music with
 * volume control and optional positional panning.
 */
export class AudioManager {
  private scene!: Phaser.Scene;
  private ctx!: AudioContext;

  // ── Master gain chain ──────────────────────────────────────────────────
  private masterGain!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;

  // ── Volume levels (0-1) ────────────────────────────────────────────────
  private _masterVolume: number = 0.7;
  private _musicVolume: number = 0.5;
  private _sfxVolume: number = 0.8;

  // ── Music state ────────────────────────────────────────────────────────
  private activeMusicNodes: AudioNode[] = [];
  private musicPlaying: boolean = false;
  private musicKey: string = '';

  // ── Noise buffer (pre-computed) ────────────────────────────────────────
  private noiseBuffer!: AudioBuffer;

  // ── Ambient loop nodes ─────────────────────────────────────────────────
  private trainRumbleNodes: AudioNode[] = [];
  private trainRumblePlaying: boolean = false;

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Initialise the audio system. Call once during scene create().
   */
  public create(scene: Phaser.Scene): void {
    this.scene = scene;

    // Get or create AudioContext
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      console.warn('AudioManager: Web Audio API not available');
      return;
    }

    // Build gain chain: source → sfx/musicGain → masterGain → destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this._masterVolume;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this._musicVolume;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this._sfxVolume;
    this.sfxGain.connect(this.masterGain);

    // Pre-generate noise buffer (1 second of white noise)
    this.noiseBuffer = this.createNoiseBuffer(1.0);

    // Wire up EventBus listeners for automatic sound playback
    this.bindEvents();
  }

  /**
   * Play a named sound effect.
   */
  public playSfx(key: SfxKey | string, config?: SfxConfig): void {
    if (!this.ctx) return;
    this.resumeContext();

    const vol = (config?.volume ?? 1.0) * this._sfxVolume;
    const pan = config?.pan ?? 0;
    const detune = config?.detune ?? (Math.random() - 0.5) * 40; // subtle pitch variation

    switch (key) {
      case SfxKeys.PISTOL_SHOT:
        this.synthGunshot(0.25 * vol, 800, 0.06, 0.08, pan, detune);
        break;
      case SfxKeys.SHOTGUN_SHOT:
        this.synthGunshot(0.4 * vol, 400, 0.04, 0.15, pan, detune);
        break;
      case SfxKeys.SMG_SHOT:
        this.synthGunshot(0.18 * vol, 1200, 0.02, 0.04, pan, detune);
        break;
      case SfxKeys.RIFLE_SHOT:
        this.synthGunshot(0.35 * vol, 600, 0.03, 0.12, pan, detune);
        break;
      case SfxKeys.EXPLOSION:
        this.synthExplosion(0.6 * vol, pan);
        break;
      case SfxKeys.RELOAD:
        this.synthReload(0.2 * vol, pan);
        break;
      case SfxKeys.ZOMBIE_GROAN:
        this.synthZombieGroan(0.25 * vol, pan);
        break;
      case SfxKeys.ZOMBIE_HIT:
        this.synthImpact(0.2 * vol, 200, 0.05, pan);
        break;
      case SfxKeys.ZOMBIE_DEATH:
        this.synthDeath(0.3 * vol, pan);
        break;
      case SfxKeys.PLAYER_HIT:
        this.synthImpact(0.3 * vol, 350, 0.08, pan);
        break;
      case SfxKeys.PLAYER_DEATH:
        this.synthPlayerDeath(0.4 * vol);
        break;
      case SfxKeys.UI_CLICK:
        this.synthUIClick(0.15 * vol);
        break;
      case SfxKeys.UI_PURCHASE:
        this.synthUIPurchase(0.2 * vol);
        break;
      case SfxKeys.UI_DENIED:
        this.synthUIDenied(0.2 * vol);
        break;
      case SfxKeys.THUNDER:
        this.synthThunder(0.5 * vol);
        break;
      case SfxKeys.WIND:
        this.synthWind(0.15 * vol);
        break;
      case SfxKeys.AMMO_PICKUP:
        this.synthPickup(0.2 * vol, 600, 800);
        break;
      case SfxKeys.HEALTH_PICKUP:
        this.synthPickup(0.2 * vol, 500, 700);
        break;
      case SfxKeys.CURRENCY_PICKUP:
        this.synthPickup(0.2 * vol, 800, 1200);
        break;
    }
  }

  /**
   * Play a music track with crossfade.
   */
  public playMusic(key: string): void {
    if (!this.ctx) return;
    this.resumeContext();

    if (this.musicKey === key && this.musicPlaying) return;

    // Fade out current music
    this.stopMusic(1.0);

    this.musicKey = key;
    this.musicPlaying = true;

    // Start new music after a brief crossfade delay
    this.scene.time.delayedCall(500, () => {
      if (this.musicKey !== key) return; // Changed in the meantime
      this.startAmbientMusic();
    });
  }

  /**
   * Stop all music with optional fade duration (seconds).
   */
  public stopMusic(fadeDuration: number = 0.5): void {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    for (const node of this.activeMusicNodes) {
      if (node instanceof GainNode) {
        node.gain.setValueAtTime(node.gain.value, now);
        node.gain.linearRampToValueAtTime(0, now + fadeDuration);
      }
      if (node instanceof OscillatorNode || node instanceof AudioBufferSourceNode) {
        try {
          (node as OscillatorNode).stop(now + fadeDuration + 0.1);
        } catch {
          // Already stopped
        }
      }
    }
    this.activeMusicNodes = [];
    this.musicPlaying = false;
  }

  /**
   * Start the ambient train rumble loop.
   */
  public startTrainAmbient(): void {
    if (!this.ctx || this.trainRumblePlaying) return;
    this.resumeContext();

    this.trainRumblePlaying = true;

    // Low rumble using filtered noise
    const bufferSource = this.ctx.createBufferSource();
    bufferSource.buffer = this.noiseBuffer;
    bufferSource.loop = true;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 80;
    lp.Q.value = 2;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.08 * this._sfxVolume;

    bufferSource.connect(lp);
    lp.connect(gain);
    gain.connect(this.masterGain);

    bufferSource.start();

    this.trainRumbleNodes = [bufferSource, lp, gain];

    // Add subtle oscillation
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.8;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    this.trainRumbleNodes.push(lfo, lfoGain);
  }

  /**
   * Stop the train rumble ambient.
   */
  public stopTrainAmbient(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const node of this.trainRumbleNodes) {
      if (node instanceof OscillatorNode || node instanceof AudioBufferSourceNode) {
        try {
          node.stop(now + 0.5);
        } catch {
          // Already stopped
        }
      }
    }
    this.trainRumbleNodes = [];
    this.trainRumblePlaying = false;
  }

  // ── Volume controls ────────────────────────────────────────────────────

  public setMasterVolume(vol: number): void {
    this._masterVolume = clamp(vol, 0, 1);
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this._masterVolume, this.ctx.currentTime);
    }
  }

  public setMusicVolume(vol: number): void {
    this._musicVolume = clamp(vol, 0, 1);
    if (this.musicGain) {
      this.musicGain.gain.setValueAtTime(this._musicVolume, this.ctx.currentTime);
    }
  }

  public setSfxVolume(vol: number): void {
    this._sfxVolume = clamp(vol, 0, 1);
    if (this.sfxGain) {
      this.sfxGain.gain.setValueAtTime(this._sfxVolume, this.ctx.currentTime);
    }
  }

  public getMasterVolume(): number { return this._masterVolume; }
  public getMusicVolume(): number { return this._musicVolume; }
  public getSfxVolume(): number { return this._sfxVolume; }

  /**
   * Clean up all audio nodes and event listeners.
   */
  public destroy(): void {
    this.stopMusic(0.1);
    this.stopTrainAmbient();
    this.unbindEvents();

    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close();
      } catch {
        // Context may already be closed
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event bus bindings
  // ─────────────────────────────────────────────────────────────────────────

  private bindEvents(): void {
    EventBus.on(GameEvents.BULLET_FIRED, this.onBulletFired, this);
    EventBus.on(GameEvents.GRENADE_EXPLODED, this.onExplosion, this);
    EventBus.on(GameEvents.ZOMBIE_DAMAGED, this.onZombieHit, this);
    EventBus.on(GameEvents.ZOMBIE_KILLED, this.onZombieDeath, this);
    EventBus.on(GameEvents.PLAYER_DAMAGED, this.onPlayerHit, this);
    EventBus.on(GameEvents.PLAYER_DIED, this.onPlayerDeath, this);
    EventBus.on(GameEvents.UPGRADE_PURCHASED, this.onPurchase, this);
    EventBus.on(GameEvents.SCREEN_FLASH, this.onScreenFlash, this);
    EventBus.on(GameEvents.WAVE_START, this.onWaveStart, this);
    EventBus.on(GameEvents.WEAPON_RELOADING, this.onReload, this);
  }

  private unbindEvents(): void {
    EventBus.off(GameEvents.BULLET_FIRED, this.onBulletFired, this);
    EventBus.off(GameEvents.GRENADE_EXPLODED, this.onExplosion, this);
    EventBus.off(GameEvents.ZOMBIE_DAMAGED, this.onZombieHit, this);
    EventBus.off(GameEvents.ZOMBIE_KILLED, this.onZombieDeath, this);
    EventBus.off(GameEvents.PLAYER_DAMAGED, this.onPlayerHit, this);
    EventBus.off(GameEvents.PLAYER_DIED, this.onPlayerDeath, this);
    EventBus.off(GameEvents.UPGRADE_PURCHASED, this.onPurchase, this);
    EventBus.off(GameEvents.SCREEN_FLASH, this.onScreenFlash, this);
    EventBus.off(GameEvents.WAVE_START, this.onWaveStart, this);
    EventBus.off(GameEvents.WEAPON_RELOADING, this.onReload, this);
  }

  // ── Event handlers ─────────────────────────────────────────────────────

  private onBulletFired = (data: { weaponType: string }): void => {
    const keyMap: Record<string, SfxKey> = {
      pistol: SfxKeys.PISTOL_SHOT,
      shotgun: SfxKeys.SHOTGUN_SHOT,
      smg: SfxKeys.SMG_SHOT,
      rifle: SfxKeys.RIFLE_SHOT,
      grenade: SfxKeys.EXPLOSION,
    };
    const sfx = keyMap[data.weaponType] ?? SfxKeys.PISTOL_SHOT;
    this.playSfx(sfx);
  };

  private onExplosion = (): void => {
    this.playSfx(SfxKeys.EXPLOSION);
  };

  private onZombieHit = (): void => {
    this.playSfx(SfxKeys.ZOMBIE_HIT);
  };

  private onZombieDeath = (): void => {
    this.playSfx(SfxKeys.ZOMBIE_DEATH);
  };

  private onPlayerHit = (): void => {
    this.playSfx(SfxKeys.PLAYER_HIT);
  };

  private onPlayerDeath = (): void => {
    this.playSfx(SfxKeys.PLAYER_DEATH);
  };

  private onPurchase = (): void => {
    this.playSfx(SfxKeys.UI_PURCHASE);
  };

  private onScreenFlash = (data: { type: string }): void => {
    if (data.type === 'lightning') {
      this.playSfx(SfxKeys.THUNDER);
    }
  };

  private onWaveStart = (): void => {
    // Play a subtle UI click on wave start
    this.playSfx(SfxKeys.UI_CLICK, { volume: 0.5 });
  };

  private onReload = (): void => {
    this.playSfx(SfxKeys.RELOAD);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Procedural sound synthesis
  // ─────────────────────────────────────────────────────────────────────────

  /** Resume AudioContext (required after user gesture). */
  private resumeContext(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /** Create a buffer of white noise. */
  private createNoiseBuffer(durationSec: number): AudioBuffer {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /** Create a panner for positional audio. */
  private createPanner(pan: number): StereoPannerNode {
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    return panner;
  }

  // ── Gunshot synthesis ──────────────────────────────────────────────────

  /**
   * Synthesise a gunshot using a noise burst + resonant bandpass filter
   * with a fast amplitude envelope.
   */
  private synthGunshot(
    volume: number,
    filterFreq: number,
    attack: number,
    decay: number,
    pan: number,
    detune: number,
  ): void {
    const now = this.ctx.currentTime;

    // Noise burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    // Bandpass filter for tonal character
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = filterFreq + detune;
    bp.Q.value = 1.5;

    // Highpass to remove mud
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 150;

    // Envelope
    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + attack);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + attack + decay);

    // Panner
    const panner = this.createPanner(pan);

    // Chain
    noise.connect(bp);
    bp.connect(hp);
    hp.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + attack + decay + 0.05);

    // Sub-bass thump (low oscillator)
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80 + detune * 0.1, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + decay);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(volume * 0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + decay * 0.8);

    sub.connect(subGain);
    subGain.connect(panner);

    sub.start(now);
    sub.stop(now + decay + 0.05);
  }

  // ── Explosion synthesis ────────────────────────────────────────────────

  private synthExplosion(volume: number, pan: number): void {
    const now = this.ctx.currentTime;

    // Long filtered noise burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2000, now);
    lp.frequency.exponentialRampToValueAtTime(80, now + 0.8);
    lp.Q.value = 3;

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.01);
    envelope.gain.setValueAtTime(volume, now + 0.05);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    const panner = this.createPanner(pan);

    noise.connect(lp);
    lp.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 1.1);

    // Deep sub-bass
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, now);
    sub.frequency.exponentialRampToValueAtTime(20, now + 0.6);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(volume * 0.7, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    sub.connect(subGain);
    subGain.connect(panner);

    sub.start(now);
    sub.stop(now + 0.9);
  }

  // ── Zombie groan synthesis ─────────────────────────────────────────────

  private synthZombieGroan(volume: number, pan: number): void {
    const now = this.ctx.currentTime;
    const duration = 0.4 + Math.random() * 0.3;

    // Low-frequency oscillator for the groan
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const baseFreq = 70 + Math.random() * 40;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.7, now + duration);

    // Modulation (vibrato)
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4 + Math.random() * 3;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // Lowpass to muffle
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 2;

    // Envelope
    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.05);
    envelope.gain.setValueAtTime(volume * 0.8, now + duration * 0.5);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const panner = this.createPanner(pan);

    osc.connect(lp);
    lp.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.sfxGain);

    lfo.start(now);
    osc.start(now);
    lfo.stop(now + duration + 0.05);
    osc.stop(now + duration + 0.05);
  }

  // ── Impact / hit synthesis ─────────────────────────────────────────────

  private synthImpact(volume: number, freq: number, duration: number, pan: number): void {
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 2;

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(volume, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const panner = this.createPanner(pan);

    noise.connect(bp);
    bp.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + duration + 0.05);
  }

  // ── Death sounds ───────────────────────────────────────────────────────

  private synthDeath(volume: number, pan: number): void {
    const now = this.ctx.currentTime;

    // Wet squelch: filtered noise with pitch drop
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(500, now);
    bp.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    bp.Q.value = 3;

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(volume, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    const panner = this.createPanner(pan);

    noise.connect(bp);
    bp.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.4);
  }

  private synthPlayerDeath(volume: number): void {
    const now = this.ctx.currentTime;

    // Low tone that drops pitch
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 1.0);

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(volume, now);
    envelope.gain.linearRampToValueAtTime(volume * 0.5, now + 0.5);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.connect(envelope);
    envelope.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 1.3);
  }

  // ── UI sounds ──────────────────────────────────────────────────────────

  private synthUIClick(volume: number): void {
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1000;

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(volume, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(envelope);
    envelope.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  private synthUIPurchase(volume: number): void {
    const now = this.ctx.currentTime;

    // Two-tone rising chime
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 800 : 1200;

      const envelope = this.ctx.createGain();
      const start = now + i * 0.08;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(volume, start + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

      osc.connect(envelope);
      envelope.connect(this.sfxGain);

      osc.start(start);
      osc.stop(start + 0.15);
    }
  }

  private synthUIDenied(volume: number): void {
    const now = this.ctx.currentTime;

    // Two-tone descending buzz
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = i === 0 ? 300 : 200;

      const envelope = this.ctx.createGain();
      const start = now + i * 0.1;
      envelope.gain.setValueAtTime(volume * 0.5, start);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      osc.connect(envelope);
      envelope.connect(this.sfxGain);

      osc.start(start);
      osc.stop(start + 0.12);
    }
  }

  // ── Pickup sounds ──────────────────────────────────────────────────────

  private synthPickup(volume: number, freqStart: number, freqEnd: number): void {
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.linearRampToValueAtTime(freqEnd, now + 0.1);

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(volume, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(envelope);
    envelope.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  // ── Reload synthesis ───────────────────────────────────────────────────

  private synthReload(volume: number, pan: number): void {
    const now = this.ctx.currentTime;

    // Metallic click + slide
    // Click
    const noise1 = this.ctx.createBufferSource();
    noise1.buffer = this.noiseBuffer;
    const hp1 = this.ctx.createBiquadFilter();
    hp1.type = 'highpass';
    hp1.frequency.value = 2000;
    const env1 = this.ctx.createGain();
    env1.gain.setValueAtTime(volume, now);
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    const panner = this.createPanner(pan);
    noise1.connect(hp1);
    hp1.connect(env1);
    env1.connect(panner);
    panner.connect(this.sfxGain);
    noise1.start(now);
    noise1.stop(now + 0.04);

    // Slide (second click, slightly delayed)
    const noise2 = this.ctx.createBufferSource();
    noise2.buffer = this.noiseBuffer;
    const hp2 = this.ctx.createBiquadFilter();
    hp2.type = 'highpass';
    hp2.frequency.value = 1500;
    const env2 = this.ctx.createGain();
    env2.gain.setValueAtTime(0, now + 0.15);
    env2.gain.linearRampToValueAtTime(volume * 0.7, now + 0.16);
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    noise2.connect(hp2);
    hp2.connect(env2);
    env2.connect(panner);
    noise2.start(now + 0.15);
    noise2.stop(now + 0.25);
  }

  // ── Environment synthesis ──────────────────────────────────────────────

  private synthThunder(volume: number): void {
    const now = this.ctx.currentTime;

    // Long rumbling noise with low-pass sweep
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1500, now);
    lp.frequency.exponentialRampToValueAtTime(60, now + 2.0);
    lp.Q.value = 1;

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.02);
    envelope.gain.setValueAtTime(volume * 0.8, now + 0.3);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    noise.connect(lp);
    lp.connect(envelope);
    envelope.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 2.6);
  }

  private synthWind(volume: number): void {
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.5;

    // Slow modulation
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.3;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.5);
    envelope.gain.setValueAtTime(volume, now + 2.0);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

    noise.connect(bp);
    bp.connect(envelope);
    envelope.connect(this.sfxGain);

    lfo.start(now);
    noise.start(now);
    lfo.stop(now + 3.1);
    noise.stop(now + 3.1);
  }

  // ── Music synthesis ────────────────────────────────────────────────────

  /**
   * Create a dark ambient music loop using layered oscillators with
   * slow LFO modulation and filtered noise.
   */
  private startAmbientMusic(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const nodes: AudioNode[] = [];

    // Layer 1: Deep drone pad (two detuned oscillators)
    const drone1 = this.ctx.createOscillator();
    drone1.type = 'sine';
    drone1.frequency.value = 55; // A1
    const drone2 = this.ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 55.5; // Slightly detuned for beating

    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.12;

    drone1.connect(droneGain);
    drone2.connect(droneGain);
    droneGain.connect(this.musicGain);

    // Layer 2: Eerie high pad
    const pad = this.ctx.createOscillator();
    pad.type = 'triangle';
    pad.frequency.value = 220; // A3

    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 400;
    padFilter.Q.value = 5;

    // Slow filter sweep
    const padLfo = this.ctx.createOscillator();
    padLfo.type = 'sine';
    padLfo.frequency.value = 0.05; // Very slow
    const padLfoGain = this.ctx.createGain();
    padLfoGain.gain.value = 200;
    padLfo.connect(padLfoGain);
    padLfoGain.connect(padFilter.frequency);

    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.06;

    pad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(this.musicGain);

    // Layer 3: Filtered noise atmosphere
    const ambNoise = this.ctx.createBufferSource();
    ambNoise.buffer = this.noiseBuffer;
    ambNoise.loop = true;

    const noiseLp = this.ctx.createBiquadFilter();
    noiseLp.type = 'lowpass';
    noiseLp.frequency.value = 200;
    noiseLp.Q.value = 1;

    // Slow noise volume modulation
    const noiseLfo = this.ctx.createOscillator();
    noiseLfo.type = 'sine';
    noiseLfo.frequency.value = 0.1;
    const noiseLfoGain = this.ctx.createGain();
    noiseLfoGain.gain.value = 0.03;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = 0.04;
    noiseLfo.connect(noiseLfoGain);
    noiseLfoGain.connect(noiseGain.gain);

    ambNoise.connect(noiseLp);
    noiseLp.connect(noiseGain);
    noiseGain.connect(this.musicGain);

    // Fade in
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(0.12, now + 2.0);
    padGain.gain.setValueAtTime(0, now);
    padGain.gain.linearRampToValueAtTime(0.06, now + 3.0);
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.04, now + 2.5);

    // Start all nodes
    drone1.start(now);
    drone2.start(now);
    pad.start(now);
    padLfo.start(now);
    ambNoise.start(now);
    noiseLfo.start(now);

    // Track nodes for cleanup
    nodes.push(
      drone1, drone2, droneGain,
      pad, padFilter, padLfo, padLfoGain, padGain,
      ambNoise, noiseLp, noiseGain, noiseLfo, noiseLfoGain,
    );

    this.activeMusicNodes = nodes;
  }
}
