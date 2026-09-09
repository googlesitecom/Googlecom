// Bboxes por pieza en espacio-mundo para cada arma
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

  console.log(`\n=== ${f} — piezas en espacio-mundo ===`)
  for (const [i, n] of json.nodes.entries()) {
    if (n.mesh === undefined) continue
    const w = world.get(i)
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
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
        for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], v.getComponent(a)); mx[a] = Math.max(mx[a], v.getComponent(a)) }
      }
    }
    const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
    console.log(`  ${String(json.meshes[n.mesh].name).padEnd(28)} X[${mn[0].toFixed(0).padStart(6)},${mx[0].toFixed(0).padStart(6)}] Y[${mn[1].toFixed(0).padStart(6)},${mx[1].toFixed(0).padStart(6)}] Z[${mn[2].toFixed(0).padStart(6)},${mx[2].toFixed(0).padStart(6)}] tamaño=(${size.map(s => s.toFixed(0)).join(',')})`)
  }
}
