export interface GameEventDef {
  type: 'tunnel' | 'bridge' | 'station';
  name: string;
  description: string;
  duration: number;      // ms
  weight: number;        // spawn weight
  spawnModifier: number; // multiplier for zombie spawn rate during event
  visibility: number;    // 0-1, how much visibility (1 = full, 0 = pitch black)
}

export const EVENT_DEFINITIONS: GameEventDef[] = [
  {
    type: 'tunnel',
    name: 'Entering Tunnel',
    description: 'Darkness engulfs the train. Stay alert!',
    duration: 10000,
    weight: 3,
    spawnModifier: 1.5,
    visibility: 0.15,
  },
  {
    type: 'bridge',
    name: 'Crossing Bridge',
    description: 'High winds rock the train. Watch your footing!',
    duration: 15000,
    weight: 2,
    spawnModifier: 0.8,
    visibility: 1.0,
  },
  {
    type: 'station',
    name: 'Station Stop',
    description: 'The train slows at an abandoned station. Survivors may need rescue!',
    duration: 25000,
    weight: 2,
    spawnModifier: 2.0,
    visibility: 1.0,
  },
];

export function getRandomEvent(): GameEventDef {
  const totalWeight = EVENT_DEFINITIONS.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const event of EVENT_DEFINITIONS) {
    roll -= event.weight;
    if (roll <= 0) return event;
  }
  return EVENT_DEFINITIONS[0];
}
