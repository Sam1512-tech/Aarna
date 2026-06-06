// Fake data for the FE dev to build against before the backend has products in the DB.
// Delete or stop importing once getProducts() returns real data.

import type { ProductWithVariants } from "@/lib/types";

const NOW = new Date();

export const MOCK_PRODUCTS: ProductWithVariants[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Linen Wrap Dress",
    slug: "linen-wrap-dress",
    description:
      "A breathable linen wrap dress with a self-tie sash and a relaxed midi length.",
    fabric: "100% Linen",
    washCare: "Dry clean only",
    basePrice: 4499,
    mrp: 4999,
    status: "active",
    categoryId: null,
    metadata: null,
    createdAt: NOW,
    updatedAt: NOW,
    category: null,
    variants: [
      {
        id: "v1",
        productId: "00000000-0000-0000-0000-000000000001",
        size: "S",
        color: "Sand",
        sku: "AARNA-LWD-S-SAND",
        price: 4499,
        stock: 4,
        weightGrams: 320,
        isActive: true,
        createdAt: NOW,
      },
      {
        id: "v2",
        productId: "00000000-0000-0000-0000-000000000001",
        size: "M",
        color: "Sand",
        sku: "AARNA-LWD-M-SAND",
        price: 4499,
        stock: 6,
        weightGrams: 340,
        isActive: true,
        createdAt: NOW,
      },
    ],
    images: [
      {
        id: "i1",
        productId: "00000000-0000-0000-0000-000000000001",
        variantColor: "Sand",
        url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        altText: "Linen Wrap Dress in Sand",
        sortOrder: 0,
      },
    ],
  },
];
