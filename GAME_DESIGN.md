# DON'T LOOK BACK — Documento de Diseño de Juego (GDD)

## 1. Visión General y Concepto
**DON'T LOOK BACK** es un videojuego corto de terror psicológico 3D en primera persona ejecutable directamente en el navegador mediante WebGL (Three.js + Vite), optimizado para funcionar con fluidez en computadoras sin GPU dedicada.

- **Premisa**: El jugador despierta atrapado en el ala clausurada de un antiguo edificio institucional abandonado. Para escapar con vida debe localizar **tres llaves** ocultas en distintas estancias y desbloquear la puerta de salida principal.
- **Amenaza central**: Una criatura silenciosa acecha por los pasillos. Siguiendo una regla estricta de percepción, **la criatura solo puede desplazarse cuando el jugador NO la está mirando directamente** (fuera del cono de visión o ocluida por paredes/obstáculos).
- **Duración objetivo**: Partida tensa de 4 a 8 minutos con alta rejugabilidad y atmósfera opresiva.

---

## 2. Pilares de Diseño y Rendimiento
1. **Tensión Psicológica sobre Gore**: Oscuridad controlada, niebla exponencial ligera (`FogExp2`), luces de techo débiles cálidas y frías, señalizaciones deterioradas y atmósfera opresiva.
2. **Arquitectura Modular y Ligera**: Cero dependencias de backend o archivos externos pesados. Texturas procedurales en `CanvasTexture`, geometrías y materiales compartidos, tiempo delta (`dt <= 0.05s`) y un máximo de 6 `PointLight` activas más 1 `SpotLight` de linterna sin sombras dinámicas costosas.
3. **Compatibilidad sin GPU dedicada**: Detección automática de renderizado por software (`isSoftwareGl`), límite adaptativo de `pixelRatio`, desactivación selectiva de shadow maps costosos en software WebGL y bucle sincronizado (`afterDraw`) para evitar saturar el hilo principal.

---

## 3. Arquitectura Técnica Actual
```text
src/
├── main.tsx                    # Punto de entrada React/DOM
├── App.tsx                     # Orquestación de estados ('title' | 'playing' | 'paused' | 'reading')
├── components/
│   ├── TitleScreen.tsx         # Pantalla inicial atmosférica con emblema SVG y controles
│   ├── GameHud.tsx             # HUD minimalista (ubicación, objetivo, llaves 0/3, linterna [F], retícula, prompt [E], avisos, resistencia)
│   ├── NoteModal.tsx           # Modal legible para lectura de notas con cierre por Esc / E / botón
│   └── PauseModal.tsx          # Menú de pausa (Esc / P)
└── game/
    ├── types.ts                # Tipos de estado, habitaciones, puertas, llaves, notas, examinables y HUD
    ├── mapData.ts              # Representación lógica del edificio (8 áreas, 2 rutas secundarias, muros, puertas, props, 3 llaves, 3 notas y 3 examinables)
    ├── physics.ts              # Lógica pura determinista (colisiones círculo-AABB, antiatrapamiento de puertas, stamina, oclusión rayo-AABB)
    ├── physics.test.ts         # Pruebas unitarias, BFS del mapa, inventario y oclusión (node:test)
    ├── textures.ts             # Generador procedural de texturas PBR (baldosas, yeso, cerámica, madera, metal, carteles, notas, reloj, foto)
    ├── audio.ts                # Síntesis procedural Web Audio API (puertas, linterna, llaves, notas, examinables, desbloqueo de salida)
    ├── flashlight.ts           # Sistema de linterna FPS (SpotLight en cámara, encendido/apagado suave con F)
    ├── interactions.ts         # Sistema universal de interacción por raycasting desde el centro de cámara con oclusión por paredes/puertas
    ├── inventory.ts            # Gestor central de inventario (llaves recogidas, objetivo dinámico, desbloqueo de salida)
    ├── collectibles.ts         # Modelos 3D y hitboxes para las 3 llaves, 3 notas y 3 objetos examinables
    ├── doors.ts                # Sistema reutilizable de puertas batientes con bisagras y puerta doble de salida desbloqueable
    ├── props.ts                # Constructor de mobiliario y objetos abandonados compartiendo geometrías/materiales
    ├── level.ts                # Ensamblaje del edificio 3D, iluminación estratégica, oclusores y coleccionables
    ├── player.ts               # Controlador FPS (PointerLock + fallback, WASD, Shift, F, E, damping)
    └── engine.ts               # Ciclo Three.js, RoomEnvironment, niebla, polvo ambiental, notificaciones y bucle delta
```

