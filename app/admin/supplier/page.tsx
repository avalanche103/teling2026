import Link from "next/link";

const PROXY_PATH = "/admin/supplier/proxy";

export default function SupplierAppPage() {
  const supplierAppUrl = PROXY_PATH;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">SSD база поставщика</h1>
        <p className="mt-1 text-sm text-slate-500">
          Это локальное Flask-приложение в папке проекта ssd-admin-app. Откройте его в новой вкладке или работайте прямо в окне ниже.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          URL приложения в этом сайте: <span className="font-mono text-slate-800">{supplierAppUrl}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Открывается через прокси Next.js на localhost:3000. Backend по-прежнему нужно запустить командой npm run ssd:start
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={supplierAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Открыть SSD приложение
          </Link>
          <Link
            href={`${supplierAppUrl}/sections`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Открыть разделы
          </Link>
          <Link
            href={`${supplierAppUrl}/products`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Открыть товары
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <iframe
          src={supplierAppUrl}
          title="SSD catalog management"
          className="h-[75vh] w-full"
        />
      </div>
    </div>
  );
}
