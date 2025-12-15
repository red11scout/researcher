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
  AIPrimitive,
  BusinessFunction,
  AgenticPatternMapping,
  WorkflowValidationIssue,
  WorkflowValidationResult,
  WorkflowValidationConfig,
} from "@shared/schema";
import { AGENTIC_PATTERNS, AGENTIC_PATTERN_META, DEFAULT_MIRO_METADATA, DEFAULT_VALIDATION_CONFIG } from "@shared/schema";

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

interface ProcessStepsInput {
  description: string;
  frictionPoint: string;
  businessFunction?: string;
  detailLevel?: "summary" | "standard" | "detailed";
}

interface ProcessStepsOutput {
  currentStateWorkflow: WorkflowStep[];
  targetStateWorkflow: TargetWorkflowStep[];
  agenticPattern?: AgenticPattern;
  patternRationale?: string;
  comparisonMetrics?: WorkflowComparisonMetrics;
}

const PROCESS_STEPS_PROMPT = `You are an expert business process analyst specializing in AI transformation and workflow optimization.

Your task is to generate detailed, realistic process steps for a business workflow transformation.

## CURRENT STATE REQUIREMENTS (Manual/Legacy Process):
Generate 6-10 steps showing the CURRENT inefficient process. Each step MUST include:
- Clear identification of INEFFICIENCIES (slow, manual, error-prone aspects)
- BOTTLENECKS that cause delays or capacity constraints
- MANUAL STEPS that require human effort and are candidates for automation
- Realistic time estimates based on industry standards
- Pain points that justify the transformation

At least 2 steps must be marked as isBottleneck: true
At least 2 steps must be marked as isFrictionPoint: true
Include specific, quantifiable pain points (e.g., "45% of time spent on data re-entry")

## TARGET STATE REQUIREMENTS (AI-Enhanced Process):
Generate 8-12 steps showing the AI-ENHANCED process. This MUST demonstrate:
- AI AUTOMATION replacing manual work (at least 50% of steps should be AI-enabled)
- REDUCED PROCESSING TIME (target 60-80% reduction)
- FASTER EXECUTION through parallel processing and real-time analysis
- At least ONE Human-in-the-Loop checkpoint for quality assurance
- Clear mapping to AI capabilities (classification, extraction, routing, generation, validation)

At least 4 steps must have isAIEnabled: true with specific aiCapabilities
Exactly 1-2 steps must have isHumanInTheLoop: true for oversight

## OUTPUT FORMAT (strict JSON only, no markdown):
{
  "agenticPattern": "Semantic Router|Orchestrator-Workers|ReAct Loop|Drafter-Critic|Constitutional Guardrail|RAG Detective|Memetic Agent|Human-in-the-Loop",
  "patternRationale": "2-3 sentences explaining pattern selection",
  "currentStateWorkflow": [
    {
      "stepNumber": 1,
      "stepId": "CS-01",
      "stepName": "Descriptive Step Name",
      "description": "Detailed description of manual process",
      "actor": {"type": "human", "name": "Role Name", "role": "Department"},
      "duration": {"value": 15, "unit": "minutes", "variability": "per item"},
      "systems": ["Legacy System 1", "Spreadsheet"],
      "dataSources": ["Manual input", "Email attachments"],
      "isBottleneck": true,
      "isFrictionPoint": true,
      "isDecisionPoint": false,
      "painPoints": ["58% time on low-value tasks", "Manual data entry errors"],
      "connectedTo": ["CS-02"]
    }
  ],
  "targetStateWorkflow": [
    {
      "stepNumber": 1,
      "stepId": "TS-01",
      "stepName": "AI-Powered Step Name",
      "description": "How AI transforms this step",
      "actor": {"type": "ai_agent", "name": "AI Classifier", "role": "Automated Processing"},
      "duration": {"value": 5, "unit": "seconds", "variability": "per item"},
      "systems": ["AI Platform", "Integrated CRM"],
      "dataSources": ["API feeds", "Knowledge base"],
      "isBottleneck": false,
      "isFrictionPoint": false,
      "isDecisionPoint": false,
      "painPoints": [],
      "connectedTo": ["TS-02"],
      "isAIEnabled": true,
      "isHumanInTheLoop": false,
      "aiCapabilities": ["Classification", "Extraction", "Routing"],
      "agentType": "Semantic Router",
      "model": "Claude Sonnet",
      "automationLevel": "full"
    }
  ],
  "comparisonMetrics": {
    "timeReduction": {"before": "4 hours/case", "after": "45 min/case", "improvement": "81%"},
    "costReduction": {"before": "$150/case", "after": "$35/case", "improvement": "77%"},
    "qualityImprovement": {"before": "82% accuracy", "after": "96% accuracy", "improvement": "17%"},
    "throughputIncrease": {"before": "25 cases/day", "after": "120 cases/day", "improvement": "380%"}
  }
}

Return ONLY valid JSON. No markdown, no code blocks, no explanations.`;

