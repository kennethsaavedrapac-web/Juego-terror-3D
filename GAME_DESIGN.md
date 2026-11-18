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

### Implementado — Fase 6.1 (Monstruo Más Agresivo, Animaciones Realistas y Llaves Brillantes)
- [x] **Distancia letal aumentada y calibrada (`WATCHER_LETHAL_REACH = 2.65 m`)**:
  - `> 6.0 m`: Seguimiento y búsqueda (`STALK` / `PATROL`).
  - `3.5 m - 6.0 m`: Amenaza creciente (`CHASE` automático, repath rápido <= `0.16 s`).
  - `2.5 m - 3.5 m`: Peligro extremo (repunte de velocidad x1.18, postura de ataque tensa, repath ultraveloz `0.08 s` y advertencia acústica de pre-ataque).
  - `<= 2.65 m`: **ATAQUE LETAL INMEDIATO** continuo en 360°, comprobación swept-segment (`prevPlayer -> curPlayer`) inmune al tunneling por esprint, estrictamente bloqueado por muros y puertas cerradas.
- [x] **Regla esencial de mirada sin invencibilidad**: Mirar al monstruo a distancia segura (`> 2.65 m`) lo congela (`FROZEN`) sin desplazamiento de raíces ni pasos, pero invadir su alcance físico letal (`<= 2.65 m`) activa `ATTACK` inmediatamente incluso observándolo de frente.
- [x] **Agresividad aumentada y reacción casi nula**:
  - Tiempo de reacción nulo (`routeTimer = 0`) al perder contacto visual: replanificación instantánea y acometida en el mismo fotograma.
  - Velocidades de persecución escaladas: 0 llaves (`1.75 m/s`), 1 llave (`2.35 m/s`), 2 llaves (`2.90 m/s`), 3 llaves (`3.32 m/s`, con empujes de peligro de hasta `3.92 m/s`).
  - Trazado suave de esquinas (*corner-cutting*) y recuperación ágil de atascos (`stuckTimer > 0.15 s`).
- [x] **Animaciones orgánicas y rig articulado vivo (`watcherModel.ts`)**:
  - **Respiración orgánica**: Expansión torácica en 3 ejes (X/Y/Z) con frecuencias adaptativas (`1.6 rad/s` en IDLE, `2.5 rad/s` en WALK, `4.6 rad/s` en RUN, `1.3 rad/s` en FROZEN).
  - **Elevación de hombros**: Movimiento vertical sutil de hombros al inhalar y exhalar en todos los estados.
  - **Cabeza y cuello**: Torsiones antinaturales, espasmos predadores y seguimiento fluido de la posición de cámara del jugador (`lookYawOffset`, `lookPitchOffset`).
  - **Brazos y manos**: Codos articulados con inercia, muñecas reactivas y dedos independientes que se contraen, relajan y forman garras amenazantes.
  - **Torso y piernas**: Inclinación agresiva al correr (`-0.52 rad`), transferencia de peso pélvica, flexión marcada de rodillas, asimetría de zancada y pisadas niveladas con el suelo.
  - **Estado FROZEN vivo**: Inmovilidad estricta de raíz y pies (sin deslizamiento), pero manteniendo respiración, elevación de hombros, orientación de cabeza hacia el jugador y tensión en garras.
  - **Ataque 3D cinematográfico**: Embestida física del torso, proyección violenta de brazos hacia la cámara y cierre de garras en 1.50 s.
- [x] **Llaves brillantes de alta visibilidad (`collectibles.ts`)**:
  - Material `emissive` dorado/ámbar cálido (`0xffe277`, `0xffa215`) con pulsación continua de luminosidad.
  - Halo visual mediante `Sprite` con textura procedural de gradiente radial y blending aditivo (visible en oscuridad absoluta con linterna apagada, sin coste de luces dinámicas).
  - Levitación vertical sinusoidal y rotación lenta continua sobre su propio eje.
  - Intensificación de brillo y halo al aproximarse el jugador (`< 7.5 m`).
  - Eliminación limpia al recoger con la tecla E (sin objetos ni halos huérfanos) y restauración completa en reinicio.

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
| 0 | 1.75 | 0.50 |
| 1 | 2.35 | 0.35 |
| 2 | 2.90 | 0.22 |
| 3 | 3.32 | 0.12 |

PATROL usa el 72% de esa velocidad. La velocidad base máxima (`3.32 m/s`) con empuje de peligro cercano (`<= 3.92 m/s`) supera el caminar del jugador (`3.4 m/s`), obligando a esprintar (`5.6 m/s`) o congelar al monstruo con la mirada. Alcance letal de captura continua: **2.65 m** en 360°, mismo nivel de apoyo y segmento libre de muros, pilares o puertas cerradas, comprobado antes de congelar por mirada.

## 8. Navegación, puertas y coste

