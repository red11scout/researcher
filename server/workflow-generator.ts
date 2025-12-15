import Anthropic from "@anthropic-ai/sdk";
import type {
  AgenticPattern,
  UseCaseWorkflowData,
  WorkflowStep,
  TargetWorkflowStep,
  WorkflowComparisonMetrics,
  MiroMetadata,
  WorkflowExportData,
  WorkflowExportOptions,
} from "@shared/schema";
import { AGENTIC_PATTERNS, AGENTIC_PATTERN_META, DEFAULT_MIRO_METADATA } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

interface UseCase {
  id?: string;
  name: string;
  description?: string;
  businessFunction?: string;
  frictionPoint?: string;
  benefits?: {
    revenue?: number;
    cost?: number;
    cashFlow?: number;
    risk?: number;
  };
}

const WORKFLOW_GENERATION_PROMPT = `You are an expert business process analyst specializing in AI transformation. Generate detailed workflow data for the given use case.

CRITICAL REQUIREMENTS:
1. Current State: 6-10 steps showing the manual/legacy process
2. Target State: 8-12 steps showing the AI-enhanced process
3. EVERY workflow MUST have at least ONE Human-in-the-Loop checkpoint in target state
4. Current state MUST identify bottlenecks and friction points
5. All durations must be realistic estimates based on industry standards
6. Steps must connect logically via connectedTo array

OUTPUT FORMAT (strict JSON):
{
  "agenticPattern": "One of: Orchestrator-Workers, Semantic Router, ReAct Loop, Drafter-Critic, Constitutional Guardrail, RAG Detective, Memetic Agent, Human-in-the-Loop",
  "patternRationale": "2-3 sentences explaining why this pattern fits",
  "currentStateWorkflow": [
    {
      "stepNumber": 1,
      "stepId": "CS-01",
      "stepName": "Step Name",
      "description": "What happens in this step",
      "actor": {"type": "human|system", "name": "Actor Name", "role": "Job Title"},
      "duration": {"value": 15, "unit": "minutes|hours|days", "variability": "per item|per batch|per day|fixed"},
      "systems": ["CRM", "Excel"],
      "dataSources": ["Customer data", "Manual forms"],
      "isBottleneck": true,
      "isFrictionPoint": true,
      "isDecisionPoint": false,
      "painPoints": ["58% time wasted on low-value tasks", "No data-driven decisions"],
      "connectedTo": ["CS-02"]
    }
  ],
  "targetStateWorkflow": [
    {
      "stepNumber": 1,
      "stepId": "TS-01",
      "stepName": "Step Name",
      "description": "What happens in this AI-enhanced step",
      "actor": {"type": "human|system|ai_agent", "name": "Actor Name", "role": "Job Title or AI Agent"},
      "duration": {"value": 2, "unit": "minutes|hours|days", "variability": "per item|per batch|per day|fixed"},
      "systems": ["AI Platform", "CRM"],
      "dataSources": ["Real-time API", "Knowledge base"],
      "isBottleneck": false,
      "isFrictionPoint": false,
      "isDecisionPoint": false,
      "painPoints": [],
      "connectedTo": ["TS-02"],
      "isAIEnabled": true,
      "isHumanInTheLoop": false,
      "aiCapabilities": ["Classification", "Routing", "Prediction"],
      "agentType": "Semantic Router",
      "model": "Claude Sonnet",
      "automationLevel": "full|assisted|supervised|manual"
    }
  ],
  "comparisonMetrics": {
    "timeReduction": {"before": "15 hrs/week", "after": "6 hrs/week", "improvement": "60%"},
    "costReduction": {"before": "$50K/month", "after": "$20K/month", "improvement": "60%"},
    "qualityImprovement": {"before": "85% accuracy", "after": "97% accuracy", "improvement": "14%"},
    "throughputIncrease": {"before": "100 items/day", "after": "350 items/day", "improvement": "250%"}
  },
  "implementationNotes": ["Note 1", "Note 2"],
  "humanCheckpoints": ["Step TS-05: Manager approval required for high-value decisions"]
}

Use Case Details:`;

