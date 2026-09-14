# Sonda: ¿se crea la sala host en headless? (setHud host → phase connecting)
import sys, time, subprocess
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'

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
        errs = []
        page.on('pageerror', lambda e: (errs.append(str(e)), print('  [pageerror]', str(e)[:300])))
        page.on('console', lambda m: print('  [console]', m.type, m.text[:200]) if m.type in ('error', 'warning') else None)

        page.goto(BASE + '?netdebug=1', wait_until='domcontentloaded')
        page.wait_for_selector('text=Operator Access', timeout=90000)
        stamp = str(int(time.time()))[-6:]
        page.click('button:has-text("REGISTER")')
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'PROBE_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        print('  menu reached', flush=True)

        t0 = time.time()
        page.evaluate("""() => { const g = window.__esNet.useGame.getState()
            g.setHud({ mode: 'host', roomCode: '', gameMode: 'escaramuza', roomKind: '2v2',
                       fillEmptyWithBots: true, quickPlay: false, lobby: null,
                       netStatus: 'connecting', netError: '', playerName: 'ProbeOp' })
            g.setPhase('connecting') }""")
        for i in range(20):
            page.wait_for_timeout(2000)
            info = page.evaluate("""() => { const g = window.__esNet.useGame.getState()
                return { phase: g.phase, mode: g.mode, code: g.roomCode, net: g.netStatus,
                         ann: g.announcements.slice(-3).map(a => a.text) } }""")
            print(f'  +{time.time()-t0:5.1f}s  {info}', flush=True)
            if info['code']:
                print('  ROOM CREATED OK', flush=True)
                break
        page.screenshot(path='/home/z/my-project/scripts/v151-probe.png')
        print('  pageerrors:', len(errs))
        browser.close()
finally:
    server.terminate()
