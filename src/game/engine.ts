import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CollectiblesSystem } from './collectibles';
import type { DoorSystem } from './doors';
import { FlashlightController } from './flashlight';
import { InteractionSystem } from './interactions';
import { InventoryManager } from './inventory';
import { buildAbandonedBuilding } from './level';
import { clampDelta } from './physics';
import { FirstPersonController } from './player';
import { createBuildingTextures } from './textures';
import type {
  GameEngineCallbacks,
  GameStatus,
  HudNotification,
  InteractPrompt,
} from './types';

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

const EMPTY_PROMPT: InteractPrompt = { visible: false, keyLabel: 'E', text: '' };

export class HorrorGameEngine {
  private container: HTMLElement;
  private callbacks: GameEngineCallbacks;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controller!: FirstPersonController;
  private doorSystem!: DoorSystem;
  private collectibles!: CollectiblesSystem;
  private flashlight!: FlashlightController;
  private interactions!: InteractionSystem;
  private inventory = new InventoryManager();
  private isSoftwareGl = false;

  private status: GameStatus = 'title';
  private frameId = 0;
  private lastTimestamp = 0;
  private elapsed = 0;
  private disposed = false;

  private disposeLevel = () => {};
  private disposeTextures = () => {};
  private envRT: THREE.WebGLRenderTarget | null = null;
  private dustPoints: THREE.Points | null = null;
  private dustGeo: THREE.BufferGeometry | null = null;
  private dustMat: THREE.PointsMaterial | null = null;
  private dustPositions!: Float32Array;
  private dustCount = 150;
  private flickerFixtures: ReturnType<typeof buildAbandonedBuilding>['flickerFixtures'] = [];
  private colliders: ReturnType<typeof buildAbandonedBuilding>['colliders'] = [];
  private spawnPosition = new THREE.Vector3(0, 0, 15.2);
  private spawnYaw = 0;

  private notificationSeq = 0;
  private activeNotification: HudNotification | null = null;
  private notificationTimer = 0;

  private lastHudBroadcast = 0;
  private lastZone = '';
  private lastExhausted = false;
  private lastLocked = false;
  private lastFlashlightOn = true;
  private lastKeysCollected = 0;
  private lastExitUnlocked = false;
  private lastNotificationId = 0;
  private lastPromptText = '';
  private lastPromptVisible = false;
  private staminaBarEl: HTMLElement | null = null;

  constructor(container: HTMLElement, callbacks: GameEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.init();
  }

  public setStaminaBarElement(el: HTMLElement | null) {
    this.staminaBarEl = el;
  }

  private pushNotification(
    text: string,
    tone: HudNotification['tone'] = 'neutral',
    duration = 3.6,
  ) {
    this.notificationSeq += 1;
    this.activeNotification = {
      id: this.notificationSeq,
      text,
      tone,
    };
    this.notificationTimer = duration;
    this.broadcastHud(true);
  }

  public setStatus(nextStatus: GameStatus, resetRun = false) {
    const prevStatus = this.status;
    this.status = nextStatus;

    if (resetRun) {
      this.inventory.reset();
      this.collectibles.reset();
      this.doorSystem.reset();
      this.interactions.clearActive();
      this.activeNotification = null;
      this.notificationTimer = 0;
      this.controller.reset(this.spawnPosition, this.spawnYaw);
      this.flashlight.reset(nextStatus === 'playing');
      this.updateStaminaDom(100, false);
    }

    if (nextStatus === 'playing') {
      this.controller.setActive(true);
      if (prevStatus === 'title' || resetRun) {
        this.flashlight.reset(true);
        this.controller.update(0, this.camera, this.colliders);
      }
      const prompt = this.interactions.evaluate(this.camera);
      this.broadcastHud(true, 'Recepción', prompt);
    } else {
      this.controller.setActive(false);
      if (nextStatus === 'title') {
        this.flashlight.reset(false);
      }
    }
  }

  public requestPointerLock() {
    this.controller.requestPointerLock();
  }