function getDefaultAgentTypeForPattern(pattern: AgenticPattern | string | null): AgenticPattern {
  if (pattern && AGENTIC_PATTERNS.includes(pattern as AgenticPattern)) {
    return pattern as AgenticPattern;
  }
  return "Semantic Router";
}

function validateAndCorrectWorkflow(workflowData: any, useCase: UseCase): any {
  const currentSteps = workflowData.currentStateWorkflow || [];
  const targetSteps = workflowData.targetStateWorkflow || [];
  const selectedPattern = getDefaultAgentTypeForPattern(workflowData.agenticPattern);

  let hasBottleneck = currentSteps.some((s: WorkflowStep) => s.isBottleneck);
  let hasFriction = currentSteps.some((s: WorkflowStep) => s.isFrictionPoint);
  
  if (currentSteps.length > 0) {
    if (!hasBottleneck) {
      const bottleneckIndex = currentSteps.length === 1 ? 0 : Math.floor(currentSteps.length / 3);
      currentSteps[bottleneckIndex].isBottleneck = true;
      if (!currentSteps[bottleneckIndex].painPoints) {
        currentSteps[bottleneckIndex].painPoints = [];
      }
      if (!currentSteps[bottleneckIndex].painPoints.some((p: string) => p.includes("bottleneck") || p.includes("delay"))) {
        currentSteps[bottleneckIndex].painPoints.push("Manual processing creates delays - identified as bottleneck");
      }
    }
    
    if (!hasFriction) {
      const frictionIndex = currentSteps.length === 1 ? 0 : Math.floor(currentSteps.length * 2 / 3);
      currentSteps[frictionIndex].isFrictionPoint = true;
      if (!currentSteps[frictionIndex].painPoints) {
        currentSteps[frictionIndex].painPoints = [];
      }
      if (!currentSteps[frictionIndex].painPoints.some((p: string) => p.includes("friction") || p.includes("handoff"))) {
        currentSteps[frictionIndex].painPoints.push("Handoff delays and data re-entry required - friction point");
      }
    }
  }

  if (targetSteps.length > 0) {
    let hasAIEnabled = targetSteps.some((s: TargetWorkflowStep) => s.isAIEnabled);
    
    if (!hasAIEnabled) {
      targetSteps.forEach((step: TargetWorkflowStep) => {
        if (step.actor?.type === "ai_agent" || step.actor?.type === "system") {
          step.isAIEnabled = true;
          step.aiCapabilities = step.aiCapabilities?.length ? step.aiCapabilities : ["Automation", "Processing"];
          step.model = step.model || "Claude Sonnet";
          step.agentType = step.agentType || selectedPattern;
          step.automationLevel = step.automationLevel || "full";
        }
      });
      
      hasAIEnabled = targetSteps.some((s: TargetWorkflowStep) => s.isAIEnabled);
    }
    
    if (!hasAIEnabled) {
      const aiStepIndex = targetSteps.findIndex((s: TargetWorkflowStep) => !s.isHumanInTheLoop);
      const indexToModify = aiStepIndex >= 0 ? aiStepIndex : 0;
      
      if (!targetSteps[indexToModify].isHumanInTheLoop) {
        targetSteps[indexToModify].isAIEnabled = true;
        targetSteps[indexToModify].actor = { type: "ai_agent", name: "AI Processing Agent", role: "Automated Processor" };
        targetSteps[indexToModify].aiCapabilities = ["Classification", "Processing", "Validation"];
        targetSteps[indexToModify].model = "Claude Sonnet";
        targetSteps[indexToModify].agentType = selectedPattern;
        targetSteps[indexToModify].automationLevel = "full";
      }
    }
  }

  let hasHITL = targetSteps.some((s: TargetWorkflowStep) => s.isHumanInTheLoop);
  if (!hasHITL && targetSteps.length > 0) {
    const midIndex = Math.floor(targetSteps.length / 2);
    targetSteps[midIndex].isHumanInTheLoop = true;
    targetSteps[midIndex].isAIEnabled = false;
    targetSteps[midIndex].automationLevel = "supervised";
    targetSteps[midIndex].actor = { type: "human", name: "Reviewer", role: "Quality Assurance" };
    targetSteps[midIndex].agentType = "Human-in-the-Loop";
    targetSteps[midIndex].model = null;
    workflowData.humanCheckpoints = workflowData.humanCheckpoints || [];
    workflowData.humanCheckpoints.push(
      `Step ${targetSteps[midIndex].stepId || `TS-${midIndex + 1}`}: Human review checkpoint (auto-added for compliance)`
    );
  }

  currentSteps.forEach((step: WorkflowStep, index: number) => {
    step.stepNumber = step.stepNumber || index + 1;
    step.stepId = step.stepId || `CS-${String(index + 1).padStart(2, '0')}`;
    step.actor = step.actor || { type: "human", name: "Staff", role: "Operator" };
    step.duration = step.duration || { value: 15, unit: "minutes", variability: "per item" };
    step.systems = step.systems || ["Manual System"];
    step.dataSources = step.dataSources || ["Manual Input"];
    step.painPoints = step.painPoints || [];
    step.connectedTo = step.connectedTo || (index < currentSteps.length - 1 ? [`CS-${String(index + 2).padStart(2, '0')}`] : []);
    if (step.isBottleneck === undefined) step.isBottleneck = false;
    if (step.isFrictionPoint === undefined) step.isFrictionPoint = false;
    if (step.isDecisionPoint === undefined) step.isDecisionPoint = false;
  });

  targetSteps.forEach((step: TargetWorkflowStep, index: number) => {
    step.stepNumber = step.stepNumber || index + 1;
    step.stepId = step.stepId || `TS-${String(index + 1).padStart(2, '0')}`;
    step.actor = step.actor || { type: "ai_agent", name: "AI Agent", role: "Processor" };
    step.duration = step.duration || { value: 5, unit: "minutes", variability: "per item" };
    step.systems = step.systems || ["AI Platform"];
    step.dataSources = step.dataSources || ["API"];
    step.painPoints = step.painPoints || [];
    step.connectedTo = step.connectedTo || (index < targetSteps.length - 1 ? [`TS-${String(index + 2).padStart(2, '0')}`] : []);
    step.automationLevel = step.automationLevel || (step.isHumanInTheLoop ? "supervised" : "full");
    step.aiCapabilities = step.aiCapabilities || (step.isAIEnabled ? ["Processing", "Automation"] : []);
    step.agentType = step.agentType || (step.isAIEnabled ? selectedPattern : (step.isHumanInTheLoop ? "Human-in-the-Loop" : selectedPattern));
    step.model = step.model || (step.isAIEnabled ? "Claude Sonnet" : null);
    if (step.isBottleneck === undefined) step.isBottleneck = false;
    if (step.isFrictionPoint === undefined) step.isFrictionPoint = false;
    if (step.isDecisionPoint === undefined) step.isDecisionPoint = false;
    if (step.isAIEnabled === undefined) step.isAIEnabled = step.actor?.type === "ai_agent";
    if (step.isHumanInTheLoop === undefined) step.isHumanInTheLoop = step.actor?.type === "human";
  });

  workflowData.currentStateWorkflow = currentSteps;
  workflowData.targetStateWorkflow = targetSteps;
  workflowData.agenticPattern = workflowData.agenticPattern || selectedPattern;
  workflowData.implementationNotes = workflowData.implementationNotes || [
    "Phased rollout recommended for minimal disruption",
    "Human-in-the-Loop checkpoint ensures quality control"
  ];
  workflowData.humanCheckpoints = workflowData.humanCheckpoints || [];

  return workflowData;
}

