/**
 * Map locations, routes, and destination data for the train journey.
 * The goal is to reach the coast.
 */

export interface MapLocation {
  id: string;
  name: string;
  type: 'city' | 'town' | 'outpost' | 'waypoint';
  x: number;  // map-space x (0-1000)
  y: number;  // map-space y (0-600)
  description: string;
  dangerLevel: number; // 1-5
  lootMultiplier: number;
  connections: string[]; // ids of connected locations
}

export interface RouteSegment {
  from: string;
  to: string;
  distance: number; // in "km" (determines travel time)
  waystops: string[]; // optional small stop ids along the way
}

export const MAP_LOCATIONS: MapLocation[] = [
  // Starting area
  {
    id: 'riverside',
    name: 'Riverside Station',
    type: 'town',
    x: 80, y: 350,
    description: 'A small train depot by the river. Your journey begins here.',
    dangerLevel: 1,
    lootMultiplier: 0.8,
    connections: ['millfield', 'junction-7'],
  },
  // First stops
  {
    id: 'millfield',
    name: 'Millfield',
    type: 'outpost',
    x: 180, y: 280,
    description: 'An abandoned grain mill. Some supplies might remain.',
    dangerLevel: 1,
    lootMultiplier: 1.0,
    connections: ['riverside', 'greyhollow'],
  },
  {
    id: 'junction-7',
    name: 'Junction 7',
    type: 'waypoint',
    x: 180, y: 430,
    description: 'A rail junction. Tracks split north and south.',
    dangerLevel: 2,
    lootMultiplier: 0.6,
    connections: ['riverside', 'ashburn'],
  },
  // Mid locations
  {
    id: 'greyhollow',
    name: 'Greyhollow',
    type: 'city',
    x: 340, y: 220,
    description: 'A mid-sized city overtaken by the horde. Rich pickings if you survive.',
    dangerLevel: 3,
    lootMultiplier: 2.0,
    connections: ['millfield', 'ironworks', 'summit-pass'],
  },
  {
    id: 'ashburn',
    name: 'Ashburn Depot',
    type: 'town',
    x: 340, y: 450,
    description: 'Former military supply depot. Mostly picked clean.',
    dangerLevel: 2,
    lootMultiplier: 1.5,
    connections: ['junction-7', 'blackpine', 'ironworks'],
  },
  {
    id: 'ironworks',
    name: 'The Ironworks',
    type: 'outpost',
    x: 440, y: 340,
    description: 'An old steel foundry. Good source of scrap metal.',
    dangerLevel: 2,
    lootMultiplier: 1.3,
    connections: ['greyhollow', 'ashburn', 'redline-crossing'],
  },
  // Further stops
  {
    id: 'summit-pass',
    name: 'Summit Pass',
    type: 'waypoint',
    x: 500, y: 150,
    description: 'Mountain pass. Treacherous but a shortcut.',
    dangerLevel: 3,
    lootMultiplier: 0.5,
    connections: ['greyhollow', 'haven-ridge'],
  },
  {
    id: 'blackpine',
    name: 'Blackpine Forest',
    type: 'outpost',
    x: 500, y: 500,
    description: 'Dense forest surrounds the tracks. Hard to see incoming threats.',
    dangerLevel: 4,
    lootMultiplier: 1.0,
    connections: ['ashburn', 'redline-crossing'],
  },
  {
    id: 'redline-crossing',
    name: 'Redline Crossing',
    type: 'town',
    x: 600, y: 350,
    description: 'A crossroads town. Several rail lines converge here.',
    dangerLevel: 3,
    lootMultiplier: 1.5,
    connections: ['ironworks', 'blackpine', 'haven-ridge', 'deadmans-run'],
  },
  // Late game
  {
    id: 'haven-ridge',
    name: 'Haven Ridge',
    type: 'city',
    x: 720, y: 200,
    description: 'Once a thriving mountain city. The dead roam the streets.',
    dangerLevel: 4,
    lootMultiplier: 2.5,
    connections: ['summit-pass', 'redline-crossing', 'port-echo'],
  },
  {
    id: 'deadmans-run',
    name: "Dead Man's Run",
    type: 'waypoint',
    x: 750, y: 450,
    description: 'A long straight track through open wasteland. No cover.',
    dangerLevel: 4,
    lootMultiplier: 0.3,
    connections: ['redline-crossing', 'port-echo'],
  },
  // Final destination
  {
    id: 'port-echo',
    name: 'Port Echo',
    type: 'city',
    x: 900, y: 300,
    description: 'The coastal city. Rumors say boats still leave from the harbor.',
    dangerLevel: 5,
    lootMultiplier: 3.0,
    connections: ['haven-ridge', 'deadmans-run'],
  },
];

