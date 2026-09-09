// Perfil fino de cada arma a lo largo de su eje largo (espacio-mundo):
// localiza el cañón (sección mínima) → extremo real de la boca.
import fs from 'node:fs'
import { Matrix4, Vector3, Quaternion } from 'three'

const FILES = ['Pistola.glb', 'Smg.glb', 'Rifle.glb', 'sniper.glb']

function parseGLB(path) {
  const buf = fs.readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
  const binStart = 20 + jsonLen
  const binLen = buf.readUInt32LE(binStart)
  return { json, bin: buf.slice(binStart + 8, binStart + 8 + binLen) }
}

const v = new Vector3()

for (const f of FILES) {
  const { json, bin } = parseGLB('/home/z/my-project/public/models/' + f)
  const world = new Map()
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
  for (const r of json.scenes[json.scene || 0].nodes) walk(r, new Matrix4())

  const verts = []
  for (const [i, n] of json.nodes.entries()) {
    if (n.mesh === undefined) continue
    const w = world.get(i)
    for (const p of json.meshes[n.mesh].primitives) {
      const acc = json.accessors[p.attributes.POSITION]
      const bv = json.bufferViews[acc.bufferView]
      const off = (bv.byteOffset || 0) + (acc.byteOffset || 0)
      const stride = bv.byteStride || 12
      for (let k = 0; k < acc.count; k++) {
        v.set(
          bin.readFloatLE(off + k * stride),
          bin.readFloatLE(off + k * stride + 4),
          bin.readFloatLE(off + k * stride + 8),
        ).applyMatrix4(w)
        verts.push([v.x, v.y, v.z])
      }
    }
  }

  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (const p of verts) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]) }
  const long = [0, 1, 2].findIndex(a => mx[a] - mn[a] === Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]))
  const li = long
  const span = mx[li] - mn[li]
  const others = [0, 1, 2].filter(a => a !== li)

  const B = 24
  const bins = Array.from({ length: B }, () => ({ n: 0, o1: 0, o2: 0, r: 0, rN: 0 }))
  for (const p of verts) {
    const t = Math.min(0.999, (p[li] - mn[li]) / span)
    bins[Math.floor(t * B)].n++
  }
  for (const b of bins) { b.o1 /= b.n || 1; b.o2 /= b.n || 1 }
  for (const p of verts) {
    const t = Math.min(0.999, (p[li] - mn[li]) / span)
    const b = bins[Math.floor(t * B)]
    b.o1 += p[others[0]]
    b.o2 += p[others[1]]
  }
  for (const b of bins) { b.o1 /= b.n || 1; b.o2 /= b.n || 1 }
  for (const p of verts) {
    const t = Math.min(0.999, (p[li] - mn[li]) / span)
    const b = bins[Math.floor(t * B)]
    b.r += Math.hypot(p[others[0]] - b.o1, p[others[1]] - b.o2)
    b.rN++
  }
  const radii = bins.map(b => b.n ? b.r / b.rN : Infinity)
  // cañón: el tramo con más vertices EN la zona del radio mínimo
  // buscar la zona de sección mínima con densidad razonable
  let bestI = -1, bestScore = Infinity
  for (let i = 0; i < B; i++) {
    if (bins[i].n < 20) continue
    const score = radii[i]
    if (score < bestScore) { bestScore = score; bestI = i }
  }
  const endName = bestI < B / 2 ? 'MÍNIMO(−)' : 'MÁXIMO(+)'
  console.log(`${f}: eje largo=${['X','Y','Z'][li]}, cañón (sección mínima) en tramo ${bestI}/${B} → extremo ${endName}`)
  console.log(`  radios: ${radii.map(r => isFinite(r) ? r.toFixed(0) : ' -').join(' ')}`)
}
