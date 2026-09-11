"use client";

// Google Fonts loader + catalog service for the subtitle editor.
//
// Editors go through the `googleFonts` singleton below: `ensureGoogleFontLoaded`
// injects the `fonts.googleapis.com` stylesheet for a family (deduped per
// family, resolve-always so a failed font never blocks the export),
// `fetchGoogleFontsMeta` pulls the family catalog
// (fontsource → gwfh → curated fallback), and `isCyrillicSupported` gates the
// Cyrillic warning in the font picker. All mutable fetch/load caches live here
// (never in the components), so concurrent panels share one in-flight request.

/** Family + subset entry of the Google Fonts catalog. */
export interface GoogleFontMeta {
  family: string;
  subsets: string[];
}

/**
 * Singleton service owning every Google Fonts interaction: stylesheet
 * injection with load-waiting, the family/subset catalog with its fallback
 * chain, and the Cyrillic-support + CSS-string helpers. Mutable caches are
 * private statics, so panels and the PNG renderer share one fetch promise
 * and one loaded/loading registry.
 */
export class GoogleFonts {
  /** fontsource catalog endpoint (CORS `*`), tried first. */
  private static readonly FONTSOURCE_API =
    "https://api.fontsource.org/v1/fonts";
  /** gwfh catalog endpoint, tried when fontsource is unusable. */
  private static readonly GWFH_API = "https://gwfh.mranftl.com/api/fonts";
  /** Fallback wait for the injected stylesheet when `document.fonts` is absent. */
  private static readonly LINK_LOAD_FALLBACK_MS = 2500;
  /** Minimum catalog size before a remote response is trusted (else fallback). */
  private static readonly MIN_CATALOG_SIZE = 100;

