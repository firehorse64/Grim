import Phaser from 'phaser';

// Global event bus for cross-scene and cross-system communication
export const EventBus = new Phaser.Events.EventEmitter();
