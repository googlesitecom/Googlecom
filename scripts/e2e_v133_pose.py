# ============================================================
# E2E v13.3 RUN A — banco de pruebas de poses (?posetest=1)
# captura [pose] logs + fila de soldados + zoom de pistolas
# ============================================================
import sys, time, json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
OUT = '/home/z/my-project/Googlecom/scripts/e2e-root/'

results = {'ok': [], 'fail': []}

def check(name, cond):
    (results['ok'] if cond else results['fail']).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}', flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-ctx-search', '--no-sandbox',
    ])
    ctx = browser.new_context(viewport={'width': 960, 'height': 540})
    page = ctx.new_page()
    pose_logs, errors = [], []
    page.on('console', lambda m: pose_logs.append(m.text) if m.text.startswith('[pose]') else None)
    page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:150])))

    # registro directo con la URL de posetest (el server ya soporta query)
    page.goto(BASE + '?posetest=1', wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=60000)
    stamp = str(int(time.time()))[-6:]
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'Pose133c_' + stamp)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')

    # despliegue → cinemática interceptada por POSE TEST
    page.wait_for_selector('text=Start deployment', timeout=30000)
    t0 = time.time()
    page.click('button:has-text("Start deployment")')
    # poll de logs [pose] (fila construida tras el parseo del GLB)
    while time.time() - t0 < 300 and len(pose_logs) < 7:
        page.wait_for_timeout(1000)
    print(f'  [pose logs] {len(pose_logs)} en {time.time()-t0:.0f}s', flush=True)
    for line in pose_logs[:8]:
        print('    ' + line, flush=True)
    open(OUT + 'v133c-pose-logs.txt', 'w').write('\n'.join(pose_logs) + '\n')
    check('pose row: 7 [pose] logs', len(pose_logs) >= 7)
    check('pose log: pistola p9', any('p9' in l for l in pose_logs))
    page.wait_for_timeout(3000)
    page.screenshot(path=OUT + 'v133c-pose-row.png', timeout=90000)
    print('  [shot] v133c-pose-row.png', flush=True)

    # zoom de los dos soldados con PISTOLA (soldado 0-1, a la izquierda)
    try:
        from PIL import Image
        img = Image.open(OUT + 'v133c-pose-row.png')
        w, h = img.size
        img.crop((0, int(h * 0.15), int(w * 0.42), h)).save(OUT + 'v133c-pose-pistols.png')
        print('  [crop] v133c-pose-pistols.png', flush=True)
    except Exception as e:
        print('  [crop] sin PIL:', e, flush=True)

    # tecla = saltar cinemática → juego arranca (verifica que endPoseTest limpia)
    page.keyboard.press('KeyW')
    try:
        page.wait_for_function(
            'document.body.innerText.includes("VITALS") || document.body.innerText.includes("AMBER")',
            timeout=240000)
        check('game starts after pose test', True)
    except Exception:
        check('game starts after pose test', False)
    check('no page errors', len(errors) == 0)
    for e in errors[:4]:
        print('    ERR: ' + e[:150], flush=True)
    ctx.close()
    browser.close()

print('\n===== RUN A RESUMEN =====')
for k in results['ok']:
    print(f'  PASS {k}')
for k in results['fail']:
    print(f'  FAIL {k}')
json.dump(results, open(OUT + 'v133c-pose-results.json', 'w'), indent=1)
sys.exit(1 if results['fail'] else 0)
