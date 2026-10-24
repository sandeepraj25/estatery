'use client';

/**
 * next/image loader. Resizes at the CDN instead of on our Node server:
 * - Unsplash: rewrites the w/q params.
 * - Cloudinary: inserts a w_,q_auto,f_auto transformation.
 * - Anything else (local /public files): served as-is.
 */
export default function imageLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  const q = quality ?? 75;
  if (src.startsWith('https://images.unsplash.com/')) {
    const url = new URL(src);
    url.searchParams.set('w', String(width));
    url.searchParams.set('q', String(q));
    url.searchParams.set('auto', 'format');
    url.searchParams.set('fit', 'crop');
    return url.toString();
  }
  if (src.includes('res.cloudinary.com') && src.includes('/upload/')) {
    return src.replace('/upload/', `/upload/w_${width},q_auto,f_auto/`);
  }
  // Local uploads are already web-sized; the width hint lets the browser pick from srcset.
  if (src.startsWith('/media/')) return `${src}?w=${width}`;
  return src;
}
