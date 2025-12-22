#!/bin/bash
cd /home/runner/workspace/crewai_service
export CREWAI_PORT=5001
exec python api.py
