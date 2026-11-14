import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { NoteModal } from './components/NoteModal';
import { PauseModal } from './components/PauseModal';
import { TitleScreen } from './components/TitleScreen';
import { HorrorGameEngine } from './game/engine';
import { TOTAL_KEYS } from './game/mapData';
import type {
  AccessibilitySettings,
  ActiveNoteData,
  GameStatus,
  HudSnapshot,
} from './game/types';

const SETTINGS_STORAGE_KEY = 'dlb_accessibility_v1';

function shouldAutostart(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

function loadAccessibilitySettings(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { reducedCameraMotion: false, disableFlashes: false };
    const parsed = JSON.parse(raw) as Partial<AccessibilitySettings>;
    return {
      reducedCameraMotion: Boolean(parsed.reducedCameraMotion),
      disableFlashes: Boolean(parsed.disableFlashes),
    };
  } catch {
    return { reducedCameraMotion: false, disableFlashes: false };
  }
}

export default function App() {
  const initialAutostart = shouldAutostart();
  const [status, setStatus] = useState<GameStatus>(
    initialAutostart ? 'playing' : 'title',
  );
  const [settings, setSettings] = useState<AccessibilitySettings>(loadAccessibilitySettings);
  const [activeNote, setActiveNote] = useState<ActiveNoteData | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudSnapshot>({
    stamina: 100,
    exhausted: false,
    isSprinting: false,
    pointerLocked: false,
    zoneName: 'Recepción',
    flashlightOn: true,
    keysCollected: 0,
    totalKeys: TOTAL_KEYS,
    objectiveText: 'Encuentra las tres llaves.',
    exitUnlocked: false,
    prompt: { visible: false, keyLabel: 'E', text: '' },
    notification: null,
  });

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const staminaFillRef = useRef<HTMLDivElement | null>(null);
  const vignetteRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<HorrorGameEngine | null>(null);
  const statusRef = useRef<GameStatus>(status);

  useEffect(() => {
    statusRef.current = status;
    document.body.dataset.state = status;
    engineRef.current?.setStaminaBarElement(staminaFillRef.current);
    engineRef.current?.setVignetteElement(vignetteRef.current);
    engineRef.current?.setStatus(status, false);
  }, [status]);

  useEffect(() => {
    engineRef.current?.setAccessibilitySettings(settings);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }, [settings]);

  // Mount Three.js WebGLRenderer once outside HUD re-renders
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    document.body.dataset.state = statusRef.current;

    const engine = new HorrorGameEngine(mountEl, {
      onCapture: () => {
        statusRef.current = 'captured';
        setStatus('captured');
      },
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onOpenNote: (note) => {
        setActiveNote(note);
        setStatus('reading');
      },
      onPauseRequest: () => {
        if (statusRef.current === 'playing') {
          setStatus('paused');
        }
      },
      onWebglError: (msg) => {
        setWebglError(msg);
      },
    });

    engine.setStaminaBarElement(staminaFillRef.current);
    engine.setVignetteElement(vignetteRef.current);
    engine.setAccessibilitySettings(settings);
    engine.setStatus(statusRef.current, statusRef.current === 'playing');
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActiveNote(null);
    document.body.dataset.state = 'playing';
    engineRef.current?.setStatus('playing', true);
    engineRef.current?.requestPointerLock();
    setStatus('playing');
  }, []);

  const handleResume = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActiveNote(null);
    document.body.dataset.state = 'playing';
    engineRef.current?.setStatus('playing', false);
    engineRef.current?.requestPointerLock();
    setStatus('playing');
  }, []);

  const handleCloseNote = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActiveNote(null);
    document.body.dataset.state = 'playing';
    engineRef.current?.setStatus('playing', false);
    engineRef.current?.requestPointerLock();
    setStatus('playing');
  }, []);

  const handleRestart = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActiveNote(null);
    document.body.dataset.state = 'playing';
    engineRef.current?.setStatus('playing', true);
    engineRef.current?.requestPointerLock();
    setStatus('playing');
  }, []);

  const handleReturnToTitle = useCallback(() => {
    setActiveNote(null);
    document.body.dataset.state = 'title';
    engineRef.current?.setStatus('title', true);
    setStatus('title');
  }, []);

  // Global keyboard shortcuts for Title start, Note close, and Pause toggle
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (statusRef.current === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStart();
        }
        return;
      }

      if (statusRef.current === 'reading') {
        if (e.code === 'Escape' || e.code === 'KeyE') {
          e.preventDefault();
          handleCloseNote();
        }
        return;
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (statusRef.current === 'playing') {
          e.preventDefault();
          setStatus('paused');
        } else if (statusRef.current === 'paused') {
          e.preventDefault();
          handleResume();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCloseNote, handleResume, handleStart]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#06070a]">
      {/* Dedicated isolated WebGL canvas container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Escenario 3D del edificio abandonado"
      />

      {webglError && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#06070a] p-6 text-center">
          <div className="max-w-md border border-white/15 bg-[#0d1016] p-8">
            <h2 className="font-display text-xl font-bold text-[#ece8e0]">
              Error de gráficos 3D
            </h2>
            <p className="mt-3 text-sm text-[#a8a298]">{webglError}</p>
          </div>
        </div>
      )}

      {status === 'title' && !webglError && (
        <TitleScreen onStart={handleStart} />
      )}

      {(status === 'playing' || status === 'reading') && !webglError && (
        <GameHud
          hud={hud}
          staminaFillRef={staminaFillRef}
          vignetteRef={vignetteRef}
          onPause={() => setStatus('paused')}
        />
      )}

      {status === 'reading' && activeNote && !webglError && (
        <NoteModal note={activeNote} onClose={handleCloseNote} />
      )}

      {status === 'captured' && !webglError && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="capture-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 text-center animate-[fadeIn_.6s_ease-out]"
        >
          <div className="max-w-md border border-white/15 bg-[#0d1016] p-8 text-[#ece8e0]">
            <p className="text-xs tracking-[.3em] text-red-400">THE WATCHER</p>
            <h2 id="capture-title" className="mt-4 text-2xl">
              Te ha alcanzado.
            </h2>
            <p className="my-6 text-sm text-stone-400">
              Míralo para detenerlo. Las paredes y las puertas cerradas interrumpen tu mirada.
            </p>
            <button
              autoFocus
              className="border border-white/30 px-6 py-3 hover:bg-white/10"
              onClick={handleRestart}
            >
              Reiniciar partida
            </button>
            <button
              className="mt-4 block w-full text-sm text-stone-400"
              onClick={handleReturnToTitle}
            >
              Volver al inicio
            </button>
          </div>
        </div>
      )}

      {status === 'paused' && !webglError && (
        <PauseModal
          settings={settings}
          onUpdateSettings={setSettings}
          onResume={handleResume}
          onRestart={handleRestart}
          onReturnToTitle={handleReturnToTitle}
        />
      )}
    </div>
  );
}
