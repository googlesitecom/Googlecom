// ============================================================
// Verificación DETERMINISTA de la orientación de las armas GLB
// Replica la cadena exacta de assets.ts (bake matrixWorld +
// calibración por archivo) y mide la geometría resultante:
//   - ¿el extremo FINO (boca) queda en −Z?
//   - ¿la masa superior (miras) queda en +Y y la empuñadura baja?
//   - ¿la sección frontal está más ALTA que la trasera (corredera)?
// ============================================================
import { readFileSync } from 'node:fs'

const files = {
  'Pistola.glb': { rz: Math.PI, ry: Math.PI / 2 },
  'Smg.glb':     { ry: -Math.PI / 2 },
  'Rifle.glb':   {},
  'sniper.glb':  { ry: Math.PI },
}

// ---- parser GLB mínimo (posición + normal + índices + nodos) ----
function parseGLB(path) {
  const buf = readFileSync(path)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let off = 12
  let json = null, bin = null
  while (off < buf.length) {
    const len = dv.getUint32(off, true)
    const type = dv.getUint32(off + 4, true)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'))
    else if (type === 0x004e4942) bin = data
    off += 8 + len
  }
  return { json, bin, dv: new DataView(bin.buffer, bin.byteOffset, bin.byteLength) }
}

// accessors mínimos
function accessorView(acc, g) {
  const comp = { 5126: 4, 5123: 2, 5125: 4, 5121: 1 }[acc.componentType]
  const n = acc.count * acc.type === 'VEC3' && acc.type
  const numComp = acc.type === 'VEC3' ? 3 : acc.type === 'VEC2' ? 2 : acc.type === 'SCALAR' ? 1 : 4
  const count = acc.count * numComp
  const out = new Float32Array(acc.count * (numComp > 3 ? 3 : numComp))
  const bv = g.bin
  const bdv = g.dv
  const byteOffset = (acc.bufferView.byteOffset || 0) + (acc.byteOffset || 0)
  const stride = acc.bufferView.byteStride || numComp * comp
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < (numComp > 3 ? 3 : numComp); c++) {
      const p = byteOffset + i * stride + c * comp
      let v
      if (acc.componentType === 5126) v = bdv.getFloat32(p, true)
      else if (acc.componentType === 5123) v = bdv.getUint16(p, true)
      else if (acc.componentType === 5121) v = bv[p]
      else if (acc.componentType === 5125) v = bdv.getUint32(p, true)
      out[i * Math.min(numComp, 3) + c] = v
    }
  }
  return { arr: out, numComp: Math.min(numComp, 3) }
}

function nodeMatrix(node) {
  const m = new Float32Array(16)
  if (node.matrix) {
    for (let i = 0; i < 16; i++) m[i] = node.matrix[i]
  } else {
    // T * R * S
    const t = node.translation || [0, 0, 0]
    const q = node.rotation || [0, 0, 0, 1]
    const s = node.scale || [1, 1, 1]
    const [x, y, z, w] = q
    const x2 = x + x, y2 = y + y, z2 = z + z
    const xx = x * x2, xy = x * y2, xz = x * z2
    const yy = y * y2, yz = y * z2, zz = z * z2
    const wx = w * x2, wy = w * y2, wz = w * z2
    const r = [
      (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
      (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1,
    ]
    for (let i = 0; i < 16; i++) m[i] = r[i]
  }
  return m
}

function mul(a, b) {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1] + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3]
    }
  }
  return o
}

function applyM(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ]
}

// recolectar vértices en espacio-mundo (igual que collectMeshes de assets.ts)
function collectWorldVerts(g) {
  const verts = []
  const scenes = g.json.scenes[g.json.scene || 0].nodes
  const walk = (nodeIdx, parentM) => {
    const node = g.json.nodes[nodeIdx]
    const m = mul(parentM, nodeMatrix(node))
    if (node.mesh !== undefined) {
      const mesh = g.json.meshes[node.mesh]
      for (const prim of mesh.primitives) {
        const posAcc = g.json.accessors[prim.attributes.POSITION]
        const view = accessorView(posAcc, g)
        const idxAcc = prim.indices ? g.json.accessors[prim.indices] : null
        let indices = null
        if (idxAcc) {
          const iv = accessorView(idxAcc, g)
          indices = iv.arr
        }
        const n = posAcc.count
        for (let i = 0; i < n; i++) {
          const v = [view.arr[i * 3], view.arr[i * 3 + 1], view.arr[i * 3 + 2]]
          verts.push(applyM(m, v))
        }
      }
    }
    if (node.children) for (const c of node.children) walk(c, m)
  }
  for (const s of scenes) walk(s, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  return verts
}

// rotaciones de calibración (mismo orden que assets.ts)
function rotateZ(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]] }
function rotateY(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c] }
function rotateX(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c] }

