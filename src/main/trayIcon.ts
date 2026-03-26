import { nativeImage } from 'electron'

export function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="black" d="M4 17.5c2-2.8 3.6-4.2 4.8-4.2 1.5 0 2 3.4 3.7 3.4 1.1 0 2.5-1.5 4.2-4.5l3.3 1.8c-2.5 4.5-5 6.8-7.7 6.8-2.6 0-3.4-3.2-4.3-3.2-.6 0-1.5.9-2.8 2.7L4 17.5Z"/>
      <circle cx="8" cy="8" r="2.7" fill="black"/>
      <circle cx="16.5" cy="6.5" r="1.8" fill="black"/>
    </svg>
  `.trim()
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  )

  icon.setTemplateImage(true)
  return icon.resize({ width: 18, height: 18 })
}

