import type { FC, RefObject } from 'react';
import { Flashlight, KeyRound, Pause } from 'lucide-react';
import type { HudSnapshot } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  staminaFillRef: RefObject<HTMLDivElement | null>;
  vignetteRef: RefObject<HTMLDivElement | null>;
  onPause: () => void;
}

export const GameHud: FC<GameHudProps> = ({
  hud,
  staminaFillRef,
  vignetteRef,
  onPause,
}) => {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-6">
      {/* Subtle atmospheric peripheral vignette (modulated by tension via DOM ref) */}
      <div
        ref={vignetteRef}
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 55%, rgba(3,4,6,0.72) 100%)',
        }}
      />

      {/* Top perimeter row */}
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium tracking-[0.18em] text-[#8d877d] uppercase">
              Ubicación
            </span>
            <span
              data-testid="hud-zone"
              className="text-sm font-medium text-[#e5e2dc]"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
            >
              {hud.zoneName}
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium tracking-[0.18em] text-[#8d877d] uppercase">
              Objetivo
            </span>
            <span
              data-testid="hud-objective"
              className={`text-xs font-medium tracking-wide ${
                hud.keysCollected >= hud.totalKeys
                  ? 'text-[#eab308]'
                  : 'text-[#d6d3cd]'
              }`}
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
            >
              {hud.objectiveText}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          {/* Keys counter */}
          <div
            data-testid="hud-keys"
            className="flex h-10 items-center gap-2 border border-white/15 bg-[#0a0c10]/85 px-3 text-xs tracking-[0.12em] text-[#e5e2dc] uppercase"
          >
            <KeyRound
              className={`h-3.5 w-3.5 ${
                hud.keysCollected > 0 ? 'text-[#eab308]' : 'text-[#8d877d]'
              }`}
              aria-hidden="true"
            />
            <span className="font-mono-tabular font-semibold">
              LLAVES: {hud.keysCollected}/{hud.totalKeys}
            </span>
          </div>

          {/* Discreet flashlight status */}
          <div
            data-testid="hud-flashlight"
            className="flex h-10 items-center gap-2 border border-white/15 bg-[#0a0c10]/85 px-3 text-xs tracking-[0.1em] uppercase"
          >
            <Flashlight
              className={`h-3.5 w-3.5 ${
                hud.flashlightOn ? 'text-[#f4ead2]' : 'text-[#6c675f]'
              }`}
              aria-hidden="true"
            />
            <span
              className={hud.flashlightOn ? 'text-[#e5e2dc]' : 'text-[#8d877d]'}
            >
              [F] {hud.flashlightOn ? 'Encendida' : 'Apagada'}
            </span>
          </div>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pausar juego"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="pointer-events-auto flex h-10 w-10 cursor-pointer items-center justify-center border border-white/15 bg-[#0a0c10]/85 text-[#e5e2dc] transition-colors hover:border-white/35 hover:bg-[#14171f]"
            title="Pausa (P / Esc)"
          >
            <Pause className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Temporary feedback notification banner */}
      {hud.notification && (
        <div
          key={hud.notification.id}
          data-testid="hud-notification"
          className={`pointer-events-none fixed left-1/2 top-20 z-20 max-w-md -translate-x-1/2 border px-4 py-2.5 text-center text-xs leading-relaxed tracking-wide ${
            hud.notification.tone === 'alert'
              ? 'border-[#b91c1c]/80 bg-[#1a0a0c]/92 text-[#fca5a5]'
              : hud.notification.tone === 'key'
                ? 'border-[#d97706]/75 bg-[#12100a]/92 text-[#fde68a]'
                : 'border-white/20 bg-[#0a0c10]/92 text-[#ece8e0]'
          }`}
        >
          {hud.notification.text}
        </div>
      )}

      {/* Center Reticle & Contextual Interaction Prompt */}
      <div
        className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle
            cx="8"
            cy="8"
            r="2"
            fill="#e5e2dc"
            fillOpacity={hud.pointerLocked ? '0.85' : '0.45'}
          />
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="#000000"
            strokeOpacity="0.45"
            strokeWidth="1"
          />
        </svg>
      </div>

      {hud.prompt.visible && (
        <div
          data-testid="hud-interact-prompt"
          className="pointer-events-none fixed left-1/2 top-[56%] z-20 flex -translate-x-1/2 items-center gap-2.5 border border-white/15 bg-[#080a0e]/90 px-4 py-2 text-xs tracking-wide text-[#ece8e0]"
        >
          <span
            className={`font-mono-tabular inline-flex h-5 min-w-5 items-center justify-center border px-1 text-[11px] font-semibold ${
              hud.prompt.locked
                ? 'border-[#b91c1c]/80 text-[#f87171]'
                : 'border-white/30 text-[#ece8e0]'
            }`}
          >
            {hud.prompt.keyLabel}
          </span>
          <span>{hud.prompt.text}</span>
        </div>
      )}

      {/* Bottom perimeter row */}
      <div className="relative z-10 flex items-end justify-between gap-4">
        <div className="w-56">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11px] font-medium tracking-[0.16em] text-[#9b958b] uppercase">
              {hud.exhausted ? 'Agotado' : 'Resistencia'}
            </span>
            <span
              data-testid="hud-stamina-value"
              className="font-mono-tabular text-xs text-[#d6d3cd]"
            >
              {hud.stamina}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-white/15 bg-[#080a0e]/85">
            <div
              ref={staminaFillRef}
              className="h-full w-full origin-left transition-colors duration-150"
              style={{
                transform: 'scaleX(1)',
                backgroundColor: '#d6d3cd',
              }}
            />
          </div>
        </div>

        {!hud.pointerLocked && (
          <div
            className="text-right text-xs tracking-wide text-[#9e988e]"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
          >
            Clic para fijar ratón · F Linterna · E Interactuar · ←/→ o arrastrar para mirar
          </div>
        )}
      </div>
    </div>
  );
};
