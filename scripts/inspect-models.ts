// Inspección de los modelos GLB subidos por el usuario (armas + árbol)
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import fs from 'fs'

const files = process.argv.slice(2)
if (!files.length) { console.log('uso: bun inspect-models.ts <a.glb> <b.glb> ...'); process.exit(1) }

for (const f of files) {
  const buf = fs.readFileSync(f)
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const loader = new GLTFLoader()
  loader.parse(arrayBuffer, '', (gltf) => {
    const scene = gltf.scene
    let meshCount = 0
    let skinned = 0
    const mats = new Set<string>()
    let triangles = 0
    const boneNames: string[] = []
    scene.traverse(o => {
      const anyO = o as unknown as { isMesh?: boolean; isSkinnedMesh?: boolean; material?: THREE.Material; geometry?: THREE.BufferGeometry; isBone?: boolean; name?: string }
      if (anyO.isBone && boneNames.length < 30) boneNames.push(anyO.name ?? '?')
      if (anyO.isMesh) {
        meshCount++
        if (anyO.isSkinnedMesh) skinned++
        const g = anyO.geometry!
        if (g.index) triangles += g.index.count / 3
        else if (g.attributes.position) triangles += g.attributes.position.count / 3
        const m = anyO.material
        if (Array.isArray(m)) m.forEach(x => mats.add(x.name ?? x.type))
        else if (m) mats.add(m.name ?? m.type)
      }
    })
    console.log('=== ' + f + ' ===')
    console.log('meshes:', meshCount, '| skinned:', skinned, '| triángulos:', Math.round(triangles))
    console.log('materials:', [...mats].slice(0, 12).join(', '))
    console.log('animations:', gltf.animations.length ? gltf.animations.map(a => `"${a.name}" (${a.duration.toFixed(1)}s)`).join(', ') : '(ninguna)')
    if (boneNames.length) console.log('bones:', boneNames.join(', '))
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    console.log('bbox tamaño:', size.x.toFixed(3), 'x', size.y.toFixed(3), 'x', size.z.toFixed(3), '| y:', box.min.y.toFixed(3), '→', box.max.y.toFixed(3))
    // orientación: extensión dominante para saber el eje largo (cañón)
    console.log('ext: x', size.x.toFixed(2), 'y', size.y.toFixed(2), 'z', size.z.toFixed(2), '→ eje largo:', size.x > size.y && size.x > size.z ? 'X' : (size.y > size.z ? 'Y' : 'Z'))
    console.log('root:', scene.name || '(sin nombre)', '| hijos:', scene.children.map(c => c.name || c.type).slice(0, 8).join(', '))
  }, (err) => { console.error('ERROR en', f, err); process.exit(1) })
}
