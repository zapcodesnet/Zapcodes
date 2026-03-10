/**
 * ZapCodes Pre-Built Template Matching Engine
 * Location: services/prebuiltTemplates.js
 * 
 * The user never sees templates. They just type a prompt.
 * This engine:
 *  1. Analyzes the prompt to detect industry, style, features, colors
 *  2. Scores all 10 templates and picks the best match
 *  3. Loads the template HTML
 *  4. Builds a customization prompt that tells the AI to modify (not generate from scratch)
 *  5. Identifies missing features so the AI generates and injects them
 */

const fs = require('fs');
const path = require('path');

// ══════════ TEMPLATE METADATA ══════════
const TEMPLATE_INDEX = [
  {
    id: 'prebuilt-restaurant', file: '01-restaurant.html',
    industry: ['restaurant','food','dining','cafe','bar','bakery','catering','pizza','sushi','bistro','carinderia','grill','ramen','buffet','diner','pub','brewery','taco','bbq','seafood','steakhouse','noodle','dessert','ice cream','juice','milk tea','coffee shop'],
    style: ['dark','elegant','luxury','sophisticated','warm','classy','moody'],
    features: ['nav','hero','about','menu-tabs','gallery-lightbox','reservation-form','testimonial-slider','stat-counters','contact-info','social-links','footer','back-to-top','mobile-menu','smooth-scroll'],
    colorScheme: 'dark', primaryColor: '#D4A574',
  },
  {
    id: 'prebuilt-ecommerce', file: '02-ecommerce.html',
    industry: ['ecommerce','shop','store','retail','fashion','electronics','marketplace','boutique','wholesale','clothing','shoes','accessories','gadgets','jewelry','cosmetics','toys','furniture','grocery','pet shop','hardware','online store','product'],
    style: ['modern','clean','light','professional','minimal','sleek'],
    features: ['nav','hero','search-bar','categories','product-grid','product-filter','product-sort','shopping-cart','cart-sidebar','quick-view-modal','add-to-cart','checkout','newsletter','features-bar','footer','mobile-menu'],
    colorScheme: 'light', primaryColor: '#e85d04',
  },
  {
    id: 'prebuilt-portfolio', file: '03-portfolio-agency.html',
    industry: ['agency','portfolio','creative','design','freelancer','photographer','developer','consultant','studio','architect','artist','graphic','motion','branding','marketing agency','digital agency','web agency'],
    style: ['bold','dark','creative','modern','tech','neon','edgy'],
    features: ['nav','hero','stat-counters','services-grid','portfolio-filter','project-gallery','testimonials','contact-form','social-links','footer','mobile-menu'],
    colorScheme: 'dark', primaryColor: '#00ff88',
  },
  {
    id: 'prebuilt-saas', file: '04-saas-startup.html',
    industry: ['saas','startup','tech','software','app','platform','tool','product','fintech','ai','analytics','crm','erp','automation','cloud','devtool','api','dashboard product'],
    style: ['modern','clean','light','professional','tech','minimal','corporate','gradient'],
    features: ['nav','hero','brand-logos','features-grid','pricing-toggle','pricing-cards','faq-accordion','cta-section','newsletter','footer','mobile-menu'],
    colorScheme: 'light', primaryColor: '#6366f1',
  },
  {
    id: 'prebuilt-realestate', file: '05-real-estate.html',
    industry: ['real estate','property','housing','apartment','condo','rental','broker','agent','realty','villa','land','mortgage','home','house','lot','townhouse','subdivision'],
    style: ['professional','clean','light','trustworthy','corporate','formal'],
    features: ['nav','hero','property-search','property-filter','property-cards','favorites','mortgage-calculator','stat-bar','contact-form','footer','mobile-menu'],
    colorScheme: 'light', primaryColor: '#e8a838',
  },
  {
    id: 'prebuilt-fitness', file: '06-fitness-gym.html',
    industry: ['fitness','gym','sports','yoga','crossfit','boxing','martial arts','personal trainer','wellness','pilates','dance','zumba','swimming','athletic','workout'],
    style: ['energetic','bold','dark','powerful','dynamic','intense','aggressive'],
    features: ['nav','hero','class-cards','class-schedule','pricing-cards','bmi-calculator','contact-form','stat-counters','footer','mobile-menu'],
    colorScheme: 'dark', primaryColor: '#e53e3e',
  },
  {
    id: 'prebuilt-medical', file: '07-medical-dental.html',
    industry: ['medical','dental','clinic','hospital','doctor','healthcare','pharmacy','therapy','veterinary','dermatology','optometry','pediatric','chiropractic','mental health','nursing','laboratory'],
    style: ['clean','trustworthy','light','professional','calming','sterile','caring'],
    features: ['nav','hero','emergency-bar','services-grid','doctor-profiles','appointment-form','stat-bar','testimonials','footer','mobile-menu'],
    colorScheme: 'light', primaryColor: '#0ea5e9',
  },
  {
    id: 'prebuilt-salon', file: '08-salon-beauty.html',
    industry: ['salon','beauty','spa','hair','nails','makeup','skincare','barbershop','aesthetics','massage','waxing','lash','brow','facial','manicure','pedicure','tattoo'],
    style: ['elegant','soft','feminine','warm','luxury','pastel','romantic','chic'],
    features: ['nav','hero','service-menu','service-pricing','team-profiles','gallery-grid','booking-form','testimonials','footer','mobile-menu'],
    colorScheme: 'light', primaryColor: '#c77dba',
  },
  {
    id: 'prebuilt-construction', file: '09-construction.html',
    industry: ['construction','builder','contractor','renovation','plumbing','electrical','roofing','landscaping','handyman','cleaning','painting','hvac','auto repair','mechanic','welding','carpentry','masonry','demolition','pest control','locksmith','moving','trucking'],
    style: ['strong','industrial','dark','bold','professional','rugged','masculine'],
    features: ['nav','hero','services-grid','project-gallery','stat-bar','quote-form','testimonials','footer','mobile-menu'],
    colorScheme: 'dark', primaryColor: '#f59e0b',
  },
  {
    id: 'prebuilt-blog', file: '10-blog-personal.html',
    industry: ['blog','personal','writer','journalist','content','magazine','news','podcast','vlog','travel blog','recipe','tutorial','review','diary','portfolio blog','lifestyle','photography blog'],
    style: ['minimal','clean','light','editorial','readable','simple','elegant'],
    features: ['nav','hero','category-filter','search','post-cards','post-reading-view','comment-system','newsletter','footer','mobile-menu'],
    colorScheme: 'light', primaryColor: '#2563eb',
  },
];

