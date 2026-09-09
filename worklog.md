# Worklog — FRONTERA CERO (FPS multijugador)

---
Task ID: 1
Agent: Super Z (agente principal)
Task: Crear juego FPS multijugador ultra realista con mecánicas de CS2 y estética de Warzone (Next.js + Three.js + Socket.io)

Work Log:
- Clasifiqué la tarea como Tipo 3 (desarrollo web interactivo) y cargué el skill fullstack-dev
- Inicialicé el entorno con init-fullstack.sh e instalé three + socket.io + socket.io-client
- Diseñé la arquitectura: cliente Next.js (motor Three.js) + mini-servicio Socket.io (puerto 3003) + config compartida
- Creé `mini-services/game-server/shared.ts`: mapa de 70×70 m (~130 cajas AABB), 8 armas con estadísticas completas, waypoints de bots, raycast segmento-AABB, protocolo de red
- Creé `mini-services/game-server/index.ts`: servidor con 8 bots IA (patrulla por grafo + combate con strafe/reacción/precisión), rondas, economía CS2, granadas con física, validación de daño, killfeed, rachas
- Cliente: `src/game/` — audio.ts (Web Audio procedural: 20+ sonidos sintetizados), textures.ts (texturas canvas procedurales), effects.ts (trazadoras, fogonazos, partículas, decals, explosiones), viewmodel.ts (8 modelos de armas low-poly), remote-players.ts (humanoides animados + interpolación de red + hitboxes), engine.ts (motor: movimiento con colisión AABB y step-up, cámara con retroceso/sacudida/bob, disparo con dispersión por movimiento, ADS, granadas, minimapa, overlay 2D), net.ts (cliente socket.io), store.ts (zustand)
- UI React: menú principal táctico, HUD completo (vida/armadura/munición/marcador/killfeed/anuncios), menú de compra estilo CS2, scoreboard con Tab, pantalla de muerte, menú de pausa con ajustes
- Corregí bug importante: `bun --hot` duplicaba la instancia del servidor socket.io → cambié a `bun index.ts` sin hot-reload
- Corregí sincronización de granadas tras compra (evento econ con frags)
- Cambié protocolo de hit único a hits múltiples (perdigones de escopeta)
- Verificación con agent-browser: menú → despliegue → conexión → movimiento → disparos → recarga → compra (armadura/granada/arma) → cambio de armas → granada con explosión y daño → headshot letal a bot → killfeed
- Verificación visual con VLM: renderizado 3D correcto (mapa, arma, crosshair, minimapa, HUD completo)
- Lint y TypeScript sin errores

Stage Summary:
- Juego "FRONTERA CERO" completamente funcional y verificado end-to-end
- Mini-servicio game-server en puerto 3003 (arrancar con `cd mini-services/game-server && bun run dev`)
- Cliente Next.js en puerto 3000 (automático)
- Tráfico debe pasar por el gateway Caddy (puerto 81) para el WebSocket (XTransformPort=3003)
- 8 bots IA activos para juego instantáneo en solitario; multijugador real vía WebSocket
- Artefactos: scripts/game-*.png (capturas), scripts/test-server.ts (prueba de protocolo)

---
Task ID: 2
Agent: Super Z (agente principal)
Task: Corregir W/S invertidos, retroceso de pistola, mapa grande, IA de bots mejorada, soporte de mando (gamepad) y multijugador 1v1 por salas P2P (PeerJS)

Work Log:
- Diagnóstico de los 4 bugs reportados:
  1) W/S invertidos: la matemática de dirección (dirX/dirZ) tenía los signos del término frontal al revés (forward = (-sin,-cos) en Three.js)
  2) "La pistola se va muy arriba": recoilV/recoilH están en GRADOS pero se aplicaban como radianes (1.1 → 63° por disparo en vez de 1.1°)
  3) Mapa 70×70 m pequeño → rediseñado a 110×110 m (GAME.MAP_HALF 35→55)
  4) Bots "muy malos": dos causas ocultas (ver abajo)
