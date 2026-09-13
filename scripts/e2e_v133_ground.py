# ============================================================
# E2E v13.3 RUN B2 — suelo tras el despliegue:
# saltar la cinemática (tecla) → HUD → mover → capturas
# (arena −10 % vs v13.2 + asfalto estable)
# ============================================================
import sys, time, json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
OUT = '/home/z/my-project/Googlecom/scripts/e2e-root/'
REF = OUT + 'deploy-v132-move1.png'   # referencia v13.2 (misma 2.ª vista)

results = {'ok': [], 'fail': []}

def check(name, cond):
    (results['ok'] if cond else results['fail']).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}', flush=True)

def shot(page, name):
    t0 = time.time()
    page.screenshot(path=OUT + name, type='jpeg', quality=85, timeout=150000)
    print(f'  [shot] {name} ({time.time()-t0:.0f}s)', flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-ctx-search', '--no-sandbox',
    ])
    ctx = browser.new_context(viewport={'width': 800, 'height': 450})
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:150])))

    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=60000)
    stamp = str(int(time.time()))[-6:]
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'Ground133_' + stamp)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=Start deployment', timeout=30000)
    t0 = time.time()
    page.click('button:has-text("Start deployment")')

    # esperar a que la cinemática arranque y saltarla al instante
    try:
        page.wait_for_function('window.__es && (window.__es.cine.active === true)', timeout=300000)
    except Exception:
        pass
    page.keyboard.press('KeyS')   # cualquier tecla → endCinematic
    try:
        page.wait_for_function(
            'document.body.innerText.includes("VITALS") || document.body.innerText.includes("AMBER")',
            timeout=300000)
        check('juego en marcha (HUD)', True)
    except Exception:
        check('juego en marcha (HUD)', False)
    page.wait_for_timeout(2500)
    shot(page, 'v133d-game-start.jpg')

    # mover 3 s (misma secuencia que el E2E v13.2)
    page.keyboard.down('KeyW')
    page.wait_for_timeout(3000)
    page.keyboard.up('KeyW')
    page.wait_for_timeout(500)
    shot(page, 'v133d-move1.jpg')
    page.wait_for_timeout(600)
    shot(page, 'v133d-move2.jpg')
    # seguir hacia el centro (asfalto de la calle principal)
    page.keyboard.down('KeyW')
    page.wait_for_timeout(5000)
    page.keyboard.up('KeyW')
    page.wait_for_timeout(400)
    shot(page, 'v133d-road.jpg')
    check('sin errores de página', len(errors) == 0)
    for e in errors[:4]:
        print('    ERR: ' + e[:150], flush=True)
    print(f'  [total] {time.time()-t0:.0f}s', flush=True)
    ctx.close()
    browser.close()

# ---- comparación de brillo (arena): mitad inferior del encuadre ----
try:
    from PIL import Image
    import statistics
    def lower_luma(path):
        img = Image.open(path).convert('RGB')
        w, h = img.size
        px = list(img.crop((0, int(h * 0.55), w, h)).getdata())
        return statistics.mean(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px)
    if __import__('os').path.exists(REF):
        old = lower_luma(REF)
        new = lower_luma(OUT + 'v133d-move1.jpg')
        delta = (new - old) / old * 100
        ratio = new / old
        print(f'  [brillo arena] v13.2={old:.1f} → v13.3={new:.1f} ({delta:+.1f} % lineal, ratio={ratio:.3f})', flush=True)
        # 0xe5e5e5 = 89,8 % sRGB ≈ 78,4 % lineal: el "10 % más oscuro"
        # perceptual se mide como ~-21 % en luma lineal (0xE5^2.2 ≈ 0.784)
        check(f'arena 10 % más oscura sRGB (ratio={ratio:.2f}, esperado 0.74-0.84)', 0.74 <= ratio <= 0.84)
    else:
        print('  [brillo] sin referencia v13.2', flush=True)
except Exception as e:
    print('  [brillo] PIL falla:', e, flush=True)

print('\n===== RUN B2 RESUMEN =====')
for k in results['ok']:
    print(f'  PASS {k}')
for k in results['fail']:
    print(f'  FAIL {k}')
json.dump(results, open(OUT + 'v133d-ground-results.json', 'w'), indent=1)
sys.exit(1 if results['fail'] else 0)
