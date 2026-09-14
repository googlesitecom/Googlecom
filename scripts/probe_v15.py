import time, subprocess
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
        page = ctx.new_page()
        page.goto(BASE + '?lobbytest=1&partytest=member', wait_until='domcontentloaded')
        page.wait_for_selector('text=Operator Access', timeout=90000)
        stamp = str(int(time.time()))[-6:]
        page.click('button:has-text("REGISTER")')
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'PROBE_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        page.wait_for_timeout(2600)

        info = page.evaluate('''() => {
          const w = window.__partyTest
          const body = document.body.innerText
          const leftPanel = document.querySelector('.hidden.md\\\\:block')
          return {
            partyTest: w ? w.role : null,
            leftPanelVisible: leftPanel ? !!(leftPanel.offsetWidth || leftPanel.offsetHeight) : null,
            leftPanelText: leftPanel ? leftPanel.innerText.slice(0, 400) : null,
            hasSquadWord: body.includes('SQUAD'), hasIronside: body.includes('Ironside'),
            hasReadyCount: /\\d+\\/\\d+ READY/.test(body),
            readyMatch: (body.match(/\\d+\\/\\d+ READY/g) || []).slice(0,4),
          }
        }''')
        print('PROBE:', info)

        page.click('button:has-text("SELECTED MODE")')
        page.wait_for_selector('text=Select mode', timeout=20000)
        page.wait_for_timeout(500)
        panel = page.evaluate('''() => {
          const body = document.body.innerText
          return {
            hasLeaderNote: body.includes('configured by the leader'),
            hasSquadDeploy: body.includes('SQUAD DEPLOY'),
            hasRoomFormat: body.includes('Room format'),
            pvpSnippet: body.slice(body.indexOf('SQUAD DEPLOY') - 50, body.indexOf('SQUAD DEPLOY') + 600),
          }
        }''')
        print('PANEL:', panel)
        browser.close()
finally:
    server.terminate()
