import type { ActiveFilters, ProductSort } from "@/lib/types";
import type { CatalogLayout } from "@/lib/catalog-query";

interface CategorySearchFormProps {
  search: string;
  active: ActiveFilters;
  sort?: ProductSort;
  layout?: CatalogLayout;
  viewAll?: boolean;
  className?: string;
}

export function CategorySearchForm({
  search,
  active,
  sort = "relevance",
  layout = "grid",
  viewAll = false,
  className = "w-full sm:w-96",
}: CategorySearchFormProps) {
  return (
    <form className={className} action="" method="get">
      {viewAll && <input type="hidden" name="view" value="all" />}
      {sort !== "relevance" && <input type="hidden" name="sort" value={sort} />}
      {layout === "list" && <input type="hidden" name="layout" value="list" />}
      {active.brands.map((brand) => (
        <input key={`brand-${brand}`} type="hidden" name="brand" value={brand} />
      ))}
      {active.priceMin !== null && (
        <input type="hidden" name="price_min" value={String(active.priceMin)} />
      )}
      {active.priceMax !== null && (
        <input type="hidden" name="price_max" value={String(active.priceMax)} />
      )}
      {Object.entries(active.charFilters).flatMap(([name, values]) =>
        values.map((value) => (
          <input
            key={`cf-${name}-${value}`}
            type="hidden"
            name={`cf_${name}`}
            value={value}
          />
        ))
      )}
      <input
        name="q"
        defaultValue={search}
        placeholder="Поиск в категории"
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-slate-400 transition focus:ring-2"
      />
    </form>
  );
}
