# ============================================================
# E2E v13.3 — verificación de las 4 novedades:
#  A. ?posetest=1 — log de coordenadas de manos + fila de poses
#  B. despliegue normal (?debugcine=1) — cinemática de LANZAMIENTO
#     AÉREO (avión → paracaídas → aterrizaje) + arranque del juego
#  C. movimiento — arena más oscura y asfalto sin batido
# ============================================================
import re, sys, time, json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
OUT = '/home/z/my-project/Googlecom/scripts/e2e-root/'

def shot(page, name):
    page.screenshot(path=OUT + name, timeout=90000)
    print(f'  [shot] {name}')

results = {'ok': [], 'fail': []}

def check(name, cond):
    (results['ok'] if cond else results['fail']).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}')

def body_text(page, tries=3):
    for i in range(tries):
        try:
            return page.inner_text('body', timeout=25000)
        except Exception:
            page.wait_for_timeout(4000)
    return ''

def register(page, tag):
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=60000)
    stamp = str(int(time.time()))[-6:]
    user = f'{tag}_{stamp}'
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', user)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=Deploy', timeout=30000)
    return user

def deploy(page):
    page.click('button:has-text("Start deployment")')

def wait_hud(page, timeout=240000):
    try:
        page.wait_for_function(
            'document.body.innerText.includes("VITALS") || document.body.innerText.includes("AMBER")',
            timeout=timeout)
        return True
    except Exception:
        return False

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-ctx-search', '--no-sandbox',
    ])

    # ==========================================================
    # RUN A — banco de pruebas de poses (?posetest=1)
    # ==========================================================
    print('== RUN A: pose test ==')
    ctxA = browser.new_context(viewport={'width': 960, 'height': 540})
    page = ctxA.new_page()
    pose_logs, cine_logs, errors = [], [], []
    page.on('console', lambda m: (
        pose_logs.append(m.text) if m.text.startswith('[pose]') else
        cine_logs.append(m.text) if m.text.startswith('[cine]') else None))
    page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:200])))

    register(page, 'Pose133')
    page.goto(BASE + '?posetest=1', wait_until='domcontentloaded')
    page.wait_for_selector('text=Deploy', timeout=60000)
    deploy(page)
    # esperar a que la fila se construya (tras el parseo del GLB del soldado)
    try:
        page.wait_for_function('document.body.innerText.includes("POSE TEST")', timeout=120000)
    except Exception:
        pass
    page.wait_for_timeout(30000)   # swiftshader: init síncrono lento
    # rota capturas hasta ver soldados
    for i in range(6):
        if len(pose_logs) >= 7:
            break
        page.wait_for_timeout(8000)
    shot(page, 'v133c-pose-row.png')
    check('pose row built (7 [pose] logs)', len(pose_logs) >= 7)
    for line in pose_logs[:8]:
        print('    ' + line)

    # arrancar HUD (tecla = saltar cinemática) y parar
    page.keyboard.press('KeyW')
    hud = wait_hud(page)
    check('game starts after pose test', hud)
    page.wait_for_timeout(2000)
    ctxA.close()

    # ==========================================================
    # RUN B — despliegue normal: lanzamiento aéreo (?debugcine=1)
    # ==========================================================
    print('== RUN B: airdrop cinematic ==')
    ctxB = browser.new_context(viewport={'width': 960, 'height': 540})
    page = ctxB.new_page()
    cine_logs.clear(); errors.clear()
    page.on('console', lambda m: cine_logs.append(m.text) if m.text.startswith('[cine]') else None)
    page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:200])))

    register(page, 'Drop133')
    page.goto(BASE + '?debugcine=1', wait_until='domcontentloaded')
    page.wait_for_selector('text=Deploy', timeout=60000)
    deploy(page)

    def wait_log(pattern, timeout):
        t0 = time.time()
        seen = []
        while time.time() - t0 < timeout:
            seen = [l for l in cine_logs if pattern in l]
            if seen:
                return seen
            page.wait_for_timeout(500)
        return []

    # cinemática arrancada → plano del avión (~fase A)
    start_logs = wait_log('drop start', 180000)
    check('airdrop cinematic started', bool(start_logs))
    page.wait_for_timeout(2500)      # avión ya en vuelo (fase A persecución)
    shot(page, 'v133c-cine-plane.png')
    # salto + caída (fase B)
    jump_logs = wait_log('jump t=', 60000)
    check('troopers jumped (9 logs)', len(jump_logs) >= 8)
    page.wait_for_timeout(2500)
    shot(page, 'v133c-cine-freefall.png')
    # paracaídas abierto
    chute_logs = wait_log('chute t=', 90000)
    check('chutes opened', bool(chute_logs))
    page.wait_for_timeout(2000)
    shot(page, 'v133c-cine-canopy.png')
    # aterrizaje del héroe → agarre de pistola
    land_logs = wait_log('landed t=', 120000)
    hero_land = [l for l in land_logs if 'hero=True' in l]
    check('hero landed', bool(hero_land))
    page.wait_for_timeout(1800)      # pose de combate restaurada
    shot(page, 'v133c-cine-landed.png')
    # fin de cinemática → juego
    hud = wait_hud(page)
    check('game starts after airdrop', hud)
    page.wait_for_timeout(3000)
    shot(page, 'v133c-game-start.png')

    # ==========================================================
    # RUN C — movimiento: arena (−10 %) y asfalto sin batido
    # ==========================================================
    print('== RUN C: ground check ==')
    page.keyboard.press('KeyW')
    page.wait_for_timeout(3000)
    page.keyboard.up('KeyW')
    shot(page, 'v133c-move1.png')
    page.wait_for_timeout(600)
    shot(page, 'v133c-move2.png')
    # avance hacia el centro (carretera)
    page.keyboard.down('KeyW')
    page.wait_for_timeout(4000)
    page.keyboard.up('KeyW')
    shot(page, 'v133c-road.png')
    check('no page errors', len(errors) == 0)
    if errors:
        for e in errors[:5]:
            print('    ERR: ' + e[:150])
    ctxB.close()
    browser.close()

print('\n===== RESUMEN =====')
for k in results['ok']:
    print(f'  PASS {k}')
for k in results['fail']:
    print(f'  FAIL {k}')
json.dump(results, open(OUT + 'v133c-results.json', 'w'), indent=1)
sys.exit(1 if results['fail'] else 0)