export async function mapAgenticPattern(useCase: UseCase): Promise<AgenticPattern> {
  const name = useCase.name.toLowerCase();
  const desc = (useCase.description || "").toLowerCase();
  const combined = `${name} ${desc}`;
  
  if (combined.includes("triage") || combined.includes("routing") || combined.includes("classification") || combined.includes("priorit")) {
    return "Semantic Router";
  }
  if (combined.includes("document") || combined.includes("content") || combined.includes("report") || combined.includes("draft")) {
    return "Drafter-Critic";
  }
  if (combined.includes("compliance") || combined.includes("policy") || combined.includes("regulatory") || combined.includes("audit")) {
    return "Constitutional Guardrail";
  }
  if (combined.includes("knowledge") || combined.includes("search") || combined.includes("research") || combined.includes("lookup")) {
    return "RAG Detective";
  }
  if (combined.includes("troubleshoot") || combined.includes("diagnos") || combined.includes("debug") || combined.includes("root cause")) {
    return "ReAct Loop";
  }
  if (combined.includes("personal") || combined.includes("recommend") || combined.includes("preference") || combined.includes("adaptive")) {
    return "Memetic Agent";
  }
  if (combined.includes("approval") || combined.includes("review") || combined.includes("exception") || combined.includes("escalat")) {
    return "Human-in-the-Loop";
  }
  if (combined.includes("multi") || combined.includes("orchestrat") || combined.includes("coordinat") || combined.includes("end-to-end")) {
    return "Orchestrator-Workers";
  }
  
  return "Semantic Router";
}

