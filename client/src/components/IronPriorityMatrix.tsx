import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Crown, Rocket, AlertTriangle, Target, TrendingUp, Gauge, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface UseCase {
  id: string;
  name: string;
  businessImpact: number;
  feasibility: number;
  category: 'quickWins' | 'bigBets' | 'ironCore' | 'moneyPit';
  priorityScore?: number;
  annualValue?: number;
  description?: string;
}

interface IronPriorityMatrixProps {
  useCases: any[];
  className?: string;
}

const QUADRANT_CONFIG = {
  ironCore: {
    name: "Iron Core",
    subtitle: "Must Haves",
    color: "#F59E0B",
    glowColor: "rgba(245, 158, 11, 0.6)",
    bgGradient: "linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.08) 100%)",
    icon: Crown,
    description: "High Impact + High Feasibility",
    position: { x: 75, y: 25 }
  },
  bigBets: {
    name: "Big Bets",
    subtitle: "Strategic Plays",
    color: "#A855F7",
    glowColor: "rgba(168, 85, 247, 0.6)",
    bgGradient: "linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(139, 92, 246, 0.08) 100%)",
    icon: Rocket,
    description: "High Impact + Lower Feasibility",
    position: { x: 25, y: 25 }
  },
  quickWins: {
    name: "Quick Wins",
    subtitle: "Low Hanging Fruit",
    color: "#06B6D4",
    glowColor: "rgba(6, 182, 212, 0.6)",
    bgGradient: "linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(14, 165, 233, 0.08) 100%)",
    icon: Zap,
    description: "Lower Impact + High Feasibility",
    position: { x: 75, y: 75 }
  },
  moneyPit: {
    name: "Money Pit",
    subtitle: "Reconsider",
    color: "#6B7280",
    glowColor: "rgba(107, 114, 128, 0.4)",
    bgGradient: "linear-gradient(135deg, rgba(107, 114, 128, 0.1) 0%, rgba(75, 85, 99, 0.05) 100%)",
    icon: AlertTriangle,
    description: "Lower Impact + Lower Feasibility",
    position: { x: 25, y: 75 }
  }
};

function categorizeUseCase(impact: number, feasibility: number): UseCase['category'] {
  const impactThreshold = 50;
  const feasibilityThreshold = 50;
  
  if (impact >= impactThreshold && feasibility >= feasibilityThreshold) return 'ironCore';
  if (impact >= impactThreshold && feasibility < feasibilityThreshold) return 'bigBets';
  if (impact < impactThreshold && feasibility >= feasibilityThreshold) return 'quickWins';
  return 'moneyPit';
}

function calculateScores(useCase: any, index: number): { impact: number; feasibility: number } {
  const priorityScore = useCase["Priority Score"] || useCase.priorityScore || 50;
  const annualValue = parseFloat(String(useCase["Annual Value"] || useCase["Total Annual Value ($)"] || useCase.annualValue || "0").replace(/[$,]/g, "")) || 0;
  const tier = useCase["Priority Tier"] || useCase.priorityTier || "Medium";
  const ttv = useCase["Time to Value"] || useCase["Time-to-Value"] || useCase["Recommended Phase"] || useCase.timeToValue || "";
  const effort = useCase["Implementation Effort"] || useCase["Effort"] || useCase.effort || "Medium";
  const valueScore = useCase["Value Score"] || 0;
  const effortScore = useCase["Effort Score"] || 50;
  
  let impact = 0;
  if (valueScore > 0) {
    impact = valueScore;
  } else {
    impact = priorityScore * 0.6;
    if (annualValue > 5000000) impact += 25;
    else if (annualValue > 1000000) impact += 18;
    else if (annualValue > 500000) impact += 12;
    else if (annualValue > 100000) impact += 8;
    
    if (tier === "Critical") impact += 15;
    else if (tier === "High") impact += 10;
    else if (tier === "Medium") impact += 5;
  }
  
  impact = Math.min(100, Math.max(5, impact));
  
  let feasibility = 50;
  if (effortScore > 0) {
    feasibility = 100 - (effortScore * 0.6);
  }
  
  const ttvLower = ttv.toLowerCase();
  if (ttvLower.includes("q1") || ttvLower.includes("0-3") || ttvLower.includes("immediate")) feasibility += 25;
  else if (ttvLower.includes("q2") || ttvLower.includes("3-6")) feasibility += 15;
  else if (ttvLower.includes("q3") || ttvLower.includes("6-12")) feasibility += 5;
  else if (ttvLower.includes("q4") || ttvLower.includes("12+")) feasibility -= 10;
  
  const effortLower = String(effort).toLowerCase();
  if (effortLower.includes("low") || effortLower.includes("easy")) feasibility += 15;
  else if (effortLower.includes("medium") || effortLower.includes("moderate")) feasibility += 5;
  else if (effortLower.includes("high") || effortLower.includes("complex")) feasibility -= 10;
  else if (effortLower.includes("very high") || effortLower.includes("critical")) feasibility -= 20;
  
  feasibility = Math.min(100, Math.max(5, feasibility));
  
  const jitter = ((index * 7) % 8) - 4;
  impact = Math.min(95, Math.max(5, impact + jitter * 0.4));
  feasibility = Math.min(95, Math.max(5, feasibility + jitter * 0.3));
  
  return { impact, feasibility };
}

