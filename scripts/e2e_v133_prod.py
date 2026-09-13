# ============================================================
# Smoke test v13.3 en PRODUCCIÓN (googlesitecom.github.io)
# registro → despliegue → cinemática de lanzamiento montada → sin errores
# ============================================================
import sys, time
from playwright.sync_api import sync_playwright

BASE = 'https://googlesitecom.github.io/Googlecom/'

ok, fail = [], []
def check(name, cond):
    (ok if cond else fail).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}', flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-ctx-search', '--no-sandbox',
    ])
    ctx = browser.new_context(viewport={'width': 800, 'height': 450})
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:150])))
    page.on('console', lambda m: print('  [console.error]', m.text[:150]) if m.type == 'error' else None)

    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=60000)
    check('auth screen', True)
    stamp = str(int(time.time()))[-6:]
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'Prod133_' + stamp)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=Start deployment', timeout=30000)
    check('menú con Deploy', True)
    page.click('button:has-text("Start deployment")')
    # cinemática nueva: el título/subtítulo se dibuja en el CANVAS 2D (no DOM)
    # → la garantía del flujo nuevo es dropCine montado (avión + escuadrón)
    try:
        v = page.wait_for_function('window.__es && window.__es.dropCine ? true : false', timeout=300000)
        check('cinemática de lanzamiento en marcha (dropCine)', bool(v))
    except Exception:
        check('cinemática de lanzamiento en marcha (dropCine)', False)
    # saltar cinemática → juego
    page.keyboard.press('KeyW')
    try:
        page.wait_for_function(
            'document.body.innerText.includes("VITALS") || document.body.innerText.includes("AMBER")',
            timeout=300000)
        check('partida en marcha', True)
    except Exception:
        check('partida en marcha', False)
    check('sin pageerror', len(errors) == 0)
    ctx.close()
    browser.close()

print('\n===== PRODUCCIÓN v13.3 =====')
for k in ok: print(f'  PASS {k}')
for k in fail: print(f'  FAIL {k}')
sys.exit(1 if fail else 0)
