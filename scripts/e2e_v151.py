# ============================================================
# E2E v15.1 — ONLINE FIXES (REAL network, real MQTT + real PeerJS)
#   A) SQUAD DEPLOY: leader + member over REAL MQTT; all-ready →
#      countdown → leader's room opens → MEMBER RECEIVES THE CODE
#      (pcode fix) → auto-joins → squad complete → match starts →
#      member fully connected (welcome)
#   B) PUBLIC ROOM: guest joins the host's lobby; 2 humans with bot
#      fill auto-start the match (~9s window) — no more 4/4 wait
#   C) QUICK MATCH dead room: guest falls back to HOSTING a fresh
#      room and the solo auto-deploy starts a match with bots
# ============================================================
import sys, time, subprocess
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
SHOT = '/home/z/my-project/scripts/v151-'

import os
ONLY = (sys.argv[1].upper() if len(sys.argv) > 1 else 'ALL')

ok, fail = [], []
def shot(page, path):
    try:
        page.screenshot(path=path, timeout=8000)
    except Exception as e:
        print(f'  [shot-skip] {path.split("/")[-1]}: {type(e).__name__}', flush=True)

def check(name, cond):
    (ok if cond else fail).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}', flush=True)

def register(page, tag):
    page.goto(BASE + '?netdebug=1', wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=90000)
    stamp = str(int(time.time()))[-6:]
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', f'Q{tag}_' + stamp)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=SELECTED MODE', timeout=60000)
    # software WebGL is CPU-bound: low quality keeps two live pages playable
    page.evaluate("() => window.__esNet.useGame.getState().setSettings({ quality: 'baja' })")

def wait_online(page, timeout=30000):
    page.wait_for_function(
        "() => window.__esNet && window.__esNet.useNet.getState().status === 'online'",
        timeout=timeout)

def st(page, expr):
    return page.evaluate(f"() => {{ const n = window.__esNet; return {expr} }}")

