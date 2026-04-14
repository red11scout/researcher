import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, BookOpen } from 'lucide-react';

interface MethodologyItem {
  title: string;
  range: string;
  description: string;
}

const METHODOLOGY_ITEMS: MethodologyItem[] = [
  {
    title: "Probability of Success",
    range: "0.50–0.95",
    description: "Confidence that the use case will deliver projected value at production scale. Derived from maturity of underlying AI technology, availability of training data, organizational readiness, and market precedent. A conversation AI returning 0.85 reflects proven technology; a novel predictive model at 0.60 reflects emerging capability.",
  },
  {
    title: "Realization Factor",
    range: "0.80–0.95",
    description: "The fraction of theoretical benefit that survives contact with operational reality. Accounts for adoption lag, process friction, and measurement imprecision. Revenue benefits carry 0.95 (most measurable). Risk benefits carry 0.80 (most uncertain, actuarial nature).",
  },
  {
    title: "Adoption Rate",
    range: "0.75–0.95",
    description: "The percentage of eligible users and processes that will adopt the AI solution within the measurement period. Reflects change management readiness, training investment, and cultural fit.",
  },
  {
    title: "Data Maturity",
    range: "0.60–1.00",
    description: "Organizational data quality and accessibility scaled from Level 1 (ad-hoc, 0.60) to Level 5 (optimizing, 1.00). Most organizations assess at Level 2 (0.75). Derived from data governance maturity, system integration level, and data quality metrics.",
  },
  {
    title: "Value Normalization",
    range: "1–10",
    description: "Min-max normalization across all use cases: Score = 1 + ((Value - Min) / (Max - Min)) × 9. Ensures relative comparison is deterministic and scales dynamically with report data.",
  },
  {
    title: "Readiness Score",
    range: "1–10",
    description: "Weighted composite of four components: Organizational Capacity (30%), Data Availability & Quality (30%), Technical Infrastructure (20%), and AI-Specific Governance (20%). Each component scored 1–10 based on organizational assessment.",
  },
  {
    title: "Priority Score",
    range: "1–10",
    description: "Equal-weighted average of Readiness Score and Normalized Value Score: (Readiness × 0.5) + (Value × 0.5). Determines tier placement: Champions (≥7.5), Quick Wins, Strategic, or Foundation.",
  },
];

const FORMULA_ITEMS = [
  { label: "Cost Benefit", formula: "Hours Saved × Loaded Hourly Rate × Benefits Loading (1.35×) × Adoption Rate × Data Maturity" },
  { label: "Revenue Benefit", formula: "Revenue Uplift % × Revenue at Risk × Realization Factor × Data Maturity" },
  { label: "Cash Flow Benefit", formula: "Annual Revenue × (Days Improved / 365) × Cost of Capital × Realization Factor" },
  { label: "Risk Benefit", formula: "Risk Reduction % × Risk Exposure × Realization Factor × Data Maturity" },
  { label: "Expected Value", formula: "Total Annual Benefit × Probability of Success" },
];

export function MethodologySection() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="py-12 md:py-20 bg-white">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Methodology & Scoring Framework</h2>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </motion.div>
        </button>

        <p className="mt-2 text-sm text-slate-500 max-w-2xl">
          Every number earns its place. This section explains the derivation of key parameters used throughout the assessment.
        </p>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {METHODOLOGY_ITEMS.map((item) => (
                  <div
                    key={item.title}
                    className="bg-slate-50 rounded-xl p-5 border border-slate-100"
                  >
                    <div className="flex items-baseline justify-between mb-2">
                      <h3 className="font-semibold text-slate-900 text-sm">{item.title}</h3>
                      <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {item.range}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 bg-slate-50 rounded-xl p-6 border border-slate-100">
                <h3 className="font-semibold text-slate-900 text-sm mb-4">Standard Benefit Formulas</h3>
                <div className="space-y-3">
                  {FORMULA_ITEMS.map((item) => (
                    <div key={item.label} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                      <span className="text-xs font-semibold text-slate-700 min-w-[120px]">{item.label}:</span>
                      <span className="text-xs font-mono text-slate-500">{item.formula}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
