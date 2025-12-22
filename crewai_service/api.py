"""Flask API for CrewAI service."""

import os
import sys
import json
import traceback
from datetime import datetime
from typing import Dict, Any, List

from flask import Flask, request, jsonify
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from crew import AgenticCrew, get_available_agents, get_available_tasks

app = Flask(__name__)
CORS(app)

execution_history: List[Dict[str, Any]] = []


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "crewai",
        "timestamp": datetime.utcnow().isoformat()
    })


@app.route('/agents', methods=['GET'])
def list_agents():
    """List available agent types."""
    try:
        agents = get_available_agents()
        return jsonify({
            "success": True,
            "agents": agents
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/tasks', methods=['GET'])
def list_tasks():
    """List available task types."""
    try:
        tasks = get_available_tasks()
        return jsonify({
            "success": True,
            "tasks": tasks
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/crews', methods=['GET'])
def list_crews():
    """List available crew types."""
    crews = [
        {
            "id": "research",
            "name": "Research Crew",
            "description": "Researcher + Writer for comprehensive research and documentation",
            "agents": ["researcher", "writer"]
        },
        {
            "id": "analysis",
            "name": "Analysis Crew",
            "description": "Researcher + Analyst for research and strategic analysis",
            "agents": ["researcher", "analyst"]
        },
        {
            "id": "full",
            "name": "Full Crew",
            "description": "All agents working together for comprehensive deliverables",
            "agents": ["researcher", "writer", "analyst", "coordinator"]
        },
        {
            "id": "custom",
            "name": "Custom Crew",
            "description": "Build your own crew with selected agents and tasks",
            "agents": []
        }
    ]
    return jsonify({
        "success": True,
        "crews": crews
    })


@app.route('/run', methods=['POST'])
def run_crew():
    """Execute a crew with specified configuration."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "success": False,
                "error": "No JSON data provided"
            }), 400
        
        topic = data.get('topic', '')
        crew_type = data.get('crew_type', 'research')
        model = data.get('model', 'gpt-4o-mini')
        custom_agents = data.get('agents', [])
        custom_tasks = data.get('tasks', [])
        
        if not topic:
            return jsonify({
                "success": False,
                "error": "Topic is required"
            }), 400
        
        execution_id = f"exec_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        
        agentic_crew = AgenticCrew(llm_model=model)
        
        if crew_type == 'research':
            crew = agentic_crew.create_research_crew(topic)
        elif crew_type == 'analysis':
            crew = agentic_crew.create_analysis_crew(topic)
        elif crew_type == 'full':
            crew = agentic_crew.create_full_crew(topic)
        elif crew_type == 'custom' and custom_agents and custom_tasks:
            crew = agentic_crew.create_custom_crew(topic, custom_agents, custom_tasks)
        else:
            crew = agentic_crew.create_research_crew(topic)
        
        start_time = datetime.utcnow()
        result = agentic_crew.run(crew)
        end_time = datetime.utcnow()
        
        execution_record = {
            "id": execution_id,
            "topic": topic,
            "crew_type": crew_type,
            "model": model,
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat(),
            "duration_seconds": (end_time - start_time).total_seconds(),
            "result": result,
            "status": "completed"
        }
        execution_history.append(execution_record)
        
        return jsonify({
            "success": True,
            "execution_id": execution_id,
            "result": result,
            "duration_seconds": execution_record["duration_seconds"]
        })
        
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error executing crew: {error_details}")
        
        return jsonify({
            "success": False,
            "error": str(e),
            "details": error_details
        }), 500


@app.route('/history', methods=['GET'])
def get_history():
    """Get execution history."""
    limit = request.args.get('limit', 10, type=int)
    return jsonify({
        "success": True,
        "executions": execution_history[-limit:][::-1]
    })


@app.route('/history/<execution_id>', methods=['GET'])
def get_execution(execution_id: str):
    """Get a specific execution by ID."""
    for execution in execution_history:
        if execution["id"] == execution_id:
            return jsonify({
                "success": True,
                "execution": execution
            })
    
    return jsonify({
        "success": False,
        "error": "Execution not found"
    }), 404


if __name__ == '__main__':
    port = int(os.environ.get('CREWAI_PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
