import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import Login from "@/pages/Login";

function isPublicRoute(path: string): boolean {
  return path.startsWith("/shared/") || /^\/reports\/\d+\/html/.test(path);
}

function ProtectedRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/crewai" component={CrewAI} />
      <Route path="/batch-research" component={BatchResearch} />
      <Route path="/dashboard/:reportId" component={DashboardPage} />
      <Route path="/report" component={Report} />
      <Route path="/reports/:id" component={ReportViewer} />
      <Route path="/saved" component={SavedReports} />
      <Route path="/benchmarks" component={Benchmarks} />
      <Route path="/whatif/:reportId" component={WhatIfAnalysis} />
      <Route path="/assumptions" component={Assumptions} />
      <Route path="/assumptions/:reportId" component={AssumptionPanel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/shared/:shareId" component={SharedDashboard} />
      <Route path="/reports/:id/html" component={HTMLReportViewer} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem("ba_authenticated") === "true"
  );

  const onPublicRoute = isPublicRoute(location);

  if (onPublicRoute) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <PublicRouter />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  if (!isAuthenticated) {
    return <Login onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ProtectedRouter />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
