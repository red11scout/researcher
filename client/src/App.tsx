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
import Assumptions from "@/pages/Assumptions";
import DashboardPage from "@/pages/DashboardPage";
import SharedDashboard from "@/pages/SharedDashboard";
import CrewAI from "@/pages/CrewAI";
import BatchResearch from "@/pages/BatchResearch";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/crewai" component={CrewAI} />
          <Route path="/batch-research" component={BatchResearch} />
          <Route path="/dashboard/:reportId" component={DashboardPage} />
          <Route path="/report" component={Report} />
          <Route path="/reports/:id" component={ReportViewer} />
          <Route path="/reports/:id/html" component={HTMLReportViewer} />
          <Route path="/saved" component={SavedReports} />
          <Route path="/benchmarks" component={Benchmarks} />
          <Route path="/whatif/:reportId" component={WhatIfAnalysis} />
          <Route path="/assumptions" component={Assumptions} />
          <Route path="/assumptions/:reportId" component={AssumptionPanel} />
          <Route path="/shared/:shareId" component={SharedDashboard} />
          <Route component={NotFound} />
        </Switch>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
