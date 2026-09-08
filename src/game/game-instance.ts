// Instancia global del juego (accesible desde la UI React)
import type { Game } from './engine'

let instance: Game | null = null

export function setGame(g: Game | null): void {
  instance = g
}

export function getGame(): Game | null {
  return instance
}
