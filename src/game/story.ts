// ============================================================
// EMERGENCY STRIKE — Story mode director (v7)
// "OPERATION ASHFALL" — a proper single-player campaign in the
// Serene Valley: 6 chapters, long Halo-style cinematics with
// radio dialogue AND live battle fronts (soldados trading fire,
// tracers, explosions) while the camera flies over the scene.
//
// v7 redesign goals:
//  - LONG cinematics (15-22 s) with 6-8 dialogue lines each
//  - TWO battle fronts per cinematic (war feels alive)
//  - FEWER guards on the ground (5 at start, small reinforcements)
//  - a real campaign arc: insertion → siege → sabotage → rescue
//    → boss duel → timed extraction, with banter, stakes and a
//    villain (Colonel Vega) who talks back
// ============================================================
import * as THREE from 'three'
import type { Game } from './engine'
import { useGame } from './store'
import {
  STORY_INTEL, STORY_UPLINK, STORY_ANTENNAS, STORY_PRISONER, STORY_EXTRACTION,
  type StoryObjective, type NetSnapshot,
} from './shared'
import type { CineBattleSpec } from './engine'

interface Marker {
  obj: StoryObjective
  group: THREE.Group
  beam: THREE.Mesh
  ring: THREE.Mesh
  label: THREE.Sprite
  done: boolean
}

const N_CHAPTERS = 6

const t1000 = (): number => performance.now()

const CHAPTER_TITLES = [
  'CHAPTER 1 · FIRST LIGHT',
  'CHAPTER 2 · HOLD THE LINE',
  'CHAPTER 3 · CUT THE TOWER',
  'CHAPTER 4 · THE PRISONER',
  'CHAPTER 5 · THE COMMANDER',
  'CHAPTER 6 · EXFIL',
]

/** location subtitle shown during the chapter cinematic */
const CHAPTER_PLACES = [
  'SERENE VALLEY · SOUTH BANK',
  'ALBA VILLAGE · UPLINK DEFENSE',
  'ASHFALL COMPLEX · THREE ANTENNAS',
  'ASHFALL COMPLEX · CELL BLOCK',
  'COL. VEGA · HIGH-VALUE TARGET',
  'EXTRACTION · NORTH HELIPAD',
]

/** checkpoint (teleport) when each chapter activates */
const CHAPTER_START: { x: number; z: number; yaw: number }[] = [
  { x: 0, z: 54, yaw: 0 },       // south bank, facing north
  { x: 0, z: 24, yaw: 0 },       // village south entrance
  { x: 0, z: -12, yaw: 0 },      // complex south gate
  { x: 0, z: -30, yaw: -0.78 },  // courtyard, facing the prison
  { x: 8, z: -26, yaw: 0.2 },    // east courtyard, facing the commander
  { x: 0, z: -38, yaw: 0 },      // north courtyard, helipad gate
]

/** in-mission radio lines per chapter (who, text) */
const RADIO: { who: string; text: string }[][] = [
  [
    { who: 'COMMAND', text: 'Operator, you are across the ridge. Serene Valley is quiet… for now.' },
    { who: 'COMMAND', text: 'Three intel caches are waiting: the MILL, the ruined CHAPEL and the WATCHTOWER.' },
    { who: 'RED', text: 'I see you on my feed, Operator. Red here — I run your network. Move smart, move quiet.' },
    { who: 'COMMAND', text: 'First intel cache recovered. Two to go.' },
    { who: 'RED', text: 'Militia patrols all over the village. Watch the alleys — they love to flank.' },
    { who: 'COMMAND', text: 'Full intel package secured. Their invasion plan is ours. We move.' },
  ],
  [
    { who: 'RED', text: 'Patching the uplink from the village square… they are going to come straight at me!' },
    { who: 'RED', text: 'Transfer at 50 %. Hold the siege, Operator!' },
    { who: 'COMMAND', text: 'Enemy reinforcements inbound. Do not break.' },
    { who: 'RED', text: 'Last seconds! Stay with me…' },
    { who: 'RED', text: 'UPLINK COMPLETE! We have their full defense grid.' },
  ],
  [
    { who: 'COMMAND', text: 'Three antenna masts steer their defenses: ALPHA on the hill, BRAVO to the west, CHARLIE by the helipad.' },
    { who: 'RED', text: 'Plant a charge on each mast. Hold the interact key and keep your head down.' },
    { who: 'COMMAND', text: 'Charges set. Back off — the repeaters are going up!' },
    { who: 'RED', text: 'What a view. Their network just went dark.' },
    { who: 'COMMAND', text: 'The complex is blind. Next phase.' },
  ],
  [
    { who: 'RED', text: 'I found a prisoner in the east cell block… Sergeant Rivera, local resistance.' },
    { who: 'COMMAND', text: 'Get him out. The prison sits in the east wing of the complex.' },
    { who: 'RIVERA', text: 'You made it… the Commander\u2019s key is yours now. Cover my escape!' },
    { who: 'COMMAND', text: 'The alarm is up! Survive while Rivera runs.' },
    { who: 'RIVERA', text: 'I\u2019m clear! Vega is in the command building. End this.' },
    { who: 'COMMAND', text: 'Chapter closed. The complex is yours… almost.' },
  ],
  [
    { who: 'COMMAND', text: 'Colonel Vega commands from the north courtyard. Armored and lethal.' },
    { who: 'VEGA', text: 'So you are the one who gutted my network. I\u2019m almost impressed.' },
    { who: 'VEGA', text: 'This valley is MINE. The complex is MINE. And you… are a dead man walking.' },
    { who: 'RED', text: 'Vega down! Helicopter inbound to the north helipad.' },
    { who: 'COMMAND', text: 'Move, Operator! Run for EXTRACTION.' },
  ],
  [
    { who: 'COMMAND', text: 'Helicopter holds position for 150 seconds. Go through the north gate!' },
    { who: 'RED', text: 'Tail winds, Operator. The valley will remember this.' },
    { who: 'COMMAND', text: 'There it is! Final meters!' },
    { who: 'COMMAND', text: 'Operation Ashfall complete. Shake off the dust, hero.' },
  ],
]

