import * as THREE from 'three';
import { playFlashlightSound } from './audio';

const TARGET_INTENSITY = 54;

/**
 * First-person flashlight using a single non-shadow-casting SpotLight attached to the camera.
 * Keeps visible = true at all times (animating intensity to 0 when off) so toggling never
 * triggers runtime WebGL shader recompilation stutters.
 */
export class FlashlightController {
  public readonly spotLight: THREE.SpotLight;
  public readonly target: THREE.Object3D;
  private onState = true;
  private currentIntensity = TARGET_INTENSITY;
  private flickerTimer = 0;

  constructor(camera: THREE.Camera) {
    this.spotLight = new THREE.SpotLight(
      0xf8edd6,
      TARGET_INTENSITY,
      28,
      Math.PI / 4.6,
      0.62,
      1.15,
    );
    this.spotLight.castShadow = false;
    this.spotLight.visible = true;
    this.spotLight.position.set(0.18, -0.14, -0.08);

    this.target = new THREE.Object3D();
    this.target.position.set(0, -0.04, -12);

    this.spotLight.target = this.target;
    camera.add(this.spotLight);
    camera.add(this.target);
  }

  public isOn(): boolean {
    return this.onState;
  }

  public setOn(nextOn: boolean, silent = false) {
    if (this.onState === nextOn) return;
    this.onState = nextOn;
    if (nextOn) {
      this.flickerTimer = 0.12;
      this.currentIntensity = Math.max(this.currentIntensity, TARGET_INTENSITY * 0.55);
      this.spotLight.intensity = this.currentIntensity;
    } else {
      this.currentIntensity = Math.min(this.currentIntensity, TARGET_INTENSITY * 0.25);
      this.spotLight.intensity = this.currentIntensity;
    }
    if (!silent) {
      playFlashlightSound(nextOn);
    }
  }

  public toggle(): boolean {
    this.setOn(!this.onState, false);
    return this.onState;
  }

  public reset(initialOn = true) {
    this.onState = initialOn;
    this.flickerTimer = 0;
    this.currentIntensity = initialOn ? TARGET_INTENSITY : 0;
    this.spotLight.intensity = this.currentIntensity;
  }

  public update(dt: number) {
    const goal = this.onState ? TARGET_INTENSITY : 0;
    this.currentIntensity = THREE.MathUtils.damp(
      this.currentIntensity,
      goal,
      this.onState ? 26 : 32,
      dt,
    );

    if (this.currentIntensity < 0.02 && !this.onState) {
      this.currentIntensity = 0;
    }

    if (this.onState && this.flickerTimer > 0) {
      this.flickerTimer = Math.max(0, this.flickerTimer - dt);
      const pulse = this.flickerTimer > 0.06 ? 0.52 : 1.0;
      this.spotLight.intensity = this.currentIntensity * pulse;
    } else {
      this.spotLight.intensity = this.currentIntensity;
    }
  }

  public dispose() {
    this.spotLight.parent?.remove(this.spotLight);
    this.target.parent?.remove(this.target);
    this.spotLight.dispose();
  }
}
