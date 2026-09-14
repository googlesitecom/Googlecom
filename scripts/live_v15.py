import time
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
    ctx = browser.new_context(viewport={'width': 1152, 'height': 648})
    ctx.set_default_timeout(90000)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:160])))
    page.goto(BASE + '?lobbytest=1&partytest=leader', wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=90000)
    check('live auth screen', True)
    stamp = str(int(time.time()))[-6:]
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'LIVE15_' + stamp)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=SELECTED MODE', timeout=90000)
    check('live lobby loaded', True)
    page.wait_for_timeout(3000)

    body = page.locator('body').inner_text().upper()
    check('live: squad flow active (2/3 READY + AUTO DEPLOY hint)', '2/3 READY' in body and 'EVERYONE READY = AUTO DEPLOY' in body)
    check('live: mode card SQUAD 3V3', '3V3' in body)
    page.screenshot(path='/home/z/my-project/scripts/live-v15-lobby.png')

    page.click('button:has-text("READY")')
    try:
        page.wait_for_selector('text=SQUAD READY — DEPLOYING', timeout=8000)
        check('live: countdown overlay on production', True)
        page.wait_for_selector('text=room', timeout=15000)
        page.wait_for_timeout(1200)
        body = page.locator('body').inner_text().upper()
        check('live: match deployed', '3V3' in body or 'TACTICAL' in body or 'OPERATORS' in body)
        page.screenshot(path='/home/z/my-project/scripts/live-v15-deployed.png')
    except Exception as ex:
        print('  [countdown exception]', str(ex)[:200])
        check('live: countdown overlay on production', False)

    check('live: 0 pageerrors', len(errors) == 0)
    browser.close()

print(f'\n=== LIVE v15: {len(ok)} PASS / {len(fail)} FAIL ===')
if fail: print('FAILED:', fail)
