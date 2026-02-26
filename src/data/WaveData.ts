import { ZombieType, BossType } from '../types/ZombieTypes';
import { ZOMBIE_UNLOCK_WAVE } from './ZombieData';
import * as Balance from './BalanceConstants';

export interface WaveSpawn {
  type: ZombieType;
  count: number;
}

export interface WaveDefinition {
  wave: number;
  composition: WaveSpawn[];
  spawnInterval: number;   // ms between spawns
  boss?: BossType;
  eventChance: number;     // 0-1 chance of environment event
}

// Handcrafted early waves for pacing
export const WAVE_DEFINITIONS: WaveDefinition[] = [
  {
    wave: 1,
    composition: [{ type: ZombieType.WALKER, count: 5 }],
    spawnInterval: 2000,
    eventChance: 0,
  },
  {
    wave: 2,
    composition: [{ type: ZombieType.WALKER, count: 8 }],
    spawnInterval: 1800,
    eventChance: 0,
  },
  {
    wave: 3,
    composition: [
      { type: ZombieType.WALKER, count: 6 },
      { type: ZombieType.RUNNER, count: 3 },
    ],
    spawnInterval: 1600,
    eventChance: 0.15,
  },
  {
    wave: 4,
    composition: [
      { type: ZombieType.WALKER, count: 8 },
      { type: ZombieType.RUNNER, count: 4 },
    ],
    spawnInterval: 1500,
    eventChance: 0.2,
  },
  {
    wave: 5,
    composition: [
      { type: ZombieType.WALKER, count: 8 },
      { type: ZombieType.RUNNER, count: 5 },
      { type: ZombieType.CRAWLER, count: 3 },
    ],
    spawnInterval: 1400,
    eventChance: 0.25,
  },
  {
    wave: 6,
    composition: [
      { type: ZombieType.WALKER, count: 10 },
      { type: ZombieType.RUNNER, count: 5 },
      { type: ZombieType.CRAWLER, count: 4 },
    ],
    spawnInterval: 1300,
    eventChance: 0.3,
  },
  {
    wave: 7,
    composition: [
      { type: ZombieType.WALKER, count: 10 },
      { type: ZombieType.RUNNER, count: 6 },
      { type: ZombieType.CRAWLER, count: 4 },
      { type: ZombieType.SPITTER, count: 3 },
    ],
    spawnInterval: 1200,
    eventChance: 0.35,
  },
  {
    wave: 8,
    composition: [
      { type: ZombieType.WALKER, count: 12 },
      { type: ZombieType.RUNNER, count: 6 },
      { type: ZombieType.CRAWLER, count: 5 },
      { type: ZombieType.SPITTER, count: 4 },
    ],
    spawnInterval: 1100,
    eventChance: 0.35,
  },
  {
    wave: 9,
    composition: [
      { type: ZombieType.WALKER, count: 10 },
      { type: ZombieType.RUNNER, count: 8 },
      { type: ZombieType.CRAWLER, count: 5 },
      { type: ZombieType.SPITTER, count: 4 },
      { type: ZombieType.TANK, count: 2 },
    ],
    spawnInterval: 1000,
    eventChance: 0.4,
  },
  {
    wave: 10,
    composition: [
      { type: ZombieType.WALKER, count: 12 },
      { type: ZombieType.RUNNER, count: 6 },
      { type: ZombieType.TANK, count: 3 },
    ],
    spawnInterval: 1000,
    boss: BossType.BRUTE,
    eventChance: 0,
  },
];

// Generate waves beyond the handcrafted ones
export function generateWave(waveNumber: number): WaveDefinition {
  const composition: WaveSpawn[] = [];
  const unlockedTypes = Object.entries(ZOMBIE_UNLOCK_WAVE)
    .filter(([, unlockWave]) => waveNumber >= unlockWave)
    .map(([type]) => type as ZombieType);

  for (const type of unlockedTypes) {
    const baseCount = Math.floor(
      Balance.WAVE_BASE_ZOMBIES + waveNumber * Balance.WAVE_ZOMBIE_SCALING * 0.4
    );
    const count = Math.max(2, Math.floor(baseCount * (0.5 + Math.random() * 0.8)));
    composition.push({ type, count });
  }

  const spawnInterval = Math.max(
    Balance.WAVE_SPAWN_INTERVAL_MIN,
    Balance.WAVE_SPAWN_INTERVAL_MS - waveNumber * Balance.WAVE_SPAWN_SPEEDUP
  );

  const isBossWave = waveNumber % Balance.BOSS_WAVE_INTERVAL === 0;
  const boss = isBossWave
    ? (waveNumber % 20 === 0 ? BossType.HIVE : BossType.BRUTE)
    : undefined;

  const eventChance = isBossWave
    ? 0
    : Math.min(0.6, Balance.EVENT_CHANCE_BASE + waveNumber * Balance.EVENT_CHANCE_INCREASE);

  return { wave: waveNumber, composition, spawnInterval, boss, eventChance };
}

export function getWaveDefinition(waveNumber: number): WaveDefinition {
  if (waveNumber <= WAVE_DEFINITIONS.length) {
    return WAVE_DEFINITIONS[waveNumber - 1];
  }
  return generateWave(waveNumber);
}
