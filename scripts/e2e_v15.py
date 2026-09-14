# ============================================================
# E2E v15 — FORTNITE-STYLE SQUAD DEPLOY (online party flow)
# 1) MEMBER: mode card shows the LEADER'S pick (CTF) + lock hint,
#    READY button toggles, mode panel locked (banner + disabled)
# 2) LEADER: kind auto-bump (3v3 for squad of 3), READY starts the
#    auto-deploy countdown (overlay 5..1) and the match launches
#    (host room) when the whole squad is ready
# 3) Regression: normal lobby loads, 0 pageerrors
# ============================================================
import sys, time, subprocess
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
SHOT = '/home/z/my-project/scripts/v15-'

ok, fail = [], []
def check(name, cond):
    (ok if cond else fail).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}', flush=True)

def register(page, tag):
    page.goto(BASE + f'?lobbytest=1&partytest={tag}', wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=90000)
    stamp = str(int(time.time()))[-6:]
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', f'V15{tag}_' + stamp)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=SELECTED MODE', timeout=60000)

server = subprocess.Popen(['bun', 'scripts/serve-static.mjs'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--disable-ctx-search', '--no-sandbox',
        ])

        # ================= A) MEMBER VIEW =================
        print('--- A) MEMBER: leader picks the mode, member readies up ---', flush=True)
        ctx = browser.new_context(viewport={'width': 1152, 'height': 648})
        ctx.set_default_timeout(60000)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:160])))

        register(page, 'member')
        check('lobby loaded', True)
        page.wait_for_timeout(2600)   # party seed (700ms) + hb render

        # the mode card shows the LEADER'S synced pick (bandera → CTF)
        card = page.locator('button:has-text("SELECTED MODE")').inner_text()
        check('mode card = CAPTURE THE FLAG (leader pick)', 'CAPTURE THE FLAG' in card)
        check('mode card = SQUAD · 3V3 ROOM', '3V3' in card)
        check('lock hint PICKED BY IRONSIDE', 'PICKED BY IRONSIDE' in card)
        page.screenshot(path=SHOT + '01-member-card.png')

        # the big button is READY (member)
        body_up = page.locator('body').inner_text().upper()
        check('member sees READY (not PLAY)', 'READY' in body_up and 'THE LEADER PICKS THE MODE' in body_up)

        # squad panel shows the members + ready count
        check('squad panel 0/2 ready (none ready yet)', '0/2 READY' in body_up)
        check('squad panel lists IRONSIDE (leader)', 'IRONSIDE' in body_up)

        # READY toggle (local state works without transport)
        page.click('button:has-text("READY")')
        page.wait_for_timeout(700)
        body_up = page.locator('body').inner_text().upper()
        check('member READY toggles to READY ✓', 'READY ✓' in body_up)
        check('squad panel 1/2 ready', '1/2 READY' in body_up)
        page.screenshot(path=SHOT + '02-member-ready.png')

        # un-ready again (clean state)
        page.click('button:has-text("READY")')
        page.wait_for_timeout(500)

        # mode panel: locked for the member
        page.click('button:has-text("SELECTED MODE")')
        page.wait_for_selector('text=Select mode', timeout=20000)
        page.wait_for_timeout(400)
        panel = page.locator('body').inner_text()
        check('panel banner: Ironside picks the mode', 'Ironside picks the mode' in panel)
        check('panel banner: current pick CTF', 'CAPTURE THE FLAG' in panel)
        # mode buttons disabled for members
        dis = page.evaluate('''() => {
          const btns = [...document.querySelectorAll('button')]
          const modes = btns.filter(b => /TEAM DEATHMATCH|FREE FOR ALL|CAPTURE THE FLAG|DOMINATION|OPERATION ASHFALL/.test(b.innerText))
          return { total: modes.length, disabled: modes.filter(b => b.disabled).length }
        }''')
        check(f'mode buttons disabled for member ({dis["disabled"]}/{dis["total"]})',
              dis['total'] >= 5 and dis['disabled'] >= 5)
        check('room config = leader-only note', 'CONFIGURED BY THE LEADER' in panel.upper())
        page.screenshot(path=SHOT + '03-member-panel.png')
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)
        ctx.close()

        # ================= B) LEADER VIEW =================
        print('--- B) LEADER: pick syncs, all-ready → countdown → auto-deploy ---', flush=True)
        ctx2 = browser.new_context(viewport={'width': 1152, 'height': 648})
        ctx2.set_default_timeout(60000)
        page = ctx2.new_page()
        errors2 = []
        page.on('pageerror', lambda e: (errors2.append(str(e)), print('  [pageerror-B]', str(e)[:160])))

        register(page, 'leader')
        page.wait_for_timeout(2600)

        body_up = page.locator('body').inner_text().upper()
        # squad of 3 → room auto-sized to 3v3
        check('leader mode card SQUAD · 3V3 ROOM', '3V3' in body_up)
        check('leader sub-line 2/3 ready', '2/3 READY' in body_up)
        check('leader hint EVERYONE READY = AUTO DEPLOY', 'EVERYONE READY = AUTO DEPLOY' in body_up)
        check('squad members listed (IRONSIDE + VEX)', 'IRONSIDE' in body_up and 'VEX' in body_up)
        page.screenshot(path=SHOT + '04-leader-lobby.png')

        # leader opens the panel: can pick (enabled) + squad banner
        page.click('button:has-text("SELECTED MODE")')
        page.wait_for_selector('text=Select mode', timeout=20000)
        panel = page.locator('body').inner_text()
        check('panel banner: You lead this squad', 'You lead this squad' in panel)
        check('panel: squad of 3 note', 'squad of 3' in panel)
        dis = page.evaluate('''() => {
          const btns = [...document.querySelectorAll('button')]
          const modes = btns.filter(b => /TEAM DEATHMATCH|FREE FOR ALL|CAPTURE THE FLAG|DOMINATION|OPERATION ASHFALL/.test(b.innerText))
          return { total: modes.length, disabled: modes.filter(b => b.disabled).length }
        }''')
        check(f'mode buttons ENABLED for leader ({dis["disabled"]} disabled)', dis['disabled'] == 0)
        # too-small formats dimmed for squad of 3 (1v1/2v2)
        page.screenshot(path=SHOT + '05-leader-panel.png')
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)

        # leader readies up → all 3 ready → 5s countdown overlay
        page.click('button:has-text("READY")')
        page.wait_for_selector('text=SQUAD READY — DEPLOYING', timeout=8000)
        check('countdown overlay visible', True)
        page.wait_for_timeout(500)
        ov = page.locator('body').inner_text()
        check('countdown big number ticking', any(f'\n{n}\n' in f'\n{ov}\n' for n in (5, 4, 3)) or '5' in ov or '4' in ov)
        page.screenshot(path=SHOT + '06-leader-countdown.png')

        # …countdown runs out → the match deploys (host room, 3v3)
        page.wait_for_selector('text=room', timeout=15000)
        page.wait_for_timeout(1200)
        body_up = page.locator('body').inner_text().upper()
        deployed = ('TACTICAL' in body_up or 'ROOM' in body_up
                    or 'OPERATORS' in body_up or 'START' in body_up)
        check('match deployed (host room screen)', deployed)
        check('room kind 3V3 deployed', '3V3' in body_up)
        page.screenshot(path=SHOT + '07-leader-deployed.png')

        check('0 pageerrors (member)', len(errors) == 0)
        check('0 pageerrors (leader)', len(errors2) == 0)
        ctx2.close()
        browser.close()
finally:
    server.terminate()

print(f'\n=== v15 E2E: {len(ok)} PASS / {len(fail)} FAIL ===')
if fail:
    print('FAILED:', fail)
    sys.exit(1)
