export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  SHOP = 'SHOP',
  GAME_OVER = 'GAME_OVER',
}

export enum Direction {
  LEFT = -1,
  RIGHT = 1,
}

export enum ZoneType {
  INTERIOR = 'INTERIOR',
  ROOFTOP = 'ROOFTOP',
  CONNECTOR = 'CONNECTOR',
}

export enum TimeOfDay {
  DAWN = 'DAWN',
  DAY = 'DAY',
  DUSK = 'DUSK',
  NIGHT = 'NIGHT',
}

export enum Weather {
  CLEAR = 'CLEAR',
  RAIN = 'RAIN',
  FOG = 'FOG',
  STORM = 'STORM',
}

export interface InputState {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  aimAngle: number;
  shooting: boolean;
  reloading: boolean;
  jumping: boolean;
  weaponSlot: number;
  interact: boolean;
  grenade: boolean;
  barricade: boolean;
  pause: boolean;
  climbUp: boolean;
  climbDown: boolean;
}