/** v7 — cinematic camera routes (LONG takes, 7-9 waypoints each) */
const CHAPTER_CINES: { points: [number, number, number][]; looks: [number, number, number][]; dur: number }[] = [
  {   // 1 · FIRST LIGHT: sweeping arrival over the ridge, dive along the
    //     river, skim the rooftops and land next to the operator
    points: [[14, 42, 104], [8, 34, 92], [2, 24, 74], [0, 14, 54], [-8, 8, 36], [-2, 5, 24], [6, 3.5, 30], [2, 2.2, 42], [0, 1.9, 52]],
    looks: [[0, 4, 70], [0, 3, 52], [0, 2.5, 40], [-4, 2, 26], [-2, 1.5, 14], [0, 1.5, 13], [0, 2, 16], [0, 2, 26], [0, 2, 40]],
    dur: 21,
  },
  {   // 2 · HOLD THE LINE: high orbit of the village under siege, then a
    //     low pass over the square and the uplink terminal
    points: [[-42, 30, 40], [-24, 22, 30], [-4, 16, 18], [12, 10, 10], [10, 5, 18], [-6, 3, 22], [0, 2.2, 27]],
    looks: [[-16, 2, 22], [-6, 2, 18], [0, 2, 14], [0, 1.6, 12], [0, 1.6, 10], [0, 1.6, 11], [0, 1.6, 10]],
    dur: 17,
  },
  {   // 3 · CUT THE TOWER: over the north wall, orbit the helipad and the
    //     antenna line, dive into the courtyard
    points: [[0, 34, -88], [0, 24, -70], [18, 16, -58], [34, 12, -48], [30, 8, -34], [10, 5, -28], [0, 2.0, -14]],
    looks: [[0, 3, -62], [0, 3, -60], [22, 3, -50], [26, 2, -36], [10, 1.5, -30], [0, 1.5, -30], [0, 1.5, -30]],
    dur: 18,
  },
  {   // 4 · THE PRISONER: descend the north wall, sweep the cell block
    //     and settle behind cover in the courtyard
    points: [[0, 16, -74], [12, 11, -62], [26, 8, -52], [24, 4.5, -46], [12, 3, -42], [2, 2.6, -36], [0, 2.4, -30]],
    looks: [[0, 2, -62], [10, 2, -52], [20, 2, -46], [20, 1.4, -44], [12, 1.4, -40], [16, 1.2, -42], [16, 1.2, -42]],
    dur: 17,
  },
  {   // 5 · THE COMMANDER: low, slow, dramatic tracking shot across the
    //     courtyard straight at Vega\u2019s command building
    points: [[-28, 5, -50], [-16, 3.6, -44], [-6, 2.8, -40], [4, 3.2, -39], [10, 2.2, -33], [8, 1.9, -26]],
    looks: [[0, 2, -42], [0, 2, -42], [0, 1.8, -42], [0, 1.8, -42], [4, 1.8, -38], [0, 1.8, -40]],
    dur: 17,
  },
  {   // 6 · EXFIL intro: orbit the smoking complex and the helipad
    points: [[24, 14, -78], [20, 10, -64], [2, 8, -50], [-18, 9, -60], [-16, 11, -72], [0, 2.2, -46]],
    looks: [[0, 2, -60], [0, 2, -60], [0, 2, -60], [0, 2, -60], [0, 2, -60], [0, 1.6, -60]],
    dur: 15,
  },
]

