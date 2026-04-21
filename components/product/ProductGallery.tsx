"use client";

import Image from "next/image";
import { useState } from "react";

interface ProductGalleryProps {
  localImages: string[];
  alt: string;
}

export function ProductGallery({ localImages, alt }: ProductGalleryProps) {
  const images = localImages;

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
        <Image src={current} alt={alt} fill className="object-contain p-4" />
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
              <Image src={src} alt={`${alt} ${idx + 1}`} fill className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
