"use client";

import { useMemo, useState } from "react";
import type { ProductCharGroup } from "@/lib/types";

interface ProductCharacteristicsProps {
  groups: ProductCharGroup[];
  heightPx?: number;
}

function pickDefaultGroupIndex(groups: ProductCharGroup[]): number {
  const mainIndex = groups.findIndex((group) =>
    group.name.toLowerCase().includes("основ"),
  );
  return mainIndex >= 0 ? mainIndex : 0;
}

export function ProductCharacteristics({
  groups,
  heightPx,
}: ProductCharacteristicsProps) {
  const safeGroups = useMemo(
    () => groups.filter((group) => group.items.length > 0),
    [groups],
  );
  const [activeIndex, setActiveIndex] = useState(() => pickDefaultGroupIndex(safeGroups));

  if (safeGroups.length === 0) {
    return null;
  }

  const activeGroup = safeGroups[activeIndex] ?? safeGroups[0];

  return (
    <div
      className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 lg:h-[var(--details-height)]"
      style={
        heightPx
          ? ({ "--details-height": `${heightPx}px` } as { [key: string]: string })
          : undefined
      }
    >
      <h2 className="mb-4 text-lg font-bold text-black">Характеристики</h2>

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        {safeGroups.map((group, idx) => {
          const active = idx === activeIndex;
          return (
            <button
              key={`${group.name}-${idx}`}
              onClick={() => setActiveIndex(idx)}
              className={active
                ? "font-semibold text-black underline"
                : "text-black/70 underline decoration-dotted hover:text-black"
              }
            >
              {group.name}
            </button>
          );
        })}
      </div>

      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-black/70">
        {activeGroup.name}
      </h3>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <tbody>
            {activeGroup.items.map((item, itemIdx) => (
              <tr key={`${item.name}-${itemIdx}`} className="odd:bg-slate-100/80">
                <td className="w-1/2 border-b border-slate-200 px-3 py-2 text-black/80">
                  {item.name}
                </td>
                <td className="border-b border-slate-200 px-3 py-2 font-medium text-black">
                  {item.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