- `expansion.ts`: habitaciones, obstáculos adicionales y altura compartida del suelo.
- `expansionVisuals.ts`: mobiliario clínico, generador, escaleras y señales. Cajas agrupadas por material con InstancedMesh.
- `navigation.ts`: grafo estático de puntos cada 0.5 m, ocho vecinos, A* con heap y radio conservador de 0.46 m. Segmentos contra cajas expandidas impiden cortar esquinas.
- `watcher.ts` y `watcherModel.ts`: rig articulado, transiciones suaves, giro progresivo, recuperación ante bloqueos, detección visual y reubicación oculta.
- `phase4QA.ts`: panel de inspección solo en desarrollo; no se monta en producción.

Las hojas abiertas conservan una caja física calculada desde su transformación. El paso permanece bloqueado hasta una apertura suficiente (1.25 rad). La animación no barre sobre jugador ni enemigo; cerrar un acceso ocupado (tanto por jugador como por eventos sobrenaturales) espera.

Se mantienen seis luces puntuales, redistribuidas entre las alas, y la linterna. No se añadieron dependencias de producción. El audio 3D es 100% procedural Web Audio con presupuesto de voces y sin descargas externas susceptibles de 404.

## 9. Validación de Fases 4, 5, 6 y 6.1

Comandos: `npm test`, `npm run lint`, `npm run build`.

La suite automatizada (`physics.test.ts`, `watcher.test.ts`, `watcherSurface.test.ts`, `phase5.test.ts`, `phase6.test.ts`, `phase6_1.test.ts`) comprueba:
- BFS del perímetro y accesibilidad de las 16 áreas; rutas a las tres llaves.
- A* sin penetración, puertas cerradas, hojas realmente abiertas y protección del barrido sobre ocupantes.
- Persecución simulada por ambas alas y descenso/ascenso del sótano, sin atravesar paredes ni muebles.
- Mirada lejana (`> 2.65 m`) que congela al instante sin desplazamiento de raíz pero con respiración y microanimaciones vivas.
- Alcance letal continuo de 360° (`<= 2.65 m`) que ataca de inmediato incluso al ser mirado, sin atravesar muros ni puertas cerradas, ni permitir túneles al esprintar.
- Reacción de repath inmediata (`0 s`) al perder contacto visual.
- Jerarquía articulada completa, poses diferenciadas (`IDLE`, `WALK`, `RUN`, `FROZEN`, `ATTACK`), extensión y cierre de garras en ataque, sincronización de pisadas, consistencia a 30/120 FPS, giro progresivo, reubicación oculta, atenuación acústica por paredes, niveles de tensión 1–4, seguridad de portazos sobrenaturales, bloqueo de sustos durante lectura de notas y reinicios consecutivos limpios.
- Tres llaves con material emissive dorado/ámbar cálido, halo visual mediante `Sprite` procedural aditivo, levitación vertical, rotación lenta, intensificación por proximidad y desaparición total en inventario.

**Verificación manual recomendada en navegador y hardware objetivo:**
- Percepción subjetiva de espacialidad HRTF con auriculares (izquierda/derecha/detrás y atenuación tras muros).
- Equilibrio de tensión y frecuencia real de eventos sobrenaturales durante una partida completa recogiendo las tres llaves y escapando.
- Fluidez sostenida en equipos sin GPU dedicada.

## 10. Pendiente para fases posteriores

- Secuencia completa de victoria al cruzar la puerta principal de salida.
- Estadísticas de partida en la pantalla de derrota/victoria.
- Sistema de guardado / selector de dificultad o ajustes de volumen de audio.
- Calibración fina de ritmo y dificultad tras pruebas de juego completas con humanos.


## 11. Fase 7 — Escape y revelación industrial

La salida norte conecta físicamente con un túnel: el muro continuo se divide en dos tramos dejando un vano de 2.8 m. Se conservan edificio, controles, inventario, rig articulado y secuencia de muerte.

### Componentes y estados
- `finalSequence.ts`: máquina determinista PLAYING → FINAL_DOOR_OPENING → FINAL_ESCAPE → FINAL_FACTORY_REVEAL → TO_BE_CONTINUED → END_CREDITS → END_COMPLETE. El estado de aplicación `ending` bloquea pausa, interacciones y controles durante el cierre.
- `doors.ts`: barra y cerrojos retraíbles (0.8 s), hojas articuladas (3.2 s), refuerzos y bisagras. El bloqueo transversal permanece cuatro segundos; las hojas conservan AABB físicas después de abrirse.
- `finalEnvironment.ts`: túnel lineal de 112 m, calculado como 5.6 m/s × 20 s, X=-3..3, Z=-22..-134. Suelo continuo, paredes físicas, costillas, tubos, conductos, cables, rejillas, manchas y balizas. El recorrido recto evita ambigüedad y atascos en curvas.
- Fábrica escenográfica de 120 m de ancho, unos 130 m de profundidad y 62 m de alto: cuatro hileras de columnas, tres niveles de plataformas, puentes, reactores, grandes conductos y grúa suspendida. InstancedMesh comparte geometrías y materiales; vapor con partículas de textura radial suave. No es una zona de exploración.
- `finalAudio.ts`: score original sintetizado, tensión pulsada, acordes industriales y créditos suaves, con fundidos y desconexión de nodos. Sin descargas ni pistas externas. El proyecto anterior no tenía control de volumen: se mantienen niveles conservadores y el volumen del navegador/sistema; no se afirma integración con un control inexistente.
- `EndingOverlay.tsx` y CSS: CONTINUARÁ sobre la fábrica parcialmente visible, fundido negro, créditos centrados con transform lineal durante 26 s, un segundo negro y VOLVER AL MENÚ sin recarga. Nombres y dedicatoria conservados literalmente. Las animaciones se suspenden con la pestaña oculta.

