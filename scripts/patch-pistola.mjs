// Parchea Pistola.glb: convierte KHR_materials_pbrSpecularGlossiness (no soportado
// por Three.js moderno) a pbrMetallicRoughness estándar, recuperando la textura
// difusa que estaba atrapada dentro de la extensión.
import fs from 'node:fs'

const path = '/home/z/my-project/public/models/Pistola.glb'
const buf = fs.readFileSync(path)

// cabecera GLB: magic(4) version(4) total(4) | chunk: len(4) type(4) data
const jsonLen = buf.readUInt32LE(12)
const jsonType = buf.readUInt32LE(16)
if (jsonType !== 0x4e4f534a) throw new Error('el primer chunk no es JSON')
let json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))

const binStart = 20 + jsonLen
const binLen = buf.readUInt32LE(binStart)
const binType = buf.readUInt32LE(binStart + 4)
if (binType !== 0x004e4942) throw new Error('el segundo chunk no es BIN')
const binData = buf.slice(binStart + 8, binStart + 8 + binLen)

for (const mat of json.materials || []) {
  const ext = mat.extensions?.KHR_materials_pbrSpecularGlossiness
  if (!ext) continue
  const pbr = mat.pbrMetallicRoughness || {}
  if (ext.diffuseTexture && pbr.baseColorTexture === undefined) {
    pbr.baseColorTexture = { index: ext.diffuseTexture.index, texCoord: ext.diffuseTexture.texCoord || 0 }
  }
  if (pbr.baseColorFactor === undefined && ext.diffuseFactor) pbr.baseColorFactor = ext.diffuseFactor
  // specular/glossiness → heurística metálica para un arma con corredera metálica
  const gloss = ext.glossinessFactor ?? 1
  const spec = (ext.specularFactor ?? [1, 1, 1]).reduce((s, v) => s + v, 0) / 3
  pbr.metallicFactor = Math.min(1, Math.max(0, spec * 0.75))
  pbr.roughnessFactor = Math.min(1, Math.max(0.05, 1 - gloss * 0.8))
  mat.pbrMetallicRoughness = pbr
  delete mat.extensions.KHR_materials_pbrSpecularGlossiness
  if (Object.keys(mat.extensions).length === 0) delete mat.extensions
  console.log(`material "${mat.name}" convertido: baseColorTexture=${JSON.stringify(pbr.baseColorTexture)} metallic=${pbr.metallicFactor.toFixed(2)} roughness=${pbr.roughnessFactor.toFixed(2)}`)
}

const strip = (arr, name) => {
  if (!arr) return
  const i = arr.indexOf(name)
  if (i >= 0) arr.splice(i, 1)
}
strip(json.extensionsUsed, 'KHR_materials_pbrSpecularGlossiness')
strip(json.extensionsRequired, 'KHR_materials_pbrSpecularGlossiness')
if (json.extensionsRequired?.length === 0) delete json.extensionsRequired
if (json.extensionsUsed?.length === 0) delete json.extensionsUsed

// re-serializar el GLB
const jsonBuf = Buffer.from(JSON.stringify(json))
const jsonPad = (4 - (jsonBuf.length % 4)) % 4
const jsonPadded = jsonPad ? Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]) : jsonBuf
const binPad = (4 - (binLen % 4)) % 4
const binPadded = binPad ? Buffer.concat([binData, Buffer.alloc(binPad, 0)]) : binData

const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length
const out = Buffer.alloc(total)
out.writeUInt32LE(0x46546c67, 0)
out.writeUInt32LE(2, 4)
out.writeUInt32LE(total, 8)
out.writeUInt32LE(jsonPadded.length, 12)
out.writeUInt32LE(0x4e4f534a, 16)
jsonPadded.copy(out, 20)
out.writeUInt32LE(binPadded.length, 20 + jsonPadded.length)
out.writeUInt32LE(0x004e4942, 24 + jsonPadded.length)
binPadded.copy(out, 28 + jsonPadded.length)

fs.writeFileSync(path, out)
console.log(`OK: ${path} reescrito (${(total / 1024 / 1024).toFixed(2)} MB, antes ${(buf.length / 1024 / 1024).toFixed(2)} MB)`)

// verificación
const vj = JSON.parse(out.slice(20, 20 + out.readUInt32LE(12)).toString('utf8'))
console.log('extensionsUsed ahora:', JSON.stringify(vj.extensionsUsed ?? '(ninguna)'))
console.log('baseColorTexture ahora:', JSON.stringify(vj.materials[0].pbrMetallicRoughness?.baseColorTexture))
