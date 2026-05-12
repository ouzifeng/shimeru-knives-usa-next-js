import type { Metadata } from "next";
import { queryProducts, getFilterOptions } from "@/lib/products";
import { ProductCard } from "@/components/product-card";

export const revalidate = 3600;
import { ProductFilters, MobileFilters } from "@/components/product-filters";
import { SortDropdown } from "@/components/sort-dropdown";
import { KnifeGuideCta } from "@/components/knife-guide-cta";
import {
  CategoryFaq,
  CategorySeoBody,
  CategoryIntroDisclosure,
} from "@/components/category-faq";
import { Pagination } from "@/components/pagination";
import { storeConfig } from "../../../store.config";
import { CATEGORY_SEO, ALL_PRODUCTS_SEO } from "@/content/category-seo";
import type { ProductFilter } from "@/lib/types";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const category = params.category;
  const search = params.search;
  const page = params.page ? parseInt(params.page) : 1;

  // Default = all-products SEO. Override per-category if we have hand-written
  // copy in CATEGORY_SEO; otherwise fall back to a slug-derived title.
  let title = ALL_PRODUCTS_SEO.title;
  let description = ALL_PRODUCTS_SEO.description;
  if (category) {
    const seo = CATEGORY_SEO[category];
    if (seo) {
      title = seo.title;
      description = seo.description;
    } else {
      const catName = category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      title = `${catName} Knives | ${storeConfig.name}`;
      description = `Shop ${catName} knives at ${storeConfig.name}. ${storeConfig.description}`;
    }
  }
  if (search) {
    title = `Search: ${search} | ${storeConfig.name}`;
    description = `Search results for "${search}" at ${storeConfig.name}.`;
  }

  const canonicalParams = new URLSearchParams();
  if (category) canonicalParams.set("category", category);
  if (search) canonicalParams.set("search", search);
  if (page > 1) canonicalParams.set("page", String(page));
  const qs = canonicalParams.toString();
  const canonical = `${storeConfig.url}/product${qs ? `?${qs}` : ""}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: storeConfig.name, type: "website" },
  };
}

function ProductListJsonLd({ products, total, page, category }: {
  products: { id: number; name: string; slug: string; price: number; images: any[] }[];
  total: number;
  page: number;
  category?: string;
}) {
  const listName = category
    ? category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "All Knives";

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    numberOfItems: total,
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: (page - 1) * 24 + i + 1,
      url: `${storeConfig.url}/product/${p.slug}`,
      name: p.name,
    })),
  };

  const breadcrumb: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: storeConfig.url },
      { "@type": "ListItem", position: 2, name: "Knives", item: `${storeConfig.url}/product` },
    ],
  };

  if (category) {
    breadcrumb.itemListElement.push({
      "@type": "ListItem",
      position: 3,
      name: listName,
      item: `${storeConfig.url}/product?category=${category}`,
    });
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </>
  );
}

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;

  const filters: ProductFilter = {
    search: params.search || undefined,
    category: params.category || undefined,
    stock_status: params.stock_status || undefined,
    on_sale: params.on_sale === "true" || undefined,
    sort: (params.sort as ProductFilter["sort"]) || undefined,
    page: params.page ? parseInt(params.page) : 1,
    per_page: 24,
  };

  const attributes: Record<string, string[]> = {};
  const tags: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("attr_") && value) {
      attributes[key.replace("attr_", "")] = [value];
    } else if (key.startsWith("tag_") && value) {
      const groupName = key.replace("tag_", "");
      tags[groupName] = [value];
    }
  }
  if (Object.keys(attributes).length) {
    filters.attributes = attributes;
  }
  if (Object.keys(tags).length) {
    filters.tags = tags;
  }

  const [{ products, total }, filterOptions] = await Promise.all([
    queryProducts(filters),
    getFilterOptions(),
  ]);

  const category = params.category;
  const catName = category
    ? category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  // Hand-written SEO content for this category (or the all-products default
  // when no category filter is applied). Null when this is a search results
  // page or an unknown category — in that case we skip the SEO blocks.
  const seoContent = params.search
    ? null
    : category
      ? CATEGORY_SEO[category] ?? null
      : ALL_PRODUCTS_SEO;
  const headingText = seoContent?.h1 ?? (catName ? `${catName} Knives` : "All Knives");

  return (
    <>
      <ProductListJsonLd
        products={products}
        total={total}
        page={filters.page || 1}
        category={params.category}
      />

      {/* Page header */}
      <div className="border-b border-border">
        <div className="container mx-auto px-4 lg:px-8 py-10">
          <p className="text-sm tracking-[0.25em] uppercase text-muted-foreground mb-2">
            {catName ? "Collection" : "Shop"}
          </p>
          <h1 className="font-serif text-4xl lg:text-5xl font-light">
            {headingText}
          </h1>
          {seoContent && (
            <CategoryIntroDisclosure
              label={seoContent.disclosureLabel}
              intro={seoContent.intro}
            />
          )}
          {params.search && (
            <p className="text-sm text-muted-foreground mt-2">
              Showing results for &ldquo;{params.search}&rdquo;
            </p>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
        <div className="flex gap-8 lg:gap-12">
          <aside className="w-56 shrink-0 hidden lg:block">
            <ProductFilters options={filterOptions} />
          </aside>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-6 lg:mb-8 gap-4">
              <p className="text-base text-muted-foreground">{total} {total === 1 ? "knife" : "knives"}</p>
              <div className="flex items-center gap-3">
                <SortDropdown />
                <MobileFilters options={filterOptions} />
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {products.map((product, i) => (
                <ProductCard key={product.id} product={product} priority={i < 6} />
              ))}
            </div>
            <Pagination total={total} perPage={24} currentPage={filters.page || 1} />
            {products.length === 0 && (
              <div className="text-center py-20">
                <p className="font-serif text-2xl text-muted-foreground mb-2">No knives found</p>
                <p className="text-sm text-muted-foreground">Try adjusting your filters or search terms.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {seoContent && <CategorySeoBody body={seoContent.seoBody} />}
      <KnifeGuideCta />
      {seoContent && <CategoryFaq faqs={seoContent.faqs} />}
    </>
  );
}
