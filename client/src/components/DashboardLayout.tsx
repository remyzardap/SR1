import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  LogOut, PanelLeft,
  LayoutDashboard, Receipt, ClipboardCheck, CheckSquare, ShoppingCart,
  BarChart3, MessageCircle, CreditCard, Shield,
  MessageSquare, Layers, CloudLightning, Plug, Compass, Rss, Heart,
  Building2, ChevronDown, Image, TrendingUp, Activity, Phone,
  LayoutGrid, GitBranch
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { CommandPalette } from './CommandPalette';
import { FloatingVideoPlayer } from './FloatingVideoPlayer';

import { Button } from "./ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { LandingMark } from "@/components/LandingMark";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";

const menuItems: Array<{ icon: SutaeruIconName; label: string; path: string; group: string }> = [
  // ── Sutaeru core ──
  { icon: "ask", label: "Chat", path: "/chat", group: "sutaeru" },
  { icon: "agent", label: "Identity", path: "/identity", group: "sutaeru" },
  { icon: "models", label: "Skills", path: "/skills", group: "sutaeru" },
  { icon: "memory", label: "Memories", path: "/memories", group: "sutaeru" },
  { icon: "schedule", label: "Monitors", path: "/monitors", group: "sutaeru" },
  { icon: "connections", label: "Connections", path: "/connections", group: "sutaeru" },
  // ── File generation ──
  { icon: "make", label: "Atelier", path: "/atelier", group: "forge" },
  { icon: "report", label: "Generate", path: "/generate", group: "forge" },
  { icon: "files", label: "My Files", path: "/files", group: "forge" },
  // ── Back Office ──
  // ── Settings ──
  { icon: "settings", label: "Settings", path: "/settings", group: "settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

// ─── Shared UI primitives (used by KemmaCalls, AgentHub, etc.) ─────────────
const glassColors = {
  blue: 'var(--foreground)',
  purple: 'var(--foreground)',
  textWhite: 'var(--primary-foreground)',
  glassBg: 'var(--card)',
  glassBorder: 'var(--border)',
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
       color: glassColors.blue,
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
       background: glassColors.blue,
      color: glassColors.textWhite,
      border: 'none',
      borderRadius: '12px',
      padding: '12px 24px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
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
       color: glassColors.blue,
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
        >
          <SidebarHeader className="h-16 justify-center" style={{ borderBottom: '1px solid var(--border)' }}>
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
                  <LandingMark className="sutaeru-nav-mark" />
                  <span className="sutaeru-wordmark">SUTAERU</span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0" style={{ background: 'transparent' }}>
            <SidebarMenu className="px-2 py-1">
              {/* Sutaeru core group */}
              {!isCollapsed && (
                <div className="px-3 py-2 text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "'Sora', sans-serif", fontSize: '0.6rem', color: 'var(--accent-color)' }}>
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
                      className="sutaeru-nav-item min-h-11 transition-all font-normal"
                    >
                      <SutaeruIcon name={item.icon}
                        className={`h-5 w-5 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* File generation group */}
              {!isCollapsed && (
                <div className="px-3 py-2 mt-2 text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: 'var(--muted-foreground)' }}>
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
                      className="sutaeru-nav-item min-h-11 transition-all font-normal"
                    >
                      <SutaeruIcon name={item.icon}
                        className={`h-5 w-5 ${isActive ? "text-primary" : ""}`}
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
                     <div className="px-3 py-2 mt-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Admin
                    </div>
                  )}
                  <SidebarMenuItem key="/admin">
                    <SidebarMenuButton
                      isActive={location === "/admin"}
                      onClick={() => setLocation("/admin")}
                      tooltip="Admin"
                       className="sutaeru-nav-item min-h-11 transition-all font-normal"
                    >
                      <Shield className={`h-4 w-4 ${location === "/admin" ? "text-primary" : ""}`} />
                      <span>Admin</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}

              {/* Settings Group */}
              {!isCollapsed && (
                 <div className="px-3 py-2 mt-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
                     className="sutaeru-nav-item min-h-11 transition-all font-normal"
                    >
                      <SutaeruIcon name={item.icon}
                        className={`h-5 w-5 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>


          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback style={{ background: 'var(--accent-dim)', color: 'var(--accent-color)', border: '1px solid var(--border)' }} className="text-xs font-medium">
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
        <div ref={contentRef} className="flex flex-col flex-1 min-h-0">
          {isMobile && (
            <div className="sutaeru-mobile-topbar flex border-b h-16 items-center justify-between px-4 sticky top-0 z-40">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="h-11 w-11" aria-label="Open navigation" />
                <div className="flex items-center gap-3">
                  <LandingMark className="sutaeru-nav-mark" />
                  <div className="flex flex-col gap-1">
                    <span className="tracking-tight text-foreground">
                      {activeMenuItem?.label ?? "Menu"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
           <main className={noPadding ? "flex-1 min-w-0 flex flex-col overflow-hidden bg-sutaeru" : "flex-1 min-w-0 p-3 sm:p-6 overflow-y-auto bg-sutaeru"}>{children}</main>
        </div>
      </SidebarInset>
    </>
  );
}
