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
import { SutaeruGlyph } from "@/components/SutaeruGlyph";
import { trpc } from "@/lib/trpc";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";

const menuItems: Array<{ icon: SutaeruIconName; label: string; path: string; group: string }> = [
  { icon: "ask", label: "Chat", path: "/chat", group: "workspace" },
  { icon: "make", label: "Documents", path: "/documents", group: "workspace" },
  { icon: "image", label: "Images", path: "/images", group: "workspace" },
  { icon: "files", label: "Files", path: "/files", group: "workspace" },
  { icon: "memory", label: "Memories", path: "/memories", group: "workspace" },
  { icon: "models", label: "Skills", path: "/skills", group: "workspace" },
  { icon: "schedule", label: "Monitors", path: "/monitors", group: "workspace" },
  { icon: "connections", label: "Connections", path: "/connections", group: "workspace" },
  { icon: "agent", label: "Identity", path: "/identity", group: "workspace" },
  { icon: "settings", label: "Settings", path: "/settings", group: "settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 264;
const MIN_WIDTH = 220;
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
  const quota = trpc.kemma.quota.useQuery(undefined, { retry: false, staleTime: 5 * 60_000 });
  const planLabel = `${quota.data?.tier ?? "free"} plan`;

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
          variant="floating"
          className="border-r-0 sk-shell-sidebar"
        >
          <SidebarHeader className="sk-shell-header">
            <button
              type="button"
              onClick={() => setLocation("/chat")}
              className="sk-shell-brand"
              aria-label="Sutaeru home"
            >
              <SutaeruGlyph className="sk-shell-glyph" />
              {!isCollapsed ? <span className="sk-shell-wordmark">Sutaeru</span> : null}
            </button>
            {!isCollapsed ? (
              <button
                onClick={toggleSidebar}
                className="sk-shell-collapse"
                aria-label="Collapse navigation"
                title="Collapse navigation"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            ) : null}
          </SidebarHeader>

          <SidebarContent className="sk-shell-content">
            {isCollapsed ? (
              <button onClick={toggleSidebar} className="sk-shell-collapse sk-shell-expand" aria-label="Expand navigation">
                <PanelLeft className="h-4 w-4" />
              </button>
            ) : (
              <div className="sk-shell-kicker">Workspace</div>
            )}
            <SidebarMenu className="sk-shell-menu">
              {menuItems.filter((item) => item.group === "workspace").map((item) => {
                const isActive = location === item.path || (item.path === "/documents" && (location === "/generate" || location === "/atelier"));
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="sutaeru-nav-item sk-shell-item"
                    >
                      <SutaeruIcon name={item.icon} className="sk-shell-icon" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            <SidebarMenu className="sk-shell-menu sk-shell-menu-bottom">
              {menuItems.filter((item) => item.group === "settings").map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="sutaeru-nav-item sk-shell-item"
                    >
                      <SutaeruIcon name={item.icon} className="sk-shell-icon" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {user?.role === "admin" && (
                <SidebarMenuItem key="/admin">
                  <SidebarMenuButton
                    isActive={location === "/admin" || location === "/admin/audit-logs"}
                    onClick={() => setLocation("/admin")}
                    tooltip="Admin"
                    className="sutaeru-nav-item sk-shell-item"
                  >
                    <SutaeruIcon name="admin" className="sk-shell-icon" />
                    <span>Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="sk-shell-footer">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="sk-shell-user">
                  <span className="sk-shell-avatar" aria-hidden="true">{(user?.name || user?.email || "?").charAt(0).toUpperCase()}</span>
                  <span className="sk-shell-user-copy">
                    <strong>{user?.name || user?.email || "Account"}</strong>
                    <span>{planLabel}</span>
                  </span>
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
