"use client";

import { useRouter } from "next/navigation";
import { ProductDetail } from "@/components/ProductDetail";
import type { Product } from "@/lib/types";

export function ProductPageClient({ product }: { product: Product }) {
  const router = useRouter();

  return (
    <div className="h-dvh w-full bg-paper">
      <ProductDetail
        productId={product.id}
        initialProduct={product}
        onBack={() => router.push("/products")}
        onBuildOutfit={(productId) => router.push(`/outfit/${productId}`)}
      />
    </div>
  );
}
