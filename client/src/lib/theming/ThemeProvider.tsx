/**
 * ThemeProvider.tsx — White-Label Theming Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Injects per-tenant CSS custom properties into the document root.
 * Supports:
 *   - Dynamic colour palette from tenant branding config
 *   - Custom fonts (loaded via Google Fonts or self-hosted)
 *   - Dark mode toggle (persisted in localStorage)
 *   - Compiled CSS override from Rust branding-compiler service
 *   - Fallback to NextHub default theme if no tenant branding is found
 *
 * Usage:
 *   <ThemeProvider tenantId="firstbank-ng">
 *     <App />
 *   </ThemeProvider>
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandingTheme {
  displayName: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  logomarkUrl?: string | null;
  primaryColor: string;
  primaryForeground: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  borderColor: string;
  errorColor: string;
  successColor: string;
  warningColor: string;
  fontFamily: string;
  fontFamilyMono: string;
  fontSizeBase: string;
  borderRadius: string;
  compiledCssUrl?: string | null;
}

export interface ThemeContextValue {
  theme: BrandingTheme | null;
  isDark: boolean;
  toggleDark: () => void;
  isLoading: boolean;
  tenantId: string | null;
}

// ─── Default NextHub theme ────────────────────────────────────────────────────

const DEFAULT_THEME: BrandingTheme = {
  displayName: "NextHub",
  logoUrl: null,
  faviconUrl: null,
  logomarkUrl: null,
  primaryColor: "#1a56db",
  primaryForeground: "#ffffff",
  secondaryColor: "#7e3af2",
  accentColor: "#0694a2",
  backgroundColor: "#f9fafb",
  surfaceColor: "#ffffff",
  borderColor: "#e5e7eb",
  errorColor: "#f05252",
  successColor: "#0e9f6e",
  warningColor: "#ff5a1f",
  fontFamily: "Inter",
  fontFamilyMono: "JetBrains Mono",
  fontSizeBase: "16px",
  borderRadius: "0.5rem",
};

// ─── Context ──────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  isDark: false,
  toggleDark: () => {},
  isLoading: false,
  tenantId: null,
});

export const useTheme = () => useContext(ThemeContext);

// ─── CSS injection ────────────────────────────────────────────────────────────

function injectCssVariables(theme: BrandingTheme): void {
  const root = document.documentElement;
  const vars: Record<string, string> = {
    "--color-primary":            theme.primaryColor,
    "--color-primary-foreground": theme.primaryForeground,
    "--color-secondary":          theme.secondaryColor,
    "--color-accent":             theme.accentColor,
    "--color-background":         theme.backgroundColor,
    "--color-surface":            theme.surfaceColor,
    "--color-border":             theme.borderColor,
    "--color-error":              theme.errorColor,
    "--color-success":            theme.successColor,
    "--color-warning":            theme.warningColor,
    "--background":               theme.backgroundColor,
    "--foreground":               theme.primaryColor,
    "--card":                     theme.surfaceColor,
    "--card-foreground":          theme.primaryColor,
    "--primary":                  theme.primaryColor,
    "--primary-foreground":       theme.primaryForeground,
    "--secondary":                theme.secondaryColor,
    "--secondary-foreground":     theme.primaryForeground,
    "--accent":                   theme.accentColor,
    "--accent-foreground":        theme.primaryForeground,
    "--destructive":              theme.errorColor,
    "--destructive-foreground":   "#ffffff",
    "--border":                   theme.borderColor,
    "--input":                    theme.borderColor,
    "--ring":                     theme.primaryColor,
    "--font-sans":                `'${theme.fontFamily}', system-ui, sans-serif`,
    "--font-mono":                `'${theme.fontFamilyMono}', monospace`,
    "--font-size-base":           theme.fontSizeBase,
    "--radius":                   theme.borderRadius,
    "--radius-sm":                `calc(${theme.borderRadius} * 0.5)`,
    "--radius-lg":                `calc(${theme.borderRadius} * 1.5)`,
  };

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

function loadFont(fontFamily: string): void {
  const safeFont = encodeURIComponent(fontFamily);
  const linkId = `nexthub-font-${safeFont}`;
  if (document.getElementById(linkId)) return;

  const link = document.createElement("link");
  link.id = linkId;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${safeFont}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

function loadCompiledCss(url: string): void {
  const linkId = "nexthub-compiled-theme";
  const existing = document.getElementById(linkId) as HTMLLinkElement | null;
  if (existing) {
    existing.href = url;
    return;
  }
  const link = document.createElement("link");
  link.id = linkId;
  link.rel = "stylesheet";
  link.href = url;
  document.head.appendChild(link);
}

function updateFavicon(url: string): void {
  const existing = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (existing) {
    existing.href = url;
  } else {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = url;
    document.head.appendChild(link);
  }
}

// ─── ThemeProvider component ──────────────────────────────────────────────────

interface ThemeProviderProps {
  tenantId?: string | null;
  children: React.ReactNode;
}

export function ThemeProvider({ tenantId, children }: ThemeProviderProps) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem("nexthub-dark-mode") === "true";
    } catch {
      return false;
    }
  });

  // Fetch tenant branding from tRPC
  const { data: branding, isLoading } = trpc.nexthubTenants.getBranding.useQuery(
    { tenantId: tenantId! },
    {
      enabled: !!tenantId,
      staleTime: 5 * 60 * 1000,   // 5 minutes
      retry: 1,
    }
  );

  const theme: BrandingTheme = branding
    ? {
        displayName:      branding.displayName,
        logoUrl:          branding.logoUrl,
        faviconUrl:       branding.faviconUrl,
        logomarkUrl:      branding.logomarkUrl,
        primaryColor:     branding.primaryColor,
        primaryForeground: branding.primaryForeground,
        secondaryColor:   branding.secondaryColor,
        accentColor:      branding.accentColor,
        backgroundColor:  branding.backgroundColor,
        surfaceColor:     branding.surfaceColor,
        borderColor:      branding.borderColor,
        errorColor:       branding.errorColor,
        successColor:     branding.successColor,
        warningColor:     branding.warningColor,
        fontFamily:       branding.fontFamily,
        fontFamilyMono:   branding.fontFamilyMono,
        fontSizeBase:     branding.fontSizeBase,
        borderRadius:     branding.borderRadius,
        compiledCssUrl:   branding.compiledCssUrl,
      }
    : DEFAULT_THEME;

  // Apply theme whenever it changes
  useEffect(() => {
    injectCssVariables(theme);
    loadFont(theme.fontFamily);
    if (theme.fontFamilyMono !== "JetBrains Mono") loadFont(theme.fontFamilyMono);
    if (theme.compiledCssUrl) loadCompiledCss(theme.compiledCssUrl);
    if (theme.faviconUrl) updateFavicon(theme.faviconUrl);
    if (theme.displayName && theme.displayName !== "NextHub") {
      document.title = `${theme.displayName} Hub`;
    }
  }, [theme]);

  // Apply dark mode
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    try {
      localStorage.setItem("nexthub-dark-mode", String(isDark));
    } catch {}
  }, [isDark]);

  const toggleDark = useCallback(() => setIsDark((d) => !d), []);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleDark, isLoading, tenantId: tenantId ?? null }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── White-label logo component ───────────────────────────────────────────────

export function TenantLogo({
  className = "",
  variant = "full",
}: {
  className?: string;
  variant?: "full" | "mark" | "text";
}) {
  const { theme } = useTheme();

  if (variant === "mark" && theme?.logomarkUrl) {
    return <img src={theme.logomarkUrl} alt={theme.displayName} className={className} />;
  }
  if ((variant === "full" || variant === "mark") && theme?.logoUrl) {
    return <img src={theme.logoUrl} alt={theme.displayName} className={className} />;
  }
  // Text fallback
  return (
    <span
      className={className}
      style={{ fontWeight: 700, color: "var(--color-primary)", fontFamily: "var(--font-sans)" }}
    >
      {theme?.displayName ?? "NextHub"}
    </span>
  );
}
