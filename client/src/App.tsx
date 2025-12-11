import { Switch, Route } from "wouter";
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
import DashboardPage from "@/pages/DashboardPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/report" component={Report} />
      <Route path="/reports/:id/html" component={HTMLReportViewer} />
      <Route path="/reports/:id" component={ReportViewer} />
      <Route path="/saved" component={SavedReports} />
      <Route path="/benchmarks" component={Benchmarks} />
      <Route path="/whatif/:reportId" component={WhatIfAnalysis} />
      <Route path="/assumptions/:reportId" component={AssumptionPanel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;