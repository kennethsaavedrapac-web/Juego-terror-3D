import type { FC } from 'react';
import type { AccessibilitySettings } from '../game/types';

interface PauseModalProps {
  settings: AccessibilitySettings;
  onUpdateSettings: (next: AccessibilitySettings) => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnToTitle: () => void;
}

export const PauseModal: FC<PauseModalProps> = ({
  settings,
  onUpdateSettings,
  onResume,
  onRestart,
  onReturnToTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center px-6 pointer-events-auto"
      style={{ backgroundColor: 'rgba(5, 6, 9, 0.86)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div className="w-full max-w-sm border border-white/15 bg-[#0d1016] p-8 text-center">
        <h2
          id="pause-title"
          className="font-display text-2xl font-bold tracking-[0.16em] text-[#ece8e0] uppercase"
        >
          Pausa
        </h2>
        <p className="mt-2 text-xs tracking-wide text-[#948e84]">
          Fase 5 · Terror psicológico y audio 3D
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onResume}
            className="w-full cursor-pointer border border-[#b91c1c] bg-[#8b1818] px-5 py-3 text-xs font-semibold tracking-[0.14em] text-[#f5f2eb] uppercase transition-colors hover:bg-[#a61f1f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5e2dc] whitespace-nowrap"
          >
            Continuar
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full cursor-pointer border border-white/15 bg-[#151922] px-5 py-3 text-xs font-medium tracking-[0.14em] text-[#e5e2dc] uppercase transition-colors hover:border-white/30 hover:bg-[#1c212c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5e2dc] whitespace-nowrap"
          >
            Reiniciar partida
          </button>
          <button
            type="button"
            onClick={onReturnToTitle}
            className="w-full cursor-pointer border border-white/10 bg-transparent px-5 py-3 text-xs font-medium tracking-[0.14em] text-[#9c968c] uppercase transition-colors hover:border-white/25 hover:text-[#e5e2dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5e2dc] whitespace-nowrap"
          >
            Menú principal
          </button>
        </div>

        <fieldset className="mt-6 border border-white/10 bg-[#090b10] p-3.5 text-left">
          <legend className="px-1.5 text-[10px] font-semibold tracking-[0.16em] text-[#8d877d] uppercase">
            Comodidad y audio
          </legend>
          <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-xs text-[#d6d3cd]">
            <span>Reducir movimiento de cámara</span>
            <input
              type="checkbox"
              checked={settings.reducedCameraMotion}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  reducedCameraMotion: e.target.checked,
                })
              }
              className="h-4 w-4 accent-[#b91c1c]"
            />
          </label>
          <label className="mt-1 flex cursor-pointer items-center justify-between gap-3 py-1.5 text-xs text-[#d6d3cd]">
            <span>Desactivar destellos ambientales</span>
            <input
              type="checkbox"
              checked={settings.disableFlashes}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  disableFlashes: e.target.checked,
                })
              }
              className="h-4 w-4 accent-[#b91c1c]"
            />
          </label>
          <div className="mt-2 border-t border-white/10 pt-2">
            <label className="flex items-center justify-between gap-3 py-1 text-xs text-[#d6d3cd]">
              <span>Volumen general</span>
              <span className="font-mono-tabular text-[11px] text-[#9c968c]">
                {settings.audioMuted ? 'Silencio' : `${Math.round((settings.audioVolume ?? 0.85) * 100)}%`}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((settings.audioVolume ?? 0.85) * 100)}
              aria-label="Volumen general"
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  audioVolume: Number(e.target.value) / 100,
                  audioMuted: Number(e.target.value) === 0 ? true : false,
                })
              }
              className="mt-1 h-1.5 w-full cursor-pointer accent-[#b91c1c]"
            />
            <label className="mt-1.5 flex cursor-pointer items-center justify-between gap-3 py-1 text-xs text-[#d6d3cd]">
              <span>Silenciar audio</span>
              <input
                type="checkbox"
                checked={Boolean(settings.audioMuted)}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    audioMuted: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-[#b91c1c]"
              />
            </label>
          </div>
        </fieldset>

        <div className="mt-5 border-t border-white/10 pt-4 text-[11px] leading-relaxed text-[#847e74]">
          WASD: Mover · Shift: Correr · F: Linterna · Clic izq.: Interactuar · Esc / P: Pausa
        </div>
      </div>
    </div>
  );
};
