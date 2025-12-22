import { spawn, ChildProcess } from "child_process";
import path from "path";

let crewaiProcess: ChildProcess | null = null;
let isStarting = false;
let startupError: string | null = null;
let restartCount = 0;
const MAX_RESTARTS = 3;

export function getServiceStatus(): { 
  running: boolean; 
  pid?: number; 
  starting: boolean;
  error?: string;
  restartCount: number;
} {
  if (isStarting) {
    return { running: false, starting: true, restartCount };
  }
  if (crewaiProcess && !crewaiProcess.killed && crewaiProcess.exitCode === null) {
    return { running: true, pid: crewaiProcess.pid, starting: false, restartCount };
  }
  return { 
    running: false, 
    starting: false, 
    error: startupError || undefined,
    restartCount 
  };
}

async function waitForHealth(port: string, maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        const data = await response.json();
        return data.status === "healthy";
      }
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export async function startCrewAIService(): Promise<{ 
  success: boolean; 
  message: string; 
  pid?: number;
}> {
  if (isStarting) {
    return { success: false, message: "Service is already starting" };
  }
  
  if (crewaiProcess && !crewaiProcess.killed && crewaiProcess.exitCode === null) {
    const isHealthy = await waitForHealth(process.env.CREWAI_PORT || "5001", 2);
    if (isHealthy) {
      return { success: true, message: "Service is already running", pid: crewaiProcess.pid };
    }
    crewaiProcess.kill("SIGTERM");
    crewaiProcess = null;
  }
  
  isStarting = true;
  startupError = null;
  
  try {
    const servicePath = path.join(process.cwd(), "crewai_service");
    const port = process.env.CREWAI_PORT || "5001";
    
    crewaiProcess = spawn("python", ["api.py"], {
      cwd: servicePath,
      env: { ...process.env, CREWAI_PORT: port },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });
    
    if (!crewaiProcess.pid) {
      isStarting = false;
      startupError = "Failed to spawn process";
      return { success: false, message: startupError };
    }
    
    const pid = crewaiProcess.pid;
    let stderrOutput = "";
    
    crewaiProcess.stdout?.on("data", (data) => {
      console.log(`[CrewAI] ${data.toString().trim()}`);
    });
    
    crewaiProcess.stderr?.on("data", (data) => {
      const output = data.toString().trim();
      console.error(`[CrewAI] ${output}`);
      stderrOutput += output + "\n";
    });
    
    const earlyExitPromise = new Promise<{ exited: boolean; code: number | null }>((resolve) => {
      crewaiProcess?.on("exit", (code) => {
        console.log(`[CrewAI] Process exited with code ${code}`);
        if (isStarting) {
          resolve({ exited: true, code });
        }
      });
      crewaiProcess?.on("error", (err) => {
        console.error(`[CrewAI] Process error: ${err.message}`);
        startupError = err.message;
        if (isStarting) {
          resolve({ exited: true, code: -1 });
        }
      });
    });
    
    const healthCheckPromise = waitForHealth(port, 15).then((healthy) => ({ healthy }));
    
    const result = await Promise.race([
      earlyExitPromise,
      healthCheckPromise,
      new Promise<{ timeout: boolean }>((resolve) => 
        setTimeout(() => resolve({ timeout: true }), 8000)
      ),
    ]);
    
    isStarting = false;
    
    if ("exited" in result) {
      startupError = stderrOutput || `Process exited with code ${result.code}`;
      crewaiProcess = null;
      return { 
        success: false, 
        message: `Service failed to start: ${startupError.substring(0, 200)}` 
      };
    }
    
    if ("healthy" in result && result.healthy) {
      restartCount = 0;
      
      crewaiProcess.on("exit", () => {
        console.log("[CrewAI] Service stopped unexpectedly");
        crewaiProcess = null;
        if (restartCount < MAX_RESTARTS) {
          restartCount++;
          console.log(`[CrewAI] Auto-restart attempt ${restartCount}/${MAX_RESTARTS}`);
          setTimeout(() => startCrewAIService(), 2000);
        }
      });
      
      return { success: true, message: "Service started and healthy", pid };
    }
    
    if ("timeout" in result) {
      const checkHealth = await waitForHealth(port, 3);
      if (checkHealth) {
        return { success: true, message: "Service started (delayed health)", pid };
      }
      startupError = "Health check timed out";
      crewaiProcess?.kill("SIGTERM");
      crewaiProcess = null;
      return { success: false, message: startupError };
    }
    
    return { success: false, message: "Unknown startup state" };
    
  } catch (error: any) {
    isStarting = false;
    const errorMessage = error.message || "Failed to start service";
    startupError = errorMessage;
    return { success: false, message: errorMessage };
  }
}

export function stopCrewAIService(): { success: boolean; message: string } {
  restartCount = MAX_RESTARTS;
  
  if (!crewaiProcess || crewaiProcess.killed || crewaiProcess.exitCode !== null) {
    crewaiProcess = null;
    return { success: true, message: "Service is not running" };
  }
  
  try {
    crewaiProcess.kill("SIGTERM");
    crewaiProcess = null;
    return { success: true, message: "Service stopped" };
  } catch (error: any) {
    return { success: false, message: error.message || "Failed to stop service" };
  }
}

export async function ensureServiceRunning(): Promise<boolean> {
  const status = getServiceStatus();
  if (status.running) {
    return true;
  }
  if (status.starting) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return getServiceStatus().running;
  }
  const result = await startCrewAIService();
  return result.success;
}