export const ROUTE_SEGMENTS: RouteSegment[] = [
  { from: 'riverside', to: 'millfield', distance: 30, waystops: [] },
  { from: 'riverside', to: 'junction-7', distance: 25, waystops: [] },
  { from: 'millfield', to: 'greyhollow', distance: 50, waystops: ['waystop-farm'] },
  { from: 'junction-7', to: 'ashburn', distance: 45, waystops: [] },
  { from: 'greyhollow', to: 'ironworks', distance: 35, waystops: [] },
  { from: 'greyhollow', to: 'summit-pass', distance: 55, waystops: ['waystop-tunnel'] },
  { from: 'ashburn', to: 'ironworks', distance: 30, waystops: [] },
  { from: 'ashburn', to: 'blackpine', distance: 50, waystops: ['waystop-creek'] },
  { from: 'ironworks', to: 'redline-crossing', distance: 45, waystops: [] },
  { from: 'summit-pass', to: 'haven-ridge', distance: 60, waystops: [] },
  { from: 'blackpine', to: 'redline-crossing', distance: 40, waystops: [] },
  { from: 'redline-crossing', to: 'haven-ridge', distance: 55, waystops: ['waystop-bridge'] },
  { from: 'redline-crossing', to: 'deadmans-run', distance: 50, waystops: [] },
  { from: 'haven-ridge', to: 'port-echo', distance: 65, waystops: ['waystop-lighthouse'] },
  { from: 'deadmans-run', to: 'port-echo', distance: 45, waystops: [] },
];

/** Waystops — small random encounter locations along routes */
export const WAYSTOP_LOCATIONS: MapLocation[] = [
  {
    id: 'waystop-farm', name: 'Abandoned Farm', type: 'waypoint',
    x: 260, y: 250, description: 'A burned-out farmstead.',
    dangerLevel: 1, lootMultiplier: 0.8, connections: [],
  },
  {
    id: 'waystop-tunnel', name: 'Rail Tunnel', type: 'waypoint',
    x: 420, y: 180, description: 'A dark tunnel through the mountains.',
    dangerLevel: 3, lootMultiplier: 0.4, connections: [],
  },
  {
    id: 'waystop-creek', name: 'Dry Creek Halt', type: 'waypoint',
    x: 420, y: 470, description: 'An old water stop. Mostly dry now.',
    dangerLevel: 2, lootMultiplier: 0.6, connections: [],
  },
  {
    id: 'waystop-bridge', name: 'Iron Bridge', type: 'waypoint',
    x: 660, y: 280, description: 'A long iron railway bridge.',
    dangerLevel: 3, lootMultiplier: 0.3, connections: [],
  },
  {
    id: 'waystop-lighthouse', name: 'Old Lighthouse', type: 'waypoint',
    x: 810, y: 250, description: 'A lighthouse visible from the tracks.',
    dangerLevel: 4, lootMultiplier: 1.0, connections: [],
  },
];

/** Get a location by id (searches both main and waystop locations). */
export function getLocation(id: string): MapLocation | undefined {
  return MAP_LOCATIONS.find(l => l.id === id) ?? WAYSTOP_LOCATIONS.find(l => l.id === id);
}

/** Get route between two locations. */
export function getRoute(fromId: string, toId: string): RouteSegment | undefined {
  return ROUTE_SEGMENTS.find(
    r => (r.from === fromId && r.to === toId) || (r.from === toId && r.to === fromId),
  );
}

/** Get all locations reachable from a given location (direct connections). */
export function getReachableLocations(fromId: string): MapLocation[] {
  const loc = MAP_LOCATIONS.find(l => l.id === fromId);
  if (!loc) return [];
  return loc.connections
    .map(id => MAP_LOCATIONS.find(l => l.id === id))
    .filter((l): l is MapLocation => l !== undefined);
}
