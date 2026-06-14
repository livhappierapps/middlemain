import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface Skill {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  promptPrefix: string;
  icon: string;
  isDefault: boolean;
  model?: string;
  supportsVision?: boolean;
}

const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'chat',
    name: 'Chat',
    description: 'Open conversation with your AI',
    systemPrompt: 'You are a helpful AI development assistant. Be concise and practical.',
    promptPrefix: '',
    icon: 'message-circle',
    isDefault: true,
  },
  {
    id: 'debug',
    name: 'Debug',
    description: 'Find and fix bugs in code',
    systemPrompt: 'You are an expert debugger. Identify the root cause of bugs clearly and provide a concise fix with explanation. Format code blocks with triple backticks.',
    promptPrefix: 'Debug this code and explain the issue and fix:\n\n',
    icon: 'alert-triangle',
    isDefault: true,
  },
  {
    id: 'analyze',
    name: 'Analyze',
    description: 'Review code quality and patterns',
    systemPrompt: 'You are a senior code reviewer. Analyze code for bugs, performance issues, security vulnerabilities, and improvement opportunities. Be specific and actionable.',
    promptPrefix: 'Analyze this code for issues, improvements, and best practices:\n\n',
    icon: 'search',
    isDefault: true,
  },
  {
    id: 'explain',
    name: 'Explain',
    description: 'Explain code clearly step by step',
    systemPrompt: 'You are a patient teacher. Explain code clearly and concisely, step by step, in plain language. Use analogies where helpful.',
    promptPrefix: 'Explain this code clearly and concisely:\n\n',
    icon: 'book-open',
    isDefault: true,
  },
  {
    id: 'refactor',
    name: 'Refactor',
    description: 'Improve code structure and quality',
    systemPrompt: 'You are a refactoring expert. Improve code quality, readability, and performance while maintaining functionality. Show the refactored code and explain key changes.',
    promptPrefix: 'Refactor and improve this code:\n\n',
    icon: 'refresh-cw',
    isDefault: true,
  },
  {
    id: 'tests',
    name: 'Tests',
    description: 'Write tests for code',
    systemPrompt: 'You are a testing expert. Write comprehensive, practical tests that cover edge cases. Use appropriate testing frameworks and follow best practices.',
    promptPrefix: 'Write comprehensive tests for this code:\n\n',
    icon: 'check-square',
    isDefault: true,
  },
  {
    id: 'vision_ui',
    name: 'UI Review',
    description: 'Analyze a screenshot of your UI',
    systemPrompt: 'You are a UI/UX expert and mobile developer. Analyze screenshots and provide specific, actionable feedback on design, usability, accessibility, and implementation improvements.',
    promptPrefix: 'Review this UI screenshot and provide specific feedback:\n\n',
    icon: 'eye',
    isDefault: true,
    supportsVision: true,
  },
  {
    id: 'vision_debug',
    name: 'Visual Debug',
    description: 'Debug from a screenshot of an error',
    systemPrompt: 'You are an expert debugger specializing in visual error analysis. Identify errors from screenshots and provide clear fixes. Look for error messages, stack traces, and visual anomalies.',
    promptPrefix: 'Debug the issue shown in this screenshot:\n\n',
    icon: 'camera',
    isDefault: true,
    supportsVision: true,
  },
];

interface SkillsContextValue {
  skills: Skill[];
  addSkill: (skill: Omit<Skill, 'id' | 'isDefault'>) => void;
  updateSkill: (id: string, updates: Partial<Skill>) => void;
  deleteSkill: (id: string) => void;
  getSkill: (id: string) => Skill | undefined;
}

const STORAGE_KEY = '@middlemain_skills';

const SkillsContext = createContext<SkillsContextValue>({
  skills: DEFAULT_SKILLS,
  addSkill: () => {},
  updateSkill: () => {},
  deleteSkill: () => {},
  getSkill: () => undefined,
});

function genId() {
  return 'skill_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function SkillsProvider({ children }: { children: React.ReactNode }) {
  const [customSkills, setCustomSkills] = useState<Skill[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) {
        try { setCustomSkills(JSON.parse(data)); } catch {}
      }
    });
  }, []);

  const persist = useCallback((skills: Skill[]) => {
    setCustomSkills(skills);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
  }, []);

  const allSkills = [...DEFAULT_SKILLS, ...customSkills];

  const addSkill = useCallback(
    (skill: Omit<Skill, 'id' | 'isDefault'>) => {
      persist([...customSkills, { ...skill, id: genId(), isDefault: false }]);
    },
    [customSkills, persist],
  );

  const updateSkill = useCallback(
    (id: string, updates: Partial<Skill>) => {
      persist(customSkills.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    },
    [customSkills, persist],
  );

  const deleteSkill = useCallback(
    (id: string) => {
      persist(customSkills.filter((s) => s.id !== id));
    },
    [customSkills, persist],
  );

  const getSkill = useCallback(
    (id: string) => allSkills.find((s) => s.id === id),
    [allSkills],
  );

  return (
    <SkillsContext.Provider value={{ skills: allSkills, addSkill, updateSkill, deleteSkill, getSkill }}>
      {children}
    </SkillsContext.Provider>
  );
}

export function useSkills(): SkillsContextValue {
  return useContext(SkillsContext);
}
