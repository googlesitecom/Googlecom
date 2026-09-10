// ============================================================
// FRONTERA CERO — Texturas procedurales (canvas 2D)
// Estilo desierto/urbano Warzone
// ============================================================
import * as THREE from 'three'
import type { MatKey } from './shared'

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  return [c, ctx]
}

function noiseOverlay(ctx: CanvasRenderingContext2D, size: number, amount: number, alpha: number): void {
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n))
  }
  ctx.putImageData(img, 0, 0)
  if (alpha > 0) {
    ctx.fillStyle = `rgba(0,0,0,0)`
    ctx.globalAlpha = 1
  }
}

function splotches(ctx: CanvasRenderingContext2D, size: number, count: number, color: string, maxR: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = Math.random() * maxR + maxR * 0.3
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = alpha
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function toTexture(c: HTMLCanvasElement, repeat = 1): THREE.Texture {
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ------------------------------------------------------------
// Texturas del mundo
// ------------------------------------------------------------
export function makeWorldTextures(): Record<MatKey, THREE.Texture> {
  const T: Partial<Record<MatKey, THREE.Texture>> = {}

  // --- Arena (suelo) ---
  {
    const [c, ctx] = makeCanvas(512)
    ctx.fillStyle = '#c9a870'
    ctx.fillRect(0, 0, 512, 512)
    splotches(ctx, 512, 24, '#b8955c', 60, 0.5)
    splotches(ctx, 512, 18, '#d8ba84', 50, 0.4)
    splotches(ctx, 512, 8, '#a08350', 80, 0.3)
    // rodadas / marcas
    ctx.strokeStyle = 'rgba(120,95,60,0.25)'
    ctx.lineWidth = 8
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      ctx.moveTo(Math.random() * 512, Math.random() * 512)
      ctx.bezierCurveTo(Math.random() * 512, Math.random() * 512, Math.random() * 512, Math.random() * 512, Math.random() * 512, Math.random() * 512)
      ctx.stroke()
    }
    noiseOverlay(ctx, 512, 26, 0)
    T.sand = toTexture(c, 1)
  }

  // --- Muro de adobe ---
  {
    const [c, ctx] = makeCanvas(512)
    ctx.fillStyle = '#c3a072'
    ctx.fillRect(0, 0, 512, 512)
    // juntas de bloques
    ctx.strokeStyle = 'rgba(90,70,45,0.35)'
    ctx.lineWidth = 3
    for (let y = 0; y <= 512; y += 86) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke()
    }
    for (let r = 0; r < 6; r++) {
      const off = (r % 2) * 64
      for (let x = off; x <= 512; x += 128) {
        ctx.beginPath(); ctx.moveTo(x, r * 86); ctx.lineTo(x, (r + 1) * 86); ctx.stroke()
      }
    }
    splotches(ctx, 512, 20, '#b09062', 40, 0.4)
    splotches(ctx, 512, 10, '#8a6f4a', 30, 0.3) // sombras
    splotches(ctx, 512, 6, '#d5b483', 60, 0.3)
    // grietas
    ctx.strokeStyle = 'rgba(70,55,35,0.5)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 8; i++) {
      let x = Math.random() * 512, y = Math.random() * 512
      ctx.beginPath(); ctx.moveTo(x, y)
      for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 30; ctx.lineTo(x, y) }
      ctx.stroke()
    }
    noiseOverlay(ctx, 512, 22, 0)
    T.concrete = toTexture(c, 1)
  }

  // --- Hormigón ---
  {
    const [c, ctx] = makeCanvas(512)
    ctx.fillStyle = '#9a9a94'
    ctx.fillRect(0, 0, 512, 512)
    splotches(ctx, 512, 16, '#88887f', 50, 0.4)
    splotches(ctx, 512, 10, '#aaa89f', 60, 0.35)
    splotches(ctx, 512, 5, '#6e6e66', 35, 0.3)
    ctx.strokeStyle = 'rgba(60,60,58,0.4)'
    ctx.lineWidth = 2
    ctx.strokeRect(6, 6, 500, 500)
    noiseOverlay(ctx, 512, 20, 0)
    T.wood = toTexture(c, 1)
  }

  // --- Metal de contenedor (base para variantes de color) ---
  const metalBase = (base: string, streak: string): THREE.Texture => {
    const [c, ctx] = makeCanvas(512)
    ctx.fillStyle = base
    ctx.fillRect(0, 0, 512, 512)
    // nervaduras verticales
    for (let x = 32; x < 512; x += 64) {
      const g = ctx.createLinearGradient(x - 10, 0, x + 10, 0)
      g.addColorStop(0, 'rgba(0,0,0,0.22)')
      g.addColorStop(0.5, 'rgba(255,255,255,0.10)')
      g.addColorStop(1, 'rgba(0,0,0,0.22)')
      ctx.fillStyle = g
      ctx.fillRect(x - 12, 0, 24, 512)
    }
    // óxido / rayas
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * 512
      const w = 4 + Math.random() * 14
      const h = 60 + Math.random() * 200
      ctx.fillStyle = streak
      ctx.globalAlpha = 0.15 + Math.random() * 0.2
      ctx.fillRect(x, Math.random() * 512, w, h)
    }
    ctx.globalAlpha = 1
    splotches(ctx, 512, 10, streak, 30, 0.25)
    noiseOverlay(ctx, 512, 16, 0)
    return toTexture(c, 1)
  }
  T.metalRed = metalBase('#8c3b2e', '#5a2a18')
  T.metalBlue = metalBase('#2e5a6e', '#1a3844')
  T.metalGreen = metalBase('#4a6b3a', '#2c4020')
  T.metalOrange = metalBase('#b06a28', '#6e3f14')
  T.metalGrey = metalBase('#6e7076', '#3d4046')

  // --- Sacos de arena ---
  {
    const [c, ctx] = makeCanvas(256)
    ctx.fillStyle = '#8a7a55'
    ctx.fillRect(0, 0, 256, 256)
    for (let ry = 0; ry < 4; ry++) {
      for (let rx = 0; rx < 3; rx++) {
        const x = rx * 85 + (ry % 2) * 42
        const y = ry * 64
        ctx.fillStyle = '#93815c'
        ctx.beginPath()
        ctx.ellipse(x + 42, y + 32, 44, 26, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(60,50,30,0.5)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
    noiseOverlay(ctx, 256, 20, 0)
    T.sandbag = toTexture(c, 1)
  }

  // --- Caja de madera ---
  {
    const [c, ctx] = makeCanvas(256)
    ctx.fillStyle = '#8c6b42'
    ctx.fillRect(0, 0, 256, 256)
    // tablas
    for (let y = 0; y < 256; y += 64) {
      ctx.fillStyle = y % 128 === 0 ? '#8a6840' : '#7e5f3a'
      ctx.fillRect(0, y, 256, 62)
      ctx.strokeStyle = 'rgba(50,35,18,0.6)'
      ctx.lineWidth = 2
      ctx.strokeRect(0, y, 256, 62)
      // veta
      ctx.strokeStyle = 'rgba(60,42,22,0.3)'
      ctx.lineWidth = 1
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo(0, y + 10 + i * 18 + Math.random() * 6)
        ctx.bezierCurveTo(80, y + 12 + i * 18, 160, y + 8 + i * 18, 256, y + 14 + i * 18)
        ctx.stroke()
      }
    }
    // marco
    ctx.strokeStyle = '#5c4225'
    ctx.lineWidth = 10
    ctx.strokeRect(5, 5, 246, 246)
    noiseOverlay(ctx, 256, 14, 0)
    T.crate = toTexture(c, 1)
  }

  // --- Barril ---
  {
    const [c, ctx] = makeCanvas(256)
    ctx.fillStyle = '#5e6e5a'
    ctx.fillRect(0, 0, 256, 256)
    // bandas
    ctx.fillStyle = 'rgba(40,48,38,0.7)'
    ctx.fillRect(0, 40, 256, 16)
    ctx.fillRect(0, 200, 256, 16)
    splotches(ctx, 256, 12, '#7a4a22', 26, 0.4)
    splotches(ctx, 256, 8, '#4a5544', 40, 0.35)
    noiseOverlay(ctx, 256, 16, 0)
    T.barrel = toTexture(c, 1)
  }

  // --- Barril explosivo (rojo con franjas de peligro) ---
  {
    const [c, ctx] = makeCanvas(256)
    ctx.fillStyle = '#a8322a'
    ctx.fillRect(0, 0, 256, 256)
    // franjas diagonales amarillas (zona central de advertencia)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 96, 256, 64)
    ctx.clip()
    ctx.strokeStyle = '#d8a418'
    ctx.lineWidth = 18
    for (let i = -4; i < 10; i++) {
      ctx.beginPath()
      ctx.moveTo(i * 40 - 30, 176)
      ctx.lineTo(i * 40 + 34, 76)
      ctx.stroke()
    }
    ctx.restore()
    // bandas metálicas
    ctx.fillStyle = 'rgba(50,20,16,0.75)'
    ctx.fillRect(0, 40, 256, 14)
    ctx.fillRect(0, 202, 256, 14)
    // óxido y desgaste
    splotches(ctx, 256, 14, '#6e1f18', 30, 0.4)
    splotches(ctx, 256, 8, '#c25446', 24, 0.3)
    // texto "PELIGRO"
    ctx.fillStyle = 'rgba(30,12,10,0.8)'
    ctx.font = 'bold 30px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('PELIGRO', 128, 24)
    noiseOverlay(ctx, 256, 16, 0)
    T.explosive = toTexture(c, 1)
  }

  // --- Techo ---
  {
    const [c, ctx] = makeCanvas(256)
    ctx.fillStyle = '#6e6a60'
    ctx.fillRect(0, 0, 256, 256)
    for (let y = 0; y < 256; y += 42) {
      for (let x = 0; x < 256; x += 84) {
        ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`
        ctx.fillRect(x + (y % 84 === 0 ? 0 : 42), y, 82, 40)
      }
    }
    splotches(ctx, 256, 14, '#55524a', 50, 0.4)
    noiseOverlay(ctx, 256, 14, 0)
    T.roof = toTexture(c, 1)
  }

  // --- Roca de montaña (v6: anillo del valle) ---
  {
    const [c, ctx] = makeCanvas(512)
    ctx.fillStyle = '#7d7166'
    ctx.fillRect(0, 0, 512, 512)
    // vetas diagonales de estratos
    for (let i = 0; i < 10; i++) {
      const y = i * 52 + Math.random() * 18
      ctx.strokeStyle = `rgba(58,52,46,${0.22 + Math.random() * 0.16})`
      ctx.lineWidth = 6 + Math.random() * 10
      ctx.beginPath()
      ctx.moveTo(-10, y)
      ctx.bezierCurveTo(140, y - 24, 320, y + 22, 522, y - 10)
      ctx.stroke()
    }
    splotches(ctx, 512, 26, '#6a5f55', 46, 0.45)
    splotches(ctx, 512, 18, '#8f8375', 55, 0.4)
    splotches(ctx, 512, 10, '#57503f', 70, 0.3)
    // musgo tenue cálido (lado del sol)
    splotches(ctx, 512, 8, '#6e6a45', 26, 0.25)
    noiseOverlay(ctx, 512, 24, 0)
    T.rock = toTexture(c, 1)
  }

  return T as Record<MatKey, THREE.Texture>
}

// ------------------------------------------------------------
// Sprites de efectos
// ------------------------------------------------------------
export function makeMuzzleTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(128)
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 60)
  g.addColorStop(0, 'rgba(255,255,240,1)')
  g.addColorStop(0.25, 'rgba(255,220,120,0.95)')
  g.addColorStop(0.55, 'rgba(255,140,40,0.5)')
  g.addColorStop(1, 'rgba(255,80,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  // destellos
  ctx.strokeStyle = 'rgba(255,245,200,0.9)'
  ctx.lineWidth = 4
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10)
    ctx.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58)
    ctx.stroke()
  }
  return new THREE.CanvasTexture(c)
}

export function makeSmokeTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(128)
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(200,190,170,0.75)')
  g.addColorStop(0.5, 'rgba(170,160,140,0.35)')
  g.addColorStop(1, 'rgba(150,140,120,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

export function makeSparkTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(64)
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30)
  g.addColorStop(0, 'rgba(255,255,220,1)')
  g.addColorStop(0.4, 'rgba(255,180,60,0.8)')
  g.addColorStop(1, 'rgba(255,120,20,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export function makeBloodTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(64)
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
  g.addColorStop(0, 'rgba(190,20,20,0.95)')
  g.addColorStop(0.5, 'rgba(140,10,10,0.6)')
  g.addColorStop(1, 'rgba(90,5,5,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export function makeDecalTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(64)
  ctx.clearRect(0, 0, 64, 64)
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 28)
  g.addColorStop(0, 'rgba(20,16,12,0.95)')
  g.addColorStop(0.3, 'rgba(30,24,18,0.8)')
  g.addColorStop(0.7, 'rgba(50,42,32,0.3)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  // fragmentos
  ctx.fillStyle = 'rgba(15,12,8,0.6)'
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 14 + Math.random() * 14
    ctx.beginPath()
    ctx.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1.5 + Math.random() * 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  return new THREE.CanvasTexture(c)
}

// ------------------------------------------------------------
// Cielo (atardecer de desierto, más dramático)
// ------------------------------------------------------------
export function makeSkyTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(512)
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0, '#2d4a73')
  g.addColorStop(0.3, '#6a8fb0')
  g.addColorStop(0.55, '#d9a86a')
  g.addColorStop(0.72, '#e8934f')
  g.addColorStop(0.86, '#c96f3a')
  g.addColorStop(1, '#8f4d2e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 512)
  // nubes alargadas tenues
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 300
    const r = 20 + Math.random() * 55
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r)
    const warm = y > 150
    cg.addColorStop(0, warm ? `rgba(255,214,170,${0.10 + Math.random() * 0.14})` : `rgba(240,246,255,${0.10 + Math.random() * 0.12})`)
    cg.addColorStop(1, 'rgba(255,245,235,0)')
    ctx.fillStyle = cg
    ctx.beginPath()
    ctx.ellipse(x, y, r * 2.0, r * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  return new THREE.CanvasTexture(c)
}

// ------------------------------------------------------------
// Nube suave (billboards del cielo, v6)
// ------------------------------------------------------------
export function makeCloudTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(256)
  ctx.clearRect(0, 0, 256, 256)
  for (let i = 0; i < 16; i++) {
    const x = 48 + Math.random() * 160
    const y = 96 + (Math.random() - 0.5) * 70
    const r = 22 + Math.random() * 46
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const warm = y > 110
    g.addColorStop(0, warm ? `rgba(255,226,190,${0.16 + Math.random() * 0.14})` : `rgba(238,244,255,${0.16 + Math.random() * 0.14})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, r * 1.7, r * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  return new THREE.CanvasTexture(c)
}

// ------------------------------------------------------------
// Ruido suave para el agua (dos capas desplazándose)
// ------------------------------------------------------------
export function makeWaterNoiseTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(256)
  ctx.fillStyle = '#404040'
  ctx.fillRect(0, 0, 256, 256)
  splotches(ctx, 256, 60, '#ffffff', 26, 0.10)
  splotches(ctx, 256, 50, '#202020', 30, 0.10)
  noiseOverlay(ctx, 256, 18, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

// ------------------------------------------------------------
// Ave lejana (silueta en V)
// ------------------------------------------------------------
export function makeBirdTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(64)
  ctx.clearRect(0, 0, 64, 64)
  ctx.strokeStyle = 'rgba(30,26,24,0.9)'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(8, 34)
  ctx.quadraticCurveTo(20, 18, 32, 30)
  ctx.quadraticCurveTo(44, 18, 56, 34)
  ctx.stroke()
  return new THREE.CanvasTexture(c)
}

// ------------------------------------------------------------
// Blob de oclusión (sombra de contacto suave)
// ------------------------------------------------------------
export function makeAOBlobTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(128)
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.55, 'rgba(0,0,0,0.28)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

// ------------------------------------------------------------
// Letrero de neón (texto brillante para el bloom)
// ------------------------------------------------------------
export function makeNeonTexture(text: string, color: string): THREE.Texture {
  const fontSize = 72
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = `900 ${fontSize}px monospace`
  const w = Math.max(64, probe.measureText(text.toUpperCase()).width + 48)
  const c = document.createElement('canvas')
  c.width = Math.ceil(w)
  c.height = 112
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.font = `900 ${fontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // halo exterior
  ctx.shadowColor = color
  ctx.shadowBlur = 26
  ctx.fillStyle = color
  ctx.fillText(text.toUpperCase(), c.width / 2, c.height / 2)
  ctx.shadowBlur = 12
  ctx.fillText(text.toUpperCase(), c.width / 2, c.height / 2)
  // núcleo casi blanco
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text.toUpperCase(), c.width / 2, c.height / 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ------------------------------------------------------------
// Etiqueta de nombre (remote players)
// ------------------------------------------------------------
export function makeNameTag(name: string, team: string, color: string): { tex: THREE.Texture, w: number } {
  const c = document.createElement('canvas')
  const fontSize = 42
  const ctx0 = c.getContext('2d')!
  ctx0.font = `bold ${fontSize}px monospace`
  const textW = ctx0.measureText(name).width
  c.width = Math.max(220, textW + 70)
  c.height = 70
  const ctx = c.getContext('2d')!
  ctx.font = `bold ${fontSize}px monospace`
  ctx.textBaseline = 'middle'
  // fondo
  ctx.fillStyle = 'rgba(10,10,10,0.45)'
  ctx.fillRect(0, 0, c.width, c.height)
  // indicador de equipo
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 10, c.height)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(name, 22, c.height / 2 - 4)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return { tex, w: c.width / c.height }
}
