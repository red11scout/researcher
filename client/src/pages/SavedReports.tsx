import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Search, FileText, MoreHorizontal, Download, Trash2, Calendar } from "lucide-react";
import { Link } from "wouter";

export default function SavedReports() {
  const reports = [
    { id: 1, company: "Nvidia Corp", date: "2025-05-12", type: "Full Analysis", status: "Complete" },
    { id: 2, company: "Stripe Inc", date: "2025-05-10", type: "Financial Deep Dive", status: "Complete" },
    { id: 3, company: "SpaceX", date: "2025-05-08", type: "Risk Assessment", status: "Complete" },
    { id: 4, company: "Databricks", date: "2025-05-01", type: "Full Analysis", status: "Archived" },
    { id: 5, company: "OpenAI", date: "2025-04-28", type: "Competitor Analysis", status: "Complete" },
  ];

  return (
    <Layout>
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Saved Reports</h1>
            <p className="text-muted-foreground mt-1">Access and manage your generated research reports.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Filter reports..." className="pl-9 bg-background" />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Report Type</TableHead>
                  <TableHead>Date Generated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id} className="group">
                    <TableCell className="font-medium">
                      <Link href={`/report?company=${report.company}`} className="flex items-center gap-3 hover:text-primary transition-colors">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {report.company.substring(0, 2).toUpperCase()}
                        </div>
                        {report.company}
                      </Link>
                    </TableCell>
                    <TableCell>{report.type}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {report.date}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={report.status === 'Complete' ? 'default' : 'secondary'} className="font-normal">
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}