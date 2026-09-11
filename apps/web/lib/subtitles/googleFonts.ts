// Google Fonts loader + catalog service for the subtitle editor.
//
// Editors go through the `googleFonts` singleton below: `ensureGoogleFontLoaded`
// injects the `fonts.googleapis.com` stylesheet for a family (deduped per
// family, resolve-always so a failed font never blocks the export), and
// `fetchGoogleFontFamilies` pulls the family catalog (fontsource, else a
// curated offline fallback so the picker still lists system-usable families).
// All mutable fetch/load caches live here (never in the components), so
// concurrent panels share one in-flight request.

/**
 * Singleton service owning every Google Fonts interaction: stylesheet
 * injection with load-waiting and the family catalog with its fallback.
 * Mutable caches are private statics, so panels and the PNG renderer share
 * one fetch promise and one loaded/loading registry.
 */
export class GoogleFonts {
  /** fontsource catalog endpoint (CORS `*`). */
  private static readonly FONTSOURCE_API =
    "https://api.fontsource.org/v1/fonts";
  /** Fallback wait for the injected stylesheet when `document.fonts` is absent. */
  private static readonly LINK_LOAD_FALLBACK_MS = 2500;
  /** Minimum catalog size before a remote response is trusted (else fallback). */
  private static readonly MIN_CATALOG_SIZE = 100;
  /** Curated fallback when the network/catalog is unusable (offline picker). */
  private static readonly FALLBACK_FAMILIES = [
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

  /** Sorted family list (or null until fetched). */
  private static cachedFamilies: string[] | null = null;
  /** Families whose stylesheet + `document.fonts` load already resolved. */
  private static readonly loadedFonts = new Set<string>();
  /** In-flight per-family load promises (dedupes concurrent mounts). */
  private static readonly loadingFonts = new Map<string, Promise<void>>();
  /** Generic CSS families that never need a webfont download. */
  private static readonly SYSTEM_FONT_SET = new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
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
   * Fetch the family catalog (cached after the first success): single
   * fontsource fetch, else the curated fallback. Responses with too few
   * entries are distrusted so a truncated payload never wipes the picker.
   */
  async fetchGoogleFontFamilies(): Promise<string[]> {
    if (GoogleFonts.cachedFamilies) return GoogleFonts.cachedFamilies;
    const remote = await this.fetchRemoteCatalog();
    GoogleFonts.cachedFamilies = remote ?? [...GoogleFonts.FALLBACK_FAMILIES];
    return GoogleFonts.cachedFamilies;
  }

  // ----------------------------------------------------------------- private

  /**
   * Fetch + parse the fontsource catalog: single pass filters non-google +
   * empty names + dedups. Returns null when the fetch fails or the payload
   * is too small to trust, so a truncated response never wipes the picker.
   */
  private async fetchRemoteCatalog(): Promise<string[] | null> {
    try {
      const r = await fetch(GoogleFonts.FONTSOURCE_API, {
        cache: "force-cache",
      });
      if (!r.ok) return null;
      const data: Array<{ family: string; type?: string }> = await r.json();
      const uniq = new Set<string>();
      for (const f of data) {
        if (f.type && f.type !== "google") continue;
        if (!f.family) continue;
        uniq.add(f.family);
      }
      if (uniq.size <= GoogleFonts.MIN_CATALOG_SIZE) return null;
      return Array.from(uniq).sort((a, b) => a.localeCompare(b));
    } catch {
      return null;
    }
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
}

/** App-wide singleton — panels and the PNG renderer load fonts through this. */
export const googleFonts = new GoogleFonts();
