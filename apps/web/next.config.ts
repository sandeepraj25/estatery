import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

/**
 * Content Security Policy. Scripts come only from this site and Razorpay Checkout; frames only
 * from this site (the editor preview) and Razorpay; nothing can frame the site except itself.
 * Images may come from any https host because agencies use their own CDNs. Next's inline
 * bootstrap scripts need 'unsafe-inline' (no nonces, to keep pages cacheable at the edge).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com${dev ? ' ws: wss:' : ''}`,
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.openstreetmap.org",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a production build run beside the dev server (NEXT_DIST_DIR=.next-prod).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Self-contained server bundle for the Docker image. Vercel builds its own output, so skip it there.
  ...(process.env.VERCEL ? {} : { output: 'standalone' as const }),
  // Monorepo root (file path, so it also works on Windows).
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  poweredByHeader: false,
  transpilePackages: ['@estatery/shared'],
  images: {
    // Remote media goes through lib/image-loader.ts (Unsplash/Cloudinary resize via URL params).
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
  },
  async rewrites() {
    // Locally stored uploads are served by the API; production uses S3 + CDN URLs directly.
    return [{ source: '/media/:path*', destination: `${process.env.API_URL ?? 'http://127.0.0.1:4000'}/media/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com")' },
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
        ],
      },
    ];
  },
};

export default nextConfig;
