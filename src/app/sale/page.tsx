import type { Metadata } from "next";
import { queryProducts } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import { KnifeGuideCta } from "@/components/knife-guide-cta";
import { Pagination } from "@/components/pagination";
import { storeConfig } from "../../../store.config";
import type { ProductFilter } from "@/lib/types";
import { SortSelect } from "./sort-select";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Sale | ${storeConfig.name}`,
  description: `Shop sale items at ${storeConfig.name}. Great deals on Japanese chef knives.`,
  openGraph: {
    title: `Sale | ${storeConfig.name}`,
    description: `Shop sale items at ${storeConfig.name}. Great deals on Japanese chef knives.`,
    siteName: storeConfig.name,
    type: "website",
  },
};

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function SalePage({ searchParams }: Props) {
  const params = await searchParams;
  const page = params.page ? parseInt(params.page) : 1;
  const sort = (params.sort as ProductFilter["sort"]) || "newest";

  const { products, total } = await queryProducts({
    on_sale: true,
    sort,
    page,
    per_page: 24,
  });

  return (
    <>
      {/* Page header */}
      <div className="border-b border-border">
        <div className="container mx-auto px-4 lg:px-8 py-10">
          <p className="text-sm tracking-[0.25em] uppercase text-muted-foreground mb-2">
            Limited Time
          </p>
          <h1 className="font-serif text-4xl lg:text-5xl font-light">Sale</h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Save on selected Japanese knives while stocks last.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
        <div className="flex items-center justify-between mb-6 lg:mb-8 gap-4">
          <p className="text-base text-muted-foreground">
            {total} {total === 1 ? "item" : "items"} on sale
          </p>
          <SortSelect current={sort} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <Pagination total={total} perPage={24} currentPage={page} basePath="/sale" />

        {products.length === 0 && (
          <div className="text-center py-20">
            <p className="font-serif text-2xl text-muted-foreground mb-2">No sale items right now</p>
            <p className="text-sm text-muted-foreground">
              Check back soon — we regularly add new deals.
            </p>
          </div>
        )}
      </div>

      <KnifeGuideCta />
    </>
  );
}
