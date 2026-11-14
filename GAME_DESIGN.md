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
├── App.tsx                     # Orquestación de estados ('title' | 'playing' | 'paused' | 'reading' | 'caught' | 'death_animation' | 'gameover' | 'restarting')
├── components/
│   ├── TitleScreen.tsx         # Pantalla inicial atmosférica con emblema SVG y controles
│   ├── GameHud.tsx             # HUD minimalista (ubicación, objetivo, llaves 0/3, linterna [F], retícula, prompt [E], avisos, resistencia)
│   ├── NoteModal.tsx           # Modal legible para lectura de notas con cierre por Esc / E / botón
│   ├── PauseModal.tsx          # Menú de pausa (Esc / P)
│   └── DeathScreen.tsx         # Pantalla definitiva de derrota cinematográfica ('NO DEBISTE ACERCARTE.')
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
    ├── player.ts               # Controlador FPS (PointerLock + fallback, WASD, Shift, F, E, damping, trauma/comfort)
    ├── watcherModel.ts         # Rig articulado completo (caderas, torso, cuello, cabeza, hombros, codos, manos, dedos, rodillas, pies)
    ├── watcher.ts              # IA de THE WATCHER, alcance letal continuo de 360°, giro progresivo, detección visual, reubicación oculta y ataque
    ├── tension.ts              # Sistema de tensión dinámica de 4 niveles (sin barra en HUD)
    ├── spatialAudio.ts         # Audio posicional 3D Web Audio HRTF, secuencia de muerte sincronizada y drone de Game Over
    ├── supernatural.ts         # Eventos sobrenaturales (puertas, golpes, luces, susurros, silencio, aparición)
    ├── jumpscares.ts           # Sustos ambientales, silueta 3D en penumbra y reacción al ataque
    └── engine.ts               # Ciclo Three.js, secuencia cinematográfica de muerte en 4 etapas, niebla dinámica, polvo y bucle delta
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

### Implementado — Fase 5 (Terror Psicológico, Animaciones Articuladas y Audio 3D)
- [x] **Rig articulado de THE WATCHER (`watcherModel.ts`)**: Jerarquía completa con pivotes para caderas/pelvis, torso, cuello, cabeza, hombros, brazos, codos, manos, dedos individuales, muslos, rodillas y pies con alineación al suelo.
- [x] **Estados y transiciones suaves (`IDLE`, `WALK`, `RUN`, `FROZEN`, `ATTACK`)**: Respiración y tics inquietantes en inactividad; marcha asimétrica sincronizada por distancia; carrera agresiva con inclinación del torso y seguimiento sutil de cabeza; congelación instantánea al ser observado (sin desplazamiento ni pasos); secuencia breve de ataque (`0.58 s`) con extensión de brazos, sonido aterrador y reacción de cámara antes de la pantalla provisional de captura.
- [x] **Audio 3D espacial (`spatialAudio.ts`)**: `PannerNode` HRTF conectado al `AudioListener` de cámara con atenuación paso bajo según paredes/puertas cerradas intermedias (`computeWallAttenuation`). Incluye pasos lentos/rápidos sincronizados a la pisada, respiración distorsionada, gruñidos ocasionales, crujido articular, zumbido grave de proximidad, golpes, portazos, susurros y respiración agitada del jugador.
- [x] **Tensión dinámica invisible (`tension.ts`)**: Cálculo continuo en 4 niveles internos (`1: Calma inquietante`, `2: Sospecha`, `3: Peligro`, `4: Persecución`) con histéresis y transiciones suaves en audio, niebla y viñeta periférica.
- [x] **Eventos sobrenaturales (`supernatural.ts`)**: Portazos seguros sin bloquear ni atravesar actores, golpes espaciales en paredes, fallos eléctricos en luminarias (no estroboscópicos), susurros posicionales, silencio repentino y reubicación controlada fuera de vista sobre ruta A* válida.
- [x] **Sustos controlados (`jumpscares.ts`)**: Susto ambiental, silueta 3D en penumbra que desaparece al dejar de mirarla y susto del monstruo al capturar, con enfriamiento estricto y bloqueo total durante la lectura de notas.
- [x] **Mejoras visuales y accesibilidad (`PauseModal.tsx`)**: Niebla y oscurecimiento dinámicos, partículas de polvo por ala/sótano y opciones persistentes para **Reducir movimiento de cámara** y **Desactivar destellos ambientales**.

