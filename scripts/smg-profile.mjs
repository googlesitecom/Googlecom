// Perfil fino de la Smg (P90) a lo largo de X: localizar el cañón
// (zona de sección mínima) y su altura relativa → extremo de la boca.
import fs from 'node:fs'
import { Matrix4, Vector3, Quaternion } from 'three'

const { json, bin } = (() => {
  const buf = fs.readFileSync('/home/z/my-project/public/models/Smg.glb')
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
  const binStart = 20 + jsonLen
  const binLen = buf.readUInt32LE(binStart)
  return { json, bin: buf.slice(binStart + 8, binStart + 8 + binLen) }
})()

function readPositions(aIdx) {
  const acc = json.accessors[aIdx]
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
    const pos = readPositions(p.attributes.POSITION)
    for (let k = 0; k < pos.length; k += 3) {
      v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(w)
      verts.push([v.x, v.y, v.z])
    }
  }
}

let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity
for (const p of verts) { mnX = Math.min(mnX, p[0]); mxX = Math.max(mxX, p[0]); mnY = Math.min(mnY, p[1]); mxY = Math.max(mxY, p[1]) }
const span = mxX - mnX
const yMid = (mnY + mxY) / 2

// perfil en 20 tramos: radio de sección (dispersión Y,Z) y altura media
const B = 20
const bins = Array.from({ length: B }, () => ({ n: 0, rSum: 0, ySum: 0, zSum: 0, zSpread: 0, yMin: Infinity, yMax: -Infinity }))
for (const p of verts) {
  const t = Math.min(0.999, (p[0] - mnX) / span)
  const b = bins[Math.floor(t * B)]
  b.n++
  b.ySum += p[1]
  b.zSum += p[2]
  b.yMin = Math.min(b.yMin, p[1]); b.yMax = Math.max(b.yMax, p[1])
}
for (const b of bins) {
  b.yMean = b.n ? b.ySum / b.n : 0
  b.zMean = b.n ? b.zSum / b.n : 0
}
for (const p of verts) {
  const t = Math.min(0.999, (p[0] - mnX) / span)
  const b = bins[Math.floor(t * B)]
  b.rSum += Math.hypot(p[1] - b.yMean, p[2] - b.zMean)
}
console.log('tramo |    X inicio   |   n   | radio | Y medio | Y min..max  (mundo, eje largo X)')
bins.forEach((b, i) => {
  const x0 = mnX + (i / B) * span
  console.log(`  ${String(i).padStart(2)}  |  ${x0.toFixed(0).padStart(6)}      | ${String(b.n).padStart(5)} | ${b.n ? (b.rSum / b.n).toFixed(1).padStart(5) : '  -  '} | ${(b.n ? b.yMean : 0).toFixed(1).padStart(7)} | ${b.n ? b.yMin.toFixed(0) : '-'}..${b.n ? b.yMax.toFixed(0) : '-'}`)
})
console.log(`\nY total: ${mnY.toFixed(1)}..${mxY.toFixed(1)} (centro ${yMid.toFixed(1)})`)
