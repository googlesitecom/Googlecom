# Diagnóstico: ¿por qué B no recibe el pcode? Volcado de ambos lados.
import sys, time, subprocess, os
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'

def register(page, tag):
    page.goto(BASE + '?netdebug=1', wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=90000)
    stamp = str(int(time.time()))[-6:]
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', f'D{tag}_' + stamp)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=SELECTED MODE', timeout=60000)
    page.evaluate("() => window.__esNet.useGame.getState().setSettings({ quality: 'baja' })")
    page.wait_for_function("() => window.__esNet.useNet.getState().status === 'online'", timeout=30000, polling=500)

server = subprocess.Popen(['bun', 'scripts/serve-static.mjs'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--disable-ctx-search', '--no-sandbox',
        ])
        ctxA = browser.new_context(viewport={'width': 640, 'height': 360})
        ctxA.set_default_timeout(60000)
        pa = ctxA.new_page()
        pa.on('pageerror', lambda e: print('  [pageerror-A]', str(e)[:200]))
        register(pa, 'A')
        ctxB = browser.new_context(viewport={'width': 640, 'height': 360})
        ctxB.set_default_timeout(60000)
        pb = ctxB.new_page()
        pb.on('pageerror', lambda e: print('  [pageerror-B]', str(e)[:200]))
        register(pb, 'B')

        pa.evaluate("() => window.__esNet.esNet.createParty('DIAG')")
        pa.wait_for_function("() => window.__esNet.useParty.getState().active === true", timeout=10000, polling=500)
        gid = pa.evaluate("() => window.__esNet.useParty.getState().gid")
        pb.evaluate(f"() => window.__esNet.esNet.joinParty('{gid}')")
        pa.wait_for_function("() => window.__esNet.useParty.getState().members.length === 2", timeout=20000, polling=500)
        pb.evaluate("() => window.__esNet.esNet.setPartyReady(true)")
        pa.wait_for_function("() => window.__esNet.useParty.getState().members.filter(m => window.__esNet.useParty.getState().ready[m.u]).length === 1", timeout=10000, polling=500)
        pa.click('button:has-text("READY")')
        pa.wait_for_function("() => window.__esNet.useParty.getState().launchAt > 0", timeout=8000, polling=500)
        print('  countdown started', flush=True)

        t0 = time.time()
        for i in range(14):
            pa.wait_for_timeout(5000)
            A = pa.evaluate("""() => { const g = window.__esNet.useGame.getState(); const p = window.__esNet.useParty.getState()
                const n = window.__net
                const en = window.__esNet.esNet
                return { ph: g.phase, mode: g.mode, code: g.roomCode, net: g.netStatus,
                         peer: n ? (n.peer ? (n.peer.open ? 'OPEN' : 'pending') : 'null') : 'no-client',
                         sq: n ? n.squadExpected : '-', mem: p.members.length,
                         pub: en.pcodePubCount, gid: en.partyGid || '-no-gid-' } }""")
            B = pb.evaluate("""() => { const g = window.__esNet.useGame.getState(); const p = window.__esNet.useParty.getState()
                const en = window.__esNet.esNet
                const pcs = en.partyRxLog.filter(x => x.ty === 'pcode').slice(-2)
                return { ph: g.phase, mode: g.mode, rc: p.roomCode, net: g.netStatus, launchAt: p.launchAt,
                         rx: en.pcodeRxCount, active: p.active, ldr: p.leaderOid,
                         pcs: pcs.map(x => ({ u: x.u, mine: x.mine, code: x.code })) } }""")
            print(f'  +{time.time()-t0:5.1f}s A={A}', flush=True)
            print(f'         B={B}', flush=True)
            if A['net'] == 'connected' and B['net'] == 'connected':
                print('  FULL SUCCESS', flush=True)
                break
        browser.close()
finally:
    server.terminate()