### Implementado — Fase 6 (Agresividad, Alcance Letal y Muerte Cinematográfica)
- [x] **Zona de alcance letal de 360° (`watcher.ts`)**: Comprobación continua (`isInsideLethalReach`) sobre el segmento de desplazamiento del jugador (`prevPlayer -> curPlayer`) dentro de un radio físico real de **1.65 m** (acorde al radio del jugador `0.42 m`, cuerpo del monstruo `0.46 m` y alcance de brazos largos). Impide atravesar al monstruo o pasar junto a él al esprintar; las paredes, pilares y puertas cerradas bloquean estrictamente cualquier ataque.
- [x] **Mirar no da invencibilidad (`watcher.ts`)**: Observar a THE WATCHER a distancia segura (`> 1.65 m`) lo congela al instante (`FROZEN`). Entrar en su alcance físico real (`<= 1.65 m`) desencadena `ATTACK` inmediatamente incluso si el jugador lo está mirando.
- [x] **Separación física corporal (`resolveWatcherBodyCollision`)**: Evita que el jugador atraviese limpiamente el torso de la criatura sin contacto físico.
- [x] **Mayor agresividad y respuesta (`WATCHER_DIFFICULTY`)**: Persecución `CHASE` automática dentro de los `5.0 m` de radio de peligro, velocidades progresivas (`1.15` → `2.95 m/s`, con repuntes de hasta `3.32 m/s` a corta distancia, por debajo del esprint y caminar del jugador), replanificación rápida al perder contacto visual y recuperación ágil ante obstáculos.
- [x] **Secuencia cinematográfica de muerte en 4 etapas (`1.50 s`, `engine.ts` + `watcherModel.ts` + `spatialAudio.ts`)**:
  1. Captura única (`caught`) con bloqueo total de controles, liberación del puntero e impacto sonoro inmediato.
  2. Animación 3D articulada con giro rápido hacia la víctima, inclinación agresiva del torso, extensión de brazos y cierre de garras hacia la cámara.
  3. Encuadre cercano de cámara libre de muros, cierre dramático de FOV e impacto controlado respetando *Reducir movimiento de cámara*.
  4. Interferencia breve (`interferenceRef`) y oscurecimiento progresivo a negro (`blackoutRef`) sincronizados con estática y caída subgrave antes de pasar a `gameover`.
- [x] **Pantalla original de derrota (`DeathScreen.tsx`)**: Fondo casi negro con viñeta carmesí y líneas de escaneo sutiles, texto **`NO DEBISTE ACERCARTE.`** / **`LA PRÓXIMA VEZ, MANTÉN TU DISTANCIA.`**, ambiente sonoro oscuro y botones **`REINTENTAR`** y **`MENÚ PRINCIPAL`** con reinicio íntegro sin fugas ni instancias duplicadas.

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

Modelo local sin descargas, de unos 2.85 m (1.7 veces la altura de ojos del jugador), piel mate grisácea deteriorada, cráneo con rasgos oscuros texturizados, torso encorvado, piernas largas y brazos con dedos casi hasta el suelo. Una geometría esférica de baja resolución compartida construye la silueta orgánica. En Fase 5 se reestructura en una jerarquía articulada completa (caderas, torso, cuello, cabeza, hombros, codos, manos, dedos, muslos, rodillas y pies) conservando las UV del atlas existente. Se encorva al acercarse a los marcos de 2.5 m y mantiene los pies alineados con el suelo.

**Actualización de superficie:** mapas del paquete de texturas adaptados a las UV del modelo existente. Albedo sRGB, normal OpenGL y ORM compartido (AO/roughness/metallic=0), sin modificar proporciones ni identidad visual. Detalles de generación y validación en `assets/monster/README.md`.

**Estados:** PATROL recorre destinos cuando el jugador está lejos y todavía no tiene llaves; STALK se aproxima; CHASE se activa dentro de `5.0 m`, con dos llaves o con una a menos de `12 m`; FROZEN tiene prioridad sobre movimiento a distancia segura (`> 1.65 m`), pero **no otorga invencibilidad dentro del alcance físico letal (`<= 1.65 m`)**; ATTACK ejecuta la secuencia cinematográfica de `1.50 s` antes de mostrar `DeathScreen`. Pausa y lectura suspenden la IA y los sustos, incluso en el fotograma que abre una nota.

**Mirada:** se prueban cabeza, torso, hombros y piernas contra la zona central de la cámara (86% del semiancho, 92% del semialto). Cada punto visible requiere raycasting libre contra geometría real de muros, dinteles, muebles, columnas, suelo, escalera y hojas móviles. No depende de la linterna. Una cabeza expuesta por encima de un mueble puede congelarlo; una pared que oculta todo el cuerpo no. Las matrices se actualizan antes de cada comprobación.

