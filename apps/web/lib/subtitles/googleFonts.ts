"use client";

const FONTSOURCE_API = "https://api.fontsource.org/v1/fonts";
const GWFH_API = "https://gwfh.mranftl.com/api/fonts";

let cachedFamilies: string[] | null = null;
let cachedMeta: Array<{ family: string; subsets: string[] }> | null = null;
let fetchPromise: Promise<string[]> | null = null;

const familyToSubsets = new Map<string, string[]>();

const loadedFonts = new Set<string>();
const loadingFonts = new Map<string, Promise<void>>();

function isSystemFont(family: string): boolean {
  const f = family.trim();
  // system stacks contain comma, or generic families
  if (f.includes(",")) return true;
  const lower = f.toLowerCase();
  if (["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"].includes(lower)) return true;
  return false;
}

function googleFontHref(family: string): string {
  const encoded = family.trim().replace(/ +/g, "+");
  // lightweight 400 only, display swap to avoid FOIT
  return `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
}

export function ensureGoogleFontLoaded(family: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const clean = family.split(",")[0].trim().replace(/^["']|["']$/g, "");
  if (!clean || isSystemFont(family)) return Promise.resolve();
  if (loadedFonts.has(clean)) return Promise.resolve();
  const existing = loadingFonts.get(clean);
  if (existing) return existing;

  const p = (async () => {
    const href = googleFontHref(clean);
    let link = document.querySelector(`link[data-google-font="${clean}"]`) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-google-font", clean);
      document.head.appendChild(link);
    }
    // wait for CSS to load
    try {
      if (document.fonts && typeof document.fonts.load === "function") {
        // try to load, will trigger fetch of font file
        await document.fonts.load(`12px "${clean}"`);
        // also wait ready
        await document.fonts.ready;
      } else {
        // fallback wait for link load
        if (link.sheet === null) {
          await new Promise<void>((res) => {
            link!.addEventListener("load", () => res(), { once: true });
            link!.addEventListener("error", () => res(), { once: true });
            setTimeout(() => res(), 2500);
          });
        }
      }
    } catch {
      // ignore
    }
    loadedFonts.add(clean);
    loadingFonts.delete(clean);
  })();
  loadingFonts.set(clean, p);
  return p;
}

export interface GoogleFontMeta {
  family: string;
  subsets: string[];
}

export async function fetchGoogleFontsMeta(): Promise<GoogleFontMeta[]> {
  if (cachedMeta) return cachedMeta;
  // Try fontsource first (CORS *), then gwfh
  try {
    const r = await fetch(FONTSOURCE_API, { cache: "force-cache" });
    if (r.ok) {
      const data: Array<{ family: string; subsets?: string[]; type?: string }> = await r.json();
      const metas: GoogleFontMeta[] = data
        .filter((f) => !f.type || f.type === "google")
        .map((f) => ({ family: f.family, subsets: f.subsets ?? [] }))
        .filter((f) => !!f.family);
      if (metas.length > 100) {
        const uniq = new Map<string, GoogleFontMeta>();
        for (const m of metas) if (!uniq.has(m.family)) uniq.set(m.family, m);
        cachedMeta = Array.from(uniq.values()).sort((a, b) => a.family.localeCompare(b.family));
        cachedFamilies = cachedMeta.map((m) => m.family);
        for (const m of cachedMeta) familyToSubsets.set(m.family.toLowerCase(), m.subsets);
        return cachedMeta;
      }
    }
  } catch {}
  try {
    const r2 = await fetch(GWFH_API, { cache: "force-cache" });
    if (r2.ok) {
      const data2: Array<{ family: string; subsets?: string[] }> = await r2.json();
      const metas2: GoogleFontMeta[] = data2.map((f) => ({ family: f.family, subsets: f.subsets ?? [] })).filter((f) => !!f.family);
      if (metas2.length > 100) {
        const uniq2 = new Map<string, GoogleFontMeta>();
        for (const m of metas2) if (!uniq2.has(m.family)) uniq2.set(m.family, m);
        cachedMeta = Array.from(uniq2.values()).sort((a, b) => a.family.localeCompare(b.family));
        cachedFamilies = cachedMeta.map((m) => m.family);
        for (const m of cachedMeta) familyToSubsets.set(m.family.toLowerCase(), m.subsets);
        return cachedMeta;
      }
    }
  } catch {}
  const fallbackFamilies = [
    "Inter",
    "Roboto",
    "Open Sans",
    "Montserrat",
    "Lato",
    "Poppins",
    "Oswald",
    "Raleway",
    "Nunito",
    "Ubuntu",
    "Playfair Display",
    "Merriweather",
    "Noto Sans",
    "Fira Sans",
    "Work Sans",
    "Rubik",
    "Quicksand",
    "PT Sans",
    "Arvo",
    "Bebas Neue",
  ];
  // fallback subsets: most support latin + cyrillic for common ones, but mark conservatively
  const cyrillicFallback = new Set(["Inter", "Roboto", "Open Sans", "Montserrat", "Noto Sans", "PT Sans", "Arvo", "Ubuntu", "Rubik"]);
  cachedMeta = fallbackFamilies.map((f) => ({
    family: f,
    subsets: cyrillicFallback.has(f) ? ["latin", "cyrillic"] : ["latin"],
  }));
  cachedFamilies = fallbackFamilies.slice().sort((a, b) => a.localeCompare(b));
  for (const m of cachedMeta) familyToSubsets.set(m.family.toLowerCase(), m.subsets);
  return cachedMeta;
}

export async function fetchGoogleFontFamilies(): Promise<string[]> {
  if (cachedFamilies) return cachedFamilies;
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    const meta = await fetchGoogleFontsMeta();
    const families = meta.map((m) => m.family);
    cachedFamilies = families;
    return families;
  })();
  return fetchPromise;
}

export function isCyrillicSupported(family: string): boolean {
  const clean = displayFamily(family);
  if (isSystemFont(family)) return true; // system stacks generally have cyrillic glyphs
  const subs = familyToSubsets.get(clean.toLowerCase());
  if (!subs) return false;
  return subs.some((s) => s.toLowerCase().includes("cyrillic"));
}

function displayFamily(family: string): string {
  return family.split(",")[0].trim().replace(/^["']|["']$/g, "");
}

export function fontFamilyToCss(family: string): string {
  if (!family) return "Inter, sans-serif";
  if (family.includes(",")) return family;
  return family;
}
