"use client";

import Image from "next/image";
import { useState } from "react";

interface ProductGalleryProps {
  localImages: string[];
  externalImages?: string[];
  alt: string;
}

function isExternalUrl(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://");
}

export function ProductGallery({ localImages, externalImages = [], alt }: ProductGalleryProps) {
  const images = [...localImages, ...externalImages];

  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-500">
        Изображение отсутствует
      </div>
    );
  }

  const current = images[active] ?? images[0];

  return (
    <div className="space-y-3">
      <div className="relative h-96 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isExternalUrl(current) ? (
          <img src={current} alt={alt} className="h-full w-full object-contain p-4" />
        ) : (
          <Image src={current} alt={alt} fill className="object-contain p-4" />
        )}
      </div>

      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-7">
          {images.map((src, idx) => (
            <button
              key={`${src}-${idx}`}
              onClick={() => setActive(idx)}
              className={`relative h-16 overflow-hidden rounded-lg border ${
                idx === active ? "border-slate-700" : "border-slate-200"
              }`}
            >
              {isExternalUrl(src) ? (
                <img src={src} alt={`${alt} ${idx + 1}`} className="h-full w-full object-cover" />
              ) : (
                <Image src={src} alt={`${alt} ${idx + 1}`} fill className="object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
