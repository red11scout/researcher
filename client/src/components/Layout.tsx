import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, Bell, BarChart3, FileText, Home, Bot, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { brand } from "@/lib/brand";
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface LayoutProps {
  children: ReactNode;
}

interface MobileNavLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClose: () => void;
}

function MobileNavLink({ href, icon, label, isActive, onClose }: MobileNavLinkProps) {
  return (
    <Link 
      href={href} 
      onClick={onClose}
      className={`flex items-center gap-3 min-h-[44px] px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 ${
        isActive 
          ? "bg-brand-navy/10 text-brand-navy border-l-4 border-brand-navy" 
          : "text-slate-600 hover:bg-slate-100 hover:text-brand-navy"
      }`}
      data-testid={`mobile-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {icon}
      {label}
    </Link>
  );
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

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
              <Link 
                href="/batch-research" 
                className={`hover:text-brand-navy transition-colors ${isActive("/batch-research") ? "text-brand-navy font-semibold" : ""}`}
              >
                Batch Research
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <Button variant="ghost" size="icon" className="text-slate-500 h-8 w-8 md:h-9 md:w-9 hover:text-brand-navy">
              <Bell className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
            
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-slate-500 md:hidden h-11 w-11 hover:text-brand-navy hover:bg-slate-100 transition-colors duration-200"
                  data-testid="mobile-menu-trigger"
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[320px] p-0">
                <SheetHeader className="p-6 border-b border-slate-200">
                  <SheetTitle className="flex items-center gap-2">
                    <Logo variant="dark" size="sm" />
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 p-4" data-testid="mobile-nav-menu">
                  <MobileNavLink
                    href="/"
                    icon={<Home className="h-5 w-5" />}
                    label="Home"
                    isActive={isActive("/") && location === "/"}
                    onClose={closeMobileMenu}
                  />
                  <MobileNavLink
                    href="/saved"
                    icon={<FileText className="h-5 w-5" />}
                    label="Saved Reports"
                    isActive={isActive("/saved")}
                    onClose={closeMobileMenu}
                  />
                  <MobileNavLink
                    href="/crewai"
                    icon={<Bot className="h-5 w-5" />}
                    label="CrewAI"
                    isActive={isActive("/crewai")}
                    onClose={closeMobileMenu}
                  />
                  <MobileNavLink
                    href="/benchmarks"
                    icon={<BarChart3 className="h-5 w-5" />}
                    label="Benchmarks"
                    isActive={isActive("/benchmarks")}
                    onClose={closeMobileMenu}
                  />
                  <MobileNavLink
                    href="/batch-research"
                    icon={<Layers className="h-5 w-5" />}
                    label="Batch Research"
                    isActive={isActive("/batch-research")}
                    onClose={closeMobileMenu}
                  />
                </nav>
              </SheetContent>
            </Sheet>
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
