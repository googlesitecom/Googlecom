# v14.2 — pasada visual MÍNIMA (vistas acotadas baratas para swiftshader)
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
        ctx = browser.new_context(viewport={'width': 896, 'height': 504})
        ctx.set_default_timeout(45000)
        page = ctx.new_page()
        page.goto(BASE, wait_until='domcontentloaded')
        page.wait_for_selector('text=Operator Access', timeout=90000)
        stamp = str(int(time.time()))[-6:]
        page.click('button:has-text("REGISTER")')
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'V142T_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        page.wait_for_timeout(1000)
        try:
            page.click('button[title="SETTINGS"]', timeout=10000)
            page.click('button:has-text("LOW")', timeout=10000)
            page.keyboard.press('Escape')
            page.wait_for_selector('text=Game settings', state='detached', timeout=10000)
        except Exception:
            pass
        page.click('button[class*="h-[64px]"]')
        page.wait_for_function('window.__game && window.__game.md ? true : false', timeout=300000)
        # esperar a que la cinemática EMPIECE, entonces saltarla (KeyW)
        try:
            page.wait_for_function('window.__game.cine.active === true', timeout=60000)
            page.wait_for_timeout(600)
        except Exception:
            pass
        page.keyboard.press('KeyW')
        page.wait_for_function('window.__game.cine.active === false', timeout=60000)
        try:
            page.wait_for_selector('text=Click to get back into the fight', timeout=6000)
            page.mouse.click(448, 252)
            page.wait_for_selector('text=Click to get back into the fight', state='detached', timeout=15000)
        except Exception:
            pass
        # confirmar cámara libre (el jugador controla: posiciones nuevas visibles)
        page.wait_for_timeout(1500)

        def snap(label, code, wait=6.0):
            try:
                page.evaluate(f"(() => {{ const g = window.__game; {code}; if (g.vel) g.vel.set(0,0,0); g.dead = false; g.hp = 100 }})()")
                time.sleep(wait)
                page.screenshot(path=SHOT + label + '.png')
                check(f'frame {label}', os.path.exists(SHOT + label + '.png'))
            except Exception as e:
                check(f'frame {label} — {str(e)[:60]}', False)

        # trinchera desde arriba (vista cenital barata: dientes + espina + duckboards)
        snap('11-trench-air', 'g.pos.set(78, 15, 47.5); g.yaw = 0.3; g.pitch = -0.9')
        # interior del súper (mirando al fondo, vista acotada por la pared trasera)
        snap('14-market-inside', 'g.pos.set(78, 1.7, 15.5); g.yaw = Math.PI; g.pitch = 0.04')
        # interior del arsenal (mirando al fondo)
        snap('16-arsenal-inside', 'g.pos.set(-76.5, 1.7, 16.5); g.yaw = Math.PI; g.pitch = 0.04')
    try:
        browser.close()
    except Exception:
        pass
finally:
    server.terminate()

print(f"\n=== RESULT: {len(ok)} OK / {len(fail)} FAIL ===")
if fail:
    print('FAILED:', fail); sys.exit(1)
