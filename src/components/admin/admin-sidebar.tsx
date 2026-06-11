"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

export type AdminTab =
  | "dashboard"
  | "orders"
  | "abandoned"
  | "customers"
  | "products"
  | "inventory"
  | "supplier-prices"
  | "funnel"
  | "returns"
  | "waiting-stock"
  | "ambassadors"
  | "affiliates"
  | "support"
  | "email-logs"
  | "email-templates"
  | "email-marketing";

type Props = {
  activeTab: AdminTab;
  onChange: (tab: AdminTab) => void;
  pendingSupportCount: number;
};

type NavItem =
  | { kind: "item"; key: AdminTab; label: string }
  | { kind: "group"; label: string; children: Array<{ key: AdminTab; label: string }> };

const NAV_ITEMS: NavItem[] = [
  { kind: "item", key: "dashboard", label: "Dashboard" },
  { kind: "item", key: "orders", label: "Orders" },
  { kind: "item", key: "abandoned", label: "Abandoned" },
  { kind: "item", key: "customers", label: "Customers" },
  { kind: "item", key: "products", label: "Products" },
  { kind: "item", key: "inventory", label: "Inventory" },
  { kind: "item", key: "supplier-prices", label: "Supplier Prices" },
  { kind: "item", key: "funnel", label: "Funnel" },
  { kind: "item", key: "returns", label: "Returns" },
  { kind: "item", key: "waiting-stock", label: "Waiting Stock" },
  { kind: "item", key: "ambassadors", label: "Ambassadors" },
  { kind: "item", key: "affiliates", label: "Affiliates" },
  { kind: "item", key: "support", label: "Support" },
  {
    kind: "group",
    label: "Email",
    children: [
      { key: "email-logs", label: "Logs" },
      { key: "email-templates", label: "Templates" },
      { key: "email-marketing", label: "Marketing" },
    ],
  },
];

export function AdminSidebar({ activeTab, onChange, pendingSupportCount }: Props) {
  // A group is "open" if user expanded it OR if it contains the active tab
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <aside className="md:sticky md:top-4 md:self-start">
      <h1 className="mb-3 px-3 text-lg font-semibold tracking-tight">Admin</h1>
      <nav className="space-y-0.5">
        {NAV_ITEMS.map((item) => {
          if (item.kind === "item") {
            const active = activeTab === item.key;
            const badge =
              item.key === "support" && pendingSupportCount > 0 ? pendingSupportCount : null;
            return (
              <button
                key={item.key}
                onClick={() => onChange(item.key)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <span className="flex-1">{item.label}</span>
                {badge != null && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
                    {badge}
                  </span>
                )}
              </button>
            );
          }

          const containsActive = item.children.some((c) => c.key === activeTab);
          const open = openGroups.has(item.label) || containsActive;
          return (
            <div key={item.label}>
              <button
                onClick={() => toggleGroup(item.label)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  containsActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <span className="flex-1">{item.label}</span>
                <ChevronRight
                  className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
                />
              </button>
              {open && (
                <div className="mt-0.5 ml-3 space-y-0.5 border-l pl-2">
                  {item.children.map((child) => {
                    const active = activeTab === child.key;
                    return (
                      <button
                        key={child.key}
                        onClick={() => onChange(child.key)}
                        className={`flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                          active
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
