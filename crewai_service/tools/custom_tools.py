"""Custom tools for CrewAI agents."""

from crewai_tools import tool
from typing import Optional
import json


@tool("Data Formatter")
def format_data(data: str, format_type: str = "json") -> str:
    """
    Format data into a specified format (json, markdown, csv).
    
    Args:
        data: The data to format as a string
        format_type: The output format (json, markdown, csv)
    
    Returns:
        Formatted data string
    """
    try:
        if format_type == "json":
            parsed = json.loads(data) if isinstance(data, str) else data
            return json.dumps(parsed, indent=2)
        elif format_type == "markdown":
            return f"## Data Output\n\n```\n{data}\n```"
        elif format_type == "csv":
            return data.replace(", ", ",").replace(" - ", ",")
        else:
            return data
    except Exception as e:
        return f"Error formatting data: {str(e)}\n\nOriginal data:\n{data}"


@tool("Summary Generator")
def generate_summary(text: str, max_length: Optional[int] = 500) -> str:
    """
    Generate a concise summary of the provided text.
    
    Args:
        text: The text to summarize
        max_length: Maximum length of the summary in characters
    
    Returns:
        A summarized version of the text
    """
    if len(text) <= max_length:
        return text
    
    sentences = text.split('. ')
    summary = []
    current_length = 0
    
    for sentence in sentences:
        if current_length + len(sentence) <= max_length:
            summary.append(sentence)
            current_length += len(sentence) + 2
        else:
            break
    
    return '. '.join(summary) + '...'


@tool("Bullet Point Extractor")
def extract_bullet_points(text: str) -> str:
    """
    Extract key points from text and format as bullet points.
    
    Args:
        text: The text to extract points from
    
    Returns:
        Formatted bullet points
    """
    lines = text.split('\n')
    key_phrases = []
    
    for line in lines:
        line = line.strip()
        if line and not line.startswith('#'):
            if line.startswith('- ') or line.startswith('* ') or line.startswith('• '):
                key_phrases.append(line)
            elif len(line) > 20 and len(line) < 200:
                key_phrases.append(f"• {line}")
    
    return '\n'.join(key_phrases[:20])


@tool("Priority Scorer")
def score_priority(item: str, criteria: str = "impact,urgency,feasibility") -> str:
    """
    Score an item's priority based on specified criteria.
    
    Args:
        item: The item to score
        criteria: Comma-separated scoring criteria
    
    Returns:
        Priority assessment with scores
    """
    criteria_list = [c.strip() for c in criteria.split(',')]
    
    scores = {}
    for criterion in criteria_list:
        word_count = len(item.split())
        if word_count > 10:
            scores[criterion] = "High"
        elif word_count > 5:
            scores[criterion] = "Medium"
        else:
            scores[criterion] = "Low"
    
    score_text = "\n".join([f"  - {k}: {v}" for k, v in scores.items()])
    return f"Priority Assessment for: {item[:50]}...\n{score_text}"
