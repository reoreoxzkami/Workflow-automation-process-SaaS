import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  addDoc,
  Timestamp,
  getDocFromServer,
  updateDoc,
  runTransaction
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  LayoutDashboard, 
  Bot, 
  Zap, 
  CreditCard, 
  LogOut, 
  Plus, 
  Settings, 
  ChevronRight,
  ChevronDown,
  Play,
  Activity,
  DollarSign,
  Users,
  Share2,
  Smartphone,
  Mic,
  Copy,
  Check,
  Globe,
  Mail,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { loadStripe } from '@stripe/stripe-js';
import { UserProfile, Agent, Workflow, UsageLog, WorkflowStepType, AgentTier, WorkflowRun, BillingRecord } from './types';
import { generateAgentResponse, generateWorkflowWithAI } from './services/geminiService';
import { translations, Language } from './translations';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Error Boundary ---

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#141414] text-[#E4E3E0] flex flex-col items-center justify-center p-6 text-center">
          <div className="p-4 bg-red-500/10 border border-red-500 rounded-2xl mb-6">
            <Activity className="w-12 h-12 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-[#8E8E8E] max-w-md mb-8">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-[#E4E3E0] text-[#141414] font-bold px-8 py-3 rounded-xl hover:bg-white transition-all"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Components ---

const Sidebar = ({ activeTab, setActiveTab, user, userProfile, language, setLanguage }: { 
  activeTab: string, 
  setActiveTab: (tab: string) => void, 
  user: User | null,
  userProfile: UserProfile | null,
  language: Language,
  setLanguage: (lang: Language) => void
}) => {
  const t = translations[language];
  const menuItems = [
    { id: 'dashboard', label: t.dashboard, icon: LayoutDashboard },
    { id: 'agents', label: t.agents, icon: Bot },
    { id: 'workflows', label: t.workflows, icon: Zap },
    { id: 'monitoring', label: t.monitoring, icon: Activity },
    { id: 'billing', label: t.billing, icon: CreditCard },
    { id: 'settings', label: t.settings, icon: Settings },
  ];

  return (
    <div className="w-64 h-screen bg-[#141414] text-[#E4E3E0] flex flex-col border-r border-[#2A2A2A]">
      <div className="p-6 border-bottom border-[#2A2A2A] flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
          <Zap className="text-[#00FF00] w-6 h-6" />
          {t.appName}
        </h1>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group",
              activeTab === item.id 
                ? "bg-[#E4E3E0] text-[#141414]" 
                : "hover:bg-[#2A2A2A] text-[#8E8E8E]"
            )}
          >
            <item.icon className={cn("w-5 h-5", activeTab === item.id ? "text-[#141414]" : "group-hover:text-[#E4E3E0]")} />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-[#2A2A2A] space-y-4">
        {user && userProfile && (
          <div className="px-4 py-3 bg-[#1A1A1A] rounded-xl border border-[#2A2A2A]">
            <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest mb-1">{t.balance}</p>
            <p className="text-lg font-mono text-[#00FF00]">${userProfile.balance?.toFixed(2) || "0.00"}</p>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 p-2 bg-[#1A1A1A] rounded-lg">
          <button 
            onClick={() => setLanguage('en')}
            className={cn("px-3 py-1 text-xs rounded-md transition-all", language === 'en' ? "bg-[#2A2A2A] text-white" : "text-[#8E8E8E]")}
          >
            EN
          </button>
          <button 
            onClick={() => setLanguage('ja')}
            className={cn("px-3 py-1 text-xs rounded-md transition-all", language === 'ja' ? "bg-[#2A2A2A] text-white" : "text-[#8E8E8E]")}
          >
            JA
          </button>
        </div>

        {user && (
          <div className="flex items-center gap-3 px-4 py-3">
            <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-[#2A2A2A]" referrerPolicy="no-referrer" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <p className="text-xs text-[#8E8E8E] truncate">{t.proPlan}</p>
            </div>
            <button onClick={() => signOut(auth)} className="text-[#8E8E8E] hover:text-[#FF4444]">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const Dashboard = ({ agents, logs, language, onCloneAgent, cloningAgentId, setActiveTab, onQuickAutomation, quickAutomationLoading }: { 
  agents: Agent[], 
  logs: UsageLog[], 
  language: Language,
  onCloneAgent: (agent: Agent) => void,
  cloningAgentId: string | null,
  setActiveTab: (tab: string) => void,
  onQuickAutomation: (prompt: string) => Promise<void>,
  quickAutomationLoading: boolean
}) => {
  const t = translations[language];
  const [quickPrompt, setQuickPrompt] = useState('');

  const stats = [
    { label: t.activeAgents, value: agents.length, icon: Bot, color: 'text-blue-500' },
    { label: t.totalCalls, value: logs.length, icon: Activity, color: 'text-green-500' },
    { label: t.revenue, value: `$${logs.reduce((acc, log) => acc + log.cost, 0).toFixed(2)}`, icon: DollarSign, color: 'text-yellow-500' },
    { label: t.activeUsers, value: '1,284', icon: Users, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-8">
      {/* Quick Automation Section */}
      <div className="bg-gradient-to-r from-[#00FF00]/10 to-blue-500/10 rounded-xl border border-[#00FF00]/20 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="w-5 h-5 text-[#00FF00]" />
          <div>
            <h3 className="text-lg font-bold">{t.quickAutomation}</h3>
            <p className="text-xs text-[#8E8E8E]">{t.quickAutomationDesc}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <input 
            type="text"
            value={quickPrompt}
            onChange={(e) => setQuickPrompt(e.target.value)}
            placeholder={t.describeWorkflow}
            className="flex-1 bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#00FF00] transition-all"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !quickAutomationLoading && quickPrompt.trim()) {
                onQuickAutomation(quickPrompt);
                setQuickPrompt('');
              }
            }}
          />
          <button 
            onClick={() => {
              onQuickAutomation(quickPrompt);
              setQuickPrompt('');
            }}
            disabled={quickAutomationLoading || !quickPrompt.trim()}
            className="px-6 py-2 bg-[#00FF00] text-[#141414] font-bold rounded-lg hover:bg-[#00DD00] transition-all disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            {quickAutomationLoading ? (
              <div className="w-4 h-4 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {t.buildAndRun}
          </button>
        </div>
        {quickAutomationLoading && (
          <p className="text-xs text-[#00FF00] mt-2 animate-pulse">{t.aiBuildingAndRunning}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-[#1A1A1A] p-6 rounded-xl border border-[#2A2A2A] hover:border-[#3A3A3A] transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-[#8E8E8E] font-medium">{stat.label}</p>
                <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
              </div>
              <div className={cn("p-2 rounded-lg bg-[#2A2A2A]", stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2A2A2A] p-6">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#00FF00]" />
            {t.recentActivity}
          </h3>
          <div className="space-y-4">
            {logs.slice(0, 5).map((log, i) => (
              <div key={log.id} className="flex items-center justify-between py-3 border-b border-[#2A2A2A] last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-[#2A2A2A] flex items-center justify-center">
                    <Bot className="w-4 h-4 text-[#8E8E8E]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Agent Call: {log.agentName || log.agentId?.slice(0, 8) || "Unknown"}</p>
                    <p className="text-xs text-[#8E8E8E]">{new Date(log.timestamp).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-[#00FF00]">+${log.cost.toFixed(2)}</p>
                  <p className="text-xs text-[#8E8E8E]">{log.tokensUsed} tokens</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#1A1A1A] rounded-xl border border-[#2A2A2A] p-6">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-500" />
            {t.topAgents}
          </h3>
          <div className="space-y-4">
            {agents.slice(0, 5).map((agent) => (
              <div key={agent.id} className="flex items-center justify-between py-3 border-b border-[#2A2A2A] last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                    {agent.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{agent.name}</p>
                    <p className="text-xs text-[#8E8E8E]">{agent.model}</p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium">${agent.pricePerCall}/call</p>
                    <div className="flex items-center gap-1 text-xs text-[#8E8E8E]">
                      <span className="w-2 h-2 rounded-full bg-[#00FF00]"></span>
                      Active
                    </div>
                  </div>
                  <button 
                    onClick={() => onCloneAgent(agent)}
                    disabled={cloningAgentId === agent.id}
                    className="p-2 text-[#8E8E8E] hover:text-[#00FF00] transition-all disabled:opacity-50"
                    title={t.cloneAgent}
                  >
                    {cloningAgentId === agent.id ? (
                      <div className="w-4 h-4 border border-[#00FF00] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-gradient-to-r from-[#00FF00]/10 to-blue-500/10 rounded-xl border border-[#00FF00]/20 p-8 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 text-center md:text-left">
            <h3 className="text-2xl font-bold text-[#E4E3E0]">{t.aiWorkflowAssistant}</h3>
            <p className="text-[#8E8E8E] max-w-md">{t.aiWorkflowDesc}</p>
          </div>
          <button 
            onClick={() => setActiveTab('ai-workflow')}
            className="px-8 py-4 bg-[#00FF00] text-[#141414] font-bold rounded-xl hover:bg-[#00DD00] transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(0,255,0,0.3)]"
          >
            <Bot className="w-5 h-5" />
            {t.generateWorkflow}
          </button>
        </div>
      </div>
    </div>
  );
};

const AIWorkflowAssistant = ({ agents, language, onSave, onBuildAndRun, userProfile, setActiveTab }: { 
  agents: Agent[], 
  language: Language, 
  onSave: (workflow: Partial<Workflow>) => Promise<Workflow | void>, 
  onBuildAndRun: (prompt: string) => Promise<void>,
  userProfile: UserProfile | null, 
  setActiveTab: (tab: string) => void 
}) => {
  const t = translations[language];
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<Partial<Workflow> | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const availableAgents = agents.map(a => ({ id: a.id, name: a.name }));
      const workflow = await generateWorkflowWithAI(prompt, availableAgents, userProfile?.geminiApiKey);
      setGeneratedWorkflow(workflow);
    } catch (error) {
      console.error("Error generating workflow:", error);
      alert(t.somethingWentWrong);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <button 
        onClick={() => setActiveTab('workflows')}
        className="flex items-center gap-2 text-[#8E8E8E] hover:text-[#E4E3E0] transition-all mb-4"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back to Workflows
      </button>

      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-[#00FF00]/10 flex items-center justify-center">
          <Bot className="w-6 h-6 text-[#00FF00]" />
        </div>
        <div>
          <h3 className="text-xl font-bold">{t.aiWorkflowAssistant}</h3>
          <p className="text-sm text-[#8E8E8E]">{t.aiWorkflowDesc}</p>
        </div>
      </div>

      {!generatedWorkflow ? (
        <div className="space-y-6">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t.describeWorkflow}
            className="w-full h-32 bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 text-[#E4E3E0] focus:outline-none focus:border-[#00FF00] transition-all resize-none"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="bg-[#1A1A1A] text-[#E4E3E0] border border-[#2A2A2A] font-bold py-4 rounded-xl hover:border-[#00FF00] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generating ? (
                <div className="w-5 h-5 border-2 border-[#E4E3E0] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Bot className="w-5 h-5" />
              )}
              {t.generateWorkflow}
            </button>
            <button
              onClick={() => onBuildAndRun(prompt)}
              disabled={generating || !prompt.trim()}
              className="bg-[#00FF00] text-[#141414] font-bold py-4 rounded-xl hover:bg-[#00DD00] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,255,0,0.2)]"
            >
              {generating ? (
                <div className="w-5 h-5 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-5 h-5" />
              )}
              {t.buildAndRun}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="p-6 bg-[#141414] border border-[#00FF00]/30 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-[#00FF00]">{t.aiGenerated}</h4>
              <button onClick={() => setGeneratedWorkflow(null)} className="text-xs text-[#8E8E8E] hover:text-[#E4E3E0]">Reset</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#8E8E8E] block mb-1">Name</label>
                <div className="text-lg font-bold">{generatedWorkflow.name}</div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#8E8E8E] block mb-1">Steps</label>
                <div className="space-y-2">
                  {generatedWorkflow.steps?.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm text-[#E4E3E0] bg-[#1A1A1A] p-3 rounded-lg border border-[#2A2A2A]">
                      <div className="w-6 h-6 rounded bg-[#2A2A2A] flex items-center justify-center text-[10px] font-bold">{i + 1}</div>
                      <span className="capitalize">{step.type.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={() => onSave(generatedWorkflow)}
            className="w-full bg-[#00FF00] text-[#141414] font-bold py-4 rounded-xl hover:bg-[#00DD00] transition-all"
          >
            {t.saveWorkflow}
          </button>
        </div>
      )}
      </div>
    </div>
  );
};

const WorkflowBuilder = ({ agents, language, onSave, user, setActiveTab }: { agents: Agent[], language: Language, onSave: (workflow: Partial<Workflow>) => Promise<Workflow | void>, user: User | null, setActiveTab: (tab: string) => void }) => {
  const t = translations[language];
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const addStep = (type: WorkflowStepType) => {
    const config: any = {};
    if (type === 'agent_call') config.agentId = agents[0]?.id || '';
    if (type === 'trigger_schedule') config.interval = 60;
    if (type === 'trigger_location') config.radius = 100;
    if (type === 'trigger_webhook') config.webhookId = Math.random().toString(36).substring(7);
    if (type === 'action_email') {
      config.to = user?.email || '';
      config.subject = 'AgentFlow Notification';
      config.body = 'A workflow step has been triggered.';
    }
    setSteps([...steps, { type, config }]);
  };

  const updateStepConfig = (index: number, config: any) => {
    const newSteps = [...steps];
    newSteps[index].config = { ...newSteps[index].config, ...config };
    setSteps(newSteps);
  };

  const handleSave = async () => {
    if (!name || steps.length === 0) return;
    setSaving(true);
    try {
      await onSave({ name, steps, status: 'active' });
      setName('');
      setSteps([]);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <button 
        onClick={() => setActiveTab('workflows')}
        className="flex items-center gap-2 text-[#8E8E8E] hover:text-[#E4E3E0] transition-all mb-4"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back to Workflows
      </button>

      <div className="bg-[#1A1A1A] rounded-xl border border-[#2A2A2A] p-8">
        <h2 className="text-2xl font-bold mb-8">{t.createWorkflow}</h2>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-[#8E8E8E] mb-2">{t.workflowName}</label>
            <input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all"
              placeholder="e.g. Daily Content Generation"
            />
          </div>

          <div className="space-y-4">
            <p className="text-sm font-medium text-[#8E8E8E]">{t.workflowSteps}</p>
            {steps.map((step, i) => (
              <div key={i} className="space-y-3 p-4 bg-[#141414] rounded-lg border border-[#2A2A2A] relative group">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#2A2A2A] flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold capitalize">{step.type.replace('_', ' ')}</p>
                  </div>
                  <button 
                    onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                    className="text-[#8E8E8E] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    Remove
                  </button>
                </div>

                {step.type === 'trigger_schedule' && (
                  <div className="pl-12 space-y-3">
                    <label className="block text-xs font-medium text-[#8E8E8E]">Interval (seconds)</label>
                    <input 
                      type="number"
                      value={isNaN(step.config.interval) ? '' : step.config.interval}
                      onChange={(e) => updateStepConfig(i, { interval: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF00]"
                    />
                  </div>
                )}

                {step.type === 'trigger_location' && (
                  <div className="pl-12 space-y-3">
                    <label className="block text-xs font-medium text-[#8E8E8E]">Radius (meters)</label>
                    <input 
                      type="number"
                      value={isNaN(step.config.radius) ? '' : step.config.radius}
                      onChange={(e) => updateStepConfig(i, { radius: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF00]"
                    />
                  </div>
                )}

                {step.type === 'agent_call' && (
                  <div className="pl-12 space-y-3">
                    <label className="block text-xs font-medium text-[#8E8E8E]">{t.agents}</label>
                    <select 
                      value={step.config.agentId}
                      onChange={(e) => updateStepConfig(i, { agentId: e.target.value })}
                      className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF00]"
                    >
                      {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {step.type === 'trigger_webhook' && (
                  <div className="pl-12 space-y-3">
                    <label className="block text-xs font-medium text-[#8E8E8E]">Webhook URL (Copy this to your website)</label>
                    <div className="flex items-center gap-2">
                      <input 
                        readOnly
                        value={`${window.location.origin}/api/workflow/trigger/${step.config.webhookId || 'SAVE_FIRST'}`}
                        className="flex-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-[#8E8E8E] focus:outline-none"
                      />
                      <button 
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/workflow/trigger/${step.config.webhookId || 'SAVE_FIRST'}`)}
                        className="p-2 bg-[#2A2A2A] rounded-lg hover:bg-[#3A3A3A] transition-all"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[10px] text-[#8E8E8E]">Trigger this URL whenever someone visits your site.</p>
                  </div>
                )}

                {step.type === 'action_email' && (
                  <div className="pl-12 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-[#8E8E8E]">To</label>
                        <input 
                          value={step.config.to}
                          onChange={(e) => updateStepConfig(i, { to: e.target.value })}
                          className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF00]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-[#8E8E8E]">Subject</label>
                        <input 
                          value={step.config.subject}
                          onChange={(e) => updateStepConfig(i, { subject: e.target.value })}
                          className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF00]"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-[#8E8E8E]">Body Template</label>
                      <textarea 
                        value={step.config.body}
                        onChange={(e) => updateStepConfig(i, { body: e.target.value })}
                        className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF00] h-20"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest text-center">Triggers</p>
                <div className="grid grid-cols-1 gap-2">
                  <button onClick={() => addStep('trigger_manual')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-[#00FF00] hover:text-[#00FF00] transition-all flex items-center gap-2">
                    <Plus className="w-3 h-3" /> {t.triggerManual}
                  </button>
                  <button onClick={() => addStep('trigger_schedule')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-[#00FF00] hover:text-[#00FF00] transition-all flex items-center gap-2">
                    <Activity className="w-3 h-3" /> {t.triggerSchedule}
                  </button>
                  <button onClick={() => addStep('trigger_location')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-[#00FF00] hover:text-[#00FF00] transition-all flex items-center gap-2">
                    <Settings className="w-3 h-3" /> {t.triggerLocation}
                  </button>
                  <button onClick={() => addStep('trigger_webhook')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-[#00FF00] hover:text-[#00FF00] transition-all flex items-center gap-2">
                    <Globe className="w-3 h-3" /> {t.triggerWebhook}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest text-center">AI Logic</p>
                <div className="grid grid-cols-1 gap-2">
                  <button onClick={() => addStep('agent_call')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-blue-500 hover:text-blue-500 transition-all flex items-center gap-2">
                    <Bot className="w-3 h-3" /> {t.callAgent}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest text-center">Device Actions</p>
                <div className="grid grid-cols-1 gap-2">
                  <button onClick={() => addStep('action_notify')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-purple-500 hover:text-purple-500 transition-all flex items-center gap-2">
                    <Zap className="w-3 h-3" /> {t.actionNotify}
                  </button>
                  <button onClick={() => addStep('action_email')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-purple-500 hover:text-purple-500 transition-all flex items-center gap-2">
                    <Mail className="w-3 h-3" /> {t.actionEmail}
                  </button>
                  <button onClick={() => addStep('action_clipboard')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-purple-500 hover:text-purple-500 transition-all flex items-center gap-2">
                    <ChevronRight className="w-3 h-3" /> {t.actionClipboard}
                  </button>
                  <button onClick={() => addStep('action_download')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-purple-500 hover:text-purple-500 transition-all flex items-center gap-2">
                    <Plus className="w-3 h-3" /> {t.actionDownload}
                  </button>
                  <button onClick={() => addStep('action_share')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-purple-500 hover:text-purple-500 transition-all flex items-center gap-2">
                    <Share2 className="w-3 h-3" /> {t.actionShare}
                  </button>
                  <button onClick={() => addStep('action_vibrate')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-purple-500 hover:text-purple-500 transition-all flex items-center gap-2">
                    <Smartphone className="w-3 h-3" /> {t.actionVibrate}
                  </button>
                  <button onClick={() => addStep('action_audio')} className="p-3 border border-dashed border-[#2A2A2A] rounded-lg text-[10px] font-bold hover:border-purple-500 hover:text-purple-500 transition-all flex items-center gap-2">
                    <Mic className="w-3 h-3" /> {t.actionAudio}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={handleSave}
            disabled={saving || !name || steps.length === 0}
            className="w-full bg-[#E4E3E0] text-[#141414] font-bold py-4 rounded-lg hover:bg-white transition-all mt-4 disabled:opacity-50"
          >
            {saving ? t.loading : t.saveWorkflow}
          </button>
        </div>
      </div>
    </div>
  );
};

const AgentTester = ({ agent, onTest, onClone, language }: { 
  agent: Agent, 
  onTest: (prompt: string) => Promise<string>, 
  onClone: (agent: Agent) => void,
  language: Language 
}) => {
  const t = translations[language];
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    try {
      const res = await onTest(prompt);
      setResponse(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleClone = async () => {
    setCloning(true);
    try {
      await onClone(agent);
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="bg-[#1A1A1A] rounded-xl border border-[#2A2A2A] p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Play className="w-4 h-4 text-[#00FF00]" />
          {t.testAgent}: {agent.name}
        </h3>
        <button
          onClick={handleClone}
          disabled={cloning}
          className="p-2 text-[#8E8E8E] hover:text-[#00FF00] transition-all flex items-center gap-1 text-xs font-bold uppercase tracking-widest"
          title={t.cloneAgent}
        >
          {cloning ? <div className="w-3 h-3 border border-[#00FF00] border-t-transparent rounded-full animate-spin" /> : <Copy className="w-4 h-4" />}
          <span className="hidden sm:inline">{t.cloneAgent}</span>
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto mb-4">
        {response && (
          <div className="p-4 bg-[#141414] rounded-lg border border-[#2A2A2A] text-sm leading-relaxed">
            <p className="text-[#8E8E8E] text-xs mb-2 uppercase tracking-widest">{t.agentResponse}</p>
            {response}
          </div>
        )}
      </div>
      <div className="space-y-4">
        <textarea 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all h-24 text-sm"
          placeholder={t.enterPrompt}
        />
        <button 
          onClick={handleTest}
          disabled={loading || !prompt}
          className="w-full bg-[#00FF00] text-[#141414] font-bold py-3 rounded-lg hover:bg-[#00DD00] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? <div className="w-5 h-5 border-2 border-[#141414] border-t-transparent rounded-full animate-spin"></div> : t.runTest}
        </button>
      </div>
    </div>
  );
};

const AgentBuilder = ({ onSave, language }: { onSave: (agent: Partial<Agent>) => void, language: Language }) => {
  const t = translations[language];
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemInstruction, setSystemInstruction] = useState('');
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [price, setPrice] = useState(0.01);
  const [apiKey, setApiKey] = useState('');
  const [tier, setTier] = useState<AgentTier>('basic');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [toolConfig, setToolConfig] = useState<Record<string, any>>({
    web_search: { maxResults: 5, safeSearch: true },
    image_gen: { aspectRatio: '1:1', imageSize: '1K' },
    code_exec: { language: 'python', timeout: 30 },
    device_access: { permissions: ['camera', 'microphone'] }
  });

  const toggleTool = (tool: string) => {
    setSelectedTools(prev => prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]);
  };

  const updateToolConfig = (toolId: string, key: string, value: any) => {
    setToolConfig(prev => ({
      ...prev,
      [toolId]: { ...prev[toolId], [key]: value }
    }));
  };

  const tools = [
    { id: 'web_search', label: t.toolWebSearch, icon: Activity },
    { id: 'image_gen', label: t.toolImageGen, icon: Zap },
    { id: 'code_exec', label: t.toolCodeExec, icon: Settings },
    { id: 'device_access', label: t.toolDeviceAccess, icon: Bot },
  ];

  const renderToolConfig = (toolId: string) => {
    const config = toolConfig[toolId];
    switch (toolId) {
      case 'web_search':
        return (
          <div className="space-y-3 mt-3 p-3 bg-[#141414] rounded-lg border border-[#2A2A2A]">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#8E8E8E]">Max Results</label>
              <input 
                type="number" 
                value={config.maxResults} 
                onChange={(e) => updateToolConfig(toolId, 'maxResults', parseInt(e.target.value))}
                className="w-16 bg-[#0A0A0A] border border-[#2A2A2A] rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#8E8E8E]">Safe Search</label>
              <input 
                type="checkbox" 
                checked={config.safeSearch} 
                onChange={(e) => updateToolConfig(toolId, 'safeSearch', e.target.checked)}
                className="accent-[#00FF00]"
              />
            </div>
          </div>
        );
      case 'image_gen':
        return (
          <div className="space-y-3 mt-3 p-3 bg-[#141414] rounded-lg border border-[#2A2A2A]">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#8E8E8E]">Aspect Ratio</label>
              <select 
                value={config.aspectRatio} 
                onChange={(e) => updateToolConfig(toolId, 'aspectRatio', e.target.value)}
                className="bg-[#0A0A0A] border border-[#2A2A2A] rounded px-2 py-1 text-xs"
              >
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#8E8E8E]">Quality</label>
              <select 
                value={config.imageSize} 
                onChange={(e) => updateToolConfig(toolId, 'imageSize', e.target.value)}
                className="bg-[#0A0A0A] border border-[#2A2A2A] rounded px-2 py-1 text-xs"
              >
                <option value="512px">512px</option>
                <option value="1K">1K</option>
                <option value="2K">2K</option>
              </select>
            </div>
          </div>
        );
      case 'code_exec':
        return (
          <div className="space-y-3 mt-3 p-3 bg-[#141414] rounded-lg border border-[#2A2A2A]">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#8E8E8E]">Language</label>
              <select 
                value={config.language} 
                onChange={(e) => updateToolConfig(toolId, 'language', e.target.value)}
                className="bg-[#0A0A0A] border border-[#2A2A2A] rounded px-2 py-1 text-xs"
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#8E8E8E]">Timeout (s)</label>
              <input 
                type="number" 
                value={config.timeout} 
                onChange={(e) => updateToolConfig(toolId, 'timeout', parseInt(e.target.value))}
                className="w-16 bg-[#0A0A0A] border border-[#2A2A2A] rounded px-2 py-1 text-xs"
              />
            </div>
          </div>
        );
      case 'device_access':
        return (
          <div className="space-y-3 mt-3 p-3 bg-[#141414] rounded-lg border border-[#2A2A2A]">
            <div className="space-y-2">
              <label className="text-xs text-[#8E8E8E] block">Permissions</label>
              {['camera', 'microphone', 'location'].map(perm => (
                <div key={perm} className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    checked={config.permissions.includes(perm)} 
                    onChange={(e) => {
                      const newPerms = e.target.checked 
                        ? [...config.permissions, perm] 
                        : config.permissions.filter((p: string) => p !== perm);
                      updateToolConfig(toolId, 'permissions', newPerms);
                    }}
                    className="accent-[#00FF00]"
                  />
                  <span className="text-xs text-[#E4E3E0] capitalize">{perm}</span>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-[#1A1A1A] rounded-xl border border-[#2A2A2A] p-8">
      <h2 className="text-2xl font-bold mb-8">{t.createAgent}</h2>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-[#8E8E8E] mb-2">{t.agentName}</label>
          <input 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all"
            placeholder="e.g. Content Strategist"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#8E8E8E] mb-2">{t.description}</label>
          <textarea 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all h-24"
            placeholder="What does this agent do?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#8E8E8E] mb-2">{t.systemInstruction}</label>
          <textarea 
            value={systemInstruction}
            onChange={(e) => setSystemInstruction(e.target.value)}
            className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all h-40 font-mono text-sm"
            placeholder="You are a professional content strategist..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#8E8E8E] mb-2">{t.tools}</label>
          <div className="grid grid-cols-2 gap-4">
            {tools.map(tool => (
              <div key={tool.id}>
                <button
                  onClick={() => toggleTool(tool.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-sm",
                    selectedTools.includes(tool.id) 
                      ? "bg-[#00FF00]/10 border-[#00FF00] text-[#00FF00]" 
                      : "bg-[#141414] border-[#2A2A2A] text-[#8E8E8E] hover:border-[#3A3A3A]"
                  )}
                >
                  <tool.icon className="w-4 h-4" />
                  {tool.label}
                </button>
                {selectedTools.includes(tool.id) && renderToolConfig(tool.id)}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#8E8E8E] mb-2">{t.tier}</label>
          <div className="grid grid-cols-3 gap-4">
            {(['basic', 'pro', 'enterprise'] as AgentTier[]).map((tId) => (
              <button
                key={tId}
                onClick={() => {
                  setTier(tId);
                  if (tId === 'basic') setPrice(0.01);
                  if (tId === 'pro') setPrice(0.05);
                  if (tId === 'enterprise') setPrice(0.25);
                }}
                className={cn(
                  "p-3 rounded-lg border transition-all text-sm font-bold uppercase tracking-widest",
                  tier === tId 
                    ? "bg-[#00FF00]/10 border-[#00FF00] text-[#00FF00]" 
                    : "bg-[#141414] border-[#2A2A2A] text-[#8E8E8E] hover:border-[#3A3A3A]"
                )}
              >
                {t[tId as keyof typeof t] || tId}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#8E8E8E] mt-2">{t.tierDescription}</p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-[#8E8E8E] mb-2">{t.model}</label>
            <select 
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all"
            >
              <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
              <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#8E8E8E] mb-2">{t.pricePerCall}</label>
            <input 
              type="number"
              step="0.001"
              value={isNaN(price) ? '' : price}
              onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#8E8E8E] mb-2">{t.geminiApiKey}</label>
          <input 
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all"
            placeholder="Optional: Provide your own API key"
          />
        </div>

        <button 
          onClick={() => {
            const finalToolConfig = selectedTools.reduce((acc, toolId) => {
              acc[toolId] = toolConfig[toolId];
              return acc;
            }, {} as Record<string, any>);
            onSave({ name, description, systemInstruction, model, pricePerCall: price, tools: selectedTools, toolConfig: finalToolConfig, apiKey, tier });
          }}
          className="w-full bg-[#E4E3E0] text-[#141414] font-bold py-4 rounded-lg hover:bg-white transition-all mt-4"
        >
          {t.deployAgent}
        </button>
      </div>
    </div>
  );
};

const Monitoring = ({ logs, workflowRuns, language }: { logs: UsageLog[], workflowRuns: WorkflowRun[], language: Language }) => {
  const t = translations[language];
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const toggleRun = (id: string) => {
    setExpandedRuns(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleStep = (runId: string, stepIdx: number) => {
    const key = `${runId}-${stepIdx}`;
    setExpandedSteps(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleManualCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Manual copy failed:", err);
    }
  };

  // Process data for charts
  const sortedLogs = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Trend data (last 24 hours or last 7 days)
  const trendData = sortedLogs.reduce((acc: any[], log) => {
    const date = new Date(log.timestamp).toLocaleDateString();
    const existing = acc.find(d => d.date === date);
    if (existing) {
      existing.calls += 1;
      existing.cost += log.cost;
    } else {
      acc.push({ date, calls: 1, cost: log.cost });
    }
    return acc;
  }, []);

  // Agent performance metrics
  const agentMetrics = sortedLogs.reduce((acc: any[], log) => {
    const name = log.agentName || "Unknown";
    const existing = acc.find(d => d.name === name);
    if (existing) {
      existing.calls += 1;
      existing.tokens += log.tokensUsed;
      if (log.status === 'error') existing.errors += 1;
    } else {
      acc.push({ name, calls: 1, tokens: log.tokensUsed, errors: log.status === 'error' ? 1 : 0 });
    }
    return acc;
  }, []);

  const totalCalls = logs.length;
  const totalErrors = logs.filter(l => l.status === 'error').length;
  const successRate = totalCalls > 0 ? ((totalCalls - totalErrors) / totalCalls * 100).toFixed(1) : "100";
  const avgTokens = totalCalls > 0 ? Math.round(logs.reduce((acc, l) => acc + l.tokensUsed, 0) / totalCalls) : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tighter">{t.realtimeMonitoring}</h2>
          <p className="text-[#8E8E8E] text-sm mt-1">Advanced analytics and performance tracking</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-[#00FF00]/10 border border-[#00FF00]/20 rounded-full">
          <span className="w-2 h-2 bg-[#00FF00] rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-[#00FF00] uppercase tracking-widest">Live Feed</span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#141414] border border-[#2A2A2A] p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-sm font-medium text-[#8E8E8E]">{t.successRate}</p>
          </div>
          <p className="text-3xl font-bold">{successRate}%</p>
        </div>
        <div className="bg-[#141414] border border-[#2A2A2A] p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-sm font-medium text-[#8E8E8E]">{t.errorRate}</p>
          </div>
          <p className="text-3xl font-bold">{(totalCalls > 0 ? (totalErrors / totalCalls * 100).toFixed(1) : "0.0")}%</p>
        </div>
        <div className="bg-[#141414] border border-[#2A2A2A] p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Zap className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-sm font-medium text-[#8E8E8E]">{t.avgTokens}</p>
          </div>
          <p className="text-3xl font-bold">{avgTokens.toLocaleString()}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#141414] border border-[#2A2A2A] p-6 rounded-2xl">
          <h3 className="text-sm font-bold text-[#8E8E8E] uppercase tracking-widest mb-6">{t.usageTrend}</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00FF00" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00FF00" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#8E8E8E" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#8E8E8E" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }}
                  itemStyle={{ color: '#00FF00' }}
                />
                <Area type="monotone" dataKey="calls" stroke="#00FF00" fillOpacity={1} fill="url(#colorCalls)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#141414] border border-[#2A2A2A] p-6 rounded-2xl">
          <h3 className="text-sm font-bold text-[#8E8E8E] uppercase tracking-widest mb-6">{t.agentMetrics}</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentMetrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#8E8E8E" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#8E8E8E" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }}
                  itemStyle={{ color: '#00FF00' }}
                />
                <Bar dataKey="calls" fill="#00FF00" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[#2A2A2A] bg-[#1A1A1A] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#8E8E8E] uppercase tracking-widest">{t.recentActivity}</h3>
        </div>
        <div className="grid grid-cols-6 p-4 border-b border-[#2A2A2A] bg-[#1A1A1A]">
          <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest">{t.date}</p>
          <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest">Agent/Workflow</p>
          <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest">Tokens</p>
          <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest">{t.status}</p>
          <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest">{t.amount}</p>
          <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest text-right">Actions</p>
        </div>
        <div className="divide-y divide-[#2A2A2A] max-h-[400px] overflow-y-auto">
          {logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((log) => (
            <div key={log.id} className="grid grid-cols-6 p-4 hover:bg-[#1A1A1A] transition-all group items-center">
              <p className="text-xs text-[#8E8E8E] font-mono">{new Date(log.timestamp).toLocaleTimeString()}</p>
              <p className="text-xs font-medium text-[#E4E3E0] truncate pr-4">{log.agentName || log.workflowId || "System"}</p>
              <p className="text-xs text-[#8E8E8E] font-mono">{log.tokensUsed}</p>
              <div>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                  log.status === 'error' ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"
                )}>
                  {log.status || 'success'}
                </span>
              </div>
              <p className="text-xs font-mono text-[#00FF00]">
                -${log.cost.toFixed(4)}
              </p>
              <div className="flex justify-end">
                <button 
                  onClick={() => handleManualCopy(log.agentName || "Log Data", log.id)}
                  className="p-2 hover:bg-[#2A2A2A] rounded-lg transition-colors text-[#8E8E8E] hover:text-[#00FF00]"
                  title="Copy to clipboard"
                >
                  {copiedId === log.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="p-12 text-center">
              <Activity className="w-12 h-12 text-[#2A2A2A] mx-auto mb-4" />
              <p className="text-[#8E8E8E]">{t.noData}</p>
            </div>
          )}
        </div>
      </div>

      {/* Workflow Runs Section */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl overflow-hidden mt-8">
        <div className="p-4 border-b border-[#2A2A2A] bg-[#1A1A1A] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#8E8E8E] uppercase tracking-widest">{t.workflowRuns}</h3>
        </div>
        <div className="divide-y divide-[#2A2A2A]">
          {workflowRuns.map((run) => {
            const isRunExpanded = expandedRuns[run.id];
            return (
              <div key={run.id} className="border-b border-[#2A2A2A] last:border-0">
                <div 
                  className="p-4 hover:bg-[#1A1A1A] transition-all cursor-pointer flex items-center justify-between"
                  onClick={() => toggleRun(run.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      run.status === 'success' ? "bg-green-500" : run.status === 'error' ? "bg-red-500" : "bg-blue-500 animate-pulse"
                    )} />
                    <div>
                      <p className="text-sm font-bold text-[#E4E3E0]">{run.workflowName}</p>
                      <p className="text-[10px] text-[#8E8E8E] font-mono">
                        {new Date(run.startTime).toLocaleString()} - {run.endTime ? new Date(run.endTime).toLocaleTimeString() : 'Running...'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      run.status === 'success' ? "bg-green-500/10 text-green-500" : run.status === 'error' ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"
                    )}>
                      {run.status}
                    </span>
                    {isRunExpanded ? <ChevronDown className="w-4 h-4 text-[#8E8E8E]" /> : <ChevronRight className="w-4 h-4 text-[#8E8E8E]" />}
                  </div>
                </div>

                {isRunExpanded && (
                  <div className="p-4 pt-0 space-y-2 ml-6">
                    {run.steps.map((step, idx) => {
                      const stepKey = `${run.id}-${idx}`;
                      const isStepExpanded = expandedSteps[stepKey];
                      return (
                        <div key={idx} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg overflow-hidden">
                          <div 
                            className="p-3 flex items-center justify-between cursor-pointer hover:bg-[#2A2A2A] transition-colors"
                            onClick={() => toggleStep(run.id, idx)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest">{step.type}</span>
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                step.status === 'success' ? "bg-green-500" : step.status === 'error' ? "bg-red-500" : "bg-blue-500"
                              )} />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[#8E8E8E] font-mono">
                                {step.startTime ? new Date(step.startTime).toLocaleTimeString() : ''}
                              </span>
                              {isStepExpanded ? <ChevronDown className="w-3 h-3 text-[#8E8E8E]" /> : <ChevronRight className="w-3 h-3 text-[#8E8E8E]" />}
                            </div>
                          </div>
                          
                          {isStepExpanded && (
                            <div className="p-3 pt-0 border-t border-[#2A2A2A] bg-[#0A0A0A]">
                              {step.output && (
                                <div className="mt-2 p-2 bg-[#141414] rounded border border-[#2A2A2A]">
                                  <p className="text-[10px] font-bold text-[#8E8E8E] uppercase mb-1">{t.output}</p>
                                  <p className="text-xs text-[#E4E3E0] font-mono whitespace-pre-wrap">{step.output}</p>
                                </div>
                              )}
                              {step.error && (
                                <div className="mt-2 p-2 bg-red-500/5 rounded border border-red-500/20">
                                  <p className="text-[10px] font-bold text-red-500 uppercase mb-1">{t.error}</p>
                                  <p className="text-xs text-red-400 font-mono">{step.error}</p>
                                </div>
                              )}
                              {!step.output && !step.error && (
                                <p className="text-[10px] text-[#8E8E8E] italic mt-2">No output or error recorded for this step.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {workflowRuns.length === 0 && (
            <div className="p-12 text-center">
              <Activity className="w-12 h-12 text-[#2A2A2A] mx-auto mb-4" />
              <p className="text-[#8E8E8E]">{t.noData}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Execution Modal ---

const ExecutionModal = ({ 
  run, 
  onClose, 
  language 
}: { 
  run: WorkflowRun; 
  onClose: () => void; 
  language: string 
}) => {
  const t = translations[language as keyof typeof translations];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="p-6 border-b border-[#2A2A2A] flex items-center justify-between bg-[#1A1A1A]">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              run.status === 'success' ? "bg-green-500/10" : 
              run.status === 'error' ? "bg-red-500/10" : "bg-blue-500/10"
            )}>
              {run.status === 'running' ? (
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              ) : run.status === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold">{t.executionProgress}</h3>
              <p className="text-xs text-[#8E8E8E]">{run.workflowName}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-[#2A2A2A] rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {run.steps.map((step, idx) => (
            <div key={idx} className="relative pl-8 border-l border-[#2A2A2A] last:border-0 pb-6 last:pb-0">
              <div className={cn(
                "absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-[#1A1A1A]",
                (step.status as string) === 'success' ? "bg-green-500" :
                (step.status as string) === 'error' ? "bg-red-500" :
                (step.status as string) === 'running' ? "bg-blue-500 animate-pulse" : "bg-[#2A2A2A]"
              )} />
              
              <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm capitalize">{step.type.replace('_', ' ')}</h4>
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                    (step.status as string) === 'success' ? "bg-green-500/10 text-green-500" :
                    (step.status as string) === 'error' ? "bg-red-500/10 text-red-500" :
                    (step.status as string) === 'running' ? "bg-blue-500/10 text-blue-500" : "bg-[#2A2A2A] text-[#8E8E8E]"
                  )}>
                    {step.status}
                  </span>
                </div>
                
                {step.output && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold text-[#8E8E8E] uppercase mb-1">{t.renderedOutput}</p>
                    <div className="bg-[#0A0A0A] rounded-lg p-3 text-xs font-mono whitespace-pre-wrap break-words border border-[#2A2A2A]">
                      {step.output}
                    </div>
                  </div>
                )}

                {step.error && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold text-red-500 uppercase mb-1">{t.error}</p>
                    <p className="text-xs text-red-400 font-mono bg-red-500/5 p-3 rounded-lg border border-red-500/10">
                      {step.error}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {run.status !== 'running' && (
          <div className="p-6 border-t border-[#2A2A2A] bg-[#1A1A1A]">
            <button 
              onClick={onClose}
              className="w-full bg-[#2A2A2A] text-white font-bold py-3 rounded-xl hover:bg-[#3A3A3A] transition-all"
            >
              {t.close}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<Language>('en');
  const [quickAutomationLoading, setQuickAutomationLoading] = useState(false);
  const [activeWorkflowRun, setActiveWorkflowRun] = useState<WorkflowRun | null>(null);

  const t = translations[language];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        // Ensure user doc exists
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const newUser: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            displayName: u.displayName || '',
            photoURL: u.photoURL || '',
            role: 'user',
            balance: 10.0, // Initial free balance
            createdAt: new Date().toISOString()
          };
          await setDoc(userRef, newUser);
          setUserProfile(newUser);
        } else {
          setUserProfile({ id: userSnap.id, ...userSnap.data() } as unknown as UserProfile);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const agentsQuery = query(collection(db, 'agents'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribeAgents = onSnapshot(agentsQuery, (snapshot) => {
      setAgents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agent)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'agents');
    });

    const logsQuery = query(collection(db, 'usage_logs'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UsageLog)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'usage_logs');
    });

    const workflowsQuery = query(collection(db, 'workflows'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribeWorkflows = onSnapshot(workflowsQuery, (snapshot) => {
      setWorkflows(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workflow)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workflows');
    });

    const userRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        setUserProfile({ id: snapshot.id, ...snapshot.data() } as unknown as UserProfile);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    const workflowRunsQuery = query(collection(db, 'workflowRuns'), where('userId', '==', user.uid), orderBy('startTime', 'desc'), limit(50));
    const unsubscribeWorkflowRuns = onSnapshot(workflowRunsQuery, (snapshot) => {
      setWorkflowRuns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkflowRun)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workflowRuns');
    });

    const billingQuery = query(collection(db, 'billing_history'), where('userId', '==', user.uid), orderBy('date', 'desc'), limit(50));
    const unsubscribeBilling = onSnapshot(billingQuery, (snapshot) => {
      setBillingHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BillingRecord)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'billing_history');
    });

    return () => {
      unsubscribeAgents();
      unsubscribeLogs();
      unsubscribeWorkflows();
      unsubscribeUser();
      unsubscribeWorkflowRuns();
      unsubscribeBilling();
    };
  }, [user]);

  // Workflow Trigger Logic
  useEffect(() => {
    if (!user || workflows.length === 0) return;

    const intervals: number[] = [];
    const watchers: number[] = [];

    workflows.forEach(workflow => {
      if (workflow.status !== 'active') return;

      workflow.steps.forEach(step => {
        if (step.type === 'trigger_schedule') {
          const interval = setInterval(() => {
            executeWorkflow(workflow);
          }, (step.config.interval || 60) * 1000);
          intervals.push(interval as unknown as number);
        }

        if (step.type === 'trigger_location' && "geolocation" in navigator) {
          const watcher = navigator.geolocation.watchPosition((pos) => {
            // Simple logic: if within radius of target (placeholder target)
            console.log("Location updated", pos.coords);
            // executeWorkflow(workflow); // Throttled or logic-based
          });
          watchers.push(watcher);
        }
      });
    });

    return () => {
      intervals.forEach(clearInterval);
      watchers.forEach(navigator.geolocation.clearWatch);
    };
  }, [workflows, user]);

  const toggleWorkflowStatus = async (workflow: Workflow) => {
    try {
      await setDoc(doc(db, 'workflows', workflow.id), {
        ...workflow,
        status: workflow.status === 'active' ? 'paused' : 'active'
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSignIn = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  const handleSaveAgent = async (agentData: Partial<Agent>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'agents'), {
        ...agentData,
        ownerId: user.uid,
        isPublic: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tools: agentData.tools || [],
        tier: agentData.tier || 'basic'
      });
      setActiveTab('agents');
    } catch (error) {
      console.error("Error saving agent:", error);
    }
  };

  const [cloningAgentId, setCloningAgentId] = useState<string | null>(null);

  const handleCloneAgent = async (agent: Agent) => {
    if (!user) return;
    setCloningAgentId(agent.id);
    try {
      const { id, ...agentData } = agent;
      await addDoc(collection(db, 'agents'), {
        ...agentData,
        name: `Copy of ${agent.name}`,
        ownerId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error cloning agent:", error);
    } finally {
      setCloningAgentId(null);
    }
  };

  const handleSaveWorkflow = async (workflowData: Partial<Workflow>) => {
    if (!user) return;
    try {
      const fullData = {
        ...workflowData,
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'workflows'), fullData);
      setActiveTab('dashboard');
      return { id: docRef.id, ...fullData } as Workflow;
    } catch (error) {
      console.error("Error saving workflow:", error);
      throw error;
    }
  };

  const handleQuickAutomation = async (prompt: string) => {
    if (!user) return;
    setQuickAutomationLoading(true);
    try {
      const availableAgents = agents.map(a => ({ id: a.id, name: a.name }));
      const workflowData = await generateWorkflowWithAI(prompt, availableAgents, userProfile?.geminiApiKey);
      
      // Save it
      const savedWorkflow = await handleSaveWorkflow({ ...workflowData, status: 'active' });
      
      // Execute it
      if (savedWorkflow) {
        await executeWorkflow(savedWorkflow);
      }
    } catch (error) {
      console.error("Error in quick automation:", error);
      alert(t.somethingWentWrong);
    } finally {
      setQuickAutomationLoading(false);
    }
  };

  const [cloningWorkflowId, setCloningWorkflowId] = useState<string | null>(null);

  const handleCloneWorkflow = async (workflow: Workflow) => {
    if (!user) return;
    setCloningWorkflowId(workflow.id);
    try {
      const { id, ...workflowData } = workflow;
      await addDoc(collection(db, 'workflows'), {
        ...workflowData,
        name: `Copy of ${workflow.name}`,
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error cloning workflow:", error);
    } finally {
      setCloningWorkflowId(null);
    }
  };

  const exportWorkflow = (workflow: Workflow) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(workflow, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${workflow.name.replace(/\s+/g, '_')}_definition.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleTopUp = async (amount: number) => {
    if (!user) return;
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          amount,
        }),
      });
      const session = await response.json();
      const publishableKey = (import.meta as any).env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) {
        alert("Stripe Publishable Key is missing. Please set VITE_STRIPE_PUBLISHABLE_KEY in settings.");
        return;
      }
      const stripe = await loadStripe(publishableKey);
      if (stripe) {
        await (stripe as any).redirectToCheckout({
          sessionId: session.id,
        });
      }
    } catch (error) {
      console.error("Stripe error:", error);
    }
  };

  const handleWithdraw = async () => {
    if (!user || !userProfile || !userProfile.earnings || userProfile.earnings < 50) {
      alert("Minimum withdrawal amount is $50.00");
      return;
    }
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        earnings: 0,
        balance: userProfile.balance + userProfile.earnings
      });
      alert("Withdrawal successful! Earnings have been added to your balance.");
    } catch (error) {
      console.error("Withdrawal failed:", error);
    }
  };

  const handleManageSubscription = async () => {
    if (!user || !userProfile) return;
    
    if (userProfile.subscription?.plan === 'pro') {
      alert("You are already on the Pro plan. Redirecting to customer portal...");
      return;
    }

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          amount: 49,
          isSubscription: true
        }),
      });
      const session = await response.json();
      const publishableKey = (import.meta as any).env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) {
        alert("Stripe Publishable Key is missing. Please set VITE_STRIPE_PUBLISHABLE_KEY in settings.");
        return;
      }
      const stripe = await loadStripe(publishableKey);
      if (stripe) {
        await (stripe as any).redirectToCheckout({
          sessionId: session.id,
        });
      }
    } catch (error) {
      console.error("Subscription error:", error);
    }
  };

  const handleSaveSettings = async (globalApiKey: string, gmailUser?: string, gmailPass?: string, notifyOnSuccess?: boolean, notifyOnError?: boolean) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        geminiApiKey: globalApiKey,
        gmailUser: gmailUser || '',
        gmailPass: gmailPass || '',
        notifyOnSuccess: !!notifyOnSuccess,
        notifyOnError: !!notifyOnError
      });
      alert(t.saveSettings + " Success!");
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const executeWorkflow = async (workflow: Workflow) => {
    if (!user) return;
    console.log(`Executing workflow: ${workflow.name}`);
    
    const initialSteps = workflow.steps.map(s => ({
      type: s.type,
      status: 'pending' as 'pending' | 'running' | 'success' | 'error',
      startTime: new Date().toISOString()
    }));

    const runData: any = {
      workflowId: workflow.id,
      workflowName: workflow.name,
      userId: user.uid,
      status: 'running',
      steps: initialSteps,
      startTime: new Date().toISOString(),
      totalCost: 0
    };

    const runRef = await addDoc(collection(db, 'workflowRuns'), runData);
    setActiveWorkflowRun({ id: runRef.id, ...runData });
    
    let lastOutput = "";
    const updatedSteps = [...initialSteps].map(s => ({
      ...s,
      endTime: '',
      output: '',
      error: ''
    }));

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        updatedSteps[i].status = 'running' as any;
        
        const currentRunState = { id: runRef.id, ...runData, steps: updatedSteps };
        setActiveWorkflowRun(currentRunState as any);
        await updateDoc(runRef, { steps: updatedSteps });

        try {
          switch (step.type) {
            case 'agent_call':
              let agent = agents.find(a => a.id === step.config.agentId);
              if (!agent && agents.length > 0) {
                // Fallback to first available agent if specific one not found
                agent = agents[0];
              }
              
              if (agent) {
                lastOutput = await callAgent(agent.id, lastOutput || "Start workflow execution");
                updatedSteps[i].output = lastOutput;
              } else {
                throw new Error("No agents available to handle this step.");
              }
              break;
            case 'trigger_webhook':
              lastOutput = "Webhook trigger manually executed";
              updatedSteps[i].output = lastOutput;
              break;
            case 'action_notify':
              try {
                if ("Notification" in window) {
                  if (Notification.permission === "granted") {
                    new Notification("AgentFlow", { body: lastOutput || "Workflow step completed" });
                    updatedSteps[i].output = "Notification sent";
                  } else if (Notification.permission !== "denied" && document.hasFocus()) {
                    const permission = await Notification.requestPermission();
                    if (permission === "granted") {
                      new Notification("AgentFlow", { body: lastOutput || "Workflow step completed" });
                      updatedSteps[i].output = "Notification sent";
                    } else {
                      updatedSteps[i].output = "Notification permission denied";
                    }
                  } else {
                    updatedSteps[i].output = "Notification permission denied or document not focused";
                  }
                } else {
                  updatedSteps[i].output = "Notifications not supported";
                }
              } catch (notifyError: any) {
                console.warn("Notification failed:", notifyError);
                updatedSteps[i].output = "Failed to notify: " + (notifyError.message || "Unknown error");
              }
              break;
            case 'action_email':
              const res = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: step.config.to,
                  subject: step.config.subject,
                  body: step.config.body.replace('{{output}}', lastOutput),
                  userId: user?.uid
                })
              });
              if (!res.ok) throw new Error('Failed to send email');
              lastOutput = `Email sent to ${step.config.to}`;
              updatedSteps[i].output = lastOutput;
              break;
            case 'action_clipboard':
              try {
                if (navigator.clipboard && navigator.clipboard.writeText && document.hasFocus()) {
                  await navigator.clipboard.writeText(lastOutput);
                  updatedSteps[i].output = "Copied to clipboard";
                } else {
                  if (document.hasFocus()) {
                    const textArea = document.createElement("textarea");
                    textArea.value = lastOutput;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    updatedSteps[i].output = "Copied to clipboard (fallback)";
                  } else {
                    updatedSteps[i].output = "Skipped: Document not focused (clipboard access requires focus)";
                  }
                }
              } catch (clipError: any) {
                console.warn("Clipboard access failed:", clipError);
                updatedSteps[i].output = "Failed to copy: " + (clipError.message || "Unknown error");
              }
              break;
            case 'action_download':
              const blob = new Blob([lastOutput], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `workflow-output-${Date.now()}.txt`;
              a.click();
              URL.revokeObjectURL(url);
              updatedSteps[i].output = "File downloaded";
              break;
            case 'action_share':
              try {
                if (navigator.share && document.hasFocus()) {
                  await navigator.share({ title: 'AgentFlow Output', text: lastOutput });
                  updatedSteps[i].output = "Shared successfully";
                } else {
                  updatedSteps[i].output = "Skipped: Share API not available or document not focused";
                }
              } catch (shareError: any) {
                console.warn("Share failed:", shareError);
                updatedSteps[i].output = "Failed to share: " + (shareError.message || "Unknown error");
              }
              break;
            case 'action_vibrate':
              if ("vibrate" in navigator) {
                navigator.vibrate([200, 100, 200]);
                updatedSteps[i].output = "Device vibrated";
              }
              break;
            default:
              updatedSteps[i].output = "Step executed";
          }
          updatedSteps[i].status = 'success';
        } catch (stepError: any) {
          updatedSteps[i].status = 'error';
          updatedSteps[i].error = stepError.message;
          const finalRunState = { ...runData, id: runRef.id, steps: updatedSteps, status: 'error' as const, endTime: new Date().toISOString() };
          setActiveWorkflowRun(finalRunState);
          await updateDoc(runRef, { steps: updatedSteps, status: 'error', endTime: new Date().toISOString() });
          throw stepError;
        }
        updatedSteps[i].endTime = new Date().toISOString();
        await updateDoc(runRef, { steps: updatedSteps });
        setActiveWorkflowRun({ ...runData, id: runRef.id, steps: updatedSteps } as any);
      }
      const finalRunState = { ...runData, id: runRef.id, status: 'success' as const, endTime: new Date().toISOString(), steps: updatedSteps };
      setActiveWorkflowRun(finalRunState);
      await updateDoc(runRef, { status: 'success', endTime: new Date().toISOString() });

      if (userProfile?.notifyOnSuccess && userProfile?.gmailUser) {
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: userProfile.gmailUser,
            subject: `Workflow Success: ${workflow.name}`,
            body: `Your workflow "${workflow.name}" has completed successfully.\n\nFinal Output: ${lastOutput}`,
            userId: user.uid
          })
        }).catch(e => console.error("Failed to send success notification email:", e));
      }
    } catch (error) {
      console.error("Workflow execution failed:", error);
      if (userProfile?.notifyOnError && userProfile?.gmailUser) {
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: userProfile.gmailUser,
            subject: `Workflow Error: ${workflow.name}`,
            body: `Your workflow "${workflow.name}" encountered an error during execution.\n\nError details: ${error instanceof Error ? error.message : String(error)}`,
            userId: user.uid
          })
        }).catch(e => console.error("Failed to send error notification email:", e));
      }
    }
  };

  const handleTestAgent = async (prompt: string) => {
    if (!selectedAgent || !user || !userProfile) return "";
    
    // Check balance
    if (userProfile.balance < selectedAgent.pricePerCall) {
      alert(t.insufficientBalance);
      return "";
    }

    try {
      const response = await generateAgentResponse(
        selectedAgent.model,
        selectedAgent.systemInstruction,
        prompt,
        selectedAgent.tools,
        selectedAgent.toolConfig,
        selectedAgent.apiKey,
        userProfile.geminiApiKey
      );

      // Deduct balance
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        balance: userProfile.balance - selectedAgent.pricePerCall
      });

      // Log usage
      await addDoc(collection(db, 'usage_logs'), {
        userId: user.uid,
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        tokensUsed: Math.floor(prompt.length / 4) + Math.floor(response.length / 4),
        cost: selectedAgent.pricePerCall,
        status: 'success',
        timestamp: new Date().toISOString()
      });

      return response;
    } catch (error) {
      console.error("Test failed:", error);
      // Log error
      await addDoc(collection(db, 'usage_logs'), {
        userId: user.uid,
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        tokensUsed: 0,
        cost: 0,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  };

  const callAgent = async (agentId: string, prompt: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent || !user || !userProfile) return "";

    if (userProfile.balance < agent.pricePerCall) {
      console.error("Insufficient balance for agent call");
      return "Error: Insufficient balance";
    }

    try {
      const response = await generateAgentResponse(
        agent.model,
        agent.systemInstruction,
        prompt,
        agent.tools,
        agent.toolConfig,
        agent.apiKey,
        userProfile.geminiApiKey
      );

      // Deduct balance from caller and credit owner
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.uid);
        const ownerRef = doc(db, 'users', agent.ownerId);
        
        const userSnap = await transaction.get(userRef);
        const ownerSnap = await transaction.get(ownerRef);
        
        if (!userSnap.exists()) throw new Error("User not found");
        
        const currentBalance = userSnap.data().balance || 0;
        if (currentBalance < agent.pricePerCall) throw new Error("Insufficient balance");
        
        transaction.update(userRef, { balance: currentBalance - agent.pricePerCall });
        
        if (ownerSnap.exists()) {
          const currentEarnings = ownerSnap.data().earnings || 0;
          const currentOwnerBalance = ownerSnap.data().balance || 0;
          transaction.update(ownerRef, { 
            earnings: currentEarnings + agent.pricePerCall,
            balance: currentOwnerBalance + agent.pricePerCall 
          });
        }
      });

      // Log usage
      await addDoc(collection(db, 'usage_logs'), {
        userId: user.uid,
        agentId: agent.id,
        agentName: agent.name,
        tokensUsed: Math.floor(prompt.length / 4) + Math.floor(response.length / 4),
        cost: agent.pricePerCall,
        status: 'success',
        timestamp: new Date().toISOString()
      });

      return response;
    } catch (error) {
      console.error("Agent call failed:", error);
      // Log error
      await addDoc(collection(db, 'usage_logs'), {
        userId: user.uid,
        agentId: agent.id,
        agentName: agent.name,
        tokensUsed: 0,
        cost: 0,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      return "Error: Agent call failed";
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#141414] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#00FF00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen bg-[#141414] text-[#E4E3E0] flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="flex justify-center gap-4 mb-4">
            <button onClick={() => setLanguage('en')} className={cn("text-xs px-2 py-1 rounded", language === 'en' ? "bg-white text-black" : "text-gray-500")}>EN</button>
            <button onClick={() => setLanguage('ja')} className={cn("text-xs px-2 py-1 rounded", language === 'ja' ? "bg-white text-black" : "text-gray-500")}>JA</button>
          </div>
          <div className="inline-block p-4 bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] mb-4">
            <Zap className="w-12 h-12 text-[#00FF00]" />
          </div>
          <h1 className="text-5xl font-bold tracking-tighter italic serif">{t.heroTitle}</h1>
          <p className="text-[#8E8E8E] text-lg">
            {t.heroSubtitle}
          </p>
          <button 
            onClick={handleSignIn}
            className="w-full bg-[#E4E3E0] text-[#141414] font-bold py-4 rounded-xl hover:bg-white transition-all flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="" />
            {t.continueWithGoogle}
          </button>
          <div className="pt-8 border-t border-[#2A2A2A] flex justify-center gap-8 text-xs text-[#8E8E8E] uppercase tracking-widest">
            <span>{t.enterpriseGrade}</span>
            <span>{t.realtimeAnalytics}</span>
            <span>{t.globalScale}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex bg-[#0A0A0A] text-[#E4E3E0] min-h-screen font-sans">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} user={user} userProfile={userProfile} language={language} setLanguage={setLanguage} />
        
        <main className="flex-1 h-screen overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            <header className="flex items-center justify-between mb-12">
              <div>
                <h2 className="text-3xl font-bold tracking-tight capitalize">{t[activeTab as keyof typeof t] || activeTab.replace('-', ' ')}</h2>
                <p className="text-[#8E8E8E] mt-1">Manage your AI automation infrastructure.</p>
              </div>
              <button 
                onClick={() => setActiveTab('create-agent')}
                className="bg-[#00FF00] text-[#141414] font-bold px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-[#00DD00] transition-all"
              >
                <Plus className="w-5 h-5" />
                {t.newAgent}
              </button>
            </header>

            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Dashboard 
                    agents={agents} 
                    logs={logs} 
                    language={language} 
                    onCloneAgent={handleCloneAgent}
                    cloningAgentId={cloningAgentId}
                    setActiveTab={setActiveTab}
                    onQuickAutomation={handleQuickAutomation}
                    quickAutomationLoading={quickAutomationLoading}
                  />
                </motion.div>
              )}

              {activeTab === 'agents' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <motion.div
                    key="agents-list"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6"
                  >
                    {agents.map((agent) => (
                      <div 
                        key={agent.id} 
                        onClick={() => setSelectedAgent(agent)}
                        className={cn(
                          "bg-[#1A1A1A] border rounded-xl p-6 hover:border-[#3A3A3A] transition-all group cursor-pointer",
                          selectedAgent?.id === agent.id ? "border-[#00FF00]" : "border-[#2A2A2A]"
                        )}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 rounded-lg bg-[#2A2A2A] flex items-center justify-center group-hover:bg-[#3A3A3A] transition-all">
                            <Bot className="w-6 h-6 text-blue-500" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-[#5A5A5A] bg-[#1A1A1A] px-2 py-0.5 rounded border border-[#2A2A2A]" title="Agent ID for API">
                              ID: {agent.id}
                            </span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCloneAgent(agent);
                              }}
                              disabled={cloningAgentId === agent.id}
                              className="p-2 text-[#8E8E8E] hover:text-[#00FF00] transition-all disabled:opacity-50"
                              title={t.cloneAgent}
                            >
                              {cloningAgentId === agent.id ? (
                                <div className="w-4 h-4 border border-[#00FF00] border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <button className="p-2 text-[#8E8E8E] hover:text-[#E4E3E0]"><Settings className="w-4 h-4" /></button>
                            <button className="p-2 text-[#8E8E8E] hover:text-[#00FF00]"><Play className="w-4 h-4" /></button>
                          </div>
                        </div>
                        <h3 className="text-lg font-bold mb-2">{agent.name}</h3>
                        <p className="text-sm text-[#8E8E8E] line-clamp-2 mb-6">{agent.description}</p>
                        <div className="flex items-center justify-between pt-4 border-t border-[#2A2A2A]">
                          <div className="flex flex-col">
                            <span className="text-xs font-mono text-[#8E8E8E] uppercase">{agent.model}</span>
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-tighter",
                              agent.tier === 'enterprise' ? "text-purple-500" : agent.tier === 'pro' ? "text-blue-500" : "text-[#8E8E8E]"
                            )}>
                              {t[agent.tier as keyof typeof t] || agent.tier}
                            </span>
                          </div>
                          <span className="text-sm font-bold text-[#00FF00]">${agent.pricePerCall}/call</span>
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => setActiveTab('create-agent')}
                      className="border-2 border-dashed border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center justify-center gap-4 text-[#8E8E8E] hover:border-[#3A3A3A] hover:text-[#E4E3E0] transition-all"
                    >
                      <Plus className="w-8 h-8" />
                      <span className="font-medium">{t.createAgent}</span>
                    </button>
                  </motion.div>
                  
                  <div className="lg:col-span-1">
                    {selectedAgent ? (
                      <AgentTester agent={selectedAgent} onTest={handleTestAgent} onClone={handleCloneAgent} language={language} />
                    ) : (
                      <div className="bg-[#1A1A1A] rounded-xl border border-[#2A2A2A] p-8 text-center flex flex-col items-center justify-center h-full text-[#8E8E8E]">
                        <Bot className="w-12 h-12 mb-4 opacity-20" />
                        <p>{t.selectAgentToTest}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'workflows' && (
                <div className="space-y-8">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-bold">{t.workflows}</h2>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setActiveTab('ai-workflow')}
                        className="flex items-center gap-2 px-4 py-2 bg-[#00FF00]/10 text-[#00FF00] border border-[#00FF00]/30 rounded-lg hover:bg-[#00FF00]/20 transition-all"
                      >
                        <Bot className="w-4 h-4" />
                        {t.aiWorkflowAssistant}
                      </button>
                      <button 
                        onClick={() => setActiveTab('create-workflow')}
                        className="flex items-center gap-2 px-4 py-2 bg-[#00FF00] text-[#141414] font-bold rounded-lg hover:bg-[#00DD00] transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        {t.newWorkflow}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {workflows.map((wf) => (
                      <div key={wf.id} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-6 hover:border-[#3A3A3A] transition-all group">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-10 h-10 rounded-lg bg-[#2A2A2A] flex items-center justify-center">
                            <Zap className={cn("w-5 h-5", wf.status === 'active' ? "text-[#00FF00]" : "text-[#8E8E8E]")} />
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => executeWorkflow(wf)}
                              className="p-2 text-[#8E8E8E] hover:text-[#00FF00] transition-all"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleCloneWorkflow(wf)}
                              disabled={cloningWorkflowId === wf.id}
                              className="p-2 text-[#8E8E8E] hover:text-[#00FF00] transition-all disabled:opacity-50"
                              title="Clone Workflow"
                            >
                              {cloningWorkflowId === wf.id ? (
                                <div className="w-4 h-4 border border-[#00FF00] border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <button 
                              onClick={() => exportWorkflow(wf)}
                              className="p-2 text-[#8E8E8E] hover:text-[#00FF00] transition-all"
                              title={t.exportWorkflow}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => toggleWorkflowStatus(wf)}
                              className={cn("p-2 transition-all", wf.status === 'active' ? "text-[#00FF00]" : "text-[#8E8E8E]")}
                            >
                              <Activity className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <h3 className="font-bold mb-1">{wf.name}</h3>
                        <p className="text-xs text-[#8E8E8E] mb-4">{wf.steps.length} steps • {wf.status}</p>
                        <div className="flex flex-wrap gap-2">
                          {wf.steps.slice(0, 3).map((step, i) => (
                            <span key={i} className="px-2 py-1 bg-[#141414] border border-[#2A2A2A] rounded text-[10px] uppercase tracking-widest text-[#8E8E8E]">
                              {step.type.split('_')[1] || step.type}
                            </span>
                          ))}
                          {wf.steps.length > 3 && <span className="text-[10px] text-[#8E8E8E]">+{wf.steps.length - 3} more</span>}
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => setActiveTab('create-workflow')}
                      className="border-2 border-dashed border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center justify-center gap-4 text-[#8E8E8E] hover:border-[#3A3A3A] hover:text-[#E4E3E0] transition-all"
                    >
                      <Plus className="w-8 h-8" />
                      <span className="font-medium">Create New Workflow</span>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'ai-workflow' && (
                <motion.div
                  key="ai-workflow"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <AIWorkflowAssistant 
                    agents={agents} 
                    language={language} 
                    onSave={handleSaveWorkflow} 
                    onBuildAndRun={handleQuickAutomation}
                    userProfile={userProfile} 
                    setActiveTab={setActiveTab} 
                  />
                </motion.div>
              )}

              {activeTab === 'create-workflow' && (
                <motion.div
                  key="create-workflow"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <WorkflowBuilder agents={agents} language={language} onSave={handleSaveWorkflow} user={user} setActiveTab={setActiveTab} />
                </motion.div>
              )}

              {activeTab === 'create-agent' && (
                <motion.div
                  key="create-agent"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <AgentBuilder onSave={handleSaveAgent} language={language} />
                </motion.div>
              )}

              {activeTab === 'monitoring' && (
                <motion.div
                  key="monitoring"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Monitoring logs={logs} workflowRuns={workflowRuns} language={language} />
                </motion.div>
              )}

              {activeTab === 'billing' && (
                <motion.div
                  key="billing"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="max-w-4xl mx-auto"
                >
                  <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-8 mb-8">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-xl font-bold">{t.currentPlan}: {userProfile?.subscription?.plan?.toUpperCase() || 'FREE'}</h3>
                        {userProfile?.subscription?.plan === 'pro' && (
                          <p className="text-[#8E8E8E]">{t.nextBilling} {new Date(userProfile.subscription.currentPeriodEnd).toLocaleDateString()}</p>
                        )}
                      </div>
                      <button 
                        onClick={handleManageSubscription}
                        className="bg-[#E4E3E0] text-[#141414] font-bold px-6 py-2 rounded-lg hover:bg-white transition-colors"
                      >
                        {userProfile?.subscription?.plan === 'pro' ? t.manageSubscription : t.proPlan}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-8 mb-8">
                      <div className="p-4 bg-[#141414] rounded-lg border border-[#2A2A2A]">
                        <p className="text-xs text-[#8E8E8E] uppercase tracking-widest mb-1">{t.balance}</p>
                        <p className="text-2xl font-bold font-mono text-[#00FF00]">${userProfile?.balance.toFixed(2)}</p>
                      </div>
                      <div className="p-4 bg-[#141414] rounded-lg border border-[#2A2A2A]">
                        <p className="text-xs text-[#8E8E8E] uppercase tracking-widest mb-1">{t.monthlyCost}</p>
                        <p className="text-2xl font-bold font-mono">${userProfile?.subscription?.plan === 'pro' ? '49.00' : '0.00'}</p>
                      </div>
                      <div className="p-4 bg-[#141414] rounded-lg border border-[#2A2A2A] relative group">
                        <p className="text-xs text-[#8E8E8E] uppercase tracking-widest mb-1">{t.agentEarnings}</p>
                        <div className="flex items-center justify-between">
                          <p className="text-2xl font-bold font-mono text-blue-500">${(userProfile?.earnings || 0).toFixed(2)}</p>
                          {(userProfile?.earnings || 0) >= 50 && (
                            <button 
                              onClick={handleWithdraw}
                              className="text-[10px] bg-blue-500/10 text-blue-500 px-2 py-1 rounded border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-all"
                            >
                              {t.withdraw}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-[#8E8E8E] uppercase tracking-widest mb-4">{t.topUpCredits}</h4>
                      <div className="grid grid-cols-4 gap-4">
                        {[10, 25, 50, 100].map((amount) => (
                          <button
                            key={amount}
                            onClick={() => handleTopUp(amount)}
                            className="p-4 bg-[#141414] border border-[#2A2A2A] rounded-lg hover:border-[#00FF00] hover:bg-[#00FF00]/5 transition-all group"
                          >
                            <p className="text-xl font-bold group-hover:text-[#00FF00]">${amount}</p>
                            <p className="text-[10px] text-[#8E8E8E] uppercase mt-1">Credits</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
                    <div className="p-6 border-b border-[#2A2A2A]">
                      <h3 className="font-bold">{t.billingHistory}</h3>
                    </div>
                    <table className="w-full text-left">
                      <thead className="bg-[#141414] text-xs text-[#8E8E8E] uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-4 font-medium">{t.invoice}</th>
                          <th className="px-6 py-4 font-medium">{t.date}</th>
                          <th className="px-6 py-4 font-medium">{t.amount}</th>
                          <th className="px-6 py-4 font-medium">{t.status}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2A2A2A]">
                        {billingHistory.length > 0 ? (
                          billingHistory.map((record) => (
                            <tr key={record.id} className="hover:bg-[#141414] transition-all">
                              <td className="px-6 py-4 text-sm font-mono truncate max-w-[150px]">{record.invoiceId}</td>
                              <td className="px-6 py-4 text-sm">{new Date(record.date).toLocaleDateString()}</td>
                              <td className="px-6 py-4 text-sm">${record.amount.toFixed(2)}</td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "px-2 py-1 text-xs rounded-full",
                                  record.status === 'paid' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                )}>
                                  {record.status === 'paid' ? t.paid : record.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-6 py-8 text-center text-[#8E8E8E] text-sm">
                              No billing history found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
              {activeTab === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="max-w-2xl mx-auto"
                >
                  <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-8">
                    <h3 className="text-xl font-bold mb-6">{t.settings}</h3>
                    
                    <div className="space-y-6">
                      <div className="pb-6 border-b border-[#2A2A2A]">
                        <label className="block text-sm font-bold text-[#E4E3E0] mb-2">Your User ID (Required for API calls)</label>
                        <input 
                          readOnly
                          value={user?.uid || ''}
                          className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 text-sm text-[#8E8E8E] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#8E8E8E] mb-2">{t.globalApiKey}</label>
                        <input 
                          type="password"
                          id="gemini-api-key"
                          defaultValue={userProfile?.geminiApiKey || ''}
                          className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all"
                          placeholder="Enter your Gemini API Key"
                        />
                        <p className="text-xs text-[#8E8E8E] mt-2">{t.globalApiKeyDesc}</p>
                      </div>

                      <div className="pt-6 border-t border-[#2A2A2A]">
                        <h4 className="text-sm font-bold mb-4">{t.gmailSettings}</h4>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-[#8E8E8E] mb-2">{t.gmailUser}</label>
                            <input 
                              type="email"
                              id="gmail-user"
                              defaultValue={userProfile?.gmailUser || ''}
                              className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all"
                              placeholder="yourname@gmail.com"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[#8E8E8E] mb-2">{t.gmailPass}</label>
                            <input 
                              type="password"
                              id="gmail-pass"
                              defaultValue={userProfile?.gmailPass || ''}
                              className="w-full bg-[#141414] border border-[#2A2A2A] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00FF00] transition-all"
                              placeholder="Enter your Gmail App Password"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-[#8E8E8E] mt-4">{t.gmailSettingsDesc}</p>
                      </div>

                      <div className="pt-6 border-t border-[#2A2A2A]">
                        <h4 className="text-sm font-bold mb-4">{t.notificationSettings}</h4>
                        <p className="text-xs text-[#8E8E8E] mb-4">{t.notificationSettingsDesc}</p>
                        <div className="space-y-4">
                          <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                              <input 
                                type="checkbox"
                                id="notify-success"
                                defaultChecked={userProfile?.notifyOnSuccess}
                                className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-[#2A2A2A] bg-[#141414] checked:bg-[#00FF00] checked:border-[#00FF00] transition-all"
                              />
                              <Check className="absolute h-3.5 w-3.5 text-[#141414] left-0.5 opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                            </div>
                            <span className="text-sm text-[#E4E3E0] group-hover:text-white transition-colors">{t.notifyOnSuccess}</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                              <input 
                                type="checkbox"
                                id="notify-error"
                                defaultChecked={userProfile?.notifyOnError}
                                className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-[#2A2A2A] bg-[#141414] checked:bg-[#00FF00] checked:border-[#00FF00] transition-all"
                              />
                              <Check className="absolute h-3.5 w-3.5 text-[#141414] left-0.5 opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                            </div>
                            <span className="text-sm text-[#E4E3E0] group-hover:text-white transition-colors">{t.notifyOnError}</span>
                          </label>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-[#2A2A2A]">
                        <button 
                          onClick={() => {
                            const apiKey = (document.getElementById('gemini-api-key') as HTMLInputElement).value;
                            const gUser = (document.getElementById('gmail-user') as HTMLInputElement).value;
                            const gPass = (document.getElementById('gmail-pass') as HTMLInputElement).value;
                            const nSuccess = (document.getElementById('notify-success') as HTMLInputElement).checked;
                            const nError = (document.getElementById('notify-error') as HTMLInputElement).checked;
                            handleSaveSettings(apiKey, gUser, gPass, nSuccess, nError);
                          }}
                          className="w-full bg-[#00FF00] text-[#141414] font-bold py-3 rounded-lg hover:bg-[#00DD00] transition-all"
                        >
                          {t.saveSettings}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {activeWorkflowRun && (
          <ExecutionModal 
            run={activeWorkflowRun} 
            onClose={() => setActiveWorkflowRun(null)} 
            language={language}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
