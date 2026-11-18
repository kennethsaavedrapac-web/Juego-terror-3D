import {
  FinalSequence,
  FACTORY_Z,
  FINAL_TRIGGER_Z,
  computeFinalChaseSpeed,
  smooth,
  getFinalChaseMetrics,
} from './finalSequence';
import { buildFinalEnvironment, finalColliders } from './finalEnvironment';
import { FinalAudio } from './finalAudio';
import {
  playDoorSound,
  setAudioSettings,
  startHeavyIronOpeningLoop,
  stopHeavyIronOpeningLoop,
} from './audio';
import { createPhase4QA } from './phase4QA';
import { Watcher, resolveWatcherBodyCollision } from './watcher';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CollectiblesSystem } from './collectibles';
import type { DoorSystem } from './doors';
import { floorHeightAt } from './expansion';
import { FlashlightController } from './flashlight';
import { InteractionSystem } from './interactions';
import { InventoryManager } from './inventory';
import { JumpscareSystem } from './jumpscares';
import { buildAbandonedBuilding } from './level';
import { PLAYER_RADIUS, clampDelta, resolveCircleAABB } from './physics';
import { FirstPersonController } from './player';
import { SpatialAudioEngine } from './spatialAudio';
import { SupernaturalEventsSystem } from './supernatural';
import { TensionSystem } from './tension';
import { createBuildingTextures } from './textures';
import type {
  AccessibilitySettings,
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
const CAUGHT_STAGE_DURATION = 0.22;
const ATTACK_DURATION = 1.5;

export class HorrorGameEngine {
  private qaFinalPanel?: HTMLElement;
  private qaAutoRun = false;
  private buildingGroup?: THREE.Group;
  private final = new FinalSequence();
  private finalSet!: ReturnType<typeof buildFinalEnvironment>;
  private finalAudio = new FinalAudio();
  private revealStart = new THREE.Quaternion();
  private revealTarget = new THREE.Quaternion().setFromEuler(new THREE.Euler(.5,0,0,'YXZ'));
  private container: HTMLElement;
  private callbacks: GameEngineCallbacks;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private fog!: THREE.FogExp2;
  private hemiLight!: THREE.HemisphereLight;
  private controller!: FirstPersonController;
  private doorSystem!: DoorSystem;
  private collectibles!: CollectiblesSystem;
  private flashlight!: FlashlightController;
  private watcher!: Watcher;
  private interactions!: InteractionSystem;
  private inventory = new InventoryManager();

  // Phase 5 systems
  private tension = new TensionSystem();
  private spatialAudio = new SpatialAudioEngine();
  private supernatural = new SupernaturalEventsSystem();
  private jumpscares = new JumpscareSystem();
  private settings: AccessibilitySettings = {
    reducedCameraMotion: false,
    disableFlashes: false,
  };

  private isSoftwareGl = false;
  private qa?: ReturnType<typeof createPhase4QA>;

  private status: GameStatus = 'title';
  private frameId = 0;
  private lastTimestamp = 0;
  private elapsed = 0;
  private disposed = false;

  private attackSequenceActive = false;
  private attackElapsed = 0;
  private screamerPeakTriggered = false;
  private finalChaseElapsed = 0;
  private cameraTrauma = 0;
  private growlTimer = 8;
  private exhaleTimer = 1.8;
  private preAttackTimer = 0;
  private readonly prevPlayerPos = new THREE.Vector3(0, 0, 15.2);
  private readonly finalFogColor = new THREE.Color(0x140507);
  private readonly factoryFogColor = new THREE.Color(0x101d28);

  private disposeLevel = () => {};
  private disposeTextures = () => {};
  private envRT: THREE.WebGLRenderTarget | null = null;
  private dustPoints: THREE.Points | null = null;
  private dustGeo: THREE.BufferGeometry | null = null;
  private dustMat: THREE.PointsMaterial | null = null;
  private dustPositions!: Float32Array;
  private dustCount = 160;
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
  private vignetteEl: HTMLElement | null = null;
  private interferenceEl: HTMLElement | null = null;
  private blackoutEl: HTMLElement | null = null;

  private readonly lookQuatTarget = new THREE.Quaternion();
  private readonly lookMatrix = new THREE.Matrix4();
  private readonly lookTargetVec = new THREE.Vector3();
  private readonly upVec = new THREE.Vector3(0, 1, 0);

  constructor(container: HTMLElement, callbacks: GameEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.init();
  }

  public setStaminaBarElement(el: HTMLElement | null) {
    this.staminaBarEl = el;
  }

  public setVignetteElement(el: HTMLElement | null) {
    this.vignetteEl = el;
  }

  public setDeathOverlayElements(
    interferenceEl: HTMLElement | null,
    blackoutEl: HTMLElement | null,
  ) {
    this.interferenceEl = interferenceEl;
    this.blackoutEl = blackoutEl;
  }

  public setAccessibilitySettings(next: AccessibilitySettings) {
    this.settings = { ...next };
    setAudioSettings(next.audioVolume, next.audioMuted);
  }

  private updateDeathOverlayDom(interferenceOpacity: number, blackoutOpacity: number) {
    if (this.interferenceEl) {
      this.interferenceEl.style.opacity = interferenceOpacity.toFixed(3);
    }
    if (this.blackoutEl) {
      this.blackoutEl.style.opacity = blackoutOpacity.toFixed(3);
    }
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
      const checkpoint = nextStatus === 'playing' && this.final.checkpoint && (prevStatus === 'gameover' || prevStatus === 'paused');
      this.final.reset(checkpoint);
      this.finalChaseElapsed = 0;
      this.qaAutoRun=false;
      if(this.buildingGroup)this.buildingGroup.visible=true;
      this.finalAudio.stop();
      stopHeavyIronOpeningLoop();
      this.callbacks.onFinalStage?.('PLAYING');
      this.finalSet.update(-22,0,false,true);
      this.camera.far=240;
      this.fog.density=.036; this.fog.color.setHex(0x050608);
      this.attackSequenceActive = false;
      this.attackElapsed = 0;
      this.screamerPeakTriggered = false;
      this.cameraTrauma = 0;
      this.growlTimer = 8;
      this.exhaleTimer = 1.8;
      this.preAttackTimer = 0;
      this.spatialAudio.stopDeathAmbience();
      this.watcher.reset();
      this.tension.reset();
      this.supernatural.reset();
      this.jumpscares.reset();
      if(checkpoint) this.inventory.relockExit();
      else { this.inventory.reset(); this.collectibles.reset(); }
      this.doorSystem.reset();
      this.interactions.clearActive();
      this.activeNotification = null;
      this.notificationTimer = 0;
      this.controller.reset(checkpoint ? new THREE.Vector3(0,0,-19.2) : this.spawnPosition, checkpoint ? 0 : this.spawnYaw);
      this.prevPlayerPos.copy(this.controller.position);
      this.camera.fov = 70;
      this.camera.updateProjectionMatrix();
      this.flashlight.reset(nextStatus === 'playing');
      this.updateStaminaDom(100, false);
      this.updateVignetteDom(0.08, false);
      this.updateDeathOverlayDom(0, 0);
    }

    if (nextStatus === 'ending') {
      stopHeavyIronOpeningLoop();
      this.controller.setActive(false);
      return;
    }
    if (nextStatus === 'paused' || nextStatus === 'gameover') {
      this.finalAudio.stop();
      stopHeavyIronOpeningLoop();
      if (nextStatus === 'paused') {
        this.spatialAudio.stopScreamer();
      }
    }
    if (nextStatus === 'playing') {
      if (prevStatus === 'paused' && this.final.stage !== 'PLAYING') this.finalAudio.setStage(this.final.stage);
      this.spatialAudio.stopDeathAmbience();
      this.controller.setActive(!this.attackSequenceActive);
      if (prevStatus === 'title' || prevStatus === 'restarting' || resetRun) {
        this.flashlight.reset(true);
        this.controller.update(0, this.camera, this.colliders);
        this.prevPlayerPos.copy(this.controller.position);
        this.scene.updateMatrixWorld(true);
        this.renderer.render(this.scene, this.camera);
      }
      const prompt = this.interactions.evaluate(this.camera);
      this.broadcastHud(true, 'Recepción', prompt);
    } else if (nextStatus === 'caught' || nextStatus === 'death_animation') {
      this.controller.setActive(false);
    } else {
      this.controller.setActive(false);
      if (nextStatus !== 'gameover') {
        this.spatialAudio.stopDeathAmbience();
        this.spatialAudio.update({
          dt: 0,
          elapsed: this.elapsed,
          active: false,
          camera: this.camera,
          watcherActive: false,
          watcherPos: this.watcher.position,
          watcherState: this.watcher.state,
          tensionLevel: 1,
          tensionIntensity: 0,
          exhausted: false,
          colliders: this.colliders,
        });
      }
      if (nextStatus === 'title') {
        this.flashlight.reset(false);
        this.updateDeathOverlayDom(0, 0);
        if (resetRun) {
          this.updateTitleCamera();
          this.scene.updateMatrixWorld(true);
          this.renderer.render(this.scene, this.camera);
        }
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

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
    this.fog = new THREE.FogExp2(0x050608, 0.036);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 240);
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

    this.hemiLight = new THREE.HemisphereLight(0x283a4d, 0x0a0908, 0.24);
    this.scene.add(this.hemiLight);

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
            this.tension.addEventSpike(0.18);
            const msg = result.hasAllKeys
              ? `Recogiste ${key.name} (${result.count}/${this.inventory.totalKeys}). ¡Tienes todas las llaves! Regresa a la salida.`
              : `Recogiste ${key.name} (${result.count}/${this.inventory.totalKeys}).`;
            this.pushNotification(msg, 'key', 4.4);
          }
        },
        onOpenNote: (note) => {
          this.setStatus('reading');
          this.callbacks.onOpenNote(note);
        },
        onExamine: (item) => {
          this.pushNotification(item.description, 'neutral', 4.4);
        },
      },
      (material, action, pos) => {
        if (material === 'heavy_iron') {
          if (action === 'open_start') {
            playDoorSound('heavy_iron', 'open_start');
            startHeavyIronOpeningLoop();
            if (!this.settings.reducedCameraMotion) {
              this.cameraTrauma = Math.max(this.cameraTrauma, 0.16);
            }
          } else if (action === 'open_end') {
            stopHeavyIronOpeningLoop();
            playDoorSound('heavy_iron', 'open_end');
            if (!this.settings.reducedCameraMotion) {
              this.cameraTrauma = Math.max(this.cameraTrauma, 0.24);
            }
          } else {
            playDoorSound('heavy_iron', action);
          }
          return;
        }
        this.spatialAudio.playSpatialDoorSound(
          pos,
          this.controller.position,
          this.colliders,
          material,
          action,
        );
      },
    );
    this.scene.add(level.group);
    this.buildingGroup=level.group;
    this.finalSet = buildFinalEnvironment(textures);
    this.scene.add(this.finalSet.group);
    this.colliders = [...level.colliders, ...finalColliders()];
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
          this.final.unlock(this.inventory.canUnlockExit());
          this.watcher.reset();
          this.spatialAudio.update({dt:0,elapsed:this.elapsed,active:false,camera:this.camera,watcherActive:false,watcherPos:this.watcher.position,watcherState:this.watcher.state,tensionLevel:1,tensionIntensity:0,exhausted:false,colliders:this.colliders});
          this.finalAudio.setStage(this.final.stage);
          this.callbacks.onFinalStage?.(this.final.stage);
          this.pushNotification(
            'ESCAPA · Mantén Shift para correr. La salida está al fondo.',
            'key',
            4.5,
          );
        },
      },
    );

    const enemyOccluders = [...level.occlusionMeshes];
    this.doorSystem.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (
        mesh.isMesh &&
        (Array.isArray(mesh.material)
          ? mesh.material.every((m) => !m.transparent)
          : !mesh.material.transparent)
      ) {
        enemyOccluders.push(child);
      }
    });

    this.watcher = new Watcher(
      this.colliders,
      enemyOccluders,
      () => {
        // Trigger 4-stage cinematic capture -> death_animation -> gameover (single trigger guard)
        if (
          this.final.stage === 'FINAL_FACTORY_REVEAL' || this.final.stage === 'TO_BE_CONTINUED' || this.final.stage === 'END_CREDITS' || this.final.stage === 'END_COMPLETE' ||
          this.attackSequenceActive ||
          this.status === 'caught' ||
          this.status === 'death_animation' ||
          this.status === 'gameover'
        ) {
          return;
        }
        this.finalAudio.duckForScreamer();
        this.finalAudio.stop();
        stopHeavyIronOpeningLoop();
        this.attackSequenceActive = true;
        this.attackElapsed = 0;
        this.screamerPeakTriggered = false;
        this.status = 'caught';
        this.controller.setActive(false);
        this.interactions.clearActive();
        this.cameraTrauma = 0.92;
        this.watcher.animateAttack(0.05, 0.08, this.controller.position);
        this.spatialAudio.playDeathSequenceAudio(this.settings.disableFlashes);
        this.callbacks.onCaught();
        console.info('[Watcher] Ataque / Captura', {
          keys: this.inventory.getSnapshot().keysCollected,
        });
      },
      () =>
        this.pushNotification(
          'No dejes de mirarlo. Si apartas la mirada, se acerca.',
          'alert',
          6,
        ),
      {
        onFootstep: (intensity, isRunning, pos) => {
          if (this.status === 'playing' && !this.attackSequenceActive) {
            this.spatialAudio.playMonsterFootstep(
              pos,
              this.controller.position,
              this.colliders,
              intensity,
              isRunning,
              this.final.chasing,
            );
            if (this.final.chasing && isRunning && !this.settings.reducedCameraMotion) {
              const dist = Math.hypot(
                pos.x - this.controller.position.x,
                pos.z - this.controller.position.z,
              );
              if (dist < 16) {
                this.cameraTrauma = Math.max(this.cameraTrauma, (1 - dist / 16) * 0.16);
              }
            }
          }
        },
        onStateChange: (prev, next) => {
          if (this.status !== 'playing') return;
          if (next === 'CHASE' && prev !== 'CHASE') {
            this.spatialAudio.playMonsterGrowl(
              this.watcher.position,
              this.controller.position,
              this.colliders,
              true,
            );
          } else if (next === 'STALK' && prev === 'FROZEN') {
            this.spatialAudio.playLimbCreak(
              this.watcher.position,
              this.controller.position,
              this.colliders,
            );
          }
        },
      },
    );
    this.scene.add(this.watcher.model.root);
    this.scene.add(this.jumpscares.group);

    if (import.meta.env.DEV && new URLSearchParams(location.search).get('qa') === '1') {
      const panel=document.createElement('aside');
      panel.style.cssText='position:fixed;left:12px;top:90px;z-index:60;background:#15232e;padding:8px;color:white;font:12px monospace';
      panel.setAttribute('aria-label','Pruebas fase 7');
      const add=(label:string,action:()=>void)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:8px;border:1px solid #647b7b;margin:2px';b.onclick=action;panel.append(b);};
      add('Preparar salida (3 llaves)',()=>{
        this.setStatus('playing',true);
        for(const id of ['key-recepcion','key-oficina','key-almacen'])this.inventory.collectKey(id);
        this.controller.reset(new THREE.Vector3(0,0,-19.2),0);
        this.controller.update(0,this.camera,this.colliders);this.scene.updateMatrixWorld(true);
        this.broadcastHud(true,'Salida',this.interactions.evaluate(this.camera));
      });
      add('Correr recorrido QA',()=>{this.qaAutoRun=true;});
      add('Detener carrera QA',()=>{this.qaAutoRun=false;this.controller.setQAForward(false);});
      document.body.append(panel);this.qaFinalPanel=panel;
      this.qa = createPhase4QA(
        (x, z, yaw, enemy) => {
          this.attackSequenceActive = false;
          this.attackElapsed = 0;
          this.watcher.reset();
          this.controller.reset(new THREE.Vector3(x, 0, z), yaw);
          this.controller.update(0, this.camera, this.colliders);
          this.prevPlayerPos.copy(this.controller.position);
          if (enemy) {
            this.watcher.active = true;
            this.watcher.model.root.visible = true;
            this.watcher.position.set(0, 0, -3);
            this.watcher.model.root.rotation.y = Math.PI;
          }
        },
        () => {
          this.controller.yaw += Math.PI;
          this.controller.targetYaw = this.controller.yaw;
        },
      );
    }

    this.scene.updateMatrixWorld(true);
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
      this.dustPositions[i * 3 + 0] = (Math.random() - 0.5) * 14;
      this.dustPositions[i * 3 + 1] = 0.25 + Math.random() * 3.1;
      this.dustPositions[i * 3 + 2] = 15.2 + (Math.random() - 0.5) * 14;
    }
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.dustPositions, 3),
    );
    this.dustMat = new THREE.PointsMaterial({
      color: 0xc2c8cc,
      size: 0.036,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(this.dustGeo, this.dustMat);
    this.scene.add(this.dustPoints);
  }

  private updateAtmosphere(dt: number, tensionIntensity = 0.08) {
    this.elapsed += dt;

    const malfunction = this.supernatural.getActiveFlickerOverride();

    for (let i = 0; i < this.flickerFixtures.length; i++) {
      const f = this.flickerFixtures[i];
      if (this.settings.disableFlashes) {
        // Gentle steady lighting without strobe/flicker drops
        const gentle = malfunction && malfunction.fixture === f ? 0.72 : 0.96;
        f.light.intensity = f.baseIntensity * gentle;
        f.bulbMat.emissiveIntensity = 1.3 * gentle;
        continue;
      }

      const wave =
        Math.sin(this.elapsed * f.flickerSpeed + f.phase) *
        Math.sin(this.elapsed * (f.flickerSpeed * 2.3) + f.phase * 1.7);
      let drop = wave > 0.84 ? 0.42 : 1.0 - Math.max(0, wave) * 0.14;
      if (malfunction && malfunction.fixture === f) {
        drop = malfunction.multiplier;
      }
      f.light.intensity = f.baseIntensity * drop;
      f.bulbMat.emissiveIntensity = 1.35 * drop;
    }

    // Smooth atmospheric fog & ambient darkening with tension and basement descent
    const inBasement = this.controller ? this.controller.position.y < -0.5 : false;
    const targetFogDensity = 0.035 + tensionIntensity * 0.015 + (inBasement ? 0.008 : 0);
    this.fog.density = THREE.MathUtils.damp(this.fog.density, targetFogDensity, 3, dt);
    const targetHemi = Math.max(0.11, 0.24 - tensionIntensity * 0.09 - (inBasement ? 0.05 : 0));
    this.hemiLight.intensity = THREE.MathUtils.damp(this.hemiLight.intensity, targetHemi, 3, dt);

    // Keep dust particles gently drifting around the active camera wing (including basement)
    if (this.dustGeo) {
      const cx = this.camera.position.x;
      const cz = this.camera.position.z;
      const attr = this.dustGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < this.dustCount; i++) {
        let px = this.dustPositions[i * 3 + 0];
        let py = this.dustPositions[i * 3 + 1];
        let pz = this.dustPositions[i * 3 + 2];

        if (Math.abs(px - cx) > 9) {
          px = cx + (Math.random() - 0.5) * 16;
        }
        if (Math.abs(pz - cz) > 9) {
          pz = cz + (Math.random() - 0.5) * 16;
        }
        const floorY = floorHeightAt(px, pz);
        py += Math.sin(this.elapsed * 0.6 + i) * 0.08 * dt;
        if (py > floorY + 3.4 || py < floorY + 0.15) {
          py = floorY + 0.25 + Math.random() * 2.9;
        }
        this.dustPositions[i * 3 + 0] = px;
        this.dustPositions[i * 3 + 1] = py;
        this.dustPositions[i * 3 + 2] = pz;
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

  private updateVignetteDom(tensionIntensity: number, attacking: boolean) {
    if (!this.vignetteEl) return;
    const edgeAlpha = attacking
      ? 0.9
      : Math.min(0.88, 0.68 + tensionIntensity * 0.2);
    const redTint = attacking
      ? 'rgba(72, 6, 8, 0.72)'
      : tensionIntensity > 0.55
        ? `rgba(${Math.round(35 + tensionIntensity * 28)}, 4, 6, ${(0.25 + (tensionIntensity - 0.55) * 0.55).toFixed(2)})`
        : `rgba(3, 4, 6, ${edgeAlpha.toFixed(2)})`;
    this.vignetteEl.style.background = `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 48%, ${redTint} 100%)`;
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
      this.updateAtmosphere(dt, 0.08);
      this.updateTitleCamera();
    } else if (this.status === 'caught' || this.status === 'death_animation') {
      // 4-Stage Cinematic Death Sequence (1.50 s) — bounded real-time step keeps 1.5s snappy on software GL
      const seqDt = Math.min(Math.max(rawDt, 0.008), 0.25);
      this.attackElapsed += seqDt;
      const progress = Math.min(1, this.attackElapsed / ATTACK_DURATION);

      if (this.status === 'caught' && this.attackElapsed >= CAUGHT_STAGE_DURATION) {
        this.status = 'death_animation';
        this.callbacks.onDeathAnimation();
      }

      this.updateAtmosphere(seqDt, 1.0);
      // Slight temporary visibility boost on monster face if player had flashlight off
      if (!this.flashlight.isOn() && progress < 0.65) {
        this.hemiLight.intensity = Math.max(this.hemiLight.intensity, 0.34);
      }

      this.watcher.animateAttack(seqDt, progress, this.controller.position);

      // Frame the 3D articulated creature cleanly in front of the camera without wall clipping
      const dxCam = this.camera.position.x - this.watcher.position.x;
      const dzCam = this.camera.position.z - this.watcher.position.z;
      const distCam = Math.hypot(dxCam, dzCam);
      const dirX = distCam > 1e-4 ? dxCam / distCam : 0;
      const dirZ = distCam > 1e-4 ? dzCam / distCam : 1;
      const idealDist = 1.24 + (1 - Math.min(1, progress * 1.4)) * 0.14;
      let targetCamX = this.watcher.position.x + dirX * idealDist;
      let targetCamZ = this.watcher.position.z + dirZ * idealDist;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < this.colliders.length; i++) {
          const res = resolveCircleAABB(targetCamX, targetCamZ, PLAYER_RADIUS, this.colliders[i]);
          if (res.collided) {
            targetCamX = res.x;
            targetCamZ = res.z;
          }
        }
      }
      const camDamp = 1 - Math.exp(-10 * seqDt);
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, camDamp);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ, camDamp);
      this.camera.position.y = THREE.MathUtils.lerp(
        this.camera.position.y,
        this.watcher.position.y + 1.72,
        camDamp,
      );

      // Smoothly lock gaze onto the lunging creature's upper torso/head
      this.lookTargetVec.set(
        this.watcher.position.x,
        this.watcher.position.y + 2.22,
        this.watcher.position.z,
      );
      this.lookMatrix.lookAt(this.camera.position, this.lookTargetVec, this.upVec);
      this.lookQuatTarget.setFromRotationMatrix(this.lookMatrix);
      this.camera.quaternion.slerp(this.lookQuatTarget, 1 - Math.exp(-18 * seqDt));

      if (!this.screamerPeakTriggered && this.attackElapsed >= 0.085) {
        this.screamerPeakTriggered = true;
      }
      const screamerImpulse =
        !this.settings.reducedCameraMotion &&
        this.attackElapsed >= 0.08 &&
        this.attackElapsed < 0.34
          ? Math.sin(((this.attackElapsed - 0.08) / 0.26) * Math.PI)
          : 0;

      const targetFov = (this.settings.reducedCameraMotion ? 66 : 60) - screamerImpulse * 4.2;
      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 11, seqDt);
        this.camera.updateProjectionMatrix();
      }

      if (!this.settings.reducedCameraMotion) {
        const shakeDecay = Math.max(0.15, 1 - progress * 0.85);
        this.camera.rotateZ(
          Math.sin(this.attackElapsed * 44) * (0.042 * shakeDecay + screamerImpulse * 0.032),
        );
      }

      this.updateVignetteDom(1.0, true);

      // Stage 4: brief interference static burst + progressive darkening to near-black
      const interferenceOpacity =
        progress > 0.42 && progress < 0.94
          ? Math.sin(((progress - 0.42) / 0.52) * Math.PI) *
            (this.settings.disableFlashes ? 0.14 : 0.54)
          : 0;
      const blackoutProgress = Math.max(0, Math.min(1, (progress - 0.54) / 0.42));
      const blackoutOpacity = Math.pow(blackoutProgress, 1.3);
      this.updateDeathOverlayDom(interferenceOpacity, blackoutOpacity);

      if (this.attackElapsed >= ATTACK_DURATION) {
        this.attackSequenceActive = false;
        this.status = 'gameover';
        this.updateDeathOverlayDom(0, 1);
        this.spatialAudio.startDeathAmbience();
        this.callbacks.onGameOver();
      }
    } else if ((this.status === 'playing' || this.status === 'ending') && this.final.stage !== 'PLAYING') {
      // Fixed collision steps preserve real travel time on slower integrated GPUs.
      let remaining = document.hidden ? 0 : Math.min(rawDt, .5);
      while(remaining>0 && (this.status==='playing'||this.status==='ending')) {
        const step=Math.min(.05,remaining); this.updateFinal(step); remaining-=step;
      }
    } else if (this.status === 'playing') {
      const invSnap = this.inventory.getSnapshot();
      const watcherDist = this.watcher.active
        ? Math.hypot(
            this.watcher.position.x - this.controller.position.x,
            this.watcher.position.z - this.controller.position.z,
          )
        : 40;

      const tensionSnap = this.tension.update({
        dt,
        watcherActive: this.watcher.active,
        watcherDistance: watcherDist,
        watcherState: this.watcher.state,
        timeSinceLastSeen: this.watcher.timeSinceLastSeen,
        keysCollected: invSnap.keysCollected,
        isSprinting: this.controller.isSprinting,
      });

      this.updateAtmosphere(dt, tensionSnap.intensity);
      this.collectibles.update(this.elapsed, this.controller.position);

      if (this.notificationTimer > 0) {
        this.notificationTimer = Math.max(0, this.notificationTimer - dt);
        if (this.notificationTimer === 0) {
          this.activeNotification = null;
        }
      }

      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.4);
      this.prevPlayerPos.copy(this.controller.position);

      const { zoneName } = this.controller.update(
        dt,
        this.camera,
        this.colliders,
        {
          reducedMotion: this.settings.reducedCameraMotion,
          trauma: this.cameraTrauma,
          chaseIntensity: tensionSnap.chaseActive ? tensionSnap.intensity : 0,
          elapsed: this.elapsed,
        },
      );

      if (this.watcher.active) {
        const separated = resolveWatcherBodyCollision(
          this.controller.position,
          this.watcher.position,
          this.watcher.active,
          this.colliders,
        );
        if (
          separated.x !== this.controller.position.x ||
          separated.z !== this.controller.position.z
        ) {
          const dxSep = separated.x - this.controller.position.x;
          const dzSep = separated.z - this.controller.position.z;
          this.controller.position.x = separated.x;
          this.controller.position.z = separated.z;
          this.camera.position.x += dxSep;
          this.camera.position.z += dzSep;
        }
      }

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

      // Note opening must stop the enemy in this same frame.
      this.doorSystem.update(
        dt,
        this.watcher.active
          ? [this.controller.position, this.watcher.position]
          : [this.controller.position],
        this.settings.reducedCameraMotion,
      );
      this.scene.updateMatrixWorld(true);

      if (this.status === 'playing' && this.final.stage === 'PLAYING') {
        this.watcher.update(
          dt,
          this.camera,
          this.controller.position,
          invSnap.keysCollected,
          this.prevPlayerPos,
        );

        // Occasional monster growls while active and pursuing / nearby
        if (
          this.status === 'playing' &&
          this.watcher.active &&
          this.watcher.state !== 'FROZEN' &&
          this.watcher.state !== 'ATTACK'
        ) {
          this.growlTimer -= dt;
          if (this.growlTimer <= 0) {
            this.growlTimer =
              this.watcher.state === 'CHASE' ? 5.5 + Math.random() * 4 : 10 + Math.random() * 7;
            if (watcherDist < 22) {
              this.spatialAudio.playMonsterGrowl(
                this.watcher.position,
                this.controller.position,
                this.colliders,
                this.watcher.state === 'CHASE',
              );
            }
          }

          // Menacing pre-attack cue when closing inside extreme danger radius (2.5m - 3.5m)
          if (
            this.watcher.state === 'CHASE' &&
            watcherDist <= 3.5 &&
            watcherDist > 2.65
          ) {
            this.preAttackTimer -= dt;
            if (this.preAttackTimer <= 0) {
              this.preAttackTimer = 3.0;
              this.spatialAudio.playPreAttackWarning(
                this.watcher.position,
                this.controller.position,
                this.colliders,
              );
            }
          } else if (watcherDist > 4.2) {
            this.preAttackTimer = 0;
          }
        }

        // Supernatural Events & Controlled Jumpscares (skip if capture just started)
        if (this.status === 'playing') {
          this.supernatural.update({
            dt,
            active: !this.attackSequenceActive,
            camera: this.camera,
            playerPos: this.controller.position,
            playerYaw: this.controller.yaw,
            doors: this.doorSystem.doors,
            flickerFixtures: this.flickerFixtures,
            colliders: this.colliders,
            watcher: this.watcher,
            audio: this.spatialAudio,
            tensionLevel: tensionSnap.level,
            disableFlashes: this.settings.disableFlashes,
            onTensionSpike: (amt) => this.tension.addEventSpike(amt),
          });

          this.jumpscares.update({
            dt,
            status: this.status,
            camera: this.camera,
            playerPos: this.controller.position,
            playerYaw: this.controller.yaw,
            doors: this.doorSystem.doors,
            colliders: this.colliders,
            audio: this.spatialAudio,
            tensionLevel: tensionSnap.level,
            watcherState: this.watcher.state,
            onTensionSpike: (amt) => this.tension.addEventSpike(amt),
          });

          const flinch = this.jumpscares.consumeCameraFlinch();
          if (flinch > 0) {
            this.cameraTrauma = Math.min(1, this.cameraTrauma + flinch);
          }

          this.spatialAudio.update({
            dt,
            elapsed: this.elapsed,
            active: true,
            camera: this.camera,
            watcherActive: this.watcher.active,
            watcherPos: this.watcher.position,
            watcherState: this.watcher.state,
            tensionLevel: tensionSnap.level,
            tensionIntensity: tensionSnap.intensity,
            exhausted: this.controller.stamina.exhausted,
            colliders: this.colliders,
          });

          this.updateVignetteDom(tensionSnap.intensity, false);
        }
      }

      if (this.status === 'playing') {
        this.updateStaminaDom(
          this.controller.stamina.value,
          this.controller.stamina.exhausted,
        );
        this.broadcastHud(false, zoneName, prompt);
      }
    }

    if (this.status !== 'gameover' && this.final.stage !== 'END_CREDITS' && this.final.stage !== 'END_COMPLETE') {
      this.renderer.render(this.scene, this.camera);
      this.qa?.update(
        rawDt,
        this.watcher.active ? this.watcher.state : 'INACTIVO',
        this.watcher.position.x,
        this.watcher.position.z,
        this.renderer.info.render.calls,
        this.renderer.info.render.triangles,
      );
    }

    if(this.final.stage==='END_CREDITS'||this.final.stage==='END_COMPLETE'){
      this.frameId=window.setTimeout(this.tick,this.final.stage==='END_COMPLETE'?250:50);
    } else if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private updateFinal(dt: number) {
    if (this.final.stage === 'END_COMPLETE') return;
    const previousStage = this.final.stage;
    if (import.meta.env.DEV && this.qaAutoRun && this.status === 'playing') {
      this.controller.setQAForward(true);
    }
    const playable = previousStage === 'FINAL_DOOR_OPENING' || previousStage === 'FINAL_ESCAPE';
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.4);
    const preMetrics = getFinalChaseMetrics(
      this.controller.position.z,
      this.watcher.position.z,
      this.final.chasing,
      previousStage,
    );

    if (playable) {
      this.prevPlayerPos.copy(this.controller.position);
      // Adrenaline is exclusive to the finale; normal stamina is unchanged.
      this.controller.stamina = { value: 100, exhausted: false };
      this.controller.update(dt, this.camera, this.colliders, {
        reducedMotion: this.settings.reducedCameraMotion,
        trauma: this.cameraTrauma,
        chaseIntensity: this.final.chasing ? 0.35 + preMetrics.threatProximity * 0.65 : 0.14,
        elapsed: this.elapsed,
      });
      this.doorSystem.update(dt, [this.controller.position], this.settings.reducedCameraMotion);
      if (this.controller.consumeFlashlightPressed()) this.flashlight.toggle();
      this.controller.consumeInteractPressed();
      this.flashlight.update(dt);
    }
    if (this.buildingGroup) this.buildingGroup.visible = this.controller.position.z > -25;
    this.elapsed += dt;
    this.final.update(dt, this.controller.position.z);

    if (previousStage !== this.final.stage) {
      this.finalAudio.setStage(this.final.stage);
      if (this.final.stage === 'FINAL_FACTORY_REVEAL') {
        this.revealStart.copy(this.camera.quaternion);
        this.controller.setActive(false);
        this.interactions.clearActive();
        this.status = 'ending';
        this.cameraTrauma = 0;
        this.exhaleTimer = 0;
        this.activeNotification = null;
        this.notificationTimer = 0;
        this.spatialAudio.update({
          dt: 0,
          elapsed: this.elapsed,
          active: false,
          camera: this.camera,
          watcherActive: false,
          watcherPos: this.watcher.position,
          watcherState: this.watcher.state,
          tensionLevel: 1,
          tensionIntensity: 0,
          exhausted: false,
          colliders: this.colliders,
          finalChaseMode: false,
        });
        this.updateVignetteDom(0.12, false);
      }
      this.callbacks.onFinalStage?.(this.final.stage);
    }

    const stage = this.final.stage;
    if (stage === 'FINAL_ESCAPE') {
      if (!this.final.chasing && this.controller.position.z < FINAL_TRIGGER_Z) {
        // Spawn only outside the actual view, with a clear 14 m head start.
        const spawn = new THREE.Vector3(0, 0, -23);
        this.camera.updateMatrixWorld();
        if (!this.watcher.vision.visible(this.camera, spawn, true)) {
          this.final.chasing = true;
          this.finalChaseElapsed = 0;
          this.watcher.active = true;
          this.watcher.model.root.visible = true;
          this.watcher.position.copy(spawn);
          stopHeavyIronOpeningLoop();
          playDoorSound('heavy_iron', 'close_slam');
          this.finalAudio.playTunnelLockdownSlam();
          this.cameraTrauma = Math.max(this.cameraTrauma, 0.45);
          this.spatialAudio.playMonsterGrowl(spawn, this.controller.position, this.colliders, true);
          this.growlTimer = 2.6;
          this.exhaleTimer = 1.2;
          this.pushNotification(
            '¡CORRE! Está furioso. Mirarlo ya no lo detiene. Mantén SHIFT.',
            'alert',
            5,
          );
        }
      }

      if (this.final.chasing) {
        this.finalChaseElapsed += dt;
        const curMetrics = getFinalChaseMetrics(
          this.controller.position.z,
          this.watcher.position.z,
          true,
          stage,
        );
        const chaseSpeed = computeFinalChaseSpeed(
          curMetrics.phase,
          curMetrics.monsterDistance,
          this.finalChaseElapsed,
        );
        const aggression =
          curMetrics.phase === 'FINAL_METERS'
            ? 1.32
            : curMetrics.phase === 'DESPERATE_CHASE'
              ? 1.14
              : 1.0;
        this.watcher.updateFinal(
          dt,
          this.controller.position,
          this.prevPlayerPos,
          chaseSpeed,
          aggression,
        );
        this.growlTimer -= dt;
        if (this.growlTimer <= 0) {
          this.growlTimer =
            curMetrics.phase === 'FINAL_METERS' || curMetrics.threatProximity > 0.65 ? 2.1 : 3.2;
          this.spatialAudio.playMonsterGrowl(
            this.watcher.position,
            this.controller.position,
            this.colliders,
            true,
          );
        }
        this.exhaleTimer -= dt;
        if (this.exhaleTimer <= 0) {
          this.exhaleTimer = 1.15 + Math.random() * 0.55;
          this.spatialAudio.playMonsterExhale(
            this.watcher.position,
            this.controller.position,
            this.colliders,
          );
        }
      }

      const liveMetrics = getFinalChaseMetrics(
        this.controller.position.z,
        this.watcher.position.z,
        this.final.chasing,
        stage,
      );
      this.spatialAudio.update({
        dt,
        elapsed: this.elapsed,
        active: true,
        camera: this.camera,
        watcherActive: this.final.chasing,
        watcherPos: this.watcher.position,
        watcherState: this.watcher.state,
        tensionLevel: this.final.chasing ? 4 : 3,
        tensionIntensity: this.final.chasing ? Math.max(0.5, liveMetrics.threatProximity) : 0.25,
        exhausted: false,
        colliders: this.colliders,
        finalChaseMode: true,
        chaseProximity: liveMetrics.threatProximity,
      });

      const targetFog = this.final.chasing ? 0.041 + liveMetrics.threatProximity * 0.008 : 0.036;
      this.fog.density = THREE.MathUtils.damp(this.fog.density, targetFog, 2.2, dt);
      this.fog.color.lerp(this.finalFogColor, 1 - Math.exp(-dt * 2.2));
      this.updateVignetteDom(
        this.final.chasing ? 0.45 + liveMetrics.threatProximity * 0.52 : 0.35,
        false,
      );
    }

    const reveal = stage === 'FINAL_FACTORY_REVEAL' || stage === 'TO_BE_CONTINUED';
    if (reveal) {
      this.fog.density = THREE.MathUtils.damp(this.fog.density, 0.007, 1.3, dt);
      this.fog.color.lerp(this.factoryFogColor, 1 - Math.exp(-dt));
      if (stage === 'FINAL_FACTORY_REVEAL') {
        this.camera.quaternion.slerpQuaternions(
          this.revealStart,
          this.revealTarget,
          smooth((this.final.time - 1) / 5),
        );
        // Creature remains physically behind the threshold, with a settling pose.
        this.watcher.model.animate(dt, 0, false, false, { animState: 'IDLE' });
      }
    }

    const finalMetrics = getFinalChaseMetrics(
      this.controller.position.z,
      this.watcher.position.z,
      this.final.chasing,
      stage,
    );
    this.finalSet.update(
      this.controller.position.z,
      this.elapsed,
      reveal,
      this.settings.disableFlashes,
      stage === 'FINAL_ESCAPE',
      finalMetrics.phase,
    );
    this.finalAudio.update(dt, finalMetrics.phase, finalMetrics.threatProximity);

    if (playable) {
      this.notificationTimer = Math.max(0, this.notificationTimer - dt);
      if (!this.notificationTimer) this.activeNotification = null;
      this.updateStaminaDom(100, false);
      this.broadcastHud(false, 'Túnel de evacuación', EMPTY_PROMPT);
    }
  }

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
    this.finalAudio.dispose();
    this.qaFinalPanel?.remove();
    this.finalSet?.dispose();
    this.qa?.dispose();
    this.spatialAudio.dispose();
    this.jumpscares.dispose();
    this.watcher?.dispose();
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