/** v7 — cinematic dialogues: 6-8 lines per scene, Halo-style banter
 *  synchronized with the flyover (speaker + text + start second) */
const CINE_DIALOGUES: { at: number; dur?: number; who: string; text: string }[][] = [
  [   // 1 · FIRST LIGHT
    { at: 1.2, who: 'COMMAND', text: 'Zero hour, Operator. You are over the Serene Valley.' },
    { at: 5.0, who: 'COMMAND', text: 'Ashfall militia holds the village, the chapel and the watchtower. Light patrols — they are not expecting us.' },
    { at: 9.4, who: 'RED', text: 'Command, this is Red. I have eyes on the river crossing. Two fires burning in the village… someone had a bad night.' },
    { at: 13.2, who: 'COMMAND', text: 'Three intel caches: the MILL, the CHAPEL, the WATCHTOWER. Get in, get the papers, get out.' },
    { at: 17.0, who: 'RED', text: 'Watch the bridge, Operator. And the mill\u2019s roof — snipers love it there.' },
  ],
  [   // 2 · HOLD THE LINE
    { at: 1.2, who: 'RED', text: 'The uplink terminal is live. I need four minutes to drain their defense grid — four minutes of hell.' },
    { at: 5.0, who: 'COMMAND', text: 'Look at that square, Operator. That\u2019s where you make your stand.' },
    { at: 8.6, who: 'RED', text: 'Here they come! Whole squads pushing from the north alleys!' },
    { at: 12.0, who: 'COMMAND', text: 'Hold. The. Line. Nothing gets past you to that terminal.' },
    { at: 14.6, who: 'RED', text: 'Transfer starting… cover me, cover me!' },
  ],
  [   // 3 · CUT THE TOWER
    { at: 1.4, who: 'COMMAND', text: 'The Ashfall Complex — their radio masts steer every gun in this valley.' },
    { at: 5.2, who: 'RED', text: 'ALPHA on the hill, BRAVO to the west, CHARLIE by the helipad. Three charges, three towers.' },
    { at: 9.0, who: 'COMMAND', text: 'Their patrols are thin since the siege. Use the gaps, hug the walls.' },
    { at: 12.6, who: 'RED', text: 'Take the towers down and the whole complex goes deaf and blind.' },
    { at: 15.4, who: 'COMMAND', text: 'Make it loud, Operator. Make it permanent.' },
  ],
  [   // 4 · THE PRISONER
    { at: 1.2, who: 'RED', text: 'Signal inside the east cell block — friendly! It\u2019s Sergeant Rivera, resistance.' },
    { at: 5.0, who: 'RIVERA', text: 'Anyone out there?… Rivera, local resistance. Get this door open!' },
    { at: 8.6, who: 'COMMAND', text: 'The moment that cell opens, every guard in the complex will know.' },
    { at: 11.8, who: 'RED', text: 'He carried Vega\u2019s master key for six months. He is worth the whole valley.' },
    { at: 14.6, who: 'COMMAND', text: 'Get him out alive, Operator. Whatever it costs.' },
  ],
  [   // 5 · THE COMMANDER
    { at: 1.0, who: 'COMMAND', text: 'There he is. Colonel Vega. Armored, armed and very angry.' },
    { at: 4.6, who: 'VEGA', text: 'So YOU are the ghost that burned my towers. I expected someone… taller.' },
    { at: 8.0, who: 'VEGA', text: 'This valley is MINE. The complex is MINE. You are a tourist with a rifle.' },
    { at: 11.6, who: 'COMMAND', text: 'Aim for the head, Operator. His vest will eat everything else.' },
    { at: 14.4, who: 'VEGA', text: 'Come then. Let\u2019s see if you die better than my men did.' },
  ],
  [   // 6 · EXFIL
    { at: 1.4, who: 'COMMAND', text: 'Helicopter on station at the north pad. 150 seconds of fuel — that\u2019s your window.' },
    { at: 5.2, who: 'RED', text: 'The smoke from the complex is visible from the ridge… you actually did it.' },
    { at: 8.8, who: 'RIVERA', text: 'The resistance owes you a debt, Operator. We do not forget.' },
    { at: 11.8, who: 'COMMAND', text: 'Run, Operator. RUN!' },
  ],
]

