# ============================================================
# v14.2 — pasada VISUAL dedicada (frames frescos con esperas largas)
# trincheras por dentro, red completa, súper, arsenal, drop
# ============================================================
import sys, time, subprocess, os
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
SHOT = '/home/z/my-project/scripts/v142-'

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
        ctx = browser.new_context(viewport={'width': 1152, 'height': 648})
        ctx.set_default_timeout(60000)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + '?cratetest=1', wait_until='domcontentloaded')
        page.wait_for_selector('text=Operator Access', timeout=90000)
        stamp = str(int(time.time()))[-6:]
        page.click('button:has-text("REGISTER")')
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'V142S_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        page.wait_for_timeout(1200)
        try:
            page.click('button[title="SETTINGS"]', timeout=10000)
            page.click('button:has-text("LOW")', timeout=10000)
            page.keyboard.press('Escape')
            page.wait_for_selector('text=Game settings', state='detached', timeout=10000)
        except Exception:
            pass
        page.click('button[class*="h-[64px]"]')
        page.wait_for_function('window.__game && window.__game.md ? true : false', timeout=300000)
        # cinemática: esperar al avión 4 s para el frame del chase
        try:
            page.wait_for_function('window.__game.cine.active === true', timeout=60000)
            page.wait_for_timeout(4200)
            page.screenshot(path=SHOT + '10-plane-chase.png')
        except Exception:
            pass
        page.keyboard.press('KeyW')
        page.wait_for_function('window.__game.cine.active === false', timeout=60000)
        try:
            page.wait_for_selector('text=Click to get back into the fight', timeout=6000)
            page.mouse.click(576, 324)
            page.wait_for_selector('text=Click to get back into the fight', state='detached', timeout=15000)
        except Exception:
            pass

        def snap(label, code, wait=4.5):
            try:
                page.evaluate(f"(() => {{ const g = window.__game; {code}; if (g.vel) g.vel.set(0,0,0); g.dead = false; g.hp = 100 }})()")
                time.sleep(wait)
                page.screenshot(path=SHOT + label + '.png')
                check(f'frame {label}', os.path.exists(SHOT + label + '.png'))
            except Exception as e:
                check(f'frame {label} — {e}', False)

        # trinchera: DENTRO del diente mirando a lo largo (parapetos a ambos lados)
        snap('11-trench-inside', 'g.pos.set(79, 1.15, 45); g.yaw = -Math.PI / 2; g.pitch = 0.04')
        # trinchera: vista elevada de la red (desde la puerta del muro, mirando este)
        snap('12-trench-net', 'g.pos.set(64, 7.5, 52); g.yaw = -Math.PI / 2; g.pitch = -0.34')
        # súper: fachada + interior
        snap('13-market-front', 'g.pos.set(78, 1.7, 7.5); g.yaw = 0; g.pitch = 0.05')
        snap('14-market-inside', 'g.pos.set(78, 1.7, 15.5); g.yaw = 0; g.pitch = 0.05')
        # arsenal: portal + interior
        snap('15-arsenal-front', 'g.pos.set(-76.5, 1.7, 7.5); g.yaw = 0; g.pitch = 0.05')
        snap('16-arsenal-inside', 'g.pos.set(-76.5, 1.7, 16.5); g.yaw = 0; g.pitch = 0.05')
        # hangar NE ampliado (interior con racks y carretilla)
        snap('17-hangar-inside', 'g.pos.set(78, 1.7, -73.5); g.yaw = Math.PI; g.pitch = 0.04')

        # drop cayendo (con avión + paracaídas)
        try:
            page.wait_for_function('''(() => {
              for (const c of window.__game.crateViews.values()) if (!c.landed && c.plane) return true
              return false
            })()''', timeout=240000)
            page.evaluate('''(() => {
              const g = window.__game
              for (const c of g.crateViews.values()) {
                if (c.landed || !c.plane) continue
                g.pos.set(c.x + 20, 14, c.z + 20)
                g.yaw = Math.PI * 1.25; g.pitch = 0.5
                g.dead = false; g.hp = 100
                if (g.vel) g.vel.set(0, 0, 0)
                return
              }
            })()''')
            time.sleep(2.2)
            page.screenshot(path=SHOT + '18-drop-fall.png')
            check('frame drop-fall', os.path.exists(SHOT + '18-drop-fall.png'))
        except Exception as e:
            check(f'frame drop-fall — {e}', False)

        check('sin pageerrors', len(errors) == 0)
    try:
        browser.close()
    except Exception:
        pass
finally:
    server.terminate()

print(f"\n=== RESULT: {len(ok)} OK / {len(fail)} FAIL ===")
if fail:
    print('FAILED:', fail); sys.exit(1)
