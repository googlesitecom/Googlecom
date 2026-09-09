// Calibración de la pose de apuntado del soldado (sin THREE global)
var __gmc = window.__game
var __rps = Array.from(__gmc.remotes.map.values())
var __rp = __rps.find(r => r.usingSoldier && !r.lastDead)
if (!__rp) { 'NO_SOLDIER' } else {
  var findB = function (re) { var f = null; __rp.root.traverse(function (o) { if (!f && re.test(o.name)) f = o }); return f }
  var armR = findB(/^mixamorigRightArm_/), armL = findB(/^mixamorigLeftArm_/)
  var foreR = findB(/^mixamorigRightForeArm_/), foreL = findB(/^mixamorigLeftForeArm_/)
  var handR = findB(/^mixamorigRightHand_/), handL = findB(/^mixamorigLeftHand_/)
  var yaw = __rp.root.rotation.y
  var fwd = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) }
  var left = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) }
  __rp.weaponHolder.updateWorldMatrix(true, false)
  var e = __rp.weaponHolder.matrixWorld.elements
  var hw = { x: e[12], y: e[13], z: e[14] }
  var gripT = { x: hw.x + fwd.x * 0.06 + left.x * 0.02, y: hw.y - 0.12, z: hw.z + fwd.z * 0.06 + left.z * 0.02 }
  var supT = { x: hw.x + fwd.x * 0.34 + left.x * 0.10, y: hw.y - 0.05, z: hw.z + fwd.z * 0.34 + left.z * 0.10 }
  function dist3(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) }
  function wpos(bone) { bone.updateWorldMatrix(true, false); var m = bone.matrixWorld.elements; return { x: m[12], y: m[13], z: m[14] } }
  function cost() {
    __rp.root.updateMatrixWorld(true)
    return dist3(wpos(handR), gripT) + dist3(wpos(handL), supT)
  }
  var P = [
    [armR, 'x', -0.2, 1.45], [armR, 'z', -1.5, 1.5], [armR, 'y', -1.3, 1.3],
    [foreR, 'x', -2.3, 0.1], [foreR, 'z', -1.1, 1.1],
    [armL, 'x', -0.2, 1.45], [armL, 'z', -1.5, 1.5], [armL, 'y', -1.3, 1.3],
    [foreL, 'x', -2.3, 0.1], [foreL, 'z', -1.1, 1.1],
  ]
  var state = P.map(function (p) { return p[0].rotation[p[1]] })
  var best = cost()
  for (var pass = 0; pass < 50; pass++) {
    var delta = 0.34 * Math.pow(0.93, pass)
    for (var pi = 0; pi < P.length; pi++) {
      var bone = P[pi][0], axis = P[pi][1], lo = P[pi][2], hi = P[pi][3]
      for (var si = 0; si < 2; si++) {
        var sgn = si === 0 ? 1 : -1
        var orig = bone.rotation[axis]
        var cand = Math.max(lo, Math.min(hi, orig + sgn * delta))
        if (Math.abs(cand - orig) < 1e-6) continue
        bone.rotation[axis] = cand
        var c = cost()
        if (c < best - 1e-5) { best = c; state[pi] = cand }
        else bone.rotation[axis] = orig
      }
    }
  }
  P.forEach(function (p, i) { p[0].rotation[p[1]] = state[i] })
  var out = {
    cost: +best.toFixed(3),
    armR: { x: +armR.rotation.x.toFixed(2), y: +armR.rotation.y.toFixed(2), z: +armR.rotation.z.toFixed(2) },
    foreR: { x: +foreR.rotation.x.toFixed(2), z: +foreR.rotation.z.toFixed(2) },
    armL: { x: +armL.rotation.x.toFixed(2), y: +armL.rotation.y.toFixed(2), z: +armL.rotation.z.toFixed(2) },
    foreL: { x: +foreL.rotation.x.toFixed(2), z: +foreL.rotation.z.toFixed(2) },
  }
  JSON.stringify(out)
}
