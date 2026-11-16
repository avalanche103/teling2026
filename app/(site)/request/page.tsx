import type { Metadata } from "next";
import { RequestPageClient } from "@/components/request/RequestPageClient";

export const metadata: Metadata = {
  title: "Запрос",
  description: "Оформление запроса на товары Teling.by",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RequestPage() {
  return <RequestPageClient />;
}
