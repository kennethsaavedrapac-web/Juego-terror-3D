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
├── App.tsx                     # Orquestación de estados ('title' | 'playing' | 'paused' | 'reading' | 'captured')
├── components/
│   ├── TitleScreen.tsx         # Pantalla inicial atmosférica con emblema SVG y controles
│   ├── GameHud.tsx             # HUD minimalista (ubicación, objetivo, llaves 0/3, linterna [F], retícula, prompt [E], avisos, resistencia)
│   ├── NoteModal.tsx           # Modal legible para lectura de notas con cierre por Esc / E / botón
│   └── PauseModal.tsx          # Menú de pausa (Esc / P)
└── game/
    ├── types.ts                # Tipos de estado, habitaciones, puertas, llaves, notas, examinables y HUD
    ├── mapData.ts              # Representación lógica del edificio (16 áreas, circuitos laterales y sótano, muros, puertas, props, 3 llaves, 3 notas y 3 examinables)
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

## 4. Distribución original (Fases 2 y 3, ampliada en sección 6)
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
- [x] **Sistema de tres llaves e inventario**: Tres llaves metálicas 3D con identidades de Recepción, Oficina y Almacén (ubicaciones actualizadas en Fase 4), contador `LLAVES: X/3`, objetivo dinámico (`Encuentra las tres llaves.` → `Regresa a la salida.`) y desbloqueo animado de la puerta doble principal.
- [x] **Notas misteriosas y objetos examinables**: Tres notas físicas con modal legible (`NoteModal`) que pausa el movimiento durante la lectura y tres objetos examinables (teléfono, reloj detenido `03:17` y fotografía rayada).
- [x] **Audio procedural de Fase 3**: Sonidos Web Audio para linterna, recogida de llaves, lectura de notas, inspección y desbloqueo de la salida.

### Implementado — Fase 4 (Expansión y amenaza)
- [x] Ocho áreas adicionales: galería administrativa, reuniones, administración, galería clínica, pacientes, generadores, escalera y sótano.
- [x] THE WATCHER procedural, articulado, con marcha, persecución y congelación inmediata.
- [x] A* sobre grafo de suelo, puertas dinámicas, oclusión real y progresión con las llaves.
- [x] Captura provisional con movimiento detenido y reinicio completo.

## 6. Mapa ampliado

Las ocho áreas originales se conservan. Las nuevas alas amplían el ancho de 26 a 54 metros; el edificio llega hasta Z=-32. Se mantienen los circuitos originales y se añaden:

- **Oeste:** Oficina ↔ galería administrativa ↔ Archivos. Reuniones y Administración tienen entradas desde la galería y una conexión interna. El tabique de Administración corta las líneas de visión.
- **Este:** Almacén ↔ galería clínica ↔ Baños. Pacientes y Generadores se conectan a la galería y entre sí. Camas, camilla, cortinas, monitor y soporte médico identifican la clínica; generador, conducciones, banco y estanterías identifican el taller.
- **Sótano:** galería clínica → escalera de servicio de 8 m → depósito a Y=-3. Tiene columnas, estantería, cajas y una cámara de aislamiento sellada. Esta cámara es escenografía cerrada deliberadamente, no una habitación jugable desconectada.

La escalera está en una huella XZ exclusiva (X=13..17, Z=-22..-14). Jugador y enemigo comparten la misma altura continua de apoyo, con peldaños visuales y sin salto entre plantas. No existen plantas jugables superpuestas que confundan el grafo 2D. El acceso inferior tiene dintel; las paredes laterales cierran toda la bajada.

**Llaves conservadas:**

| ID | Ubicación | Coordenadas X, Y, Z |
| --- | --- | --- |
| key-recepcion | Mostrador de Recepción | -4.16, 0.96, 14.95 |
| key-oficina | Escritorio de Administración | -19.4, 0.795, -9.8 |
| key-almacen | Cajas del depósito del sótano | 25.38, -1.8, -24.1 |

La nota del vigilante explica el traslado. Sus IDs, inventario y desbloqueo de salida se mantienen. Se desplazaron la estantería este del almacén y las cabinas de baño para liberar los nuevos accesos.

## 7. THE WATCHER

Modelo local sin descargas, de unos 2.85 m (1.7 veces la altura de ojos del jugador), piel mate oscura, cráneo sin rostro, torso encorvado, piernas largas y brazos con dedos casi hasta el suelo. Una geometría esférica de baja resolución compartida construye la silueta orgánica. Cabeza, brazos y piernas usan pivotes separados. Se encorva al acercarse a los marcos de 2.5 m. La marcha conserva fase y suaviza la amplitud; FROZEN conserva exactamente posición y pose.

**Estados:** PATROL recorre destinos cuando el jugador está lejos y todavía no tiene llaves; STALK se aproxima; CHASE se activa con dos llaves o con una a corta distancia; FROZEN tiene prioridad absoluta sobre movimiento y captura; ATTACK registra una única captura y detiene la partida. Pausa y lectura suspenden la IA, incluso en el fotograma que abre una nota.

