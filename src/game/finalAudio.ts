import { getSharedAudioContext } from './audio';
import type { FinalStage } from './finalSequence';

/** Original synthesized score. One bus, bounded voices, no network assets. */
export class FinalAudio {
  private voices: OscillatorNode[] = [];
  private bus?: GainNode;
  private pulse = 0;
  private stage: FinalStage = 'PLAYING';
  setStage(stage: FinalStage) {
    this.stop(); this.stage=stage; this.pulse=0;
    if(stage==='PLAYING'||stage==='END_COMPLETE') return;
    const ctx=getSharedAudioContext(); if(!ctx)return;
    const bus=ctx.createGain(); this.bus=bus;
    bus.gain.setValueAtTime(0,ctx.currentTime); bus.gain.linearRampToValueAtTime(.065,ctx.currentTime+1.8); bus.connect(ctx.destination);
    const notes=stage==='END_CREDITS'?[55,130.81,164.81,196]:stage==='FINAL_FACTORY_REVEAL'||stage==='TO_BE_CONTINUED'?[36.71,73.42,110,155.56]:[46.25,49,92.5];
    notes.forEach((frequency,i)=>{const osc=ctx.createOscillator();osc.type=i===0?'triangle':'sine';osc.frequency.value=frequency;osc.detune.value=i*2;osc.connect(bus);osc.start();this.voices.push(osc);});
  }
  update(dt:number){
    this.pulse+=dt;
    const ctx=getSharedAudioContext(); if(!ctx||!this.bus)return;
    if(this.stage==='FINAL_ESCAPE') this.bus.gain.setTargetAtTime(.05+.025*Math.pow(Math.sin(this.pulse*8),8),ctx.currentTime,.04);
    if(this.stage==='END_CREDITS'&&this.pulse>23) this.bus.gain.setTargetAtTime(0,ctx.currentTime,.6);
  }
  stop(){
    const bus=this.bus; const voices=this.voices;
    this.bus=undefined; this.voices=[];
    if(!bus)return;
    const ctx=bus.context; const now=ctx.currentTime;
    bus.gain.cancelScheduledValues(now); bus.gain.setTargetAtTime(0,now,.25);
    let remaining=voices.length;
    voices.forEach(osc=>{osc.onended=()=>{osc.disconnect();if(--remaining===0)bus.disconnect();};osc.stop(now+1.2);});
  }
}
