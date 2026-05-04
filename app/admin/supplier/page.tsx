import Link from "next/link";

export default function SupplierAppPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">SSD база</h1>
          <p className="mt-1 text-sm text-slate-500">
            Встроенный просмотр SSD-приложения прямо в админке.
          </p>
        </div>
        <Link
          href="/ssd"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Открыть в новой вкладке
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <iframe
          src="/ssd"
          title="SSD Supplier App"
          className="h-[calc(100vh-240px)] min-h-[640px] w-full"
        />
      </div>
    </div>
  );
}