// ══════════ FEATURE KEYWORDS MAP ══════════
const FEATURE_KEYWORDS = {
  'cart': 'shopping-cart', 'shopping': 'shopping-cart', 'buy': 'add-to-cart', 'purchase': 'checkout',
  'order': 'shopping-cart', 'payment': 'checkout', 'pay': 'checkout', 'stripe': 'checkout',
  'book': 'booking-form', 'appointment': 'appointment-form', 'reserve': 'reservation-form',
  'schedule': 'class-schedule', 'timetable': 'class-schedule', 'calendar': 'class-schedule',
  'gallery': 'gallery-lightbox', 'photo': 'gallery-grid', 'image': 'gallery-grid',
  'portfolio': 'portfolio-filter', 'project': 'project-gallery', 'showcase': 'project-gallery',
  'blog': 'post-cards', 'article': 'post-reading-view', 'comment': 'comment-system',
  'price': 'pricing-cards', 'pricing': 'pricing-cards', 'plan': 'pricing-toggle',
  'subscribe': 'newsletter', 'newsletter': 'newsletter', 'email signup': 'newsletter',
  'contact': 'contact-form', 'inquiry': 'contact-form', 'message': 'contact-form',
  'search': 'search-bar', 'filter': 'product-filter', 'sort': 'product-sort',
  'team': 'team-profiles', 'doctor': 'doctor-profiles', 'staff': 'team-profiles',
  'menu': 'menu-tabs', 'food menu': 'menu-tabs', 'dish': 'menu-tabs',
  'faq': 'faq-accordion', 'question': 'faq-accordion', 'help': 'faq-accordion',
  'calculator': 'mortgage-calculator', 'bmi': 'bmi-calculator', 'estimate': 'quote-form',
  'quote': 'quote-form', 'testimonial': 'testimonials', 'review': 'testimonials',
  'delivery': 'delivery-tracker', 'tracking': 'delivery-tracker', 'track order': 'delivery-tracker',
  'chat': 'live-chat', 'live chat': 'live-chat', 'chatbot': 'live-chat',
  'video': 'video-section', 'youtube': 'video-section', 'embed': 'video-section',
  'login': 'auth-system', 'signup': 'auth-system', 'register': 'auth-system',
  'map': 'google-map', 'location': 'google-map', 'directions': 'google-map',
  'countdown': 'countdown-timer', 'timer': 'countdown-timer', 'launch': 'countdown-timer',
  'popup': 'popup-modal', 'modal': 'popup-modal', 'alert': 'popup-modal',
  'slider': 'image-slider', 'carousel': 'image-slider', 'slideshow': 'image-slider',
  'whatsapp': 'whatsapp-button', 'social media': 'social-links',
  'before after': 'before-after-slider', 'comparison': 'before-after-slider',
  'dark mode': 'dark-mode-toggle', 'light mode': 'dark-mode-toggle', 'theme toggle': 'dark-mode-toggle',
  'progress': 'progress-bar', 'loading': 'loading-animation',
  'tabs': 'tab-section', 'accordion': 'faq-accordion',
  'multi language': 'language-switcher', 'translation': 'language-switcher',
};

