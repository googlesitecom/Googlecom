# ============================================================
# Probe de calibración de la guardia de combate del lobby (v14.1)
# Registra una vez y prueba varias poses por URL; mide las
# posiciones mundiales de codos/manos (objetivo: puños delante
# del pecho, ~ (±0.15, 1.32, 0.28)).
# ============================================================
import time, subprocess, json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'

CANDIDATES = [
    ('q1', 'tax=1.28&taz=-0.3&tfx=-2.2&tfz=-1.4&sax=1.28&saz=0.3&sfx=-2.2&sfz=1.4'),
    ('q2', 'tax=1.28&taz=-0.15&tfx=-2.3&tfz=-1.5&sax=1.28&saz=0.15&sfx=-2.3&sfz=1.5'),
    ('q3', 'tax=1.28&taz=-0.3&tfx=-2.5&tfz=-1.6&sax=1.28&saz=0.3&sfx=-2.5&sfz=1.6'),
]

MEASURE = '''() => {
  const w = window.__lobbyDebug
  if (!w) return null
  const find = (re) => { let f = null; w.scene.traverse(o => { if (!f && re.test(o.name)) f = o }); return f }
  const m = (o) => o ? {
    x: +(o.matrixWorld.elements[12]).toFixed(2),
    y: +(o.matrixWorld.elements[13]).toFixed(2),
    z: +(o.matrixWorld.elements[14]).toFixed(2),
  } : null
  return { handR: m(find(/mixamorigRightHand/)), foreR: m(find(/mixamorigRightForeArm_/)),
           handL: m(find(/mixamorigLeftHand/)), foreL: m(find(/mixamorigLeftForeArm_/)),
           fingerBones: (() => { const h = find(/mixamorigRightHand/); const f = [];
             if (h) h.traverse(o => { if (o.name.includes('mixamorig') && o !== h) f.push(o.name) })
             return f.slice(0, 30) })() }
}'''

server = subprocess.Popen(['bun', 'scripts/serve-static.mjs'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--disable-ctx-search', '--no-sandbox',
        ])
        ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
        ctx.set_default_timeout(60000)
        page = ctx.new_page()
        page.goto(BASE + '?lobbytest=1', wait_until='domcontentloaded')
        page.wait_for_selector('text=Operator Access', timeout=90000)
        stamp = str(int(time.time()))[-6:]
        page.click('button:has-text("REGISTER")')
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'POSE_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        page.wait_for_timeout(5000)  # GLB aterriza

        for name, params in CANDIDATES:
            page.goto(BASE + '?lobbytest=1' + ('&' + params if params else ''), wait_until='domcontentloaded')
            page.wait_for_selector('text=SELECTED MODE', timeout=60000)
            page.wait_for_timeout(2500)
            r = page.evaluate(MEASURE)
            print(f'{name:12s} {json.dumps(r)}', flush=True)
        browser.close()
finally:
    server.terminate()
print('done')
