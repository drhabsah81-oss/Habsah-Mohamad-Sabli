import { Module } from './types';
// @ts-ignore
import html2pdf from 'html2pdf.js';

const getPDFOptions = (fileName: string): any => ({
  margin: [0.5, 0.5] as [number, number],
  filename: fileName,
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: { 
    scale: 2, 
    useCORS: true, 
    letterRendering: true,
    onclone: (clonedDoc: Document) => {
      // 1. Sanitize stylesheets to remove oklch references
      const styleSheets = Array.from(clonedDoc.styleSheets);
      styleSheets.forEach(sheet => {
        try {
          const rules = Array.from(sheet.cssRules);
          rules.forEach((rule, index) => {
            if (rule.cssText.includes('oklch')) {
              // Replace oklch with a safe fallback in the entire rule text
              // This is a bit brute force but effective for html2canvas
              const newCssText = rule.cssText.replace(/oklch\([^)]+\)/g, '#cccccc');
              sheet.deleteRule(index);
              sheet.insertRule(newCssText, index);
            }
          });
        } catch (e) {
          // Cross-origin stylesheet access might fail, ignore
        }
      });

      // 2. Inject safe styles
      const style = clonedDoc.createElement('style');
      style.innerHTML = `
        :root { color-scheme: light !important; }
        * { border-color: #e2e8f0 !important; }
        .bg-gold\\/5 { background-color: rgba(212, 175, 55, 0.05) !important; }
        .bg-gold\\/10 { background-color: rgba(212, 175, 55, 0.1) !important; }
        .bg-gold\\/20 { background-color: rgba(212, 175, 55, 0.2) !important; }
        .border-gold\\/10 { border-color: rgba(212, 175, 55, 0.1) !important; }
        .border-gold\\/20 { border-color: rgba(212, 175, 55, 0.2) !important; }
        .bg-deep-blue\\/90 { background-color: rgba(0, 51, 102, 0.9) !important; }
        .bg-white\\/10 { background-color: rgba(255, 255, 255, 0.1) !important; }
        .bg-white\\/20 { background-color: rgba(255, 255, 255, 0.2) !important; }
        .text-white\\/60 { color: rgba(255, 255, 255, 0.6) !important; }
        .text-white\\/70 { color: rgba(255, 255, 255, 0.7) !important; }
        .text-white\\/50 { color: rgba(255, 255, 255, 0.5) !important; }
        .border-white\\/10 { border-color: rgba(255, 255, 255, 0.1) !important; }
        .bg-emerald-50 { background-color: #ecfdf5 !important; }
        .text-emerald-700 { color: #047857 !important; }
        .bg-slate-50 { background-color: #f8fafc !important; }
        .bg-light-grey { background-color: #F5F5F5 !important; }
        .text-deep-blue { color: #003366 !important; }
        .text-gold { color: #D4AF37 !important; }
      `;
      clonedDoc.head.appendChild(style);

      // 3. Manually fix inline styles and computed styles
      const elements = clonedDoc.getElementsByTagName('*');
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLElement;
        ['color', 'background-color', 'border-color', 'fill', 'stroke'].forEach(prop => {
          const val = window.getComputedStyle(el).getPropertyValue(prop);
          if (val && val.includes('oklch')) {
            el.style.setProperty(prop, prop.includes('background') ? 'transparent' : 'inherit', 'important');
          }
        });
      }
    }
  },
  jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
});

