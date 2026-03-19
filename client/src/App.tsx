import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import Workflow from "./pages/Workflow";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BusinessProvider } from "./contexts/BusinessContext";
import { VideoPlayerProvider } from "./contexts/VideoPlayerContext";
import BusinessPage from "./pages/Business";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Generate from "./pages/Generate";
import Atelier from "./pages/Atelier";
import Board from "./pages/Board";
import Files from "./pages/Files";
import Settings from "./pages/Settings";
import Dashboard from "./pages/Dashboard";
import Receipts from "./pages/Receipts";
import ReviewQueue from "./pages/ReviewQueue";
import Tasks from "./pages/Tasks";
import Procurement from "./pages/Procurement";
import Reports from "./pages/Reports";
import WhatsAppSimulator from "./pages/WhatsAppSimulator";
import Billing from "./pages/Billing";
import Pricing from "./pages/Pricing";
import Admin from "./pages/Admin";
import AuditLogs from "./pages/AuditLogs";
import Chat from "./pages/Chat";
import Onboarding from "./pages/Onboarding";
import Discover from "./pages/Discover";
import Identity from "./pages/Identity";
import Skills from "./pages/Skills";
import Memories from "./pages/Memories";
import Connections from "./pages/Connections";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import PublicProfile from "./pages/PublicProfile";
import ComponentShowcase from "./pages/ComponentShowcase";
import ImageGen from "./pages/ImageGen";
import KpisDashboard from "./pages/KpisDashboard";
import HealthDashboard from "./pages/HealthDashboard";
import HerSettings from "./pages/HerSettings";
import Feed from "./pages/Feed";
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
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/board">
        {isAuthenticated ? (
          <DashboardLayout>
            <Board />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Board} />
        )}
      </Route>
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
        {isAuthenticated ? (
          <DashboardLayout>
            <Generate />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Generate} />
        )}
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
      <Route path="/feed">
        {isAuthenticated ? (
          <Feed />
        ) : (
          <ProtectedRoute component={Feed} />
        )}
      </Route>
      <Route path="/her-settings">
        {isAuthenticated ? (
          <DashboardLayout>
            <HerSettings />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={HerSettings} />
        )}
      </Route>
      <Route path="/dashboard">
        {isAuthenticated ? (
          <DashboardLayout>
            <Dashboard />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Dashboard} />
        )}
      </Route>
      <Route path="/receipts">
        {isAuthenticated ? (
          <DashboardLayout>
            <Receipts />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Receipts} />
        )}
      </Route>
      <Route path="/review">
        {isAuthenticated ? (
          <DashboardLayout>
            <ReviewQueue />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={ReviewQueue} />
        )}
      </Route>
      <Route path="/tasks">
        {isAuthenticated ? (
          <DashboardLayout>
            <Tasks />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Tasks} />
        )}
      </Route>
      <Route path="/procurement">
        {isAuthenticated ? (
          <DashboardLayout>
            <Procurement />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Procurement} />
        )}
      </Route>
      <Route path="/reports">
        {isAuthenticated ? (
          <DashboardLayout>
            <Reports />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Reports} />
        )}
      </Route>
      <Route path="/whatsapp">
        {isAuthenticated ? (
          <DashboardLayout>
            <WhatsAppSimulator />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={WhatsAppSimulator} />
        )}
      </Route>
      <Route path="/billing">
        {isAuthenticated ? (
          <DashboardLayout>
            <Billing />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Billing} />
        )}
      </Route>
      <Route path="/pricing">
        {isAuthenticated ? (
          <DashboardLayout>
            <Pricing />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Pricing} />
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
      <Route path="/business">
        {isAuthenticated ? (
          <DashboardLayout>
            <BusinessPage />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={BusinessPage} />
        )}
      </Route>
      <Route path="/discover">
        {isAuthenticated ? (
          <DashboardLayout>
            <Discover />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Discover} />
        )}
      </Route>
      <Route path="/u/:handle" component={PublicProfile} />
      <Route path="/components">
        {isAuthenticated ? (
          <DashboardLayout>
            <ComponentShowcase />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={ComponentShowcase} />
        )}
      </Route>
      <Route path="/image-gen">
        {isAuthenticated ? (
          <DashboardLayout>
            <ImageGen />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={ImageGen} />
        )}
      </Route>
      <Route path="/kpis">
        {isAuthenticated ? (
          <DashboardLayout>
            <KpisDashboard />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={KpisDashboard} />
        )}
      </Route>
      <Route path="/health">
        {isAuthenticated ? (
          <DashboardLayout>
            <HealthDashboard />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={HealthDashboard} />
        )}
      </Route>
      <Route path="/workflow">
        {isAuthenticated ? (
          <DashboardLayout noPadding>
            <Workflow />
          </DashboardLayout>
        ) : (
          <ProtectedRoute component={Workflow} />
        )}
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BusinessProvider>
          <VideoPlayerProvider>
          <IntelligenceProvider>
            <TooltipProvider>
              <Toaster richColors position="top-right" />
              <AppRoutes />
            </TooltipProvider>
          </IntelligenceProvider>
          </VideoPlayerProvider>
        </BusinessProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