// ══════════ COLOR DETECTION ══════════
const COLOR_KEYWORDS = {
  'red': '#e53e3e', 'blue': '#3b82f6', 'green': '#22c55e', 'purple': '#8b5cf6',
  'orange': '#f97316', 'yellow': '#eab308', 'pink': '#ec4899', 'teal': '#14b8a6',
  'cyan': '#06b6d4', 'indigo': '#6366f1', 'gold': '#d4a574', 'rose': '#f43f5e',
  'emerald': '#10b981', 'amber': '#f59e0b', 'violet': '#7c3aed', 'lime': '#84cc16',
  'crimson': '#dc2626', 'navy': '#1e3a5f', 'coral': '#ff6b6b', 'mint': '#00d2a0',
  'maroon': '#800000', 'olive': '#808000', 'turquoise': '#40e0d0', 'salmon': '#fa8072',
  'lavender': '#e6e6fa', 'burgundy': '#800020', 'peach': '#ffcba4', 'charcoal': '#36454f',
};

function detectColor(text) {
  const lower = text.toLowerCase();
  // Check for hex codes
  const hexMatch = lower.match(/#[0-9a-f]{6}/);
  if (hexMatch) return hexMatch[0];
  // Check for color keywords
  for (const [name, hex] of Object.entries(COLOR_KEYWORDS)) {
    if (lower.includes(name)) return hex;
  }
  return null;
}

function detectTheme(text) {
  const lower = text.toLowerCase();
  if (lower.includes('dark theme') || lower.includes('dark mode') || lower.includes('black background') || lower.includes('night mode')) return 'dark';
  if (lower.includes('light theme') || lower.includes('light mode') || lower.includes('white background') || lower.includes('bright')) return 'light';
  if (lower.includes('dark')) return 'dark';
  if (lower.includes('light') || lower.includes('clean') || lower.includes('white')) return 'light';
  return null;
}

// ══════════ MAIN MATCHING FUNCTION ══════════

/**
 * Analyze user prompt and return the best template match with customization data
 * 
 * @param {string} userPrompt - The user's description
 * @returns {object} { matched, templateHTML, missingFeatures, detectedColor, detectedTheme, score }
 */
function analyzeAndMatch(userPrompt) {
  const scores = matchTemplates(userPrompt);
  const best = scores[0];
  
  if (!best || best.score < 10) {
    // No good match — fall back to generating from scratch
    return { matched: false, reason: 'No template matched well enough' };
  }
  
  const templateHTML = loadTemplateHTML(best.template.file);
  if (!templateHTML) {
    return { matched: false, reason: `Template file not found: ${best.template.file}` };
  }
  
  const detectedColor = detectColor(userPrompt);
  const detectedTheme = detectTheme(userPrompt);
  
  return {
    matched: true,
    templateId: best.template.id,
    templateFile: best.template.file,
    templateHTML,
    score: best.score,
    existingFeatures: best.existingFeatures,
    missingFeatures: best.missingFeatures,
    requestedFeatures: best.requestedFeatures,
    detectedColor,
    detectedTheme,
    primaryColor: best.template.primaryColor,
    colorScheme: best.template.colorScheme,
    runners: scores.slice(1, 3).map(s => ({ id: s.template.id, score: s.score })),
  };
}

function matchTemplates(userPrompt) {
  const text = userPrompt.toLowerCase();
  
  const scores = TEMPLATE_INDEX.map(template => {
    let score = 0;
    
    // Industry match (40 points max)
    const industryHits = template.industry.filter(kw => text.includes(kw));
    score += Math.min(40, industryHits.length * 10);
    
    // Style match (20 points max)
    const styleHits = template.style.filter(kw => text.includes(kw));
    score += Math.min(20, styleHits.length * 7);
    
    // Feature keyword detection
    const requestedFeatures = [];
    Object.entries(FEATURE_KEYWORDS).forEach(([keyword, feature]) => {
      if (text.includes(keyword) && !requestedFeatures.includes(feature)) {
        requestedFeatures.push(feature);
      }
    });
    
    // Feature coverage (25 points max)
    const existingFeatures = requestedFeatures.filter(f => template.features.includes(f));
    const coverage = requestedFeatures.length > 0
      ? (existingFeatures.length / requestedFeatures.length) * 25
      : 10;
    score += coverage;
    
    // Color scheme preference (15 points max)
    const wantsDark = text.includes('dark') || text.includes('night') || text.includes('black') || text.includes('moody');
    const wantsLight = text.includes('light') || text.includes('white') || text.includes('bright') || text.includes('clean') || text.includes('minimal');
    if (wantsDark && template.colorScheme === 'dark') score += 15;
    else if (wantsLight && template.colorScheme === 'light') score += 15;
    else if (!wantsDark && !wantsLight) score += 7;
    
    const missingFeatures = requestedFeatures.filter(f => !template.features.includes(f));
    
    return {
      template,
      score: Math.round(Math.min(100, score)),
      existingFeatures,
      missingFeatures,
      requestedFeatures,
    };
  });
  
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

function loadTemplateHTML(filename) {
  const searchPaths = [
    path.join(__dirname, '..', 'prebuilt-templates', filename),
    path.join(__dirname, '..', 'templates', filename),
    path.join(process.cwd(), 'prebuilt-templates', filename),
    path.join(process.cwd(), 'templates', filename),
  ];
  
  for (const p of searchPaths) {
    try {
      if (fs.existsSync(p)) {
        console.log(`[Templates] Loaded: ${filename}`);
        return fs.readFileSync(p, 'utf8');
      }
    } catch {}
  }
  
  console.warn(`[Templates] File not found: ${filename}. Searched: ${searchPaths.join(', ')}`);
  return null;
}

// ══════════ CUSTOMIZATION PROMPT BUILDER ══════════

const CUSTOMIZE_SYSTEM_PROMPT = `<role>
You are ZapCodes AI — a website customization expert. You receive a COMPLETE pre-built HTML template and a user's business description. Your job is to CUSTOMIZE the template to perfectly match their business.
</role>

<critical_rules>
1. USE the provided template HTML as your STARTING BASE — do NOT generate from scratch
2. REPLACE all placeholder business content with content that matches the user's description:
   - Business name (replace "ZapCodes" in the logo/nav with their name, but KEEP "Built with ZapCodes" in the footer)
   - Service/product names, descriptions, prices
   - Testimonial names and quotes (make them relevant to the industry)
   - Contact information, hours, address
   - Menu items, team members, project names — everything
3. CHANGE colors if user specified — update ALL CSS custom properties and any hardcoded colors
4. CHANGE theme (dark↔light) if user requested different from template default
5. ADD any missing features the user requested — generate COMPLETE working code (HTML + CSS + JS)
6. REMOVE sections the user explicitly doesn't want
7. Keep ALL existing interactivity working — forms validate, tabs switch, carts work, etc.
8. Output the COMPLETE modified file — NEVER truncate, NEVER use placeholders like "..." or "// rest here"
9. Use relevant images from https://images.unsplash.com/ or https://picsum.photos/
10. Minimum output: the ENTIRE customized HTML file
</critical_rules>

<color_change_instructions>
When changing colors, update these in the CSS:
- All CSS custom properties (--primary, --accent, --gold, --red, etc.)
- Any hardcoded hex colors in backgrounds, text, borders
- Gradient directions if requested
- Button colors, link colors, badge colors
- Ensure contrast remains readable (dark text on light bg, light text on dark bg)
</color_change_instructions>

<theme_switch_instructions>
If switching dark→light: Change body/section backgrounds to white/light gray, text to dark colors, borders to light gray, cards to white.
If switching light→dark: Change body/section backgrounds to dark/near-black, text to light/white, borders to dark, cards to dark gray.
Update ALL sections consistently — don't leave some dark and some light.
</theme_switch_instructions>

<output_format>
\`\`\`filepath:index.html
(entire customized HTML file — EVERY line)
\`\`\`
</output_format>`;

/**
 * Build the user prompt for template customization
 */
function buildCustomizationUserPrompt(matchResult, userPrompt, projectName) {
  let parts = [];
  
  parts.push(`HERE IS THE TEMPLATE TO CUSTOMIZE:\n\n${matchResult.templateHTML}`);
  parts.push(`\n\n═══ USER'S REQUEST ═══\n${userPrompt}`);
  parts.push(`\nBUSINESS/PROJECT NAME: ${projectName || 'My Business'}`);
  
  // Color customization
  if (matchResult.detectedColor) {
    parts.push(`\nCOLOR REQUEST: Change the primary/accent color to ${matchResult.detectedColor}. Update all CSS variables and hardcoded colors.`);
  }
  
  // Theme customization
  if (matchResult.detectedTheme && matchResult.detectedTheme !== matchResult.colorScheme) {
    parts.push(`\nTHEME REQUEST: Switch from ${matchResult.colorScheme} theme to ${matchResult.detectedTheme} theme. Update ALL backgrounds, text colors, borders, and cards consistently.`);
  }
  
  // Missing features
  if (matchResult.missingFeatures && matchResult.missingFeatures.length > 0) {
    parts.push(`\nADD THESE MISSING FEATURES (generate complete working code for each):`);
    matchResult.missingFeatures.forEach(f => {
      parts.push(`  • ${f.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`);
    });
    parts.push(`Each added feature must have complete HTML, CSS (matching the template's style), and JavaScript with full interactivity.`);
  }
  
  parts.push(`\nREMINDER: Output the COMPLETE customized index.html file. Do not truncate. Every button, form, and interaction must work.`);
  
  return parts.join('\n');
}

// ══════════ EXPORTS ══════════
module.exports = {
  TEMPLATE_INDEX,
  analyzeAndMatch,
  matchTemplates,
  loadTemplateHTML,
  buildCustomizationUserPrompt,
  detectColor,
  detectTheme,
  CUSTOMIZE_SYSTEM_PROMPT,
};
