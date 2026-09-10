// ============================================================
// FRONTERA CERO — Música de fondo (Musica.mp3 del usuario)
// Reproductor único (HTMLAudioElement en bucle) que continúa
// entre el menú y la partida. Arranca con el primer gesto.
// ============================================================
import { ASSET_BASE } from './shared'

class MusicPlayer {
  private el: HTMLAudioElement | null = null
  private volumeFactor = 0.5   // la música suena a la mitad del volumen general
  private baseVolume = 0.7
  private trying = false

  /** reproduce (necesita un gesto del usuario; idempotente) */
  play(): void {
    if (this.trying) return
    if (this.el) {
      void this.el.play().catch(() => { /* autoplay bloqueado: se reintentará */ })
      return
    }
    this.trying = true
    try {
      const el = new Audio(`${ASSET_BASE}/audio/Musica.mp3`)
      el.loop = true
      el.preload = 'auto'
      el.volume = this.baseVolume * this.volumeFactor
      this.el = el
      void el.play().then(() => {
        this.trying = false
      }).catch(() => {
        // autoplay bloqueado: reintentar con el próximo gesto de la página
        this.trying = false
        const retry = (): void => {
          void el.play().catch(() => { /* silencioso */ })
          window.removeEventListener('pointerdown', retry)
        }
        window.addEventListener('pointerdown', retry)
      })
    } catch {
      this.trying = false
    }
  }

  setVolume(v: number): void {
    this.baseVolume = v
    if (this.el) this.el.volume = Math.max(0, Math.min(1, v * this.volumeFactor))
  }

  /** baja la música mientras se juega (para no tapar los pasos) */
  duck(playing: boolean): void {
    this.volumeFactor = playing ? 0.4 : 0.55
    if (this.el) this.el.volume = Math.max(0, Math.min(1, this.baseVolume * this.volumeFactor))
  }
}

export const music = new MusicPlayer()
