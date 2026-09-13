# ============================================================
# E2E v10 — verificación de las novedades:
#  1. Registro/login → menú con SQUAD en el perfil
#  2. Amigos + grupo activo → despliegue con escuadra (PvP)
#  3. BR: gráficos HIGH (sin tope), texturas/edificios, rarezas,
#     chat de partida [T]
# ============================================================
import re, sys, time, json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
OUT = '/home/z/my-project/game/repo/scripts/'

def shot(page, name):
    page.screenshot(path=OUT + name, timeout=90000)
    print(f'  [shot] {name}')

results = {'ok': [], 'fail': []}

def check(name, cond):
    (results['ok'] if cond else results['fail']).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}')

def body_text(page, tries=3):
    """inner_text tolerante a bloqueos del hilo principal (swiftshader)"""
    for i in range(tries):
        try:
            return page.inner_text('body', timeout=25000)
        except Exception:
            page.wait_for_timeout(4000)
    return ''

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-ctx-search', '--no-sandbox',
    ])
    ctx = browser.new_context(viewport={'width': 960, 'height': 540})
    page = ctx.new_page()
    page.on('console', lambda m: (m.type == 'error') and print('  [console.error]', m.text[:200]))
    page.on('pageerror', lambda e: print('  [pageerror]', str(e)[:200]))

    # ---------- 1. boot + registro ----------
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('text=Operator Access', timeout=60000)
    print('  [ok] auth screen')
    stamp = str(int(time.time()))[-6:]
    user = f'TestV10_{stamp}'
    page.click('button:has-text("REGISTER")')
    page.fill('input[placeholder="E.G. NIGHTHAWK"]', user)
    page.fill('input[type="password"] >> nth=0', '1234')
    page.fill('input[type="password"] >> nth=1', '1234')
    page.click('button:has-text("Create operator")')
    page.wait_for_selector('text=Deploy', timeout=30000)
    shot(page, 'v10-01-menu.png')
    check('login+menu', True)

    # ---------- 2. perfil → amigos + grupo ----------
    page.click('[title="Career profile · friends & groups"]')
    page.wait_for_selector('text=SQUAD', timeout=8000)
    page.fill('input[placeholder*="Friend"]', 'Rico')
    page.click('button:has-text("ADD")')
    page.fill('input[placeholder*="Friend"]', 'Vega')
    page.click('button:has-text("ADD")')
    page.wait_for_selector('text=Rico', timeout=5000)
    page.fill('input[placeholder*="Group name"]', 'Night Owls')
    page.click('button:text-is("Rico")')
    page.click('button:text-is("Vega")')
    page.click('button:has-text("CREATE")')
    page.wait_for_selector('text=Night Owls', timeout=5000)
    page.click('button:has-text("DEPLOY WITH")')
    page.wait_for_selector('text=ACTIVE', timeout=5000)
    shot(page, 'v10-02-squad-profile.png')
    check('squad created + active', True)
    page.mouse.click(8, 8)   # cerrar modal por el backdrop
    page.wait_for_selector('text=Create group', state='detached', timeout=6000)
    page.wait_for_selector('text=Night Owls', timeout=8000)   # escuadra activa en el panel de despliegue
    page.wait_for_timeout(400)

    # ---------- 3. despliegue PvP con escuadra ----------
    page.click('button:has-text("Start deployment")')
    # (sin capturas durante el init síncrono del motor: con swiftshader
    #  el hilo principal se bloquea decenas de segundos)
    # el HUD aparece tras la cinemática de entrada (11 s, se corta sola)
    try:
        page.wait_for_function('document.body.innerText.includes("AMBER") || document.body.innerText.includes("VITALS")', timeout=180000)
        hud_up = True
    except Exception:
        hud_up = False
    check('PvP match starts (HUD up)', hud_up)
    page.wait_for_timeout(6000)
    shot(page, 'v10-03-pvp-squad.png')
    # scoreboard (Tab): los amigos aparecen como operadores (sin tag BOT)
    page.keyboard.down('Tab')
    page.wait_for_timeout(1600)
    body = body_text(page)
    check('squadmate Rico on scoreboard', 'Rico' in body)
    check('squadmate Vega on scoreboard', 'Vega' in body)
    shot(page, 'v10-04-scoreboard.png')
    page.keyboard.up('Tab')
    # recargar para volver al menú (sesión persistente)
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('text=Deploy', timeout=60000)
    check('back to menu (session restored)', True)

    # ---------- 4. ajustes: HIGH disponible (sin bloqueo BR) ----------
    page.click('button:has-text("Settings")')
    page.wait_for_selector('text=Graphics', timeout=15000)
    page.click('button:has-text("HIGH")')
    page.wait_for_timeout(500)
    high_enabled = page.locator('button', has_text='HIGH').first.is_enabled()
    check('HIGH quality selectable', high_enabled)
    no_brlock = 'BR LOCKED' not in body_text(page)
    check('no BR quality lock', no_brlock)
    shot(page, 'v10-05-settings.png')

    # ---------- 5. Battle Royale ----------
    page.click('button:has-text("Battle Royale")')
    page.wait_for_selector('text=Find match', timeout=15000)
    check('rarity table in BR tab', 'LEGENDARY' in body_text(page))
    shot(page, 'v10-06-brtab.png')
    page.click('button:has-text("Find match")')
    page.wait_for_function('window.__brGame !== undefined', timeout=30000)
    print('  [ok] BR engine up')
    page.wait_for_timeout(3000)
    shot(page, 'v10-07-br-lobby.png')
    body = body_text(page)
    check('BR HIGH note (no cap)', 'HIGH' in body and 'capped' not in body.lower())
    # esperar el mapa y acelerar la cuenta atrás
    page.wait_for_function('window.__brGame && window.__brGame.mapReady === true', timeout=90000)
    print('  [ok] map streamed')
    # esperar a que la cuenta atrás REAL esté corriendo (4 operadores online)
    # y solo entonces acelerarla (antes de eso el contador se reinicia a 60)
    page.wait_for_function('window.__brGame && window.__brGame.countdownRunning === true', timeout=60000)
    page.evaluate('window.__brGame.countdown = 0.4')
    page.wait_for_function('window.__brGame && window.__brGame.phase === "plane"', timeout=45000)
    print('  [ok] aboard the plane')
    page.wait_for_timeout(1800)
    shot(page, 'v10-08-br-plane.png')
    page.evaluate('window.__brGame.jumpFromPlane()')
    page.wait_for_timeout(1200)
    shot(page, 'v10-09-br-freefall.png')
    # el RAF va lento con swiftshader: avanzar la caída por simulación directa
    page.evaluate('''() => {
      const g = window.__brGame
      for (let i = 0; i < 500 && g.phase === 'freefall'; i++) g.updateFreefall(0.1)
    }''')
    page.wait_for_function('window.__brGame && window.__brGame.phase === "live"', timeout=90000)
    print('  [ok] boots on the ground')
    page.wait_for_timeout(3000)

    # vista de la ciudad (RIVERSIDE) con gráficos HIGH
    page.evaluate('''() => {
      const g = window.__brGame
      g.px = -58; g.pz = 30
      g.yaw = -2.2; g.pitch = -0.12
    }''')
    page.wait_for_timeout(3000)
    shot(page, 'v10-10-br-city-high.png')
    stats = page.evaluate('''() => {
      const g = window.__brGame
      let textured = 0, meshes = 0
      g.mapScene.traverse(o => {
        if (o.isMesh) {
          meshes++
          const m = Array.isArray(o.material) ? o.material[0] : o.material
          if (m && m.map) textured++
        }
      })
      return { meshes, textured, quality: g.effQuality, pixelRatio: g.renderer.getPixelRatio() }
    }''')
    print('  [info]', json.dumps(stats))
    check('BR quality = alta', stats['quality'] == 'alta')
    check('BR pixelRatio >= 1 (AA on)', stats['pixelRatio'] >= 1)
    check('textured meshes present', stats['textured'] > 30)

    # ---------- 6. chat de partida ----------
    page.keyboard.press('KeyT')
    page.wait_for_selector('input[placeholder*="message"]', timeout=15000)
    page.fill('input[placeholder*="message"]', 'hello squad')
    shot(page, 'v10-11-br-chat-open.png')
    page.keyboard.press('Enter')
    page.wait_for_timeout(600)
    body = body_text(page)
    check('chat message visible', 'hello squad' in body)
    shot(page, 'v10-11-br-chat.png')

    # ---------- 7. recoger arma con rareza ----------
    picked = page.evaluate('''() => {
      const g = window.__brGame
      const spot = g.loot.find(s => !s.taken && (s.kind === 'weapon' || s.kind === 'crate'))
      if (!spot) return null
      g.px = spot.x + 0.4; g.pz = spot.z
      g.wantJump = true
      return { kind: spot.kind, weapon: spot.weapon, rarity: spot.rarity }
    }''')
    print('  [info] loot target:', picked)
    page.wait_for_timeout(1500)
    state = page.evaluate('''() => {
      const g = window.__brGame
      g.wantJump = true
      return { w: g.weapon, r: g.weaponRarity }
    }''')
    page.wait_for_timeout(1300)
    state = page.evaluate('() => ({ w: window.__brGame.weapon, r: window.__brGame.weaponRarity })')
    print('  [info] weapon state:', state)
    check('weapon looted (same arsenal)', state['w'] in ['p9', 'mp9', 'breacher', 'ar47', 'cr4', 'aguila', 'awp338'])
    check('rarity assigned (0..4)', isinstance(state['r'], int) and 0 <= state['r'] <= 4)
    body = body_text(page)
    has_rar = any(k in body for k in ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'])
    check('rarity shown in HUD', has_rar)
    has_dmg = '% DMG' in body
    check('rarity damage bonus shown', has_dmg)
    shot(page, 'v10-12-br-weapon-rarity.png')

    # segunda ciudad (NORTHGATE)
    page.evaluate('''() => {
      const g = window.__brGame
      g.px = 60; g.pz = -40
      g.yaw = 2.6; g.pitch = -0.2
    }''')
    page.wait_for_timeout(3000)
    shot(page, 'v10-13-br-city2.png')

    # ---------- 8. salir limpio ----------
    page.evaluate('window.__brGame.leave()')
    page.wait_for_selector('text=Battle Royale', timeout=45000)
    check('BR clean exit', True)
    shot(page, 'v10-14-back-menu.png')

    browser.close()

print()
print('=== RESULTADOS ===')
print('OK :', len(results['ok']), results['ok'])
print('FAIL:', len(results['fail']), results['fail'])
sys.exit(1 if results['fail'] else 0)
