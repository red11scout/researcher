import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Report from "@/pages/Report";
import ReportViewer from "@/pages/ReportViewer";
import HTMLReportViewer from "@/pages/HTMLReportViewer";
import SavedReports from "@/pages/SavedReports";
import Benchmarks from "@/pages/Benchmarks";
import WhatIfAnalysis from "@/pages/WhatIfAnalysis";
import AssumptionPanel from "@/pages/AssumptionPanel";
import Assumptions from "@/pages/Assumptions";
import DashboardPage from "@/pages/DashboardPage";
import SharedDashboard from "@/pages/SharedDashboard";
import CrewAI from "@/pages/CrewAI";
import BatchResearch from "@/pages/BatchResearch";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import type { ComponentType } from "react";

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0339AF]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location);
    window.location.href = `/login?returnTo=${returnTo}`;
    return null;
  }

  return <Component />;
}

function AppRoutes() {
  return (
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
