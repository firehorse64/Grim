/**
 * Shared material palette for the 3D game.
 * Procedural colors — no external textures needed.
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.Material>();

function mat(key: string, color: number, opts?: { emissive?: number; roughness?: number; metalness?: number }): THREE.MeshStandardMaterial {
  if (cache.has(key)) return cache.get(key) as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color,
    emissive: opts?.emissive ?? 0x000000,
    roughness: opts?.roughness ?? 0.8,
    metalness: opts?.metalness ?? 0.1,
  });
  cache.set(key, m);
  return m;
}

function flatMat(key: string, color: number): THREE.MeshBasicMaterial {
  if (cache.has(key)) return cache.get(key) as THREE.MeshBasicMaterial;
  const m = new THREE.MeshBasicMaterial({ color });
  cache.set(key, m);
  return m;
}

// Train materials
export const trainExterior = () => mat('trainExt', 0x6a7a8a, { metalness: 0.4, roughness: 0.6 });
export const trainInteriorFloor = () => mat('trainFloor', 0x5a4a3a, { roughness: 0.9 });
export const trainInteriorWall = () => mat('trainWall', 0x8a7a6a, { roughness: 0.7 });
export const trainRoof = () => mat('trainRoof', 0x4a5a6a, { metalness: 0.3, roughness: 0.5 });
export const trainConnector = () => mat('trainConn', 0x3a3a3a, { metalness: 0.5, roughness: 0.7 });
export const trainWindow = () => mat('trainWin', 0x335577, { roughness: 0.3, metalness: 0.1 });
export const trainWindowOpen = () => mat('trainWinOpen', 0x1a2a3a);
export const trainDoor = () => mat('trainDoor', 0x5a5a6a, { metalness: 0.5 });

// Furniture
export const furnitureBed = () => mat('bed', 0x4466aa);
export const furnitureCrate = () => mat('crate', 0x8a7a5a);
export const furnitureWorkbench = () => mat('workbench', 0x6a5a3a);
export const furnitureStove = () => mat('stove', 0x3a3a3a, { metalness: 0.6 });
export const furnitureBrake = () => mat('brake', 0x5a5a5a, { metalness: 0.7 });
export const furnitureFirstAid = () => mat('firstaid', 0xeeeeee);
export const furniturePlantBox = () => mat('plantbox', 0x6a4a3a);
export const furnitureMapBoard = () => mat('mapboard', 0x8a7a5a);

// Characters
export const playerBody = () => mat('playerBody', 0xccaa33);
export const playerHead = () => mat('playerHead', 0xddbb88);
export const playerLegs = () => mat('playerLegs', 0x445566);

export const zombieBody = () => mat('zombieBody', 0x556644);
export const zombieHead = () => mat('zombieHead', 0x778866);

export const npcBody = () => mat('npcBody', 0x4488aa);
export const npcHead = () => mat('npcHead', 0xddbb88);

// Environment
export const groundGrass = () => mat('grass', 0x3a5a2a, { roughness: 1.0 });
export const groundDirt = () => mat('dirt', 0x5a4a3a, { roughness: 1.0 });
export const railMetal = () => mat('rail', 0x888888, { metalness: 0.8, roughness: 0.4 });
export const railTie = () => mat('tie', 0x4a3a2a);
export const treeTrunk = () => mat('trunk', 0x5a4a3a);
export const treeLeaves = () => mat('leaves', 0x3a6a2a);
export const buildingWall = () => mat('bldgWall', 0x8a8a7a);
export const buildingRoof = () => mat('bldgRoof', 0x6a5a4a);

// Items
export const itemGlow = () => mat('itemGlow', 0xffcc44, { emissive: 0xffaa22 });

// Lights
export const lightBulb = () => mat('bulb', 0xffeeaa, { emissive: 0xffeeaa });

// Skybox
export const skyDay = () => flatMat('skyDay', 0x87CEEB);
export const skyNight = () => flatMat('skyNight', 0x1a1a3a);
export const skyDawn = () => flatMat('skyDawn', 0xdd8844);
export const skyDusk = () => flatMat('skyDusk', 0xcc6644);

// Bullet/projectile
export const bullet = () => mat('bullet', 0xffcc44, { emissive: 0xffaa22 });

// Fire
export const fire = () => mat('fire', 0xff4400, { emissive: 0xff2200 });
