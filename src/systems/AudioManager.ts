import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { TimeOfDay } from '../types/GameTypes';

/**
 * Manages all game audio using Web Audio API through Phaser.
 * Generates procedural sound effects since we have no audio files.
 */
export class AudioManager {
  private scene!: Phaser.Scene;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;

  private ambientOsc: OscillatorNode | null = null;
  private ambientNoise: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;
  private sfxCooldown: number = 0;

  public create(scene: Phaser.Scene): void {
    this.scene = scene;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.audioContext.destination);

      this.ambientGain = this.audioContext.createGain();
      this.ambientGain.gain.value = 0.08;
      this.ambientGain.connect(this.masterGain);

      // Start ambient sounds
      this.startAmbient();
    } catch (e) {
      console.warn('Web Audio not available:', e);
    }

    // Listen for events
    EventBus.on('combat:fired', () => this.playSFX('gunshot'));
    EventBus.on('combat:melee', () => this.playSFX('melee'));
    EventBus.on('survival:ate', () => this.playSFX('eat'));
    EventBus.on('breach:zombies-entered', () => this.playSFX('breach'));
    EventBus.on('fire:started', () => this.playSFX('fire'));
    EventBus.on('craft:completed', () => this.playSFX('craft'));
  }

  private startAmbient(): void {
    if (!this.audioContext || !this.ambientGain || this.isPlaying) return;
    this.isPlaying = true;

    // Low rumble (train engine)
    this.ambientOsc = this.audioContext.createOscillator();
    this.ambientOsc.type = 'sawtooth';
    this.ambientOsc.frequency.value = 40;
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 80;
    this.ambientOsc.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientOsc.start();

    // Wind noise
    this.createWindNoise();
  }

  private createWindNoise(): void {
    if (!this.audioContext || !this.ambientGain) return;

    const bufferSize = this.audioContext.sampleRate * 2;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }

    const windFilter = this.audioContext.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 400;
    windFilter.Q.value = 0.5;

    const windGain = this.audioContext.createGain();
    windGain.gain.value = 0.04;

    this.ambientNoise = this.audioContext.createBufferSource();
    this.ambientNoise.buffer = buffer;
    this.ambientNoise.loop = true;
    this.ambientNoise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.ambientGain);
    this.ambientNoise.start();
  }

  /** Play a sound effect. */
  public playSFX(type: string): void {
    if (!this.audioContext || !this.masterGain) return;
    if (this.sfxCooldown > 0) return;
    this.sfxCooldown = 50; // ms between SFX

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    switch (type) {
      case 'gunshot': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 150;
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);

        // Noise burst
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1);
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        noiseSrc.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noiseSrc.start(now);
        break;
      }
      case 'melee': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      case 'eat': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(400, now + 0.05);
        osc.frequency.setValueAtTime(500, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }
      case 'breach': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
      }
      case 'fire': {
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        src.start(now);
        break;
      }
      case 'craft': {
        for (let i = 0; i < 3; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.value = 400 + i * 200;
          gain.gain.setValueAtTime(0.08, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.1);
          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.1);
        }
        break;
      }
    }
  }

  /** Update cooldowns. */
  public update(delta: number): void {
    this.sfxCooldown = Math.max(0, this.sfxCooldown - delta);
  }

  /** Update ambient sound based on time of day. */
  public setTimeOfDay(time: TimeOfDay): void {
    if (!this.ambientGain) return;
    // Quieter at night, windier during day
    switch (time) {
      case TimeOfDay.NIGHT:
        this.ambientGain.gain.value = 0.04;
        break;
      case TimeOfDay.DAWN:
      case TimeOfDay.DUSK:
        this.ambientGain.gain.value = 0.06;
        break;
      default:
        this.ambientGain.gain.value = 0.08;
    }
  }

  /** Set master volume. */
  public setVolume(vol: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  /** Stop all audio. */
  public stop(): void {
    if (this.ambientOsc) {
      try { this.ambientOsc.stop(); } catch { /* ignore */ }
      this.ambientOsc = null;
    }
    if (this.ambientNoise) {
      try { this.ambientNoise.stop(); } catch { /* ignore */ }
      this.ambientNoise = null;
    }
    this.isPlaying = false;
  }
}
