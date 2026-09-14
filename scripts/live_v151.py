# Verificación EN VIVO de v15.1 sobre https://googlesitecom.github.io/Googlecom/
# 1) el bundle desplegado es el nuevo (mismo hash que el local)
# 2) registro → MQTT online REAL → crear grupo → shareRoomCode → el
#    canal del grupo entrega pcode (el fix central) → auto-join dispara
import sys, time, hashlib, subprocess
import urllib.request
from playwright.sync_api import sync_playwright

LIVE = 'https://googlesitecom.github.io/Googlecom/'
LOCAL = '/home/z/my-project/out/index.html'

ok, fail = [], []
def check(name, cond):
    (ok if cond else fail).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}', flush=True)

# 1) hash del bundle desplegado == local
def remote_hash():
    for attempt in range(10):
        try:
            with urllib.request.urlopen(LIVE, timeout=20) as r:
                return hashlib.md5(r.read()).hexdigest()
        except Exception as e:
            print(f'  [retry {attempt+1}] {e}', flush=True)
            time.sleep(20)
    return None

local = hashlib.md5(open(LOCAL, 'rb').read()).hexdigest()
rem = remote_hash()
check(f'desplegado = build local ({rem})', rem == local)

# 2) humo en vivo del fix pcode
if rem == local:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--disable-ctx-search', '--no-sandbox',
        ])
        ctx = browser.new_context(viewport={'width': 640, 'height': 360})
        ctx.set_default_timeout(90000)
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: (errs.append(str(e)), print('  [pageerror]', str(e)[:160])))
        page.goto(LIVE + '?netdebug=1', wait_until='domcontentloaded')
        page.wait_for_selector('text=Operator Access', timeout=90000)
        stamp = str(int(time.time()))[-6:]
        page.click('button:has-text("REGISTER")')
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'LIVE_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        page.evaluate("() => window.__esNet.useGame.getState().setSettings({ quality: 'baja' })")
        page.wait_for_function("() => window.__esNet && window.__esNet.useNet.getState().status === 'online'",
                               timeout=45000, polling=500)
        check('vivo: MQTT online', True)
        page.evaluate("() => window.__esNet.esNet.createParty('LIVE SQUAD')")
        page.wait_for_function("() => window.__esNet.useParty.getState().active === true", timeout=10000, polling=500)
        gid = page.evaluate("() => window.__esNet.useParty.getState().gid")
        check(f'vivo: grupo creado ({gid})', bool(gid))
        # deja que el SUBSCRIBE del canal del grupo se asiente (el broker no
        # entrega ecos de mensajes publicados antes de la suscripción)
        page.wait_for_timeout(2500)
        # EL FIX: shareRoomCode publica pcode al canal del grupo y el propio
        # eco lo entrega (antes este handler NO existía y jamás llegaba)
        page.evaluate("() => window.__esNet.esNet.shareRoomCode('LIVET', '2v2')")
        try:
            page.wait_for_function("() => window.__esNet.useParty.getState().roomCode === 'LIVET'",
                                   timeout=12000, polling=500)
            check('vivo: pcode recibido por el canal del grupo (fix central)', True)
        except Exception:
            check('vivo: pcode recibido por el canal del grupo (fix central)', False)
        page.evaluate("() => window.__esNet.esNet.leaveParty()")
        check('vivo: 0 pageerrors', len(errs) == 0)
        browser.close()

print(f'\n=== v15.1 LIVE: {len(ok)} PASS / {len(fail)} FAIL ===')
if fail:
    print('FAILED:', fail)
    sys.exit(1)
