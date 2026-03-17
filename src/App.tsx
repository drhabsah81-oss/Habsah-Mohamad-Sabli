import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  FilePlus2, 
  Library, 
  BookOpen, 
  HelpCircle, 
  Plus, 
  Download, 
  Star, 
  Search, 
  Filter, 
  ChevronRight, 
  Loader2, 
  LogOut, 
  LogIn,
  FileText,
  Presentation,
  CheckCircle2,
  Clock,
  Users,
  Target,
  Sparkles,
  ArrowRight,
  Printer,
  Share2,
  Trash2,
  Upload,
  Archive,
  Undo2,
  Redo2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  orderBy,
  limit
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signIn, logout } from './firebase';
import { Module, ModuleContent, UserStats } from './types';
import { ChatAssistant } from './components/ChatAssistant';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { exportToMarkdown, exportToText, exportToJSON, exportToPDF, exportToZip, exportInstructorNotes } from './utils';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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

const MODULE_TEMPLATES = [
  {
    name: "Intro to Programming",
    course: "Computer Science",
    topic: "Introduction to Python",
    level: "Diploma",
    duration: "2 Hours",
    mode: "Face to face",
    skillFocus: ["Knowledge", "Practical Skills"],
    teachingStyle: "Interactive"
  },
  {
    name: "Business Strategy",
    course: "Business Management",
    topic: "SWOT Analysis",
    level: "Degree",
    duration: "3 Hours",
    mode: "Hybrid",
    skillFocus: ["Knowledge", "Creativity"],
    teachingStyle: "Problem-based"
  },
  {
    name: "Digital Marketing",
    course: "Marketing",
    topic: "Social Media Campaigns",
    level: "Degree",
    duration: "Full Day",
    mode: "Online",
    skillFocus: ["Practical Skills", "Innovation"],
    teachingStyle: "Project-based"
  },
  {
    name: "Graphic Design",
    course: "Creative Arts",
    topic: "Typography Basics",
    level: "Certificate",
    duration: "2 Hours",
    mode: "Face to face",
    skillFocus: ["Creativity", "Practical Skills"],
    teachingStyle: "Interactive"
  }
];

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error) {
          errorMessage = `Firestore Error: ${parsed.error} (${parsed.operationType} at ${parsed.path})`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <HelpCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Application Error</h2>
            <p className="text-slate-600 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-deep-blue text-white py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [modules, setModules] = useState<Module[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [history, setHistory] = useState<ModuleContent[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isHistoryAction = React.useRef(false);

  // Form State
  const [formData, setFormData] = useState({
    course: '',
    topic: '',
    level: 'Diploma',
    duration: '2 Hours',
    mode: 'Face to face',
    outcomes: '',
    skillFocus: [] as string[],
    teachingStyle: 'Interactive',
    language: 'English',
    assessmentType: 'Quiz',
    specialRequirements: [] as string[],
    pdfText: ''
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setModules([]);
      return;
    }

    const q = query(
      collection(db, 'modules'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mods = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Module[];
      setModules(mods);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'modules');
    });

    return unsubscribe;
  }, [user]);

  const stats: UserStats = useMemo(() => {
    return {
      totalModules: modules.length,
      recentModules: modules.slice(0, 5),
      favouriteCount: modules.filter(m => m.isFavourite).length,
      downloadCount: modules.length * 2 // Mock stat
    };
  }, [modules]);

  const filteredModules = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return modules.filter(m => {
      const matchesSearch = 
        m.course.toLowerCase().includes(query) || 
        m.topic.toLowerCase().includes(query) ||
        m.content.title.toLowerCase().includes(query) ||
        m.content.synopsis.toLowerCase().includes(query) ||
        m.content.introduction.toLowerCase().includes(query) ||
        m.content.mainContent.toLowerCase().includes(query) ||
        m.content.summativeAssessment.toLowerCase().includes(query) ||
        m.content.learningObjectives.some(obj => obj.toLowerCase().includes(query)) ||
        m.content.teachingActivities.some(act => act.toLowerCase().includes(query)) ||
        m.content.studentActivities.some(act => act.toLowerCase().includes(query)) ||
        m.content.criticalThinking.some(q => q.toLowerCase().includes(query)) ||
        m.content.materials.some(mat => mat.toLowerCase().includes(query)) ||
        m.content.exercises.some(ex => ex.toLowerCase().includes(query)) ||
        m.content.instructorNotes?.deliveryGuidance.some(g => g.toLowerCase().includes(query)) ||
        m.content.instructorNotes?.classroomManagement.some(m => m.toLowerCase().includes(query)) ||
        m.content.instructorNotes?.potentialQuestions.some(q => q.question.toLowerCase().includes(query) || q.answer.toLowerCase().includes(query)) ||
        m.content.quiz.some(q => q.question.toLowerCase().includes(query) || q.answer.toLowerCase().includes(query));
      
      const matchesFilter = filterSubject === '' || m.course === filterSubject;
      return matchesSearch && matchesFilter;
    });
  }, [modules, searchQuery, filterSubject]);

  const subjects = useMemo(() => {
    return Array.from(new Set(modules.map(m => m.course)));
  }, [modules]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsGenerating(true);
    try {
      const promptText = `Generate a comprehensive teaching module (Modul PdP) for a TVET/Polytechnic institution based on the following parameters:
      Course: ${formData.course}
      Topic: ${formData.topic}
      Student Level: ${formData.level}
      Duration: ${formData.duration}
      Mode: ${formData.mode}
      Learning Outcomes: ${formData.outcomes}
      Skill Focus: ${formData.skillFocus.join(', ')}
      Teaching Style: ${formData.teachingStyle}
      Language: ${formData.language}
      Assessment Type: ${formData.assessmentType}
      Special Requirements: ${formData.specialRequirements.join(', ')}
      
      REFERENCE CONTENT (PRIORITIZE THIS):
      ${formData.pdfText}

      The output must be a structured JSON object following this schema:
      {
        "title": "Module Title",
        "synopsis": "Brief overview",
        "learningObjectives": ["Objective 1", "Objective 2"],
        "duration": "Time breakdown",
        "introduction": "Topic introduction text",
        "mainContent": "Detailed explanation with subheadings",
        "teachingActivities": ["Step 1", "Step 2"],
        "studentActivities": ["Activity 1", "Activity 2"],
        "criticalThinking": ["Question 1", "Question 2"],
        "materials": ["Material 1", "Material 2"],
        "exercises": ["Exercise 1", "Exercise 2"],
        "quiz": [{"question": "Q1", "answer": "A1"}],
        "summativeAssessment": "Description of final assessment",
        "rubric": "Marking criteria table in markdown",
        "lecturerReflection": "Reflection prompts for lecturer",
        "studentReflection": "Reflection prompts for student",
        "instructorNotes": {
          "deliveryGuidance": ["Guidance on how to deliver this topic effectively"],
          "potentialQuestions": [{"question": "Common student question", "answer": "Suggested answer"}],
          "classroomManagement": ["Tips for managing the class during activities"]
        },
        "aiSuggestions": {
          "interactive": ["Idea 1"],
          "gamification": ["Idea 1"],
          "caseStudies": ["Idea 1"],
          "industryExamples": ["Idea 1"]
        }
      }
      
      Ensure the content is professional, academic, and tailored for TVET education. Use ${formData.language}.`;

      const result = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: promptText,
        config: {
          responseMimeType: "application/json",
        }
      });

      const content = JSON.parse(result.text || '{}') as ModuleContent;

      const newModule = {
        userId: user.uid,
        ...formData,
        content,
        createdAt: serverTimestamp(),
        isFavourite: false
      };

      const docRef = await addDoc(collection(db, 'modules'), newModule);
      setSelectedModule({ id: docRef.id, ...newModule } as any);
      setActiveTab('view');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Firestore Error')) {
        throw error; // Re-throw if it's already handled by handleFirestoreError
      }
      handleFirestoreError(error, OperationType.CREATE, 'modules');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedModule) return;

    setIsGenerating(true);
    try {
      const updatedModule = {
        ...formData,
        // We keep the existing content unless we want to allow manual content editing too
        // For now, let's allow editing the parameters and re-generating if they want, 
        // OR just updating the parameters.
        // Actually, the user probably wants to edit the TEXT of the module.
        content: selectedModule.content, // Keep existing content for now
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'modules', selectedModule.id), updatedModule);
      setSelectedModule({ ...selectedModule, ...updatedModule } as any);
      setIsEditing(false);
      setActiveTab('view');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `modules/${selectedModule.id}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleManualContentUpdate = async (newContent: ModuleContent) => {
    if (!user || !selectedModule) return;
    try {
      await updateDoc(doc(db, 'modules', selectedModule.id), {
        content: newContent,
        updatedAt: serverTimestamp(),
      });
      setSelectedModule({ ...selectedModule, content: newContent } as any);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `modules/${selectedModule.id}`);
    }
  };

  const startManualEdit = (mod: Module) => {
    setSelectedModule(mod);
    setHistory([JSON.parse(JSON.stringify(mod.content))]);
    setHistoryIndex(0);
    setActiveTab('edit-content');
  };

  const handleUndo = () => {
    if (historyIndex > 0 && selectedModule) {
      isHistoryAction.current = true;
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setSelectedModule({
        ...selectedModule,
        content: JSON.parse(JSON.stringify(history[newIndex]))
      });
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1 && selectedModule) {
      isHistoryAction.current = true;
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setSelectedModule({
        ...selectedModule,
        content: JSON.parse(JSON.stringify(history[newIndex]))
      });
    }
  };

  useEffect(() => {
    if (activeTab === 'edit-content' && selectedModule) {
      if (isHistoryAction.current) {
        isHistoryAction.current = false;
        return;
      }

      const timer = setTimeout(() => {
        const currentContent = JSON.stringify(selectedModule.content);
        const lastHistoryContent = JSON.stringify(history[historyIndex]);
        
        if (currentContent !== lastHistoryContent) {
          setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(JSON.parse(currentContent));
            if (newHistory.length > 50) newHistory.shift();
            return newHistory;
          });
          setHistoryIndex(prev => Math.min(prev + 1, 49));
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [selectedModule?.content, activeTab, history, historyIndex]);

  const startEditing = (mod: Module) => {
    setFormData({
      course: mod.course,
      topic: mod.topic,
      level: mod.level,
      duration: mod.duration,
      mode: mod.mode,
      outcomes: mod.outcomes,
      skillFocus: mod.skillFocus,
      teachingStyle: mod.teachingStyle,
      language: mod.language,
      assessmentType: mod.assessmentType,
      specialRequirements: mod.specialRequirements,
      pdfText: mod.pdfText || ''
    });
    setIsEditing(true);
    setActiveTab('generator');
  };

  const toggleFavourite = async (mod: Module) => {
    try {
      await updateDoc(doc(db, 'modules', mod.id), {
        isFavourite: !mod.isFavourite
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `modules/${mod.id}`);
    }
  };

  const deleteModule = async (id: string) => {
    if (confirm("Are you sure you want to delete this module?")) {
      try {
        await deleteDoc(doc(db, 'modules', id));
        if (selectedModule?.id === id) setSelectedModule(null);
        setActiveTab('library');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `modules/${id}`);
      }
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.name.endsWith('.json')) {
      alert("Please select a valid .json module file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result as string;
        if (result.startsWith('%PDF')) {
          throw new Error("This is a PDF file. Please import a .json module file instead.");
        }
        
        const json = JSON.parse(result);
        if (!json.content || !json.course || !json.topic) {
          throw new Error("Invalid module format");
        }

        const newModule = {
          userId: user.uid,
          course: json.course,
          topic: json.topic,
          level: json.level || 'Diploma',
          duration: json.duration || '2 Hours',
          mode: json.mode || 'Face to face',
          outcomes: json.outcomes || '',
          skillFocus: json.skillFocus || [],
          teachingStyle: json.teachingStyle || 'Interactive',
          language: json.language || 'English',
          assessmentType: json.assessmentType || 'Quiz',
          specialRequirements: json.specialRequirements || [],
          content: json.content,
          createdAt: serverTimestamp(),
          isFavourite: false
        };

        await addDoc(collection(db, 'modules'), newModule);
        alert("Module imported successfully!");
      } catch (error) {
        if (error instanceof Error && error.message.includes('Firestore Error')) {
          throw error;
        }
        handleFirestoreError(error, OperationType.CREATE, 'modules');
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-grey">
        <Loader2 className="w-12 h-12 animate-spin text-deep-blue" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-light-grey p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center"
        >
          <div className="w-20 h-20 bg-deep-blue rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-gold" />
          </div>
          <h1 className="text-3xl font-bold text-deep-blue mb-2">AI Modul PdP</h1>
          <p className="text-slate-600 mb-8">Professional Teaching Module Generator for TVET Institutions</p>
          <button 
            onClick={signIn}
            className="w-full bg-deep-blue text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-opacity-90 transition-all shadow-lg shadow-deep-blue/20"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-light-grey">
      {/* Sidebar */}
      <aside className="w-72 bg-deep-blue text-white flex flex-col sticky top-0 h-screen">
        <div className="p-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-gold rounded-xl flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-deep-blue" />
          </div>
          <span className="font-bold text-xl tracking-tight">AI Modul PdP</span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          <SidebarItem 
            icon={<LayoutDashboard />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarItem 
            icon={<FilePlus2 />} 
            label="Module Generator" 
            active={activeTab === 'generator'} 
            onClick={() => { setIsEditing(false); setActiveTab('generator'); }} 
          />
          <SidebarItem 
            icon={<Library />} 
            label="Module Library" 
            active={activeTab === 'library'} 
            onClick={() => setActiveTab('library')} 
          />
          <SidebarItem 
            icon={<BookOpen />} 
            label="Teaching Resources" 
            active={activeTab === 'resources'} 
            onClick={() => setActiveTab('resources')} 
          />
          <SidebarItem 
            icon={<HelpCircle />} 
            label="Help Center" 
            active={activeTab === 'help'} 
            onClick={() => setActiveTab('help')} 
          />
        </nav>

        <div className="p-6 border-t border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border-2 border-gold" />
            <div className="overflow-hidden">
              <p className="font-medium truncate">{user.displayName}</p>
              <p className="text-xs text-white/60 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition-colors text-white/80"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-10 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-deep-blue capitalize">
            {activeTab.replace('-', ' ')}
          </h2>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => { setIsEditing(false); setActiveTab('generator'); }}
              className="bg-gold text-deep-blue px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:scale-105 transition-transform"
            >
              <Plus className="w-5 h-5" />
              Create New
            </button>
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard icon={<FileText className="text-blue-500" />} label="Total Modules" value={stats.totalModules} />
                  <StatCard icon={<Star className="text-gold" />} label="Favourites" value={stats.favouriteCount} />
                  <StatCard icon={<Download className="text-emerald-500" />} label="Downloads" value={stats.downloadCount} />
                  <StatCard icon={<Users className="text-purple-500" />} label="Students Impacted" value={stats.totalModules * 30} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Recent Modules */}
                  <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-bold text-lg text-deep-blue">Recent Modules</h3>
                      <button onClick={() => setActiveTab('library')} className="text-gold font-bold text-sm hover:underline">View All</button>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {stats.recentModules.length > 0 ? (
                        stats.recentModules.map(mod => (
                          <div key={mod.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => { setSelectedModule(mod); setActiveTab('view'); }}>
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-light-grey rounded-xl flex items-center justify-center text-deep-blue">
                                <FileText className="w-6 h-6" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">{mod.topic}</p>
                                <p className="text-sm text-slate-500">{mod.course} • {mod.level}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedModule(mod); startEditing(mod); }}
                                className="p-2 text-slate-400 hover:text-deep-blue opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <FilePlus2 className="w-5 h-5" />
                              </button>
                              <ChevronRight className="text-slate-300" />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-12 text-center text-slate-400">
                          No modules generated yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="space-y-6">
                    <div className="bg-deep-blue rounded-3xl p-8 text-white relative overflow-hidden">
                      <Sparkles className="absolute -right-4 -top-4 w-32 h-32 text-white/5 rotate-12" />
                      <h3 className="text-xl font-bold mb-2">Ready to teach?</h3>
                      <p className="text-white/70 text-sm mb-6">Generate a complete module with AI in seconds.</p>
                      <button 
                        onClick={() => setActiveTab('generator')}
                        className="w-full bg-gold text-deep-blue py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                      >
                        Start Generating
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-deep-blue mb-4">Quick Links</h3>
                      <div className="space-y-3">
                        <QuickLink icon={<Presentation />} label="Canva Templates" />
                        <QuickLink icon={<CheckCircle2 />} label="Rubric Bank" />
                        <QuickLink icon={<Target />} label="Outcome Mapper" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'generator' && (
              <motion.div 
                key="generator"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-4xl mx-auto"
              >
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-10">
                  <div className="mb-10 flex justify-between items-center">
                    <div>
                      <h3 className="text-2xl font-bold text-deep-blue mb-2">
                        {isEditing ? 'Edit Module Parameters' : 'Smart Module Generator'}
                      </h3>
                      <p className="text-slate-500">
                        {isEditing 
                          ? 'Update the parameters for this module.' 
                          : 'Fill in the details below and our AI will craft a professional teaching module for you.'}
                      </p>
                    </div>
                    {isEditing && (
                      <button 
                        onClick={() => { setIsEditing(false); setActiveTab('view'); }}
                        className="text-slate-400 hover:text-slate-600 font-bold"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="mb-10">
                      <label className="text-sm font-bold text-slate-700 mb-4 block">Quick Start Templates</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {MODULE_TEMPLATES.map(template => (
                          <button
                            key={template.name}
                            type="button"
                            onClick={() => setFormData({
                              ...formData,
                              course: template.course,
                              topic: template.topic,
                              level: template.level,
                              duration: template.duration,
                              mode: template.mode,
                              skillFocus: template.skillFocus,
                              teachingStyle: template.teachingStyle
                            })}
                            className="p-4 rounded-2xl border border-slate-200 hover:border-gold hover:bg-gold/5 transition-all text-left group"
                          >
                            <p className="font-bold text-deep-blue text-sm group-hover:text-gold transition-colors">{template.name}</p>
                            <p className="text-xs text-slate-500 mt-1">{template.course}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <form onSubmit={isEditing ? handleUpdate : handleGenerate} className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Course / Subject</label>
                        <input 
                          required
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-deep-blue/20 focus:border-deep-blue outline-none transition-all"
                          placeholder="e.g. Computer Architecture"
                          value={formData.course}
                          onChange={e => setFormData({...formData, course: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Topic</label>
                        <input 
                          required
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-deep-blue/20 focus:border-deep-blue outline-none transition-all"
                          placeholder="e.g. Logic Gates"
                          value={formData.topic}
                          onChange={e => setFormData({...formData, topic: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <FormSelect 
                        label="Student Level" 
                        options={['Certificate', 'Diploma', 'Degree', 'Master']} 
                        value={formData.level}
                        onChange={v => setFormData({...formData, level: v})}
                      />
                      <FormSelect 
                        label="Duration" 
                        options={['1 Hour', '2 Hours', '3 Hours', 'Full Day']} 
                        value={formData.duration}
                        onChange={v => setFormData({...formData, duration: v})}
                      />
                      <FormSelect 
                        label="Mode of Delivery" 
                        options={['Face to face', 'Online', 'Hybrid']} 
                        value={formData.mode}
                        onChange={v => setFormData({...formData, mode: v})}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Learning Outcomes</label>
                      <textarea 
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-deep-blue/20 focus:border-deep-blue outline-none transition-all h-32"
                        placeholder="What should students achieve? (Optional)"
                        value={formData.outcomes}
                        onChange={e => setFormData({...formData, outcomes: e.target.value})}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-700">Skill Focus</label>
                        <div className="flex flex-wrap gap-2">
                          {['Knowledge', 'Practical Skills', 'Creativity', 'Innovation', 'Entrepreneurship'].map(skill => (
                            <button
                              key={skill}
                              type="button"
                              onClick={() => {
                                const newSkills = formData.skillFocus.includes(skill) 
                                  ? formData.skillFocus.filter(s => s !== skill)
                                  : [...formData.skillFocus, skill];
                                setFormData({...formData, skillFocus: newSkills});
                              }}
                              className={cn(
                                "px-4 py-2 rounded-full text-sm font-medium border transition-all",
                                formData.skillFocus.includes(skill) 
                                  ? "bg-deep-blue text-white border-deep-blue" 
                                  : "bg-white text-slate-600 border-slate-200 hover:border-deep-blue"
                              )}
                            >
                              {skill}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-700">Special Requirements</label>
                        <div className="flex flex-wrap gap-2">
                          {['Worksheet', 'Rubric', 'Canva Slides', 'Google Form Quiz', 'Student Handout'].map(req => (
                            <button
                              key={req}
                              type="button"
                              onClick={() => {
                                const newReqs = formData.specialRequirements.includes(req) 
                                  ? formData.specialRequirements.filter(r => r !== req)
                                  : [...formData.specialRequirements, req];
                                setFormData({...formData, specialRequirements: newReqs});
                              }}
                              className={cn(
                                "px-4 py-2 rounded-full text-sm font-medium border transition-all",
                                formData.specialRequirements.includes(req) 
                                  ? "bg-gold text-deep-blue border-gold" 
                                  : "bg-white text-slate-600 border-slate-200 hover:border-gold"
                              )}
                            >
                              {req}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <FormSelect 
                        label="Teaching Style" 
                        options={['Interactive', 'Problem-based', 'Project-based', 'Gamified']} 
                        value={formData.teachingStyle}
                        onChange={v => setFormData({...formData, teachingStyle: v})}
                      />
                      <FormSelect 
                        label="Language" 
                        options={['Bahasa Melayu', 'English', 'Bilingual']} 
                        value={formData.language}
                        onChange={v => setFormData({...formData, language: v})}
                      />
                      <FormSelect 
                        label="Assessment Type" 
                        options={['Quiz', 'Assignment', 'Presentation', 'Project', 'Reflection']} 
                        value={formData.assessmentType}
                        onChange={v => setFormData({...formData, assessmentType: v})}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-deep-blue flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gold" />
                        Reference Text / PDF Content (Optional)
                      </label>
                      <textarea 
                        className="w-full px-4 py-3 rounded-xl bg-light-grey border-none outline-none text-sm min-h-[150px] focus:ring-2 focus:ring-gold/20 transition-all"
                        placeholder="Paste text from your PDF, slides, or notes here to help the AI generate more accurate content..."
                        value={formData.pdfText}
                        onChange={e => setFormData({...formData, pdfText: e.target.value})}
                      />
                      <p className="text-[10px] text-slate-400 italic">The AI will prioritize this content while maintaining professional TVET standards.</p>
                    </div>

                    <button 
                      type="submit"
                      disabled={isGenerating}
                      className="w-full bg-deep-blue text-white py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:bg-opacity-95 transition-all shadow-xl shadow-deep-blue/20 disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          {isEditing ? 'Updating Module...' : 'AI is crafting your module...'}
                        </>
                      ) : (
                        <>
                          {isEditing ? <FilePlus2 className="w-6 h-6" /> : <Sparkles className="w-6 h-6 text-gold" />}
                          {isEditing ? 'Save Changes' : 'Generate Complete Module'}
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {activeTab === 'edit-content' && selectedModule && (
              <motion.div 
                key="edit-content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-5xl mx-auto"
              >
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-deep-blue text-white">
                    <div>
                      <h3 className="text-2xl font-bold">Edit Module Content</h3>
                      <p className="text-white/60">Manually refine the generated text and structure.</p>
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="flex bg-white/10 rounded-xl p-1 mr-2">
                        <button 
                          onClick={handleUndo}
                          disabled={historyIndex <= 0}
                          className="p-2 text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all rounded-lg"
                          title="Undo"
                        >
                          <Undo2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={handleRedo}
                          disabled={historyIndex >= history.length - 1}
                          className="p-2 text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all rounded-lg"
                          title="Redo"
                        >
                          <Redo2 className="w-5 h-5" />
                        </button>
                      </div>
                      <button 
                        onClick={() => setActiveTab('view')}
                        className="px-6 py-2.5 rounded-xl border border-white/20 hover:bg-white/10 transition-all font-bold"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => {
                          handleManualContentUpdate(selectedModule.content);
                          setActiveTab('view');
                        }}
                        className="px-6 py-2.5 rounded-xl bg-gold text-deep-blue hover:bg-opacity-90 transition-all font-bold"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Module Title</label>
                      <input 
                        className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none text-xl font-bold text-deep-blue focus:ring-2 focus:ring-gold/20"
                        value={selectedModule.content.title}
                        onChange={e => setSelectedModule({
                          ...selectedModule,
                          content: { ...selectedModule.content, title: e.target.value }
                        })}
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Synopsis</label>
                      <textarea 
                        className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[120px] focus:ring-2 focus:ring-gold/20"
                        value={selectedModule.content.synopsis}
                        onChange={e => setSelectedModule({
                          ...selectedModule,
                          content: { ...selectedModule.content, synopsis: e.target.value }
                        })}
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Introduction</label>
                      <textarea 
                        className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[150px] focus:ring-2 focus:ring-gold/20"
                        value={selectedModule.content.introduction}
                        onChange={e => setSelectedModule({
                          ...selectedModule,
                          content: { ...selectedModule.content, introduction: e.target.value }
                        })}
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Main Content (Markdown)</label>
                      <textarea 
                        className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[400px] font-mono text-sm focus:ring-2 focus:ring-gold/20"
                        value={selectedModule.content.mainContent}
                        onChange={e => setSelectedModule({
                          ...selectedModule,
                          content: { ...selectedModule.content, mainContent: e.target.value }
                        })}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Learning Objectives (One per line)</label>
                        <textarea 
                          className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[150px] focus:ring-2 focus:ring-gold/20"
                          value={selectedModule.content.learningObjectives.join('\n')}
                          onChange={e => setSelectedModule({
                            ...selectedModule,
                            content: { ...selectedModule.content, learningObjectives: e.target.value.split('\n') }
                          })}
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Teaching Activities (One per line)</label>
                        <textarea 
                          className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[150px] focus:ring-2 focus:ring-gold/20"
                          value={selectedModule.content.teachingActivities.join('\n')}
                          onChange={e => setSelectedModule({
                            ...selectedModule,
                            content: { ...selectedModule.content, teachingActivities: e.target.value.split('\n') }
                          })}
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Student Activities (One per line)</label>
                        <textarea 
                          className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[150px] focus:ring-2 focus:ring-gold/20"
                          value={selectedModule.content.studentActivities.join('\n')}
                          onChange={e => setSelectedModule({
                            ...selectedModule,
                            content: { ...selectedModule.content, studentActivities: e.target.value.split('\n') }
                          })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Materials (One per line)</label>
                        <textarea 
                          className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[150px] focus:ring-2 focus:ring-gold/20"
                          value={selectedModule.content.materials.join('\n')}
                          onChange={e => setSelectedModule({
                            ...selectedModule,
                            content: { ...selectedModule.content, materials: e.target.value.split('\n') }
                          })}
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Exercises (One per line)</label>
                        <textarea 
                          className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[150px] focus:ring-2 focus:ring-gold/20"
                          value={selectedModule.content.exercises.join('\n')}
                          onChange={e => setSelectedModule({
                            ...selectedModule,
                            content: { ...selectedModule.content, exercises: e.target.value.split('\n') }
                          })}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Critical Thinking Questions (One per line)</label>
                      <textarea 
                        className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[150px] focus:ring-2 focus:ring-gold/20"
                        value={selectedModule.content.criticalThinking.join('\n')}
                        onChange={e => setSelectedModule({
                          ...selectedModule,
                          content: { ...selectedModule.content, criticalThinking: e.target.value.split('\n') }
                        })}
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Summative Assessment</label>
                      <textarea 
                        className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[150px] focus:ring-2 focus:ring-gold/20"
                        value={selectedModule.content.summativeAssessment}
                        onChange={e => setSelectedModule({
                          ...selectedModule,
                          content: { ...selectedModule.content, summativeAssessment: e.target.value }
                        })}
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Assessment Rubric (Markdown)</label>
                      <textarea 
                        className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[200px] font-mono text-sm focus:ring-2 focus:ring-gold/20"
                        value={selectedModule.content.rubric}
                        onChange={e => setSelectedModule({
                          ...selectedModule,
                          content: { ...selectedModule.content, rubric: e.target.value }
                        })}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Lecturer Reflection</label>
                        <textarea 
                          className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[150px] focus:ring-2 focus:ring-gold/20"
                          value={selectedModule.content.lecturerReflection}
                          onChange={e => setSelectedModule({
                            ...selectedModule,
                            content: { ...selectedModule.content, lecturerReflection: e.target.value }
                          })}
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Student Reflection</label>
                        <textarea 
                          className="w-full px-6 py-4 rounded-2xl bg-light-grey border-none outline-none min-h-[150px] focus:ring-2 focus:ring-gold/20"
                          value={selectedModule.content.studentReflection}
                          onChange={e => setSelectedModule({
                            ...selectedModule,
                            content: { ...selectedModule.content, studentReflection: e.target.value }
                          })}
                        />
                      </div>
                    </div>

                    <div className="space-y-6 bg-slate-50 p-6 rounded-3xl border border-slate-200">
                      <h4 className="font-bold text-deep-blue flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-gold" />
                        Instructor Notes
                      </h4>
                      
                      <div className="space-y-4">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delivery Guidance (One per line)</label>
                        <textarea 
                          className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-gold/20"
                          value={selectedModule.content.instructorNotes?.deliveryGuidance.join('\n')}
                          onChange={e => setSelectedModule({
                            ...selectedModule,
                            content: { 
                              ...selectedModule.content, 
                              instructorNotes: { 
                                ...selectedModule.content.instructorNotes, 
                                deliveryGuidance: e.target.value.split('\n') 
                              } 
                            }
                          })}
                        />
                      </div>

                      <div className="space-y-4">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Classroom Management (One per line)</label>
                        <textarea 
                          className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-gold/20"
                          value={selectedModule.content.instructorNotes?.classroomManagement.join('\n')}
                          onChange={e => setSelectedModule({
                            ...selectedModule,
                            content: { 
                              ...selectedModule.content, 
                              instructorNotes: { 
                                ...selectedModule.content.instructorNotes, 
                                classroomManagement: e.target.value.split('\n') 
                              } 
                            }
                          })}
                        />
                      </div>

                      <div className="space-y-4">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Potential Student Questions (Format: Question | Answer per line)</label>
                        <textarea 
                          className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-gold/20 min-h-[150px]"
                          value={selectedModule.content.instructorNotes?.potentialQuestions.map(q => `${q.question} | ${q.answer}`).join('\n')}
                          onChange={e => setSelectedModule({
                            ...selectedModule,
                            content: { 
                              ...selectedModule.content, 
                              instructorNotes: { 
                                ...selectedModule.content.instructorNotes, 
                                potentialQuestions: e.target.value.split('\n').map(line => {
                                  const [question, answer] = line.split('|').map(s => s.trim());
                                  return { question: question || '', answer: answer || '' };
                                })
                              } 
                            }
                          })}
                        />
                      </div>
                    </div>

                    <div className="space-y-6 bg-slate-900 text-white p-6 rounded-3xl">
                      <h4 className="font-bold text-gold flex items-center gap-2">
                        <Sparkles className="w-5 h-5" />
                        AI Suggestions
                      </h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Gamification (One per line)</label>
                          <textarea 
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 outline-none focus:ring-2 focus:ring-gold/20 text-sm"
                            value={selectedModule.content.aiSuggestions.gamification.join('\n')}
                            onChange={e => setSelectedModule({
                              ...selectedModule,
                              content: { 
                                ...selectedModule.content, 
                                aiSuggestions: { ...selectedModule.content.aiSuggestions, gamification: e.target.value.split('\n') } 
                              }
                            })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Industry Examples (One per line)</label>
                          <textarea 
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 outline-none focus:ring-2 focus:ring-gold/20 text-sm"
                            value={selectedModule.content.aiSuggestions.industryExamples.join('\n')}
                            onChange={e => setSelectedModule({
                              ...selectedModule,
                              content: { 
                                ...selectedModule.content, 
                                aiSuggestions: { ...selectedModule.content.aiSuggestions, industryExamples: e.target.value.split('\n') } 
                              }
                            })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Interactive Suggestions (One per line)</label>
                          <textarea 
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 outline-none focus:ring-2 focus:ring-gold/20 text-sm"
                            value={selectedModule.content.aiSuggestions.interactive.join('\n')}
                            onChange={e => setSelectedModule({
                              ...selectedModule,
                              content: { 
                                ...selectedModule.content, 
                                aiSuggestions: { ...selectedModule.content.aiSuggestions, interactive: e.target.value.split('\n') } 
                              }
                            })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Case Studies (One per line)</label>
                          <textarea 
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 outline-none focus:ring-2 focus:ring-gold/20 text-sm"
                            value={selectedModule.content.aiSuggestions.caseStudies.join('\n')}
                            onChange={e => setSelectedModule({
                              ...selectedModule,
                              content: { 
                                ...selectedModule.content, 
                                aiSuggestions: { ...selectedModule.content.aiSuggestions, caseStudies: e.target.value.split('\n') } 
                              }
                            })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            {activeTab === 'library' && (
              <motion.div 
                key="library"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input 
                      className="w-full pl-12 pr-4 py-3 rounded-xl bg-light-grey border-none outline-none focus:ring-2 focus:ring-deep-blue/10"
                      placeholder="Search modules..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <select 
                      className="flex-1 md:flex-none px-4 py-3 rounded-xl bg-light-grey border-none outline-none text-sm font-medium text-slate-600"
                      value={filterSubject}
                      onChange={e => setFilterSubject(e.target.value)}
                    >
                      <option value="">All Subjects</option>
                      {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <label className="cursor-pointer">
                      <input 
                        type="file" 
                        accept=".json" 
                        className="hidden" 
                        onChange={handleImport}
                      />
                      <div className="p-3 bg-light-grey rounded-xl text-slate-600 hover:text-deep-blue transition-colors flex items-center gap-2">
                        <Upload className="w-5 h-5" />
                        <span className="text-sm font-bold hidden md:inline">Import</span>
                      </div>
                    </label>
                    <button 
                      onClick={() => setActiveTab('generator')}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-deep-blue text-white rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-deep-blue/10"
                    >
                      <Plus className="w-4 h-4" />
                      New Module
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredModules.map(mod => (
                    <ModuleCard 
                      key={mod.id} 
                      module={mod} 
                      onView={() => { setSelectedModule(mod); setActiveTab('view'); }}
                      onToggleFav={() => toggleFavourite(mod)}
                      onDelete={() => deleteModule(mod.id)}
                      onEdit={() => { setSelectedModule(mod); startEditing(mod); }}
                    />
                  ))}
                  {filteredModules.length === 0 && (
                    <div className="col-span-full py-20 text-center">
                      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Library className="w-10 h-10 text-slate-300" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-400">No modules found</h3>
                      <p className="text-slate-400">Try adjusting your search or create a new module.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'view' && selectedModule && (
              <motion.div 
                key="view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-5xl mx-auto space-y-8 pb-20"
              >
                <div id="module-content" className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* Module Header */}
                  <div className="bg-deep-blue p-10 text-white">
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-2">
                        <span className="bg-gold/20 text-gold px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                          {selectedModule.level}
                        </span>
                        <h1 className="text-4xl font-bold">{selectedModule.content.title}</h1>
                        <p className="text-white/60 text-lg">{selectedModule.course} • {selectedModule.topic}</p>
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => toggleFavourite(selectedModule)}
                          className={cn(
                            "p-3 rounded-xl transition-all",
                            selectedModule.isFavourite ? "bg-gold text-deep-blue" : "bg-white/10 text-white hover:bg-white/20"
                          )}
                          title="Favourite"
                        >
                          <Star className={cn("w-6 h-6", selectedModule.isFavourite && "fill-current")} />
                        </button>
                        <button 
                          onClick={() => startEditing(selectedModule)}
                          className="p-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all"
                          title="Edit Parameters"
                        >
                          <FilePlus2 className="w-6 h-6" />
                        </button>
                        <button 
                          onClick={() => startManualEdit(selectedModule)}
                          className="p-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all"
                          title="Edit Content"
                        >
                          <BookOpen className="w-6 h-6" />
                        </button>
                        <button 
                          onClick={() => exportToZip(selectedModule, 'module-content')}
                          className="p-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all"
                          title="Download ZIP Package"
                        >
                          <Archive className="w-6 h-6" />
                        </button>
                        <button 
                          onClick={() => exportToPDF('module-content', `${selectedModule.content.title.replace(/\s+/g, '_')}.pdf`)}
                          className="p-3 bg-gold text-deep-blue rounded-xl hover:bg-gold/90 transition-all flex items-center gap-2 px-4"
                          title="Download PDF"
                        >
                          <Download className="w-6 h-6" />
                          <span className="font-bold hidden md:inline">Download PDF</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-white/10">
                      <HeaderStat icon={<Clock />} label="Duration" value={selectedModule.duration} />
                      <HeaderStat icon={<Users />} label="Mode" value={selectedModule.mode} />
                      <HeaderStat icon={<Target />} label="Language" value={selectedModule.language} />
                      <HeaderStat icon={<CheckCircle2 />} label="Assessment" value={selectedModule.assessmentType} />
                    </div>
                  </div>

                  {/* Module Content */}
                  <div className="p-10 space-y-12">
                    <section>
                      <h3 className="text-2xl font-bold text-deep-blue mb-4 flex items-center gap-2">
                        <FileText className="w-6 h-6 text-gold" />
                        Synopsis
                      </h3>
                      <p className="text-slate-600 leading-relaxed text-lg">{selectedModule.content.synopsis}</p>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      <section>
                        <h3 className="text-xl font-bold text-deep-blue mb-4">Learning Objectives</h3>
                        <ul className="space-y-3">
                          {selectedModule.content.learningObjectives.map((obj, i) => (
                            <li key={i} className="flex gap-3 text-slate-600">
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                              {obj}
                            </li>
                          ))}
                        </ul>
                      </section>
                      <section>
                        <h3 className="text-xl font-bold text-deep-blue mb-4">Teaching Materials</h3>
                        <ul className="space-y-3">
                          {selectedModule.content.materials.map((mat, i) => (
                            <li key={i} className="flex gap-3 text-slate-600">
                              <Plus className="w-5 h-5 text-gold shrink-0" />
                              {mat}
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>

                    <section className="bg-light-grey p-8 rounded-3xl">
                      <h3 className="text-2xl font-bold text-deep-blue mb-6">Introduction</h3>
                      <div className="markdown-body">
                        <ReactMarkdown>{selectedModule.content.introduction}</ReactMarkdown>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-deep-blue mb-6">Main Content Explanation</h3>
                      <div className="markdown-body">
                        <ReactMarkdown>{selectedModule.content.mainContent}</ReactMarkdown>
                      </div>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <ActivityCard title="Teaching Activities" items={selectedModule.content.teachingActivities} icon={<Presentation />} color="blue" />
                      <ActivityCard title="Student Activities" items={selectedModule.content.studentActivities} icon={<Users />} color="emerald" />
                    </div>

                    <section className="bg-gold/5 border border-gold/20 p-8 rounded-3xl">
                      <h3 className="text-xl font-bold text-deep-blue mb-4 flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-gold" />
                        Critical Thinking Activities
                      </h3>
                      <ul className="space-y-4">
                        {selectedModule.content.criticalThinking.map((q, i) => (
                          <li key={i} className="bg-white p-4 rounded-xl shadow-sm border border-gold/10 italic text-slate-700">
                            "{q}"
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-deep-blue mb-6">Formative Quiz</h3>
                      <div className="space-y-6">
                        {selectedModule.content.quiz.map((q, i) => (
                          <div key={i} className="bg-white border border-slate-200 p-6 rounded-2xl">
                            <p className="font-bold text-slate-900 mb-3">Q{i+1}: {q.question}</p>
                            <div className="p-4 bg-emerald-50 text-emerald-700 rounded-xl text-sm">
                              <span className="font-bold mr-2">Answer:</span> {q.answer}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="bg-slate-50 border border-slate-200 p-8 rounded-3xl">
                      <h3 className="text-2xl font-bold text-deep-blue mb-6 flex items-center gap-2">
                        <BookOpen className="w-6 h-6 text-gold" />
                        Instructor Notes
                      </h3>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div>
                          <h4 className="font-bold text-deep-blue mb-3 text-sm uppercase tracking-wider">Delivery Guidance</h4>
                          <ul className="space-y-2">
                            {selectedModule.content.instructorNotes?.deliveryGuidance.map((g, i) => (
                              <li key={i} className="text-sm text-slate-600 flex gap-2">
                                <span className="text-gold">•</span> {g}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-bold text-deep-blue mb-3 text-sm uppercase tracking-wider">Classroom Management</h4>
                          <ul className="space-y-2">
                            {selectedModule.content.instructorNotes?.classroomManagement.map((m, i) => (
                              <li key={i} className="text-sm text-slate-600 flex gap-2">
                                <span className="text-gold">•</span> {m}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-bold text-deep-blue mb-3 text-sm uppercase tracking-wider">Potential Student Questions</h4>
                          <div className="space-y-3">
                            {selectedModule.content.instructorNotes?.potentialQuestions.map((q, i) => (
                              <div key={i} className="text-xs bg-white p-3 rounded-xl border border-slate-100">
                                <p className="font-bold text-slate-800 mb-1">Q: {q.question}</p>
                                <p className="text-slate-500 italic">A: {q.answer}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-deep-blue mb-6">Marking Rubric</h3>
                      <div className="markdown-body bg-white border border-slate-200 p-8 rounded-3xl overflow-x-auto">
                        <ReactMarkdown>{selectedModule.content.rubric}</ReactMarkdown>
                      </div>
                    </section>

                    <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="bg-slate-900 text-white p-8 rounded-3xl">
                        <h3 className="text-xl font-bold mb-4">AI Suggestions</h3>
                        <div className="space-y-6">
                          <div>
                            <p className="text-gold text-xs font-bold uppercase tracking-widest mb-2">Gamification</p>
                            <ul className="text-sm text-white/70 space-y-1">
                              {selectedModule.content.aiSuggestions.gamification.map((s, i) => <li key={i}>• {s}</li>)}
                            </ul>
                          </div>
                          <div>
                            <p className="text-gold text-xs font-bold uppercase tracking-widest mb-2">Industry Examples</p>
                            <ul className="text-sm text-white/70 space-y-1">
                              {selectedModule.content.aiSuggestions.industryExamples.map((s, i) => <li key={i}>• {s}</li>)}
                            </ul>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-4">
                        <ExportButton 
                          icon={<Archive />} 
                          label="Export All as ZIP Package (.zip)" 
                          onClick={() => exportToZip(selectedModule, 'module-content')}
                        />
                        <ExportButton 
                          icon={<Download />} 
                          label="Export as PDF Document (.pdf)" 
                          onClick={() => exportToPDF('module-content', `${selectedModule.content.title.replace(/\s+/g, '_')}.pdf`)}
                        />
                        <ExportButton 
                          icon={<FileText />} 
                          label="Export as Markdown (.md)" 
                          onClick={() => exportToMarkdown(selectedModule)}
                        />
                        <ExportButton 
                          icon={<Download />} 
                          label="Export as Plain Text (.txt)" 
                          onClick={() => exportToText(selectedModule)}
                        />
                        <ExportButton 
                          icon={<FilePlus2 />} 
                          label="Export as JSON (.json)" 
                          onClick={() => exportToJSON(selectedModule)}
                        />
                        <ExportButton 
                          icon={<BookOpen />} 
                          label="Export Instructor Notes Only (.txt)" 
                          onClick={() => exportInstructorNotes(selectedModule)}
                        />
                        <ExportButton icon={<Presentation />} label="Generate Canva Slides (Coming Soon)" />
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <ChatAssistant />

      {/* Footer */}
      <footer className="fixed bottom-0 left-72 right-0 bg-white border-t border-slate-200 px-8 py-4 flex justify-between items-center text-xs text-slate-400 z-20">
        <div className="flex items-center gap-4">
          <span>UPIK Research & Innovation Teaching Tools</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          <span>Politeknik Mukah Sarawak</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-gold" />
          <span>Powered by AI</span>
        </div>
      </footer>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactElement, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all group",
        active ? "bg-gold text-deep-blue font-bold shadow-lg shadow-gold/10" : "text-white/70 hover:bg-white/5 hover:text-white"
      )}
    >
      <span className={cn("transition-transform group-hover:scale-110", active ? "text-deep-blue" : "text-white/40 group-hover:text-gold")}>
        {React.cloneElement(icon, { size: 20 } as any)}
      </span>
      {label}
    </button>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactElement, label: string, value: number | string }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-light-grey flex items-center justify-center mb-4">
        {React.cloneElement(icon, { size: 20 } as any)}
      </div>
      <p className="text-slate-500 text-sm font-medium">{label}</p>
      <p className="text-2xl font-bold text-deep-blue mt-1">{value}</p>
    </div>
  );
}

function QuickLink({ icon, label }: { icon: React.ReactElement, label: string }) {
  return (
    <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-light-grey transition-colors group">
      <div className="flex items-center gap-3">
        <span className="text-slate-400 group-hover:text-deep-blue transition-colors">
          {React.cloneElement(icon, { size: 18 } as any)}
        </span>
        <span className="text-sm font-medium text-slate-600 group-hover:text-deep-blue">{label}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-deep-blue" />
    </button>
  );
}

function FormSelect({ label, options, value, onChange }: { label: string, options: string[], value: string, onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-slate-700">{label}</label>
      <select 
        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-deep-blue/20 focus:border-deep-blue outline-none transition-all bg-white"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function ModuleCard({ module, onView, onToggleFav, onDelete, onEdit }: { module: Module, onView: () => void, onToggleFav: () => void, onDelete: () => void, onEdit: () => void }) {
  return (
    <motion.div 
      layout
      className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-all group"
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="w-12 h-12 bg-light-grey rounded-2xl flex items-center justify-center text-deep-blue">
            <FileText className="w-6 h-6" />
          </div>
          <div className="flex gap-1">
            <button onClick={onEdit} className="p-2 text-slate-300 hover:text-deep-blue transition-colors" title="Edit Parameters">
              <FilePlus2 className="w-5 h-5" />
            </button>
            <button onClick={onToggleFav} className={cn("p-2 rounded-lg transition-colors", module.isFavourite ? "text-gold" : "text-slate-300 hover:text-gold")}>
              <Star className={cn("w-5 h-5", module.isFavourite && "fill-current")} />
            </button>
            <button onClick={onDelete} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
        <h4 className="font-bold text-lg text-deep-blue mb-1 line-clamp-1">{module.topic}</h4>
        <p className="text-slate-500 text-sm mb-4">{module.course}</p>
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase">{module.level}</span>
          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase">{module.duration}</span>
        </div>
        <button 
          onClick={onView}
          className="w-full py-3 bg-light-grey text-deep-blue font-bold rounded-xl hover:bg-deep-blue hover:text-white transition-all flex items-center justify-center gap-2"
        >
          View Module
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

function HeaderStat({ icon, label, value }: { icon: React.ReactElement, label: string, value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-gold">
        {React.cloneElement(icon, { size: 20 } as any)}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function ActivityCard({ title, items, icon, color }: { title: string, items: string[], icon: React.ReactElement, color: 'blue' | 'emerald' }) {
  const colors = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100"
  };
  
  return (
    <div className={cn("p-8 rounded-3xl border", colors[color])}>
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
        {React.cloneElement(icon, { size: 24 } as any)}
        {title}
      </h3>
      <ul className="space-y-4">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed">
            <span className="font-bold">{i + 1}.</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExportButton({ icon, label, onClick }: { icon: React.ReactElement, label: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl hover:border-deep-blue hover:bg-deep-blue/5 transition-all group text-left"
    >
      <span className="text-slate-400 group-hover:text-deep-blue transition-colors">
        {React.cloneElement(icon, { size: 20 } as any)}
      </span>
      <span className="font-bold text-slate-700 group-hover:text-deep-blue">{label}</span>
    </button>
  );
}
