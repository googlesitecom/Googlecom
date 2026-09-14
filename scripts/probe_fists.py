# ============================================================
# Probe de cerrado de dedos (puños) — v14.1
# 4 variantes de fingerCurl + screenshots para verificación VLM
# ============================================================
import time, subprocess
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
VARIANTS = [
    ('fz+',   'fcax=z&fca=0.7&fcm=1'),
    ('fz-',   'fcax=z&fca=-0.7&fcm=1'),
    ('fx+',   'fcax=x&fca=0.7&fcm=1'),
    ('none',  'fcax=z&fca=0&fcm=1'),
]

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
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'FIST_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        page.wait_for_timeout(5000)

        for name, params in VARIANTS:
            page.goto(BASE + '?lobbytest=1&' + params, wait_until='domcontentloaded')
            page.wait_for_selector('text=SELECTED MODE', timeout=60000)
            page.wait_for_timeout(3000)
            page.screenshot(path=f'/home/z/my-project/scripts/fcurl-{name}.png')
            print('shot', name, flush=True)
        browser.close()
finally:
    server.terminate()
print('done')
