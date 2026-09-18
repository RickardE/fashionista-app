"use client";

import { useRouter } from "next/navigation";
import { ProductDetail } from "@/components/ProductDetail";

export function ProductPageClient({ id }: { id: string }) {
  const router = useRouter();

  return (
    <div className="h-dvh w-full bg-paper">
      <ProductDetail productId={id} onBack={() => router.push("/discover")} />
    </div>
  );
}