export async function generateProcessSteps(
  input: ProcessStepsInput
): Promise<ProcessStepsOutput> {
  const { description, frictionPoint, businessFunction = "General Operations", detailLevel = "standard" } = input;
  
  const stepCounts = {
    summary: { current: "5-6", target: "6-8" },
    standard: { current: "6-10", target: "8-12" },
    detailed: { current: "10-15", target: "12-18" }
  };
  
  const counts = stepCounts[detailLevel];
  
  const prompt = `${PROCESS_STEPS_PROMPT}

CONTEXT FOR THIS WORKFLOW:
- Use Case Description: ${description}
- Target Friction Point: ${frictionPoint}
- Business Function: ${businessFunction}
- Detail Level: ${detailLevel}
- Current State Steps: ${counts.current} steps
- Target State Steps: ${counts.target} steps

Generate realistic, industry-specific workflow steps that address the specific friction point and demonstrate measurable AI transformation benefits.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 10000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude API");
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in Claude response");
    }

    const parsedData = JSON.parse(jsonMatch[0]);
    
    const fakeUseCase: UseCase = {
      name: description.substring(0, 50),
      description,
      businessFunction,
      frictionPoint,
    };
    const validatedData = validateAndCorrectWorkflow(parsedData, fakeUseCase);

    return {
      currentStateWorkflow: validatedData.currentStateWorkflow as WorkflowStep[],
      targetStateWorkflow: validatedData.targetStateWorkflow as TargetWorkflowStep[],
      agenticPattern: validatedData.agenticPattern as AgenticPattern,
      patternRationale: validatedData.patternRationale,
      comparisonMetrics: validatedData.comparisonMetrics as WorkflowComparisonMetrics,
    };
  } catch (error) {
    console.error("Error in generateProcessSteps:", error);
    return generateFallbackProcessSteps(input);
  }
}

function generateFallbackProcessSteps(input: ProcessStepsInput): ProcessStepsOutput {
  const { description, frictionPoint, businessFunction = "General Operations" } = input;
  
  const currentStateWorkflow: WorkflowStep[] = [
    {
      stepNumber: 1,
      stepId: "CS-01",
      stepName: "Manual Request Reception",
      description: `Staff receives ${businessFunction.toLowerCase()} requests through email, phone, or forms`,
      actor: { type: "human", name: "Intake Specialist", role: businessFunction },
      duration: { value: 12, unit: "minutes", variability: "per item" },
      systems: ["Email", "Phone System", "Paper Forms"],
      dataSources: ["Customer communications", "Internal requests"],
      isBottleneck: true,
      isFrictionPoint: true,
      isDecisionPoint: false,
      painPoints: [
        "45% of time spent on data entry",
        "Multiple communication channels create delays",
        frictionPoint || "Manual processing creates bottlenecks"
      ],
      connectedTo: ["CS-02"],
    },
    {
      stepNumber: 2,
      stepId: "CS-02",
      stepName: "Manual Data Entry & Verification",
      description: "Staff manually enters and verifies data from received requests",
      actor: { type: "human", name: "Data Entry Clerk", role: "Operations" },
      duration: { value: 20, unit: "minutes", variability: "per item" },
      systems: ["Legacy Database", "Spreadsheet"],
      dataSources: ["Source documents", "Previous records"],
      isBottleneck: true,
      isFrictionPoint: false,
      isDecisionPoint: false,
      painPoints: [
        "15% error rate in manual entry",
        "Duplicate data entry across systems",
        "Time-consuming verification process"
      ],
      connectedTo: ["CS-03"],
    },
    {
      stepNumber: 3,
      stepId: "CS-03",
      stepName: "Manual Classification & Prioritization",
      description: "Supervisor reviews and classifies requests based on experience",
      actor: { type: "human", name: "Supervisor", role: "Team Lead" },
      duration: { value: 8, unit: "minutes", variability: "per item" },
      systems: ["Ticketing System"],
      dataSources: ["Request details", "Historical patterns"],
      isBottleneck: false,
      isFrictionPoint: true,
      isDecisionPoint: true,
      painPoints: [
        "Inconsistent classification criteria",
        "Subjective priority decisions",
        "Delays when supervisor unavailable"
      ],
      connectedTo: ["CS-04"],
    },
    {
      stepNumber: 4,
      stepId: "CS-04",
      stepName: "Manual Assignment & Routing",
      description: "Work assigned to team members based on availability and skills",
      actor: { type: "human", name: "Team Lead", role: "Management" },
      duration: { value: 5, unit: "minutes", variability: "per item" },
      systems: ["Task Management", "Email"],
      dataSources: ["Team capacity", "Skill matrix"],
      isBottleneck: false,
      isFrictionPoint: true,
      isDecisionPoint: true,
      painPoints: [
        "Suboptimal workload distribution",
        "Skill mismatches",
        "Manual tracking overhead"
      ],
      connectedTo: ["CS-05"],
    },
    {
      stepNumber: 5,
      stepId: "CS-05",
      stepName: "Manual Processing & Execution",
      description: "Team members process requests using standard procedures",
      actor: { type: "human", name: "Processor", role: "Specialist" },
      duration: { value: 45, unit: "minutes", variability: "per item" },
      systems: ["Multiple Legacy Systems", "Manual Checklists"],
      dataSources: ["Reference documents", "Process guides"],
      isBottleneck: true,
      isFrictionPoint: false,
      isDecisionPoint: false,
      painPoints: [
        "Context switching between systems",
        "Manual lookup of reference data",
        "Repetitive low-value tasks"
      ],
      connectedTo: ["CS-06"],
    },
    {
      stepNumber: 6,
      stepId: "CS-06",
      stepName: "Manual Quality Check",
      description: "Senior staff reviews completed work for accuracy",
      actor: { type: "human", name: "Quality Reviewer", role: "Senior Specialist" },
      duration: { value: 15, unit: "minutes", variability: "per item" },
      systems: ["Review Checklist", "Approval System"],
      dataSources: ["Completed work", "Quality standards"],
      isBottleneck: false,
      isFrictionPoint: false,
      isDecisionPoint: true,
      painPoints: [
        "Sampling-based review misses errors",
        "Rework loops add delays",
        "Quality inconsistency"
      ],
      connectedTo: [],
    },
  ];

  const targetStateWorkflow: TargetWorkflowStep[] = [
    {
      stepNumber: 1,
      stepId: "TS-01",
      stepName: "AI-Powered Request Ingestion",
      description: "AI automatically captures and digitizes incoming requests from all channels",
      actor: { type: "ai_agent", name: "Intake AI", role: "Automated Reception" },
      duration: { value: 15, unit: "seconds", variability: "per item" },
      systems: ["AI Platform", "Unified Inbox", "OCR Engine"],
      dataSources: ["Multi-channel feeds", "Document scanners"],
      isBottleneck: false,
      isFrictionPoint: false,
      isDecisionPoint: false,
      painPoints: [],
      connectedTo: ["TS-02"],
      isAIEnabled: true,
      isHumanInTheLoop: false,
      aiCapabilities: ["Document Processing", "OCR", "Multi-channel Integration"],
      agentType: "Semantic Router",
      model: "Claude Sonnet",
      automationLevel: "full",
    },
    {
      stepNumber: 2,
      stepId: "TS-02",
      stepName: "Intelligent Data Extraction",
      description: "AI extracts, validates, and structures data from documents and messages",
      actor: { type: "ai_agent", name: "Extraction Agent", role: "Data Processing" },
      duration: { value: 8, unit: "seconds", variability: "per item" },
      systems: ["AI Extraction Engine", "Validation Rules"],
      dataSources: ["Incoming documents", "Reference databases"],
      isBottleneck: false,
      isFrictionPoint: false,
      isDecisionPoint: false,
      painPoints: [],
      connectedTo: ["TS-03"],
      isAIEnabled: true,
      isHumanInTheLoop: false,
      aiCapabilities: ["Entity Extraction", "Data Validation", "Error Detection"],
      agentType: "RAG Detective",
      model: "Claude Sonnet",
      automationLevel: "full",
    },
    {
      stepNumber: 3,
      stepId: "TS-03",
      stepName: "AI Classification & Routing",
      description: "AI classifies requests and routes to optimal processing path",
      actor: { type: "ai_agent", name: "Classification Agent", role: "Intelligent Routing" },
      duration: { value: 3, unit: "seconds", variability: "per item" },
      systems: ["AI Classifier", "Routing Engine"],
      dataSources: ["Request patterns", "Historical outcomes"],
      isBottleneck: false,
      isFrictionPoint: false,
      isDecisionPoint: true,
      painPoints: [],
      connectedTo: ["TS-04"],
      isAIEnabled: true,
      isHumanInTheLoop: false,
      aiCapabilities: ["Classification", "Priority Scoring", "Intelligent Routing"],
      agentType: "Semantic Router",
      model: "Claude Sonnet",
      automationLevel: "full",
    },
    {
      stepNumber: 4,
      stepId: "TS-04",
      stepName: "Automated Processing",
      description: "AI executes standard processing tasks with real-time validation",
      actor: { type: "ai_agent", name: "Processing Agent", role: "Task Execution" },
      duration: { value: 2, unit: "minutes", variability: "per item" },
      systems: ["AI Workflow Engine", "Integrated Systems"],
      dataSources: ["Business rules", "Reference data"],
      isBottleneck: false,
      isFrictionPoint: false,
      isDecisionPoint: false,
      painPoints: [],
      connectedTo: ["TS-05"],
      isAIEnabled: true,
      isHumanInTheLoop: false,
      aiCapabilities: ["Task Automation", "Rule Application", "Cross-system Integration"],
      agentType: "Orchestrator-Workers",
      model: "Claude Sonnet",
      automationLevel: "full",
    },
    {
      stepNumber: 5,
      stepId: "TS-05",
      stepName: "Human-in-the-Loop Review",
      description: "Expert reviews AI decisions on complex or high-value cases",
      actor: { type: "human", name: "Senior Specialist", role: "Quality Oversight" },
      duration: { value: 5, unit: "minutes", variability: "per item" },
      systems: ["AI Review Dashboard", "Decision Support"],
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
      stepName: "AI Quality Assurance",
      description: "AI performs comprehensive quality checks and flags anomalies",
      actor: { type: "ai_agent", name: "QA Agent", role: "Quality Validation" },
      duration: { value: 10, unit: "seconds", variability: "per item" },
      systems: ["AI QA Engine", "Anomaly Detection"],
      dataSources: ["Quality metrics", "Historical patterns"],
      isBottleneck: false,
      isFrictionPoint: false,
      isDecisionPoint: false,
      painPoints: [],
      connectedTo: ["TS-07"],
      isAIEnabled: true,
      isHumanInTheLoop: false,
      aiCapabilities: ["Quality Scoring", "Anomaly Detection", "Compliance Check"],
      agentType: "Constitutional Guardrail",
      model: "Claude Sonnet",
      automationLevel: "full",
    },
    {
      stepNumber: 7,
      stepId: "TS-07",
      stepName: "Automated Completion & Notification",
      description: "AI finalizes processing and sends automated notifications",
      actor: { type: "ai_agent", name: "Completion Agent", role: "Finalization" },
      duration: { value: 5, unit: "seconds", variability: "per item" },
      systems: ["Notification Engine", "Audit System"],
      dataSources: ["Completion status", "Stakeholder preferences"],
      isBottleneck: false,
      isFrictionPoint: false,
      isDecisionPoint: false,
      painPoints: [],
      connectedTo: [],
      isAIEnabled: true,
      isHumanInTheLoop: false,
      aiCapabilities: ["Notification Generation", "Status Updates", "Audit Logging"],
      agentType: "Drafter-Critic",
      model: "Claude Sonnet",
      automationLevel: "full",
    },
  ];

  return {
    currentStateWorkflow,
    targetStateWorkflow,
    agenticPattern: "Orchestrator-Workers",
    patternRationale: `Orchestrator-Workers pattern selected as this ${businessFunction.toLowerCase()} process involves multiple specialized tasks that benefit from coordinated AI agents working in parallel with human oversight.`,
    comparisonMetrics: {
      timeReduction: { before: "105 min/item", after: "12 min/item", improvement: "89%" },
      costReduction: { before: "$85/item", after: "$18/item", improvement: "79%" },
      qualityImprovement: { before: "85% accuracy", after: "97% accuracy", improvement: "14%" },
      throughputIncrease: { before: "45 items/day", after: "280 items/day", improvement: "522%" },
    },
  };
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

// AI Primitive keywords for detection
const AI_PRIMITIVE_KEYWORDS: Record<string, string[]> = {
  classification: ["classify", "categoriz", "triage", "sort", "priorit", "label", "tag", "segment"],
  generation: ["generate", "create", "write", "draft", "produce", "compose", "synthesiz"],
  retrieval: ["search", "find", "lookup", "query", "retrieve", "fetch", "discover"],
  extraction: ["extract", "parse", "identify", "recognize", "capture", "pull", "scrape"],
  summarization: ["summariz", "condense", "digest", "abstract", "brief", "overview"],
  translation: ["translat", "convert", "transform", "localize", "interpret"],
  reasoning: ["reason", "analyze", "evaluat", "assess", "diagnos", "deduc", "infer"],
  validation: ["validat", "verify", "check", "confirm", "audit", "compli", "review"],
  prediction: ["predict", "forecast", "estimat", "project", "anticipat", "model"],
  routing: ["route", "direct", "assign", "dispatch", "forward", "escalat"],
  orchestration: ["orchestrat", "coordinat", "manag", "workflow", "automat", "pipeline"],
  monitoring: ["monitor", "track", "alert", "notif", "watch", "observ", "detect"],
};

// Business function keywords for detection
const BUSINESS_FUNCTION_KEYWORDS: Record<string, string[]> = {
  Sales: ["sales", "deal", "opportunity", "pipeline", "lead", "prospect", "quota", "revenue"],
  Marketing: ["marketing", "campaign", "brand", "content", "seo", "advertis", "social media"],
  Finance: ["finance", "financ", "invoic", "payment", "budget", "account", "expense", "billing"],
  Operations: ["operation", "process", "workflow", "efficien", "productiv", "throughput"],
  HR: ["hr", "human resource", "recruit", "hiring", "employee", "talent", "onboard", "payroll"],
  IT: ["it ", "technolog", "system", "software", "infrastructure", "deploy", "devops"],
  Legal: ["legal", "contract", "agreement", "litigation", "intellectual property", "patent"],
  Compliance: ["complian", "regulat", "policy", "governance", "risk", "audit", "sox", "gdpr"],
  "Customer Service": ["customer", "support", "service", "ticket", "helpdesk", "complaint", "inquiry"],
  "Supply Chain": ["supply chain", "inventory", "logistics", "procurement", "vendor", "supplier", "shipping"],
  "R&D": ["r&d", "research", "develop", "innovation", "prototype", "experiment", "patent"],
  Executive: ["executive", "strateg", "board", "c-suite", "leadership", "decision"],
  General: ["general", "business", "enterprise", "organization"],
};

// Pattern scoring weights based on primitives
const PATTERN_PRIMITIVE_SCORES: Record<AgenticPattern, Record<string, number>> = {
  "Semantic Router": { classification: 3, routing: 3, extraction: 2, prediction: 1 },
  "Orchestrator-Workers": { orchestration: 3, routing: 2, monitoring: 2, generation: 1 },
  "ReAct Loop": { reasoning: 3, validation: 2, extraction: 2, monitoring: 1 },
  "Drafter-Critic": { generation: 3, validation: 2, summarization: 2, translation: 1 },
  "Constitutional Guardrail": { validation: 3, reasoning: 2, monitoring: 2, extraction: 1 },
  "RAG Detective": { retrieval: 3, extraction: 2, summarization: 2, reasoning: 1 },
  "Memetic Agent": { prediction: 3, reasoning: 2, generation: 2, extraction: 1 },
  "Human-in-the-Loop": { validation: 2, reasoning: 2, routing: 2, monitoring: 1 },
};

// Pattern scoring weights based on business function
const PATTERN_FUNCTION_SCORES: Record<AgenticPattern, Record<string, number>> = {
  "Semantic Router": { "Customer Service": 3, Sales: 2, Operations: 2, HR: 1 },
  "Orchestrator-Workers": { Operations: 3, "Supply Chain": 3, Finance: 2, IT: 2 },
  "ReAct Loop": { IT: 3, "R&D": 2, Operations: 2, "Customer Service": 1 },
  "Drafter-Critic": { Marketing: 3, Legal: 3, "R&D": 2, Sales: 1 },
  "Constitutional Guardrail": { Compliance: 3, Legal: 3, Finance: 2, HR: 2 },
  "RAG Detective": { "R&D": 3, Legal: 2, "Customer Service": 2, Sales: 1 },
  "Memetic Agent": { Marketing: 3, Sales: 3, "Customer Service": 2, HR: 1 },
  "Human-in-the-Loop": { Compliance: 3, Finance: 2, Legal: 2, Executive: 3 },
};

// Detect AI primitives from text
function detectAIPrimitives(text: string): AIPrimitive[] {
  const lowerText = text.toLowerCase();
  const detected: AIPrimitive[] = [];
  
  for (const [primitive, keywords] of Object.entries(AI_PRIMITIVE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        if (!detected.includes(primitive as AIPrimitive)) {
          detected.push(primitive as AIPrimitive);
        }
        break;
      }
    }
  }
  
  return detected;
}

// Detect business function from text
function detectBusinessFunction(text: string, explicitFunction?: string): BusinessFunction {
  if (explicitFunction) {
    const normalized = explicitFunction.toLowerCase();
    for (const func of Object.keys(BUSINESS_FUNCTION_KEYWORDS)) {
      if (func.toLowerCase() === normalized || normalized.includes(func.toLowerCase())) {
        return func as BusinessFunction;
      }
    }
  }
  
  const lowerText = text.toLowerCase();
  let bestMatch: BusinessFunction = "General";
  let highestScore = 0;
  
  for (const [func, keywords] of Object.entries(BUSINESS_FUNCTION_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        score++;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = func as BusinessFunction;
    }
  }
  
  return bestMatch;
}

// Calculate pattern scores based on detected primitives and function
function calculatePatternScores(
  primitives: AIPrimitive[],
  businessFunction: BusinessFunction
): Map<AgenticPattern, number> {
  const scores = new Map<AgenticPattern, number>();
  
  for (const pattern of AGENTIC_PATTERNS) {
    let score = 0;
    
    const primitiveScores = PATTERN_PRIMITIVE_SCORES[pattern] || {};
    for (const primitive of primitives) {
      score += primitiveScores[primitive] || 0;
    }
    
    const functionScores = PATTERN_FUNCTION_SCORES[pattern] || {};
    score += functionScores[businessFunction] || 0;
    
    scores.set(pattern, score);
  }
  
  return scores;
}

// Enterprise HITL rationale generator
function generateHITLRationale(businessFunction: BusinessFunction, primitives: AIPrimitive[]): string {
  const hasHighRisk = primitives.includes("validation") || 
                      primitives.includes("reasoning") || 
                      primitives.includes("prediction");
  const isRegulated = ["Compliance", "Legal", "Finance", "HR"].includes(businessFunction);
  
  if (isRegulated) {
    return `Human-in-the-Loop oversight is mandatory for ${businessFunction} operations due to regulatory requirements and the need for accountable decision-making. Critical checkpoints ensure compliance and risk mitigation.`;
  }
  
  if (hasHighRisk) {
    return `Human-in-the-Loop checkpoints are essential for quality assurance and error correction when AI performs ${primitives.join(", ")} operations. Expert oversight maintains accuracy and prevents costly mistakes.`;
  }
  
  return `Human-in-the-Loop governance ensures enterprise-grade accountability. Human experts review AI recommendations at key decision points, maintaining quality standards and providing an audit trail.`;
}

export function mapAgenticPatterns(useCase: UseCase): AgenticPatternMapping {
  const text = `${useCase.name} ${useCase.description || ""} ${useCase.frictionPoint || ""}`.toLowerCase();
  
  const primitives = detectAIPrimitives(text);
  const businessFunction = detectBusinessFunction(text, useCase.businessFunction);
  
  const scores = calculatePatternScores(primitives, businessFunction);
  
  const sortedPatterns = Array.from(scores.entries())
    .filter(([pattern]) => pattern !== "Human-in-the-Loop")
    .sort((a, b) => b[1] - a[1]);
  
  const [primaryPattern, primaryScore] = sortedPatterns[0] || ["Semantic Router", 0];
  const [secondaryPattern, secondaryScore] = sortedPatterns[1] || [null, 0];
  
  const maxPossibleScore = 15;
  const confidenceScore = Math.min(100, Math.round((primaryScore / maxPossibleScore) * 100));
  
  const primaryRationale = generatePatternRationale(primaryPattern, primitives, businessFunction);
  
  let secondaryRationale: string | null = null;
  let finalSecondaryPattern: AgenticPattern | null = null;
  
  if (secondaryPattern && secondaryScore > 0 && secondaryScore >= primaryScore * 0.5) {
    finalSecondaryPattern = secondaryPattern;
    secondaryRationale = `${secondaryPattern} serves as a complementary pattern for ${primitives.filter(p => PATTERN_PRIMITIVE_SCORES[secondaryPattern]?.[p]).join(", ") || "supporting"} capabilities.`;
  }
  
  const hitlRationale = generateHITLRationale(businessFunction, primitives);
  
  return {
    primaryPattern,
    primaryRationale,
    secondaryPattern: finalSecondaryPattern,
    secondaryRationale,
    hitlPattern: "Human-in-the-Loop",
    hitlRationale,
    detectedPrimitives: primitives,
    detectedFunction: businessFunction,
    confidenceScore,
  };
}

function generatePatternRationale(
  pattern: AgenticPattern,
  primitives: string[],
  businessFunction: string
): string {
  const primitivesText = primitives.length > 0 ? primitives.join(", ") : "general processing";
  
  const rationales: Record<AgenticPattern, string> = {
    "Semantic Router": `Semantic Router pattern optimally handles ${primitivesText} operations for ${businessFunction}. It excels at intelligent classification and routing of requests to appropriate processing paths, reducing manual triage overhead by 70-90%.`,
    "Orchestrator-Workers": `Orchestrator-Workers pattern coordinates multiple ${primitivesText} tasks for ${businessFunction}. A central orchestrator decomposes complex work and delegates to specialized worker agents, enabling parallel processing and efficient resource utilization.`,
    "ReAct Loop": `ReAct Loop pattern enables iterative ${primitivesText} with reasoning-action cycles for ${businessFunction}. The agent reasons about observations, takes actions, and refines its approach until reaching the optimal solution.`,
    "Drafter-Critic": `Drafter-Critic pattern ensures high-quality ${primitivesText} outputs for ${businessFunction}. One agent generates content while another evaluates and refines it, achieving publication-quality results through structured iteration.`,
    "Constitutional Guardrail": `Constitutional Guardrail pattern enforces ${primitivesText} compliance for ${businessFunction}. AI outputs are validated against defined policies and constraints, ensuring regulatory compliance and risk mitigation.`,
    "RAG Detective": `RAG Detective pattern enhances ${primitivesText} with knowledge retrieval for ${businessFunction}. The agent searches relevant documents and data sources to ground responses in authoritative information.`,
    "Memetic Agent": `Memetic Agent pattern personalizes ${primitivesText} for ${businessFunction}. The agent learns from interactions and adapts its behavior to individual user preferences and organizational patterns.`,
    "Human-in-the-Loop": `Human-in-the-Loop pattern ensures expert oversight of ${primitivesText} for ${businessFunction}. AI recommendations are validated by domain experts at critical decision points.`,
  };
  
  return rationales[pattern] || `${pattern} pattern selected for ${primitivesText} operations in ${businessFunction}.`;
}

export async function mapAgenticPattern(useCase: UseCase): Promise<AgenticPattern> {
  const mapping = mapAgenticPatterns(useCase);
  return mapping.primaryPattern;
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
    
    const patternMapping = mapAgenticPatterns(useCase);

    return {
      useCaseId: useCase.id || `UC-${Date.now()}`,
      useCaseName: useCase.name,
      businessFunction: useCase.businessFunction || "General Operations",
      agenticPattern: patternMapping.primaryPattern,
      patternRationale: patternMapping.primaryRationale,
      patternMapping,
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
  const patternMapping = mapAgenticPatterns(useCase);
  
  return {
    useCaseId: useCase.id || `UC-${Date.now()}`,
    useCaseName: useCase.name,
    businessFunction: useCase.businessFunction || "General Operations",
    agenticPattern: patternMapping.primaryPattern,
    patternRationale: patternMapping.primaryRationale,
    patternMapping,
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
        agentType: patternMapping.primaryPattern,
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
        agentType: patternMapping.primaryPattern,
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

// ============================================================================
// WORKFLOW VALIDATION SYSTEM
// ============================================================================

function convertDurationToMinutes(duration: { value: number; unit: string }): number {
  const { value, unit } = duration;
  switch (unit) {
    case "seconds": return value / 60;
    case "minutes": return value;
    case "hours": return value * 60;
    case "days": return value * 60 * 24;
    default: return value;
  }
}

function validateRequiredFields(
  step: WorkflowStep | TargetWorkflowStep,
  stepType: "current" | "target"
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const requiredFields = ["stepNumber", "stepId", "stepName", "description", "actor", "duration"];
  
  for (const field of requiredFields) {
    if (!(step as any)[field]) {
      issues.push({
        severity: "error",
        code: "MISSING_REQUIRED_FIELD",
        message: `Step ${step.stepId || step.stepNumber} is missing required field: ${field}`,
        stepId: step.stepId,
        field,
        suggestion: `Add the ${field} property to step ${step.stepId || step.stepNumber}`
      });
    }
  }
  
  if (step.actor) {
    if (!step.actor.type) {
      issues.push({
        severity: "error",
        code: "INVALID_ACTOR",
        message: `Step ${step.stepId} has invalid actor - missing type`,
        stepId: step.stepId,
        field: "actor.type",
        suggestion: "Set actor.type to 'human', 'system', or 'ai_agent'"
      });
    }
    if (!step.actor.name) {
      issues.push({
        severity: "warning",
        code: "MISSING_ACTOR_NAME",
        message: `Step ${step.stepId} actor is missing a name`,
        stepId: step.stepId,
        field: "actor.name"
      });
    }
  }
  
  if (step.duration) {
    if (typeof step.duration.value !== "number" || step.duration.value < 0) {
      issues.push({
        severity: "error",
        code: "INVALID_DURATION",
        message: `Step ${step.stepId} has invalid duration value`,
        stepId: step.stepId,
        field: "duration.value",
        suggestion: "Duration value must be a positive number"
      });
    }
    if (!["seconds", "minutes", "hours", "days"].includes(step.duration.unit)) {
      issues.push({
        severity: "error",
        code: "INVALID_DURATION_UNIT",
        message: `Step ${step.stepId} has invalid duration unit: ${step.duration.unit}`,
        stepId: step.stepId,
        field: "duration.unit",
        suggestion: "Use 'seconds', 'minutes', 'hours', or 'days'"
      });
    }
  }
  
  if (stepType === "target") {
    const targetStep = step as TargetWorkflowStep;
    if (targetStep.isAIEnabled === undefined) {
      issues.push({
        severity: "warning",
        code: "MISSING_AI_ENABLED_FLAG",
        message: `Target step ${step.stepId} is missing isAIEnabled flag`,
        stepId: step.stepId,
        field: "isAIEnabled"
      });
    }
    if (targetStep.isHumanInTheLoop === undefined) {
      issues.push({
        severity: "warning",
        code: "MISSING_HITL_FLAG",
        message: `Target step ${step.stepId} is missing isHumanInTheLoop flag`,
        stepId: step.stepId,
        field: "isHumanInTheLoop"
      });
    }
  }
  
  return issues;
}

function validateConnectedSteps(
  steps: (WorkflowStep | TargetWorkflowStep)[],
  stepType: "current" | "target"
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const stepIds = new Set(steps.map(s => s.stepId));
  const referencedSteps = new Set<string>();
  
  for (const step of steps) {
    if (step.connectedTo && step.connectedTo.length > 0) {
      for (const targetId of step.connectedTo) {
        if (!stepIds.has(targetId)) {
          issues.push({
            severity: "error",
            code: "INVALID_CONNECTION",
            message: `Step ${step.stepId} connects to non-existent step ${targetId}`,
            stepId: step.stepId,
            field: "connectedTo",
            suggestion: `Remove or correct the connection to ${targetId}`
          });
        }
        referencedSteps.add(targetId);
      }
    }
  }
  
  for (const step of steps) {
    if (step.stepNumber > 1 && !referencedSteps.has(step.stepId)) {
      const hasIncomingFromPrevious = steps.some(
        s => s.connectedTo?.includes(step.stepId)
      );
      if (!hasIncomingFromPrevious) {
        issues.push({
          severity: "warning",
          code: "ORPHANED_STEP",
          message: `Step ${step.stepId} (${step.stepName}) has no incoming connections - may be orphaned`,
          stepId: step.stepId,
          suggestion: "Ensure this step is connected in the workflow flow"
        });
      }
    }
  }
  
  const lastStep = steps[steps.length - 1];
  if (lastStep && lastStep.connectedTo && lastStep.connectedTo.length > 0) {
    issues.push({
      severity: "info",
      code: "TERMINAL_WITH_CONNECTIONS",
      message: `Last step ${lastStep.stepId} has outgoing connections - verify this is intentional`,
      stepId: lastStep.stepId,
      field: "connectedTo"
    });
  }
  
  return issues;
}

function validateDurationRealism(
  steps: (WorkflowStep | TargetWorkflowStep)[],
  config: WorkflowValidationConfig
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  
  for (const step of steps) {
    if (!step.duration) continue;
    
    const durationMinutes = convertDurationToMinutes(step.duration);
    
    if (durationMinutes < config.minDurationSeconds / 60) {
      issues.push({
        severity: "warning",
        code: "DURATION_TOO_SHORT",
        message: `Step ${step.stepId} has unusually short duration (${step.duration.value} ${step.duration.unit})`,
        stepId: step.stepId,
        field: "duration",
        suggestion: "Verify this duration is realistic for the described task"
      });
    }
    
    if (durationMinutes > config.maxDurationMinutes) {
      issues.push({
        severity: "warning",
        code: "DURATION_TOO_LONG",
        message: `Step ${step.stepId} has unusually long duration (${step.duration.value} ${step.duration.unit} = ${Math.round(durationMinutes)} minutes)`,
        stepId: step.stepId,
        field: "duration",
        suggestion: "Consider breaking this into multiple steps or verify the estimate"
      });
    }
  }
  
  return issues;
}

export function validateWorkflowData(
  currentStateWorkflow: WorkflowStep[],
  targetStateWorkflow: TargetWorkflowStep[],
  config: WorkflowValidationConfig = DEFAULT_VALIDATION_CONFIG
): WorkflowValidationResult {
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];
  const infos: WorkflowValidationIssue[] = [];
  
  const bottleneckCount = currentStateWorkflow.filter(s => s.isBottleneck).length;
  const frictionPointCount = currentStateWorkflow.filter(s => s.isFrictionPoint).length;
  const hitlCheckpointCount = targetStateWorkflow.filter(s => s.isHumanInTheLoop).length;
  const aiEnabledStepCount = targetStateWorkflow.filter(s => s.isAIEnabled).length;
  
  if (currentStateWorkflow.length < config.minCurrentSteps) {
    errors.push({
      severity: "error",
      code: "INSUFFICIENT_CURRENT_STEPS",
      message: `Current state workflow has ${currentStateWorkflow.length} steps, minimum required is ${config.minCurrentSteps}`,
      suggestion: `Add ${config.minCurrentSteps - currentStateWorkflow.length} more steps to current state workflow`
    });
  }
  
  if (targetStateWorkflow.length < config.minTargetSteps) {
    errors.push({
      severity: "error",
      code: "INSUFFICIENT_TARGET_STEPS",
      message: `Target state workflow has ${targetStateWorkflow.length} steps, minimum required is ${config.minTargetSteps}`,
      suggestion: `Add ${config.minTargetSteps - targetStateWorkflow.length} more steps to target state workflow`
    });
  }
  
  if (config.requireBottleneck && bottleneckCount === 0) {
    errors.push({
      severity: "error",
      code: "NO_BOTTLENECK",
      message: "Current state workflow must have at least one bottleneck identified",
      suggestion: "Mark at least one step as isBottleneck: true to identify process inefficiencies"
    });
  }
  
  if (frictionPointCount === 0) {
    warnings.push({
      severity: "warning",
      code: "NO_FRICTION_POINT",
      message: "Current state workflow has no friction points identified",
      suggestion: "Consider marking steps with isFrictionPoint: true to highlight pain points"
    });
  }
  
  if (config.requireHITL && hitlCheckpointCount === 0) {
    errors.push({
      severity: "error",
      code: "NO_HITL_CHECKPOINT",
      message: "Target state workflow must have at least one Human-in-the-Loop checkpoint",
      suggestion: "Add at least one step with isHumanInTheLoop: true for enterprise compliance"
    });
  }
  
  if (aiEnabledStepCount === 0) {
    errors.push({
      severity: "error",
      code: "NO_AI_ENABLED_STEPS",
      message: "Target state workflow has no AI-enabled steps",
      suggestion: "Add at least one step with isAIEnabled: true to show AI transformation value"
    });
  }
  
  for (const step of currentStateWorkflow) {
    const fieldIssues = validateRequiredFields(step, "current");
    for (const issue of fieldIssues) {
      if (issue.severity === "error") errors.push(issue);
      else if (issue.severity === "warning") warnings.push(issue);
      else infos.push(issue);
    }
  }
  
  for (const step of targetStateWorkflow) {
    const fieldIssues = validateRequiredFields(step, "target");
    for (const issue of fieldIssues) {
      if (issue.severity === "error") errors.push(issue);
      else if (issue.severity === "warning") warnings.push(issue);
      else infos.push(issue);
    }
  }
  
  const currentConnIssues = validateConnectedSteps(currentStateWorkflow, "current");
  const targetConnIssues = validateConnectedSteps(targetStateWorkflow, "target");
  
  for (const issue of [...currentConnIssues, ...targetConnIssues]) {
    if (issue.severity === "error") errors.push(issue);
    else if (issue.severity === "warning") warnings.push(issue);
    else infos.push(issue);
  }
  
  const currentDurationIssues = validateDurationRealism(currentStateWorkflow, config);
  const targetDurationIssues = validateDurationRealism(targetStateWorkflow, config);
  
  for (const issue of [...currentDurationIssues, ...targetDurationIssues]) {
    if (issue.severity === "error") errors.push(issue);
    else if (issue.severity === "warning") warnings.push(issue);
    else infos.push(issue);
  }
  
  const orphanedStepCount = 
    currentConnIssues.filter(i => i.code === "ORPHANED_STEP").length +
    targetConnIssues.filter(i => i.code === "ORPHANED_STEP").length;
  
  const durationOutlierCount = 
    currentDurationIssues.length + targetDurationIssues.length;
  
  const currentStateValid = !errors.some(e => 
    e.code === "INSUFFICIENT_CURRENT_STEPS" || 
    e.code === "NO_BOTTLENECK" ||
    (e.stepId?.startsWith("CS-"))
  );
  
  const targetStateValid = !errors.some(e => 
    e.code === "INSUFFICIENT_TARGET_STEPS" || 
    e.code === "NO_HITL_CHECKPOINT" ||
    e.code === "NO_AI_ENABLED_STEPS" ||
    (e.stepId?.startsWith("TS-"))
  );
  
  return {
    isValid: errors.length === 0,
    currentStateValid,
    targetStateValid,
    totalIssues: errors.length + warnings.length + infos.length,
    errors,
    warnings,
    infos,
    metrics: {
      currentStepCount: currentStateWorkflow.length,
      targetStepCount: targetStateWorkflow.length,
      bottleneckCount,
      frictionPointCount,
      hitlCheckpointCount,
      aiEnabledStepCount,
      orphanedStepCount,
      durationOutlierCount
    }
  };
}

export function repairWorkflowData(
  currentStateWorkflow: WorkflowStep[],
  targetStateWorkflow: TargetWorkflowStep[],
  config: WorkflowValidationConfig = DEFAULT_VALIDATION_CONFIG
): { current: WorkflowStep[]; target: TargetWorkflowStep[]; repairsApplied: string[] } {
  const repairsApplied: string[] = [];
  let current = [...currentStateWorkflow];
  let target = [...targetStateWorkflow];
  
  if (current.length > 0 && !current.some(s => s.isBottleneck)) {
    const longestStep = current.reduce((prev, curr) => {
      const prevDur = convertDurationToMinutes(prev.duration);
      const currDur = convertDurationToMinutes(curr.duration);
      return currDur > prevDur ? curr : prev;
    });
    longestStep.isBottleneck = true;
    repairsApplied.push(`Marked step ${longestStep.stepId} as bottleneck (longest duration)`);
  }
  
  if (current.length > 0 && !current.some(s => s.isFrictionPoint)) {
    const firstManualStep = current.find(s => s.actor?.type === "human");
    if (firstManualStep) {
      firstManualStep.isFrictionPoint = true;
      repairsApplied.push(`Marked step ${firstManualStep.stepId} as friction point`);
    }
  }
  
  if (target.length > 0 && !target.some(s => s.isHumanInTheLoop)) {
    const decisionStep = target.find(s => s.isDecisionPoint);
    const lastStep = target[target.length - 1];
    const stepToMark = decisionStep || lastStep;
    if (stepToMark) {
      stepToMark.isHumanInTheLoop = true;
      stepToMark.automationLevel = "supervised";
      repairsApplied.push(`Added HITL checkpoint to step ${stepToMark.stepId}`);
    }
  }
  
  if (target.length > 0 && !target.some(s => s.isAIEnabled)) {
    const firstStep = target[0];
    if (firstStep) {
      firstStep.isAIEnabled = true;
      firstStep.aiCapabilities = firstStep.aiCapabilities || ["Data Processing"];
      firstStep.automationLevel = "assisted";
      repairsApplied.push(`Marked step ${firstStep.stepId} as AI-enabled`);
    }
  }
  
  for (const step of current) {
    if (!step.connectedTo) step.connectedTo = [];
  }
  for (const step of target) {
    if (!step.connectedTo) step.connectedTo = [];
  }
  
  for (let i = 0; i < current.length - 1; i++) {
    const currentStep = current[i];
    const nextStep = current[i + 1];
    if (!currentStep.connectedTo.includes(nextStep.stepId)) {
      currentStep.connectedTo.push(nextStep.stepId);
      repairsApplied.push(`Connected current step ${currentStep.stepId} to ${nextStep.stepId}`);
    }
  }
  
  for (let i = 0; i < target.length - 1; i++) {
    const currentStep = target[i];
    const nextStep = target[i + 1];
    if (!currentStep.connectedTo.includes(nextStep.stepId)) {
      currentStep.connectedTo.push(nextStep.stepId);
      repairsApplied.push(`Connected target step ${currentStep.stepId} to ${nextStep.stepId}`);
    }
  }
  
  return { current, target, repairsApplied };
}