**Introducción:** mínimo 18 segundos de juego activo. Se elige entre cinco posiciones válidas a más de 14 m, fuera de la vista y con ruta posible hacia el jugador. Si todas están visibles o aisladas, la aparición espera.

| Llaves | Velocidad de aproximación (m/s) | Intervalo de ruta (s) |
| --- | --- | --- |
| 0 | 1.15 | 1.15 |
| 1 | 1.65 | 0.80 |
| 2 | 2.35 | 0.48 |
| 3 | 2.95 | 0.28 |

PATROL usa el 72% de esa velocidad. La velocidad base máxima (`2.95 m/s`) y el empuje de peligro (`<= 3.32 m/s`) siguen por debajo de caminar (`3.4 m/s`) y esprintar (`5.6 m/s`). Alcance letal de captura continua: **1.65 m** en 360°, mismo nivel de apoyo y segmento libre de muros, pilares o puertas cerradas, comprobado antes de congelar por mirada.

## 8. Navegación, puertas y coste

- `expansion.ts`: habitaciones, obstáculos adicionales y altura compartida del suelo.
- `expansionVisuals.ts`: mobiliario clínico, generador, escaleras y señales. Cajas agrupadas por material con InstancedMesh.
- `navigation.ts`: grafo estático de puntos cada 0.5 m, ocho vecinos, A* con heap y radio conservador de 0.46 m. Segmentos contra cajas expandidas impiden cortar esquinas.
- `watcher.ts` y `watcherModel.ts`: rig articulado, transiciones suaves, giro progresivo, recuperación ante bloqueos, detección visual y reubicación oculta.
- `phase4QA.ts`: panel de inspección solo en desarrollo; no se monta en producción.

Las hojas abiertas conservan una caja física calculada desde su transformación. El paso permanece bloqueado hasta una apertura suficiente (1.25 rad). La animación no barre sobre jugador ni enemigo; cerrar un acceso ocupado (tanto por jugador como por eventos sobrenaturales) espera.

Se mantienen seis luces puntuales, redistribuidas entre las alas, y la linterna. No se añadieron dependencias de producción. El audio 3D es 100% procedural Web Audio con presupuesto de voces y sin descargas externas susceptibles de 404.

## 9. Validación de Fases 4, 5 y 6

Comandos: `npm test`, `npm run lint`, `npm run build`.

La suite automatizada (`physics.test.ts`, `watcher.test.ts`, `watcherSurface.test.ts`, `phase5.test.ts`, `phase6.test.ts`) comprueba:
- BFS del perímetro y accesibilidad de las 16 áreas; rutas a las tres llaves.
- A* sin penetración, puertas cerradas, hojas realmente abiertas y protección del barrido sobre ocupantes.
- Persecución simulada por ambas alas y descenso/ascenso del sótano, sin atravesar paredes ni muebles.
- Mirada lejana (`> 1.65 m`) que congela al instante, oclusión total/parcial y alcance letal continuo de 360° (`<= 1.65 m`) que ataca incluso al ser mirado, sin atravesar muros ni puertas cerradas, ni permitir túneles al esprintar.
- Jerarquía articulada completa, poses diferenciadas (`IDLE`, `WALK`, `RUN`, `FROZEN`, `ATTACK`), extensión y cierre de garras en ataque, sincronización de pisadas, consistencia a 30/120 FPS, giro progresivo, reubicación oculta, atenuación acústica por paredes, niveles de tensión 1–4, seguridad de portazos sobrenaturales, bloqueo de sustos durante lectura de notas y reinicios consecutivos limpios.

**Verificación manual recomendada en navegador y hardware objetivo:**
- Percepción subjetiva de espacialidad HRTF con auriculares (izquierda/derecha/detrás y atenuación tras muros).
- Equilibrio de tensión y frecuencia real de eventos sobrenaturales durante una partida completa recogiendo las tres llaves y escapando.
- Fluidez sostenida en equipos sin GPU dedicada.

## 10. Pendiente para fases posteriores

- Secuencia completa de victoria al cruzar la puerta principal de salida.
- Estadísticas de partida en la pantalla de derrota/victoria.
- Sistema de guardado / selector de dificultad o ajustes de volumen de audio.
- Calibración fina de ritmo y dificultad tras pruebas de juego completas con humanos.

