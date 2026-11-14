import * as THREE from 'three';
import type { InteractPrompt } from './types';

export type InteractableKind = 'door' | 'exit' | 'key' | 'note' | 'examinable';

export interface InteractableEntry {
  id: string;
  kind: InteractableKind;
  object: THREE.Object3D;
  maxDistance: number;
  enabled: () => boolean;
  getPrompt: () => InteractPrompt;
  onInteract: () => void;
}

const CENTER_NDC = new THREE.Vector2(0, 0);
const MAX_RAYCAST_FAR = 3.2;

/**
 * Unified first-person raycast interaction system.
 * Evaluates all registered interactables against wall/closed-door occlusion meshes
 * so objects cannot be targeted or activated through walls.
 */
export class InteractionSystem {
  private readonly raycaster = new THREE.Raycaster();
  private readonly entries = new Map<string, InteractableEntry>();
  private readonly occlusionMeshes: THREE.Object3D[] = [];
  private activeTarget: InteractableEntry | null = null;

  constructor() {
    this.raycaster.near = 0.05;
    this.raycaster.far = MAX_RAYCAST_FAR;
  }

  public registerInteractable(entry: InteractableEntry) {
    entry.object.userData.interactId = entry.id;
    entry.object.traverse((child) => {
      child.userData.interactId = entry.id;
    });
    this.entries.set(entry.id, entry);
  }

  public addOcclusionMeshes(meshes: readonly THREE.Object3D[]) {
    for (let i = 0; i < meshes.length; i++) {
      this.occlusionMeshes.push(meshes[i]);
    }
  }

  public evaluate(camera: THREE.Camera): InteractPrompt {
    const candidates: THREE.Object3D[] = [];
    for (const entry of this.entries.values()) {
      if (entry.enabled() && entry.object.visible) {
        candidates.push(entry.object);
      }
    }

    if (candidates.length === 0) {
      this.activeTarget = null;
      return { visible: false, keyLabel: 'E', text: '' };
    }

    for (let i = 0; i < this.occlusionMeshes.length; i++) {
      candidates.push(this.occlusionMeshes[i]);
    }

    this.raycaster.setFromCamera(CENTER_NDC, camera);
    const hits = this.raycaster.intersectObjects(candidates, true);

    if (hits.length === 0) {
      this.activeTarget = null;
      return { visible: false, keyLabel: 'E', text: '' };
    }

    // Closest hit determines visibility: if a wall/occluder is closest, target behind it is blocked.
    const firstHit = hits[0];
    const hitId = firstHit.object.userData.interactId as string | undefined;
    if (!hitId) {
      this.activeTarget = null;
      return { visible: false, keyLabel: 'E', text: '' };
    }

    const entry = this.entries.get(hitId);
    if (!entry || !entry.enabled() || firstHit.distance > entry.maxDistance) {
      this.activeTarget = null;
      return { visible: false, keyLabel: 'E', text: '' };
    }

    this.activeTarget = entry;
    return entry.getPrompt();
  }

  public triggerActive(): boolean {
    if (!this.activeTarget || !this.activeTarget.enabled()) {
      return false;
    }
    this.activeTarget.onInteract();
    return true;
  }

  public clearActive() {
    this.activeTarget = null;
  }
}
