/**
 * Lightweight event emitter — replaces Phaser.Events.EventEmitter.
 * Supports on/off/once/emit with the same API surface used by the game.
 */
type Listener = (...args: unknown[]) => void;

class SimpleEventEmitter {
  private listeners = new Map<string, { fn: Listener; ctx?: unknown; once: boolean }[]>();

  on(event: string, fn: Listener, ctx?: unknown): this {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push({ fn, ctx, once: false });
    return this;
  }

  once(event: string, fn: Listener, ctx?: unknown): this {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push({ fn, ctx, once: true });
    return this;
  }

  off(event: string, fn?: Listener, ctx?: unknown): this {
    if (!fn) {
      this.listeners.delete(event);
      return this;
    }
    const list = this.listeners.get(event);
    if (list) {
      this.listeners.set(event, list.filter(l => l.fn !== fn || (ctx !== undefined && l.ctx !== ctx)));
    }
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    const list = this.listeners.get(event);
    if (!list) return this;
    const kept: typeof list = [];
    for (const l of list) {
      l.fn.apply(l.ctx, args);
      if (!l.once) kept.push(l);
    }
    this.listeners.set(event, kept);
    return this;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }
}

export const EventBus = new SimpleEventEmitter();
