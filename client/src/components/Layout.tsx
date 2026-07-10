/**
 * Layout.tsx — NextHub Core Layout
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone sidebar layout for the NextHub portal.
 * This is completely independent of Paygate's Layout.tsx.
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Users, Activity, ArrowLeftRight, BarChart3, Shield,
  Settings, LogOut, ChevronDown, ChevronRight, Menu, X,
  Landmark, AlertTriangle, Scale, Globe, FileText,
  Zap, Database, RefreshCw, GitBranch, CreditCard,
  TrendingUp, Building2, Lock, Eye, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

interface NavSection {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const navSections: NavSection[] = [
  {
    title: "Participants",
    defaultOpen: true,
    items: [
      { label: "DFSP Management", href: "/dfsps", icon: <Building2 className="h-4 w-4" /> },
      { label: "Participant Lifecycle", href: "/participant-lifecycle", icon: <GitBranch className="h-4 w-4" /> },
      { label: "Topology Map", href: "/topology", icon: <Globe className="h-4 w-4" /> },
      { label: "Oracle Management", href: "/oracles", icon: <Database className="h-4 w-4" /> },
    ],
  },
  {
    title: "Settlement & NDC",
    defaultOpen: true,
    items: [
      { label: "Settlement Windows", href: "/settlement/windows", icon: <Landmark className="h-4 w-4" /> },
      { label: "Settlement Banks", href: "/settlement/banks", icon: <CreditCard className="h-4 w-4" /> },
      { label: "NDC Limits", href: "/ndc/limits", icon: <Scale className="h-4 w-4" /> },
      { label: "NDC Breach Events", href: "/ndc/breaches", icon: <AlertTriangle className="h-4 w-4" />, badge: "Live", badgeVariant: "destructive" },
    ],
  },
  {
    title: "FX & Transfers",
    defaultOpen: true,
    items: [
      { label: "FX Dashboard", href: "/fx", icon: <TrendingUp className="h-4 w-4" /> },
      { label: "Bulk Transfers", href: "/bulk-transfers", icon: <ArrowLeftRight className="h-4 w-4" /> },
      { label: "Bulk Transfer Wizard", href: "/bulk-transfers/wizard", icon: <Zap className="h-4 w-4" /> },
    ],
  },
  {
    title: "Compliance & Risk",
    defaultOpen: false,
    items: [
      { label: "Disputes Hub", href: "/disputes", icon: <Scale className="h-4 w-4" /> },
      { label: "Reconciliation", href: "/reconciliation", icon: <RefreshCw className="h-4 w-4" /> },
      { label: "PISP Consents", href: "/pisp/consents", icon: <Lock className="h-4 w-4" /> },
      { label: "Security Dashboard", href: "/security", icon: <Shield className="h-4 w-4" /> },
    ],
  },
  {
    title: "Billing & Analytics",
    defaultOpen: false,
    items: [
      { label: "Billing Hub", href: "/billing", icon: <CreditCard className="h-4 w-4" /> },
    ],
  },
  {
    title: "Regulator Portal",
    defaultOpen: false,
    items: [
      { label: "Regulator Dashboard", href: "/regulator/dashboard", icon: <Eye className="h-4 w-4" /> },
      { label: "Regulator Login", href: "/regulator/login", icon: <LogOut className="h-4 w-4" /> },
    ],
  },
  {
    title: "Administration",
    defaultOpen: false,
    items: [
      { label: "Regulator Management", href: "/admin/regulators", icon: <Users className="h-4 w-4" /> },
    ],
  },
];

function NavSection({ section, collapsed }: { section: NavSection; collapsed: boolean }) {
  const [open, setOpen] = useState(section.defaultOpen ?? false);
  const [location] = useLocation();

  if (collapsed) {
    return (
      <div className="space-y-1 py-1">
        {section.items.map(item => (
          <TooltipProvider key={item.href} delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={item.href}>
                  <a className={cn(
                    "flex items-center justify-center h-9 w-9 rounded-md mx-auto transition-colors",
                    location === item.href
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}>
                    {item.icon}
                  </a>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {section.title}
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="space-y-0.5">
          {section.items.map(item => (
            <Link key={item.href} href={item.href}>
              <a className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                location === item.href
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}>
                {item.icon}
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <Badge variant={item.badgeVariant ?? "secondary"} className="text-[10px] px-1.5 py-0">
                    {item.badge}
                  </Badge>
                )}
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <div className={cn("flex h-full flex-col", sidebarCollapsed ? "w-14" : "w-64")}>
      {/* Header */}
      <div className={cn(
        "flex items-center border-b px-3 py-4",
        sidebarCollapsed ? "justify-center" : "justify-between"
      )}>
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Activity className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold leading-none">NextHub</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Scheme Operator</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => setSidebarCollapsed(c => !c)}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {navSections.map(section => (
          <NavSection key={section.title} section={section} collapsed={sidebarCollapsed} />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t px-2 py-3">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span>All systems operational</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:flex flex-col border-r bg-card transition-all duration-200",
        sidebarCollapsed ? "w-14" : "w-64"
      )}>
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-card border-r">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile topbar */}
        <div className="flex items-center gap-3 border-b px-4 py-3 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <Activity className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">NextHub</span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
