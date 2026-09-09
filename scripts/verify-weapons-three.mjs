// ============================================================
// Verificación DETERMINISTA con THREE real (misma cadena que
// assets.ts): bake matrixWorld → calibración por archivo →
// medición de: boca (extremo fino) en −Z, miras en +Y,
// empuñadura descendiendo en +Z.
// ============================================================
import fs from 'node:fs'
import { Matrix4, Vector3, Quaternion } from 'three'

const CALS = {
  'Pistola.glb': { rz: Math.PI, ry: Math.PI / 2 },
  'Smg.glb':     { ry: -Math.PI / 2 },
  'Rifle.glb':   {},
  'sniper.glb':  { ry: Math.PI },
}

function parseGLB(path) {
  const buf = fs.readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
  const binStart = 20 + jsonLen
  const binLen = buf.readUInt32LE(binStart)
  const bin = buf.slice(binStart + 8, binStart + 8 + binLen)
  return { json, bin }
}

function readPositions(json, bin, accessorIdx) {
  const acc = json.accessors[accessorIdx]
  const bv = json.bufferViews[acc.bufferView]
  const off = (bv.byteOffset || 0) + (acc.byteOffset || 0)
  const n = acc.count
  const stride = bv.byteStride || 12
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    out[i * 3] = bin.readFloatLE(off + i * stride)
    out[i * 3 + 1] = bin.readFloatLE(off + i * stride + 4)
    out[i * 3 + 2] = bin.readFloatLE(off + i * stride + 8)
  }
  return out
}

const v = new Vector3()
const m = new Matrix4()

console.log('PART 1 — ESPACIO-MUNDO ORIGINAL (sin calibrar)')
console.log('='.repeat(70))
const worldData = {}
for (const f of Object.keys(CALS)) {
  const { json, bin } = parseGLB('/home/z/my-project/public/models/' + f)
  const world = new Map()
  const sceneNodes = json.scenes[json.scene || 0].nodes
  function walk(nodeIdx, parent) {
    const n = json.nodes[nodeIdx]
    const local = new Matrix4()
    if (n.matrix) local.fromArray(n.matrix)
    else local.compose(
      n.translation ? new Vector3(...n.translation) : new Vector3(),
      n.rotation ? new Quaternion(...n.rotation) : new Quaternion(),
      n.scale ? new Vector3(...n.scale) : new Vector3(1, 1, 1),
    )
    const w = new Matrix4().multiplyMatrices(parent, local)
    world.set(nodeIdx, w)
    for (const c of n.children || []) walk(c, w)
  }
  for (const r of sceneNodes) walk(r, new Matrix4())

  const verts = []
  for (const [i, n] of json.nodes.entries()) {
    if (n.mesh === undefined) continue
    const w = world.get(i)
    for (const p of json.meshes[n.mesh].primitives) {
      const pos = readPositions(json, bin, p.attributes.POSITION)
      for (let k = 0; k < pos.length; k += 3) {
        v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(w)
        verts.push([v.x, v.y, v.z])
      }
    }
  }
  worldData[f] = verts

  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (const p of verts) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]) }
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
  const axes = ['X', 'Y', 'Z']
  const long = size.indexOf(Math.max(...size))
  console.log(`\n${f}: ${verts.length} verts, tamaño X=${size[0].toFixed(1)} Y=${size[1].toFixed(1)} Z=${size[2].toFixed(1)} → largo=${axes[long]}`)

  // análisis por QUINTOS a lo largo del eje largo (más fino que tercios)
  const li = long
  const span = Math.max(0.001, mx[li] - mn[li])
  const quint = Array.from({ length: 5 }, () => ({ n: 0, ySum: 0, yMin: Infinity, yMax: -Infinity, rSum: 0 }))
  const yMid = (mn[1] + mx[1]) / 2
  for (const p of verts) {
    const t = Math.min(0.999, Math.max(0, (p[li] - mn[li]) / span))
    const q = quint[Math.floor(t * 5)]
    q.n++
    q.ySum += p[1]
    q.yMin = Math.min(q.yMin, p[1])
    q.yMax = Math.max(q.yMax, p[1])
  }
  const name = li === 0 ? 'X−→X+' : li === 2 ? 'Z−→Z+' : 'Y−→Y+'
  console.log(`  quinto |  n  | Y medio | Y mínimo | Y máximo   (${name})`)
  quint.forEach((q, i) => {
    if (q.n) console.log(`   ${i}     ${String(q.n).padStart(5)}  ${(q.ySum / q.n).toFixed(2).padStart(8)}  ${q.yMin.toFixed(2).padStart(8)}  ${q.yMax.toFixed(2).padStart(8)}`)
  })
}

console.log('\n\nPART 2 — TRAS CALIBRACIÓN de assets.ts (boca debe quedar −Z, miras +Y, empuñadura +Z abajo)')
console.log('='.repeat(70))
for (const [f, cal] of Object.entries(CALS)) {
  const verts = worldData[f]
  const cald = verts.map(p => {
    let w = new Vector3(p[0], p[1], p[2])
    if (cal.rz) w.applyAxisAngle(new Vector3(0, 0, 1), cal.rz)
    if (cal.ry) w.applyAxisAngle(new Vector3(0, 1, 0), cal.ry)
    if (cal.rx) w.applyAxisAngle(new Vector3(1, 0, 0), cal.rx)
    return w
  })
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (const p of cald) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p.getComponent(a)); mx[a] = Math.max(mx[a], p.getComponent(a)) }
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
  const long = size.indexOf(Math.max(...size))
  console.log(`\n${f}: largo=${['X','Y','Z'][long]} (X=${size[0].toFixed(1)} Y=${size[1].toFixed(1)} Z=${size[2].toFixed(1)})`)

  // secciones: frente 15% (debe ser FINO: cañón), atrás 25% (grueso: culata/empuñadura baja)
  const zSpan = size[2]
  const front = cald.filter(p => p.z < mn[2] + zSpan * 0.15)
  const rear = cald.filter(p => p.z > mx[2] - zSpan * 0.25)
  const yMid = (mn[1] + mx[1]) / 2
  const stat = arr => {
    if (!arr.length) return 'n=0'
    const yMin = arr.reduce((m, p) => Math.min(m, p.y), Infinity)
    const yMax = arr.reduce((m, p) => Math.max(m, p.y), -Infinity)
    const yMean = arr.reduce((s, p) => s + p.y, 0) / arr.length
    return `n=${String(arr.length).padStart(5)} Ymed=${yMean.toFixed(2).padStart(7)} Ymin=${yMin.toFixed(2).padStart(7)} Ymax=${yMax.toFixed(2).padStart(7)}`
  }
  console.log(`  FRENTE (z<15%): ${stat(front)}`)
  console.log(`  ATRÁS  (z>75%): ${stat(rear)}`)
  const yTopGeneral = (mn[1] + mx[1]) / 2
  // ¿la masa del frente está ARRIBA (corredera) y la de atrás ABAJO (empuñadura)?
  const frontMean = front.reduce((s, p) => s + p.y, 0) / (front.length || 1)
  const rearMean = rear.reduce((s, p) => s + p.y, 0) / (rear.length || 1)
  console.log(`  frente Y medio ${frontMean.toFixed(2)} vs atrás ${rearMean.toFixed(2)} vs centro ${(yTopGeneral).toFixed(2)} → ${frontMean > rearMean ? 'frente MÁS ALTO (miras arriba ✓)' : 'frente MÁS BAJO (¡arma boca abajo!)'}`)
}