### Persecución y checkpoint
Abrir con tres llaves crea el checkpoint. La resistencia se sostiene exclusivamente durante el clímax (aviso de mantener Shift); el resto del juego conserva el drenaje original. Al superar Z=-37, el único Watcher aparece en Z=-23 cuando ese punto queda fuera del encuadre. Corre a 5.95 m/s frente a 5.6 m/s del jugador, con aproximadamente 14 m de ventaja inicial. Se reutilizan rig RUN, pisadas, colisiones y alcance letal de 2.65 m. La alerta «¡CORRE! Está furioso. Mirarlo ya no lo detiene» explica la excepción a la mirada. Detenerse permite captura y activa la animación de muerte existente.

Reintentar desde muerte (o reiniciar desde pausa con checkpoint) devuelve a X=0, Z=-19.2, mirando la puerta cerrada, con tres llaves y sus coleccionables ya ocultos. Restaura resistencia, puerta, IA, score y reloj del final. Volver al menú y comenzar otra partida borra checkpoint y llaves. El checkpoint es de sesión: no persiste al recargar.

El cruce de Z=-134 se procesa antes del ataque: el enemigo queda físicamente detrás y se bloquean nuevas capturas. La cámara conserva posición y orientación de llegada, espera un segundo y realiza una interpolación suave de cinco segundos hacia la composición elevada (pitch 0.5 rad), seguida de tres segundos de contemplación. CONTINUARÁ dura cinco segundos incluyendo fundidos, con unos tres segundos de lectura; después comienzan los créditos sin pantalla de victoria.

### Rendimiento y pruebas
El edificio deja de dibujarse al avanzar por el túnel. Durante créditos/cierre no se ejecuta render WebGL ni esperas GPU; el reloj se consulta a 20 Hz y a 4 Hz después del cierre. Las físicas del final usan subpasos de hasta 50 ms con presupuesto de 500 ms para mantener duración en equipos lentos sin atravesar paredes. Dos geometrías principales compartidas, luces sin sombras nuevas. El reloj no avanza con la pestaña oculta.

`phase7.test.ts` comprueba bloqueo sin llaves, raycast real de apertura, colisiones de hojas, recorrido completo desde vestíbulo hasta fábrica, duración calculada, supervivencia a 30/60/120 FPS, captura al detenerse, pisadas del rig, checkpoint/rebloqueo y secuencia de estados. Se actualiza la expectativa antigua del objetivo a ESCAPA. Las pruebas anteriores se conservan: 50 pruebas en total.

QA de desarrollo: abrir `/?autostart=1&qa=1`, pulsar «Preparar salida (3 llaves)», E y «Correr recorrido QA». La carrera usa la entrada W+Shift del controlador: no teletransporta por el túnel ni omite estados. «Detener carrera QA» permite comprobar captura. Los controles QA no se montan en producción.

Validación en navegador realizada: apertura y acceso físico, carrera completa hasta créditos, captura al detenerse, pantalla de muerte existente, reintento con 3/3 y puerta cerrada, segundo escape, revelación 3D, contenido de créditos y regreso al menú sin recarga. Sin errores críticos en consola durante el recorrido. Se observaron aproximadamente 60 FPS y 7 draw calls en la vista de revelación en este navegador; no constituye garantía para otros equipos.

Verificación manual en hardware objetivo:
1. Sin llaves, intentar E en salida; con tres, observar barra, candados y apertura lenta. Mantener W durante apertura para comprobar bloqueo.
2. Correr con W+Shift y mirar atrás: la criatura continúa corriendo con piernas/brazos articulados. Detenerse y morir; REINTENTAR debe mostrar 3/3 ante salida cerrada. Repetir dos veces.
3. Completar el recorrido: observar continuidad de cámara, tilt lento, niveles elevados y pausa final. No debe poder moverse ni interactuar.
4. Verificar CONTINUARÁ, fundido negro, desplazamiento de créditos y dedicatoria completa. Esperar a que salga por arriba y regresar al menú. Iniciar otra partida debe mostrar 0/3.
5. Comprobar con auriculares volumen/transición musical, legibilidad, ritmo subjetivo y fluidez en la GPU objetivo. Probar reducir movimiento/desactivar destellos. La valoración artística y el rendimiento en otros equipos requieren esta revisión humana.

La secuencia de victoria listada como pendiente en la sección 10 queda sustituida por este final. Guardado persistente y estadísticas siguen fuera de alcance.
