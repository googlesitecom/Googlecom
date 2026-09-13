// v13.4: verificación del nuevo modelo de escopeta con three.js (Node)
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const THREE = require('three')

// reconstrucción del modelo del breacher (misma lógica que viewmodel.ts)
const g = new THREE.Group()
const std = (c, metal, rough) => new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough })
const mats = { STEEL: std(0x24262b,0.68,0.5), BLUED: std(0x15161a,0.82,0.36) }
const meshes = []
const put = (m, x, y, z, rx=0) => { m.position.set(x,y,z); if(rx) m.rotation.x=rx; g.add(m); meshes.push(m) }
const boxM = (w,h,d,mat) => new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat)
const cylZ = (r1,r2,h,mat,seg=14) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg), mat); m.rotation.x=Math.PI/2; return m }

put(cylZ(0.0165,0.0195,0.38,mats.BLUED,16), 0, 0.056, -0.51)
put(cylZ(0.0205,0.0205,0.028,mats.BLUED,16), 0, 0.056, -0.70)
put(boxM(0.058,0.076,0.23,mats.STEEL), 0, 0.036, -0.11)
put(boxM(0.05,0.088,0.2,std(0x1e2024,0.06,0.9)), 0, 0.006, 0.16)
put(boxM(0.06,0.058,0.15,std(0x1e2024,0.06,0.9)), 0, 0.012, -0.49)
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.013,0.0035,8,16), mats.STEEL)
ring.position.set(0,0.081,0.005); g.add(ring)
const bead = cylZ(0.0055,0.0055,0.012,std(0xc9a24a,0.85,0.3),8)
put(bead, 0, 0.081, -0.662)

// bbox y checks
const bb = new THREE.Box3().setFromObject(g)
const size = new THREE.Vector3(); bb.getSize(size)
console.log('bbox size:', size.x.toFixed(3), size.y.toFixed(3), size.z.toFixed(3))
console.log('z range:', bb.min.z.toFixed(3), '→', bb.max.z.toFixed(3))
console.log('mesh count (subset):', meshes.length + 2)
// checks: sight alignment
console.log('bead y:', bead.position.y, 'ring y:', ring.position.y, '→ aligned:', bead.position.y === ring.position.y)
console.log('muzzle z: -0.715 dentro de bbox:', bb.min.z < -0.715)
