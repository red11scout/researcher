"""CrewAI Crew Configuration and Management."""

import os
import yaml
from typing import Optional, Dict, Any, List
from pathlib import Path

from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task

from tools.custom_tools import format_data, generate_summary, extract_bullet_points, score_priority


def load_yaml_config(filename: str) -> Dict:
    """Load a YAML configuration file."""
    config_path = Path(__file__).parent / "config" / filename
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)


class AgenticCrew:
    """Flexible CrewAI implementation for various use cases."""
    
    def __init__(self, llm_model: str = "gpt-4o-mini", document_context: str = None):
        self.llm_model = llm_model
        self.document_context = document_context
        self.agents_config = load_yaml_config("agents.yaml")
        self.tasks_config = load_yaml_config("tasks.yaml")
        self.custom_tools = [format_data, generate_summary, extract_bullet_points, score_priority]
    
    def create_agent(self, agent_type: str, topic: str, tools: List = None) -> Agent:
        """Create an agent from configuration."""
        config = self.agents_config.get(agent_type)
        if not config:
            raise ValueError(f"Unknown agent type: {agent_type}")
        
        role = config['role'].replace('{topic}', topic)
        goal = config['goal'].replace('{topic}', topic)
        backstory = config['backstory'].replace('{topic}', topic)
        
        # Enhance agent goal and backstory when documents are provided
        if self.document_context:
            goal = f"{goal} You have been given specific documentation that MUST be deeply analyzed and heavily weighted in all your outputs. Your primary responsibility is to extract, reference, and build upon the content from these provided documents."
            backstory = f"{backstory} You are currently working with user-provided documentation that contains critical information. You must treat these documents as your authoritative source, citing specific details and ensuring your analysis directly reflects their content."
        
        return Agent(
            role=role,
            goal=goal,
            backstory=backstory,
            verbose=config.get('verbose', True),
            allow_delegation=config.get('allow_delegation', False),
            tools=tools or self.custom_tools,
            llm=self.llm_model
        )
    
    def create_task(self, task_type: str, topic: str, agent: Agent, context: List[Task] = None) -> Task:
        """Create a task from configuration."""
        config = self.tasks_config.get(task_type)
        if not config:
            raise ValueError(f"Unknown task type: {task_type}")
        
        description = config['description'].replace('{topic}', topic)
        expected_output = config['expected_output'].replace('{topic}', topic)
        
        # Incorporate document context into task description if available
        if self.document_context:
            description = f"""CRITICAL PRIORITY - DOCUMENT-DRIVEN ANALYSIS REQUIRED

The user has provided specific documentation that MUST be the foundation of your entire analysis. Your output quality will be judged primarily on how thoroughly you incorporate, reference, and reflect the content from these documents.

=== MANDATORY REQUIREMENTS ===
1. DEEP ANALYSIS: Read every section of the provided documents carefully. Extract specific facts, figures, quotes, and data points.
2. HEAVY WEIGHTING: The documents are your PRIMARY source - weight their content 5x more heavily than any general knowledge.
3. DIRECT REFERENCES: Your output MUST explicitly cite and reference specific information from the documents (e.g., "According to the provided documentation...", "The uploaded materials indicate...", "As stated in [document name]...").
4. COMPREHENSIVE COVERAGE: Address ALL relevant topics, data, and insights found in the documents - do not cherry-pick.
5. ACCURACY CHECK: Never contradict or ignore information in the provided documents. If there's ambiguity, note it and explain.

--- PROVIDED DOCUMENTS (ANALYZE THOROUGHLY) ---
{self.document_context}
--- END DOCUMENTS ---

ORIGINAL TASK:
{description}

FINAL REMINDER: Your analysis MUST demonstrate deep engagement with the uploaded documents. Generic responses that ignore the specific content provided will be considered failures. Quote, reference, and build upon the document content extensively."""
            
            # Also enhance expected output to emphasize document integration
            expected_output = f"""{expected_output}

CRITICAL: Your output must include:
- Direct quotes or specific data points from the provided documents
- Clear references to document sources (e.g., "As detailed in the uploaded documentation...")
- Analysis that builds upon and extends the information in the documents
- No generic statements that could apply without having read the documents"""
        
        return Task(
            description=description,
            expected_output=expected_output,
            agent=agent,
            context=context or []
        )
    
    def create_research_crew(self, topic: str) -> Crew:
        """Create a research-focused crew."""
        researcher = self.create_agent("researcher", topic)
        writer = self.create_agent("writer", topic)
        
        research_task = self.create_task("research_task", topic, researcher)
        writing_task = self.create_task("writing_task", topic, writer, context=[research_task])
        
        return Crew(
            agents=[researcher, writer],
            tasks=[research_task, writing_task],
            process=Process.sequential,
            verbose=True
        )
    
    def create_analysis_crew(self, topic: str) -> Crew:
        """Create an analysis-focused crew."""
        researcher = self.create_agent("researcher", topic)
        analyst = self.create_agent("analyst", topic)
        
        research_task = self.create_task("research_task", topic, researcher)
        analysis_task = self.create_task("analysis_task", topic, analyst, context=[research_task])
        
        return Crew(
            agents=[researcher, analyst],
            tasks=[research_task, analysis_task],
            process=Process.sequential,
            verbose=True
        )
    
    def create_full_crew(self, topic: str) -> Crew:
        """Create a full crew with all agents."""
        researcher = self.create_agent("researcher", topic)
        writer = self.create_agent("writer", topic)
        analyst = self.create_agent("analyst", topic)
        coordinator = self.create_agent("coordinator", topic)
        
        research_task = self.create_task("research_task", topic, researcher)
        writing_task = self.create_task("writing_task", topic, writer, context=[research_task])
        analysis_task = self.create_task("analysis_task", topic, analyst, context=[research_task])
        synthesis_task = self.create_task("synthesis_task", topic, coordinator, context=[writing_task, analysis_task])
        
        return Crew(
            agents=[researcher, writer, analyst, coordinator],
            tasks=[research_task, writing_task, analysis_task, synthesis_task],
            process=Process.sequential,
            verbose=True
        )
    
    def create_custom_crew(
        self, 
        topic: str, 
        agent_types: List[str], 
        task_types: List[str]
    ) -> Crew:
        """Create a custom crew with specified agents and tasks."""
        agents = {}
        for agent_type in agent_types:
            agents[agent_type] = self.create_agent(agent_type, topic)
        
        tasks = []
        for i, task_type in enumerate(task_types):
            task_config = self.tasks_config.get(task_type)
            if not task_config:
                continue
            
            agent_type = task_config.get('agent', agent_types[0])
            agent = agents.get(agent_type, list(agents.values())[0])
            
            context = tasks[-1:] if tasks else []
            task = self.create_task(task_type, topic, agent, context=context)
            tasks.append(task)
        
        return Crew(
            agents=list(agents.values()),
            tasks=tasks,
            process=Process.sequential,
            verbose=True
        )
    
    def run(self, crew: Crew, inputs: Dict[str, Any] = None) -> str:
        """Execute a crew and return the result."""
        result = crew.kickoff(inputs=inputs or {})
        return str(result)


def get_available_agents() -> List[Dict[str, str]]:
    """Get list of available agent types."""
    config = load_yaml_config("agents.yaml")
    return [
        {
            "id": key,
            "role": value.get("role", "").strip(),
            "goal": value.get("goal", "").strip()
        }
        for key, value in config.items()
    ]


def get_available_tasks() -> List[Dict[str, str]]:
    """Get list of available task types."""
    config = load_yaml_config("tasks.yaml")
    return [
        {
            "id": key,
            "description": value.get("description", "").strip()[:200],
            "agent": value.get("agent", "")
        }
        for key, value in config.items()
    ]
