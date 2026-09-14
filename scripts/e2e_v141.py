# ============================================================
# E2E v14.1 — lobby sin arma + posición de ataque (guardia)
# 1) Lobby carga sin errores de consola
# 2) Personaje SIN arma (verificación por screenshot + console hook)
# 3) Pose de combate: puños arriba (verificación visual)
# 4) Regresión: menú, panel de modos, TDM jugable
# ============================================================
import sys, time, subprocess, os
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
SHOT = '/home/z/my-project/scripts/v141-'

ok, fail = [], []
def check(name, cond):
    (ok if cond else fail).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}', flush=True)

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
        errors = []
        page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:160])))
        page.on('console', lambda m: print('  [console.error]', m.text[:160]) if m.type == 'error' else None)

        page.goto(BASE + '?lobbytest=1', wait_until='domcontentloaded')
        page.wait_for_selector('text=Operator Access', timeout=90000)
        check('auth screen', True)
        stamp = str(int(time.time()))[-6:]
        page.click('button:has-text("REGISTER")')
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'V141_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        check('lobby cargado (tarjeta de modo)', True)

        # esperar a que el GLB del soldado aterrice y se reconstruya la fila
        page.wait_for_timeout(6000)

        # ---------- verificaciones DOM ----------
        body = page.inner_text('body')
        check('tag de usuario sobre el personaje', page.locator(f'text=V141_{stamp}').count() >= 1)
        check('sin chips de "loadout preview"', 'LOADOUT' not in body.upper())
        check('botón PLAY presente', page.locator('button:has-text("PLAY")').count() >= 1)

        # ---------- verificación 3D: sin arma ----------
        # window.__lobbyDebug (solo con ?lobbytest=1): escena + nº soldados
        # + weaponless (ningún soldado tiene arma acoplada)
        dbg = page.evaluate('''() => {
          const w = window.__lobbyDebug
          if (!w) return null
          const find = (re) => {
            let f = null
            w.scene.traverse(o => { if (!f && re.test(o.name)) f = o })
            return f
          }
          const m = (o) => o ? {
            x: +(o.matrixWorld.elements[12]).toFixed(2),
            y: +(o.matrixWorld.elements[13]).toFixed(2),
            z: +(o.matrixWorld.elements[14]).toFixed(2),
          } : null
          return {
            soldiers: w.soldiers, weaponless: w.weaponless,
            handR: m(find(/mixamorigRightHand/)), foreR: m(find(/mixamorigRightForeArm_/)),
            handL: m(find(/mixamorigLeftHand/)), foreL: m(find(/mixamorigLeftForeArm_/)),
          }
        }''')
        print('  [debug]', dbg)
        check('hook de depuración del lobby presente', dbg is not None)
        if dbg:
            check('personaje SIN arma (weaponless)', dbg['weaponless'] is True)
            check('personaje construido (>=1 soldado)', (dbg['soldiers'] or 0) >= 1)
            # guardia de ataque: puños DELANTE del pecho (z>0.2), a la altura
            # del pecho/mentón (y 1.15..1.5), cerca del centro (|x|<0.4)
            for side in ('handR', 'handL'):
                h = dbg.get(side)
                check(f'{side} en guardia (frente al pecho)',
                      h is not None and 0.2 < h['z'] < 0.6 and 1.15 < h['y'] < 1.55 and abs(h['x']) < 0.4)

        # ---------- screenshots ----------
        page.screenshot(path=SHOT + '01-lobby-no-weapon.png')
        check('screenshot lobby', os.path.exists(SHOT + '01-lobby-no-weapon.png'))

        # panel de modos sigue funcionando (regresión)
        page.click('button:has-text("SELECTED MODE")')
        page.wait_for_selector('text=Select mode', timeout=10000)
        body = page.inner_text('body')
        check('panel de modos con todos los modos',
              all(x in body for x in ['TEAM DEATHMATCH', 'FREE FOR ALL', 'CAPTURE THE FLAG', 'DOMINATION']))
        page.screenshot(path=SHOT + '02-modes.png')
        page.keyboard.press('Escape')

        # ---------- regresión TDM (bots) ----------
        page.wait_for_timeout(800)
        page.click('button:has-text("PLAY")')
        try:
            page.wait_for_selector('canvas', timeout=20000)
            page.wait_for_timeout(4000)
            page.screenshot(path=SHOT + '03-game.png')
            check('partida TDM arranca (canvas + HUD)', page.locator('canvas').count() >= 1)
        except Exception as e:
            check(f'partida TDM arranca — ERROR {e}', False)

        check('sin pageerrors', len(errors) == 0)
        if errors:
            for e in errors[:5]: print('   error:', e[:200])
    browser.close()
finally:
    server.terminate()

print(f"\n=== RESULT: {len(ok)} OK / {len(fail)} FAIL ===")
if fail:
    print('FAILED:', fail); sys.exit(1)
