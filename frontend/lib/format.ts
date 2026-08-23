import { ethers } from "ethers";

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function truncateHash(hash: string, chars = 6): string {
  return truncateAddress(hash, chars);
}

const numberFormatter = new Intl.NumberFormat("en-IN");

export function formatNumber(value: number | string): string {
  return numberFormatter.format(typeof value === "string" ? Number(value) : value);
}

export function formatTonnes(value: number | string): string {
  return `${formatNumber(value)} tCO2e`;
}

/** Formats a smallest-unit (18-decimal) SimStablecoin amount as a whole-NKR figure. */
export function formatNKR(smallestUnits: string): string {
  return `₹${formatNumber(Math.round(Number(ethers.formatUnits(smallestUnits, 18))))}`;
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function formatDate(value: string | Date): string {
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
