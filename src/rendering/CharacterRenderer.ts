/**
 * Procedural 3D character models — player, zombies, NPCs.
 * Simple box-based characters with distinct colors.
 * Feet are at local y=0 so group.position.y = surface height.
 */
import * as THREE from 'three';
import * as Mat from './Materials';

// Character part positions — feet at local y=0
const LEG_Y = 0.225;
const ARM_Y = 0.675;
const BODY_Y = 0.725;
const HEAD_Y = 1.105;

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

export interface RagdollPart {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVel: THREE.Vector3;
  life: number;
}

function createCharacter(bodyMat: THREE.Material, headMat: THREE.Material, legMat: THREE.Material): CharacterMesh {
  const group = new THREE.Group();

  // Body (torso)
  const bodyGeo = new THREE.BoxGeometry(0.4, 0.5, 0.25);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = BODY_Y;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // Head
  const headGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.y = HEAD_Y;
  headMesh.castShadow = true;
  group.add(headMesh);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.12, 0.45, 0.12);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.3, ARM_Y, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, bodyMat);
  armR.position.set(0.3, ARM_Y, 0);
  group.add(armR);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.15, 0.45, 0.15);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.1, LEG_Y, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.1, LEG_Y, 0);
  group.add(legR);

  // Don't set group.position.y — GameEngine manages positioning based on surface
  return { group, bodyMesh, headMesh, armL, armR, legL, legR, animTime: 0 };
}

export function createPlayer(): CharacterMesh {
  const char = createCharacter(Mat.playerBody(), Mat.playerHead(), Mat.playerLegs());
  // Small backpack
  const backpack = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.35, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x665533 }),
  );
  backpack.position.set(0, 0.775, -0.2);
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

/** Animate walking with legs/arms swing, or idle breathing when stationary */
export function animateWalk(char: CharacterMesh, speed: number, dt: number): void {
  if (speed < 0.01) {
    // Idle breathing
    char.animTime += dt * 1.5;
    const breathe = Math.sin(char.animTime) * 0.01;
    char.bodyMesh.position.y = BODY_Y + breathe;
    char.headMesh.position.y = HEAD_Y + breathe;
    char.legL.rotation.x *= 0.9;
    char.legR.rotation.x *= 0.9;
    char.armL.rotation.x *= 0.9;
    char.armR.rotation.x *= 0.9;
    return;
  }
  char.animTime += dt * speed * 8;
  const swing = Math.sin(char.animTime) * 0.4;
  char.legL.rotation.x = swing;
  char.legR.rotation.x = -swing;
  char.armL.rotation.x = -swing * 0.6;
  char.armR.rotation.x = swing * 0.6;
}

/** Animate a melee swing — quick arm forward-and-back */
export function animateMeleeSwing(char: CharacterMesh): void {
  const startTime = performance.now();
  const duration = 250;

  const doSwing = () => {
    const t = Math.min((performance.now() - startTime) / duration, 1);
    const swing = t < 0.4 ? t / 0.4 : (1 - t) / 0.6;
    char.armR.rotation.x = -swing * 1.8;
    char.armL.rotation.x = -swing * 0.4;
    char.bodyMesh.rotation.y = swing * 0.2;
    if (t < 1) requestAnimationFrame(doSwing);
    else {
      char.armR.rotation.x = 0;
      char.armL.rotation.x = 0;
      char.bodyMesh.rotation.y = 0;
    }
  };
  requestAnimationFrame(doSwing);
}

/** Animate zombie lurch — stumbling motion */
export function animateZombieLurch(char: CharacterMesh, dt: number): void {
  char.animTime += dt * 3;
  const lurch = Math.sin(char.animTime) * 0.15;
  char.bodyMesh.rotation.z = lurch;
  char.headMesh.rotation.z = -lurch * 0.5;
  // Shambling walk
  const swing = Math.sin(char.animTime * 0.7) * 0.3;
  char.legL.rotation.x = swing;
  char.legR.rotation.x = -swing;
  char.armL.rotation.x = 0.8 + Math.sin(char.animTime * 0.5) * 0.2;
  char.armR.rotation.x = 0.6 + Math.sin(char.animTime * 0.6) * 0.3;
}

/** Create ragdoll parts from a character, launched with a force direction */
export function createRagdoll(char: CharacterMesh, force: THREE.Vector3): RagdollPart[] {
  const parts: RagdollPart[] = [];
  const worldPos = char.group.position.clone();

  const defs: { mesh: THREE.Mesh; yOff: number }[] = [
    { mesh: char.bodyMesh, yOff: BODY_Y },
    { mesh: char.headMesh, yOff: HEAD_Y },
    { mesh: char.armL, yOff: ARM_Y },
    { mesh: char.armR, yOff: ARM_Y },
    { mesh: char.legL, yOff: LEG_Y },
    { mesh: char.legR, yOff: LEG_Y },
  ];

  for (const def of defs) {
    const clone = def.mesh.clone();
    clone.position.set(
      worldPos.x + (def.mesh.position.x || 0),
      worldPos.y + def.yOff,
      worldPos.z + (def.mesh.position.z || 0),
    );

    const vel = force.clone().multiplyScalar(0.3 + Math.random() * 0.7);
    vel.x += (Math.random() - 0.5) * 4;
    vel.y += 2 + Math.random() * 4;
    vel.z += (Math.random() - 0.5) * 4;

    const angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
    );

    parts.push({ mesh: clone, velocity: vel, angularVel: angVel, life: 2.5 });
  }
  return parts;
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
