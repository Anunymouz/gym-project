import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';
const apiUrl = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
// Production photos come from the media CDN (MEDIA_PUBLIC_URL); development photos are served
// by the API and reached through the /media rewrite below, so they stay same-origin.
const mediaOrigin = process.env.MEDIA_PUBLIC_URL ? new URL(process.env.MEDIA_PUBLIC_URL).origin : '';

// Static CSP (no nonces). The browser never calls the API directly: every API call is made by
// this server with the httpOnly session cookie, so connect-src stays 'self'.
// TODO: move to a nonce-based CSP via proxy.ts and drop 'unsafe-inline' for scripts.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${mediaOrigin ? ` ${mediaOrigin}` : ''} https://*.cloudflarestream.com`,
  // Videos: from the API/CDN in development, Cloudflare Stream (signed links) in production.
  `media-src 'self' blob:${mediaOrigin ? ` ${mediaOrigin}` : ''} https://*.cloudflarestream.com`,
  "font-src 'self'",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera (front-desk QR check-in) and location (pinning a new gym) for our own pages only; everything else is off.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=()' },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    // Gym photo uploads go through a server action (the browser shrinks big photos first).
    serverActions: { bodySizeLimit: '11mb' },
  },
  async rewrites() {
    return [{ source: '/media/:path*', destination: `${apiUrl}/v1/media/:path*` }];
  },
  reactStrictMode: true,
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
