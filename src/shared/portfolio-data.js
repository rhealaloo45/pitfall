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
    <p>AI Engineer at Tata Consultancy Services — log anomaly detection, LLM-based security analysis,
    and chub-guard, an AI linting tool published on PyPI, npm and VS Code.</p>
    <h3>Based in</h3>
    <p>Mumbai, India.</p>`},
  experience: { title:'Experience', accent:ACCENTS.experience, html:`
    <div class="row"><div><b>Tata Consultancy Services</b><br>AI Engineer — log anomaly detection (Autoencoders + SHAP), LLM attack classification, chub-guard linting tool; mentored 150+ students</div><span>Dec 2025 — now</span></div>
    <div class="row"><div><b>Nareshwadi Learning Centre</b><br>Lead Software Development Intern — React Native cattle-management app (50+ cattle), disease &amp; milk-yield prediction at 94% accuracy</div><span>2024 — 2025</span></div>
    <div class="row"><div><b>AICTE — IBM SkillBuild</b><br>AI Intern — mental-fitness trend model across 15+ countries, 98% accuracy</div><span>2023</span></div>`},
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
    <div class="row"><div><b>Phone</b></div><span>+91 97695 14152</span></div>`},
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
    <div class="mrow"><div><b>AICTE — IBM SkillBuild</b><em>AI Intern — mental-fitness model across 15+ countries, 98% accuracy</em></div><span>2023</span></div>`},
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
    <div class="mrow"><div><b>Phone</b></div><span>+91 97695 14152</span></div>
    <h4>Availability</h4><p>Open to AI/ML engineering roles and interesting collaborations.</p>`},
};

window.PORTFOLIO={ACCENTS,CONTENT,SECTION_ORDER,SKILLS,MONITOR_TABS};

