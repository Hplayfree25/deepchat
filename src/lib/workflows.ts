export interface Workflow {
  id: string;
  icon: 'Search' | 'BarChart3' | 'PenTool' | 'Puzzle' | 'Code2' | 'Globe' | 'Database' | 'FileText' | 'Lightbulb' | 'MessageCircle';
  title: string;
  desc: string;
  prompt: string;
}

export const WORKFLOWS: Workflow[] = [
  {
    id: 'research',
    icon: 'Search',
    title: 'Research a topic',
    desc: 'Find, summarize, and cite sources',
    prompt: 'I need to conduct comprehensive research on [Topic/Subject].\n\nPlease structure your response as follows:\n1. An executive summary of the topic.\n2. Key historical context or background.\n3. Current trends and recent developments.\n4. Potential future implications or challenges.\n5. A list of 3-5 reliable sources or references I can explore further.\n\nAdditional context or specific angles to focus on: [Any specific context or leave blank]'
  },
  {
    id: 'analyze',
    icon: 'BarChart3',
    title: 'Analyze data',
    desc: 'Extract insights and visualize data',
    prompt: 'I have a dataset containing [Describe the data, e.g., sales figures from Q1 to Q4].\n\nI need you to act as a Data Analyst. Please provide:\n1. The top 3 key insights or trends you can identify from this type of data.\n2. Any anomalies or outliers that usually occur in this domain.\n3. Suggestions for the best types of charts/graphs to visualize this data (e.g., bar chart, scatter plot) and why.\n\n[Paste your data summary or raw data here]'
  },
  {
    id: 'write_blog',
    icon: 'PenTool',
    title: 'Write a blog post',
    desc: 'Engaging, SEO-optimized articles',
    prompt: 'Act as an expert copywriter. I need a blog post about [Topic/Keyword].\n\nRequirements:\n- Target Audience: [Target Audience]\n- Tone of Voice: [e.g., Professional, Conversational, Humorous]\n- Length: Approximately [Word count] words.\n- Structure: Include an engaging hook, 3-4 main subheadings, and a strong call-to-action (CTA) at the end.\n- SEO: Naturally integrate these keywords: [Keyword 1, Keyword 2, Keyword 3].'
  },
  {
    id: 'solve_problem',
    icon: 'Puzzle',
    title: 'Solve a complex problem',
    desc: 'Step-by-step reasoning & solutions',
    prompt: 'I am facing a complex problem regarding [Describe the problem].\n\nPlease use a step-by-step reasoning framework to solve it:\n1. Define the core issue.\n2. Break the problem down into smaller, manageable sub-problems.\n3. Propose 2-3 potential solutions for each sub-problem.\n4. Evaluate the pros and cons of each solution.\n5. Recommend the best overall approach and explain why.\n\nConstraints or limitations to consider: [List constraints]'
  },
  {
    id: 'code_review',
    icon: 'Code2',
    title: 'Code Review',
    desc: 'Analyze code for bugs and improvements',
    prompt: 'Act as a Senior Software Engineer. I need you to review the following [Language, e.g., TypeScript] code.\n\nPlease focus on:\n1. Identifying any potential bugs or edge cases.\n2. Performance optimization opportunities.\n3. Security vulnerabilities.\n4. Code readability and adherence to best practices (e.g., SOLID principles).\n\nPlease provide refactored code snippets where applicable.\n\nCode to review:\n```\n[Paste your code here]\n```'
  },
  {
    id: 'translate',
    icon: 'Globe',
    title: 'Advanced Translation',
    desc: 'Context-aware, natural translation',
    prompt: 'Please translate the following text from [Source Language] to [Target Language].\n\nImportant instructions:\n- Do not just translate word-for-word. Ensure the translation sounds natural and idiomatic in the target language.\n- The context of this text is [Describe context, e.g., a formal business contract, a casual tweet].\n- Maintain the original tone and formatting.\n\nText to translate:\n\n[Paste text here]'
  },
  {
    id: 'database_schema',
    icon: 'Database',
    title: 'Design DB Schema',
    desc: 'Create relational or NoSQL schemas',
    prompt: 'I am building an application for [Describe the app, e.g., an e-commerce platform].\n\nI need you to design a [Relational (SQL) / NoSQL] database schema for this application.\nPlease include:\n1. A list of the main tables/collections.\n2. The fields/columns for each table, including their data types.\n3. Primary and foreign key relationships (if SQL) or embedding/referencing strategies (if NoSQL).\n4. Any indexes you recommend for performance optimization.\n\nSpecific entities I know I need: [List entities, e.g., Users, Products, Orders]'
  },
  {
    id: 'summarize_doc',
    icon: 'FileText',
    title: 'Summarize Document',
    desc: 'Extract key points and action items',
    prompt: 'Please read the following document and provide a comprehensive summary.\n\nStructure the summary as follows:\n1. A one-paragraph overarching summary (the "TL;DR").\n2. A bulleted list of the 5 most critical points or arguments.\n3. Any action items, next steps, or unresolved questions mentioned in the text.\n\nDocument text:\n\n[Paste your document text here]'
  },
  {
    id: 'brainstorm',
    icon: 'Lightbulb',
    title: 'Brainstorm Ideas',
    desc: 'Generate creative concepts and angles',
    prompt: 'I need to brainstorm ideas for [Project/Campaign/Product].\n\nPlease act as a creative director and provide 10 distinct, out-of-the-box ideas.\nFor each idea, include:\n- A catchy title.\n- A 2-sentence description of the concept.\n- Why it would resonate with [Target Audience].\n\nConstraints: [e.g., Must be low budget, must use AI]'
  },
  {
    id: 'interview_prep',
    icon: 'MessageCircle',
    title: 'Interview Preparation',
    desc: 'Mock interview questions and answers',
    prompt: 'I am preparing for a job interview for the position of [Job Title] at [Company Name or Industry].\n\nPlease act as the hiring manager and provide:\n1. 5 common behavioral questions I should expect.\n2. 5 technical or domain-specific questions.\n3. For each question, provide a brief bulleted guide on what a "stellar" answer looks like.\n\nMy experience level is: [e.g., Entry-level, Senior, 5 years]'
  },
  {
    id: 'marketing_copy',
    icon: 'PenTool',
    title: 'Marketing Copy',
    desc: 'High-converting ad and social copy',
    prompt: 'Write high-converting marketing copy for a new product called [Product Name].\n\nProduct details: [Brief description of what it does and its main benefit].\n\nPlease provide:\n1. 3 variations of a Facebook/Instagram Ad (Primary text, Headline, Description).\n2. 2 variations of a promotional Email (Subject line, Body, CTA).\n3. 5 punchy taglines suitable for a landing page hero section.\n\nTone: [e.g., Urgent, persuasive, friendly]'
  },
  {
    id: 'debug_error',
    icon: 'Code2',
    title: 'Debug an Error',
    desc: 'Analyze stack traces and fix bugs',
    prompt: 'I am encountering an error in my [Language/Framework] application.\n\nHere is the context:\n- What I was trying to do: [Describe intended behavior]\n- What actually happened: [Describe the failure]\n\nPlease analyze the following error message/stack trace and explain exactly what is causing it, then provide the code to fix it.\n\nError/Stack Trace:\n```\n[Paste error here]\n```\n\nRelevant Code:\n```\n[Paste relevant code here]\n```'
  },
  {
    id: 'learn_concept',
    icon: 'Lightbulb',
    title: 'Learn a Concept',
    desc: 'Explain complex topics simply',
    prompt: 'I want to learn about [Concept, e.g., Quantum Computing, React Server Components].\n\nPlease explain it to me using the Feynman Technique (explain it as if I were a 12-year-old).\n\nInclude:\n1. A simple, relatable analogy.\n2. The core mechanism of how it works.\n3. Why it is important or useful in the real world.\n4. A slightly more advanced explanation for once I grasp the basics.'
  },
  {
    id: 'system_architecture',
    icon: 'Database',
    title: 'System Architecture',
    desc: 'Design scalable tech stacks',
    prompt: 'I need to design the high-level system architecture for [Describe the application, e.g., a real-time chat app like Discord].\n\nPlease outline a scalable architecture including:\n1. Frontend technologies and state management.\n2. Backend language, framework, and API design (REST vs GraphQL vs gRPC).\n3. Database choice(s) and caching layer.\n4. Infrastructure, deployment, and scaling strategy (e.g., AWS, Docker, Kubernetes).\n5. How to handle [Specific challenge, e.g., real-time events, high read volume].'
  },
  {
    id: 'draft_email',
    icon: 'MessageCircle',
    title: 'Draft a Professional Email',
    desc: 'Clear, polite, and effective emails',
    prompt: 'I need to send a professional email to [Recipient, e.g., my boss, a client].\n\nThe goal of the email is to: [Describe the goal, e.g., ask for an extension on a deadline, pitch a new service].\n\nPlease write a draft that is:\n- Clear and concise.\n- Polite but firm.\n- Includes a clear call-to-action or next step.\n\nKey points I must include: [List 1-3 key points]'
  }
];

export function getRandomWorkflows(count: number = 4): Workflow[] {
  return WORKFLOWS.slice(0, count);
}