/** v7 — TWO battle fronts per cinematic (living war under the camera) */
const CINE_BATTLES: CineBattleSpec[][] = [
  [   // 1: skirmish at the village gate + river crossing fight
    { cx: 0, cz: 18, yaw: Math.PI / 2, count: 4 },
    { cx: -26, cz: 34, yaw: 0.4, count: 3 },
  ],
  [   // 2: siege of the square (fountain) + north alley push
    { cx: 0, cz: 13, yaw: 0, count: 4 },
    { cx: -12, cz: 4, yaw: Math.PI / 2, count: 3 },
  ],
  [   // 3: courtyard fight + helipad defense
    { cx: 0, cz: -28, yaw: Math.PI / 2, count: 4 },
    { cx: 14, cz: -50, yaw: 0.8, count: 3 },
  ],
  [   // 4: rescue covering fire near the prison + west wall
    { cx: 14, cz: -40, yaw: 0.5, count: 3 },
    { cx: -18, cz: -34, yaw: Math.PI / 2, count: 3 },
  ],
  [   // 5: final duel lines before the command building
    { cx: 8, cz: -26, yaw: Math.PI / 2, count: 4 },
    { cx: -10, cz: -38, yaw: 0.6, count: 3 },
  ],
  [   // 6: last battle toward the helipad
    { cx: 0, cz: -44, yaw: 0, count: 4 },
    { cx: 20, cz: -56, yaw: Math.PI / 2, count: 3 },
  ],
]

export class StoryDirector {
  private game: Game
  private scene: THREE.Scene
  private chapter = 0          // 0..5
  private markers: Marker[] = []
  private dialogueLine = -1
  private dialogueT = 0
  /** seconds left on the active timer (0 = none) */
  private timer = 0
  /** chapter progress (text) */
  private progress = ''
  private objective = ''
  private holdT = 0            // time holding E on an objective
  private holdTarget: Marker | null = null
  private startedAt = 0
  private kills = 0
  private lastKillId = 0
  private bossSpawned = false
  private bossDead = false
  /** chapter truly active (its cinematic already finished) */
  private chapterLive = false
  private finished = false
  private beaconMat!: THREE.MeshBasicMaterial

  constructor(game: Game) {
    this.game = game
    this.scene = game.getStoryScene()
  }

  /** access to scene/state — the engine calls this at start */
  begin(): void {
    useGame.getState().setStory({ active: true, chapter: 1, status: 'playing' })
    this.startedAt = performance.now()
    this.setChapter(0, true)
  }

  // ----------------------------------------------------------
  // Chapters
  // ----------------------------------------------------------
  private setChapter(n: number, withCine: boolean): void {
    this.chapter = n
    this.scheduled = null
    this.clearMarkers()
    this.dialogueLine = -1
    this.timer = 0
    this.holdT = 0
    this.holdTarget = null
    this.chapterLive = false
    this.siegeDone = false
    this.siegeHalf = false
    this.siegeQuarter = false
    this.boomDone = false
    this.rescueFreed = false
    this.rescueDone = false
    this.bossSpawned = false
    this.bossDead = false
    const st = { chapter: n + 1, chapterTitle: CHAPTER_TITLES[n], timer: 0, progress: '', hint: '', objective: '' }

    // headline objective (refined when the chapter activates)
    const OBJECTIVES = [
      'Recover the 3 INTEL CACHES',
      'DEFEND the uplink until transfer completes',
      'SABOTAGE the 3 antennas (hold E)',
      'Free SERGEANT RIVERA',
      'Eliminate COL. VEGA',
      'Reach EXTRACTION before departure',
    ]
    this.objective = OBJECTIVES[n]
    st.objective = this.objective
    useGame.getState().setStory(st)

    if (withCine) {
      // chapter cinematic → when it ends (or is skipped) the chapter
      // activates. v7: LONG takes with dialogue and TWO battle fronts
      const c = CHAPTER_CINES[n]
      this.game.playStoryCine({
        points: c.points.map(p => new THREE.Vector3(...p)),
        looks: c.looks.map(p => new THREE.Vector3(...p)),
        dur: c.dur,
        title: 'OPERATION ASHFALL',
        subtitle: CHAPTER_PLACES[n],
        dialogues: CINE_DIALOGUES[n],
        battles: CINE_BATTLES[n],
        onDone: () => this.activateChapter(),
      })
    } else {
      this.activateChapter()
    }
  }

