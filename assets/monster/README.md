# THE WATCHER — texturas del modelo existente

Fuente: `Dont_Look_Back_Monster_Texture_Pack.zip`, proporcionado por el usuario.
Los originales, el manifiesto y la descripción del paquete se conservan en `source/`.
El paquete es una hoja conceptual: sus islas NO son un despliegue UV de nuestras
esferas. El código de ejemplo del ZIP no se ejecuta ni se incorpora al juego.

## Adaptación

`scripts/BakeWatcherTextures.cs` remuestrea exclusivamente el interior de cada
isla original hacia 12 regiones para las UV esféricas existentes: cabeza, torso,
brazo, antebrazo, muslo, espinilla, palma, dedo, cuello, pelvis, pie y columna.
Frente y espalda se mapean por separado. Solo el hemisferio frontal de la cabeza
recibe ojos y boca; la nuca usa piel de la frente sin rasgos faciales.

- Los perfiles de muestreo siguen el interior de las islas, verificado contra la
  máscara en cada píxel. Si un perfil sale de una isla, la generación falla.
- La transición lateral y los polos se mezclan con piel neutra del mismo atlas.
- Cada región tiene 8 píxeles de margen replicado para filtrado y mipmaps.
- Color, normal, roughness y AO usan las mismas coordenadas de remuestreo.
- El normal original es OpenGL. Se conserva el canal verde; se invierte X para
  acompañar la orientación horizontal de este remapeado, y se renormaliza.
- Se desatura ligeramente el albedo y se ajusta su palidez, manteniendo las
  cavidades oscuras y las manchas rojizas apagadas.
- No hay transparencia, desplazamiento ni cambios de vértices o subdivisión.

Para regenerar, ejecutar desde la raíz en PowerShell 7 sobre Windows:

```powershell
./scripts/bake-watcher-textures.ps1
```

La generación usa System.Drawing y produce las imágenes de `public/monster/textures/`
y `src/game/watcherAtlas.ts`. Es una herramienta offline: no se ejecuta al jugar
ni durante el build de Cloudflare, que consume los recursos ya generados.

## Material y presupuesto

| Recurso | Configuración |
| --- | --- |
| `watcher-albedo.jpg` | 1024², JPEG calidad 92, sRGB |
| `watcher-normal.png` | 1024², PNG sin pérdida, datos lineales |
| `watcher-orm.png` | 1024², PNG sin pérdida: R=AO, G=roughness, B=metallic cero |

Los tres archivos suman aproximadamente **2,45 MiB**. Presupuesto de textura GPU:
aproximadamente **16 MiB** para tres RGBA8 con mipmaps completos. El mapa metálico
original se valida como completamente negro y se integra en ORM; no necesita
otra descarga ni otro objeto Texture.

`watcherSurface.ts` usa MeshStandardMaterial, metalness=0, roughness=1 multiplicada
por su mapa (mínimo horneado 185/255), normalScale=0.4, AO=0.65, emisión negra,
filtrado trilineal y anisotropía 2. Albedo es el único mapa sRGB. Se usa flipY=true
para las UV nativas de SphereGeometry; todos los mapas seleccionan el canal UV 0.

Todas las piezas comparten el mismo material y tres imágenes GPU. Las instancias
simultáneas del modelo comparten las texturas con conteo de referencias; la última
libera sus recursos. Las geometrías solo se clonan por región para variar UVs:
posiciones, normales e índices originales permanecen idénticos.

## Validación

- `npm test`: 25 pruebas, incluidas conservación de vértices/triángulos, límites
  UV, espacios de color, ORM compartido y liberación sin duplicar recursos.
- `npm run lint` y `npm run build`.
- Comparación contra el modelo anterior: misma jerarquía, matrices, vértices,
  normales e índices, en reposo y tras 600 fotogramas de animación, incluidos
  marcha, persecución, congelación y postura bajo puertas.
- Inspección del frente, perfil y espalda con luz cálida, luz fría y penumbra;
  comprobación dentro del juego con linterna encendida/apagada y sin errores
  de carga o renderizado en consola.

La mejora es de superficie. Los ojos, la boca y las heridas son detalles de
textura, no huecos nuevos en la malla. Se conserva la silueta low-poly original;
el paquete aporta normales/AO aproximados de su ilustración, no un horneado
de una escultura de alta resolución. No se han modificado IA, colisiones,
aparición, velocidades, sonidos, animaciones ni iluminación del juego.
