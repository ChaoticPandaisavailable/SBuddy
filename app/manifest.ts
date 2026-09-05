import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '完蛋！我被学习搭子包围了',
    short_name: '学习搭子',
    description: '读懂压力与精力状态，陪你迈出最小一步的 AI 像素学习搭子',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f6ff',
    theme_color: '#8170ef',
    orientation: 'any',
    lang: 'zh-CN',
    categories: ['education', 'productivity'],
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
