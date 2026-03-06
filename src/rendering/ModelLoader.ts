/**
 * GLTF/GLB Model Loader — loads 3D models and caches them.
 *
 * USAGE:
 * 1. Place .glb files in public/models/
 * 2. Call ModelLoader.init() once at startup (before game starts)
 * 3. Use ModelLoader.get('player') to get a cloned model instance
 *
 * SUPPORTED MODEL SLOTS:
 *   - 'player'   → public/models/player.glb
 *   - 'zombie'   → public/models/zombie.glb
 *   - 'npc'      → public/models/npc.glb
 *
 * Each model should:
 *   - Have feet at local Y=0
 *   - Face +Z direction (forward)
 *   - Be roughly 1.3 units tall (matching current procedural characters)
 *   - Include skeletal animations named: 'idle', 'walk', 'attack', 'death' (optional)
 *
 * If a model file is missing, the system falls back to the procedural box character.
 */
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';

export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer | null;
}

interface CachedGLTF {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const MODEL_SLOTS = ['player', 'zombie', 'npc'] as const;
export type ModelSlot = typeof MODEL_SLOTS[number];

class ModelLoaderSingleton {
  private loader = new GLTFLoader();
  private cache = new Map<ModelSlot, CachedGLTF>();
  private loaded = false;

  /**
   * Pre-load all model files. Call once during init.
   * Missing files are silently skipped (procedural fallback used).
   */
  public async init(): Promise<void> {
    if (this.loaded) return;

    const promises = MODEL_SLOTS.map(async (slot) => {
      const path = `/models/${slot}.glb`;
      try {
        const gltf = await this.loadGLTF(path);
        // Ensure shadow casting
        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.cache.set(slot, {
          scene: gltf.scene,
          animations: gltf.animations,
        });
        console.log(`[ModelLoader] Loaded: ${path} (${gltf.animations.length} animations)`);
      } catch {
        // Model not found — will use procedural fallback
        console.log(`[ModelLoader] No model found at ${path}, using procedural fallback`);
      }
    });

    await Promise.all(promises);
    this.loaded = true;
  }

  /**
   * Check if a custom model is available for a slot.
   */
  public has(slot: ModelSlot): boolean {
    return this.cache.has(slot);
  }

  /**
   * Get a cloned instance of a loaded model.
   * Returns null if no model is loaded for this slot.
   */
  public get(slot: ModelSlot): LoadedModel | null {
    const cached = this.cache.get(slot);
    if (!cached) return null;

    const clonedScene = cached.scene.clone(true);

    // Deep clone materials so instances are independent
    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else {
          mesh.material = mesh.material.clone();
        }
      }
    });

    // Clone animation clips
    const clonedAnimations = cached.animations.map((clip) => clip.clone());

    // Create mixer if there are animations
    let mixer: THREE.AnimationMixer | null = null;
    if (clonedAnimations.length > 0) {
      mixer = new THREE.AnimationMixer(clonedScene);
    }

    return {
      scene: clonedScene,
      animations: clonedAnimations,
      mixer,
    };
  }

  /**
   * Get a specific animation clip by name from a loaded model.
   */
  public getAnimation(model: LoadedModel, name: string): THREE.AnimationClip | null {
    return model.animations.find((clip) => clip.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  /**
   * Play a named animation on a model. Crossfades from current animation.
   */
  public playAnimation(model: LoadedModel, name: string, options?: {
    loop?: THREE.AnimationActionLoopStyles;
    fadeTime?: number;
    timeScale?: number;
  }): THREE.AnimationAction | null {
    if (!model.mixer) return null;
    const clip = this.getAnimation(model, name);
    if (!clip) return null;

    const action = model.mixer.clipAction(clip);
    action.setLoop(options?.loop ?? THREE.LoopRepeat, Infinity);
    if (options?.timeScale !== undefined) action.timeScale = options.timeScale;

    // Crossfade: stop all others, fade in this one
    model.mixer.stopAllAction();
    action.reset();
    action.fadeIn(options?.fadeTime ?? 0.2);
    action.play();
    return action;
  }

  private loadGLTF(path: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.loader.load(path, resolve, undefined, reject);
    });
  }
}

/** Singleton instance */
export const ModelLoader = new ModelLoaderSingleton();