server = subprocess.Popen(['bun', 'scripts/serve-static.mjs'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--disable-ctx-search', '--no-sandbox',
        ])

        # ================= A) REAL SQUAD DEPLOY =================
        print('--- A) REAL squad deploy over MQTT + PeerJS (leader + member) ---', flush=True)
        RUN_A = ONLY in ('ALL', 'A')
        if not RUN_A:
            print('  [skipped]', flush=True)
        if RUN_A:
            ctxA = browser.new_context(viewport={'width': 640, 'height': 360})
            ctxA.set_default_timeout(60000)
            pa = ctxA.new_page()
            ea = []
            pa.on('pageerror', lambda e: (ea.append(str(e)), print('  [pageerror-A]', str(e)[:160])))
            register(pa, 'A')
            wait_online(pa)
            check('A online (real MQTT)', True)

            ctxB = browser.new_context(viewport={'width': 640, 'height': 360})
            ctxB.set_default_timeout(60000)
            pb = ctxB.new_page()
            eb = []
            pb.on('pageerror', lambda e: (eb.append(str(e)), print('  [pageerror-B]', str(e)[:160])))
            register(pb, 'B')
            wait_online(pb)
            check('B online (real MQTT)', True)

            # leader creates the squad; member joins over the network
            pa.evaluate("() => window.__esNet.esNet.createParty('E2E SQUAD')")
            pa.wait_for_function("() => window.__esNet.useParty.getState().active === true", timeout=10000, polling=500)
            gid = st(pa, "window.__esNet.useParty.getState().gid")
            print(f'  party gid = {gid}', flush=True)
            pb.evaluate(f"() => window.__esNet.esNet.joinParty('{gid}')")
            # heartbeats flow over real MQTT → both see 2 members
            pa.wait_for_function("() => window.__esNet.useParty.getState().members.length === 2", timeout=20000, polling=500)
            pb.wait_for_function("() => window.__esNet.useParty.getState().members.length === 2", timeout=20000, polling=500)
            check('leader sees 2 members (real heartbeats)', True)
            check('member sees 2 members (real heartbeats)', True)
            pa.wait_for_timeout(500)
            shot(pa, SHOT + '01-leader-squad.png')

            # the leader picks a mode (UI, like a real player) → synced live to
            # the member over MQTT
            la = st(pa, "window.__esNet.useParty.getState().leaderOid")
            check('leadership NOT stolen (leaderOid set, A keeps command)', bool(la))
            pa.click('button:has-text("SELECTED MODE")')
            pa.wait_for_selector('text=Select mode', timeout=20000)
            pa.click('button:has-text("CAPTURE THE FLAG")')
            pa.wait_for_timeout(400)
            pa.keyboard.press('Escape')
            pb.wait_for_function(
                "() => { const m = window.__esNet.useParty.getState().partyMode; return m && m.mode === 'bandera' && m.kind === '2v2' }",
                timeout=15000)
            check('member got the leader\'s mode pick (bandera/2v2) over MQTT', True)

            # member readies up → leader sees it over MQTT
            pb.evaluate("() => window.__esNet.esNet.setPartyReady(true)")
            pa.wait_for_function(
                "() => { const s = window.__esNet.useParty.getState(); return s.members.filter(m => s.ready[m.u]).length === 1 }",
                timeout=10000)
            check('leader sees the member READY over MQTT', True)

            # leader hits the big READY button → all ready → 5s countdown
            pa.click('button:has-text("READY")')
            pa.wait_for_function("() => window.__esNet.useParty.getState().launchAt > 0", timeout=8000, polling=500)
            pb.wait_for_function("() => window.__esNet.useParty.getState().launchAt > 0", timeout=8000, polling=500)
            check('auto-deploy countdown started on BOTH (launch broadcast)', True)
            shot(pa, SHOT + '02-countdown.png')

            # countdown ends → leader hosts the room → MEMBER AUTO-JOINS via pcode
            # (this is the exact path that was broken: the member used to hang
            # on the countdown forever because the room code never arrived)
            pa.wait_for_function("() => window.__esNet.useGame.getState().phase === 'connecting'", timeout=45000, polling=500)
            check('leader deployed (host room)', True)
            # NOTE: in headless (software WebGL) game init takes ~12-20s per page
            # — in production with a real GPU this is 1-3s
            pa.wait_for_function("() => window.__esNet.useGame.getState().roomCode !== ''", timeout=60000, polling=500)
            code = st(pa, "window.__esNet.useGame.getState().roomCode")
            print(f'  host room code = {code}', flush=True)
            pb.wait_for_function("() => window.__esNet.useGame.getState().phase === 'connecting'", timeout=90000, polling=500)
            check('MEMBER AUTO-DEPLOYED via room code (pcode fix)', True)
            bcode = st(pb, "window.__esNet.useGame.getState().roomCode")
            check(f'member joined the right room ({bcode} == {code})', bcode == code)
            pb.wait_for_timeout(800)
            shot(pb, SHOT + '03-member-in-lobby.png')

            # member lands inside the host's lobby (lobbyAck), then the squad
            # completes → auto-start → welcome → fully connected
            pb.wait_for_function("() => window.__esNet.useGame.getState().netStatus === 'waiting'", timeout=150000, polling=500)
            check('member INSIDE the host lobby (lobbyAck over PeerJS)', True)
            pa.wait_for_function("() => window.__esNet.useGame.getState().netStatus === 'connected'", timeout=60000, polling=500)
            pb.wait_for_function("() => window.__esNet.useGame.getState().netStatus === 'connected'", timeout=150000, polling=500)
            check('leader connected (match started)', True)
            check('MEMBER CONNECTED (welcome received) — the squad plays together', True)
            pa.wait_for_timeout(600)
            shot(pa, SHOT + '04-leader-match.png')
            shot(pb, SHOT + '05-member-match.png')

            check('0 pageerrors (leader)', len(ea) == 0)
            check('0 pageerrors (member)', len(eb) == 0)
            ctxA.close(); ctxB.close()
        if ONLY == 'A':
            browser.close(); server.terminate()
            print(f'\n=== v15.1 E2E [A]: {len(ok)} PASS / {len(fail)} FAIL ===')
            sys.exit(1 if fail else 0)

        # ================= B) PUBLIC ROOM AUTO-START =================
        print('--- B) Public room: guest joins, 2 humans auto-start the match ---', flush=True)
        ctxC = browser.new_context(viewport={'width': 640, 'height': 360})
        ctxC.set_default_timeout(60000)
        pc = ctxC.new_page()
        ec = []
        pc.on('pageerror', lambda e: (ec.append(str(e)), print('  [pageerror-C]', str(e)[:160])))
        register(pc, 'C')
        wait_online(pc)

        ctxD = browser.new_context(viewport={'width': 640, 'height': 360})
        ctxD.set_default_timeout(60000)
        pd = ctxD.new_page()
        ed = []
        pd.on('pageerror', lambda e: (ed.append(str(e)), print('  [pageerror-D]', str(e)[:160])))
        register(pd, 'D')
        wait_online(pd)

        # C hosts a public 2v2 room (bot fill on)
        pc.evaluate("""() => { const g = window.__esNet.useGame.getState()
            g.setHud({ mode: 'host', roomCode: '', gameMode: 'escaramuza', roomKind: '2v2',
                       fillEmptyWithBots: true, quickPlay: false, lobby: null,
                       netStatus: 'connecting', netError: '' })
            g.setPhase('connecting') }""")
        pc.wait_for_function("() => window.__esNet.useGame.getState().roomCode !== ''", timeout=60000, polling=500)
        pcode = st(pc, "window.__esNet.useGame.getState().roomCode")
        print(f'  public room code = {pcode}', flush=True)
        check('host opened a public 2v2 room', True)

        # D joins by code → real PeerJS connection → both in the lobby
        pd.evaluate(f"""() => {{ const g = window.__esNet.useGame.getState()
            g.setHud({{ mode: 'guest', roomCode: '{pcode}', gameMode: 'escaramuza', roomKind: '2v2',
                       fillEmptyWithBots: true, quickPlay: false, lobby: null,
                       netStatus: 'connecting', netError: '' }})
            g.setPhase('connecting') }}""")
        pd.wait_for_function("() => window.__esNet.useGame.getState().netStatus === 'waiting'", timeout=150000, polling=500)
        check('guest CONNECTED to the host lobby (non-host connects)', True)
        pd.wait_for_function(
            "() => window.__esNet.useGame.getState().lobby && window.__esNet.useGame.getState().lobby.players.length === 2",
            timeout=10000)
        check('lobby shows 2 operators (host + guest)', True)
        pc.wait_for_function(
            "() => window.__esNet.useGame.getState().announcements.some(a => a.text.includes('PUBLIC ROOM'))",
            timeout=10000)
        check('host announced the ~9s public auto-start', True)
        pd.wait_for_timeout(500)
        shot(pd, SHOT + '06-public-lobby.png')

        # the match auto-starts with 2 humans + bots — nobody waits for 4/4
        pc.wait_for_function("() => window.__esNet.useGame.getState().netStatus === 'connected'", timeout=150000, polling=500)
        pd.wait_for_function("() => window.__esNet.useGame.getState().netStatus === 'connected'", timeout=150000, polling=500)
        check('PUBLIC match auto-started (host connected)', True)
        check('guest received WELCOME — public play connects', True)
        pd.wait_for_timeout(600)
        shot(pc, SHOT + '07-public-match.png')

        check('0 pageerrors (host)', len(ec) == 0)
        check('0 pageerrors (guest)', len(ed) == 0)
        ctxC.close(); ctxD.close()
        if ONLY == 'B':
            browser.close(); server.terminate()
            print(f'\n=== v15.1 E2E [B]: {len(ok)} PASS / {len(fail)} FAIL ===')
            sys.exit(1 if fail else 0)

        # ================= C) QUICK MATCH — dead room fallback =================
        print('--- C) Quick match dead room → host fallback → solo auto-deploy ---', flush=True)
        ctxE = browser.new_context(viewport={'width': 640, 'height': 360})
        ctxE.set_default_timeout(60000)
        pe = ctxE.new_page()
        ee = []
        pe.on('pageerror', lambda e: (ee.append(str(e)), print('  [pageerror-E]', str(e)[:160])))
        register(pe, 'E')
        wait_online(pe)

        # quick match picks a room that is already GONE (stale announcement)
        pe.evaluate("""() => { const g = window.__esNet.useGame.getState()
            g.setHud({ mode: 'guest', roomCode: 'ZZZZZ', gameMode: 'escaramuza', roomKind: '2v2',
                       fillEmptyWithBots: true, quickPlay: true, lobby: null,
                       netStatus: 'connecting', netError: '' })
            g.setPhase('connecting') }""")
        pe.wait_for_function("() => window.__esNet.useGame.getState().mode === 'host'", timeout=90000, polling=500)
        check('dead room → fell back to HOSTING (no error screen)', True)
        pe.wait_for_function(
            "() => window.__esNet.useGame.getState().announcements.some(a => a.text.includes('hosting a fresh room'))",
            timeout=15000)
        check('fallback announcement shown', True)
        # nobody joins → the 15s solo auto-deploy starts a match with bots
        pe.wait_for_function("() => window.__esNet.useGame.getState().netStatus === 'connected'", timeout=90000, polling=500)
        check('solo auto-deploy fired — quick play ALWAYS ends in a match', True)
        pe.wait_for_timeout(500)
        shot(pe, SHOT + '08-quick-fallback.png')
        check('0 pageerrors (quick)', len(ee) == 0)
        ctxE.close()

        browser.close()
finally:
    server.terminate()

print(f'\n=== v15.1 E2E: {len(ok)} PASS / {len(fail)} FAIL ===')
if fail:
    print('FAILED:', fail)
    sys.exit(1)
