import fs from 'fs'
const ZAI = (await import('z-ai-web-dev-sdk')).default
const b64 = fs.readFileSync('scripts/v135-05-3rdperson-weapon.png').toString('base64')
const zai = await ZAI.create()
const r = await zai.chat.completions.create({
  messages: [
    { role: 'user', content: [
      { type: 'text', text: 'Describe this game screenshot briefly: Is there a 3rd-person soldier character visible from behind (golden/tan uniform) holding a rifle? Is there terrain, buildings or trees? Answer in 2-3 short sentences.' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
    ]},
  ],
})
console.log(r.choices[0].message.content)
