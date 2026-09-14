import time, sys
from playwright.sync_api import sync_playwright
BASE = 'https://googlesitecom.github.io/Googlecom/'
ok = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 1152, 'height': 648})
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(BASE + '?lobbytest=1&nocache=' + str(int(time.time())), wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=90000)
    stamp = str(int(time.time()))[-6:]
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'LIVE142_' + stamp)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=SELECTED MODE', timeout=60000)
    page.wait_for_timeout(6000)
    dbg = page.evaluate('''() => {
      const w = window.__lobbyDebug
      if (!w) return null
      const find = (re) => { let f = null; w.scene.traverse(o => { if (!f && re.test(o.name)) f = o }); return f }
      const m = (o) => o ? { x: +(o.matrixWorld.elements[12]).toFixed(2), y: +(o.matrixWorld.elements[13]).toFixed(2) } : null
      return { weaponless: w.weaponless, handR: m(find(/mixamorigRightHand/)), handL: m(find(/mixamorigLeftHand/)) }
    }''')
    print('[live debug]', dbg)
    ok.append(dbg and dbg['weaponless'] is True)
    if dbg and dbg['handR']:
        ok.append(0.55 < dbg['handR']['y'] < 1.15 and abs(dbg['handR']['x']) < 0.45)
        ok.append(0.55 < dbg['handL']['y'] < 1.15 and abs(dbg['handL']['x']) < 0.45)
    page.screenshot(path='scripts/v142-live-lobby.png')
    ok.append(len(errs) == 0)
    if errs: print('pageerrors:', errs[:3])
    try:
        browser.close()
    except Exception:
        pass
print('LIVE v14.2:', 'OK' if all(ok) else 'FAIL', f'({sum(bool(x) for x in ok)}/{len(ok)})')
sys.exit(0 if all(ok) else 1)
