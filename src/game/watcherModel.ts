import * as THREE from 'three';

export function createWatcherModel() {
  const root = new THREE.Group(); root.name = 'THE WATCHER';
  const body = new THREE.Group(); root.add(body);
  const skin = new THREE.MeshStandardMaterial({ color: 0x12191a, roughness: .98, metalness: 0, emissive: 0x101617, emissiveIntensity: .23 });
  const bone = new THREE.MeshStandardMaterial({ color: 0x333b37, roughness: 1 });
  const sphere = new THREE.SphereGeometry(1, 10, 7);
  const part = (parent: THREE.Object3D, x: number,y: number,z: number,sx: number,sy: number,sz: number, mat=skin) => {
    const mesh = new THREE.Mesh(sphere,mat); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); parent.add(mesh); return mesh;
  };
  part(body,0,1.94,0,.24,.51,.15).rotation.x=-.16;
  part(body,0,1.48,.06,.18,.2,.13);
  part(body,0,2.31,.11,.29,.18,.19); // hunched shoulder blades
  const head = new THREE.Group(); head.position.set(0,2.54,-.13); body.add(head);
  part(head,0,.08,0,.17,.27,.145); // seamless, faceless elongated skull
  part(head,0,-.14,.03,.075,.2,.08);
  for (let i=0;i<6;i++) part(body,0,1.76+i*.09,.15,.038,.033,.035,bone);
  const arms: THREE.Group[] = [], legs: THREE.Group[] = [];
  for (const side of [-1,1]) {
    const arm = new THREE.Group(); arm.position.set(side*.29,2.3,0); body.add(arm); arms.push(arm);
    part(arm,side*.035,-.44,0,.065,.47,.07).rotation.z=side*.08;
    part(arm,side*.075,-.9,-.02,.073,.085,.07);
    part(arm,side*.09,-1.3,-.045,.045,.42,.05).rotation.x=-.09;
    part(arm,side*.1,-1.69,-.08,.105,.16,.045);
    for (let finger=0;finger<4;finger++) {
      const f=part(arm,side*.1+(finger-1.5)*.047,-1.91-Math.sin(finger)*.025,-.095,.016,.16,.018);
      f.rotation.z=(finger-1.5)*.1;
    }
    const leg = new THREE.Group(); leg.position.set(side*.13,1.46,.04); body.add(leg); legs.push(leg);
    part(leg,side*.025,-.34,.04,.085,.39,.09).rotation.x=-.14;
    part(leg,side*.035,-.75,.09,.065,.08,.07);
    part(leg,side*.025,-1.07,.01,.045,.35,.055).rotation.x=.15;
    part(leg,side*.025,-1.41,-.08,.065,.05,.16);
  }
  let phase = 0, weight = 0;
  return { root, animate(dt: number, speed: number, frozen: boolean, crouch: boolean) {
    // Freeze the complete pose immediately; never integrate a gait while observed.
    if (frozen) return;
    weight = THREE.MathUtils.damp(weight,speed > .01 ? 1 : 0,7,dt);
    phase += dt*(speed > 1.5 ? 6.2 : 3.1);
    body.scale.y = THREE.MathUtils.damp(body.scale.y,crouch ? .81 : 1,12,dt);
    head.rotation.z=.16+Math.sin(phase*.47)*.045;
    head.rotation.y=Math.sin(phase*.31)*.07;
    legs.forEach((leg,i)=>leg.rotation.x=Math.sin(phase+i*Math.PI)*.24*weight);
    arms.forEach((arm,i)=>arm.rotation.x=-Math.sin(phase+i*Math.PI+.3)*.15*weight);
  }, dispose() { sphere.dispose(); skin.dispose(); bone.dispose(); } };
}
