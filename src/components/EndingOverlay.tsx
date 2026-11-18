import { useEffect } from 'react';
import type { FinalStage } from '../game/finalSequence';

export const CREDIT_NAMES = ['Kenneth Saavedra','Alexander Pérez','Angel Mejía','Gemini','Codex','Y mi compu'];
export function EndingOverlay({stage,onMenu}:{stage:FinalStage;onMenu:()=>void}) {
  useEffect(()=>{
    const sync=()=>document.documentElement.style.setProperty('--ending-play-state',document.hidden?'paused':'running');
    sync();document.addEventListener('visibilitychange',sync);
    return ()=>{document.removeEventListener('visibilitychange',sync);document.documentElement.style.removeProperty('--ending-play-state');};
  },[]);
  if(stage==='FINAL_FACTORY_REVEAL') return <div className="ending-letterbox" aria-hidden="true"/>;
  if(stage==='TO_BE_CONTINUED') return <div className="ending-continued"><h1>CONTINUARÁ</h1></div>;
  if(stage==='END_CREDITS') return <div className="ending-black" role="region" aria-label="Créditos finales"><div className="ending-roll">
    <h2>Hecho por:</h2>{CREDIT_NAMES.map(name=><p key={name}>{name}</p>)}
    <p className="ending-dedication">- Para la clase de la teacher Anabel🫶</p>
  </div></div>;
  if(stage==='END_COMPLETE') return <div className="ending-black ending-complete"><button onClick={onMenu}>VOLVER AL MENÚ</button></div>;
  return null;
}
