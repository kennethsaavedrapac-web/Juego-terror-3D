import * as THREE from 'three';
import { floorHeightAt } from './expansion';
import { NavigationGraph, clearSegment, type NavPoint } from './navigation';
import { createWatcherModel } from './watcherModel';
import type { AABBCollider } from './types';

export type WatcherState = 'PATROL' | 'STALK' | 'FROZEN' | 'CHASE' | 'ATTACK';
export const WATCHER_DIFFICULTY = [
  { speed: .85, repath: 1.5 }, { speed: 1.2, repath: 1.1 },
  { speed: 1.65, repath: .7 }, { speed: 2.15, repath: .45 },
] as const;

/** Several real body samples prevent a small occluder hiding a visible head/shoulder. */
export class WatcherVision {
  private ray = new THREE.Raycaster();
  private point = new THREE.Vector3();
  private ndc = new THREE.Vector3();
  private direction = new THREE.Vector3();
  constructor(readonly occluders: THREE.Object3D[]) {}
  visible(camera: THREE.PerspectiveCamera, position: THREE.Vector3, fullFrame=false): boolean {
    for (const [dx,y] of [[0,2.6],[0,1.7],[-.28,2.1],[.28,2.1],[0,.7]]) {
      this.point.set(position.x+dx,position.y+y,position.z);
      this.ndc.copy(this.point).project(camera);
      if (this.ndc.z < -1 || this.ndc.z > 1 || Math.abs(this.ndc.x) > (fullFrame ? 1.1 : .86) || Math.abs(this.ndc.y) > (fullFrame ? 1.1 : .92)) continue;
      this.direction.subVectors(this.point,camera.position);
      this.ray.set(camera.position,this.direction.clone().normalize());
      this.ray.near=.02; this.ray.far=this.direction.length()-.08;
      if (!this.ray.intersectObjects(this.occluders,false).length) return true;
    }
    return false;
  }
}

const SPAWNS = [{x:0,z:-14},{x:15,z:-8},{x:-15,z:-8},{x:15,z:-25},{x:23,z:-7}];
const PATROL = [{x:0,z:-13},{x:0,z:5},{x:-15,z:4},{x:15,z:-8},{x:20,z:-25}];

export class Watcher {
  readonly model = createWatcherModel();
  readonly position = this.model.root.position;
  readonly graph: NavigationGraph;
  readonly vision: WatcherVision;
  state: WatcherState = 'PATROL';
  active = false;
  private age=0;
  private route: NavPoint[]=[];
  private routeTimer=0;
  private patrolIndex=0;
  private introduced=false;
  private spawnTimer=0;
  constructor(readonly colliders: readonly AABBCollider[], occluders: THREE.Object3D[], private onCapture:()=>void, private onIntroduction:()=>void) {
    this.graph=new NavigationGraph(colliders); this.vision=new WatcherVision(occluders);
    this.model.root.visible=false;
  }
  reset() {
    this.active=false; this.model.root.visible=false; this.age=0; this.route=[];
    this.routeTimer=0; this.spawnTimer=0; this.patrolIndex=0; this.introduced=false; this.state='PATROL';
  }
  update(dt: number, camera: THREE.PerspectiveCamera, player: NavPoint, keys: number) {
    this.age+=dt;
    if (!this.active) {
      if (this.age < 18 || (this.spawnTimer-=dt)>0) return;
      this.spawnTimer=1;
      for (const p of SPAWNS) {
        if (Math.hypot(p.x-player.x,p.z-player.z)<14 || !clearSegment(p,p,this.colliders)) continue;
        this.position.set(p.x,floorHeightAt(p.x,p.z),p.z);
        if (this.vision.visible(camera,this.position,true) || !this.graph.findPath(p,player).length) continue;
        this.model.root.rotation.y=Math.atan2(p.x-player.x,p.z-player.z);
        this.active=true; this.model.root.visible=true; break;
      }
      if (!this.active) return;
    }
    if (this.state==='ATTACK') return;
    if (this.vision.visible(camera,this.position)) {
      this.state='FROZEN';
      if (!this.introduced) { this.introduced=true; this.onIntroduction(); }
      return;
    }
    const distance=Math.hypot(this.position.x-player.x,this.position.z-player.z);
    // Observation always wins over proximity, including the most aggressive tier.
    if (distance<.85 && Math.abs(this.position.y-floorHeightAt(player.x,player.z))<.65 && clearSegment(this.position,player,this.colliders,0)) {
      this.state='ATTACK'; this.onCapture(); return;
    }
    const difficulty=WATCHER_DIFFICULTY[Math.max(0,Math.min(3,keys))];
    this.state=keys>=2 || (keys>0 && distance<9) ? 'CHASE' : distance<26 || keys>0 ? 'STALK' : 'PATROL';
    let target: NavPoint=player;
    if (this.state==='PATROL') {
      target=PATROL[this.patrolIndex];
      if (Math.hypot(target.x-this.position.x,target.z-this.position.z)<1) target=PATROL[this.patrolIndex=(this.patrolIndex+1)%PATROL.length];
    }
    this.routeTimer-=dt;
    if (this.routeTimer<=0) {
      this.route=this.graph.findPath(this.position,target);
      this.routeTimer=difficulty.repath;
      if (!this.route.length && this.state==='PATROL') this.patrolIndex=(this.patrolIndex+1)%PATROL.length;
    }
    const speed=difficulty.speed*(this.state==='PATROL' ? .7 : 1);
    let budget=speed*Math.min(dt,.05), moved=0;
    while (budget>0 && this.route.length) {
      const p=this.route[0], dx=p.x-this.position.x,dz=p.z-this.position.z,d=Math.hypot(dx,dz);
      if (d<.015) { this.route.shift(); continue; }
      const step=Math.min(budget,d,.12);
      const next={ x:this.position.x+dx/d*step,z:this.position.z+dz/d*step };
      if (!clearSegment(this.position,next,this.colliders)) { this.route=[]; this.routeTimer=0; break; }
      this.position.set(next.x,floorHeightAt(next.x,next.z),next.z);
      this.model.root.rotation.y=Math.atan2(-dx,-dz);
      moved+=step; budget-=step;
    }
    const crouch=this.colliders.some(c=>c.kind==='door' && Math.hypot(this.position.x-(c.minX+c.maxX)/2,this.position.z-(c.minZ+c.maxZ)/2)<2);
    this.model.animate(dt,dt ? moved/dt : 0,false,crouch);
  }
  dispose() { this.model.dispose(); }
}