  private init() {
    this.isSoftwareGl = detectSoftwareWebGL();

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      this.callbacks.onWebglError(
        'No se pudo inicializar WebGL en este navegador.',
      );
      return;
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 0.75 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'game-canvas');
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x050608);
    this.scene.background = bgColor;
    this.scene.fog = new THREE.FogExp2(0x050608, 0.036);

    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 65);
    this.scene.add(this.camera);

    this.flashlight = new FlashlightController(this.camera);
    this.flashlight.reset(false);

    this.interactions = new InteractionSystem();

    // Procedural studio environment reflections (attenuated for dim horror atmosphere)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.24;
    roomEnv.dispose();
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0x283a4d, 0x0a0908, 0.24);
    this.scene.add(hemi);

    const keyDir = new THREE.DirectionalLight(0xffcfa0, 0.12);
    keyDir.position.set(4, 10, 8);
    if (!this.isSoftwareGl) {
      keyDir.castShadow = true;
      keyDir.shadow.mapSize.set(1024, 1024);
      keyDir.shadow.camera.near = 1;
      keyDir.shadow.camera.far = 42;
      keyDir.shadow.camera.left = -16;
      keyDir.shadow.camera.right = 16;
      keyDir.shadow.camera.top = 20;
      keyDir.shadow.camera.bottom = -22;
      keyDir.shadow.bias = -0.0005;
      keyDir.shadow.normalBias = 0.02;
    }
    this.scene.add(keyDir);

    const textures = createBuildingTextures(
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.disposeTextures = textures.dispose;

    const level = buildAbandonedBuilding(
      textures,
      !this.isSoftwareGl,
      this.interactions,
      {
        onCollectKey: (key) => {
          const result = this.inventory.collectKey(key.id);
          if (result.added) {
            const msg = result.hasAllKeys
              ? `Recogiste ${key.name} (${result.count}/${this.inventory.totalKeys}). ¡Tienes todas las llaves! Regresa a la salida.`
              : `Recogiste ${key.name} (${result.count}/${this.inventory.totalKeys}).`;
            this.pushNotification(msg, 'key', 4.4);
          }
        },
        onOpenNote: (note) => {
          this.callbacks.onOpenNote(note);
        },
        onExamine: (item) => {
          this.pushNotification(item.description, 'neutral', 4.4);
        },
      },
    );
    this.scene.add(level.group);
    this.colliders = level.colliders;
    this.doorSystem = level.doorSystem;
    this.collectibles = level.collectibles;
    this.flickerFixtures = level.flickerFixtures;
    this.spawnPosition.copy(level.spawnPosition);
    this.spawnYaw = level.spawnYaw;
    this.disposeLevel = level.dispose;

    this.interactions.addOcclusionMeshes(level.occlusionMeshes);

    this.controller = new FirstPersonController(
      this.renderer.domElement,
      () => this.broadcastHud(true),
    );
    this.controller.reset(this.spawnPosition, this.spawnYaw);

    this.doorSystem.registerInteractions(
      this.interactions,
      this.controller.position,
      (msg, tone = 'neutral') => this.pushNotification(msg, tone, 2.8),
      {
        canUnlock: () => this.inventory.canUnlockExit(),
        onLockedAttempt: () => {
          this.pushNotification(
            'La puerta está cerrada. Necesitas encontrar las tres llaves.',
            'alert',
            3.6,
          );
        },
        onUnlockSuccess: () => {
          this.inventory.unlockExit();
          this.pushNotification(
            'Has desbloqueado la puerta principal de salida.',
            'key',
            4.5,
          );
        },
      },
    );

    this.initDustMotes();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.onContextRestored,
    );
    window.addEventListener('resize', this.onResize);

    this.lastTimestamp = performance.now();
    this.scheduleNextFrame();
  }

  private initDustMotes() {
    this.dustPositions = new Float32Array(this.dustCount * 3);
    for (let i = 0; i < this.dustCount; i++) {
      this.dustPositions[i * 3 + 0] = (Math.random() - 0.5) * 26;
      this.dustPositions[i * 3 + 1] = 0.25 + Math.random() * 3.1;
      this.dustPositions[i * 3 + 2] = -21 + Math.random() * 38;
    }
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.dustPositions, 3),
    );
    this.dustMat = new THREE.PointsMaterial({
      color: 0xc2c8cc,
      size: 0.035,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(this.dustGeo, this.dustMat);
    this.scene.add(this.dustPoints);
  }

  private updateAtmosphere(dt: number) {
    this.elapsed += dt;

    for (let i = 0; i < this.flickerFixtures.length; i++) {
      const f = this.flickerFixtures[i];
      const wave =
        Math.sin(this.elapsed * f.flickerSpeed + f.phase) *
        Math.sin(this.elapsed * (f.flickerSpeed * 2.3) + f.phase * 1.7);
      const drop = wave > 0.82 ? 0.36 : 1.0 - Math.max(0, wave) * 0.14;
      f.light.intensity = f.baseIntensity * drop;
      f.bulbMat.emissiveIntensity = 1.35 * drop;
    }

    if (this.dustGeo) {
      const attr = this.dustGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < this.dustCount; i++) {
        let y = this.dustPositions[i * 3 + 1];
        y += Math.sin(this.elapsed * 0.6 + i) * 0.08 * dt;
        if (y > 3.4) y = 0.3;
        if (y < 0.2) y = 3.2;
        this.dustPositions[i * 3 + 1] = y;
      }
      attr.needsUpdate = true;
    }
  }

  private updateTitleCamera() {
    const swayX = Math.sin(this.elapsed * 0.22) * 0.9;
    const swayZ = 15.8 + Math.cos(this.elapsed * 0.18) * 0.55;
    const swayY = 1.68 + Math.sin(this.elapsed * 0.4) * 0.04;
    this.camera.position.set(swayX, swayY, swayZ);
    this.camera.lookAt(Math.sin(this.elapsed * 0.14) * 0.4, 1.48, -6.0);
  }

  private updateStaminaDom(value: number, exhausted: boolean) {
    if (!this.staminaBarEl) return;
    const ratio = Math.max(0, Math.min(1, value / 100));
    this.staminaBarEl.style.transform = `scaleX(${ratio.toFixed(4)})`;
    this.staminaBarEl.style.backgroundColor = exhausted
      ? '#b91c1c'
      : value < 30
        ? '#d97706'
        : '#d6d3cd';
  }

  private broadcastHud(
    force = false,
    zoneName?: string,
    prompt?: InteractPrompt,
  ) {
    const now = performance.now();
    const zone = zoneName ?? this.lastZone;
    const exhausted = this.controller.stamina.exhausted;
    const locked = this.controller.pointerLocked;
    const flashlightOn = this.flashlight.isOn();
    const inv = this.inventory.getSnapshot();
    const notifId = this.activeNotification?.id ?? 0;
    const activePrompt = prompt ?? EMPTY_PROMPT;

    const changedDiscrete =
      zone !== this.lastZone ||
      exhausted !== this.lastExhausted ||
      locked !== this.lastLocked ||
      flashlightOn !== this.lastFlashlightOn ||
      inv.keysCollected !== this.lastKeysCollected ||
      inv.exitUnlocked !== this.lastExitUnlocked ||
      notifId !== this.lastNotificationId ||
      activePrompt.visible !== this.lastPromptVisible ||
      activePrompt.text !== this.lastPromptText;

    if (!force && !changedDiscrete && now - this.lastHudBroadcast < 120) {
      return;
    }

    this.lastHudBroadcast = now;
    this.lastZone = zone;
    this.lastExhausted = exhausted;
    this.lastLocked = locked;
    this.lastFlashlightOn = flashlightOn;
    this.lastKeysCollected = inv.keysCollected;
    this.lastExitUnlocked = inv.exitUnlocked;
    this.lastNotificationId = notifId;
    this.lastPromptVisible = activePrompt.visible;
    this.lastPromptText = activePrompt.text;

    this.callbacks.onHudUpdate({
      stamina: Math.round(this.controller.stamina.value),
      exhausted,
      isSprinting: this.controller.isSprinting,
      pointerLocked: locked,
      zoneName: zone || 'Recepción',
      flashlightOn,
      keysCollected: inv.keysCollected,
      totalKeys: inv.totalKeys,
      objectiveText: inv.objectiveText,
      exitUnlocked: inv.exitUnlocked,
      prompt: activePrompt,
      notification: this.activeNotification,
    });
  }

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = clampDelta(rawDt);

    if (this.status === 'title') {
      this.updateAtmosphere(dt);
      this.updateTitleCamera();
    } else if (this.status === 'playing') {
      this.updateAtmosphere(dt);
      this.collectibles.update(this.elapsed);

      if (this.notificationTimer > 0) {
        this.notificationTimer = Math.max(0, this.notificationTimer - dt);
        if (this.notificationTimer === 0) {
          this.activeNotification = null;
        }
      }

      const { zoneName } = this.controller.update(
        dt,
        this.camera,
        this.colliders,
      );

      if (this.controller.consumeFlashlightPressed()) {
        this.flashlight.toggle();
      }
      this.flashlight.update(dt);

      // Update camera world matrix before raycasting for exact same-frame targeting
      this.camera.updateMatrixWorld();
      let prompt = this.interactions.evaluate(this.camera);

      if (this.controller.consumeInteractPressed()) {
        if (this.interactions.triggerActive()) {
          prompt = this.interactions.evaluate(this.camera);
        }
      }
      this.doorSystem.update(dt);

      this.updateStaminaDom(
        this.controller.stamina.value,
        this.controller.stamina.exhausted,
      );
      this.broadcastHud(false, zoneName, prompt);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private scheduleNextFrame() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(this.tick, 16);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private onResize = () => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 0.75 : Math.min(window.devicePixelRatio || 1, 2),
    );
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  };

  private onContextRestored = () => {
    this.lastTimestamp = performance.now();
    this.scheduleNextFrame();
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.onResize);
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener(
        'webglcontextlost',
        this.onContextLost,
      );
      this.renderer.domElement.removeEventListener(
        'webglcontextrestored',
        this.onContextRestored,
      );
    }
    this.controller?.dispose();
    this.flashlight?.dispose();
    this.dustGeo?.dispose();
    this.dustMat?.dispose();
    this.envRT?.dispose();
    this.disposeLevel();
    this.disposeTextures();
    this.renderer?.dispose();
    if (this.renderer?.domElement?.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
