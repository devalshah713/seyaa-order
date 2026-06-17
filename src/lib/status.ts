export const ORDER_STATUSES = [
  "NEW",
  "CONFIRMED",
  "IN_PRODUCTION",
  "QC",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  CONFIRMED: "Confirmed",
  IN_PRODUCTION: "In Production",
  QC: "Quality Check",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const STATUS_COLORS: Record<string, string> = {
  NEW: "#64748b",
  CONFIRMED: "#2563eb",
  IN_PRODUCTION: "#d97706",
  QC: "#7c3aed",
  SHIPPED: "#0891b2",
  DELIVERED: "#16a34a",
  CANCELLED: "#dc2626",
};