---

## 4. Distribución del Edificio y Objetos (Fases 2 y 3)
El mapa está diseñado con un pasillo principal largo y **dos rutas secundarias conectadas en bucle** para ofrecer esquinas que limitan la visibilidad y rutas de huida/persecución:

- **Recepción** (punto de aparición): Mostrador con llave (*Llave de Recepción*), *Nota de Recepción*, teléfono desconectado examinable, bancos de espera y directorio de ala.
- **Pasillo principal** (25 m de largo): Vigas de techo, tubería aérea, luces fluorescentes parpadeantes y acceso a las alas laterales.
- **Ruta Secundaria Oeste**: `Recepción ↔ Oficina abandonada ↔ Sala de archivos ↔ Pasillo principal`. En **Oficina abandonada** se encuentran la *Llave de Oficina*, el *Registro del Vigilante* y un reloj detenido a las `03:17`.
- **Ruta Secundaria Este**: `Pasillo principal ↔ Almacén ↔ Habitación de mantenimiento ↔ Baños ↔ Pasillo principal`. En **Almacén** se encuentran la *Llave de Almacén* y la *Nota del Almacén*; en **Mantenimiento** reposa una fotografía deteriorada examinable.
- **Vestíbulo de salida norte**: Puerta doble metálica pesada con barra, 3 candados y letrero luminoso `SALIDA`, desbloqueable al reunir las 3 llaves.

---

## 5. Estado de las Fases y Mecánicas

### Implementado — Fase 1 (Cimientos FPS)
- [x] Escenario 3D inicial, cámara FPS (`PointerLock`, arrastre de ratón y flechas `←`/`→`).
- [x] Movimiento `WASD` / flechas con velocidad diagonal normalizada y `head-bob`.
- [x] Correr con `Shift` y sistema de resistencia (`stamina`) con histéresis de agotamiento.
- [x] Colisiones círculo-vs-AABB con deslizamiento en paredes y esquinas.
- [x] Pantalla de título, HUD minimalista y menú de pausa (`Esc` / `P`).

### Implementado — Fase 2 (Edificio y Sistema de Exploración)
- [x] Edificio completo sin pantallas de carga con las 8 áreas conectadas y selladas (`mapData.ts` + verificación BFS).
- [x] Mobiliario, estanterías, cajas, archivadores, cabinas de baño, cuadro eléctrico y carteles por estancia.
- [x] Sistema reutilizable de puertas batientes con bisagra real (`doors.ts`), animación suave, colisión dinámica y prevención de cierre sobre el jugador.
- [x] Iluminación ambiental diferenciada por zonas (6 `PointLight` estratégicas, niebla ligera y `RoomEnvironment` atenuado).

### Implementado — Fase 3 (Linterna, Objetos Interactivos y Sistema de Llaves)
- [x] **Linterna del jugador (`F`)**: `SpotLight` acoplado a la cámara sin sombras dinámicas costosas, haz suave, animación rápida de encendido/apagado e indicador discreto en HUD (sin límite de batería).
- [x] **Sistema universal de interacción por raycasting (`E`)**: Unifica puertas, llaves, notas, objetos examinables y salida principal con comprobación de oclusión contra muros, pilares y puertas cerradas.
- [x] **Sistema de tres llaves e inventario**: Tres llaves metálicas 3D en Recepción, Oficina y Almacén, contador `LLAVES: X/3`, objetivo dinámico (`Encuentra las tres llaves.` → `Regresa a la salida.`) y desbloqueo animado de la puerta doble principal.
- [x] **Notas misteriosas y objetos examinables**: Tres notas físicas con modal legible (`NoteModal`) que pausa el movimiento durante la lectura y tres objetos examinables (teléfono, reloj detenido `03:17` y fotografía rayada).
- [x] **Audio procedural de Fase 3**: Sonidos Web Audio para linterna, recogida de llaves, lectura de notas, inspección y desbloqueo de la salida.

### Pendiente — Fase 4 (Amenaza Principal, Victoria/Derrota y Pulido)
- [ ] **Criatura y línea de visión ("No mires atrás")**: Modelo 3D inquietante, detección de frustum + raycast de oclusión, congelamiento al ser observada y persecución por el grafo de habitaciones cuando no se la mira.
- [ ] **Condiciones de victoria y derrota**: Pantalla de escape al cruzar la salida desbloqueada y secuencia de captura/derrota.
- [ ] **Ambiente sonoro completo**: Dron generativo, pasos según superficie, respiración al agotar resistencia y latido/tensión por proximidad de la criatura.
