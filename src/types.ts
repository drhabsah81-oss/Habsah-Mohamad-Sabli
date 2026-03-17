export interface ModuleContent {
  title: string;
  synopsis: string;
  learningObjectives: string[];
  duration: string;
  introduction: string;
  mainContent: string;
  teachingActivities: string[];
  studentActivities: string[];
  criticalThinking: string[];
  materials: string[];
  exercises: string[];
  quiz: { question: string; answer: string }[];
  summativeAssessment: string;
  rubric: string;
  lecturerReflection: string;
  studentReflection: string;
  instructorNotes: {
    deliveryGuidance: string[];
    potentialQuestions: { question: string; answer: string }[];
    classroomManagement: string[];
  };
  aiSuggestions: {
    interactive: string[];
    gamification: string[];
    caseStudies: string[];
    industryExamples: string[];
  };
}

export interface Module {
  id: string;
  userId: string;
  course: string;
  topic: string;
  level: string;
  duration: string;
  mode: string;
  outcomes: string;
  skillFocus: string[];
  teachingStyle: string;
  language: string;
  assessmentType: string;
  specialRequirements: string[];
  content: ModuleContent;
  pdfText?: string;
  createdAt: any;
  isFavourite: boolean;
}

export interface UserStats {
  totalModules: number;
  recentModules: Module[];
  favouriteCount: number;
  downloadCount: number;
}
