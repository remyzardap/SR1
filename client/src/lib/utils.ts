import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "IDR"): string {
  if (currency === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function statusColor(status: string): string {
  switch (status) {
    case "approved": return "text-green-700 border-green-200 bg-green-50";
    case "needs_review": return "text-amber-700 border-amber-200 bg-amber-50";
    case "rejected": return "text-red-700 border-red-200 bg-red-50";
    case "auto": return "text-blue-700 border-blue-200 bg-blue-50";
    default: return "text-gray-700 border-gray-200 bg-gray-50";
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "needs_review": return "Review";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "auto": return "Auto";
    default: return status;
  }
}

export const RECEIPT_CATEGORIES = [
  "food", "transport", "utilities", "supplies", "equipment", "services", "other"
];

export const PAYMENT_METHODS = ["cash", "transfer", "card", "other"];
