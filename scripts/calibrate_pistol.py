# ============================================================
# Calibración v13.3 — solve DENTRO del navegador (rig real)
# usa window.__es (Game) sobre el soldado p9 del banco de pruebas:
# descenso por coordenadas de los 10 parámetros de brazos para
# llevar las manos a la posición de EMPUÑADURA A DOS MANOS
# ============================================================
import sys, time, json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
OUT = '/home/z/my-project/Googlecom/scripts/e2e-root/'

SOLVER = r"""
() => {
  const es = window.__es
  if (!es || !es.poseTestSoldiers || !es.poseTestSoldiers.length) return { error: 'no row' }
  const parts = es.poseTestSoldiers[0]
  const root = parts.root, body = parts.body
  const find = (re) => { let f = null; root.traverse(o => { if (!f && re.test(o.name)) f = o }); return f }
  const armR = find(/^mixamorigRightArm_/), armL = find(/^mixamorigLeftArm_/)
  const foreR = find(/^mixamorigRightForeArm_/), foreL = find(/^mixamorigLeftForeArm_/)
  const handR = find(/^mixamorigRightHand_/), handL = find(/^mixamorigLeftHand_/)
  if (!armR || !armL || !foreR || !foreL || !handR || !handL) return { error: 'no bones' }
  root.updateMatrixWorld(true)
  const be = body.matrixWorld.elements
  // marco CUERPO-LOCAL: la fila tiene rotación 0 → world − BP == body-local
  const BP = [be[12], be[13], be[14]]
  const pos = (b) => { b.updateWorldMatrix(true, false); const e = b.matrixWorld.elements;
    return [e[12] - BP[0], e[13] - BP[1], e[14] - BP[2]] }
  const before = { handR: pos(handR), handL: pos(handL) }
  // objetivos (coordenadas cuerpo-local = fila con rotación 0):
  // gatillo (derecha) al centro-pecho · apoyo (izquierda) envolviendo 6cm a la izquierda y 5 abajo
  const TR = [-0.16, 1.24, 0.38], TL = [-0.10, 1.19, 0.40]
  const d = (p, t) => Math.hypot(p[0]-t[0], p[1]-t[1], p[2]-t[2])
  const cost = () => d(pos(handR), TR) + d(pos(handL), TL)
  const P = [
    [armR, 'x', 0.3, 2.0], [armR, 'y', -1.5, 1.5], [armR, 'z', -1.9, 0.3],
    [foreR, 'x', -2.3, 0.1], [foreR, 'z', -1.0, 1.0],
    [armL, 'x', 0.3, 2.0], [armL, 'y', -1.5, 1.5], [armL, 'z', -0.3, 1.9],
    [foreL, 'x', -2.3, 0.1], [foreL, 'z', -1.0, 1.0],
  ]
  const state = P.map(p => p[0].rotation[p[1]])
  let best = cost()
  for (let pass = 0; pass < 90; pass++) {
    const delta = 0.32 * Math.pow(0.93, pass)
    for (let pi = 0; pi < P.length; pi++) {
      const [bone, axis, lo, hi] = P[pi]
      for (let si = 0; si < 2; si++) {
        const orig = bone.rotation[axis]
        const cand = Math.max(lo, Math.min(hi, orig + (si === 0 ? 1 : -1) * delta))
        if (Math.abs(cand - orig) < 1e-7) continue
        bone.rotation[axis] = cand
        const c = cost()
        if (c < best - 1e-6) { best = c; state[pi] = cand }
        else bone.rotation[axis] = orig
      }
    }
  }
  P.forEach((p, i) => { p[0].rotation[p[1]] = state[i] })
  const pr = pos(handR), pl = pos(handL)
  const r2 = (v) => v.map(x => +x.toFixed(2))
  return {
    cost: +best.toFixed(4),
    before: { handR: r2(before.handR), handL: r2(before.handL) },
    handR: r2(pr), handL: r2(pl),
    distR: +d(pr, TR).toFixed(3), distL: +d(pl, TL).toFixed(3),
    tArm: { x: r2([armR.rotation.x])[0], y: r2([armR.rotation.y])[0], z: r2([armR.rotation.z])[0] },
    tFore: { x: r2([foreR.rotation.x])[0], z: r2([foreR.rotation.z])[0] },
    sArm: { x: r2([armL.rotation.x])[0], y: r2([armL.rotation.y])[0], z: r2([armL.rotation.z])[0] },
    sFore: { x: r2([foreL.rotation.x])[0], z: r2([foreL.rotation.z])[0] },
  }
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-ctx-search', '--no-sandbox',
    ])
    ctx = browser.new_context(viewport={'width': 960, 'height': 540})
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:150])))

    page.goto(BASE + '?posetest=1', wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=60000)
    stamp = str(int(time.time()))[-6:]
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'Cal133_' + stamp)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=Start deployment', timeout=30000)
    page.click('button:has-text("Start deployment")')
    # esperar la fila (window.__es existe tras init; fila tras GLB)
    t0 = time.time()
    while time.time() - t0 < 300:
        try:
            n = page.evaluate('window.__es && window.__es.poseTestSoldiers ? window.__es.poseTestSoldiers.length : 0')
            if n and n >= 7:
                break
        except Exception:
            pass
        page.wait_for_timeout(1000)
    print(f'  fila lista ({n} soldados) en {time.time()-t0:.0f}s', flush=True)
    page.wait_for_timeout(2000)

    res = page.evaluate(SOLVER)
    print(json.dumps(res, indent=2), flush=True)
    json.dump(res, open(OUT + 'v133c-calib.json', 'w'), indent=1)
    page.wait_for_timeout(1500)
    page.screenshot(path=OUT + 'v133c-calib-preview.png', timeout=90000)
    try:
        from PIL import Image
        img = Image.open(OUT + 'v133c-calib-preview.png')
        w, h = img.size
        img.crop((0, int(h * 0.12), int(w * 0.45), h)).save(OUT + 'v133c-calib-pistols.png')
        print('  [crop] v133c-calib-pistols.png', flush=True)
    except Exception as e:
        print('  [crop] sin PIL:', e, flush=True)
    print('  errores de página:', len(errors), flush=True)
    ctx.close()
    browser.close()