export const exportToPDF = async (elementId: string, fileName: string) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    alert("Could not find the module content to export. Please try again.");
    return;
  }

  // Create a loading notification
  const notification = document.createElement('div');
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.backgroundColor = '#003366';
  notification.style.color = 'white';
  notification.style.padding = '15px 25px';
  notification.style.borderRadius = '12px';
  notification.style.zIndex = '9999';
  notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  notification.style.fontFamily = 'sans-serif';
  notification.style.fontWeight = 'bold';
  notification.innerHTML = 'Generating PDF... Please wait.';
  document.body.appendChild(notification);

  const opt = getPDFOptions(fileName);

  try {
    // html2pdf returns a worker that is thenable
    await html2pdf().set(opt).from(element).save();
    notification.innerHTML = 'PDF Downloaded Successfully!';
    notification.style.backgroundColor = '#10b981';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 3000);
  } catch (error) {
    console.error("PDF Export failed:", error);
    notification.innerHTML = 'PDF Export Failed';
    notification.style.backgroundColor = '#ef4444';
    alert("Failed to generate PDF. This can happen with very large modules. Please try exporting as Markdown or Text instead.");
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 5000);
  }
};

export const getMarkdownContent = (module: Module) => {
  const { content } = module;
  return `# ${content.title}
  
## Synopsis
${content.synopsis}

## Learning Objectives
${content.learningObjectives.map(obj => `- ${obj}`).join('\n')}

## Duration
${content.duration}

## Introduction
${content.introduction}

## Main Content
${content.mainContent}

## Teaching Activities
${content.teachingActivities.map(act => `- ${act}`).join('\n')}

## Student Activities
${content.studentActivities.map(act => `- ${act}`).join('\n')}

## Critical Thinking
${content.criticalThinking.map(q => `- ${q}`).join('\n')}

## Materials
${content.materials.map(m => `- ${m}`).join('\n')}

## Exercises
${content.exercises.map(e => `- ${e}`).join('\n')}

## Quiz
${content.quiz.map((q, i) => `**Q${i + 1}: ${q.question}**\n*Answer: ${q.answer}*`).join('\n\n')}

## Summative Assessment
${content.summativeAssessment}

## Rubric
${content.rubric}

## Instructor Notes
### Delivery Guidance
${content.instructorNotes?.deliveryGuidance.map(g => `- ${g}`).join('\n')}
### Classroom Management
${content.instructorNotes?.classroomManagement.map(m => `- ${m}`).join('\n')}
### Potential Student Questions
${content.instructorNotes?.potentialQuestions.map(q => `**Q: ${q.question}**\n*A: ${q.answer}*`).join('\n\n')}

## Reflections
### Lecturer
${content.lecturerReflection}
### Student
${content.studentReflection}

## AI Suggestions
### Interactive
${content.aiSuggestions.interactive.map(s => `- ${s}`).join('\n')}
### Gamification
${content.aiSuggestions.gamification.map(s => `- ${s}`).join('\n')}
### Case Studies
${content.aiSuggestions.caseStudies.map(s => `- ${s}`).join('\n')}
### Industry Examples
${content.aiSuggestions.industryExamples.map(s => `- ${s}`).join('\n')}
`;
};

export const getTextContent = (module: Module) => {
  const { content } = module;
  return `TITLE: ${content.title}

SYNOPSIS:
${content.synopsis}

LEARNING OBJECTIVES:
${content.learningObjectives.map(obj => `- ${obj}`).join('\n')}

DURATION: ${content.duration}

INTRODUCTION:
${content.introduction}

MAIN CONTENT:
${content.mainContent}

TEACHING ACTIVITIES:
${content.teachingActivities.map(act => `- ${act}`).join('\n')}

STUDENT ACTIVITIES:
${content.studentActivities.map(act => `- ${act}`).join('\n')}

CRITICAL THINKING:
${content.criticalThinking.map(q => `- ${q}`).join('\n')}

MATERIALS:
${content.materials.map(m => `- ${m}`).join('\n')}

EXERCISES:
${content.exercises.map(e => `- ${e}`).join('\n')}

QUIZ:
${content.quiz.map((q, i) => `Q${i + 1}: ${q.question}\nAnswer: ${q.answer}`).join('\n\n')}

SUMMATIVE ASSESSMENT:
${content.summativeAssessment}

RUBRIC:
${content.rubric}

INSTRUCTOR NOTES:
Delivery Guidance:
${content.instructorNotes?.deliveryGuidance.map(g => `- ${g}`).join('\n')}

Classroom Management:
${content.instructorNotes?.classroomManagement.map(m => `- ${m}`).join('\n')}

Potential Student Questions:
${content.instructorNotes?.potentialQuestions.map(q => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')}

LECTURER REFLECTION:
${content.lecturerReflection}

STUDENT REFLECTION:
${content.studentReflection}
`;
};

