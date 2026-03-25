export type UserRole = 'user' | 'admin';
export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: UserRole;
  balance: number;
  earnings?: number;
  geminiApiKey?: string;
  gmailUser?: string;
  gmailPass?: string;
  notifyOnSuccess?: boolean;
  notifyOnError?: boolean;
  subscription?: {
    plan: SubscriptionPlan;
    status: 'active' | 'canceled' | 'past_due';
    currentPeriodEnd: string;
  };
  createdAt: string;
}

export type AgentTier = 'basic' | 'pro' | 'enterprise';

export interface Agent {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  systemInstruction: string;
  model: string;
  tools: string[];
  toolConfig?: Record<string, any>;
  isPublic: boolean;
  pricePerCall: number;
  tier: AgentTier;
  apiKey?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowStepType = 
  | 'trigger_manual' 
  | 'trigger_schedule' 
  | 'trigger_location' 
  | 'trigger_webhook'
  | 'agent_call' 
  | 'action_notify' 
  | 'action_email'
  | 'action_clipboard' 
  | 'action_download' 
  | 'action_camera'
  | 'action_share'
  | 'action_vibrate'
  | 'action_audio';

export interface WorkflowStep {
  type: WorkflowStepType;
  config: any;
}

export interface Workflow {
  id: string;
  ownerId: string;
  name: string;
  steps: WorkflowStep[];
  status: 'active' | 'paused';
  createdAt: string;
}

export interface UsageLog {
  id: string;
  userId: string;
  agentId?: string;
  agentName?: string;
  workflowId?: string;
  tokensUsed: number;
  cost: number;
  status: 'success' | 'error';
  error?: string;
  timestamp: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  userId: string;
  status: 'success' | 'error' | 'running';
  steps: {
    type: WorkflowStepType;
    status: 'success' | 'error' | 'pending' | 'running';
    output?: string;
    error?: string;
    startTime: string;
    endTime?: string;
  }[];
  startTime: string;
  endTime?: string;
  totalCost: number;
}

export interface BillingRecord {
  id: string;
  userId: string;
  amount: number;
  type: 'subscription' | 'topup';
  status: 'paid' | 'pending' | 'failed';
  date: string;
  invoiceId: string;
}