  /** Sorted family list derived from the cached catalog (or null until fetched). */
  private static cachedFamilies: string[] | null = null;
  /** Full catalog entries (or null until fetched). */
  private static cachedMeta: GoogleFontMeta[] | null = null;
  /** Lowercased family → subset list, filled from whichever source won. */
  private static readonly familyToSubsets = new Map<string, string[]>();
  /** Families whose stylesheet + `document.fonts` load already resolved. */
  private static readonly loadedFonts = new Set<string>();
  /** In-flight per-family load promises (dedupes concurrent mounts). */
  private static readonly loadingFonts = new Map<string, Promise<void>>();
  // js-set-map-lookups: O(1) generic-family check instead of Array.includes per call
  /** Generic CSS families that never need a webfont download. */
  private static readonly SYSTEM_FONT_SET = new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
  ]);
  /**
   * Curated-fallback families assumed to ship Cyrillic (hoisted: was
   * re-created on every fallback catalog build).
   */
  private static readonly CYRILLIC_FALLBACK = new Set([
    "Inter",
    "Roboto",
    "Open Sans",
    "Montserrat",
    "Noto Sans",
    "PT Sans",
    "Arvo",
    "Ubuntu",
    "Rubik",
  ]);

  // ------------------------------------------------------------------ public

  /**
   * Ensure the webfont stylesheet for `family` is injected and loaded.
   * No-op on the server, for system stacks, and for already-loaded families;
   * concurrent callers share one promise. Always resolves (never rejects) so
   * a failed font fetch degrades to the CSS fallback instead of blocking.
   */
  ensureGoogleFontLoaded(family: string): Promise<void> {
    if (typeof document === "undefined") return Promise.resolve();
    const clean = family
      .split(",")[0]
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!clean || this.isSystemFont(family)) return Promise.resolve();
    if (GoogleFonts.loadedFonts.has(clean)) return Promise.resolve();
    const existing = GoogleFonts.loadingFonts.get(clean);
    if (existing) return existing;

    const p = (async () => {
      const href = this.googleFontHref(clean);
      let link = document.querySelector(
        `link[data-google-font="${clean}"]`,
      ) as HTMLLinkElement | null;
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
              setTimeout(() => res(), GoogleFonts.LINK_LOAD_FALLBACK_MS);
            });
          }
        }
      } catch {
        // ignore
      }
      GoogleFonts.loadedFonts.add(clean);
      GoogleFonts.loadingFonts.delete(clean);
    })();
    GoogleFonts.loadingFonts.set(clean, p);
    return p;
  }

  /**
   * Fetch the family catalog (cached after the first success): fontsource
   * first, then gwfh, then a curated 20-family fallback with conservative
   * Cyrillic flags. Responses with too few entries are distrusted so a
   * truncated payload never wipes the picker. Also fills the family list and
   * the subset lookup as a side effect.
   */
  async fetchGoogleFontsMeta(): Promise<GoogleFontMeta[]> {
    if (GoogleFonts.cachedMeta) return GoogleFonts.cachedMeta;
    // Try fontsource first (CORS *), then gwfh
    const remote =
      (await this.fetchRemoteCatalog(GoogleFonts.FONTSOURCE_API, true)) ??
      (await this.fetchRemoteCatalog(GoogleFonts.GWFH_API, false));
    if (remote) return this.commitCatalog(remote);
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
    return this.commitCatalog(
      fallbackFamilies.map((f) => ({
        family: f,
        subsets: GoogleFonts.CYRILLIC_FALLBACK.has(f)
          ? ["latin", "cyrillic"]
          : ["latin"],
      })),
    );
  }

  /**
   * True when `family` can render Cyrillic: system stacks are assumed covered,
   * webfonts need a `cyrillic` subset in the catalog lookup. Unknown families
   * (catalog not loaded or missing) report false so the picker warns.
   */
  isCyrillicSupported(family: string): boolean {
    const clean = this.displayFamily(family);
    if (this.isSystemFont(family)) return true; // system stacks generally have cyrillic glyphs
    const subs = GoogleFonts.familyToSubsets.get(clean.toLowerCase());
    if (!subs) return false;
    return subs.some((s) => s.toLowerCase().includes("cyrillic"));
  }

  // ----------------------------------------------------------------- private

  /**
   * Fetch + parse one remote catalog: single pass filters non-google
   * (fontsource only) + empty names + dedups. Returns null when the fetch
   * fails or the payload is too small to trust, so a truncated response
   * never wipes the picker.
   */
  private async fetchRemoteCatalog(
    url: string,
    googleOnly: boolean,
  ): Promise<GoogleFontMeta[] | null> {
    try {
      const r = await fetch(url, { cache: "force-cache" });
      if (!r.ok) return null;
      const data: Array<{
        family: string;
        subsets?: string[];
        type?: string;
      }> = await r.json();
      // js-combine-iterations: single pass filters google-only + non-empty + dedups
      const uniq = new Map<string, GoogleFontMeta>();
      for (const f of data) {
        if (googleOnly && f.type && f.type !== "google") continue;
        if (!f.family) continue;
        if (!uniq.has(f.family))
          uniq.set(f.family, { family: f.family, subsets: f.subsets ?? [] });
      }
      if (uniq.size <= GoogleFonts.MIN_CATALOG_SIZE) return null;
      return Array.from(uniq.values()).sort((a, b) =>
        a.family.localeCompare(b.family),
      );
    } catch {
      return null;
    }
  }

  /** Fill the family/subset caches from a won catalog (remote or fallback). */
  private commitCatalog(entries: GoogleFontMeta[]): GoogleFontMeta[] {
    GoogleFonts.cachedMeta = entries;
    GoogleFonts.cachedFamilies = entries.map((m) => m.family);
    for (const m of entries)
      GoogleFonts.familyToSubsets.set(m.family.toLowerCase(), m.subsets);
    return entries;
  }

  /**
   * True for generic families (`serif`, `system-ui`, …) and comma stacks —
   * neither needs a webfont download.
   */
  private isSystemFont(family: string): boolean {
    const f = family.trim();
    // system stacks contain comma, or generic families
    if (f.includes(",")) return true;
    return GoogleFonts.SYSTEM_FONT_SET.has(f.toLowerCase());
  }

  /** Lightweight 400-only stylesheet URL with `display=swap` (no FOIT). */
  private googleFontHref(family: string): string {
    const encoded = family.trim().replace(/ +/g, "+");
    // lightweight 400 only, display swap to avoid FOIT
    return `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
  }

  /** First family of a stack, unquoted — the key used for caches/lookups. */
  private displayFamily(family: string): string {
    return family
      .split(",")[0]
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

/** App-wide singleton — panels and the PNG renderer load fonts through this. */
export const googleFonts = new GoogleFonts();
