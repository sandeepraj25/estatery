'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

/**
 * next/image that disappears quietly if the file fails to load (expired or deleted media),
 * revealing the brand-toned `.media-fallback` surface behind it instead of a broken-image icon.
 */
export function SafeImage(props: ImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <Image {...props} alt={props.alt} onError={() => setFailed(true)} />;
}
