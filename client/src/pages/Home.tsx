import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, ArrowRight, Building2, TrendingUp, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import heroBg from "@assets/generated_images/clean_white_and_blue_abstract_enterprise_background.png";

export default function Home() {
  const [query, setQuery] = useState("");
  const [_, setLocation] = useLocation();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setLocation(`/report?company=${encodeURIComponent(query)}`);
    }
  };

  return (
    <Layout>
      <div className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center overflow-hidden">
        {/* Abstract Background */}
        <div className="absolute inset-0 z-0 opacity-10">
          <img 
            src={heroBg} 
            alt="Background" 
            className="w-full h-full object-cover"
          />
        </div>

        <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center max-w-4xl mx-auto -mt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20 mb-6">
              <Sparkles className="mr-1 h-3 w-3" />
              Powered by Claude AI 3.5 Sonnet
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-bold tracking-tight text-foreground mb-6">
              Deep corporate intelligence, <br />
              <span className="text-primary">simplified.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Generate comprehensive research reports with industry benchmarks, 
              risk analysis, and strategic insights in seconds.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-2xl"
          >
            <form onSubmit={handleSearch} className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-blue-600/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative flex items-center bg-background border rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 p-2">
                <Search className="ml-4 h-6 w-6 text-muted-foreground" />
                <Input 
                  type="text" 
                  placeholder="Enter company name (e.g. Nvidia, Stripe, Tesla)..." 
                  className="flex-1 border-0 bg-transparent text-lg h-14 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                <Button size="lg" type="submit" className="h-12 px-8 rounded-lg text-base font-medium shadow-none">
                  Research
                </Button>
              </div>
            </form>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 w-full"
          >
            <FeatureCard 
              icon={<Building2 className="h-6 w-6 text-primary" />}
              title="Comprehensive Profiles"
              description="Detailed overview of business models, products, and market positioning."
            />
            <FeatureCard 
              icon={<TrendingUp className="h-6 w-6 text-primary" />}
              title="Market Benchmarks"
              description="Conservative industry estimates and competitor analysis driven by data."
            />
            <FeatureCard 
              icon={<ShieldCheck className="h-6 w-6 text-primary" />}
              title="Critical Analysis"
              description="AI-driven self-critique to ensure accuracy and highlight potential risks."
            />
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center p-6 rounded-xl border bg-card/50 backdrop-blur-sm hover:bg-card transition-colors text-center">
      <div className="mb-4 p-3 rounded-full bg-primary/10">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}