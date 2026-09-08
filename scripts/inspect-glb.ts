// Inspección del soldier.glb para integrarlo al juego
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import fs from 'fs'

const buf = fs.readFileSync('/home/z/my-project/soldier.glb')
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
    if (anyO.isBone && boneNames.length < 40) boneNames.push(anyO.name ?? '?')
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
  console.log('meshes:', meshCount, '| skinned:', skinned, '| triángulos:', Math.round(triangles))
  console.log('materials:', [...mats].join(', '))
  console.log('animations:', gltf.animations.length ? gltf.animations.map(a => `"${a.name}" (${a.duration.toFixed(1)}s)`).join(', ') : '(ninguna)')
  console.log('bones (primeros 40):', boneNames.join(', '))
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  console.log('bbox tamaño:', size.x.toFixed(2), 'x', size.y.toFixed(2), 'x', size.z.toFixed(2))
  console.log('bbox y:', box.min.y.toFixed(2), '→', box.max.y.toFixed(2))
  console.log('root name:', scene.name || '(sin nombre)', '| hijos:', scene.children.length)
  process.exit(0)
}, (err) => { console.error('ERROR:', err); process.exit(1) })
