import { Switch, Route, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import type { ComponentType } from "react";

// Route-based code splitting: heavy pages (reports, dashboards, charts, export
// libraries) load on demand instead of bloating the initial bundle. Login and
// NotFound stay eager so the first paint / auth entry point is instant.
const Home = lazy(() => import("@/pages/Home"));
const Report = lazy(() => import("@/pages/Report"));
const ReportViewer = lazy(() => import("@/pages/ReportViewer"));
const HTMLReportViewer = lazy(() => import("@/pages/HTMLReportViewer"));
const SavedReports = lazy(() => import("@/pages/SavedReports"));
const Benchmarks = lazy(() => import("@/pages/Benchmarks"));
const WhatIfAnalysis = lazy(() => import("@/pages/WhatIfAnalysis"));
const AssumptionPanel = lazy(() => import("@/pages/AssumptionPanel"));
const Assumptions = lazy(() => import("@/pages/Assumptions"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const SharedDashboard = lazy(() => import("@/pages/SharedDashboard"));
const CrewAI = lazy(() => import("@/pages/CrewAI"));
const BatchResearch = lazy(() => import("@/pages/BatchResearch"));
const Admin = lazy(() => import("@/pages/Admin"));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0339AF]" />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Redirect via the router (no full page reload) and only after render so we
  // never call setState during another component's render. The server-side
  // auth middleware already 302s direct GETs to protected pages, so this path
  // mainly catches the SPA-only case where the session expires mid-session.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnTo = encodeURIComponent(location);
      setLocation(`/login?returnTo=${returnTo}`);
    }
  }, [isLoading, isAuthenticated, location, setLocation]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0339AF]" />
      </div>
    );
  }

  return <Component />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/shared/:shareId" component={SharedDashboard} />
        <Route path="/">{() => <ProtectedRoute component={Home} />}</Route>
        <Route path="/crewai">{() => <ProtectedRoute component={CrewAI} />}</Route>
        <Route path="/batch-research">{() => <ProtectedRoute component={BatchResearch} />}</Route>
        <Route path="/dashboard/:reportId">{() => <ProtectedRoute component={DashboardPage} />}</Route>
        <Route path="/report">{() => <ProtectedRoute component={Report} />}</Route>
        <Route path="/reports/:id">{() => <ProtectedRoute component={ReportViewer} />}</Route>
        <Route path="/reports/:id/html">{() => <ProtectedRoute component={HTMLReportViewer} />}</Route>
        <Route path="/saved">{() => <ProtectedRoute component={SavedReports} />}</Route>
        <Route path="/saved-reports">{() => <ProtectedRoute component={SavedReports} />}</Route>
        <Route path="/benchmarks">{() => <ProtectedRoute component={Benchmarks} />}</Route>
        <Route path="/whatif/:reportId">{() => <ProtectedRoute component={WhatIfAnalysis} />}</Route>
        <Route path="/assumptions">{() => <ProtectedRoute component={Assumptions} />}</Route>
        <Route path="/assumptions/:reportId">{() => <ProtectedRoute component={AssumptionPanel} />}</Route>
        <Route path="/admin">{() => <ProtectedRoute component={Admin} />}</Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <AppRoutes />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
