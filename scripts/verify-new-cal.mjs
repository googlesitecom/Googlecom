// Verifica las calibraciones NUEVAS de assets.ts (post-fix):
// boca → −Z, miras → +Y, empuñadura baja en +Z.
import fs from 'node:fs'
import { Matrix4, Vector3, Quaternion } from 'three'

const CALS = {
  'Pistola.glb': { ry: -Math.PI / 2 },
  'Smg.glb':     { ry: Math.PI / 2 },
  'Rifle.glb':   {},
  'sniper.glb':  { ry: Math.PI },
}

function parseGLB(path) {
  const buf = fs.readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
  const binStart = 20 + jsonLen
  const binLen = buf.readUInt32LE(binStart)
  return { json, bin: buf.slice(binStart + 8, binStart + 8 + binLen) }
}

const v = new Vector3()

let allOk = true
for (const [f, cal] of Object.entries(CALS)) {
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
        v.set(bin.readFloatLE(off + k * stride), bin.readFloatLE(off + k * stride + 4), bin.readFloatLE(off + k * stride + 8)).applyMatrix4(w)
        let w2 = v.clone()
        if (cal.rz) w2.applyAxisAngle(new Vector3(0, 0, 1), cal.rz)
        if (cal.ry) w2.applyAxisAngle(new Vector3(0, 1, 0), cal.ry)
        if (cal.rx) w2.applyAxisAngle(new Vector3(1, 0, 0), cal.rx)
        verts.push(w2)
      }
    }
  }

  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (const p of verts) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p.getComponent(a)); mx[a] = Math.max(mx[a], p.getComponent(a)) }
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
  const long = size.indexOf(Math.max(...size))
  const zSpan = size[2]
  const yMid = (mn[1] + mx[1]) / 2

  // frente = 12% inicial en Z (boca); atrás = 22% final (culata/empuñadura)
  const front = verts.filter(p => p.z < mn[2] + zSpan * 0.12)
  const rear = verts.filter(p => p.z > mx[2] - zSpan * 0.22)
  const mean = arr => arr.reduce((s, p) => s + p.y, 0) / (arr.length || 1)
  const yMin = arr => arr.reduce((m, p) => Math.min(m, p.y), Infinity)

  const frontHigh = mean(front) > yMid
  const rearLow = yMin(rear) < yMid
  // la boca debe estar en −Z: la sección delantera debe ser más FINA que la trasera
  const rad = arr => {
    if (!arr.length) return 0
    const my = mean(arr), mx2 = arr.reduce((s, p) => s + p.x, 0) / arr.length
    return arr.reduce((s, p) => s + Math.hypot(p.x - mx2, p.y - my), 0) / arr.length
  }
  const frontThin = rad(front) < rad(rear)

  const ok = long === 2 && frontHigh && rearLow && frontThin
  if (!ok) allOk = false
  console.log(`${f}: largo=${['X','Y','Z'][long]} | frente alto=${frontHigh ? '✓' : '✗'} (${mean(front).toFixed(1)} vs centro ${yMid.toFixed(1)}) | atrás baja=${rearLow ? '✓' : '✗'} | boca fina en −Z=${frontThin ? '✓' : '✗'} | ${ok ? 'CORRECTA ✓' : 'MAL ✗'}`)
}
console.log(allOk ? '\nTODAS LAS ARMAS CORRECTAS' : '\nHAY ARMAS MAL CALIBRADAS')
