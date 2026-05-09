import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'Hoardr',
    short_name:       'Hoardr',
    description:      'Your personal finance hoard. Track every coin in the cave.',
    start_url:        '/home',
    display:          'standalone',
    orientation:      'portrait',
    background_color: '#080810',
    theme_color:      '#080810',
    icons: [
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
      { src: '/apple-icon', sizes: '192x192', type: 'image/png' },
      { src: '/apple-icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
