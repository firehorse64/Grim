import { WeaponType } from './WeaponTypes';

export interface SaveData {
  version: number;
  wave: number;
  score: number;
  currency: number;
  playerHp: number;
  playerMaxHp: number;
  weapons: SavedWeapon[];
  upgrades: string[];
  survivors: number;
  settings: GameSettings;
  timestamp: number;
}

export interface SavedWeapon {
  type: WeaponType;
  ammo: number;
  reserve: number;
  level: number;
}

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  showDamageNumbers: boolean;
  showMinimap: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  screenShake: true,
  showDamageNumbers: true,
  showMinimap: true,
};

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'grim-zombie-train-save';
