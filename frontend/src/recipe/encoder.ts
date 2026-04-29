import type { RecipePoint } from "../types";

/**
 * Recipes live entirely in URL state (#r=<base64>) per spec §9.
 * We encode the array as base64-url to keep the hash short.
 */

function toBase64Url(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (s.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export function encodeRecipes(recipes: RecipePoint[]): string {
  if (!recipes.length) return "";
  return toBase64Url(JSON.stringify(recipes));
}

export function decodeRecipes(encoded: string): RecipePoint[] {
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(fromBase64Url(encoded));
    if (!Array.isArray(parsed)) return [];
    return parsed as RecipePoint[];
  } catch {
    return [];
  }
}

export function readRecipesFromHash(): RecipePoint[] {
  if (typeof window === "undefined") return [];
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return decodeRecipes(params.get("r") ?? "");
}

export function writeRecipesToHash(recipes: RecipePoint[]): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (recipes.length) {
    params.set("r", encodeRecipes(recipes));
  } else {
    params.delete("r");
  }
  const next = params.toString();
  window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname);
}
