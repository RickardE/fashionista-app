"use client";

import { use } from "react";
import { Modal } from "@/components/Modal";
import { ProductDetail } from "@/components/ProductDetail";

export default function InterceptedProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <Modal>
      {(close) => (
        <ProductDetail
          productId={id}
          onBack={() => close()}
          onBuildOutfit={(productId) => close(`/outfit/${productId}`)}
        />
      )}
    </Modal>
  );
}