- Corregí dirección de movimiento (engine.ts: dirX = ix·cos − iz·sin, dirZ = −ix·sin − iz·cos)
- Corregí conversión grados→radianes del retroceso (recoilP/recoilY): verificado 0.61° por disparo de P9
- BUG CRÍTICO ENCONTRADO: el Mercado Central estaba COMPLETAMENTE SELLADO (la fórmula original de los segmentos de muro hacía que se tocaran en x=0 — sin puertas). Esto explica que los bots nunca se vieran: corrregí la fórmula y verifiqué LOS libre por las 4 puertas
- Mapa nuevo 110×110: perímetro 112 m, 2 almacenes (0,±36) con puertas frontal+laterales, gasolinera oeste (quiosco+marquesina+bombas), estación de radar este (compuesto amurallado), 4 cabañas diagonales (±26,±26), 2 torres (0,±20) con escaleras corregidas (la original subía al revés), 16 contenedores, barreras/sacos/cajas/barriles/ruinas simétricos, spawns (±48,±48)
- Waypoints: 62→64 nodos en 4 anillos + interiores; grafo con LOS y MAXD 20; verificado 64/64 alcanzables, spawns despejados (scripts/map-check.ts)
- Escalado del mundo: suelo 170×170, cielo r=260, cámara far 420, niebla 0.0058, sombras ±64, minimapa S=190/112, clamps ±(MAP_HALF−0.8)
- NUEVO src/game/sim.ts: simulación autoritativa en navegador (portada del servidor socket.io) con IA de bots mejorada:
  - Dificultad configurable (BOT_SKILL: fácil/normal/difícil/experto) que escala reacción, puntería, pausas de ráfaga y distancia de visión
  - Estados: patrulla (sesgo 72% hacia el enemigo si lejos), combate (strafe+lead predictivo+error de puntería con deriva), caza (última posición conocida), retirada (HP<32)
  - Agacharse a larga distancia, anti-atasco, velocidad individual (speedMult), escaneo cada 200 ms
- NUEVO src/game/sim-worker.ts + worker en net.ts: la simulación corre en Web Worker (los timers de página se estrangulan a ~1 Hz en pestañas ocultas; el worker mantiene 30 Hz — medido 90 ticks/3 s vs 4 ticks/3 s)
- net.ts REESCRITO: 3 modos — solo (worker+bots 4v4), host (worker+sala PeerJS+reenvío P2P con outbox para el welcome), guest (PeerJS al anfitrión, RTT cada 2 s). PeerJS público (0.peerjs.com). Reemplaza socket.io (mini-servicio 3003 ya no necesario)
- shared.ts: +BOT_SKILL, DIFFICULTY_LABELS, peerIdForRoom, generateRoomCode, BOT_NAMES×16; sincronizado con mini-services
- GAMEPAD completo (engine.ts updateGamepad): stick izq. movimiento analógico (con deadzone y sin normalizar inclinación parcial), stick der. apuntar (sens. ajustable), RT disparar, LT ADS, A saltar, B agacharse (toggle), X recargar, Y cambiar arma, LB granada, RB/cruceta↑ comprar, cruceta↓ granada, cruceta←/→ armas, Start pausa, Back marcador (mantener). inputsLive = locked || mando conectado. Anuncio al conectar + icono en HUD
- store: +mode/roomCode/fillBots/botDifficulty/netStatus/netError/gamepadConnected/settings.padSens
- menus.tsx: menú con 3 tarjetas de modo (entrenamiento/crear sala/unirse), selector de dificultad y bots de relleno, controles de mando listados, ConnectingScreen contextual con errores y botón volver, PauseMenu con slider de sensibilidad de mando
- hud.tsx: chip de sala (código+copia+estado del rival+ping), indicador de mando, ping MS
- game-mount.tsx: conecta según modo/dificultad/sala del store
- Pruebas con agent-browser (2 sesiones paralelas):
  - W/S: con yaw=0, W→z−0.56 ✓, S→z+0.56 ✓
  - Retroceso P9: 0.61° ✓ (antes 63°)
  - Bots en worker: combate activo, 32 bajas en ~2 min con dificultad difícil ✓
  - Mando emulado: stick izq. mueve adelante ✓, stick der. gira yaw −0.78 rad ✓, RT dispara 5 balas ✓
  - P2P: host crea sala UTZ9T (código visible+copiable), guest se une → equipo B, ambos se ven y sincronizan posición en tiempo real ✓ (VLM confirmó HUD/chip/estados en ambas pantallas)
  - Velocidad del worker: 30 Hz real frente a 1.3 Hz del hilo principal (headless oculto) ✓
- Corrección de carrera: welcome del invitado encolado en outbox hasta que el DataChannel abre; guestConn asignado al recibir la conexión (no al open); timeout de bienvenida 30 s
- tsc sin errores, eslint limpio, build de producción OK (Turbopack compila el worker)
- Artefactos: scripts/v2-combate.png, scripts/v2-p2p-host.png, scripts/v2-p2p-guest.png, scripts/map-check.ts, scripts/los-debug.ts

Stage Summary:
- Los 4 problemas del usuario corregidos + 2 bugs latentes graves descubiertos (mercado sellado, retroceso en radianes)
- Multijugador 1v1 real por salas P2P con código de 5 caracteres vía servidor público PeerJS (WebRTC), sin servidor propio
- Simulación autoritativa en Web Worker (inmune a pestaña oculta) reemplaza al servidor socket.io: el mini-servicio de 3003 ya no es necesario
- Soporte completo de mando (Xbox/PlayStation/genéricos) con sensibilidad configurable
- Mapa 110×110 con 328 cajas y IA de bots con 4 dificultades

