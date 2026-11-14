import { BUILDING_ROOMS } from './mapData';
import { segmentIntersectsAABB } from './physics';
import type { AABBCollider } from './types';

export interface NavPoint { x: number; z: number }
export const WATCHER_RADIUS = .46;
const STEP = .5;

/** Conservative swept disc: expanded boxes prevent corner cutting and tunnelling. */
export function clearSegment(a: NavPoint, b: NavPoint, boxes: readonly AABBCollider[], radius = WATCHER_RADIUS): boolean {
  return !boxes.some(c => c.active !== false && segmentIntersectsAABB(a.x, a.z, b.x, b.z, {
    ...c, minX: c.minX-radius, maxX: c.maxX+radius, minZ: c.minZ-radius, maxZ: c.maxZ+radius,
  }));
}

class MinHeap {
  items: { id: number; score: number }[] = [];
  push(id: number, score: number) {
    const item = { id, score }; let i = this.items.length; this.items.push(item);
    while (i > 0) { const p = (i-1)>>1; if (this.items[p].score <= score) break; this.items[i] = this.items[p]; i = p; }
    this.items[i] = item;
  }
  pop(): number {
    const first = this.items[0], last = this.items.pop()!;
    if (this.items.length) {
      let i = 0;
      while (i*2+1 < this.items.length) {
        let c = i*2+1; if (c+1 < this.items.length && this.items[c+1].score < this.items[c].score) c++;
        if (this.items[c].score >= last.score) break;
        this.items[i] = this.items[c]; i = c;
      }
      this.items[i] = last;
    }
    return first.id;
  }
}

/** Static walkable graph built once; doors are checked against live colliders in A*. */
export class NavigationGraph {
  readonly nodes: NavPoint[] = [];
  private edges: number[][] = [];
  constructor(readonly colliders: readonly AABBCollider[]) {
    const statics = colliders.filter(c => c.kind !== 'door');
    const index = new Map<string, number>();
    for (let x = -27; x <= 27; x += STEP) for (let z = -32; z <= 18; z += STEP) {
      const p = { x, z };
      if (!BUILDING_ROOMS.some(r => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ)) continue;
      if (!clearSegment(p,p,statics)) continue;
      index.set(`${x},${z}`, this.nodes.length); this.nodes.push(p);
    }
    this.edges = this.nodes.map(p => {
      const neighbors: number[] = [];
      for (const [dx,dz] of [[STEP,0],[-STEP,0],[0,STEP],[0,-STEP],[STEP,STEP],[-STEP,STEP],[STEP,-STEP],[-STEP,-STEP]]) {
        const n = index.get(`${p.x+dx},${p.z+dz}`);
        if (n !== undefined && clearSegment(p,this.nodes[n],statics)) neighbors.push(n);
      }
      return neighbors;
    });
  }
  private nearest(p: NavPoint, target = false): number {
    let best = -1, distance = 2.25;
    for (let i=0; i<this.nodes.length; i++) {
      const n = this.nodes[i], d = (p.x-n.x)**2+(p.z-n.z)**2;
      if (d < distance && clearSegment(p,n,this.colliders,target ? 0 : WATCHER_RADIUS)) { best=i; distance=d; }
    }
    return best;
  }
  findPath(from: NavPoint, to: NavPoint): NavPoint[] {
    const start = this.nearest(from), goal = this.nearest(to,true);
    if (start < 0 || goal < 0) return [];
    const dist = new Float64Array(this.nodes.length).fill(Infinity);
    const parent = new Int32Array(this.nodes.length).fill(-1);
    const closed = new Uint8Array(this.nodes.length), heap = new MinHeap();
    const dynamic = this.colliders.filter(c => c.kind === 'door' && c.active !== false);
    dist[start]=0; heap.push(start,0);
    while (heap.items.length) {
      const cur = heap.pop(); if (closed[cur]) continue;
      if (cur === goal) {
        const path: NavPoint[] = clearSegment(this.nodes[goal],to,this.colliders) ? [{ x: to.x, z: to.z }] : [];
        for (let n=goal; n !== -1; n=parent[n]) path.push(this.nodes[n]);
        path.reverse();
        // Replanning between grid points must not send the actor back to the
        // nearest start node (which would flip its gait/facing every interval).
        if (path.length > 1 && clearSegment(from,path[1],this.colliders)) path.shift();
        return path;
      }
      closed[cur]=1;
      for (const n of this.edges[cur]) {
        if (closed[n] || !clearSegment(this.nodes[cur],this.nodes[n],dynamic)) continue;
        const cost=dist[cur]+Math.hypot(this.nodes[n].x-this.nodes[cur].x,this.nodes[n].z-this.nodes[cur].z);
        if (cost >= dist[n]) continue;
        dist[n]=cost; parent[n]=cur;
        heap.push(n,cost+Math.hypot(this.nodes[n].x-this.nodes[goal].x,this.nodes[n].z-this.nodes[goal].z));
      }
    }
    return [];
  }
}
