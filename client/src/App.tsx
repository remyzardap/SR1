import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { VideoPlayerProvider } from "./contexts/VideoPlayerContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Atelier from "./pages/Atelier";
import Files from "./pages/Files";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import AuditLogs from "./pages/AuditLogs";
import Chat from "./pages/Chat";
import CodeSessions from "./pages/CodeSessions";
import Onboarding from "./pages/Onboarding";
import Identity from "./pages/Identity";
import Skills from "./pages/Skills";
import Memories from "./pages/Memories";
import Monitors from "./pages/Monitors";
import Images from "./pages/Images";
import Connections from "./pages/Connections";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import DashboardLayout from "./components/DashboardLayout";
import { useAuth } from "./_core/hooks/useAuth";
import { IntelligenceProvider } from "./_core/hooks/useSutaeruIntelligence";
import { useLocation } from "wouter";
import { useEffect } from "react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login");
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading) return null;
  if (!isAuthenticated) return null;
  return <Component />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/index" component={Home} />
      <Route path="/index.html" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/atelier">
        {isAuthenticated ? (
          <DashboardLayout noPadding>
            <Atelier />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Atelier} />
        )}
      </Route>
      <Route path="/generate">
        <Redirect to="/atelier?mode=describe" />
      </Route>
      <Route path="/files">
        {isAuthenticated ? (
          <DashboardLayout>
            <Files />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Files} />
        )}
      </Route>
      <Route path="/settings">
        {isAuthenticated ? (
          <DashboardLayout>
            <Settings />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Settings} />
        )}
      </Route>
      <Route path="/admin/audit-logs">
        {isAuthenticated ? (
          <DashboardLayout>
            <AuditLogs />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={AuditLogs} />
        )}
      </Route>
      <Route path="/admin">
        {isAuthenticated ? (
          <DashboardLayout>
            <Admin />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Admin} />
        )}
      </Route>
      <Route path="/sessions/:id">
        {isAuthenticated ? (
          <DashboardLayout>
            <CodeSessions />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={CodeSessions} />
        )}
      </Route>
      <Route path="/sessions">
        {isAuthenticated ? (
          <DashboardLayout>
            <CodeSessions />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={CodeSessions} />
        )}
      </Route>
      <Route path="/chat">
        {isAuthenticated ? (
          <DashboardLayout noPadding>
            <Chat />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Chat} />
        )}
      </Route>
      <Route path="/identity">
        {isAuthenticated ? (
          <DashboardLayout>
            <Identity />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Identity} />
        )}
      </Route>
      <Route path="/skills">
        {isAuthenticated ? (
          <DashboardLayout>
            <Skills />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Skills} />
        )}
      </Route>
      <Route path="/memories">
        {isAuthenticated ? (
          <DashboardLayout>
            <Memories />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Memories} />
        )}
      </Route>
      <Route path="/monitors">
        {isAuthenticated ? (
          <DashboardLayout>
            <Monitors />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Monitors} />
        )}
      </Route>
      <Route path="/images">
        {isAuthenticated ? (
          <DashboardLayout>
            <Images />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Images} />
        )}
      </Route>
      <Route path="/connections">
        {isAuthenticated ? (
          <DashboardLayout>
            <Connections />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Connections} />
        )}
      </Route>
      <Route path="/onboarding">
        {isAuthenticated ? (
          <DashboardLayout>
            <Onboarding />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Onboarding} />
        )}
      </Route>
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <VideoPlayerProvider>
          <IntelligenceProvider>
            <TooltipProvider>
              <Toaster richColors position="top-right" />
              <AppRoutes />
            </TooltipProvider>
          </IntelligenceProvider>
        </VideoPlayerProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
