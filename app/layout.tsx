import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3000',
  ),
  title: '完蛋！我被学习搭子包围了 / SBuddy',
  applicationName: '完蛋！我被学习搭子包围了',
  description: '读懂你的任务压力和精力状态，给出最小启动动作，再由像素搭子陪你完成。',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.svg' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '学习搭子',
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: '完蛋！我被学习搭子包围了',
    description: '它不会催你完成所有事情，只陪你迈出最小的一步。',
    images: [{ url: '/og.png', width: 1672, height: 941 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '完蛋！我被学习搭子包围了',
    description: '它不会催你完成所有事情，只陪你迈出最小的一步。',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#42664f',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
