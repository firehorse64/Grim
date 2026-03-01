/**
 * Procedural 3D character models — player, zombies, NPCs.
 * Simple box-based characters with distinct colors.
 */
import * as THREE from 'three';
import * as Mat from './Materials';
import { FLOOR_Y } from './TrainRenderer';

export interface CharacterMesh {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  animTime: number;
}

function createCharacter(bodyMat: THREE.Material, headMat: THREE.Material, legMat: THREE.Material): CharacterMesh {
  const group = new THREE.Group();

  // Body (torso)
  const bodyGeo = new THREE.BoxGeometry(0.4, 0.5, 0.25);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.95;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // Head
  const headGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.y = 1.33;
  headMesh.castShadow = true;
  group.add(headMesh);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.12, 0.45, 0.12);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.3, 0.9, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, bodyMat);
  armR.position.set(0.3, 0.9, 0);
  group.add(armR);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.15, 0.45, 0.15);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.1, 0.45, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.1, 0.45, 0);
  group.add(legR);

  // Position above floor
  group.position.y = FLOOR_Y;

  return { group, bodyMesh, headMesh, armL, armR, legL, legR, animTime: 0 };
}

export function createPlayer(): CharacterMesh {
  const char = createCharacter(Mat.playerBody(), Mat.playerHead(), Mat.playerLegs());
  // Add a small backpack
  const backpack = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.35, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x665533 }),
  );
  backpack.position.set(0, 1.0, -0.2);
  char.group.add(backpack);
  return char;
}

export function createZombie(): CharacterMesh {
  const char = createCharacter(Mat.zombieBody(), Mat.zombieHead(), Mat.zombieBody());
  // Slightly hunched
  char.bodyMesh.rotation.x = 0.2;
  char.headMesh.rotation.x = 0.15;
  return char;
}

export function createNPC(): CharacterMesh {
  return createCharacter(Mat.npcBody(), Mat.npcHead(), Mat.playerLegs());
}

/** Animate walking legs/arms */
export function animateWalk(char: CharacterMesh, speed: number, dt: number): void {
  if (speed < 0.01) {
    // Idle
    char.legL.rotation.x = 0;
    char.legR.rotation.x = 0;
    char.armL.rotation.x = 0;
    char.armR.rotation.x = 0;
    return;
  }
  char.animTime += dt * speed * 8;
  const swing = Math.sin(char.animTime) * 0.4;
  char.legL.rotation.x = swing;
  char.legR.rotation.x = -swing;
  char.armL.rotation.x = -swing * 0.6;
  char.armR.rotation.x = swing * 0.6;
}

/** Create a bullet mesh */
export function createBullet(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.05, 4, 4);
  const mesh = new THREE.Mesh(geo, Mat.bullet());
  mesh.castShadow = false;
  return mesh;
}

/** Create a pickup item mesh */
export function createPickupMesh(type: string): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const mat = type === 'food'
    ? new THREE.MeshStandardMaterial({ color: 0x44aa44, emissive: 0x224422 })
    : type === 'medicine'
    ? new THREE.MeshStandardMaterial({ color: 0xaa4444, emissive: 0x442222 })
    : new THREE.MeshStandardMaterial({ color: 0xaaaa44, emissive: 0x444422 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}
