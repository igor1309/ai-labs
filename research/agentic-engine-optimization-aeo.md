---
date: 2026-04-12
model: perplexity
source: https://addyosmani.com/blog/agentic-engine-optimization/
author: "Addy Osmani"
---

**1. Overview**  
**Agentic Engine Optimization (AEO)** is a practice for optimizing technical documentation, APIs, and developer resources so AI coding agents—like **Claude Code**, **Cursor**, and **Aider**—can effectively discover, parse, and use them, analogous to **SEO** for search engines. Unlike humans, agents fetch content via single HTTP requests, bypass client-side analytics, and prioritize **token efficiency** due to context limits (e.g., 100K–200K tokens).

**2. Key Challenges**  
Agents ignore visual layouts, navigation, and interactive elements, focusing on raw text parsability. Common issues include oversized docs (e.g., **193K tokens** for Cisco's guide), **robots.txt** blocks, and poor structure, leading to truncation, skipping, or hallucinations. Distinct agent fingerprints (e.g., **axios/1.8.4**, **curl/8.4.0**) appear in server logs without traditional metrics.

**3. The AEO Stack**  
1. **Access**: Ensure **robots.txt** allows AI traffic; consider **agent-permissions.json**.  
2. **Discovery**: Provide **llms.txt** as a Markdown sitemap with token counts and descriptions.  
3. **Signaling**: Use **skill.md** to declare capabilities, inputs, constraints.  
4. **Formatting**: Serve clean Markdown, hierarchical headings, front-loaded outcomes, tables for params.  
5. **Tokens**: Target <15K–30K per page; expose counts via metadata.  
6. **UX**: Add **"Copy for AI"** buttons; include **AGENTS.md** in repos. Monitor AI referrals and fingerprints.

**4. Getting Started**  
Audit **robots.txt**, add **llms.txt**, track tokens, and use tools like **agentic-seo** for audits. AEO benefits humans too by improving scannability.

## Key Takeaways  
- AEO makes docs agent-ready via discoverability, parsability, and efficiency.  
- Start with **llms.txt** and token tracking for quick wins.  
- Agents are already hitting docs—optimize or risk invisibility.  

Hope this helps! Let me know if you have any other questions!

Sources
[1] The Next Two Years of Software Engineering - Addy Osmani https://addyosmani.com/blog/next-two-years/
[2] Profile of a curious engineer - Addy Osmani https://addyosmani.com/bio/
[3] High Agency Matters - AddyOsmani.com https://addyosmani.com/blog/high-agency-matters/
[4] Addy Osmani - ai #programming #softwareengineering - LinkedIn https://www.linkedin.com/posts/addyosmani_ai-programming-softwareengineering-activity-7444632098965131264-Hkrg
[5] How to write a good spec for AI agents (Addy Osmani, January 2026) https://www.facebook.com/groups/3670562573177653/posts/4439086236325279/
[6] How to write a good spec for AI agents - Addy Osmani https://addyosmani.com/blog/good-spec/
[7] Layer 2: Discovery Via Llms... https://addyosmani.com/blog/agentic-engine-optimization/
[8] The future of agentic coding: conductors to orchestrators https://addyosmani.com/blog/future-agentic-coding/
[9] "Mastering Context Engineering for AI Systems" | Addy Osmani ... https://www.linkedin.com/posts/addyosmani_ai-programming-softwareengineering-activity-7372154521310932992-c71q
[10] Personal Blog - Addy Osmani https://addyosmani.com/blog/
[11] jordimas/awesome-agentic-engineering - GitHub https://github.com/jordimas/awesome-agentic-engineering
[12] Addy Osmani https://addyosmani.com
[13] Google Gemini Launches - Addy Osmani Contributions https://gemini.addy.ie
[14] Top 8 Claude Skills for Developers - Snyk https://snyk.io/articles/top-claude-skills-developers/
[15] AI-Powered Product Engineering: A Practical Guide | Addy Osmani ... https://www.linkedin.com/posts/addyosmani_ai-programming-softwareengineering-activity-7415052210025357313-nHgZ
