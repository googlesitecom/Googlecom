// v14.2: análisis visual de capturas (pose de descanso, avión, trincheras,
// mega market, arsenal, drop rediseñado)
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'node:fs'

const prompts: Record<string, string> = {
  'v142-01-lobby-rest.png': 'This is a video game lobby screen (Fortnite-style) with a 3D soldier standing on a platform, no weapon. Look at the soldier pose: are the ARMS RELAXED hanging down at his sides (rest pose, NOT a boxing guard, NOT arms raised, NOT fists at chest)? Are fingers relaxed? Legs natural stance? Overall: does the character read as standing AT REST/relaxed? Any pose glitches (arms clipping through torso, twisted limbs)?',
  'v142-03-plane-cine.png': 'Cinematic shot of a military cargo plane (C-130 style) flying in a game at dusk. Describe the plane: does it have a proper fuselage with raised upswept tail, high wing with 4 turboprop engines with propellers, tail fin, cockpit windows? Do you see an OPEN cargo ramp at the rear and a side jump door? Any red/green/white navigation lights? Does it look like a believable military transport aircraft? Any visual glitches (floating parts, missing geometry)?',
  'v142-04-trench.png': 'FPS game view at ground level. Describe the trench fortification: do you see SANDBAG parapet walls forming a trench corridor, wooden duckboards on the ground, dirt floor? Are there ammo crates or barrels inside? Does it read as a WWI/modern military TRENCH system? Any visual defects?',
  'v142-05-market.png': 'FPS game view of a building facade at dusk. Describe the building: does it look like a big supermarket/market hall with a wide entrance, orange awning/canopy over the door, rooftop units and skylights, a sign on the roof? Any visual defects (floating parts, missing walls)?',
  'v142-06-arsenal.png': 'FPS game view of a concrete building facade at dusk. Describe it: does it look like a military ammunition depot / bunker (thick concrete walls, big cargo portal/door, roof vents, lightning rod, loading dock)? Any visual defects?',
  'v142-07-drop.png': 'FPS game view looking up at the sky at dusk. Is there a military cargo plane flying AND a supply crate falling with a PARACHUTE above it? Describe the crate: is it an olive-green military box with amber bands and a wooden pallet underneath? Is the parachute canopy attached ABOVE the crate (not floating far from it)? Any visual glitches?',
  'v142-08-crate-landed.png': 'FPS game view at dusk. Is there a landed military supply crate on the ground with a vertical light beam marking it? Describe the crate: olive-green military box with amber reflective bands, dark straps, wooden air-drop pallet underneath? Is there an amber ring on the ground around it? Any visual defects?',
}

async function main(): Promise<void> {
  const files = process.argv.slice(2)
  const zai = await ZAI.create()
  for (const f of files) {
    const path = `scripts/${f}`
    if (!fs.existsSync(path)) { console.log(f, 'NO EXISTE'); continue }
    const b64 = fs.readFileSync(path).toString('base64')
    const prompt = prompts[f] ?? 'Describe this game screenshot. Any visual defects?'
    try {
      const res = await zai.chat.completions.createVision({
        model: 'glm-4.5v',
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          { type: 'text', text: prompt },
        ] }],
      })
      const txt = res.choices[0]?.message?.content ?? 'sin respuesta'
      console.log(`\n===== ${f} =====\n${txt}`)
    } catch (e) {
      console.log(`\n===== ${f} =====\nERROR: ${e}`)
    }
  }
}
main()
