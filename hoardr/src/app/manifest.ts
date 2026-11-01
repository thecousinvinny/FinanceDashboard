import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'Hoardr',
    short_name:       'Hoardr',
    description:      'Your personal finance hoard. Track every coin in the cave.',
    id:               '/home',
    start_url:        '/home',
    scope:            '/',
    display:          'standalone',
    orientation:      'portrait',
    background_color: '#080810',
    theme_color:      '#080810',
    // Each file really is the size it claims: browsers that installed the app
    // (desktop Chrome / Edge) skipped icons whose size didn't match and fell
    // back to a letter "H". Built from DARKICON.png — see public/icons.
    icons: [
      { src: '/icons/icon-192.png',     sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png',     sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
