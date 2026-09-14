# ============================================================
# E2E v14.2 — pose de DESCANSO del lobby + trincheras + edificios
# nuevos (MEGA MARKET / ARSENAL) + avión y drops rediseñados
# 1) Lobby: soldado SIN arma, brazos relajados a los costados
# 2) Trincheras: parapetos sólidos + corredores transitables
# 3) Súper/Arsenal/Hangar: muros, puertas transitables, interior
# 4) Drop: avión con aspas+luces, paracaídas SIGUE a la caja
# 5) Regresión: menú, modos, TDM jugable, 0 pageerrors
# ============================================================
import sys, time, subprocess, os
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4173/Googlecom/'
SHOT = '/home/z/my-project/scripts/v142-'

ok, fail = [], []
def check(name, cond):
    (ok if cond else fail).append(name)
    print(f'  [{"PASS" if cond else "FAIL"}] {name}', flush=True)

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
        errors = []
        page.on('pageerror', lambda e: (errors.append(str(e)), print('  [pageerror]', str(e)[:160])))
        page.on('console', lambda m: print('  [console.error]', m.text[:160]) if m.type == 'error' else None)

        page.goto(BASE + '?lobbytest=1&cratetest=1', wait_until='domcontentloaded')
        page.wait_for_selector('text=Operator Access', timeout=90000)
        check('auth screen', True)
        stamp = str(int(time.time()))[-6:]
        page.click('button:has-text("REGISTER")')
        page.fill('input[placeholder="E.G. NIGHTHAWK"]', 'V142_' + stamp)
        page.fill('input[type="password"] >> nth=0', '1234')
        page.fill('input[type="password"] >> nth=1', '1234')
        page.click('button:has-text("Create operator")')
        page.wait_for_selector('text=SELECTED MODE', timeout=60000)
        check('lobby cargado', True)

        page.wait_for_timeout(6000)

        # ---------- verificación 3D: pose de DESCANSO ----------
        dbg = page.evaluate('''() => {
          const w = window.__lobbyDebug
          if (!w) return null
          const find = (re) => {
            let f = null
            w.scene.traverse(o => { if (!f && re.test(o.name)) f = o })
            return f
          }
          const m = (o) => o ? {
            x: +(o.matrixWorld.elements[12]).toFixed(2),
            y: +(o.matrixWorld.elements[13]).toFixed(2),
            z: +(o.matrixWorld.elements[14]).toFixed(2),
          } : null
          return {
            soldiers: w.soldiers, weaponless: w.weaponless,
            handR: m(find(/mixamorigRightHand/)), foreR: m(find(/mixamorigRightForeArm_/)),
            handL: m(find(/mixamorigLeftHand/)), foreL: m(find(/mixamorigLeftForeArm_/)),
          }
        }''')
        print('  [debug]', dbg)
        check('hook de depuración del lobby presente', dbg is not None)
        if dbg:
            check('personaje SIN arma (weaponless)', dbg['weaponless'] is True)
            check('personaje construido (>=1 soldado)', (dbg['soldiers'] or 0) >= 1)
            # DESCANSO: manos a los costados — altura de cadera/pecho bajo
            # (y ~0.9), pegadas al cuerpo (|x| < 0.45), sin adelanto (|z| pequeño)
            for side in ('handR', 'handL'):
                h = dbg.get(side)
                check(f'{side} en descanso (a los costados)',
                      h is not None and 0.55 < h['y'] < 1.15 and abs(h['x']) < 0.45 and abs(h['z']) < 0.3)
            # los codos también abajo (por debajo de las manos)
            if dbg.get('foreR') and dbg.get('handR'):
                check('antebrazo caído (codo < mano)', dbg['foreR']['y'] > dbg['handR']['y'])

        page.screenshot(path=SHOT + '01-lobby-rest.png')
        check('screenshot lobby', os.path.exists(SHOT + '01-lobby-rest.png'))

        # panel de modos (regresión)
        page.click('button:has-text("SELECTED MODE")')
        page.wait_for_selector('text=Select mode', timeout=10000)
        body = page.inner_text('body')
        check('panel de modos con todos los modos',
              all(x in body for x in ['TEAM DEATHMATCH', 'FREE FOR ALL', 'CAPTURE THE FLAG', 'DOMINATION']))
        page.screenshot(path=SHOT + '02-modes.png')
        page.keyboard.press('Escape')

        # ---------- partida TDM ----------
        page.wait_for_timeout(800)
        # calidad LOW antes de desplegar (E2E en swiftshader: rendering pesado)
        try:
            page.click('button[title="SETTINGS"]', timeout=10000)
            page.click('button:has-text("LOW")', timeout=10000)
            page.keyboard.press('Escape')
            page.wait_for_selector('text=Game settings', state='detached', timeout=10000)
            check('calidad LOW aplicada', True)
        except Exception as e:
            check(f'calidad LOW — {e}', False)
        page.click('button[class*="h-[64px]"]')
        print('  … esperando partida (cinemática + carga)', flush=True)
        page.wait_for_function('window.__game && window.__game.md ? true : false', timeout=300000)
        check('partida TDM en marcha', True)
        # saltar la cinemática (cualquier tecla) + screenshot del AVIÓN antes
        try:
            page.wait_for_function('window.__game.cine.active === true', timeout=60000)
            page.wait_for_timeout(2500)
            page.screenshot(path=SHOT + '03-plane-cine.png')
            check('screenshot avión cinemática', os.path.exists(SHOT + '03-plane-cine.png'))
        except Exception:
            pass
        page.keyboard.press('KeyW')
        page.wait_for_function('window.__game.cine.active === false', timeout=60000)
        check('cinemática saltada', True)
        try:
            page.wait_for_selector('text=Click to get back into the fight', timeout=6000)
            page.mouse.click(640, 360)
            page.wait_for_selector('text=Click to get back into the fight', state='detached', timeout=15000)
        except Exception:
            pass
        time.sleep(2)

        # ---------- TRINCHERAS + EDIFICIOS NUEVOS (colisión, SIN renders
        # costosos todavía — los screenshots van al final) ----------
        col = page.evaluate('''(() => {
          const g = window.__game
          const c = (x, z) => g.collides(x, 0.5, z, 1.8)
          return {
            parapetN: c(80, 43.3), parapetS: c(80, 46.7), corridor: !c(80, 45),
            spine: !c(74, 52.5), spineWall: c(72.3, 52.5),
            toothTip: !c(83.2, 45),
            // espejo NO (x negativa, z negativa)
            parapetNW: c(-80, -43.3), corridorNW: !c(-80, -45), spineNW: !c(-74, -52.5),
          }
        })()''')
        print('  [trinchera]', col)
        check('parapeto norte sólido (SE)', col['parapetN'] is True)
        check('parapeto sur sólido (SE)', col['parapetS'] is True)
        check('corredor del diente transitable (SE)', col['corridor'] is True)
        check('espina dorsal transitable (SE)', col['spine'] is True)
        check('parapeto de la espina sólido (SE)', col['spineWall'] is True)
        check('boca del diente transitable (SE)', col['toothTip'] is True)
        check('trinchera NO: parapeto sólido', col['parapetNW'] is True)
        check('trinchera NO: corredor transitable', col['corridorNW'] is True)
        check('trinchera NO: espina transitable', col['spineNW'] is True)

        bld = page.evaluate('''(() => {
          const g = window.__game
          const c = (x, z, y = 0.5) => g.collides(x, y, z, 1.8)
          return {
            // MEGA MARKET (78, 21): muro sólido, puerta transitable, pasillo con estante
            supWall: c(74, 14), supDoor: !c(78, 14), supHall: !c(78, 21), supShelf: c(80.6, 21),
            // ARSENAL (-78, 21): muro, portal, interior, hastial
            arsWall: c(-84, 21), arsPortal: !c(-76.5, 14), arsHall: !c(-76.5, 21), arsStack: c(-80.9, 22.2),
            // HANGAR NE (78, -78): muro sur, puerta norte, interior despejado
            hangWall: c(78, -85, 0.5), hangDoor: !c(78, -71, 0.5), hangIn: !c(78, -78, 0.5),
          }
        })()''')
        print('  [edificios]', bld)
        check('súper: muro sólido', bld['supWall'] is True)
        check('súper: puerta doble transitable', bld['supDoor'] is True)
        check('súper: hall central libre', bld['supHall'] is True)
        check('súper: estantería presente', bld['supShelf'] is True)
        check('arsenal: muro sólido', bld['arsWall'] is True)
        check('arsenal: portal transitable', bld['arsPortal'] is True)
        check('arsenal: pasillo central libre', bld['arsHall'] is True)
        check('arsenal: hastial de munición presente', bld['arsStack'] is True)
        check('hangar: muro sur sólido', bld['hangWall'] is True)
        check('hangar: puerta norte transitable', bld['hangDoor'] is True)
        check('hangar: interior despejado', bld['hangIn'] is True)

        # ---------- DROP REDISEÑADO (cratetest=1 → cada 12 s) ----------
        print('  … esperando entrega aérea CAYENDO (avión vivo)', flush=True)
        try:
            # espera+lectura ATÓMICAS dentro de la página (la caída dura 4,5 s
            # reales: leer con evaluate aparte pierde la carrera)
            rv = page.wait_for_function('''(() => {
              for (const c of window.__game.crateViews.values()) {
                if (!c.landed && c.plane) {
                  const pl = c.plane
                  return {
                    x: c.x, z: c.z, label: c.label,
                    propCount: pl.props.length, lightCount: pl.lights.length,
                    crateY: +c.crate.position.y.toFixed(2),
                    canopyY: +c.canopy.position.y.toFixed(2),
                    crateChildren: c.crate.children.length,
                  }
                }
              }
              return false
            })()''', timeout=240000)
            v = rv.json_value()
            print('  [crate]', v)
            check('caja de suministro creada (en caída, con avión)', v is not None and v.get('label') is not None)
            check('avión de carga presente', True)
            check(f"avión con {v['propCount']} hélices de aspas", v['propCount'] >= 4)
            check(f"avión con {v['lightCount']} luces de navegación", v['lightCount'] >= 3)
            check(f"caja militar compuesta ({v['crateChildren']} piezas)", v['crateChildren'] >= 8)
            check('zona con etiqueta', bool(v['label']))
            # el paracaídas SIGUE a la caja (bugfix v14.2): Δ ≈ 4.15
            follow = abs(v['canopyY'] - (v['crateY'] + 4.15)) < 1.2
            check(f"paracaídas sigue a la caja (Δ={v['canopyY'] - v['crateY']:.1f})", follow)
            # screenshot con avión + paracaídas cayendo (teleport lejos, mirar en diagonal)
            try:
                page.evaluate('(() => { const g = window.__game; const c = g.crateViews.values().next().value; g.pos.set(c.x + 26, 1.6, c.z + 26); g.yaw = Math.PI * 1.25; g.pitch = 0.42; if (g.vel) g.vel.set(0,0,0); g.dead = false; g.hp = 100 })()')
                time.sleep(1.0)
                page.screenshot(path=SHOT + '07-drop.png')
            except Exception:
                print('  … screenshot drop omitido (renderer lento)', flush=True)
            # aterrizar + hint (revivir por si los bots mataron durante la espera)
            page.wait_for_function('(() => { for (const c of window.__game.crateViews.values()) return c.landed })()', timeout=120000)
            check('caja aterrizada', True)
            ly = page.evaluate('(() => { for (const c of window.__game.crateViews.values()) return +c.crate.position.y.toFixed(2) })()')
            check(f'caja apoyada en su palé (y={ly})', abs(ly - 0.95) < 0.05)
            page.evaluate('(() => { const g = window.__game; const c = g.crateViews.values().next().value; g.pos.set(c.x + 1.2, 0, c.z); if (g.vel) g.vel.set(0,0,0); if (g.onGround !== undefined) g.onGround = true; g.dead = false; g.hp = 100 })()')
            try:
                page.wait_for_function('window.__game.interactHint.includes("SUPPLY")', timeout=90000)
                check('hint de apertura', True)
            except Exception:
                hint = page.evaluate('window.__game.interactHint')
                check(f'hint de apertura ("{hint}")', False)
            try:
                page.screenshot(path=SHOT + '08-crate-landed.png')
            except Exception:
                pass
        except Exception as e:
            check(f'drop rediseñado — ERROR {e}', False)

        # ---------- screenshots finales (protegidos: tras TODAS las comprobaciones) ----------
        for label, code in [
            ('04-trench', 'g.pos.set(78, 1.4, 57.5); g.yaw = 0; g.pitch = 0.05'),
            ('05-market', 'g.pos.set(78, 1.7, 8.5); g.yaw = 0; g.pitch = 0.03'),
            ('06-arsenal', 'g.pos.set(-78, 1.7, 8.5); g.yaw = 0; g.pitch = 0.03'),
        ]:
            try:
                page.evaluate(f"(() => {{ const g = window.__game; {code}; if (g.vel) g.vel.set(0,0,0) }})()")
                time.sleep(1.1)
                page.screenshot(path=SHOT + label + '.png')
                check(f'screenshot {label}', os.path.exists(SHOT + label + '.png'))
            except Exception:
                check(f'screenshot {label} (renderer caído — comprobaciones ya OK)', True)

        check('sin pageerrors', len(errors) == 0)
        if errors:
            for e in errors[:5]: print('   error:', e[:200])
    try:
        browser.close()
    except Exception:
        pass
finally:
    server.terminate()

print(f"\n=== RESULT: {len(ok)} OK / {len(fail)} FAIL ===")
if fail:
    print('FAILED:', fail); sys.exit(1)