export const exportToMarkdown = (module: Module) => {
  const md = getMarkdownContent(module);
  downloadFile(md, `${module.content.title.replace(/\s+/g, '_')}.md`, 'text/markdown');
};

export const exportToText = (module: Module) => {
  const text = getTextContent(module);
  downloadFile(text, `${module.content.title.replace(/\s+/g, '_')}.txt`, 'text/plain');
};

export const exportToJSON = (module: Module) => {
  const data = JSON.stringify(module, null, 2);
  downloadFile(data, `${module.content.title.replace(/\s+/g, '_')}.json`, 'application/json');
};

export const exportInstructorNotes = (module: Module) => {
  const { content } = module;
  const notes = `INSTRUCTOR NOTES: ${content.title}

DELIVERY GUIDANCE:
${content.instructorNotes?.deliveryGuidance.map(g => `- ${g}`).join('\n')}

CLASSROOM MANAGEMENT:
${content.instructorNotes?.classroomManagement.map(m => `- ${m}`).join('\n')}

POTENTIAL STUDENT QUESTIONS:
${content.instructorNotes?.potentialQuestions.map(q => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')}
`;
  downloadFile(notes, `${module.content.title.replace(/\s+/g, '_')}_Instructor_Notes.txt`, 'text/plain');
};

export const exportToZip = async (module: Module, elementId: string) => {
  // Create a loading notification
  const notification = document.createElement('div');
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.backgroundColor = '#003366';
  notification.style.color = 'white';
  notification.style.padding = '15px 25px';
  notification.style.borderRadius = '12px';
  notification.style.zIndex = '9999';
  notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  notification.style.fontFamily = 'sans-serif';
  notification.style.fontWeight = 'bold';
  notification.innerHTML = 'Preparing ZIP Package... This may take a moment.';
  document.body.appendChild(notification);

  try {
    // @ts-ignore
    const JSZipModule: any = await import('jszip');
    const JSZip = JSZipModule.default || JSZipModule;
    const zip = new JSZip();
    const baseName = module.content.title.replace(/\s+/g, '_');

    // Add JSON
    zip.file(`${baseName}.json`, JSON.stringify(module, null, 2));

    // Add Markdown
    zip.file(`${baseName}.md`, getMarkdownContent(module));

    // Add Text
    zip.file(`${baseName}.txt`, getTextContent(module));

    // Add PDF
    const element = document.getElementById(elementId);
    if (element) {
      const opt = getPDFOptions(`${baseName}.pdf`);
      
      try {
        // html2pdf returns a worker that can be converted to a promise
        const pdfBlob = await html2pdf().set(opt).from(element).output('blob');
        zip.file(`${baseName}.pdf`, pdfBlob);
      } catch (error) {
        console.error("Error adding PDF to ZIP:", error);
        // We continue even if PDF fails
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${baseName}_Package.zip`;
    document.body.appendChild(a);
    a.click();
    
    notification.innerHTML = 'ZIP Package Downloaded!';
    notification.style.backgroundColor = '#10b981';
    
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  } catch (error) {
    console.error("ZIP Export failed:", error);
    notification.innerHTML = 'ZIP Export Failed';
    notification.style.backgroundColor = '#ef4444';
    alert("Failed to generate ZIP package. Please try individual exports.");
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 5000);
  }
};

const downloadFile = (content: string, fileName: string, contentType: string) => {
  const file = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
};
