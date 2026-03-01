/**
 * Web Audio API based audio engine — no framework dependency.
 * Provides procedural sound effects and ambient audio.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private sfxCooldowns = new Map<string, number>();

  public create(): void {
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      console.warn('Web Audio not available');
    }
  }

  public resume(): void {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  private canPlay(id: string, cooldownMs: number): boolean {
    const now = performance.now();
    const last = this.sfxCooldowns.get(id) ?? 0;
    if (now - last < cooldownMs) return false;
    this.sfxCooldowns.set(id, now);
    return true;
  }

  public playShot(): void {
    if (!this.ctx || !this.canPlay('shot', 200)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  public playHit(): void {
    if (!this.ctx || !this.canPlay('hit', 150)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  public playPickup(): void {
    if (!this.ctx || !this.canPlay('pickup', 200)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  public playMelee(): void {
    if (!this.ctx || !this.canPlay('melee', 300)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  public setVolume(v: number): void {
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  public stop(): void {
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }
}
