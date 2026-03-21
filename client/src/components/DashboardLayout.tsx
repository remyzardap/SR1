import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";
import {
  Brain, FolderOpen, Sparkles, Settings, LogOut, PanelLeft,
  LayoutDashboard, Receipt, ClipboardCheck, CheckSquare, ShoppingCart,
  BarChart3, MessageCircle, CreditCard, Shield,
  MessageSquare, Layers, CloudLightning, Plug, Compass, Rss, Heart,
  Building2, ChevronDown, Image, TrendingUp, Activity, Phone,
  LayoutGrid, Palette, GitBranch
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { CommandPalette } from './CommandPalette';
import { FloatingVideoPlayer } from './FloatingVideoPlayer';

import { Button } from "./ui/button";
import { useAuth } from "@/_core/hooks/useAuth";

const menuItems = [
  // ── Sutaeru core ──
  { icon: MessageSquare, label: "Chat", path: "/chat", group: "sutaeru" },
  { icon: Brain, label: "Identity", path: "/identity", group: "sutaeru" },
  { icon: Layers, label: "Skills", path: "/skills", group: "sutaeru" },
  { icon: CloudLightning, label: "Memories", path: "/memories", group: "sutaeru" },
  { icon: Plug, label: "Connections", path: "/connections", group: "sutaeru" },
  { icon: Compass, label: "Discover", path: "/discover", group: "sutaeru" },
  { icon: Rss, label: "Feed", path: "/feed", group: "sutaeru" },
  { icon: Heart, label: "Health", path: "/health", group: "sutaeru" },
  { icon: Phone, label: "Kemma Calls", path: "/kemma-calls", group: "sutaeru" },
  { icon: LayoutGrid, label: "Board", path: "/board", group: "sutaeru" },
  { icon: GitBranch, label: "Workflows", path: "/workflow", group: "sutaeru" },
  // ── File generation ──
  { icon: Palette, label: "Atelier", path: "/atelier", group: "forge" },
  { icon: Sparkles, label: "Generate", path: "/generate", group: "forge" },
  { icon: Image, label: "Image Gen", path: "/image-gen", group: "forge" },
  { icon: FolderOpen, label: "My Files", path: "/files", group: "forge" },
  // ── Back Office ──
  { icon: Building2, label: "Businesses", path: "/business", group: "office" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", group: "office" },
  { icon: Receipt, label: "Receipts", path: "/receipts", group: "office" },
  { icon: ClipboardCheck, label: "Review Queue", path: "/review", group: "office" },
  { icon: CheckSquare, label: "Tasks", path: "/tasks", group: "office" },
  { icon: ShoppingCart, label: "Procurement", path: "/procurement", group: "office" },
  { icon: BarChart3, label: "Reports", path: "/reports", group: "office" },
  { icon: MessageCircle, label: "WhatsApp", path: "/whatsapp", group: "office" },
  { icon: CreditCard, label: "Billing", path: "/billing", group: "office" },
  // ── Settings ──
  { icon: Settings, label: "Settings", path: "/settings", group: "settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

// ─── Shared UI primitives (used by KemmaCalls, AgentHub, etc.) ─────────────
const glassColors = {
  blue: '#5B8DEF',
  purple: '#8B5CF6',
  textWhite: '#FFFFFF',
  glassBg: 'rgba(17, 24, 39, 0.8)',
  glassBorder: 'rgba(91, 141, 239, 0.2)',
};

export const GlassCard = ({
  children,
  style = {},
  onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    style={{
      background: glassColors.glassBg,
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      border: `1px solid ${glassColors.glassBorder}`,
      padding: '20px',
      ...style,
    }}
  >
    {children}
  </div>
);

export const GradientText = ({
  children,
  style = {},
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) => (
  <span
    style={{
      background: `linear-gradient(135deg, ${glassColors.blue}, ${glassColors.purple})`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      fontWeight: 700,
      ...style,
    }}
  >
    {children}
  </span>
);

export const PrimaryButton = ({
  children,
  onClick,
  style = {},
}: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) => (
  <button
    onClick={onClick}
    style={{
      background: `linear-gradient(135deg, ${glassColors.blue}, ${glassColors.purple})`,
      color: glassColors.textWhite,
      border: 'none',
      borderRadius: '12px',
      padding: '12px 24px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 4px 20px rgba(91, 141, 239, 0.3)',
      ...style,
    }}
  >
    {children}
  </button>
);

export const SecondaryButton = ({
  children,
  onClick,
  style = {},
}: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) => (
  <button
    onClick={onClick}
    style={{
      background: 'transparent',
      color: glassColors.textWhite,
      border: `1px solid ${glassColors.glassBorder}`,
      borderRadius: '12px',
      padding: '12px 24px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      ...style,
    }}
  >
    {children}
  </button>
);

export default function DashboardLayout({
  children,
  noPadding,
}: {
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = "/login";
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutWithPalette setSidebarWidth={setSidebarWidth} noPadding={noPadding}>
        {children}
      </DashboardLayoutWithPalette>
    </SidebarProvider>
  );
}

// ─── CommandPalette wrapper ───────────────────────────────────────────────────
function DashboardLayoutWithPalette({ setSidebarWidth, noPadding, children }: { setSidebarWidth: (w: number) => void; noPadding?: boolean; children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <FloatingVideoPlayer />
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth} noPadding={noPadding}>
        {children}
      </DashboardLayoutContent>
    </>
  );
}

// ─── Business Switcher widget ────────────────────────────────────────────────
function BusinessSwitcher() {
  const { businesses, activeBusiness, setActiveBusiness } = useBusiness();
  const [, setLocation] = useLocation();

  if (businesses.length === 0) {
    return (
      <div className="px-3 pb-2">
        <button
          onClick={() => setLocation("/business")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/40 transition-colors"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.10)" }}
        >
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">No business — create one</span>
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 pb-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-colors"
            style={{
              background: activeBusiness ? "var(--accent-dim)" : "rgba(255,255,255,0.05)",
              border: activeBusiness ? "1px solid var(--accent-border)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Building2
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: activeBusiness ? "var(--accent-color)" : "rgba(255,255,255,0.40)" }}
            />
            <span
              className="flex-1 truncate text-left font-medium"
              style={{ color: activeBusiness ? "var(--accent-color)" : "rgba(255,255,255,0.50)" }}
            >
              {activeBusiness ? activeBusiness.name : "Select business"}
            </span>
            <ChevronDown className="w-3 h-3 text-white/30 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {businesses.map((biz) => (
            <DropdownMenuItem
              key={biz.id}
              onClick={() => setActiveBusiness(activeBusiness?.id === biz.id ? null : biz)}
              className="cursor-pointer"
            >
              <Building2 className="mr-2 h-3.5 w-3.5" />
              <span className="truncate flex-1">{biz.name}</span>
              {activeBusiness?.id === biz.id && (
                <span className="ml-2 text-[10px] font-bold" style={{ color: "var(--accent-color)" }}>✓</span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={() => setLocation("/business")}
            className="cursor-pointer border-t border-white/10 mt-1 pt-1"
          >
            <Building2 className="mr-2 h-3.5 w-3.5" />
            Manage Businesses
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
  noPadding?: boolean;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  noPadding,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar, openMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  // Swipe-to-close: left swipe on main content closes the mobile sidebar
  useSwipeToClose(contentRef, isMobile && openMobile, () => setOpenMobile(false));

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent-color), var(--accent-color))', borderRadius: '10px', boxShadow: '0 0 12px var(--accent-glow)' }}>
                    <Brain className="h-3.5 w-3.5 text-[#f5f2ed]" />
                  </div>
                  <span className="text-xs font-bold tracking-widest uppercase text-gradient truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    SUTAERU
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0" style={{ background: 'transparent' }}>
            <SidebarMenu className="px-2 py-1">
              {/* Sutaeru core group */}
              {!isCollapsed && (
                <div className="px-3 py-2 text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.6rem', color: 'var(--accent-color)' }}>
                  — Sutaeru
                </div>
              )}
              {menuItems.filter(item => item.group === "sutaeru").map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* File generation group */}
              {!isCollapsed && (
                <div className="px-3 py-2 mt-2 text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.6rem', color: 'rgba(245,242,237,0.30)' }}>
                  — Generate
                </div>
              )}
              {menuItems.filter(item => item.group === "forge").map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* The Office Group */}
              {!isCollapsed && (
                <div className="px-3 py-2 mt-2 text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.6rem', color: 'rgba(245,242,237,0.30)' }}>
                  — The Office
                </div>
              )}
              {menuItems.filter(item => item.group === "office").map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* Admin (only for admin users) */}
              {user?.role === "admin" && (
                <>
                  {!isCollapsed && (
                    <div className="px-3 py-2 mt-2 text-xs font-medium text-[#7a7670]/60 uppercase tracking-wider">
                      Admin
                    </div>
                  )}
                  <SidebarMenuItem key="/admin">
                    <SidebarMenuButton
                      isActive={location === "/admin"}
                      onClick={() => setLocation("/admin")}
                      tooltip="Admin"
                      className={`h-10 transition-all font-normal`}
                    >
                      <Shield className={`h-4 w-4 ${location === "/admin" ? "text-primary" : ""}`} />
                      <span>Admin</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem key="/kpis">
                    <SidebarMenuButton
                      isActive={location === "/kpis"}
                      onClick={() => setLocation("/kpis")}
                      tooltip="KPIs Dashboard"
                      className={`h-10 transition-all font-normal`}
                    >
                      <TrendingUp className={`h-4 w-4 ${location === "/kpis" ? "text-primary" : ""}`} />
                      <span>KPIs</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem key="/health">
                    <SidebarMenuButton
                      isActive={location === "/health"}
                      onClick={() => setLocation("/health")}
                      tooltip="System Health"
                      className={`h-10 transition-all font-normal`}
                    >
                      <Activity className={`h-4 w-4 ${location === "/health" ? "text-primary" : ""}`} />
                      <span>Health</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}

              {/* Settings Group */}
              {!isCollapsed && (
                <div className="px-3 py-2 mt-2 text-xs font-medium text-[#7a7670]/60 uppercase tracking-wider">
                  Settings
                </div>
              )}
              {menuItems.filter(item => item.group === "settings").map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          {/* Active Business Switcher */}
          {!isCollapsed && <BusinessSwitcher />}


          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback style={{ background: 'var(--accent-dim)', color: 'var(--accent-color)', border: '1px solid rgba(255,255,255,0.08)' }} className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <div ref={contentRef} className="flex flex-col flex-1 h-full">
          {isMobile && (
            <div className="flex border-b border-[rgba(255,255,255,0.05)] h-14 items-center justify-between bg-[rgba(13,10,26,0.92)] px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="h-9 w-9 rounded-lg glass" />
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="tracking-tight text-foreground">
                      {activeMenuItem?.label ?? "Menu"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <main className={noPadding ? "flex-1 flex flex-col overflow-hidden bg-sutaeru" : "flex-1 p-4 overflow-y-auto bg-sutaeru"}>{children}</main>
        </div>
      </SidebarInset>
    </>
  );
}
