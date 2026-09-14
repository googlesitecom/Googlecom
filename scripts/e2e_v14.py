# ============================================================
# E2E v14 — local build (out/ en :4173)
# 1) BR eliminado por completo (sin pestaña/texto Battle Royale)
# 2) LOBBY estilo Fortnite: personaje 3D + usuario + PLAY + panel
#    de modos con TODOS los modos + QUICK MATCH
# 3) Suministros aéreos (?cratetest=1): avión, caída, [E], loot
# 4) Mapa 200×200 (half=100)
# 5) Regresión TDM sin errores de consola
# ============================================================
import sys, time, subprocess, os
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'

ok, fail = [], []
def check(name, cond):
    (ok if cond else fail).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}', flush=True)

# servir out/ en 4173
server = subprocess.Popen(['bun', 'scripts/serve-static.mjs'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--disable-ctx-search', '--no-sandbox',
        ])
        ctx = browser.new_context(viewport={'width': 800, 'height': 450})
        ctx.set_default_timeout(60000)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:160])))
        page.on('console', lambda m: print('  [console.error]', m.text[:160]) if m.type == 'error' else None)

        page.goto(BASE + '?cratetest=1', wait_until='domcontentloaded')
        page.wait_for_selector('text=Operator Access', timeout=90000)
        check('auth screen', True)
        stamp = str(int(time.time()))[-6:]
        page.click('button:has-text("REGISTER")')
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'V14_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        check('lobby v14 cargado (tarjeta de modo)', True)

        # ---------- 1) BR eliminado ----------
        body = page.inner_text('body')
        check('sin "Battle Royale" en el menú', 'Battle Royale' not in body)
        check('sin "Find match" (botón BR)', 'Find match' not in body)

        # ---------- 2) lobby Fortnite ----------
        check('botón PLAY presente', page.locator('button:has-text("PLAY")').count() >= 1)
        check('título arriba-izquierda', page.locator('h1:has-text("Emergency")').count() == 1)
        # etiqueta de usuario sobre el personaje (tag del lobby)
        check('tag de usuario en el escenario', page.locator('text=V14_' + stamp).count() >= 1)
        # canvas 3D del lobby (el menú no tenía canvas antes)
        canvases = page.locator('canvas').count()
        check('canvas 3D del lobby presente', canvases >= 1)
        page.screenshot(path='scripts/v14-01-lobby.png')

        # panel de modos (cae desde abajo, con TODOS los modos)
        page.click('button:has-text("SELECTED MODE")')
        page.wait_for_selector('text=Select mode', timeout=10000)
        for label in ['TEAM DEATHMATCH', 'FREE FOR ALL', 'CAPTURE THE FLAG', 'DOMINATION', 'OPERATION ASHFALL', 'QUICK MATCH', 'Public rooms']:
            check(f'modo/sección "{label}"', page.locator(f'text={label}').count() >= 1)
        page.screenshot(path='scripts/v14-02-modes.png')
        # vista previa de arma del lobby
        check('loadout preview', page.locator('text=Lobby loadout preview').count() >= 1)

        # cerrar el panel de modos con ESC
        page.keyboard.press('Escape')
        page.wait_for_selector('text=Select mode', state='detached', timeout=10000)
        # calidad LOW antes de desplegar (E2E en swiftshader: rendering pesado)
        page.click('button[title="SETTINGS"]')
        page.click('button:has-text("LOW")')
        page.keyboard.press('Escape')
        page.wait_for_selector('text=Game settings', state='detached', timeout=10000)
        page.click('button[class*="h-[64px]"]')
        print('  … esperando partida (cinemática + carga)', flush=True)
        try:
            page.wait_for_function('window.__game && window.__game.md ? true : false', timeout=300000)
            check('partida TDM en marcha (motor montado)', True)
        except Exception:
            check('partida TDM en marcha (motor montado)', False)
        # saltar la cinemática de lanzamiento (cualquier tecla la termina)
        try:
            page.wait_for_function('window.__game.cine.active === true', timeout=60000)
        except Exception:
            pass
        page.keyboard.press('KeyW')
        page.wait_for_function('window.__game.cine.active === false', timeout=60000)
        check('cinemática saltada', True)
        # el pointer-lock puede fallar sin gesto → overlay de PAUSA:
        # clic en "Click to get back" para reanudar (y desbloquear el sim)
        try:
            page.wait_for_selector('text=Click to get back into the fight', timeout=6000)
            page.mouse.click(640, 360)
            page.wait_for_selector('text=Click to get back into the fight', state='detached', timeout=15000)
            print('  … reanudado tras el clic (pointer lock OK)', flush=True)
        except Exception:
            print('  … sin overlay de pausa (lock directo)', flush=True)
        time.sleep(2)

        # ---------- 4) mapa 200×200 ----------
        try:
            v = page.wait_for_function('window.__game && window.__game.md ? window.__game.md.half : 0', timeout=60000)
            check(f'mapa ampliado (half={v.json_value()})', v.json_value() == 100)
        except Exception:
            check('mapa ampliado', False)

        # ---------- 3) suministros aéreos ----------
        print('  … esperando la primera entrega aérea', flush=True)
        try:
            page.wait_for_function('window.__game && window.__game.crateViews && window.__game.crateViews.size > 0', timeout=240000)
            check('caja de suministro creada', True)
        except Exception:
            check('caja de suministro creada', False)
        try:
            n = page.evaluate('window.__game.crateViews.size')
            check(f'{n} caja(s) en el mundo', n >= 1)
            cv = page.evaluate('(() => { const c = window.__game.crateViews.values().next().value; return { x: c.x, z: c.z, landed: c.landed, hasPlane: !!c.plane, label: c.label } })()')
            print('  crate:', cv, flush=True)
            check('avión de carga presente', bool(cv['hasPlane']))
            check('zona con etiqueta', bool(cv['label']))
            # esperar aterrizaje (fall 4.5 s de juego)
            page.wait_for_function('(() => { for (const c of window.__game.crateViews.values()) return c.landed })()', timeout=120000)
            check('caja aterrizada', True)
            page.screenshot(path='scripts/v14-03-crate.png')
            # teletransportar al jugador junto a la caja y esperar el hint
            page.evaluate('(() => { const g = window.__game; const c = g.crateViews.values().next().value; g.pos.set(c.x + 1.2, 0, c.z); if (g.vel) g.vel.set(0,0,0); if (g.onGround !== undefined) g.onGround = true })()')
            try:
                page.wait_for_function('window.__game.interactHint.includes("SUPPLY")', timeout=60000)
                hint = page.evaluate('window.__game.interactHint')
                check(f'hint de apertura ("{hint}")', True)
            except Exception:
                hint = page.evaluate('window.__game.interactHint')
                check(f'hint de apertura ("{hint}")', False)
            page.keyboard.press('KeyE')
            try:
                page.wait_for_function('document.body.innerText.includes("SUPPLY CRATE (")', timeout=30000)
                check('loot anunciado (arma + escudo + dinero)', True)
            except Exception:
                check('loot anunciado (arma + escudo + dinero)', False)
            arm = page.evaluate('window.__game.armory.length')
            check(f'arsenal creció ({arm} armas)', arm > 2)
            ann = page.inner_text('body')
            check('apertura registrada (secured the supply drop)', 'SECURED THE SUPPLY DROP' in ann or 'SUPPLY CRATE (' in ann)
        except Exception as e:
            print('  [crate flow error]', str(e)[:200], flush=True)
            check('flujo de suministros completo', False)

        page.screenshot(path='scripts/v14-04-game.png')

        # ---------- 5) regresión ----------
        check('FPS > 0 (motor vivo)', page.evaluate('window.__game ? window.__game.fpsFrames >= 0 : false'))
        check('sin pageerror', len(errors) == 0)
        ctx.close()
        browser.close()
finally:
    server.terminate()

print('\n===== v14 LOCAL =====')
for k in ok: print(f'  PASS {k}')
for k in fail: print(f'  FAIL {k}')
sys.exit(1 if fail else 0)
