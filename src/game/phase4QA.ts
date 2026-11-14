/** Development-only inspection controls. Never mounted in production. */
export function createPhase4QA(jump: (x:number,z:number,yaw:number,enemy?:boolean)=>void, turn:()=>void) {
  const panel=document.createElement('aside');
  panel.setAttribute('aria-label','Pruebas fase 4');
  panel.style.cssText='position:fixed;left:12px;bottom:90px;z-index:60;max-width:440px;padding:10px;background:#10191fee;color:#dce7e5;font:12px monospace;border:1px solid #647b7b';
  const output=document.createElement('div'); output.setAttribute('data-testid','phase4-metrics'); panel.append(output);
  for(const [label,x,z,yaw,enemy] of [
    ['Recepción',0,15,0,false],['Clínica',24,-5,0,false],['Generadores',23,5,Math.PI/2,false],
    ['Administración',-20,-6,Math.PI,false],['Escaleras',15,-15,0,false],['Sótano',16,-24,-Math.PI/2,false],
    ['Encuentro',0,5,0,true],
  ] as const) {
    const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:7px;border:1px solid #647b7b;margin:3px';
    b.onclick=()=>jump(x,z,yaw,enemy);panel.append(b);
  }
  const b=document.createElement('button');b.textContent='Girar 180°';b.style.cssText='padding:7px;border:1px solid #647b7b;margin:3px';b.onclick=turn;panel.append(b);
  document.body.append(panel);
  let seconds=0,frames=0;
  return { update(dt:number,state:string,x:number,z:number,calls:number,triangles:number) {
    seconds+=dt;frames++;
    if(seconds<1)return;
    output.textContent=`${(frames/seconds).toFixed(0)} FPS · ${calls} draw calls · ${triangles} triángulos | ${state} (${x.toFixed(2)}, ${z.toFixed(2)})`;
    seconds=0;frames=0;
  },dispose(){panel.remove();} };
}
