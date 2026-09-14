# v14.2 — shot final de trinchera (close-up interior, espera larga)
import sys, time, subprocess, os
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:4173/Googlecom/'
SHOT = '/home/z/my-project/scripts/v142-'
ok = []
server = subprocess.Popen(['bun', 'scripts/serve-static.mjs'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-ctx-search', '--no-sandbox'])
        ctx = browser.new_context(viewport={'width': 896, 'height': 504})
        ctx.set_default_timeout(90000)
        page = ctx.new_page()
        page.goto(BASE, wait_until='domcontentloaded')
        page.wait_for_selector('text=Operator Access', timeout=90000)
        stamp = str(int(time.time()))[-6:]
        page.click('button:has-text("REGISTER")')
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'V142U_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        page.wait_for_timeout(1000)
        try:
            page.click('button[title="SETTINGS"]', timeout=10000)
            page.click('button:has-text("LOW")', timeout=10000)
            page.keyboard.press('Escape')
        except Exception:
            pass
        page.click('button[class*="h-[64px]"]')
        page.wait_for_function('window.__game && window.__game.md ? true : false', timeout=300000)
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
        page.wait_for_timeout(1500)
        # close-up DENTRO del diente: parapetos de sacos a ambos lados, duckboard abajo
        page.evaluate('(() => { const g = window.__game; g.pos.set(79.5, 1.2, 45); g.yaw = 0; g.pitch = 0.06; g.dead = false; g.hp = 100; if (g.vel) g.vel.set(0,0,0) })()')
        time.sleep(20)
        page.screenshot(path=SHOT + '19-trench-close.png')
        ok.append(os.path.exists(SHOT + '19-trench-close.png'))
        print('trench close-up:', ok[-1], flush=True)
    try:
        browser.close()
    except Exception:
        pass
finally:
    server.terminate()
print('DONE', all(ok))