export async function generateWorkflowForUseCase(
  useCase: UseCase,
  detailLevel: "summary" | "standard" | "detailed" = "standard"
): Promise<UseCaseWorkflowData> {
  const stepCounts = {
    summary: { current: "5-6", target: "6-8" },
    standard: { current: "6-10", target: "8-12" },
    detailed: { current: "10-15", target: "12-18" }
  };
  
  const counts = stepCounts[detailLevel];
  
  const prompt = `${WORKFLOW_GENERATION_PROMPT}

Use Case Name: ${useCase.name}
Description: ${useCase.description || "N/A"}
Business Function: ${useCase.businessFunction || "General Operations"}
Friction Point: ${useCase.frictionPoint || "Manual processes causing delays"}
Expected Benefits: 
- Revenue Impact: $${useCase.benefits?.revenue?.toLocaleString() || "TBD"}
- Cost Savings: $${useCase.benefits?.cost?.toLocaleString() || "TBD"}
- Cash Flow: $${useCase.benefits?.cashFlow?.toLocaleString() || "TBD"}
- Risk Reduction: $${useCase.benefits?.risk?.toLocaleString() || "TBD"}

Detail Level: ${detailLevel}
Current State Steps: ${counts.current}
Target State Steps: ${counts.target}

Generate realistic, industry-specific workflow steps. Return ONLY valid JSON.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    let workflowData = JSON.parse(jsonMatch[0]);
    
    workflowData = validateAndCorrectWorkflow(workflowData, useCase);

    return {
      useCaseId: useCase.id || `UC-${Date.now()}`,
      useCaseName: useCase.name,
      businessFunction: useCase.businessFunction || "General Operations",
      agenticPattern: workflowData.agenticPattern as AgenticPattern,
      patternRationale: workflowData.patternRationale || `${workflowData.agenticPattern} pattern selected for this use case.`,
      currentStateWorkflow: workflowData.currentStateWorkflow as WorkflowStep[],
      targetStateWorkflow: workflowData.targetStateWorkflow as TargetWorkflowStep[],
      comparisonMetrics: workflowData.comparisonMetrics as WorkflowComparisonMetrics,
      implementationNotes: workflowData.implementationNotes || [],
      humanCheckpoints: workflowData.humanCheckpoints || [],
    };
  } catch (error) {
    console.error("Error generating workflow:", error);
    return generateFallbackWorkflow(useCase);
  }
}

function generateFallbackWorkflow(useCase: UseCase): UseCaseWorkflowData {
  const pattern = mapAgenticPatternSync(useCase);
  
  return {
    useCaseId: useCase.id || `UC-${Date.now()}`,
    useCaseName: useCase.name,
    businessFunction: useCase.businessFunction || "General Operations",
    agenticPattern: pattern,
    patternRationale: `${pattern} pattern selected based on use case characteristics.`,
    currentStateWorkflow: [
      {
        stepNumber: 1,
        stepId: "CS-01",
        stepName: "Manual Request Intake",
        description: "Staff manually receives and logs incoming requests",
        actor: { type: "human", name: "Intake Specialist", role: "Customer Service" },
        duration: { value: 10, unit: "minutes", variability: "per item" },
        systems: ["Email", "Spreadsheet"],
        dataSources: ["Emails", "Phone logs"],
        isBottleneck: true,
        isFrictionPoint: true,
        isDecisionPoint: false,
        painPoints: ["Manual data entry", "High error rate", "Slow processing"],
        connectedTo: ["CS-02"],
      },
      {
        stepNumber: 2,
        stepId: "CS-02",
        stepName: "Manual Classification",
        description: "Staff manually categorizes and prioritizes requests",
        actor: { type: "human", name: "Analyst", role: "Operations" },
        duration: { value: 15, unit: "minutes", variability: "per item" },
        systems: ["Internal System"],
        dataSources: ["Request details"],
        isBottleneck: true,
        isFrictionPoint: false,
        isDecisionPoint: true,
        painPoints: ["Inconsistent classification", "Subjective decisions"],
        connectedTo: ["CS-03"],
      },
      {
        stepNumber: 3,
        stepId: "CS-03",
        stepName: "Manual Routing",
        description: "Request routed to appropriate team based on classification",
        actor: { type: "human", name: "Supervisor", role: "Team Lead" },
        duration: { value: 5, unit: "minutes", variability: "per item" },
        systems: ["Ticketing System"],
        dataSources: ["Team availability"],
        isBottleneck: false,
        isFrictionPoint: true,
        isDecisionPoint: true,
        painPoints: ["Routing delays", "Incorrect assignments"],
        connectedTo: ["CS-04"],
      },
      {
        stepNumber: 4,
        stepId: "CS-04",
        stepName: "Manual Processing",
        description: "Team processes the request using standard procedures",
        actor: { type: "human", name: "Processor", role: "Specialist" },
        duration: { value: 45, unit: "minutes", variability: "per item" },
        systems: ["Multiple Systems"],
        dataSources: ["Various databases"],
        isBottleneck: true,
        isFrictionPoint: false,
        isDecisionPoint: false,
        painPoints: ["Time-consuming", "Manual data lookup"],
        connectedTo: ["CS-05"],
      },
      {
        stepNumber: 5,
        stepId: "CS-05",
        stepName: "Quality Review",
        description: "Supervisor reviews output before delivery",
        actor: { type: "human", name: "Reviewer", role: "Quality Assurance" },
        duration: { value: 15, unit: "minutes", variability: "per item" },
        systems: ["QA Tools"],
        dataSources: ["Output documents"],
        isBottleneck: false,
        isFrictionPoint: false,
        isDecisionPoint: true,
        painPoints: ["Review backlog", "Inconsistent standards"],
        connectedTo: ["CS-06"],
      },
      {
        stepNumber: 6,
        stepId: "CS-06",
        stepName: "Delivery & Close",
        description: "Final output delivered and case closed",
        actor: { type: "human", name: "Agent", role: "Customer Service" },
        duration: { value: 10, unit: "minutes", variability: "per item" },
        systems: ["CRM"],
        dataSources: ["Case records"],
        isBottleneck: false,
        isFrictionPoint: false,
        isDecisionPoint: false,
        painPoints: ["Manual follow-up required"],
        connectedTo: [],
      },
    ],
    targetStateWorkflow: [
      {
        stepNumber: 1,
        stepId: "TS-01",
        stepName: "AI-Powered Intake",
        description: "AI automatically captures, parses, and logs incoming requests",
        actor: { type: "ai_agent", name: "Intake Agent", role: "AI Processor" },
        duration: { value: 10, unit: "seconds", variability: "per item" },
        systems: ["AI Platform", "Integration Layer"],
        dataSources: ["Multi-channel inputs"],
        isBottleneck: false,
        isFrictionPoint: false,
        isDecisionPoint: false,
        painPoints: [],
        connectedTo: ["TS-02"],
        isAIEnabled: true,
        isHumanInTheLoop: false,
        aiCapabilities: ["NLP", "Data Extraction", "Validation"],
        agentType: pattern,
        model: "Claude Sonnet",
        automationLevel: "full",
      },
      {
        stepNumber: 2,
        stepId: "TS-02",
        stepName: "Intelligent Classification",
        description: "AI classifies and prioritizes using trained models",
        actor: { type: "ai_agent", name: "Classification Agent", role: "AI Classifier" },
        duration: { value: 2, unit: "seconds", variability: "per item" },
        systems: ["ML Platform"],
        dataSources: ["Historical patterns", "Real-time signals"],
        isBottleneck: false,
        isFrictionPoint: false,
        isDecisionPoint: true,
        painPoints: [],
        connectedTo: ["TS-03"],
        isAIEnabled: true,
        isHumanInTheLoop: false,
        aiCapabilities: ["Classification", "Priority Scoring"],
        agentType: "Semantic Router",
        model: "Claude Sonnet",
        automationLevel: "full",
      },
      {
        stepNumber: 3,
        stepId: "TS-03",
        stepName: "Smart Routing",
        description: "AI routes to optimal resource based on skills and availability",
        actor: { type: "ai_agent", name: "Router Agent", role: "AI Orchestrator" },
        duration: { value: 1, unit: "seconds", variability: "per item" },
        systems: ["Workflow Engine"],
        dataSources: ["Resource matrix", "Workload data"],
        isBottleneck: false,
        isFrictionPoint: false,
        isDecisionPoint: true,
        painPoints: [],
        connectedTo: ["TS-04"],
        isAIEnabled: true,
        isHumanInTheLoop: false,
        aiCapabilities: ["Resource Optimization", "Workload Balancing"],
        agentType: "Semantic Router",
        model: "Claude Sonnet",
        automationLevel: "full",
      },
      {
        stepNumber: 4,
        stepId: "TS-04",
        stepName: "AI-Assisted Processing",
        description: "AI handles routine processing, humans focus on exceptions",
        actor: { type: "ai_agent", name: "Processing Agent", role: "AI Worker" },
        duration: { value: 5, unit: "minutes", variability: "per item" },
        systems: ["AI Platform", "Enterprise Systems"],
        dataSources: ["Knowledge base", "APIs"],
        isBottleneck: false,
        isFrictionPoint: false,
        isDecisionPoint: false,
        painPoints: [],
        connectedTo: ["TS-05"],
        isAIEnabled: true,
        isHumanInTheLoop: false,
        aiCapabilities: ["Data Processing", "Decision Support"],
        agentType: pattern,
        model: "Claude Sonnet",
        automationLevel: "assisted",
      },
      {
        stepNumber: 5,
        stepId: "TS-05",
        stepName: "Human Review Checkpoint",
        description: "Human reviews AI output for quality and edge cases",
        actor: { type: "human", name: "Reviewer", role: "Quality Assurance" },
        duration: { value: 5, unit: "minutes", variability: "per item" },
        systems: ["Review Dashboard"],
        dataSources: ["AI recommendations", "Confidence scores"],
        isBottleneck: false,
        isFrictionPoint: false,
        isDecisionPoint: true,
        painPoints: [],
        connectedTo: ["TS-06"],
        isAIEnabled: false,
        isHumanInTheLoop: true,
        aiCapabilities: [],
        agentType: "Human-in-the-Loop",
        model: null,
        automationLevel: "supervised",
      },
      {
        stepNumber: 6,
        stepId: "TS-06",
        stepName: "Automated Quality Check",
        description: "AI validates output against quality rules",
        actor: { type: "ai_agent", name: "QA Agent", role: "AI Validator" },
        duration: { value: 3, unit: "seconds", variability: "per item" },
        systems: ["Quality Engine"],
        dataSources: ["Quality rules", "Standards"],
        isBottleneck: false,
        isFrictionPoint: false,
        isDecisionPoint: false,
        painPoints: [],
        connectedTo: ["TS-07"],
        isAIEnabled: true,
        isHumanInTheLoop: false,
        aiCapabilities: ["Validation", "Compliance Check"],
        agentType: "Constitutional Guardrail",
        model: "Claude Sonnet",
        automationLevel: "full",
      },
      {
        stepNumber: 7,
        stepId: "TS-07",
        stepName: "Automated Delivery",
        description: "AI delivers output through optimal channel",
        actor: { type: "ai_agent", name: "Delivery Agent", role: "AI Communicator" },
        duration: { value: 5, unit: "seconds", variability: "per item" },
        systems: ["Communication Platform"],
        dataSources: ["Channel preferences"],
        isBottleneck: false,
        isFrictionPoint: false,
        isDecisionPoint: false,
        painPoints: [],
        connectedTo: ["TS-08"],
        isAIEnabled: true,
        isHumanInTheLoop: false,
        aiCapabilities: ["Multi-channel Delivery", "Personalization"],
        agentType: "Memetic Agent",
        model: "Claude Sonnet",
        automationLevel: "full",
      },
      {
        stepNumber: 8,
        stepId: "TS-08",
        stepName: "Learning & Optimization",
        description: "AI learns from outcomes to improve future processing",
        actor: { type: "system", name: "Learning System", role: "Continuous Improvement" },
        duration: { value: 0, unit: "seconds", variability: "fixed" },
        systems: ["ML Pipeline"],
        dataSources: ["Outcome data", "Feedback"],
        isBottleneck: false,
        isFrictionPoint: false,
        isDecisionPoint: false,
        painPoints: [],
        connectedTo: [],
        isAIEnabled: true,
        isHumanInTheLoop: false,
        aiCapabilities: ["Feedback Learning", "Model Tuning"],
        agentType: "ReAct Loop",
        model: "Claude Sonnet",
        automationLevel: "full",
      },
    ],
    comparisonMetrics: {
      timeReduction: {
        before: "100 mins/item",
        after: "15 mins/item",
        improvement: "85%",
      },
      costReduction: {
        before: "$75/item",
        after: "$12/item",
        improvement: "84%",
      },
      qualityImprovement: {
        before: "85% accuracy",
        after: "97% accuracy",
        improvement: "14%",
      },
      throughputIncrease: {
        before: "50 items/day",
        after: "200 items/day",
        improvement: "300%",
      },
    },
    implementationNotes: [
      "Phased rollout recommended starting with high-volume, low-complexity cases",
      "Initial 2-week pilot with parallel processing to validate AI accuracy",
      "Human-in-the-Loop checkpoint can be adjusted based on confidence thresholds",
    ],
    humanCheckpoints: [
      "Step TS-05: Human review required for all AI-processed items",
      "Exception handling: Items with confidence < 80% escalated to human",
    ],
  };
}

function mapAgenticPatternSync(useCase: UseCase): AgenticPattern {
  const name = useCase.name.toLowerCase();
  const desc = (useCase.description || "").toLowerCase();
  const combined = `${name} ${desc}`;
  
  if (combined.includes("triage") || combined.includes("routing") || combined.includes("classification")) {
    return "Semantic Router";
  }
  if (combined.includes("document") || combined.includes("content") || combined.includes("report")) {
    return "Drafter-Critic";
  }
  if (combined.includes("compliance") || combined.includes("policy") || combined.includes("regulatory")) {
    return "Constitutional Guardrail";
  }
  if (combined.includes("knowledge") || combined.includes("search") || combined.includes("research")) {
    return "RAG Detective";
  }
  if (combined.includes("troubleshoot") || combined.includes("diagnos") || combined.includes("debug")) {
    return "ReAct Loop";
  }
  if (combined.includes("personal") || combined.includes("recommend") || combined.includes("preference")) {
    return "Memetic Agent";
  }
  if (combined.includes("approval") || combined.includes("review") || combined.includes("exception")) {
    return "Human-in-the-Loop";
  }
  
  return "Orchestrator-Workers";
}

export async function generateAllWorkflows(
  useCases: UseCase[],
  options: WorkflowExportOptions
): Promise<UseCaseWorkflowData[]> {
  const workflows: UseCaseWorkflowData[] = [];
  
  for (let i = 0; i < useCases.length; i++) {
    const useCase = useCases[i];
    console.log(`Generating workflow ${i + 1}/${useCases.length}: ${useCase.name}`);
    
    try {
      const workflow = await generateWorkflowForUseCase(useCase, options.detailLevel);
      workflows.push(workflow);
    } catch (error) {
      console.error(`Error generating workflow for ${useCase.name}:`, error);
      workflows.push(generateFallbackWorkflow(useCase));
    }
    
    if (i < useCases.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return workflows;
}

export function createWorkflowExport(
  reportId: string,
  companyName: string,
  workflows: UseCaseWorkflowData[],
  options: WorkflowExportOptions,
  masterAssumptions?: Record<string, any>
): WorkflowExportData {
  return {
    reportId,
    companyName,
    generatedAt: new Date().toISOString(),
    exportOptions: options,
    workflowData: workflows,
    masterAssumptions: options.includeAssumptions ? masterAssumptions : undefined,
    agenticPatternLibrary: AGENTIC_PATTERN_META,
    miroMetadata: options.includeMiroMetadata ? DEFAULT_MIRO_METADATA : DEFAULT_MIRO_METADATA,
  };
}

export function extractUseCasesFromAnalysis(analysis: any): UseCase[] {
  const useCases: UseCase[] = [];
  
  const step4 = analysis.steps?.find((s: any) => s.step === 4);
  if (step4?.useCases) {
    step4.useCases.forEach((uc: any, index: number) => {
      useCases.push({
        id: `UC-${index + 1}`,
        name: uc.name || uc.useCase || `Use Case ${index + 1}`,
        description: uc.description || uc.challenge || "",
        businessFunction: uc.function || uc.businessFunction || "General",
        frictionPoint: uc.frictionPoint || uc.challenge || "",
        benefits: {
          revenue: uc.revenueBenefit || uc.benefits?.revenue || 0,
          cost: uc.costBenefit || uc.benefits?.cost || 0,
          cashFlow: uc.cashFlowBenefit || uc.benefits?.cashFlow || 0,
          risk: uc.riskBenefit || uc.benefits?.risk || 0,
        },
      });
    });
  }
  
  const step5 = analysis.steps?.find((s: any) => s.step === 5);
  if (step5?.valueOpportunities) {
    step5.valueOpportunities.forEach((vo: any, index: number) => {
      if (!useCases.find(uc => uc.name === vo.opportunity)) {
        useCases.push({
          id: `UC-${useCases.length + 1}`,
          name: vo.opportunity || `Opportunity ${index + 1}`,
          description: vo.description || "",
          businessFunction: vo.function || "General",
          benefits: {
            revenue: vo.revenueBenefit || 0,
            cost: vo.costBenefit || 0,
            cashFlow: vo.cashFlowBenefit || 0,
            risk: vo.riskBenefit || 0,
          },
        });
      }
    });
  }
  
  return useCases.slice(0, 10);
}
