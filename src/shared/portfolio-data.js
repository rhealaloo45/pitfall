/* Shared portfolio content — single source of truth for every page.
   Plain (non-module) script so the classic/portfolio views work even if WebGL or the CDN fails.
   Everything here comes from Rhea Laloo's resume (assets/rhea-laloo-resume.pdf). Do not add
   facts that are not in the resume. */
(function(){

/* =====================================================================
   CONTENT  (resume data — shared by the 3D track and the classic view)
===================================================================== */
const ACCENTS = { about:'#d81f26', experience:'#1f9d55', projects:'#d9a400', education:'#7b3ff2', contact:'#e8e8e8' };

const CONTENT = {
  about: { title:'About', accent:ACCENTS.about, html:`
    <p><b>Rhea Laloo</b> — AI engineer building LLM tooling, anomaly-detection pipelines
    and full-stack apps. 1st rank in college, 9.95 CGPA.</p>
    <h3>Currently</h3>
    <p>AI Engineer at Tata Consultancy Services — a legal RAG assistant, a Claude computer-use agent, a LangGraph
    agent builder, log anomaly detection, and chub-guard, an AI linter on PyPI, npm and VS Code.</p>
    <h3>Based in</h3>
    <p>Mumbai, India.</p>`},
  experience: { title:'Experience', accent:ACCENTS.experience, html:`
    <div class="row"><div><b>Tata Consultancy Services</b><br>AI Engineer — log anomaly detection (Autoencoders + SHAP), LLM attack classification, chub-guard linting tool; mentored 150+ students</div><span>Dec 2025 — now</span></div>
    <div class="row"><div><b>Nareshwadi Learning Centre</b><br>Lead Software Development Intern — React Native cattle-management app (50+ cattle), disease &amp; milk-yield prediction at 94% accuracy</div><span>2024 — 2025</span></div>
    <div class="row"><div><b>AICTE — IBM SkillBuild</b><br>AI Intern — regression model forecasting mental-fitness trends across 15+ countries</div><span>2023</span></div>`},
  projects: { title:'Projects', accent:ACCENTS.projects, html:`
    <div class="row"><div><b>ADHD Detection Model</b><br>NB / SVM / Random Forest on ADHD-200 — 87.2% accuracy</div><span>ML</span></div>
    <div class="row"><div><b>RoadHawk</b><br>IoT pothole detector — Raspberry Pi, CNNs, Google Maps, Django</div><span>IoT</span></div>
    <div class="row"><div><b>SDS Quiz Platform</b><br>200+ questions, student/teacher logins, live results</div><span>Web</span></div>`},
  education: { title:'Education', accent:ACCENTS.education, html:`
    <div class="row"><div><b>B.Tech Information Technology</b><br>K. J. Somaiya Institute of Technology, Mumbai — 9.95 CGPA, 1st rank in college</div><span>2021 — 2025</span></div>
    <div class="row"><div><b>HSC Science</b><br>K. C. College, Mumbai — 97.33%, top 1% across the board</div><span>2019 — 2021</span></div>
    <div class="row"><div><b>ICSE</b><br>Villa Theresa High School, Mumbai — 91.83%</div><span>2019</span></div>`},
  contact: { title:'Contact', accent:ACCENTS.contact, dark:true, html:`
    <div class="row"><div><b>Email</b></div><span><a href="mailto:rhealaloo@gmail.com">rhealaloo@gmail.com</a></span></div>
    <div class="row"><div><b>GitHub</b></div><span><a href="https://github.com/rhealaloo45" target="_blank" rel="noopener">github.com/rhealaloo45</a></span></div>
    <div class="row"><div><b>LinkedIn</b></div><span><a href="https://linkedin.com/in/rhealaloo" target="_blank" rel="noopener">/in/rhealaloo</a></span></div>
`},
};
const SECTION_ORDER = ['about','experience','projects','education','contact'];

const SKILLS = [
  ['Python / Java / JavaScript', 92], ['LangGraph / LLM pipelines', 88], ['Claude · Azure OpenAI · Gemini', 85],
  ['Flask / Django', 82], ['React Native', 78], ['MongoDB · NumPy · Pandas', 80],
];
const MONITOR_TABS = {
  profile:{ label:'Profile', html:`
    <h2>Driver Profile — Race Results</h2>
    <p>Rhea Laloo — AI engineer specialising in LLM tooling and anomaly-detection pipelines.
    9.95 CGPA, 1st rank in college, zero DNFs.</p>
    <table class="f1res">
      <thead><tr><th>Pos</th><th></th><th>Entry</th><th>Stint</th></tr></thead>
      <tbody>
        <tr><td class="pos">1</td><td class="code" style="border-left-color:#d81f26">TCS</td><td><b>Tata Consultancy Services</b><em>AI Engineer — LLM security analysis, chub-guard</em></td><td class="time">2025 — NOW</td></tr>
        <tr><td class="pos">2</td><td class="code" style="border-left-color:#1f3f8f">NLC</td><td><b>Nareshwadi Learning Centre</b><em>Lead Software Development Intern</em></td><td class="time">2024 — 2025</td></tr>
        <tr><td class="pos">3</td><td class="code" style="border-left-color:#d9a400">IBM</td><td><b>AICTE — IBM SkillBuild</b><em>Artificial Intelligence Intern</em></td><td class="time">2023</td></tr>
        <tr><td class="pos">4</td><td class="code" style="border-left-color:#1f9d55">KJS</td><td><b>K. J. Somaiya Institute of Technology</b><em>B.Tech IT — 9.95 CGPA, 1st rank</em></td><td class="time">2021 — 2025</td></tr>
      </tbody>
    </table>
    <h4>Focus</h4><p>AI/LLM pipelines · full-stack apps · IoT.</p>
    <h4>Location</h4><p>Mumbai, India.</p>`},
  career:{ label:'Career', html:`
    <h2>Career History</h2>
    <div class="mrow"><div><b>Tata Consultancy Services</b><em>AI Engineer — log anomaly detection (Autoencoders, Isolation Forest, SHAP); LLM attack classification; chub-guard AI linting tool on PyPI/npm/VS Code; mentored 150+ students</em></div><span>2025 — now</span></div>
    <div class="mrow"><div><b>Nareshwadi Learning Centre</b><em>Lead SW Dev Intern — React Native cattle app for 50+ cattle; disease &amp; milk-yield prediction, 94% accuracy</em></div><span>2024 — 2025</span></div>
    <div class="mrow"><div><b>AICTE — IBM SkillBuild</b><em>AI Intern — regression model forecasting mental-fitness trends across 15+ countries</em></div><span>2023</span></div>`},
  projects:{ label:'Projects', html:`
    <h2>Selected Projects</h2>
    <div class="mrow"><div><b>ADHD Detection Model</b><em>NB / SVM / Random Forest on ADHD-200 — 87.2% accuracy</em></div><span>ML</span></div>
    <div class="mrow"><div><b>RoadHawk</b><em>IoT pothole detector — Raspberry Pi, CNNs, Google Maps, Django</em></div><span>IoT</span></div>
    <div class="mrow"><div><b>SDS Quiz Platform</b><em>200+ questions, student/teacher logins, real-time results</em></div><span>Web</span></div>
    <div class="mrow"><div><b>This site</b><em>Single-file Three.js circuit — you are sitting in it</em></div><span>Vanilla JS</span></div>`},
  skills:{ label:'Skills', html:`<h2>Telemetry — Skills</h2><div id="skillBars"></div>`},
  education:{ label:'Education', html:`
    <h2>Education</h2>
    <div class="mrow"><div><b>B.Tech Information Technology</b><em>K. J. Somaiya Institute of Technology, Mumbai — 9.95 CGPA, 1st rank in college</em></div><span>2021 — 2025</span></div>
    <div class="mrow"><div><b>HSC Science</b><em>K. C. College, Mumbai — 97.33%, top 1% across the board</em></div><span>2019 — 2021</span></div>
    <div class="mrow"><div><b>ICSE</b><em>Villa Theresa High School, Mumbai — 91.83%</em></div><span>2019</span></div>`},
  achievements:{ label:'Achievements', html:`
    <h2>Achievements</h2>
    <div class="mrow"><div><b>Claude Certified Developer</b><em>Anthropic</em></div><span>Cert</span></div>
    <div class="mrow"><div><b>GitHub Copilot, GH-300</b><em>Microsoft</em></div><span>Cert</span></div>
    <div class="mrow"><div><b>Oracle OCI AI Foundations Associate</b><em>Certification</em></div><span>Cert</span></div>
    <div class="mrow"><div><b>CiiA Top 80 in India</b><em>Out of 695 teams — RoadHawk pothole detector, twice</em></div><span>2024 · 25</span></div>
    <div class="mrow"><div><b>Avishkar Research Convention</b><em>Finalist</em></div><span>2024</span></div>
    <div class="mrow"><div><b>CodeCheck — 1st place</b><em>IETE-KJSIT coding competition</em></div><span>Award</span></div>
    <div class="mrow"><div><b>AWS Academy Cloud Web App Builder</b><em>Badge</em></div><span>Badge</span></div>`},
  contact:{ label:'Contact', html:`
    <h2>Radio Check — Contact</h2>
    <div class="mrow"><div><b>Email</b></div><span><a href="mailto:rhealaloo@gmail.com">rhealaloo@gmail.com</a></span></div>
    <div class="mrow"><div><b>GitHub</b></div><span><a href="https://github.com/rhealaloo45" target="_blank" rel="noopener">github.com/rhealaloo45</a></span></div>
    <div class="mrow"><div><b>LinkedIn</b></div><span><a href="https://linkedin.com/in/rhealaloo" target="_blank" rel="noopener">/in/rhealaloo</a></span></div>
    <h4>Availability</h4><p>Open to AI/ML engineering roles and interesting collaborations.</p>`},
};

window.PORTFOLIO={ACCENTS,CONTENT,SECTION_ORDER,SKILLS,MONITOR_TABS};

/* Structured resume — used by Mumbai GP and the portfolio page. */
const RESUME = {
  name:'Rhea Laloo', role:'AI Engineer', location:'Mumbai, India',
  tagline:'I build AI that notices what\'s wrong (in logs, in code, on roads) and agents that act on it.',
  contact:{ email:'rhealaloo@gmail.com', website:'https://rhealaloo.com',
    github:'https://github.com/rhealaloo45', githubLabel:'github.com/rhealaloo45',
    linkedin:'https://linkedin.com/in/rhealaloo', linkedinLabel:'/in/rhealaloo',
    resume:'assets/rhea-laloo-resume.pdf' },
  // chub-guard, as published: the setup package on npm and PyPI, the VS Code extension and the source
  chubGuard:{ npm:'https://www.npmjs.com/package/chub-guard-init', pypi:'https://pypi.org/project/chub-guard-init/',
    vscode:'https://marketplace.visualstudio.com/items?itemName=rhealaloo.chub-guard', github:'https://github.com/rhealaloo45/chub-guard', install:'npx chub-guard-init' },
  // the GitHub section: the contribution graph, plus only these repos (chosen, never "latest", so nothing private-ish shows up)
  github:{ user:'rhealaloo45', featured:['Legal-Wiki-RAG', 'roscoe', 'chub-guard', 'anomoly-pipeline', 'pitfall', 'adhd-detection'] },
  experience:[
    { id:'tcs', org:'Tata Consultancy Services', role:'AI Engineer', when:'Dec 2025 — Present', points:[
      'Built and evaluated a legal knowledge assistant (proof of concept) on Flask + Azure OpenAI, with Ask, Review, Compare and Draft modes over interrelated legal documents; tested on up to 1,500 documents.',
      'Cross-document answers from hybrid BM25 + semantic search (SentenceTransformer embeddings) with grounding checks against hallucination; BM25 shortlisting and page caps cut the cost per query.',
      'Building a Claude computer-use agent that benchmarks brands against competitors across the marketing funnel, taking it from a Claude skills prototype to a standalone Claude API app with a custom control loop, custom tools and step and cost limits.',
      'Built a low-code agent-creation accelerator on LangGraph with multi-provider model support.',
      'Built an end-to-end log anomaly detection pipeline (Autoencoders, Isolation Forest) with SHAP root-cause analysis, anomaly clustering and LLM-based attack-type classification.',
      'Built chub-guard, an AI-powered linter that flags deprecated code against documentation indexed in Context Hub; published on PyPI, npm and the VS Code Marketplace, with 4,900+ downloads.',
      'Mentored 150+ students across Coimbatore, Lucknow, Chennai, Mumbai and more and at the IndiaAI Impact Summit, plus company secretaries, and HR leaders at the Top Employer Summit.'],
      // the landing page shows the TCS work as small project cards, each with its stack
      work:[
        { id:'rag', name:'Legal knowledge assistant', tag:'RAG · proof of concept', text:'Ask, review, compare and draft across interrelated legal documents. Hybrid BM25 + semantic search finds the clauses that matter, grounding checks catch answers the documents don\'t support, and BM25 shortlisting with page caps cuts the cost per query. Tested on up to 1,500 documents.', stack:['Flask', 'Azure OpenAI', 'RAG', 'Hybrid Search', 'Embeddings'], repo:'Legal-Wiki-RAG' },
        { id:'brand-agent', name:'Brand benchmarking agent', tag:'Agents · in progress', text:'Claude computer use that benchmarks brands against their competitors across the marketing funnel. It grew from a Claude skills prototype into a standalone app: a custom control loop on Anthropic\'s Python SDK, its own tools (open URL, save findings, record page, report blocked) and step and cost limits.', stack:['Anthropic Claude API', 'Computer Use', 'Python'] },
        { id:'chub-guard', name:'chub-guard', tag:'Published · 4,900+ downloads', text:'An AI-powered linter that flags deprecated and outdated code against documentation indexed in Context Hub.', stack:['Python', 'AST analysis', 'Context Hub', 'PyPI', 'npm', 'VS Code'], links:'chubGuard', tryIt:true, caseStudy:true },
        { id:'agent-kit', name:'Low-code agent builder', tag:'Agents · accelerator', text:'An accelerator for creating agents with little code, built on LangGraph, with support for models from multiple providers.', stack:['LangGraph', 'LLMs'], repo:'roscoe' },
        { id:'logs', name:'Log anomaly detection', tag:'Security', text:'An end-to-end pipeline: Autoencoders and Isolation Forest find what\'s abnormal, SHAP explains the root cause, and anomalies are clustered and classified by attack type with an LLM.', stack:['Autoencoders', 'Isolation Forest', 'SHAP', 'LLMs'], repo:'anomoly-pipeline', more:[{ label:'Model notebooks', icon:'GitHub', url:'https://github.com/rhealaloo45/Anomaly-detection-tool' }] },
      ],
      short:['Mentored 150+ students across Coimbatore, Lucknow, Chennai, Mumbai and more and at the IndiaAI Impact Summit, plus company secretaries, and HR leaders at the Top Employer Summit']},
    { id:'nareshwadi', org:'Nareshwadi Learning Centre', role:'Lead Software Development Intern', when:'Jun 2024 — Jun 2025', points:[
      'Developed and deployed a full-stack React Native cattle management app for 50+ cattle: lifecycle tracking, offline milk entry, alerts, and 7-day milk production analysis and reports.',
      'Built a module to predict cattle diseases and milk-yield trends using Random Forest with 94% accuracy, based on the past 10 days of milk-yield data.',
      'Ran 3+ rounds of user testing with farm staff to gather requirements and improve usability.'],
      short:['Shipped a React Native app managing 50+ cattle: lifecycle tracking, offline milk entry, alerts', 'Disease and milk-yield prediction from the last 10 days of milk records: Random Forest, 94% accuracy', 'Seven-day milk production analysis and reports', 'Requirements and usability from 3+ rounds of testing with farm staff'], stack:['React Native', 'Random Forest'],
      more:[{ label:'Demo video', icon:'Demo video', url:'https://drive.google.com/file/d/11BQ3Qv-VxpQNHI4r4o9K69amzxmMTIhk/view' }, { label:'Milk-yield predictor', icon:'GitHub', url:'https://github.com/rhealaloo45/milk_prod' }, { label:'Analytics web app', icon:'GitHub', url:'https://github.com/rhealaloo45/nareshwadi-web' }]},
    { id:'ibm', org:'AICTE — IBM SkillBuild', role:'Artificial Intelligence Intern', when:'May 2023 — Jul 2023', points:[
      'Built regression models forecasting yearly mental-fitness rates across 15+ countries, trained on 20+ years of historical data.'],
      short:['Forecast mental-fitness trends across 15+ countries', 'Trained on 20+ years of historical data', 'Regression models predicting the yearly rate'], stack:['Regression'],
      more:[{ label:'Code on GitHub', icon:'GitHub', url:'https://github.com/rhealaloo45/mental-fitness-tracker-project' }, { label:'Certificate', icon:'Certificate', url:'https://drive.google.com/file/d/13Mco3W0I4dmLcYATuKPSN9OKEgVEXstt/view' }]},
  ],
  projects:[
    { name:'Pitwall — 3D portfolio (rhealaloo.com)', tag:'Three.js', text:'A real-time 3D portfolio where visitors drive a car through the site\'s sections, built in Three.js and JavaScript.', stack:['Three.js', 'JavaScript', 'HTML', 'CSS'], repo:'pitfall' },
    { name:'ADHD Detection Model', tag:'ML', text:'ADHD detection using Naive Bayes, SVM and Random Forest on the ADHD-200 dataset. Random Forest achieved over 87.2% accuracy.', stack:['Python', 'NumPy', 'Pandas', 'Random Forest', 'SVM', 'Naive Bayes'], repo:'adhd-detection', story:'patterns' },
    { name:'RoadHawk — IoT Pothole Detector', story:'roadhawk', tag:'IoT', text:'A Raspberry Pi with three sensors and a camera; a CNN detects potholes, and a Django API gives government authorities the data, with locations on Google Maps.', stack:['Raspberry Pi', 'CNNs', 'Sensors', 'Python', 'Django', 'Google Maps'], repo:'RoadHawk' },
    { name:'SDS — Online Quiz Website', tag:'Web', text:'An online quiz platform with a built-in bank of 190+ questions, separate student and teacher logins (login time halved), scheduling and real-time results.', stack:['Django', 'Python', 'HTML', 'CSS', 'JavaScript', 'SQLite'], repo:'SDS-Quiz-Management-', print:false },
  ],
  // the landing page's story: what each project taught a machine to notice — condensed from the entries above;
  // in the order the landing page's drive reaches them: road, cows, crossing, then at my desk the legal assistant,
  // chub-guard, the agents and the attack. Each card is a hook: `at` is where on the drive it appears, `detail`
  // points at the fuller entry under Experience.
  stories:[
    { id:'roadhawk', at:0.215, tag:'RoadHawk · IoT', title:'Potholes, spotted and mapped.', text:'Three sensors and a camera on a Raspberry Pi feed a CNN that spots potholes, and a Django API maps each one for the people who fix roads.', chips:['CiiA Top 80 of 695 teams, 2024 and 2025'], stack:['Raspberry Pi', 'CNNs', 'Sensors', 'Python', 'Django', 'Google Maps'], repo:'RoadHawk',
      more:[{ label:'Demo video', icon:'Demo video', url:'https://drive.google.com/file/d/14mTErMcbRGTTpAV6_aSqs2bI6zx26nnG/view' }] },
    { id:'cattle', at:0.385, right:true, tag:'Nareshwadi Learning Centre · Mobile + ML', title:'Disease in a herd, predicted.', text:'A React Native app running a farm\'s 50+ cattle, with a Random Forest that predicts disease and milk-yield trends from the last 10 days of milk records.', chips:['94% accuracy', 'Deployed · 50+ cattle', 'Avishkar 2024 state finalist'], stack:['React Native', 'Random Forest'], detail:'role:nareshwadi',
      more:[{ label:'Demo video', icon:'Demo video', url:'https://drive.google.com/file/d/11BQ3Qv-VxpQNHI4r4o9K69amzxmMTIhk/view' }, { label:'Milk-yield predictor', icon:'GitHub', url:'https://github.com/rhealaloo45/milk_prod' }, { label:'Analytics web app', icon:'GitHub', url:'https://github.com/rhealaloo45/nareshwadi-web' }] },
    { id:'patterns', at:0.56, tag:'Research · ML', title:'Patterns in people.', text:'ADHD detection on the ADHD-200 dataset, where Random Forest beat SVM and Naive Bayes; and at IBM SkillBuild, regression models forecasting mental-fitness trends across 15+ countries.', chips:['87.2% · ADHD-200', '15+ countries · 20+ years of data'], stack:['Python', 'NumPy', 'Pandas', 'Random Forest', 'SVM', 'Naive Bayes', 'Regression'],
      more:[{ label:'ADHD model', icon:'GitHub', url:'https://github.com/rhealaloo45/adhd-detection' }, { label:'Mental-fitness model', icon:'GitHub', url:'https://github.com/rhealaloo45/mental-fitness-tracker-project' }, { label:'IBM certificate', icon:'Certificate', url:'https://drive.google.com/file/d/13Mco3W0I4dmLcYATuKPSN9OKEgVEXstt/view' }] },
    { id:'rag', at:0.775, tag:'LLM systems · RAG', title:'The right clause, found and grounded.', text:'A retrieval-augmented assistant for a library of interrelated legal documents: hybrid search finds the clauses that matter, and grounding checks keep its answers honest.', chips:['Hybrid BM25 + semantic search', 'Tested on up to 1,500 documents'], stack:['Azure OpenAI', 'Flask', 'RAG', 'Hybrid Search', 'Embeddings'], repo:'Legal-Wiki-RAG', detail:'work:rag' },
    { id:'chub-guard', at:0.822, tag:'LLM tooling', title:'Outdated code, before it ships.', text:'An AI linter that checks your code against current documentation and flags deprecated APIs before they ship.', chips:['4,900+ downloads', 'Live on PyPI · npm · VS Code'], stack:['Python', 'AST analysis', 'Context Hub'], links:'chubGuard', tryIt:true, caseStudy:true, detail:'work:chub-guard' },
    { id:'brand-agent', at:0.866, tag:'Agents · computer use', title:'An agent that works the web.', text:'A Claude computer-use agent that benchmarks brands against their competitors across the marketing funnel. It runs on a control loop I wrote, with its own tools (open a page, record it, save findings, report a block) and hard step and cost limits.', chips:['Claude computer use', 'Step and cost limits'], stack:['Anthropic Claude API', 'Computer Use', 'Python'], detail:'work:brand-agent' },
    { id:'agent-kit', at:0.912, tag:'Agents · low-code', title:'Agents without the plumbing.', text:'A builder for new agents: choose a model provider, tools and memory in one config or a visual workflow, and switch providers by editing a line, never the code. Built on LangGraph.', chips:['Low-code', 'Any model provider'], stack:['LangGraph', 'LLMs', 'Python'], repo:'roscoe', detail:'work:agent-kit' },
    { id:'logs', at:0.962, tag:'Security', title:'Attacks hiding in system logs.', text:'Autoencoders and Isolation Forest find what\'s abnormal in system logs, SHAP explains why, and an LLM names the likely attack.', chips:['End to end, logs to insight'], stack:['Autoencoders', 'Isolation Forest', 'SHAP', 'Clustering', 'LLMs'], repo:'anomoly-pipeline', detail:'work:logs', more:[{ label:'Model notebooks', icon:'GitHub', url:'https://github.com/rhealaloo45/Anomaly-detection-tool' }] },
  ],
  // where people skim (quick view, the command menu): strongest work first; the drive keeps its own order, set by its scenes
  showcase:['rag', 'chub-guard', 'brand-agent', 'agent-kit', 'logs', 'roadhawk', 'cattle', 'patterns'],
  education:{
    school:{ name:'Villa Theresa High School', place:'Peddar Road, Mumbai', course:'ICSE Science (Class 10)', score:'91.83%', when:'Jun 2011 — May 2019' },
    junior:{ name:'K. C. College', place:'Churchgate, Mumbai', course:'HSC Science (Class 12)', score:'97.33% — among the top 1% of students across the board', when:'Aug 2019 — Jul 2021' },
    college:{ name:'K. J. Somaiya Institute of Technology', place:'Sion, Mumbai', course:'B.Tech in Information Technology', score:'CGPA 9.95 — secured 1st rank in college', when:'Dec 2021 — May 2025' },
  },
  achievements:[
    'Claude Certified Developer (Anthropic).',
    'Gemini Enterprise certifications (Google): Agent Development, and Deployment Specialist.',
    'GitHub Copilot certification, GH-300 (Microsoft).',
    'Oracle Cloud Infrastructure AI Foundations Associate certification.',
    'Finalist at Avishkar Research Convention 2024: cleared the zonal round and reached the state-level finals with a research project on cattle management.',
    'Selected for CiiA 2024 and 2025 Top 80 in India out of 695 teams for an IoT-based pothole detection system.',
    'Earned the AWS Academy Cloud Web Application Builder Badge.',
    'Won 1st place in the CodeCheck coding competition held by IETE-KJSIT.',
    'Secured 1st rank in engineering studies.'],
  // links that back up an achievement (matched by a word in it)
  proof:[{ match:'CiiA', label:'Certificate', url:'https://drive.google.com/file/d/1jOcSktICg64vwGLUw9KPbsqHDvXnFt47/view' }, { match:'AWS Academy', label:'Badge', url:'https://drive.google.com/file/d/1PptPlz9ts20Pdt0tPsSvwtjvmoPlAOU8/view' }],
  campus:[
    { role:'Technical team, IEEE KJSIT', when:'Aug 2023 — May 2024', text:'Led the IEEE KJSIT website build and volunteered 20+ hours', url:'https://rhealaloo45.github.io/IEEE-web/' },
    { role:'Joint Public Relations Officer, IEEE WIE KJSIT', when:'Aug 2023 — May 2024' }],
  skills:{
    'AI / LLM':'Generative AI, LLMs, RAG, Hybrid Search, Embeddings, Vector Databases, Prompt Engineering, LLM Evaluation, Anthropic Claude API, Computer Use, Azure OpenAI, Gemini',
    'Machine learning':'Autoencoders, Isolation Forest, Random Forest, SHAP, CNNs',
    'Frameworks':'LangGraph, LangChain, Flask, Django, React Native, Bootstrap',
    'Languages':'Python, Java, JavaScript, HTML, CSS',
    'Tools':'Git, GitHub, Claude Code, GitHub Copilot, MongoDB, NumPy, Pandas' },
};

window.PORTFOLIO={ACCENTS,CONTENT,SECTION_ORDER,SKILLS,MONITOR_TABS,RESUME};
})();
