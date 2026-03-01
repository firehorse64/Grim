/**
 * 3D environment: ground, rails, trees, sky, exploration buildings.
 */
import * as THREE from 'three';
import * as Mat from './Materials';
import { randomBetween, randomInt } from '../utils/MathUtils';

const GROUND_SIZE = 200;
const RAIL_LENGTH = 300;

export class EnvironmentRenderer {
  public group = new THREE.Group();
  public sky!: THREE.Mesh;
  public ground!: THREE.Mesh;
  public trees: THREE.Group[] = [];
  public explorationGroup = new THREE.Group();
  private railGroup = new THREE.Group();

  public create(): void {
    // Sky sphere
    const skyGeo = new THREE.SphereGeometry(400, 16, 16);
    skyGeo.scale(-1, 1, 1); // invert for inside
    this.sky = new THREE.Mesh(skyGeo, Mat.skyDay());
    this.group.add(this.sky);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, RAIL_LENGTH);
    this.ground = new THREE.Mesh(groundGeo, Mat.groundGrass());
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, 0, RAIL_LENGTH / 2 - 50);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);

    // Dirt strip under tracks
    const dirtGeo = new THREE.PlaneGeometry(5, RAIL_LENGTH);
    const dirt = new THREE.Mesh(dirtGeo, Mat.groundDirt());
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(0, 0.01, RAIL_LENGTH / 2 - 50);
    dirt.receiveShadow = true;
    this.group.add(dirt);

    // Rails
    this.createRails();
    this.group.add(this.railGroup);

    // Scatter trees on both sides
    this.createTrees();

    // Exploration area (initially empty)
    this.group.add(this.explorationGroup);
  }

  private createRails(): void {
    const railGeo = new THREE.BoxGeometry(0.05, 0.08, RAIL_LENGTH);
    for (const xOff of [-0.7, 0.7]) {
      const rail = new THREE.Mesh(railGeo, Mat.railMetal());
      rail.position.set(xOff, 0.04, RAIL_LENGTH / 2 - 50);
      this.railGroup.add(rail);
    }

    // Ties
    const tieGeo = new THREE.BoxGeometry(2.0, 0.06, 0.15);
    for (let z = -50; z < RAIL_LENGTH - 50; z += 0.8) {
      const tie = new THREE.Mesh(tieGeo, Mat.railTie());
      tie.position.set(0, 0.01, z);
      this.railGroup.add(tie);
    }
  }

  private createTrees(): void {
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 2.5, 6);
    const leafGeo = new THREE.SphereGeometry(0.8, 6, 6);

    for (let i = 0; i < 80; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (4 + Math.random() * 40);
      const z = randomBetween(-50, RAIL_LENGTH - 50);

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, Mat.treeTrunk());
      trunk.position.y = 1.25;
      trunk.castShadow = true;
      tree.add(trunk);

      const leaves = new THREE.Mesh(leafGeo, Mat.treeLeaves());
      leaves.position.y = 3.0;
      leaves.castShadow = true;
      tree.add(leaves);

      tree.position.set(x, 0, z);
      tree.scale.setScalar(0.8 + Math.random() * 0.6);
      this.trees.push(tree);
      this.group.add(tree);
    }
  }

  /** Scroll environment when train is "moving" (move trees/ground past camera) */
  public scrollEnvironment(scrollDelta: number): void {
    for (const tree of this.trees) {
      tree.position.z += scrollDelta;
      // Wrap trees that go too far
      if (tree.position.z > RAIL_LENGTH - 50) tree.position.z -= RAIL_LENGTH;
      if (tree.position.z < -50) tree.position.z += RAIL_LENGTH;
    }
  }

  /** Generate exploration buildings near the train at given z */
  public generateExploration(trainZ: number): THREE.Group[] {
    this.clearExploration();
    const buildings: THREE.Group[] = [];

    const numBuildings = randomInt(2, 4);
    for (let i = 0; i < numBuildings; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const bx = side * (5 + Math.random() * 15);
      const bz = trainZ + randomBetween(-10, 10);
      const bw = randomBetween(3, 6);
      const bd = randomBetween(3, 6);
      const bh = randomBetween(2.5, 4);

      const building = this.createBuilding(bw, bh, bd);
      building.position.set(bx, 0, bz);
      buildings.push(building);
      this.explorationGroup.add(building);
    }
    return buildings;
  }

  private createBuilding(w: number, h: number, d: number): THREE.Group {
    const g = new THREE.Group();
    // Walls
    const wallGeo = new THREE.BoxGeometry(w, h, d);
    const walls = new THREE.Mesh(wallGeo, Mat.buildingWall());
    walls.position.y = h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);
    // Roof
    const roofGeo = new THREE.BoxGeometry(w + 0.3, 0.15, d + 0.3);
    const roof = new THREE.Mesh(roofGeo, Mat.buildingRoof());
    roof.position.y = h + 0.08;
    roof.castShadow = true;
    g.add(roof);
    return g;
  }

  public clearExploration(): void {
    while (this.explorationGroup.children.length > 0) {
      this.explorationGroup.remove(this.explorationGroup.children[0]);
    }
  }

  /** Update sky color based on time of day */
  public setSkyPhase(phase: string): void {
    switch (phase) {
      case 'DAY': (this.sky.material as THREE.MeshBasicMaterial).color.setHex(0x87CEEB); break;
      case 'DAWN': (this.sky.material as THREE.MeshBasicMaterial).color.setHex(0xdd8844); break;
      case 'DUSK': (this.sky.material as THREE.MeshBasicMaterial).color.setHex(0xcc6644); break;
      case 'NIGHT': (this.sky.material as THREE.MeshBasicMaterial).color.setHex(0x1a1a3a); break;
    }
  }
}
