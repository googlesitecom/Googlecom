// Analiza capturas con VLM (z-ai-web-dev-sdk) — verificación visual v6
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'node:fs'

const prompts: Record<string, string> = {
  'v6-01-boot.png': 'Describe esta pantalla: ¿es una pantalla de carga de un videojuego? ¿Qué elementos ves (barra de progreso, consejos, logotipo)? ¿Se ve bien?',
  'v6-02-menu.png': 'Describe este menú de videojuego: pestañas visibles, estilo visual (¿táctico sobrio o arcade?), colores. ¿Se ve correcto y detallado?',
  'v6-03-operacion.png': 'Describe este panel de campaña de un videojuego: ¿cuántos capítulos lista? ¿Qué mapa describe? ¿Duración estimada? ¿Se ve bien?',
  'v6-04-cine1.png': '¿Es una cinemática de videojuego? ¿Ves barras de cine negras arriba/abajo, título grande, subtítulo? ¿Qué escena 3D se ve (montañas, río, valle, pueblo)? ¿Se ve hermosa o con defectos?',
  'v6-05-cine1b.png': '¿Es una cinemática de videojuego en un valle al atardecer? Describe qué ves: ¿río, puente, pueblo, montañas al fondo, sol? ¿Barras de cine? ¿Se ve bien?',
  'v6-06-cap1.png': 'Captura de juego FPS en primera persona: ¿ves HUD de misión (capítulo, objetivo), balizas/marcadores amarillos, un arma en primera persona? ¿Qué escena se ve? ¿Errores visuales?',
  'v6-07-rio.png': 'Captura de FPS: ¿ves un río o lago con agua? ¿El agua se ve animada/reflejante o plana y fea? ¿Hay un puente de piedra? ¿Montañas alrededor?',
  'v6-08-pueblo.png': 'Captura de FPS en un pueblo al atardecer: ¿ves casas con tejados, plaza con fuente, farolas encendidas? ¿Iluminación bonita?',
  'v6-09-sky.png': 'Describe el cielo de esta captura: ¿degradado de atardecer suave? ¿sol con halo/resplandor? ¿nubes? ¿se ve realista o feo?',
  'v6-13-cine.png': '¿Es una cinemática de videojuego con barras de cine negras? ¿Título y subtítulo visibles? ¿Qué escena del valle se ve (río, puente, pueblo, montañas, atardecer)?',
  'v6-14-final-cine.png': '¿Es una cinemática final de videojuego orbitando un helipuerto? ¿Barras de cine, título? ¿Qué se ve?',
  'v6-15-victoria.png': '¿Es una pantalla de victoria de un modo historia? ¿Qué estadísticas muestra (tiempo, bajas, capítulos)? ¿Se ve completa y bien presentada?',
}

async function main(): Promise<void> {
  const files = process.argv.slice(2)
  const zai = await ZAI.create()
  for (const f of files) {
    const path = `scripts/${f}`
    if (!fs.existsSync(path)) { console.log(f, 'NO EXISTE'); continue }
    const b64 = fs.readFileSync(path).toString('base64')
    const prompt = prompts[f] ?? 'Describe esta captura de videojuego en detalle. ¿Se ve correcta? ¿Defectos?'
    try {
      const res = await zai.chat.completions.createVision({
        model: 'glm-4.5v',
        thinking: { type: 'disabled' },
        messages: [
          { role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ] },
        ],
      })
      const txt = res.choices?.[0]?.message?.content ?? ''
      console.log(`\n=== ${f} ===\n${String(txt).slice(0, 700)}`)
    } catch (e) {
      console.log(`\n=== ${f} === ERROR: ${String(e).slice(0, 200)}`)
    }
  }
}
void main()