**Mirada:** se prueban cabeza, torso, hombros y piernas contra la zona central de la cámara (86% del semiancho, 92% del semialto). Cada punto visible requiere raycasting libre contra geometría real de muros, dinteles, muebles, columnas, suelo, escalera y hojas móviles. No depende de la linterna. Una cabeza expuesta por encima de un mueble puede congelarlo; una pared que oculta todo el cuerpo no. Las matrices se actualizan antes de cada comprobación. No se reduce la frecuencia de la mirada, solo la búsqueda de rutas.

**Introducción:** mínimo 18 segundos de juego activo. Se elige entre cinco posiciones válidas a más de 14 m, fuera de la vista y con ruta posible hacia el jugador. Si todas están visibles o aisladas, la aparición espera. No se vuelve a teletransportar. El corredor central ofrece el primer encuentro a distancia; al observarlo aparece un aviso breve con la regla.

| Llaves | Velocidad de aproximación (m/s) | Intervalo de ruta (s) |
| --- | --- | --- |
| 0 | 0.85 | 1.50 |
| 1 | 1.20 | 1.10 |
| 2 | 1.65 | 0.70 |
| 3 | 2.15 | 0.45 |

PATROL usa el 70% de esa velocidad. La máxima sigue por debajo de caminar (3.4 m/s). Distancia de captura: 0.85 m, mismo nivel de apoyo y segmento sin obstáculos, siempre después de comprobar la mirada.

## 8. Navegación, puertas y coste

- `expansion.ts`: habitaciones, obstáculos adicionales y altura compartida del suelo.
- `expansionVisuals.ts`: mobiliario clínico, generador, escaleras y señales. Cajas agrupadas por material con InstancedMesh.
- `navigation.ts`: grafo estático de puntos cada 0.5 m, ocho vecinos, A* con heap y radio conservador de 0.46 m. Segmentos contra cajas expandidas impiden cortar esquinas.
- `watcher.ts`: estados, aparición, dificultad, captura y visión multipunto.
- `watcherModel.ts`: modelo, animación y liberación de recursos.
- `phase4QA.ts`: panel de inspección solo en desarrollo; no se monta en producción.

Las hojas abiertas conservan una caja física calculada desde su transformación. El paso permanece bloqueado hasta una apertura suficiente (1.25 rad). La animación no barre sobre jugador ni enemigo; cerrar un acceso ocupado espera. Si cambia una puerta, el enemigo verifica cada avance contra los colliders actuales, invalida la ruta bloqueada y vuelve a buscar. Puede esperar ante una zona cerrada; no abre ni atraviesa puertas.

Se mantienen seis luces puntuales, redistribuidas entre las alas, y la linterna. No se añadieron dependencias de producción. La búsqueda se ejecuta a intervalos; la detección visual descarta puntos fuera de pantalla antes de lanzar rayos. El movimiento conserva subpasos y límite de delta. Texturas, geometrías, instancias y materiales se liberan al desmontar.

## 9. Validación de Fase 4

Comandos: `bun install --frozen-lockfile`, `npm test`, `npm run lint`, `npm run build`. Se usa Bun 1.4.4 para respetar el lockfile existente.

La suite automatizada comprueba:
- BFS del perímetro y accesibilidad de las 16 áreas; rutas a las tres llaves.
- A* sin penetración, puertas cerradas, hojas realmente abiertas y protección del barrido sobre ocupantes.
- Persecución simulada por ambas alas y descenso/ascenso del sótano, sin atravesar paredes ni muebles.
- Objetivo pegado a una pared, evitando que el mayor radio del enemigo lo deje bloqueado.
- Mirada lejana, oclusión total/parcial, cámara de espaldas o hacia arriba, giro inmediato y prioridad de congelación sobre captura con 0–3 llaves.
- Aparición diferida, animación y congelación de pose, captura única y reinicio, además de las pruebas previas de movimiento, stamina e inventario.

Inspección en navegador local: inicio, silueta, clínica, oficinas, escalera, sótano, captura y reinicio. La consola no mostró errores de ejecución. Lecturas observadas en este entorno: alrededor de 59–60 FPS; no equivalen a una garantía para todos los equipos sin GPU dedicada.

Para repetir la inspección, iniciar `npm run dev` y abrir `http://127.0.0.1:3000/?autostart=1&qa=1`. El panel permite saltar entre zonas y preparar un encuentro reproducible; muestra FPS, draw calls, triángulos, estado y coordenadas. “Girar 180°” permite contrastar FROZEN y STALK sin usar el ratón. La partida normal no muestra este panel.

**Prueba manual restante de aceptación y equilibrio:** completar una partida normal recogiendo las tres llaves, abrir/cerrar puertas durante la huida, leer una nota con el enemigo cerca y comprobar que pausa, probar F y Shift, regresar a la salida y reiniciar tras captura. Repetir durante varios minutos en el equipo de menor capacidad previsto y comprobar fluidez, legibilidad en esquinas y comodidad del control con ratón. La simulación valida recorridos, pero no sustituye esta valoración de dificultad ni la medición en hardware objetivo.

## 10. Pendiente para fases posteriores

- Jumpscare, secuencia de muerte y pantalla de derrota definitivos.
- Secuencia completa de victoria al cruzar la salida (se conserva el desbloqueo provisional).
- Efectos psicológicos avanzados, ambiente sonoro completo, respiración y latidos.
- Ajuste de dificultad a partir de partidas humanas y mediciones en equipos sin GPU dedicada.