---
Task ID: 3
Agent: Super Z (agente principal)
Task: Mapa más grande y mejor diseñado (escondites/tensión), decoración y gráficos mejorados (sombras, luces, reflexiones), daño de bots rebalanceado y sistema de vida estilo Fortnite (HP+escudo)

Work Log:
- (Sesión anterior, completada y commiteada pero sin registro en el worklog)
- Mapa ampliado a 130×130 con perímetro, spawns en ±64 y ~380 cajas: gasolinera, estación de radar, barrio con cabañas, mercado central, coberturas simétricas
- Sistema de vida estilo Fortnite: 100 HP + 100 escudo (el escudo absorbe primero), potis/botiquines como pickups flotantes (PICKUP_INFO, PickupKind) con glow y respawn
- Daño de bots reducido y rebalanceado (escudo/hp en sim.ts)
- Gráficos: PMREM del cielo de atardecer como envMap PBR (reflexiones en metal/charcos), sombras de sol 4096px con cámara que sigue al jugador, oclusión de contacto fusionada (1 draw call), 14 farolas con PointLight cálida, letreros de neón, 10 charcos reflectantes, neumáticos, árboles con copas, niebla cálida, bloom (UnrealBloomPass) en calidad alta
- Materiales PBR por tipo (roughness/metalness) con UVs escaladas por cara

Stage Summary:
- Todo commiteado en fab81e8; faltaba este registro de trabajo

---
Task ID: 4
Agent: Super Z (agente principal)
Task: Corregir congelamiento total al disparar ("se congela y traba todo") y subir el proyecto al repositorio de GitHub del usuario

Work Log:
- DIAGNÓSTICO (causa raíz, 3 problemas encadenados en effects.ts):
  1) Cada disparo creaba `new THREE.PointLight` (fogonazo) y cada granada otro: en Three.js, cambiar el NÚMERO de luces de la escena cambia la cache-key de programas → recompila TODOS los shaders del mapa (14 farolas + sombras 4096 + bloom) → congelón de cientos de ms a segundos con el primer disparo
  2) Las luces muertas NUNCA se quitaban de la escena (solo del array de seguimiento): tras >2 s sin disparar, el siguiente disparo creaba OTRA luz → otro congelón; las luces se acumulaban sin límite → costo por fragmento creciente → "traba todo" progresivo
  3) Cada partícula/fogonazo/decal clonaba un material y lo destruía al morir → liberación y recompilación de programas GPU por ráfaga → microcongelones sostenidos
- FIX effects.ts (reescrito con pools):
  - Pool FIJO de luces creado en el constructor (antes del primer render): 3 fogonazos + 2 explosiones, intensidad 0, NUNCA se añaden/eliminan luces en runtime → el número de luces es constante → cero recompilaciones (solo cambian intensidad/posición = uniforms)
  - Pools de reciclaje: materiales Sprite por tipo (spark/blood/smoke/flash), sprites, escombros, casquillos, anillos de explosión y trazadoras
  - Decals: anillo fijo pre-creado de 44, se reciclan en su sitio (nunca dispose/add/remove)
  - Techo de seguridad MAX_PARTICLES=320
  - dispose() para limpieza al desmontar (enganchado en engine.dispose)
- FIX engine.ts (churn por perdigón):
  - Caché de hitboxes: se calculan UNA vez por disparo (buildHitboxCache) en vez de por perdigón (antes: 8 perdigones × 9 bots × 3 cajas = 216 Box3 por escopetazo)
  - Ray y Vector3 reutilizados (bulletRay/bulletPoint) sin asignaciones por perdigón
  - Eliminado raycast duplicado del mapa en perdigones que no tocan nada (castBullet ya trazaba far=200)
- VERIFICACIÓN (agent-browser + VLM):
  - 8 s de fuego sostenido + segunda ráfaga: 40 frames, peor frame 9 ms, 0 frames >300 ms (antes: el primer disparo congelaba 500-3000 ms)
  - Munición desciende (15→7→3): disparos reales; bots combaten (A 17-15 B)
  - VLM confirma: escena 3D, viewmodel, HUD completo, efectos visibles (chispas, trazadora, retroceso), sin defectos visuales
  - tsc (solo errores preexistentes en skills/ ajenos al build) y eslint limpios
- Subida a GitHub: repo github.com/googlesitecom/Googlecom (rama main, push con token del usuario sin guardarlo en .git/config)

Stage Summary:
- Congelamiento al disparar eliminado de raíz (pool fijo de luces + reciclaje total de efectos)
- Rendimiento estable en fuego sostenido: peor frame <10 ms
- Proyecto completo publicado en el repositorio de GitHub del usuario

---
Task ID: 5
Agent: Super Z (agente principal)
Task: Animaciones de agarre/disparo del arma en los modelos, más pasto en el mapa, arreglar la tienda y añadir más mecánicas al mapa