function transformUseCases(rawUseCases: any[]): UseCase[] {
  if (!rawUseCases || rawUseCases.length === 0) return [];
  
  return rawUseCases.slice(0, 10).map((uc, index) => {
    const { impact, feasibility } = calculateScores(uc, index);
    const category = categorizeUseCase(impact, feasibility);
    
    return {
      id: uc.ID || uc.id || `UC-${String(index + 1).padStart(2, '0')}`,
      name: uc["Use Case"] || uc["Use Case Name"] || uc.name || `Use Case ${index + 1}`,
      businessImpact: impact,
      feasibility: feasibility,
      category,
      priorityScore: uc["Priority Score"] || uc.priorityScore,
      annualValue: parseFloat(String(uc["Annual Value"] || uc.annualValue || "0").replace(/[$,]/g, "")) || 0,
      description: uc["Description"] || uc.description
    };
  });
}

export default function IronPriorityMatrix({ useCases, className = "" }: IronPriorityMatrixProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const processedUseCases = useMemo(() => transformUseCases(useCases), [useCases]);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const quadrantCounts = useMemo(() => {
    const counts = { ironCore: 0, bigBets: 0, quickWins: 0, moneyPit: 0 };
    processedUseCases.forEach(uc => counts[uc.category]++);
    return counts;
  }, [processedUseCases]);

  if (processedUseCases.length === 0) {
    return (
      <div className={`relative w-full aspect-square max-w-2xl mx-auto ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No use cases available for prioritization</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
            <Target className="h-5 w-5 text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Iron Priority Matrix</h3>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-slate-400 hover:text-slate-600 transition-colors" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">2x2 prioritization matrix plotting use cases by Business Impact (Y-axis) and Feasibility (X-axis). Hover nodes for details.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-sm text-slate-500">Strategic positioning of {processedUseCases.length} AI use cases</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(Object.entries(QUADRANT_CONFIG) as [keyof typeof QUADRANT_CONFIG, typeof QUADRANT_CONFIG[keyof typeof QUADRANT_CONFIG]][]).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="relative overflow-hidden rounded-xl p-3"
              style={{ 
                background: `linear-gradient(145deg, #2a2a3e 0%, #1a1a2e 50%, #0f0f1a 100%)`,
                border: `1px solid ${config.color}30`,
                boxShadow: `0 4px 15px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 20px ${config.glowColor}`
              }}
            >
              <div 
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 3px)`
                }}
              />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4" style={{ color: config.color, filter: `drop-shadow(0 0 4px ${config.glowColor})` }} />
                  <span className="text-xs font-semibold" style={{ color: config.color }}>{config.name}</span>
                </div>
                <div className="text-2xl font-bold text-white" style={{ textShadow: `0 0 10px ${config.glowColor}` }}>{quadrantCounts[key]}</div>
                <div className="text-[10px] text-slate-400">{config.subtitle}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div 
        className="relative w-full aspect-square max-w-2xl mx-auto rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}
      >
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              repeating-linear-gradient(90deg, transparent, transparent 49px, rgba(255,255,255,0.03) 49px, rgba(255,255,255,0.03) 50px),
              repeating-linear-gradient(0deg, transparent, transparent 49px, rgba(255,255,255,0.03) 49px, rgba(255,255,255,0.03) 50px)
            `
          }}
        />

        {(Object.entries(QUADRANT_CONFIG) as [keyof typeof QUADRANT_CONFIG, typeof QUADRANT_CONFIG[keyof typeof QUADRANT_CONFIG]][]).map(([key, config]) => (
          <div
            key={key}
            className="absolute w-1/2 h-1/2"
            style={{
              left: config.position.x > 50 ? '50%' : 0,
              top: config.position.y > 50 ? '50%' : 0,
              background: config.bgGradient,
            }}
          >
            <div 
              className="absolute inset-2 flex flex-col items-center justify-center opacity-40 pointer-events-none"
            >
              <config.icon className="h-8 w-8 mb-1" style={{ color: config.color }} />
              <span className="text-[10px] font-semibold tracking-wider" style={{ color: config.color }}>
                {config.name.toUpperCase()}
              </span>
            </div>
          </div>
        ))}

        <div 
          className="absolute left-1/2 top-0 bottom-0 w-[2px]"
          style={{
            background: 'linear-gradient(180deg, rgba(245,158,11,0.6) 0%, rgba(168,85,247,0.4) 50%, rgba(6,182,212,0.6) 100%)',
            boxShadow: '0 0 20px rgba(245,158,11,0.3), 0 0 40px rgba(168,85,247,0.2)'
          }}
        />
        <div 
          className="absolute top-1/2 left-0 right-0 h-[2px]"
          style={{
            background: 'linear-gradient(90deg, rgba(107,114,128,0.4) 0%, rgba(168,85,247,0.4) 25%, rgba(245,158,11,0.6) 50%, rgba(6,182,212,0.6) 100%)',
            boxShadow: '0 0 20px rgba(245,158,11,0.3)'
          }}
        />

        <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center">
          <div 
            className="text-[10px] font-semibold tracking-wider rotate-[-90deg] whitespace-nowrap"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            BUSINESS IMPACT
          </div>
        </div>
        <div className="absolute left-0 right-0 bottom-0 h-8 flex items-center justify-center">
          <div 
            className="text-[10px] font-semibold tracking-wider"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            FEASIBILITY →
          </div>
        </div>

        <div className="absolute left-2 top-1 text-[8px] text-slate-500">High</div>
        <div className="absolute left-2 bottom-9 text-[8px] text-slate-500">Low</div>
        <div className="absolute right-2 bottom-1 text-[8px] text-slate-500">High</div>
        <div className="absolute left-10 bottom-1 text-[8px] text-slate-500">Low</div>

        <AnimatePresence>
          {processedUseCases.map((uc, index) => {
            const config = QUADRANT_CONFIG[uc.category];
            const x = 10 + (uc.feasibility * 0.8);
            const y = 90 - (uc.businessImpact * 0.8);
            const isHovered = hoveredNode === uc.id;
            
            return (
              <motion.div
                key={uc.id}
                initial={{ 
                  opacity: 0, 
                  scale: 0,
                  x: `${50}%`,
                  y: `${50}%`
                }}
                animate={isLoaded ? { 
                  opacity: 1, 
                  scale: 1,
                  x: `${x}%`,
                  y: `${y}%`
                } : {}}
                transition={{ 
                  delay: index * 0.08,
                  duration: 0.6,
                  type: "spring",
                  stiffness: 100,
                  damping: 15
                }}
                className="absolute"
                style={{
                  left: 0,
                  top: 0,
                  transform: `translate(-50%, -50%)`
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.div
                      className="relative cursor-pointer"
                      onMouseEnter={() => setHoveredNode(uc.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      whileHover={{ scale: 1.3 }}
                      animate={isHovered ? {} : { 
                        scale: [1, 1.05, 1],
                      }}
                      transition={isHovered ? {} : {
                        duration: 2 + (index * 0.2),
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      <div 
                        className="absolute inset-0 rounded-full blur-md"
                        style={{
                          background: config.glowColor,
                          transform: 'scale(1.5)',
                          opacity: isHovered ? 0.8 : 0.4
                        }}
                      />
                      
                      <div 
                        className="relative w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-xs"
                        style={{
                          background: `linear-gradient(135deg, ${config.color} 0%, ${config.color}aa 100%)`,
                          boxShadow: `0 4px 15px ${config.glowColor}, inset 0 1px 0 rgba(255,255,255,0.3)`,
                          border: '2px solid rgba(255,255,255,0.2)',
                          color: 'white',
                          textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                        }}
                      >
                        {index + 1}
                      </div>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent 
                    side="top" 
                    className="max-w-xs p-0 overflow-hidden"
                    style={{
                      background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)',
                      border: `1px solid ${config.color}40`,
                      boxShadow: `0 10px 40px rgba(0,0,0,0.5), 0 0 20px ${config.glowColor}`
                    }}
                  >
                    <div 
                      className="h-1"
                      style={{ background: `linear-gradient(90deg, ${config.color}, ${config.color}80)` }}
                    />
                    <div className="p-3">
                      <div className="flex items-start gap-2 mb-2">
                        <div 
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: config.color, color: 'white' }}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-white text-sm leading-tight">{uc.name}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: config.color }}>{config.name}</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div className="bg-white/5 rounded-lg p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <TrendingUp className="h-3 w-3 text-slate-400" />
                            <span className="text-[10px] text-slate-400">Impact</span>
                          </div>
                          <div className="text-sm font-bold text-white">{uc.businessImpact.toFixed(0)}</div>
                          <div className="h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
                            <div 
                              className="h-full rounded-full"
                              style={{ 
                                width: `${uc.businessImpact}%`,
                                background: `linear-gradient(90deg, ${config.color}, ${config.color}80)`
                              }}
                            />
                          </div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <Gauge className="h-3 w-3 text-slate-400" />
                            <span className="text-[10px] text-slate-400">Feasibility</span>
                          </div>
                          <div className="text-sm font-bold text-white">{uc.feasibility.toFixed(0)}</div>
                          <div className="h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
                            <div 
                              className="h-full rounded-full"
                              style={{ 
                                width: `${uc.feasibility}%`,
                                background: `linear-gradient(90deg, ${config.color}, ${config.color}80)`
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      {uc.annualValue && uc.annualValue > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-700/50">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">Annual Value</span>
                            <span className="text-sm font-bold text-emerald-400">
                              ${((uc.annualValue || 0) / 1000000).toFixed(1)}M
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
        {(Object.entries(QUADRANT_CONFIG) as [keyof typeof QUADRANT_CONFIG, typeof QUADRANT_CONFIG[keyof typeof QUADRANT_CONFIG]][]).map(([key, config]) => {
          const cases = processedUseCases.filter(uc => uc.category === key);
          if (cases.length === 0) return null;
          
          return (
            <div 
              key={key}
              className="rounded-lg p-2 relative overflow-hidden"
              style={{ 
                background: `linear-gradient(145deg, #1f1f2e 0%, #15152a 100%)`,
                border: `1px solid ${config.color}25`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 2px 8px rgba(0,0,0,0.2)`
              }}
            >
              <div 
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(255,255,255,0.02) 1px, rgba(255,255,255,0.02) 2px)`
                }}
              />
              <div className="relative">
                <div className="font-semibold mb-1 flex items-center gap-1" style={{ color: config.color }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: config.color, boxShadow: `0 0 6px ${config.glowColor}` }} />
                  {config.name}
                </div>
                {cases.map(uc => (
                  <div key={uc.id} className="text-slate-400 truncate pl-2.5">
                    • {uc.name}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
