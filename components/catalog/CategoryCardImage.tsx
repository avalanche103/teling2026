"use client";

import Image from "next/image";
import { useState } from "react";

interface CategoryCardImageProps {
  initialSrc: string | null;
  fallbackSrc: string | null;
  alt: string;
}

export function CategoryCardImage({
  initialSrc,
  fallbackSrc,
  alt,
}: CategoryCardImageProps) {
  const [src, setSrc] = useState<string | null>(initialSrc);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-full items-end justify-center pb-3 text-sm text-slate-400">
        Категория
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
      className="object-contain object-bottom transition duration-300 group-hover:scale-105"
      onError={() => {
        if (fallbackSrc && src !== fallbackSrc) {
          setSrc(fallbackSrc);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