Work Log:
- DIAGNÓSTICO de las 4 peticiones del usuario:
  1) "el modelo no tiene animación de disparar o agarrar arma": remote-players.ts solo animaba el caminar; el arma flotaba en el pecho sin brazos
  2) "añade más pasto": no había vegetación en el suelo
  3) "la tienda no sirve": CAUSA RAÍZ — sim.ts inBuyZone/spawnX usaba los spawns VIEJOS (±48) del mapa de 110×110, pero el mapa actual (130×130) tiene spawns/anellos en ±62 → el motor permitía abrir la tienda en el anillo visible pero el servidor rechazaba la compra con "Compra solo en tu base"
  4) "más mecánicas en el mapa": solo movimiento básico
- ANIMACIONES (remote-players.ts):
  - Nueva pose de apuntado SOLDIER_AIM calibrada con descenso por coordenadas EN VIVO (scripts/calibrate-pose.js ejecutado por agent-browser eval: mueve huesos mixamo y minimiza distancia de las MANOS a la empuñadura/guardamanos; 2 pasadas, coste final 0.279 m)
  - aimPose (0..1): fusión reposo↔apuntado cuando hay arma; fireKick decae a 5.5/s
  - Brazos: hombros (x,y,z) + codos; arma a altura de pecho (WPN_AIM −0.1, 1.3, 0.36) en el lado del hombro derecho; cabeza sigue el pitch
  - notifyShot(id) dispara la patada; getMuzzleWorld() para fogonazos/trazas desde la boca real del cañón del modelo
  - VLM confirma: ambas manos conectadas al arma, postura de tiro a la altura del pecho/hombro, sin clipping
- RED (net.ts/sim.ts/sim-worker.ts): evento 'playerShot' (el disparo del humano se retransmite como shotFired → el rival P2P ve traza + animación de disparo) y 'barrelShot' (explosión de barril con daño de área autoritativo + evento barrelExplode para FX de ambos clientes)
- TIENDA ARREGLADA (sim.ts): spawnX/spawnZ ahora usan SPAWN_A/SPWN_B (±62) importados de shared; radio +2.5; openBuyMenu avisa "La tienda solo funciona en tu base" si se pulsa B fuera
  - VERIFICADO E2E: granada (1000→700, frags 1), escudo rechazado (700<1000, correcto), Águila (700→0, equipada, en owned)
- MECÁNICAS DEL MAPA (engine.ts + shared.ts):
  - Pasto: InstancedMesh de 8200 briznas (alta) en cruces de quads, 1 draw call, viento por instancia en el vertex shader (onBeforeCompile), colores por instancia, evita AABBs/charcos, más denso y verde cerca de árboles; verificado por VLM como pasto 3D con volumen
  - 4 tirolinas (mercado→autobuses ×2, contenedor NE→radar, contenedor SO→llano): cable+postes+polea; E/ESPACIO/A para agarrar, cuelga 0.85 m bajo el cable a 10.5 m/s, se suelta con salto o al final con impulso; pista [E] TIROLINA en overlay + iconos en minimapa
  - 6 plataformas de salto (impulso velY=12, anillo pulsante + chevrones + glow)
  - 12 barriles explosivos (textura roja con franjas PELIGRO): explotan al dispararles (FIX: userData.barrelIdx vs lectura .barrel desajustada), daño de área 96 con falloff y LOS, empujón al jugador, reacción en cadena <3.6 m, respawn 28 s, puntos rojos en minimapa
  - Deslizamiento: agacharse corriendo → slide 0.85 s con impulso ×1.34, cámara inclinada, salto-deslizamiento (FIX: el flag sprinting se apagaba el mismo frame del agachado → se captura wasSprint del frame anterior)
- VERIFICACIÓN (agent-browser + VLM):
  - Plataforma: velY 9.9 al pisarla ✓; tirolina: attach + recorrido exacto por el cable ✓; slide: slideT 0.80 ✓; barril: alive→false, empuje, daño hp 100→87 ✓
  - Rendimiento con fuego sostenido + pasto + mecánicas: 105 renders, PEOR render 9 ms, media 0.5 ms (sin regresión)
  - tsc y eslint limpios; sin errores de consola
- Commit 1d469f2 y push a github.com/googlesitecom/Googlecom (rama main, token del usuario sin guardarlo en .git/config)

Stage Summary:
- El soldado ahora AGARRA el arma con las dos manos y anima el retroceso al disparar (también los humanos en P2P)
- Tienda funcional de nuevo (coords de spawn corregidas) con aviso contextual
- Mapa con 4 mecánicas nuevas: pasto con viento, tirolinas, plataformas de salto y barriles explosivos + deslizamiento
- Rendimiento sin regresión (peor render 9 ms)
