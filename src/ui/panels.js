/* Portfolio panels for Mumbai GP. Personal content comes only from
   window.PORTFOLIO.RESUME (the résumé); landmark notes are short, general facts. */

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function panelContent(id) {
  const R = window.PORTFOLIO.RESUME;
  const E = R.education, C = R.contact;
  const items = list => list.map(x => `<div class="item">${x}</div>`).join('');
  switch (id) {
    case 'villaTheresa': return {
      kicker: 'Landmark · School years', title: E.school.name, meta: `${E.school.place} · ${E.school.when}`, accent: '#7b3ff2',
      html: `
        <div class="stats"><div class="stat"><b>${esc(E.school.score)}</b><span>${esc(E.school.course)}</span></div>
        <div class="stat"><b>2011–2019</b><span>Years at Villa Theresa</span></div></div>
        <p>Rhea completed her ICSE Science (Class 10) here on Peddar Road. The full school story is the K. C. College chapter at Churchgate.</p>
        <p class="note">Building shown is a stylised, game-scale interpretation — not a measured reproduction.</p>`, landmark: true };
    case 'kccollege': return {
      kicker: 'Chapter 2 · School years', title: E.junior.name, meta: `${E.junior.place} · ${E.junior.when}`, accent: '#1f9d55',
      html: `
        <div class="stats"><div class="stat"><b>97.33%</b><span>${esc(E.junior.course)}</span></div>
        <div class="stat"><b>Top 1%</b><span>of students across the board</span></div>
        <div class="stat"><b>${esc(E.school.score)}</b><span>${esc(E.school.course)}</span></div></div>
        <h3>HSC Science</h3><p>${esc(E.junior.course)} at ${esc(E.junior.name)}, Churchgate — ${esc(E.junior.score)}.</p>
        <h3>Before that</h3><p>${esc(E.school.course)} at ${esc(E.school.name)}, ${esc(E.school.place)} (${esc(E.school.when)}) — ${esc(E.school.score)}.</p>
        <p class="note">Building shown is a stylised, game-scale interpretation.</p>` };
    case 'kjsit': return {
      kicker: 'Chapter 3 · Engineering · Finish', title: E.college.name, meta: `${E.college.place} · ${E.college.when}`, accent: '#d9a400', dark: true,
      html: `
        <div class="stats"><div class="stat"><b>9.95</b><span>CGPA</span></div><div class="stat"><b>1st rank</b><span>in college</span></div><div class="stat"><b>B.Tech IT</b><span>2021–2025</span></div></div>
        <h3>Selected projects</h3>
        ${items(R.projects.map(p => `<div class="hd"><b>${esc(p.name)}<span class="tag">${esc(p.tag)}</span></b></div><div>${esc(p.text)}</div>`))}
        <h3>Achievements</h3>
        ${items(R.achievements.filter(a => /Avishkar|CiiA|CodeCheck|1st rank/i.test(a)).map(a => esc(a)))}
        <p class="note">Campus shown is a stylised, game-scale interpretation of the Somaiya Ayurvihar campus off the Eastern Express Highway.</p>`,
      footer: `<a class="btn" href="${C.resume}" download="Rhea-Laloo-Resume.pdf">Download résumé (PDF)</a><a class="btn" href="${C.github}" target="_blank" rel="noopener">GitHub</a>` };
    case 'pitwall': return {
      kicker: 'Chapter 1 · AI engineering', title: `${R.name} — ${R.role}`, meta: `${R.location} · currently at Tata Consultancy Services`, accent: '#d81f26',
      html: `
        <h3>Experience</h3>
        ${items(R.experience.map(x => `<div class="hd"><b>${esc(x.org)} — ${esc(x.role)}</b><span>${esc(x.when)}</span></div><ul>${x.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`))}
        <h3>Featured projects</h3>
        ${items([
          `<div class="hd"><b>chub-guard<span class="tag">AI tooling</span></b></div><div>AI-powered linting tool that flags deprecated and outdated code patterns against documentation indexed in Context Hub; published on PyPI, npm and as a VS Code extension.</div>`,
          `<div class="hd"><b>Log anomaly detection pipeline<span class="tag">ML · Security</span></b></div><div>Autoencoders + Isolation Forest with SHAP explanations, plus LLM-based classification of potential attack types.</div>`,
          ...R.projects.map(p => `<div class="hd"><b>${esc(p.name)}<span class="tag">${esc(p.tag)}</span></b></div><div>${esc(p.text)}</div>`)])}
        <h3>Technical skills</h3>
        ${items(Object.entries(R.skills).map(([k, v]) => `<div class="hd"><b>${esc(k)}</b></div><div>${esc(v)}</div>`))}
        <h3>Certifications & awards</h3>
        ${items(R.achievements.map(a => esc(a)))}
        <h3>Contact</h3>
        <div class="item"><div class="hd"><b>Email</b><span><a href="mailto:${C.email}">${C.email}</a></span></div></div>
        <div class="item"><div class="hd"><b>GitHub</b><span><a href="${C.github}" target="_blank" rel="noopener">${C.githubLabel}</a></span></div></div>
        <div class="item"><div class="hd"><b>LinkedIn</b><span><a href="${C.linkedin}" target="_blank" rel="noopener">${C.linkedinLabel}</a></span></div></div>
        <div class="item"><div class="hd"><b>Phone</b><span>${C.phone}</span></div></div>`,
      footer: `<a class="btn" href="${C.resume}" download="Rhea-Laloo-Resume.pdf">Download résumé (PDF)</a><a class="btn" href="${C.github}" target="_blank" rel="noopener">GitHub</a>` };
    case 'gateway': return landmark('Gateway of India', 'Apollo Bunder, Colaba',
      'A basalt arch on the Apollo Bunder waterfront, completed in 1924 to commemorate the landing of King George V and Queen Mary in 1911. It looks out over Mumbai Harbour, beside the Taj Mahal Palace hotel.');
    case 'marineDrive': return landmark('Marine Drive', 'Netaji Subhash Chandra Bose Road',
      'A seafront boulevard of roughly 3.6 km curving around Back Bay. Its Art Deco buildings are part of the UNESCO World Heritage Site “Victorian Gothic and Art Deco Ensembles of Mumbai” (2018). At night the curve of street lights is called the Queen’s Necklace.');
    case 'chowpatty': return landmark('Girgaum Chowpatty', 'North end of Marine Drive',
      'A city beach at the northern end of Marine Drive, known for its evening street food and for Ganesh Chaturthi immersions.');
    case 'seaLink': return landmark('Bandra–Worli Sea Link', 'Mahim Bay',
      'A cable-stayed bridge across Mahim Bay connecting Bandra and Worli, opened in 2009. Its main towers rise roughly 126 m above the sea. (Shortened for the game.)');
    case 'bandraFort': return landmark('Bandra Fort', 'Castella de Aguada, Land’s End',
      'A watchtower fort built by the Portuguese in 1640 at Land’s End in Bandra, overlooking Mahim Bay and the Arabian Sea.');
    case 'bkc': return landmark('Bandra Kurla Complex', 'BKC',
      'A planned business district developed by the MMRDA on reclaimed land beside the Mithi river, home to offices, banks and consulates.');
    default: return null;
  }
}

function landmark(title, meta, text) {
  return { kicker: 'Landmark discovered', title, meta, accent: '#2a7fd4', html: `<p>${text}</p><p class="note">Recreated as a stylised, game-scale model from public reference — not a measured reproduction.</p>`, landmark: true };
}
