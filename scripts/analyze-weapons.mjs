// Análisis de orientación en espacio-mundo de los GLB de armas:
// recorre el árbol de nodos aplicando matrices, transforma los vértices reales
// y determina eje largo, extremo fino (boca) y distribución vertical.
import fs from 'node:fs'
import { Matrix4, Vector3, Quaternion } from 'three'

const files = ['Pistola.glb', 'Smg.glb', 'Rifle.glb', 'sniper.glb']

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
  if (acc.componentType !== 5126) throw new Error('componentType no FLOAT: ' + acc.componentType)
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

for (const f of files) {
  const { json, bin } = parseGLB('/home/z/my-project/public/models/' + f)
  console.log('='.repeat(66))
  console.log('ARMA:', f)

  // matrices mundiales por nodo
  const world = new Map()
  const sceneNodes = json.scenes[json.scene || 0].nodes
  function walk(nodeIdx, parent) {
    const n = json.nodes[nodeIdx]
    const local = new Matrix4()
    if (n.matrix) local.fromArray(n.matrix)
    else {
      local.compose(
        n.translation ? new Vector3(...n.translation) : new Vector3(),
        n.rotation ? new Quaternion(...n.rotation) : new Quaternion(),
        n.scale ? new Vector3(...n.scale) : new Vector3(1, 1, 1),
      )
    }
    const w = new Matrix4().multiplyMatrices(parent, local)
    world.set(nodeIdx, w)
    for (const c of n.children || []) walk(c, w)
  }
  const I = new Matrix4()
  for (const r of sceneNodes) walk(r, I)

  // acumular vértices mundiales
  let verts = []
  for (const [i, n] of json.nodes.entries()) {
    if (n.mesh === undefined) continue
    const w = world.get(i)
    for (const p of json.meshes[n.mesh].primitives) {
      const pos = readPositions(json, bin, p.attributes.POSITION)
      for (let k = 0; k < pos.length; k += 3) {
        v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(w)
        verts.push(v.x, v.y, v.z)
      }
    }
  }
  const n = verts.length / 3
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const val = verts[i * 3 + a]
      if (val < mn[a]) mn[a] = val
      if (val > mx[a]) mx[a] = val
    }
  }
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
  const axes = ['X', 'Y', 'Z']
  const long = size.indexOf(Math.max(...size))
  console.log(`vértices: ${n}`)
  console.log(`bbox mundo: min=[${mn.map(x => x.toFixed(1)).join(', ')}] max=[${mx.map(x => x.toFixed(1)).join(', ')}]`)
  console.log(`tamaño: X=${size[0].toFixed(1)} Y=${size[1].toFixed(1)} Z=${size[2].toFixed(1)} → EJE LARGO=${axes[long]}`)

  // perfil de grosor por tercios a lo largo del eje largo (boca = extremo fino)
  const li = long
  const others = [0, 1, 2].filter(a => a !== li)
  const span = Math.max(0.001, mx[li] - mn[li])
  const thirds = [[], [], []]
  const thirdUp = [[], [], []]   // fracción de masa encima del centro vertical
  for (let i = 0; i < n; i++) {
    const a = verts[i * 3 + li]
    const b = verts[i * 3 + others[0]]
    const c = verts[i * 3 + others[1]]
    const t = Math.min(0.999, Math.max(0, (a - mn[li]) / span))
    const third = Math.floor(t * 3)
    thirds[third].push(Math.hypot(b - (mn[others[0]] + mx[others[0]]) / 2, c - (mn[others[1]] + mx[others[1]]) / 2))
    // masa vertical relativa: coordenada del eje "vertical probable" (Y si largo≠Y, sino Z)
    const vi = long === 1 ? 2 : 1
    const vc = verts[i * 3 + vi]
    const vMid = (mn[vi] + mx[vi]) / 2
    const vSpan = Math.max(0.001, mx[vi] - mn[vi])
    thirdUp[third].push((vc - vMid) / (vSpan / 2))
  }
  const prof = thirds.map(arr => (arr.length ? (arr.reduce((s, x) => s + x, 0) / arr.length) : 0))
  const ups = thirdUp.map(arr => (arr.length ? (arr.reduce((s, x) => s + x, 0) / arr.length) : 0))
  const thickIdx = prof.indexOf(Math.max(...prof))
  const thinIdx = prof.indexOf(Math.min(...prof))
  const dirName = d => (d === 0 ? 'MÍNIMO(-)' : d === 2 ? 'MÁXIMO(+)' : 'centro')
  console.log(`grosor por tercios (${axes[long]} - → +): [${prof.map(x => x.toFixed(1)).join(', ')}]`)
  console.log(`  extremo GRUESO (culata) en ${dirName(thickIdx)}, extremo FINO (boca) en ${dirName(thinIdx)}`)
  console.log(`masa vertical por tercios (−1=abajo, +1=arriba): [${ups.map(x => x.toFixed(2)).join(', ')}]`)
  console.log()
}
