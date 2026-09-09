// Inspección profunda de los GLB: chunk JSON + materiales + nodos + orientación
import fs from 'node:fs'

function parseGLB(path) {
  const buf = fs.readFileSync(path)
  const magic = buf.readUInt32LE(0)
  if (magic !== 0x46546c67) throw new Error('no es GLB: ' + path)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
  return json
}

const files = [
  '/home/z/my-project/public/models/Pistola.glb',
  '/home/z/my-project/public/models/Smg.glb',
  '/home/z/my-project/public/models/Rifle.glb',
  '/home/z/my-project/public/models/sniper.glb',
  '/home/z/my-project/public/models/Arbol.glb',
]

for (const f of files) {
  const j = parseGLB(f)
  console.log('='.repeat(70))
  console.log('FILE:', f.split('/').pop())
  console.log('extensionsUsed:', JSON.stringify(j.extensionsUsed || []))
  console.log('extensionsRequired:', JSON.stringify(j.extensionsRequired || []))
  console.log('generator:', j.asset?.generator || '?')
  console.log('scene default:', j.scenes?.[j.scene || 0]?.name || '(sin nombre)')

  // materiales
  console.log('--- MATERIALES (' + (j.materials || []).length + ') ---')
  for (const m of j.materials || []) {
    const pbr = m.pbrMetallicRoughness || {}
    const texInfo = pbr.baseColorTexture ? `baseColorTexture(index=${pbr.baseColorTexture.index} texCoord=${pbr.baseColorTexture.texCoord || 0})` : 'SIN baseColorTexture'
    console.log(`  [${m.name || 'sin nombre'}] ${texInfo} baseColor=${JSON.stringify(pbr.baseColorFactor || 'default')} metallic=${pbr.metallicFactor ?? 1} roughness=${pbr.roughnessFactor ?? 1} alphaMode=${m.alphaMode || 'OPAQUE'} doubleSided=${m.doubleSided || false}`)
    if (m.normalTexture) console.log(`    normalTexture(index=${m.normalTexture.index})`)
    if (m.occlusionTexture) console.log(`    occlusionTexture(index=${m.occlusionTexture.index})`)
    if (m.emissiveTexture) console.log(`    emissiveTexture(index=${m.emissiveTexture.index})`)
    if (m.extensions) console.log('    material.extensions:', Object.keys(m.extensions).join(','))
  }

  // texturas / imágenes
  console.log('--- TEXTURAS (' + (j.textures || []).length + ') ---')
  for (const t of j.textures || []) {
    const img = j.images?.[t.source]
    const sam = j.samplers?.[t.sampler]
    console.log(`  tex#${t.source} sampler=${JSON.stringify(sam || {})} image: mime=${img?.mimeType} uri=${img?.bufferView !== undefined ? 'bufferView:' + img.bufferView : img?.uri}`)
  }

  // mallas (posiciones min/max para orientación)
  console.log('--- MALLAS (' + (j.meshes || []).length + ') ---')
  for (const mesh of j.meshes || []) {
    for (const p of mesh.primitives || []) {
      const acc = j.accessors[p.attributes.POSITION]
      if (!acc) continue
      const mn = acc.min, mx = acc.max
      const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
      const long = size.indexOf(Math.max(...size))
      const axis = ['X', 'Y', 'Z'][long]
      console.log(`  [${mesh.name || '?'}] verts=${acc.count} bbox min=${mn.map(v => v.toFixed(2)).join(',')} max=${mx.map(v => v.toFixed(2)).join(',')} tamaño=(${size.map(v => v.toFixed(2)).join(',')}) EJE LARGO=${axis} material=${p.material}`)
    }
  }

  // nodos con transformaciones
  console.log('--- NODOS (' + (j.nodes || []).length + ') ---')
  const sceneNodes = new Set((j.scenes?.[0]?.nodes) || [])
  for (const [i, n] of (j.nodes || []).entries()) {
    const isRoot = sceneNodes.has(i)
    const rot = n.rotation ? 'rot=' + JSON.stringify(n.rotation.map(v => +v.toFixed(3))) : ''
    const scl = n.scale && (n.scale.some(v => v !== 1)) ? 'scale=' + JSON.stringify(n.scale) : ''
    const pos = n.translation ? 'pos=' + JSON.stringify(n.translation) : ''
    const mat = n.matrix ? 'MATRIX=' + JSON.stringify(n.matrix.map(v => +v.toFixed(2))) : ''
    console.log(`  #${i} ${isRoot ? '[ROOT] ' : ''}${n.name || '?'} ${pos} ${rot} ${scl} ${mat} ${n.mesh !== undefined ? 'mesh=' + n.mesh : ''}`)
  }
}