// ---- análisis ----
for (const [file, cal] of Object.entries(files)) {
  const g = parseGLB(`public/models/${file}`)
  const raw = collectWorldVerts(g)

  // tamaño de muestra (rendimiento)
  const verts = raw.length > 30000 ? raw.filter((_, i) => i % Math.ceil(raw.length / 30000) === 0) : raw

  // 1) sin calibrar: eje largo
  let bb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  for (const v of verts) for (let i = 0; i < 3; i++) { bb.min[i] = Math.min(bb.min[i], v[i]); bb.max[i] = Math.max(bb.max[i], v[i]) }
  const size = [0, 1, 2].map(i => bb.max[i] - bb.min[i])
  const longAxis = size.indexOf(Math.max(...size))

  // 2) aplicar calibración
  const cald = verts.map(v => {
    let w = v
    if (cal.rz) w = rotateZ(w, cal.rz)
    if (cal.ry) w = rotateY(w, cal.ry)
    if (cal.rx) w = rotateX(w, cal.rx)
    return w
  })

  bb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  for (const v of cald) for (let i = 0; i < 3; i++) { bb.min[i] = Math.min(bb.min[i], v[i]); bb.max[i] = Math.max(bb.max[i], v[i]) }
  const len = { x: bb.max[0] - bb.min[0], y: bb.max[1] - bb.min[1], z: bb.max[2] - bb.min[2] }
  const cz = (bb.min[2] + bb.max[2]) / 2

  // sección frontal (15% inicial en Z) y trasera (25% final)
  const front = cald.filter(v => v[2] < bb.min[2] + len.z * 0.15)
  const rear = cald.filter(v => v[2] > bb.max[2] - len.z * 0.25)
  const meanY = arr => arr.reduce((s, v) => s + v[1], 0) / (arr.length || 1)
  const minY = arr => arr.reduce((m, v) => Math.min(m, v[1]), Infinity)
  const maxY = arr => arr.reduce((m, v) => Math.max(m, v[1]), -Infinity)

  // radio medio de la sección en cada extremo (grosor)
  const rad = arr => {
    if (!arr.length) return 0
    const my = meanY(arr), mx = arr.reduce((s, v) => s + v[0], 0) / arr.length
    return arr.reduce((s, v) => s + Math.hypot(v[0] - mx, v[1] - my), 0) / arr.length
  }

  console.log(`\n=== ${file} (n=${verts.length}/${raw.length}) ===`)
  console.log(`  eje largo ORIGINAL: ${['X', 'Y', 'Z'][longAxis]} (tamaños originales X=${size[0].toFixed(3)} Y=${size[1].toFixed(3)} Z=${size[2].toFixed(3)})`)
  console.log(`  tras calibración: lenX=${len.x.toFixed(3)} lenY=${len.y.toFixed(3)} lenZ=${len.z.toFixed(3)} → eje largo = ${['X','Y','Z'][[len.x, len.y, len.z].indexOf(Math.max(len.x, len.y, len.z))]}`)
  console.log(`  EXTREMO FRONTAL (z<min+15%): n=${front.length} radio=${rad(front).toFixed(4)} meanY=${meanY(front).toFixed(3)} (rango Y ${minY(front).toFixed(3)}..${maxY(front).toFixed(3)})`)
  console.log(`  EXTREMO TRASERO  (z>max-25%): n=${rear.length} radio=${rad(rear).toFixed(4)} meanY=${meanY(rear).toFixed(3)} (rango Y ${minY(rear).toFixed(3)}..${maxY(rear).toFixed(3)})`)
  const thinAtFront = rad(front) < rad(rear)
  console.log(`  ¿extremo FINO delante (boca en −Z)? ${thinAtFront ? 'SÍ ✓' : 'NO ✗ (la boca quedaría atrás → arma al revés)'}`)
  const gripBelow = minY(rear) < minY(front) - 0.01
  console.log(`  ¿la empuñadura baja por DETRÁS (masa baja en +Z)? ${gripBelow ? 'SÍ ✓' : 'NO ✗'}`)
  const frontHigh = meanY(front) > meanY(rear)
  console.log(`  ¿sección frontal más ALTA (corredera arriba)? ${frontHigh ? 'SÍ ✓' : 'NO ✗ (frontal baja → arma boca abajo)'}`)
}
