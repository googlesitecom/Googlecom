// v13.4: análisis visual de capturas (escopeta, texturas, BR offline)
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'node:fs'

const prompts: Record<string, string> = {
  'v134-02-shotgun-hip.png': 'First-person FPS view. Describe the shotgun weapon model in the lower right: does it look like a detailed tactical pump-action shotgun (receiver, long barrel, magazine tube, ribbed pump handle, stock, sights, top rail, red shells on left side)? Realistic? Any floating parts, glitches or misaligned geometry?',
  'v134-03-shotgun-ads.png': 'First-person FPS view aiming down sights. Is the shotgun centered with the front bead sight and rear ring roughly on screen center? Does the weapon look aligned and realistic? Any glitch?',
  'v134-04-shotgun-zoom.png': 'Close-up of a tactical pump-action shotgun in a first-person FPS. Describe its parts: receiver, barrel, magazine tube, ribbed pump handle, stock with recoil pad, top rail, brass front sight, rear ring, red shells on the side saddle, trigger. Does it look detailed and realistic? Any glitch (floating parts, z-fighting, holes)?',
  'v134-04-textures.png': 'FPS game city map at dusk. Look at the ground textures: the SAND areas and the ASPHALT roads. Are they sharp and detailed (visible grain, cracks, texture detail) or blurry/washed out? Describe quality.',
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
      console.log(`${f}: ERROR ${e}`)
    }
  }
}
main()
