'use client';

import { motion } from 'motion/react';
import { SafeImage as Image } from '@/components/ui/safe-image';
import { EASE_OUT, useMotionScale } from '@/lib/motion';
import { cn } from '@/lib/format';

/**
 * Large-image reveal: a clip-path wipe the first time the image scrolls into view.
 * Reserved for big editorial images; text and cards don't animate on scroll.
 */
export function RevealImage({
  src, alt, sizes, className, imgClassName, priority,
}: { src: string; alt: string; sizes: string; className?: string; imgClassName?: string; priority?: boolean }) {
  const m = useMotionScale();
  return (
    <motion.div
      className={cn('media-fallback relative overflow-hidden', className)}
      initial={m ? { clipPath: 'inset(12% 0% 0% 0%)' } : false}
      whileInView={{ clipPath: 'inset(0% 0% 0% 0%)' }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 1.2, ease: EASE_OUT }}
    >
      <motion.div
        className="absolute inset-0"
        initial={m ? { scale: 1 + 0.08 * m } : false}
        whileInView={{ scale: 1 }}
        viewport={{ once: true, margin: '-10% 0px' }}
        transition={{ duration: 1.6, ease: EASE_OUT }}
      >
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={cn('object-cover', imgClassName)} />
      </motion.div>
    </motion.div>
  );
}
