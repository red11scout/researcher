import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Phone, Mail, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CTASectionProps {
  heading?: string;
  subheading?: string;
  email?: string;
  phone?: string;
  buttonText?: string;
  onButtonClick?: () => void;
  variant?: 'default' | 'compact' | 'hero';
}

export function CTASection({
  heading = 'Schedule Your AI Workshop',
  subheading = "Ready to unlock AI's potential for your organization? Let's discuss your specific opportunities.",
  email = 'ai@blueally.com',
  phone = '(888) 505-2583',
  buttonText = 'Book Your Workshop',
  onButtonClick,
  variant = 'default',
}: CTASectionProps) {
  const handleEmailClick = () => {
    window.location.href = `mailto:${email}?subject=AI Workshop Inquiry`;
  };

  const handlePhoneClick = () => {
    window.location.href = `tel:${phone.replace(/[^0-9+]/g, '')}`;
  };

  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-r from-[#7A8B51] to-[#A3C585] rounded-xl p-6 text-white shadow-lg"
        data-testid="cta-section-compact"
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-lg">{heading}</h3>
              <p className="text-green-100 text-sm">{subheading}</p>
            </div>
          </div>
          <Button
            onClick={onButtonClick || handleEmailClick}
            className="bg-white text-[#7A8B51] hover:bg-gray-100 font-semibold shadow-md"
            data-testid="cta-button"
          >
            {buttonText}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#7A8B51] via-[#8A9B61] to-[#A3C585] p-8 md:p-12 text-white shadow-xl"
      data-testid="cta-section"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative z-10 text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-2 mb-6">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-medium">Transform Your Business with AI</span>
        </div>

        <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">
          {heading}
        </h2>
        
        <p className="text-lg text-green-100 mb-8 leading-relaxed">
          {subheading}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <Button
            onClick={onButtonClick || handleEmailClick}
            size="lg"
            className="bg-white text-[#7A8B51] hover:bg-gray-100 font-semibold shadow-lg rounded-full px-8"
            data-testid="cta-button-primary"
          >
            <Calendar className="w-5 h-5 mr-2" />
            {buttonText}
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-green-100">
          <button
            onClick={handleEmailClick}
            className="flex items-center gap-2 hover:text-white transition-colors group"
            data-testid="cta-email"
          >
            <div className="p-2 bg-white/10 rounded-full group-hover:bg-white/20 transition-colors">
              <Mail className="w-4 h-4" />
            </div>
            <span>{email}</span>
          </button>
          
          <button
            onClick={handlePhoneClick}
            className="flex items-center gap-2 hover:text-white transition-colors group"
            data-testid="cta-phone"
          >
            <div className="p-2 bg-white/10 rounded-full group-hover:bg-white/20 transition-colors">
              <Phone className="w-4 h-4" />
            </div>
            <span>{phone}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default CTASection;