  /** truly starts the chapter: position, beacons, dialogue, net */
  private activateChapter(): void {
    const n = this.chapter
    this.chapterLive = true
    const cp = CHAPTER_START[n]
    this.game.setPlayerPos(cp.x, cp.z, cp.yaw)
    this.game.audio.roundStart()

    const st: Partial<ReturnType<typeof useGame.getState>['story']> = {}

    if (n === 0) {
      this.spawnMarkers(STORY_INTEL, 0xd9a05b)
      this.nextDialogue()
      st.progress = '0 / 3'
      st.timer = 0
    } else if (n === 1) {
      this.spawnMarkers([STORY_UPLINK], 0x4ade80)
      this.timer = 240            // 4 minutes of siege
      this.nextDialogue()
      st.timer = 240
      // survival reward: an AR-47 for the rest of the mission
      this.game.net.sendStoryCmd({ cmd: 'give', weapon: 'ar47' })
    } else if (n === 2) {
      this.spawnMarkers(STORY_ANTENNAS, 0xf87171)
      this.nextDialogue()
      st.progress = '0 / 3'
    } else if (n === 3) {
      this.spawnMarkers([STORY_PRISONER], 0x60a5fa)
      this.nextDialogue()
      st.progress = 'CAPTIVE'
    } else if (n === 4) {
      this.objective = 'Eliminate COL. VEGA'
      this.game.net.sendStoryCmd({ cmd: 'boss' })
      this.nextDialogue()
      st.progress = 'HIGH-VALUE TARGET'
    } else {
      // chapter 6: timed extraction
      this.timer = 150
      this.spawnMarkers([STORY_EXTRACTION], 0x4ade80)
      this.nextDialogue()
      st.timer = 150
      this.objective = 'EXTRACTION at the north helipad'
      st.objective = this.objective
      this.game.audio.announceDing()
    }
    useGame.getState().setStory(st)
  }

  private completeChapter(): void {
    if (this.chapter >= N_CHAPTERS - 1) return
    this.nextDialogue()
    this.game.audio.roundEnd()
    this.setChapter(this.chapter + 1, true)
  }

