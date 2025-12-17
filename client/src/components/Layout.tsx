import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Menu, Bell, BarChart3, FileText, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { brand } from "@/lib/brand";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  
  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container flex h-14 md:h-16 items-center justify-between px-3 md:px-6">
          <div className="flex items-center gap-2 md:gap-6">
            <Link href="/" className="flex items-center gap-2">
              <Logo variant="dark" size="md" />
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <Link 
                href="/" 
                className={`hover:text-brand-navy transition-colors ${isActive("/") && location === "/" ? "text-brand-navy font-semibold" : ""}`}
              >
                Research
              </Link>
              <Link 
                href="/saved" 
                className={`hover:text-brand-navy transition-colors ${isActive("/saved") ? "text-brand-navy font-semibold" : ""}`}
              >
                Saved Reports
              </Link>
              <Link 
                href="/benchmarks" 
                className={`hover:text-brand-navy transition-colors ${isActive("/benchmarks") ? "text-brand-navy font-semibold" : ""}`}
              >
                Benchmarks
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <Button variant="ghost" size="icon" className="text-slate-500 h-8 w-8 md:h-9 md:w-9 hover:text-brand-navy">
              <Bell className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-slate-500 md:hidden h-8 w-8 hover:text-brand-navy">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href="/" className="flex items-center gap-2 w-full">
                    <Home className="h-4 w-4" />
                    Research
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/saved" className="flex items-center gap-2 w-full">
                    <FileText className="h-4 w-4" />
                    Saved Reports
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/benchmarks" className="flex items-center gap-2 w-full">
                    <BarChart3 className="h-4 w-4" />
                    Benchmarks
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      
      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 py-4 md:py-0">
        <div className="container flex flex-col items-center justify-between gap-3 md:h-16 md:flex-row px-3 md:px-6">
          <p className="text-center text-xs md:text-sm leading-relaxed text-slate-500 md:text-left">
            © {new Date().getFullYear()} {brand.fullName}. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs md:text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-emerald-500"></span>
              System Operational
            </span>
            <Logo variant="dark" size="xs" showText={false} />
          </div>
        </div>
      </footer>
    </div>
  );
}
