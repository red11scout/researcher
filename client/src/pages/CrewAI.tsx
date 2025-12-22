import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, Play, Users, ListTodo, History, Bot, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface Agent {
  id: string;
  role: string;
  goal: string;
}

interface Task {
  id: string;
  description: string;
  agent: string;
}

interface Crew {
  id: string;
  name: string;
  description: string;
  agents: string[];
}

interface Execution {
  id: string;
  topic: string;
  crew_type: string;
  model: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  result: string;
  status: string;
}

export default function CrewAI() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [selectedCrew, setSelectedCrew] = useState("research");
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("run");

  const { data: healthData, refetch: refetchHealth, isLoading: isHealthLoading } = useQuery({
    queryKey: ["crewai-health"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/crewai/health");
        return res.json();
      } catch {
        return { status: "unavailable" };
      }
    },
    refetchInterval: 5000,
  });
  
  const startServiceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/crewai/start", { method: "POST" });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Service Started", description: data.message });
        setTimeout(() => refetchHealth(), 2000);
      } else {
        toast({ title: "Start Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Start Failed", description: "Could not start service", variant: "destructive" });
    },
  });
  
  const stopServiceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/crewai/stop", { method: "POST" });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Service Stopped", description: data.message });
      setTimeout(() => refetchHealth(), 1000);
    },
  });

  const { data: agentsData } = useQuery({
    queryKey: ["crewai-agents"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/crewai/agents");
        return res.json();
      } catch {
        return { agents: [] };
      }
    },
    enabled: healthData?.status === "healthy",
  });

  const { data: tasksData } = useQuery({
    queryKey: ["crewai-tasks"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/crewai/tasks");
        return res.json();
      } catch {
        return { tasks: [] };
      }
    },
    enabled: healthData?.status === "healthy",
  });

  const { data: crewsData } = useQuery({
    queryKey: ["crewai-crews"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/crewai/crews");
        return res.json();
      } catch {
        return { crews: [] };
      }
    },
    enabled: healthData?.status === "healthy",
  });

  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ["crewai-history"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/crewai/history?limit=20");
        return res.json();
      } catch {
        return { executions: [] };
      }
    },
    enabled: healthData?.status === "healthy",
  });

  const runCrewMutation = useMutation({
    mutationFn: async (payload: {
      topic: string;
      crew_type: string;
      model: string;
      agents?: string[];
      tasks?: string[];
    }) => {
      const res = await fetch("/api/crewai/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to run crew");
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["crewai-history"] });
      toast({
        title: "Crew Execution Complete",
        description: `Completed in ${data.duration_seconds?.toFixed(1)}s`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Execution Failed",
        description: error.message || "CrewAI service may be unavailable",
        variant: "destructive",
      });
    },
  });

  const handleRunCrew = () => {
    if (!topic.trim()) {
      toast({
        title: "Topic Required",
        description: "Please enter a topic for the crew to work on",
        variant: "destructive",
      });
      return;
    }

    if (!isServiceAvailable) {
      toast({
        title: "Service Unavailable",
        description: "The CrewAI service is not running. Please start the service first.",
        variant: "destructive",
      });
      return;
    }

    const payload: any = {
      topic: topic.trim(),
      crew_type: selectedCrew,
      model: selectedModel,
    };

    if (selectedCrew === "custom") {
      payload.agents = selectedAgents;
      payload.tasks = selectedTasks;
    }

    // Include uploaded documents from sessionStorage if available
    try {
      const storedDocs = sessionStorage.getItem("uploadedDocuments");
      if (storedDocs) {
        const documents = JSON.parse(storedDocs);
        if (documents && documents.length > 0) {
          payload.documents = documents;
          toast({
            title: "Documents Included",
            description: `Including ${documents.length} uploaded document(s) for analysis`,
          });
        }
      }
    } catch (e) {
      console.error("Failed to parse stored documents:", e);
    }

    runCrewMutation.mutate(payload);
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const toggleTask = (taskId: string) => {
    setSelectedTasks((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const isServiceAvailable = healthData?.status === "healthy";
  const agents: Agent[] = agentsData?.agents || [];
  const tasks: Task[] = tasksData?.tasks || [];
  const crews: Crew[] = crewsData?.crews || [];
  const executions: Execution[] = historyData?.executions || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg shadow-lg">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent" data-testid="text-page-title">
              CrewAI Agentic Framework
            </h1>
          </div>
          <p className="text-slate-600 ml-12">
            Orchestrate autonomous AI agents to work together on complex tasks
          </p>
          <div className="ml-12 mt-2 flex items-center gap-3">
            <Badge
              variant={isServiceAvailable ? "default" : "destructive"}
              className="text-xs"
              data-testid="badge-service-status"
            >
              {isHealthLoading ? "Checking..." : isServiceAvailable ? "Service Online" : "Service Offline"}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchHealth()}
              className="h-6 px-2"
              data-testid="button-refresh-status"
            >
              <RefreshCw className={`h-3 w-3 ${isHealthLoading ? 'animate-spin' : ''}`} />
            </Button>
            {!isServiceAvailable ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startServiceMutation.mutate()}
                disabled={startServiceMutation.isPending}
                className="h-6 text-xs"
                data-testid="button-start-service"
              >
                {startServiceMutation.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 mr-1" />
                    Start Service
                  </>
                )}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => stopServiceMutation.mutate()}
                disabled={stopServiceMutation.isPending}
                className="h-6 text-xs text-slate-500"
                data-testid="button-stop-service"
              >
                Stop
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
            <TabsTrigger value="run" className="gap-2" data-testid="tab-run">
              <Play className="h-4 w-4" />
              Run
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-2" data-testid="tab-agents">
              <Users className="h-4 w-4" />
              Agents
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2" data-testid="tab-tasks">
              <ListTodo className="h-4 w-4" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2" data-testid="tab-history">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="run" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-blue-600" />
                    Run a Crew
                  </CardTitle>
                  <CardDescription>
                    Configure and execute an AI agent crew on a topic
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="topic">Topic / Task Description</Label>
                    <Input
                      id="topic"
                      placeholder="e.g., Latest developments in AI agents"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      data-testid="input-topic"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Crew Type</Label>
                    <Select value={selectedCrew} onValueChange={setSelectedCrew}>
                      <SelectTrigger data-testid="select-crew-type">
                        <SelectValue placeholder="Select a crew" />
                      </SelectTrigger>
                      <SelectContent>
                        {crews.map((crew) => (
                          <SelectItem key={crew.id} value={crew.id}>
                            {crew.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {crews.find((c) => c.id === selectedCrew)?.description && (
                      <p className="text-xs text-slate-500">
                        {crews.find((c) => c.id === selectedCrew)?.description}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger data-testid="select-model">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini (Fast)</SelectItem>
                        <SelectItem value="gpt-4o">GPT-4o (Powerful)</SelectItem>
                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedCrew === "custom" && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="space-y-2">
                        <Label>Select Agents</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {agents.map((agent) => (
                            <div key={agent.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`agent-${agent.id}`}
                                checked={selectedAgents.includes(agent.id)}
                                onCheckedChange={() => toggleAgent(agent.id)}
                                data-testid={`checkbox-agent-${agent.id}`}
                              />
                              <label
                                htmlFor={`agent-${agent.id}`}
                                className="text-sm font-medium leading-none cursor-pointer"
                              >
                                {agent.id.replace(/_/g, " ")}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Select Tasks</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {tasks.map((task) => (
                            <div key={task.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`task-${task.id}`}
                                checked={selectedTasks.includes(task.id)}
                                onCheckedChange={() => toggleTask(task.id)}
                                data-testid={`checkbox-task-${task.id}`}
                              />
                              <label
                                htmlFor={`task-${task.id}`}
                                className="text-sm font-medium leading-none cursor-pointer"
                              >
                                {task.id.replace(/_/g, " ")}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleRunCrew}
                    disabled={!topic.trim() || runCrewMutation.isPending || !isServiceAvailable}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    data-testid="button-run-crew"
                  >
                    {runCrewMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Running Crew...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run Crew
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
                <CardHeader>
                  <CardTitle>Result</CardTitle>
                  <CardDescription>Output from the crew execution</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] rounded-md border p-4 bg-slate-50">
                    {runCrewMutation.isPending ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <Loader2 className="h-8 w-8 animate-spin mb-4" />
                        <p className="text-sm">AI agents are working on your task...</p>
                        <p className="text-xs text-slate-400 mt-2">This may take a few minutes</p>
                      </div>
                    ) : runCrewMutation.data?.success ? (
                      <pre className="text-sm whitespace-pre-wrap font-mono" data-testid="text-result">
                        {runCrewMutation.data.result}
                      </pre>
                    ) : runCrewMutation.data?.error ? (
                      <div className="text-red-600 flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Error</p>
                          <p className="text-sm mt-1">{runCrewMutation.data.error}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-400 text-center py-8">
                        <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Run a crew to see results here</p>
                      </div>
                    )}
                  </ScrollArea>
                  {runCrewMutation.data?.duration_seconds && (
                    <p className="text-xs text-slate-500 mt-2 text-right">
                      Completed in {runCrewMutation.data.duration_seconds.toFixed(1)}s
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="agents">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {agents.map((agent, index) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="shadow-md border-0 bg-white/80 backdrop-blur h-full">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Users className="h-4 w-4 text-blue-600" />
                          </div>
                          <CardTitle className="text-lg capitalize">
                            {agent.id.replace(/_/g, " ")}
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase">Role</p>
                          <p className="text-sm">{agent.role.replace("{topic}", "[topic]")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase">Goal</p>
                          <p className="text-sm text-slate-600">{agent.goal.replace("{topic}", "[topic]")}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
              {agents.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No agents available. Start the CrewAI service to see agents.</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tasks">
            <div className="grid gap-4 md:grid-cols-2">
              <AnimatePresence>
                {tasks.map((task, index) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="shadow-md border-0 bg-white/80 backdrop-blur h-full">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                              <ListTodo className="h-4 w-4 text-indigo-600" />
                            </div>
                            <CardTitle className="text-lg capitalize">
                              {task.id.replace(/_/g, " ")}
                            </CardTitle>
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {task.agent}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-slate-600 line-clamp-4">
                          {task.description.replace("{topic}", "[topic]")}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
              {tasks.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500">
                  <ListTodo className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No tasks available. Start the CrewAI service to see tasks.</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history">
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Execution History</CardTitle>
                  <CardDescription>Previous crew executions and their results</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {executions.length > 0 ? (
                  <div className="space-y-4">
                    {executions.map((execution) => (
                      <div
                        key={execution.id}
                        className="p-4 rounded-lg border bg-slate-50/50 hover:bg-slate-50 transition-colors"
                        data-testid={`execution-${execution.id}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium">{execution.topic}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {execution.crew_type}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {execution.model}
                              </Badge>
                              <span className="text-xs text-slate-500">
                                {execution.duration_seconds.toFixed(1)}s
                              </span>
                            </div>
                          </div>
                          <span className="text-xs text-slate-500">
                            {new Date(execution.completed_at).toLocaleString()}
                          </span>
                        </div>
                        <Separator className="my-2" />
                        <ScrollArea className="h-24">
                          <pre className="text-xs text-slate-600 whitespace-pre-wrap">
                            {execution.result.substring(0, 500)}
                            {execution.result.length > 500 && "..."}
                          </pre>
                        </ScrollArea>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No executions yet. Run a crew to see history.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