/* Structured resume — used by Mumbai GP and the portfolio page. */
const RESUME = {
  name:'Rhea Laloo', role:'AI Engineer', location:'Mumbai, India',
  contact:{ email:'rhealaloo@gmail.com', phone:'+91 97695 14152', website:'https://rhealaloo.com',
    github:'https://github.com/rhealaloo45', githubLabel:'github.com/rhealaloo45',
    linkedin:'https://linkedin.com/in/rhealaloo', linkedinLabel:'/in/rhealaloo',
    resume:'assets/rhea-laloo-resume.pdf' },
  experience:[
    { org:'Tata Consultancy Services', role:'AI Engineer', when:'Dec 2025 — Present', points:[
      'Built an end-to-end log anomaly detection pipeline with Autoencoders and Isolation Forest, using SHAP for root-cause analysis; clustered anomalies and added LLM-based attack-type classification to generate actionable security insights.',
      'Built chub-guard, an AI-powered linter that flags deprecated and outdated code against documentation indexed in Context Hub; published on PyPI, npm and VS Code Marketplace.',
      'Mentored 150+ students across Coimbatore, Lucknow, Chennai, Mumbai and more and at the IndiaAI Impact Summit, plus professionals: company secretaries, and HR leaders at the Top Employer Summit.'],
      // the landing page shows the TCS work as small project cards, each with its stack
      work:[
        { name:'Log anomaly detection', tag:'Security', text:'An end-to-end pipeline: Autoencoders and Isolation Forest find what\'s abnormal, SHAP explains the root cause, and anomalies are clustered and classified by attack type with an LLM.', stack:['Autoencoders', 'Isolation Forest', 'SHAP', 'LLMs'] },
        { name:'chub-guard', tag:'Published', text:'An AI-powered linter that flags deprecated and outdated code against documentation indexed in Context Hub.', stack:['LLMs', 'Context Hub', 'PyPI', 'npm', 'VS Code'] },
      ],
      short:['Mentored 150+ students across Coimbatore, Lucknow, Chennai, Mumbai and more and at the IndiaAI Impact Summit, plus company secretaries, and HR leaders at the Top Employer Summit']},
    { org:'Nareshwadi Learning Centre', role:'Lead Software Development Intern', when:'Jun 2024 — Jun 2025', points:[
      'Developed and deployed a full-stack React Native cattle management app to manage 50+ cattle, including lifecycle tracking, offline milk entry and alert systems.',
      'Implemented analysis and report generation, including milk production analysis over the last 7 days.',
      'Built a module to predict cattle diseases and milk-yield trends using Random Forest with 94% accuracy.',
      'Ran multiple rounds of user testing with farm staff to gather requirements and improve usability.'],
      short:['Shipped a React Native app managing 50+ cattle: lifecycle tracking, offline milk entry, alerts', 'Disease and milk-yield prediction with Random Forest, 94% accuracy', 'Seven-day milk production analysis and reports', 'Requirements and usability from rounds of testing with farm staff'], stack:['React Native', 'Random Forest']},
    { org:'AICTE — IBM SkillBuild', role:'Artificial Intelligence Intern', when:'May 2023 — Jul 2023', points:[
      'Built an AI model to monitor mental fitness trends across 15+ countries.',
      'Trained on 20+ years of historical data to forecast future mental fitness rates.',
      'Achieved 98% accuracy using regression algorithms.'],
      short:['Forecast mental-fitness trends across 15+ countries', 'Trained on 20+ years of historical data', '98% accuracy with regression models'], stack:['Regression']},
  ],
  projects:[
    { name:'Pitwall — 3D portfolio (rhealaloo.com)', tag:'Three.js', text:'A real-time 3D portfolio where visitors drive a car through the site\'s sections, built in Three.js and JavaScript.' },
    { name:'ADHD Detection Model', tag:'ML', text:'ADHD detection using Naive Bayes, SVM and Random Forest on the ADHD-200 dataset. Random Forest achieved over 87.2% accuracy.' },
    { name:'RoadHawk — IoT Pothole Detector', tag:'IoT', text:'Raspberry Pi based pothole detection system using CNNs, sensors and Google Maps integration with a Django backend.' },
    { name:'SDS — Online Quiz Website', tag:'Web', text:'Online quiz platform with 200+ questions, separate student/teacher logins, scheduling and real-time results.' },
  ],
  // the landing page's story: what each project taught a machine to notice — condensed from the entries above;
  // in the order the landing page's drive reaches them: road, cows, crossing, my desk, the attack on it
  stories:[
    { tag:'RoadHawk · IoT', title:'Potholes, spotted and mapped.', text:'A CNN spots potholes from a Raspberry Pi\'s camera and sensors, and a Django backend pins each one on Google Maps, so the worst stretches of road show up on a map instead of under a wheel.', chips:['CiiA Top 80 of 695 teams, 2024 and 2025'], stack:['Raspberry Pi', 'CNNs', 'Sensors', 'Django', 'Google Maps'] },
    { tag:'Nareshwadi Learning Centre · Mobile + ML', title:'Disease in a herd, predicted.', text:'A full-stack React Native app, deployed for a farm managing 50+ cattle: lifecycle tracking, offline milk entry, alerts and 7-day milk production reports, plus a Random Forest that flags disease and milk-yield trends. Shaped by rounds of testing with the farm staff.', chips:['94% accuracy', 'Deployed · 50+ cattle'], stack:['React Native', 'Random Forest'] },
    { tag:'Research · ML', title:'Patterns in people.', text:'ADHD detection on the ADHD-200 dataset, where Random Forest came out ahead of SVM and Naive Bayes. And at IBM SkillBuild, a regression model forecasting mental-fitness trends across 15+ countries from 20+ years of data.', chips:['87.2% · ADHD-200', '98% · 15+ countries'], stack:['Random Forest', 'SVM', 'Naive Bayes', 'Regression'] },
    { tag:'LLM tooling', title:'Outdated code, before it ships.', text:'chub-guard checks code against up-to-date documentation indexed in Context Hub and flags deprecated APIs and outdated patterns. Published on PyPI, npm and the VS Code Marketplace.', chips:['Live on PyPI · npm · VS Code'], stack:['LLMs', 'Context Hub'] },
    { tag:'Security', title:'Attacks hiding in system logs.', text:'Autoencoders and Isolation Forest find what\'s abnormal in large-scale system logs and SHAP explains the root cause. The anomalies are clustered and an LLM classifies the likely attack, turning them into insights a security team can act on.', chips:['End to end, logs to insight'], stack:['Autoencoders', 'Isolation Forest', 'SHAP', 'Clustering', 'LLMs'] },
  ],
  // the card when the drive reaches my room (from Rhea's own desk photo)
  desk:{ tag:'Home · my desk', title:'Where the work happens.', text:'A curved ultrawide with a race car for a wallpaper, a smaller one parked under it, and a pinboard that\'s half timetable, half memories. The window is the one thing that isn\'t real yet: it\'s the view I want from my own place one day.', chips:['eat · sleep · code', 'Formula 1 fan', 'Mumbai'] },
  education:{
    school:{ name:'Villa Theresa High School', place:'Peddar Road, Mumbai', course:'ICSE Science (Class 10)', score:'91.83%', when:'Jun 2011 — May 2019' },
    junior:{ name:'K. C. College', place:'Churchgate, Mumbai', course:'HSC Science (Class 12)', score:'97.33% — among the top 1% of students across the board', when:'Aug 2019 — Jul 2021' },
    college:{ name:'K. J. Somaiya Institute of Technology', place:'Sion, Mumbai', course:'B.Tech in Information Technology', score:'CGPA 9.95 — secured 1st rank in college', when:'Dec 2021 — May 2025' },
  },
  achievements:[
    'Claude Certified Developer (Anthropic).',
    'GitHub Copilot certification, GH-300 (Microsoft).',
    'Oracle Cloud Infrastructure AI Foundations Associate certification.',
    'Finalist at Avishkar Research Convention 2024.',
    'Selected for CiiA 2024 and 2025 Top 80 in India out of 695 teams for an IoT-based pothole detection system.',
    'Earned the AWS Academy Cloud Web Application Builder Badge.',
    'Won 1st place in the CodeCheck coding competition held by IETE-KJSIT.',
    'Secured 1st rank in engineering studies.'],
  skills:{
    'AI / LLM':'Generative AI, LLMs, RAG, Hybrid Search, Embeddings, Vector Databases, Prompt Engineering, LLM Evaluation, Anthropic Claude API, Computer Use, Azure OpenAI, Gemini',
    'Machine learning':'Autoencoders, Isolation Forest, Random Forest, SHAP, CNNs',
    'Frameworks':'LangGraph, LangChain, Flask, Django, React Native, Bootstrap',
    'Languages':'Python, Java, JavaScript, HTML, CSS',
    'Tools':'Git, GitHub, Claude Code, GitHub Copilot, MongoDB, NumPy, Pandas' },
};

window.PORTFOLIO={ACCENTS,CONTENT,SECTION_ORDER,SKILLS,MONITOR_TABS,RESUME};
})();
