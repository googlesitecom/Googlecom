'use client'

// ============================================================
// FRONTERA CERO — Página de calibración visual de armas GLB
// Muestra cada arma en 2 vistas (frontal y lateral) para
// verificar: boca hacia −Z, miras arriba, texturas visibles.
// Uso: /calibra  (solo desarrollo/diagnóstico)
// ============================================================
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { preloadAssets, buildGLBWeapon } from '@/game/assets'
import { buildWeaponModel } from '@/game/viewmodel'
import type { WeaponId } from '@/game/shared'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const ROWS: { id: WeaponId; label: string; len: number }[] = [
  { id: 'p9',     label: 'P9 (Pistola.glb)',   len: 0.24 },
  { id: 'mp9',    label: 'MP9 (Smg.glb)',      len: 0.55 },
  { id: 'ar47',   label: 'AR47 (Rifle.glb)',   len: 0.97 },
  { id: 'awp338', label: 'AWP338 (sniper.glb)', len: 1.22 },
]

function buildRow(len: number, id: WeaponId): THREE.Group {
  const holder = new THREE.Group()
  const built = buildGLBWeapon(id) ?? buildWeaponModel(id)
  holder.add(built.group)
  // marcador de boca (esfera roja) y de empuñadura (esfera verde en origen)
  const muzzleBall = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(0.01, len * 0.018), 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff3020 }),
  )
  built.muzzle.getWorldPosition(muzzleBall.position)
  holder.add(muzzleBall)
  const gripBall = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(0.01, len * 0.018), 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x20ff40 }),
  )
  holder.add(gripBall)
  // rejilla de suelo + ejes de referencia
  const grid = new THREE.GridHelper(len * 2.2, 8, 0x3a4150, 0x23262e)
  grid.position.y = -len * 0.55
  holder.add(grid)
  const mk = (dirV: THREE.Vector3, color: number): THREE.ArrowHelper =>
    new THREE.ArrowHelper(dirV.clone().normalize(), new THREE.Vector3(0, -len * 0.2, 0), len * 0.3, color, len * 0.09, len * 0.05)
  holder.add(mk(new THREE.Vector3(0, 0, -1), 0xff4030))  // −Z: a donde debe apuntar la boca
  holder.add(mk(new THREE.Vector3(1, 0, 0), 0x30ff50))
  holder.add(mk(new THREE.Vector3(0, 1, 0), 0x3080ff))
  return holder
}

export default function CalibraPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Cargando GLB…')

  useEffect(() => {
    const mount = mountRef.current!
    let disposed = false

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(1600, 1200)
    renderer.setPixelRatio(1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x14161c)
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.add(new THREE.HemisphereLight(0xcfd8e8, 0x30281e, 0.5))
    const dir = new THREE.DirectionalLight(0xffffff, 1.5)
    dir.position.set(1.5, 3, 1.2)
    scene.add(dir)

    const groups: THREE.Group[] = []
    const addRow = (i: number): void => {
      const g = buildRow(ROWS[i].len, ROWS[i].id)
      g.visible = false
      scene.add(g)
      groups.push(g)
    }

    const camFront = new THREE.PerspectiveCamera(40, 800 / 300, 0.01, 30)
    const camSide = new THREE.PerspectiveCamera(40, 800 / 300, 0.01, 30)

    let raf = 0
    function frame(): void {
      if (disposed) return
      const W = 1600, H = 1200, CW = 800, CH = 300
      renderer.setScissorTest(true)
      for (let i = 0; i < ROWS.length; i++) {
        const d = ROWS[i].len * 1.45 + 0.45
        // frontal: cámara en +Z mirando a −Z → la boca (−Z) apunta AL VISOR
        camFront.position.set(0, 0.16, d)
        camFront.lookAt(0, 0.05, 0)
        // lateral: cámara en +X → la boca (−Z) queda a la DERECHA en pantalla
        camSide.position.set(d, 0.16, 0)
        camSide.lookAt(0, 0.05, 0)
        for (let c = 0; c < 2; c++) {
          for (let k = 0; k < groups.length; k++) groups[k].visible = k === i
          renderer.setViewport(c * CW, H - (i + 1) * CH, CW, CH)
          renderer.setScissor(c * CW, H - (i + 1) * CH, CW, CH)
          renderer.render(scene, c === 0 ? camFront : camSide)
        }
      }
      renderer.setScissorTest(false)
      raf = requestAnimationFrame(frame)
    }

    preloadAssets().then(() => {
      if (disposed) return
      groups.length = 0
      for (let i = 0; i < ROWS.length; i++) {
        const g = buildRow(ROWS[i].len, ROWS[i].id)
        g.visible = false
        scene.add(g)
        groups.push(g)
      }
      setStatus('GLB cargados — filas: P9 / MP9 / AR47 / AWP338')
      frame()
    })

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      pmrem.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="w-screen h-screen overflow-hidden bg-stone-950 relative">
      <div ref={mountRef} className="absolute inset-0 flex items-center justify-center [&>canvas]:object-contain" />
      <div className="absolute top-1 left-1/2 -translate-x-1/2 text-cyan-200 text-sm bg-black/70 px-3 py-1 rounded z-10">
        {status} · ROJO = boca · VERDE = empuñadura · flecha ROJA = −Z (frente)
      </div>
    </div>
  )
}
