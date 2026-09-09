# FRONTERA CERO — FPS multijugador en el navegador

**▶ JUGAR AHORA:** https://googlesitecom.github.io/Googlecom/

FPS táctico multijugador con la jugabilidad de CS2 y la estética de Warzone, hecho con **Next.js + Three.js + WebRTC (PeerJS)**. Corre 100 % en el navegador, sin instalación.

## Características

- **4 modos de juego**: Combate de equipos (4v4), Todos contra todos, Capturar la bandera y Dominación.
- **Mapa urbano 140×140** con hotel de 3 plantas, torre de oficinas, mercado, almacenes, gasolinera, colonia con casas (con interior y segunda planta) y depósito de contenedores.
- **Armas reales en GLB** (pistola, SMG, rifle y sniper con texturas), soldados animados y árboles/texturas del repositorio integrados.
- **Multijugador 1v1** por salas P2P con código (PeerJS/WebRTC) o partida de entrenamiento con bots.
- **Bots con IA** en 4 dificultades: patrullan, combate con strafe y ráfagas, persiguen y se retiran.
- **Sistema de vida estilo Fortnite**: 100 HP + 100 de escudo, con pociones y botiquines en el mapa.
- **Controles 100 % reasignables** (teclado, ratón y mando de Xbox/PlayStation, con sprint en L3).
- **Mecánicas de movimiento**: tirolinas, plataformas de salto, deslizamiento, barriles explosivos y granadas de fragmentación/humo.
- **Economía estilo CS2**: tienda en la zona de compra al inicio de cada ronda.

## Controles (por defecto)

| Acción | Tecla |
|--------|-------|
| Moverse | W A S D |
| Saltar | Espacio |
| Agacharse / deslizarse | C |
| Disparar | Clic izquierdo |
| Apuntar (ADS) | Clic derecho |
| Recargar | R |
| Cambiar arma | 1-5 / rueda |
| Granada | G (humo: H) |
| Interactuar (tirolina) | E |
| Tienda | B (en la base) |
| Correr | Shift (mando: L3) |

## Desarrollo

```bash
bun install
bun run dev          # http://localhost:3000
bun run build        # export estático → out/
bun run build:pages  # export con basePath /Googlecom (GitHub Pages)
```

La simulación corre en un Web Worker (30 Hz); el multijugador usa PeerJS (servidor público de señalización), sin backend propio. Página de diagnóstico de armas GLB: `/calibra`.
