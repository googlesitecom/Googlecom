# ============================================================
# E2E v13.3 RUN B1 — cinemática LANZAMIENTO AÉREO (?debugcine=1)
# JPEG + viewport 800×450 (encode rápido en swiftshader)
# Poll del reloj simulado vía window.__es.dropCine.t
# ============================================================
import sys, time, json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
OUT = '/home/z/my-project/Googlecom/scripts/e2e-root/'

results = {'ok': [], 'fail': []}

def check(name, cond):
    (results['ok'] if cond else results['fail']).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}', flush=True)

def shot(page, name):
    t0 = time.time()
    page.screenshot(path=OUT + name, type='jpeg', quality=85, timeout=150000)
    print(f'  [shot] {name} ({time.time()-t0:.0f}s)', flush=True)

def es_get(page, expr):
    try:
        return page.evaluate(expr)
    except Exception:
        return None

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-ctx-search', '--no-sandbox',
    ])
    ctx = browser.new_context(viewport={'width': 800, 'height': 450})
    page = ctx.new_page()
    cine_logs, errors = [], []
    page.on('console', lambda m: cine_logs.append(m.text) if m.text.startswith('[cine]') else None)
    page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:150])))

    page.goto(BASE + '?debugcine=1', wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=60000)
    stamp = str(int(time.time()))[-6:]
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'Drop133e_' + stamp)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=Start deployment', timeout=30000)
    t0 = time.time()
    page.click('button:has-text("Start deployment")')

    def wait_es(expr, timeout=300, step=0.7):
        t0 = time.time()
        while time.time() - t0 < timeout:
            v = es_get(page, expr)
            if v:
                return v
            page.wait_for_timeout(int(step * 1000))
        return None

    ok = wait_es('window.__es && window.__es.dropCine ? true : false', 300)
    check('dropCine montado', bool(ok))

    def wait_t(lo, hi, timeout=240):
        t0 = time.time()
        while time.time() - t0 < timeout:
            t = es_get(page, 'window.__es && window.__es.dropCine ? window.__es.dropCine.t : -1')
            if t is not None and lo <= t <= hi + 10:
                return t
            page.wait_for_timeout(600)
        return None

    t = wait_t(2.5, 3.8)
    check(f'avión fase A (t={t})', t is not None)
    shot(page, 'v133d-cine-plane.jpg')

    t = wait_t(4.6, 5.8)
    check(f'héroe caída (t={t})', t is not None)
    shot(page, 'v133d-cine-freefall.jpg')

    t = wait_t(7.0, 8.5)
    check(f'campana abierta (t={t})', t is not None)
    shot(page, 'v133d-cine-canopy.jpg')

    hs = wait_es('window.__es && window.__es.dropCine && window.__es.dropCine.hero && window.__es.dropCine.hero.state === "landed" && window.__es.dropCine.hero.stateT > 0.75 ? window.__es.dropCine.hero.stateT : false', 240)
    check(f'héroe aterrizado en pose (stateT={hs})', hs not in (None, False))
    shot(page, 'v133d-cine-landed.jpg')

    st = wait_es('window.__es && window.__es.dropCine ? window.__es.dropCine.troopers.map(t=>t.state).join(",") : false', 60)
    print(f'  [troopers] {st}', flush=True)
    check('escuadrón de 9', bool(st) and len(st.split(',')) == 9)
    open(OUT + 'v133d-cine-logs.txt', 'w').write('\n'.join(cine_logs) + '\n')
    check('sin errores de página', len(errors) == 0)
    for e in errors[:4]:
        print('    ERR: ' + e[:150], flush=True)
    print(f'  [total] {time.time()-t0:.0f}s', flush=True)
    ctx.close()
    browser.close()

print('\n===== RUN B1 RESUMEN =====')
for k in results['ok']:
    print(f'  PASS {k}')
for k in results['fail']:
    print(f'  FAIL {k}')
json.dump(results, open(OUT + 'v133d-drop-results.json', 'w'), indent=1)
sys.exit(1 if results['fail'] else 0)
