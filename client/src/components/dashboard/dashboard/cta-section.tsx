import { Button } from '@/components/ui/button';
import { ArrowRight, Calendar, FileText, Users } from 'lucide-react';

interface CTASectionProps {
  companyName?: string;
  onScheduleCall?: () => void;
  onDownloadReport?: () => void;
}

export function CTASection({ companyName, onScheduleCall, onDownloadReport }: CTASectionProps) {
  return (
    <section className="bg-gradient-to-br from-brand-navy to-brand-blue py-16">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
          Ready to Transform Your Operations with AI?
        </h2>
        <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
          Our team of AI strategists can help you prioritize these opportunities 
          and build a roadmap for implementation.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            size="lg" 
            className="bg-white text-brand-navy hover:bg-slate-100"
            onClick={onScheduleCall}
            data-testid="button-schedule-call"
          >
            <Calendar className="w-5 h-5 mr-2" />
            Schedule Strategy Call
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          
          <Button 
            size="lg" 
            variant="outline"
            className="border-white/30 text-white hover:bg-white/10"
            onClick={onDownloadReport}
            data-testid="button-download-report"
          >
            <FileText className="w-5 h-5 mr-2" />
            Download Full Report
          </Button>
        </div>
        
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-white/90">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="font-semibold mb-1">Expert Team</h3>
            <p className="text-sm text-white/70">
              Seasoned AI strategists and implementation specialists
            </p>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-semibold mb-1">Proven Framework</h3>
            <p className="text-sm text-white/70">
              Battle-tested methodology for AI transformation
            </p>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-3">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="font-semibold mb-1">Fast Results</h3>
            <p className="text-sm text-white/70">
              From assessment to implementation in weeks, not months
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
