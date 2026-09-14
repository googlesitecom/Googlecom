'use client'

// ============================================================
// EMERGENCY STRIKE — LOBBY STAGE (v14)
// Fortnite-style lobby: your operator (and your squad) standing
// in 3D over a subtle platform, breathing, with the username
// floating above each character. The menu artwork stays behind
// (transparent renderer); the camera drifts slowly and follows
// the mouse with a soft parallax.
// ============================================================
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { ensureSoldierLoaded, buildCineSoldier, tintRig, setCombatPoseOverride, type CineSoldierParts } from '@/game/remote-players'

export interface LobbyChar {
  id: string
  name: string
  leader: boolean
  you: boolean
}

const GOLD = 0xd9a441     // the player's exclusive tint (like in-game)
const SQUAD = 0xc79a4a    // squadmates wear the amber uniform

export function LobbyStage({ chars }: { chars: LobbyChar[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tagRefs = useRef<(HTMLDivElement | null)[]>([])
  const rosterKey = chars.map(c => c.id).join('|')
  const rosterMap = useRef(chars)
  rosterMap.current = chars

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    let disposed = false
    let raf = 0

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60)
    camera.position.set(0, 1.62, 3.85)
    camera.lookAt(0, 1.12, 0)

    // ---- lights: warm key + amber rim + cool fill (matches the menu art) ----
    const key = new THREE.DirectionalLight(0xfff2dc, 2.1)
    key.position.set(2.6, 4.2, 3.2)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -4
    key.shadow.camera.right = 4
    key.shadow.camera.top = 4
    key.shadow.camera.bottom = -4
    key.shadow.bias = -0.0015
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xd9a441, 1.1)
    rim.position.set(-3.4, 2.4, -2.6)
    scene.add(rim)
    const fill = new THREE.HemisphereLight(0x8fa3b8, 0x1a1410, 0.55)
    scene.add(fill)

    // ---- platform: dark disc + amber ring (subtle, under the characters) ----
    const platform = new THREE.Group()
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.75, 0.14, 48),
      new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.85, metalness: 0.25 }),
    )
    disc.receiveShadow = true
    platform.add(disc)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.58, 1.72, 64),
      new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.075
    platform.add(ring)
    scene.add(platform)

    // ---- characters ----
    const soldiers: { parts: CineSoldierParts; bones: { torso?: THREE.Object3D; head?: THREE.Object3D }; phase: number; foreBase: number }[] = []
    const buildRow = (row: LobbyChar[]): void => {
      if (disposed || !row.length) return
      for (const old of soldiers) scene.remove(old.parts.root)
      soldiers.length = 0
      tagRefs.current.length = 0
      // v14.1: calibración de la guardia por URL (?lobbytest=1&tax=1.3&tfz=0.3…)
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('lobbytest')) {
        const lp = new URLSearchParams(location.search)
        const n = (k: string): number | undefined => {
          const v = lp.get(k)
          return v !== null && v !== '' && !Number.isNaN(+v) ? +v : undefined
        }
        const o: { tArm?: { x: number; y: number; z: number }; tFore?: { x: number; z: number }; sArm?: { x: number; y: number; z: number }; sFore?: { x: number; z: number }; fingerCurl?: { axis: 'x' | 'z'; amount: number; mirror: boolean } } = {}
        const tax = n('tax'), tay = n('tay'), taz = n('taz')
        const tfx = n('tfx'), tfz = n('tfz')
        const sax = n('sax'), say = n('say'), saz = n('saz')
        const sfx = n('sfx'), sfz = n('sfz')
        const fca = n('fca'), fcax = lp.get('fcax'), fcm = lp.get('fcm')
        if (tax !== undefined || tay !== undefined || taz !== undefined) o.tArm = { x: tax ?? 1.3, y: tay ?? 0, z: taz ?? -0.12 }
        if (tfx !== undefined || tfz !== undefined) o.tFore = { x: tfx ?? -1.35, z: tfz ?? -0.3 }
        if (sax !== undefined || say !== undefined || saz !== undefined) o.sArm = { x: sax ?? 1.3, y: say ?? 0, z: saz ?? 0.12 }
        if (sfx !== undefined || sfz !== undefined) o.sFore = { x: sfx ?? -1.35, z: sfz ?? 0.25 }
        if (fca !== undefined || fcax !== null || fcm !== null) o.fingerCurl = {
          axis: fcax === 'x' ? 'x' : 'z',
          amount: fca ?? 0.7,
          mirror: fcm !== '0',
        }
        setCombatPoseOverride(Object.keys(o).length ? o : null)
      }
      const n = row.length
      const spacing = n > 3 ? 1.28 : 1.42
      row.forEach((c, i) => {
        // v14.1: SIN arma y en POSICIÓN DE ATAQUE (guardia), como Fortnite
        const parts = buildCineSoldier('A', null, 'combat')
        // v14.1: tintar SIN pose de reposo para no pisar la guardia
        if (c.you) tintRig(parts.root, GOLD, false)
        else if (c.leader) tintRig(parts.root, 0xe0b053, false)
        else tintRig(parts.root, SQUAD, false)
        // face the camera (models look toward +Z)
        parts.root.position.x = (i - (n - 1) / 2) * spacing
        parts.root.position.y = 0.14
        parts.root.rotation.y = (i - (n - 1) / 2) * 0.06   // slight inward turn
        scene.add(parts.root)
        soldiers.push({
          parts,
          bones: { torso: parts.torso, head: parts.head },
          phase: i * 1.37 + Math.random() * 0.6,
          foreBase: parts.forearms?.[1]?.rotation.x ?? 0,
        })
      })
      // v14.1: hook de depuración para el E2E (?lobbytest=1) — permite
      // contar meshes de arma en la escena del lobby desde Playwright
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('lobbytest')) {
        ;(window as unknown as { __lobbyDebug?: unknown }).__lobbyDebug = {
          scene, soldiers: soldiers.length,
          weaponless: soldiers.every(s => !s.parts.muzzle),
        }
      }
    }

    // initial placeholder row (low-poly fallback) then upgrade when GLB lands
    buildRow(rosterMap.current)
    ensureSoldierLoaded().then(() => { if (!disposed) buildRow(rosterMap.current) })

    // ---- resize ----
    const resize = (): void => {
      const w = wrap.clientWidth || 640
      const h = wrap.clientHeight || 400
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(1, h)
      // pull the camera back a bit for wide squads
      const n = Math.max(1, soldiers.length)
      camera.position.z = 3.85 + (n - 1) * 0.55
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    // ---- mouse parallax ----
    let mx = 0, my = 0, tx = 0, ty = 0
    const onMove = (e: PointerEvent): void => {
      const r = wrap.getBoundingClientRect()
      tx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2
      ty = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2
    }
    window.addEventListener('pointermove', onMove)

    // ---- tag projection anchor per character (head + 0.35) ----
    const proj = new THREE.Vector3()
    const updateTags = (): void => {
      const row = rosterMap.current
      const w = wrap.clientWidth || 1
      const h = wrap.clientHeight || 1
      for (let i = 0; i < row.length; i++) {
        const el = tagRefs.current[i]
        const s = soldiers[i]
        if (!el) continue
        const anchor = s ? s.parts.root.position : new THREE.Vector3((i - (row.length - 1) / 2) * 1.42, 2.2, 0)
        proj.set(anchor.x, 2.14, anchor.z)
        proj.project(camera)
        el.style.left = `${((proj.x + 1) / 2) * w}px`
        el.style.top = `${((1 - proj.y) / 2) * h}px`
      }
    }

    // ---- loop: breathing + camera drift + tag projection ----
    const clock = new THREE.Clock()
    const tick = (): void => {
      if (disposed) return
      const t = clock.getElapsedTime()
      mx += (tx - mx) * 0.06
      my += (ty - my) * 0.06
      // slow cinematic drift + parallax
      camera.position.x = Math.sin(t * 0.12) * 0.22 + mx * 0.34
      camera.position.y = 1.62 - my * 0.16 + Math.sin(t * 0.21) * 0.035
      camera.lookAt(0, 1.12, 0)
      // breathing + guard micro-sway (fists stay up, alive)
      for (const s of soldiers) {
        const b = Math.sin(t * 1.45 + s.phase)
        if (s.bones.torso) s.bones.torso.rotation.z = b * 0.018
        if (s.bones.head) s.bones.head.rotation.y = Math.sin(t * 0.4 + s.phase) * 0.06
        s.parts.body.position.y = b * 0.008 - 0.06
        if (s.parts.forearms?.[1]) s.parts.forearms[1].rotation.x = s.foreBase + Math.sin(t * 1.9 + s.phase) * 0.035
      }
      // platform ring pulse
      const ringMat = ring.material as THREE.MeshBasicMaterial
      ringMat.opacity = 0.5 + 0.22 * Math.sin(t * 1.1)
      renderer.render(scene, camera)
      updateTags()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      for (const s of soldiers) {
        s.parts.root.traverse(o => {
          if (o instanceof THREE.Mesh) {
            const mats = Array.isArray(o.material) ? o.material : [o.material]
            for (const m of mats) if (m.userData?.lobbyClone) m.dispose()
          }
        })
        scene.remove(s.parts.root)
      }
      renderer.dispose()
    }
  }, [rosterKey])

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {/* username tags — positioned by the render loop (projected 3D → CSS) */}
      {chars.map((c, i) => (
        <div
          key={c.id}
          ref={el => { tagRefs.current[i] = el }}
          className="absolute -translate-x-1/2 -translate-y-full pointer-events-none select-none transition-opacity"
        >
          <div className="flex flex-col items-center gap-1">
            <div
              className={`font-tac-md text-[11px] tracking-[0.22em] px-3 py-1 rounded border backdrop-blur-[2px] whitespace-nowrap ${
                c.you
                  ? 'text-amber-100 border-amber-500/50 bg-amber-950/40'
                  : c.leader
                    ? 'text-amber-200/90 border-amber-600/40 bg-stone-950/50'
                    : 'text-stone-300 border-stone-700/50 bg-stone-950/50'
              }`}
              style={{ textShadow: '0 1px 10px rgba(0,0,0,0.8)' }}
            >
              {c.name.slice(0, 16).toUpperCase()}
              {c.leader && <span className="ml-1.5 text-amber-300">★</span>}
            </div>
            <span className={`h-px w-10 ${c.you ? 'bg-amber-400/60' : 'bg-stone-600/60'}`} />
          </div>
        </div>
      ))}
    </div>
  )
}