  // ----------------------------------------------------------
  // Objective beacons
  // ----------------------------------------------------------
  private spawnMarkers(objs: StoryObjective[], color: number): void {
    this.beaconMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false })
    for (const o of objs) this.spawnMarker(o)
  }

  private spawnMarker(o: StoryObjective): void {
    const group = new THREE.Group()
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 26, 10, 1, true),
      this.beaconMat,
    )
    beam.position.y = 13
    group.add(beam)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.5, 28),
      new THREE.MeshBasicMaterial({ color: this.beaconMat.color.getHex(), transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.06
    group.add(ring)
    const label = this.makeLabel(o.label)
    label.position.y = 2.6
    group.add(label)
    group.position.set(o.x, 0, o.z)
    this.scene.add(group)
    this.markers.push({ obj: o, group, beam, ring, label, done: false })
  }

  private makeLabel(text: string): THREE.Sprite {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 128
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'rgba(10,12,10,0.82)'
    ctx.fillRect(0, 34, 512, 60)
    ctx.strokeStyle = 'rgba(217,160,91,0.9)'
    ctx.lineWidth = 3
    ctx.strokeRect(0, 34, 512, 60)
    ctx.font = 'bold 40px "Arial Narrow", Arial, sans-serif'
    ctx.fillStyle = '#ffe9c4'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 66)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
    sprite.scale.set(7.5, 1.9, 1)
    return sprite
  }

  private clearMarkers(): void {
    for (const m of this.markers) {
      this.scene.remove(m.group)
      m.label.material.dispose()
      ;(m.ring.material as THREE.Material).dispose()
    }
    this.markers.length = 0
    this.beaconMat?.dispose()
  }

  /** markers for the minimap (the engine draws them) */
  minimapMarkers(): { x: number; z: number; color: string }[] {
    const out: { x: number; z: number; color: string }[] = []
    for (const m of this.markers) {
      if (m.done) continue
      out.push({ x: m.obj.x, z: m.obj.z, color: '#ffb547' })
    }
    return out
  }

  // ----------------------------------------------------------
  // Radio dialogue
  // ----------------------------------------------------------
  private nextDialogue(): void {
    const lines = RADIO[this.chapter]
    if (!lines) return
    this.dialogueLine++
    if (this.dialogueLine >= lines.length) { this.dialogueLine = lines.length - 1; return }
    useGame.getState().setStory({ dialogue: lines[this.dialogueLine] })
    this.dialogueT = 6.5
  }

  // ----------------------------------------------------------
  // Main loop
  // ----------------------------------------------------------

  update(dt: number, t: number): void {
    if (this.finished) return
    const st = useGame.getState()
    if (st.phase !== 'playing' && st.phase !== 'dead') return
    // during the cinematic the chapter does not advance (the player
    // cannot move): invulnerable while unable to act
    // deferred transition (immune to setTimeout throttling)
    if (this.scheduled && performance.now() >= this.scheduled.at) {
      const fn = this.scheduled.fn
      this.scheduled = null
      fn()
    }
    if (st.cineActive) {
      if (!this.cineProtected) {
        this.cineProtected = true
        // v7: protection covers the (longer) cinematic + margin
        const cineDur = CHAPTER_CINES[this.chapter]?.dur ?? 12
        this.game.net.sendStoryCmd({ cmd: 'protect', count: cineDur + 8 })
      }
      return
    }
    this.cineProtected = false

    // on-screen dialogue
    if (this.dialogueT > 0) {
      this.dialogueT -= dt
      if (this.dialogueT <= 0) useGame.getState().setStory({ dialogue: null })
    }

    // beacons: pulse
    for (const m of this.markers) {
      if (m.done) continue
      const pulse = 0.35 + 0.3 * Math.sin(t * 3)
      ;(m.beam.material as THREE.MeshBasicMaterial).opacity = pulse
      const rs = 1 + 0.35 * Math.sin(t * 3)
      m.ring.scale.set(rs, rs, 1)
      m.label.position.y = 2.6 + 0.18 * Math.sin(t * 2)
    }

    // stats
    const kills = this.countKills()
    const time = (performance.now() - this.startedAt) / 1000

    if (!this.chapterLive) return

    // ---- per-chapter logic ----
    if (this.chapter === 0) this.updateIntel(dt)
    else if (this.chapter === 1) this.updateSiege(dt)
    else if (this.chapter === 2) this.updateSabotage(dt)
    else if (this.chapter === 3) this.updateRescue(dt)
    else if (this.chapter === 4) this.updateBoss(dt)
    else this.updateExtraction(dt)

    // visible timer
    const timer = Math.ceil(Math.max(0, this.timer))
    useGame.getState().setStory({
      timer,
      stats: { time: Math.round(time), kills },
    })
  }

  /** Ch 1: walking up to the beacons collects them */
  private updateIntel(dt: number): void {
    void dt
    let done = 0
    for (const m of this.markers) {
      if (m.done) { done++; continue }
      if (this.game.dead) break
      const d = Math.hypot(this.game.pos.x - m.obj.x, this.game.pos.z - m.obj.z)
      if (d < 2.6) {
        m.done = true
        this.scene.remove(m.group)
        this.game.audio.pickup(false)
        this.game.audio.announceDing()
        done++
        this.progress = `${done} / 3`
        useGame.getState().setStory({ progress: this.progress })
        this.nextDialogue()
        // chapter 1: deliver an MP-9 for the siege
        if (done === 1) this.game.net.sendStoryCmd({ cmd: 'give', weapon: 'mp9' })
        if (done === 3) {
          this.schedule(1.4, () => this.completeChapter())
        }
      }
    }
  }

  /** Ch 2: survive 240 s near the uplink */
  private updateSiege(dt: number): void {
    const up = this.markers[0]
    this.timer = Math.max(0, this.timer - dt)
    const d = up ? Math.hypot(this.game.pos.x - up.obj.x, this.game.pos.z - up.obj.z) : 0
    const far = d > 26
    useGame.getState().setStory({
      hint: far ? 'GET BACK TO THE UPLINK! The transfer pauses if you leave' : '',
      timer: Math.ceil(this.timer),
    })
    // waves: enemies converge on the uplink every 26 s (v7: slower,
    // fewer bodies — the siege is about pressure, not a wall of meat)
    if (t1000() - this.siegeWaveAt > 26000) {
      this.siegeWaveAt = t1000()
      this.game.net.sendStoryCmd({ cmd: 'attack', x: STORY_UPLINK.x, z: STORY_UPLINK.z })
    }
    if (far) return      // the timer does not advance away from the uplink
    const half = this.timer < 120
    const quarter = this.timer < 60
    if (half && !this.siegeHalf) {
      this.siegeHalf = true
      this.nextDialogue()
      this.game.net.sendStoryCmd({ cmd: 'reinforce', count: 1 })
    }
    if (quarter && !this.siegeQuarter) {
      this.siegeQuarter = true
      this.nextDialogue()
      this.game.net.sendStoryCmd({ cmd: 'reinforce', count: 1 })
    }
    if (this.timer <= 0 && !this.siegeDone) {
      this.siegeDone = true
      this.schedule(1.2, () => this.completeChapter())
    }
  }

  private siegeHalf = false
  private siegeQuarter = false
  private siegeDone = false
  private siegeWaveAt = 0

  /** Ch 3: hold E next to each antenna */
  private updateSabotage(dt: number): void {
    const code = this.game.bindCode('zipline') || 'KeyE'
    const held = this.game.heldKeys().has(code)
    let done = 0
    let near: Marker | null = null
    for (const m of this.markers) {
      if (m.done) { done++; continue }
      const d = Math.hypot(this.game.pos.x - m.obj.x, this.game.pos.z - m.obj.z)
      if (d < 3.2) near = m
    }
    if (near) {
      if (held && !this.game.dead) {
        this.holdT += dt
        this.holdTarget = near
        if (this.holdT >= 2.5) {
          near.done = true
          this.scene.remove(near.group)
          this.holdT = 0
          this.holdTarget = null
          done++
          this.game.audio.reload('pump')
          this.game.audio.announceDing()
          this.nextDialogue()
          useGame.getState().setStory({ progress: `${done} / 3` })
          if (done === 3) {
            // explosion countdown
            this.timer = 45
            this.objective = 'GET CLEAR! Charges armed'
            useGame.getState().setStory({ objective: this.objective })
          }
        }
      } else if (this.holdTarget === near) {
        this.holdT = Math.max(0, this.holdT - dt * 3)
      }
      const pct = Math.round((this.holdT / 2.5) * 100)
      useGame.getState().setStory({
        hint: this.holdT > 0.05 ? `PLANTING CHARGE… ${pct}%` : 'HOLD [E] TO PLANT THE CHARGE',
      })
    } else {
      this.holdT = 0
      this.holdTarget = null
      useGame.getState().setStory({ hint: '' })
    }
    // explosion phase: countdown and BOOM (once)
    if (this.timer > 0 && !this.boomDone) {
      this.timer = Math.max(0, this.timer - dt)
      useGame.getState().setStory({ timer: Math.ceil(this.timer) })
      if (this.timer <= 0) {
        this.boomDone = true
        for (const a of STORY_ANTENNAS) this.game.onGrenadeExplode([a.x, 1.5, a.z])
        this.game.audio.explosion(0)
        this.game.audio.roundEnd()
        this.schedule(1.6, () => this.completeChapter())
      }
    }
  }

  private boomDone = false

  /** Ch 4: free the prisoner (hold E) and survive the alarm 75 s */
  private rescueFreed = false
  private rescueDone = false

  private updateRescue(dt: number): void {
    const code = this.game.bindCode('zipline') || 'KeyE'
    const held = this.game.heldKeys().has(code)

    if (!this.rescueFreed) {
      const m = this.markers[0]
      if (!m || m.done) return
      const d = Math.hypot(this.game.pos.x - m.obj.x, this.game.pos.z - m.obj.z)
      if (d < 3.4) {
        if (held && !this.game.dead) {
          this.holdT += dt
          if (this.holdT >= 3.0) {
            this.rescueFreed = true
            m.done = true
            this.scene.remove(m.group)
            this.holdT = 0
            this.timer = 75          // alarm: survive while Rivera runs
            this.nextDialogue()
            this.objective = 'SURVIVE the alarm while Rivera escapes'
            useGame.getState().setStory({ objective: this.objective, progress: 'MAX ALERT', timer: 75 })
            this.game.audio.announceDing()
            // v7: 2 guards answer the alarm (before: 4 — too many)
            this.game.net.sendStoryCmd({ cmd: 'reinforce', count: 2 })
          }
        } else {
          this.holdT = Math.max(0, this.holdT - dt * 3)
        }
        const pct = Math.round((this.holdT / 3.0) * 100)
        useGame.getState().setStory({
          hint: this.holdT > 0.05 ? `OPENING THE CELL… ${pct}%` : 'HOLD [E] TO FREE THE PRISONER',
        })
      } else {
        this.holdT = 0
        useGame.getState().setStory({
          hint: `PRISONER AT ${Math.round(d)} m · reach the cell and hold [E]`,
        })
      }
      return
    }

    // alarm phase: clock with one final push and constant pressure
    this.timer = Math.max(0, this.timer - dt)
    useGame.getState().setStory({ timer: Math.ceil(this.timer) })
    if (t1000() - this.rescueWaveAt > 30000) {
      this.rescueWaveAt = t1000()
      this.game.net.sendStoryCmd({ cmd: 'attack', x: STORY_PRISONER.x, z: STORY_PRISONER.z })
    }
    if (this.timer < 30 && !this.rescueReinforced) {
      this.rescueReinforced = true
      this.game.net.sendStoryCmd({ cmd: 'reinforce', count: 1 })
    }
    if (this.timer <= 0 && !this.rescueDone) {
      this.rescueDone = true
      useGame.getState().setStory({ hint: '', progress: '' })
      this.schedule(1.2, () => this.completeChapter())
    }
  }

  private rescueReinforced = false
  private rescueWaveAt = 0
  /** protection sent to the sim during the current cinematic */
  private cineProtected = false
  /** deferred action (chapter transitions: frame-driven, immune to
   *  setTimeout throttling in hidden tabs) */
  private scheduled: { at: number; fn: () => void } | null = null

  private schedule(delayS: number, fn: () => void): void {
    this.scheduled = { at: performance.now() + delayS * 1000, fn }
  }

  /** Ch 5: the boss */
  private updateBoss(dt: number): void {
    void dt
    if (!this.bossSpawned) {
      this.bossSpawned = true
      return
    }
    if (!this.bossDead) {
      // the killfeed reports when Vega falls
      const feed = useGame.getState().killfeed
      for (const k of feed) {
        if (k.id > this.lastKillId) {
          this.lastKillId = k.id
          if (k.victim === 'Col. Vega') {
            this.bossDead = true
            this.nextDialogue()
            this.schedule(2.6, () => this.completeChapter())
          }
        }
      }
    }
  }

  /** Ch 6: timed extraction */
  private updateExtraction(dt: number): void {
    this.timer = Math.max(0, this.timer - dt)
    const d = Math.hypot(this.game.pos.x - STORY_EXTRACTION.x, this.game.pos.z - STORY_EXTRACTION.z)
    useGame.getState().setStory({
      timer: Math.ceil(this.timer),
      hint: `EXTRACTION AT ${Math.round(d)} m`,
    })
    if (d < 4.5 && !this.finished) {
      this.finished = true
      this.nextDialogue()
      const time = Math.round((performance.now() - this.startedAt) / 1000)
      useGame.getState().setStory({
        hint: '',
        timer: 0,
        stats: { time, kills: this.countKills() },
      })
      this.game.audio.roundEnd()
      // final cinematic: orbit of the helipad → victory screen
      this.game.net.sendStoryCmd({ cmd: 'protect', count: 30 })
      this.game.playStoryCine({
        points: CHAPTER_CINES[5].points.map(p => new THREE.Vector3(...p)),
        looks: CHAPTER_CINES[5].looks.map(p => new THREE.Vector3(...p)),
        dur: 22,
        title: 'OPERATION ASHFALL',
        subtitle: 'MISSION COMPLETE · HERO OF THE VALLEY',
        dialogues: [
          { at: 1.2, who: 'PILOT', text: 'Vulture 2-1 lifting! Operator aboard — get us out of here!' },
          { at: 5.4, who: 'RED', text: 'The whole complex is burning. Six hours ago it was just a quiet valley.' },
          { at: 9.6, who: 'RIVERA', text: 'The valley owes you one, Operator. The resistance does not forget.' },
          { at: 13.8, who: 'VEGA', text: 'This… changes nothing. There are a hundred valleys like this one.' },
          { at: 17.4, who: 'COMMAND', text: 'Operation Ashfall complete. Shake off the dust, hero. You earned it.' },
        ],
        battles: [
          { cx: 0, cz: -44, yaw: 0, count: 4 },
          { cx: 22, cz: -58, yaw: Math.PI / 2, count: 3 },
        ],
        onDone: () => {
          useGame.getState().setStory({ status: 'victory', dialogue: null })
        },
      })
      return
    }
    if (this.timer <= 0 && !this.finished) {
      // the helicopter left: repeat chapter 6 (no cinematic)
      this.finished = false
      useGame.getState().addAnnouncement('The helicopter left without you… retrying extraction', 'info')
      this.game.audio.announceDing()
      this.setChapter(5, false)
    }
  }

  // ----------------------------------------------------------
  // Engine events
  // ----------------------------------------------------------
  onSnapshot(snap: NetSnapshot): void {
    void snap
  }

  /** the player died: the current chapter restarts without cinematic */
  onPlayerDeath(): void {
    if (this.finished) return
    this.game.audio.announceDing()
    // the server respawn takes 3 s → restart right after
    this.schedule(3.6, () => {
      if (this.finished) return
      useGame.getState().addAnnouncement('MISSION: restarting current chapter', 'info')
      // inventory is kept (v5); restart only the chapter
      this.setChapter(this.chapter, false)
    })
  }

  dispose(): void {
    this.clearMarkers()
    useGame.getState().setStory({ active: false, dialogue: null, hint: '' })
  }

  private countKills(): number {
    const me = useGame.getState().playerName
    let kills = 0
    const feed = useGame.getState().killfeed
    for (const k of feed) if (k.killer === me) kills++
    return this.kills + kills
  }
}
