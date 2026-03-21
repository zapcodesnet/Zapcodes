import { useState, useEffect, useContext, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api, { API_URL } from '../api';
import { useSpeechToText } from '../hooks/useSpeechToText';

const TIER_COLORS = { free: '#888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };
const MODEL_LABELS = {
  'gemini-3.1-pro': 'Gemini 3.1 Pro', 'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'haiku-4.5': 'Haiku 4.5', 'sonnet-4.6': 'Sonnet 4.6', 'groq': 'Groq AI',
  'gemini-pro': 'Gemini 3.1 Pro', 'gemini-flash': 'Gemini 2.5 Flash',
  'haiku': 'Haiku 4.5', 'sonnet': 'Sonnet 4.6',
};
const TEMPLATES = [
  { id: 'custom', name: 'Custom (AI Chat)', icon: '💬' },
  { id: 'portfolio', name: 'Portfolio', icon: '👤' },
  { id: 'landing', name: 'Landing Page', icon: '🚀' },
  { id: 'blog', name: 'Blog', icon: '📝' },
  { id: 'ecommerce', name: 'E-Commerce', icon: '🛒' },
  { id: 'dashboard', name: 'Dashboard', icon: '📊' },
  { id: 'webapp', name: 'Web App', icon: '⚡' },
  { id: 'saas', name: 'SaaS', icon: '💎' },
  { id: 'game', name: 'Mobile Game', icon: '🎮' },
];
const UNLIMITED = 999999999;
function isUnlimited(n) { return n >= UNLIMITED || n === Infinity; }
function formatBL(n) {
  if (n == null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return n.toLocaleString();
}
const BL_COST_LABELS = { 'sonnet-4.6': 60000, 'gemini-3.1-pro': 50000, 'haiku-4.5': 20000, 'gemini-2.5-flash': 10000, 'groq': 5000, 'sonnet': 60000, 'gemini-pro': 50000, 'haiku': 20000, 'gemini-flash': 10000 };
const ALL_MODELS_DISPLAY = [
  { id: 'sonnet-4.6', name: 'Sonnet 4.6', tier: 'gold' },
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', tier: 'bronze' },
  { id: 'haiku-4.5', name: 'Haiku 4.5', tier: 'silver' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tier: 'free' },
  { id: 'groq', name: 'Groq AI', tier: 'free' },
];
const VIBE_PRESETS = [
  { id: 'professional', label: 'Professional' }, { id: 'remove-bg', label: 'Remove BG' },
  { id: 'luxury', label: 'Luxury' }, { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'studio', label: 'Studio Lighting' }, { id: 'oil-painting', label: 'Oil Painting' },
  { id: 'minimalist', label: 'Minimalist' },
];

export default function Build() {
  const { user } = useContext(AuthContext);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('build');
  const [mobileView, setMobileView] = useState('build');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [pendingMedia, setPendingMedia] = useState([]); // Media queued for AI placement via chat
  const [showModelPanel, setShowModelPanel] = useState(false); // Collapsible AI model selector // previous file states for undo
  const [preview, setPreview] = useState('');
  const [generating, setGenerating] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [subdomain, setSubdomain] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [coinData, setCoinData] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [template, setTemplate] = useState('custom');
  const [projectName, setProjectName] = useState('');
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneAnalysis, setCloneAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [fixFiles, setFixFiles] = useState([]);
  const [fixDescription, setFixDescription] = useState('');
  const [fixing, setFixing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [codeViewFile, setCodeViewFile] = useState(null);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const [progressMessages, setProgressMessages] = useState([]);
  const [progressStep, setProgressStep] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [genResult, setGenResult] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPromptText, setSystemPromptText] = useState('');
  const [autoAttachPrompt, setAutoAttachPrompt] = useState(true);
  const [defaultPrompts, setDefaultPrompts] = useState({ gen: '', edit: '', fix: '' });
  const [activePromptMode, setActivePromptMode] = useState('gen');
  const [editingDeployedSite, setEditingDeployedSite] = useState(null);
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [mediaTab, setMediaTab] = useState('images');
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgAspect, setImgAspect] = useState('16:9');
  const [imgStyle, setImgStyle] = useState('photorealistic');
  const [imgResults, setImgResults] = useState([]);
  const [imgGenerating, setImgGenerating] = useState(false);
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [vibePreset, setVibePreset] = useState('professional');
  const [vibeResult, setVibeResult] = useState(null);
  const [vibeGenerating, setVibeGenerating] = useState(false);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState(8);
  const [videoResult, setVideoResult] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [vibeCustomPrompt, setVibeCustomPrompt] = useState('');
  const photoInputRef = useRef(null);
  const [pendingChatSubmit, setPendingChatSubmit] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [groqHint, setGroqHint] = useState(null); // { message, timestamp }
  const groqTimerRef = useRef(null);
  const lastGroqCheckRef = useRef('');
  const [memorySummaries, setMemorySummaries] = useState([]);
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [awaitingClarify, setAwaitingClarify] = useState(false);
  const chatEndRef = useRef(null);
  const [fallbackDialog, setFallbackDialog] = useState(null);
  const iframeRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const progressEndRef = useRef(null);
  const voiceTargetRef = useRef('prompt');
  const [voiceActiveInput, setVoiceActiveInput] = useState('');
  const { isListening: voiceListening, isSupported: voiceSupported, toggleListening: _toggleVoiceRaw, error: voiceError } = useSpeechToText({ onResult: (text) => { const target = voiceTargetRef.current; if (target === 'img') setImgPrompt(text); else if (target === 'video') setVideoPrompt(text); else if (target === 'vibe') setVibeCustomPrompt(text); else setPrompt(text); }, silenceTimeoutMs: 5000 });
  const toggleVoice = (existing = '') => { voiceTargetRef.current = 'prompt'; setVoiceActiveInput('prompt'); _toggleVoiceRaw(existing); };
  const toggleImgVoice = (existing = '') => { voiceTargetRef.current = 'img'; setVoiceActiveInput('img'); _toggleVoiceRaw(existing); };
  const toggleVideoVoice = (existing = '') => { voiceTargetRef.current = 'video'; setVoiceActiveInput('video'); _toggleVoiceRaw(existing); };
  const toggleVibeVoice = (existing = '') => { voiceTargetRef.current = 'vibe'; setVoiceActiveInput('vibe'); _toggleVoiceRaw(existing); };
  const imgVoiceListening = voiceListening && voiceActiveInput === 'img';
  const videoVoiceListening = voiceListening && voiceActiveInput === 'video';
  const vibeVoiceListening = voiceListening && voiceActiveInput === 'vibe';

  useEffect(() => { api.get('/api/coins/balance').then(r => setCoinData(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get('/api/build/available-models').then(r => { setAvailableModels(r.data.models || []); if (r.data.bl_coins !== undefined) setCoinData(p => ({ ...p, balance: r.data.bl_coins })); }).catch(() => {}); }, [coinData?.balance]);
  useEffect(() => { if (!currentProjectId) return; api.get(`/api/build/project/${currentProjectId}`).then(({ data }) => { const mem = data.project?.projectMemory; if (mem) { setChatMessages(mem.rawMessages || []); setMemorySummaries(mem.summaries || []); } }).catch(() => {}); }, [currentProjectId]);
  useEffect(() => { try { const saved = localStorage.getItem('zc_system_prompt'); const autoAttach = localStorage.getItem('zc_auto_attach_prompt'); if (saved) setSystemPromptText(saved); if (autoAttach !== null) setAutoAttachPrompt(autoAttach !== 'false'); } catch {} api.get('/api/build/system-prompts').then(r => { const prompts = { gen: r.data.gen_prompt || '', edit: r.data.edit_prompt || '', fix: r.data.fix_prompt || '' }; setDefaultPrompts(prompts); if (!localStorage.getItem('zc_system_prompt')) setSystemPromptText(prompts.gen); }).catch(() => {}); }, []);
  useEffect(() => { const h = () => setIsMobile(window.innerWidth < 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  useEffect(() => { if (!localStorage.getItem('zc_system_prompt') && defaultPrompts[activePromptMode]) setSystemPromptText(defaultPrompts[activePromptMode]); }, [activePromptMode, defaultPrompts]);
  useEffect(() => { if (progressEndRef.current) progressEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [progressMessages]);
  useEffect(() => { if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  useEffect(() => { if (files.length > 0) { const htmlFile = files.find(f => f.name === 'index.html') || files.find(f => f.name?.endsWith('.html')); if (htmlFile?.content) { setPreview(htmlFile.content); if (iframeRef.current) iframeRef.current.srcdoc = htmlFile.content; } } }, [files]);
  useEffect(() => { if (!searchParams.get('project') && !searchParams.get('site') && files.length === 0 && !editingDeployedSite) setActivePromptMode('gen'); }, [files, searchParams, editingDeployedSite]);

  useEffect(() => {
    const projId = searchParams.get('project'); const action = searchParams.get('action') || 'edit'; const linkedSub = searchParams.get('subdomain');
    if (projId) { api.get(`/api/build/project/${projId}`).then(({ data }) => { const p = data.project; setCurrentProjectId(p.projectId); setProjectName(p.name || ''); if (p.files?.length) setFiles(p.files); const sub = p.linkedSubdomain || linkedSub; if (sub) { setSubdomain(sub); setEditingDeployedSite(sub); } if (action === 'fix') { setTab('build'); setActivePromptMode('fix'); setPrompt(`Here is my existing project "${p.name}".\n\nPlease fix all bugs and issues. Specifically:\n- Fix any broken JavaScript (buttons not working, forms not submitting, etc.)\n- Fix any CSS issues (layout problems, missing styles, responsive issues)\n- Fix any broken links or navigation\n- Make sure all forms submit to https://api.zapcodes.net/api/forms/submit\n\nDo NOT change the design, colors, content, or layout. Only fix what is broken.\n\n`); } else if (action === 'redeploy') { setTab('build'); setPrompt(''); setActivePromptMode('edit'); } else if (action === 'deploy') { setTab('build'); setPrompt(''); setActivePromptMode('gen'); } else { setTab('build'); setActivePromptMode('edit'); setPrompt(`Here is my existing project "${p.name}".\n\nPlease make these changes:\n\n`); } }).catch(() => {}); return; }
    const siteSubdomain = searchParams.get('site');
    if (siteSubdomain) { api.get(`/api/build/site-content/${siteSubdomain}`).then(({ data }) => { if (data.files?.length) { setFiles(data.files); setProjectName(data.title || siteSubdomain); setSubdomain(siteSubdomain); setEditingDeployedSite(siteSubdomain); if (action === 'fix') { setTab('build'); setActivePromptMode('fix'); setPrompt(`Here is my existing website "${data.title || siteSubdomain}" deployed at ${siteSubdomain}.zapcodes.net.\n\nPlease fix all bugs and issues. Do NOT change the design, colors, content, or layout. Only fix what is broken.\n\n`); } else { setTab('build'); setActivePromptMode('edit'); setPrompt(`Here is my existing website "${data.title || siteSubdomain}" deployed at ${siteSubdomain}.zapcodes.net.\n\nPlease make these changes:\n\n`); } } }).catch(() => {}); }
  }, [searchParams]);

  const plan = coinData?.subscription_tier || coinData?.plan || user?.subscription_tier || user?.plan || 'free';
  const tc = coinData?.tierConfig || {};
  const balance = coinData?.balance ?? coinData?.bl_coins ?? user?.bl_coins ?? 0;
  const effectiveModel = (() => { if (selectedModel) { const m = availableModels.find(x => x.id === selectedModel && x.available); if (m) return m.id; } const primary = availableModels.find(x => x.available); return primary?.id || 'groq'; })();
  const currentModelInfo = availableModels.find(m => m.id === effectiveModel) || {};
  const cost = currentModelInfo.cost || BL_COST_LABELS[effectiveModel] || 5000;
  const maxChars = tc.maxChars || 2000;
  const charsUsed = prompt.length;
  const charPct = isUnlimited(maxChars) ? 0 : (charsUsed / maxChars) * 100;
  const saveSystemPrompt = () => { try { localStorage.setItem('zc_system_prompt', systemPromptText); } catch {} alert('System prompt saved!'); };
  const resetSystemPrompt = () => { setSystemPromptText(defaultPrompts[activePromptMode] || defaultPrompts.gen || ''); try { localStorage.removeItem('zc_system_prompt'); } catch {} };
  const deleteSystemPrompt = () => { setSystemPromptText(''); try { localStorage.removeItem('zc_system_prompt'); } catch {} };
  const toggleAutoAttach = () => { const next = !autoAttachPrompt; setAutoAttachPrompt(next); try { localStorage.setItem('zc_auto_attach_prompt', String(next)); } catch {} };
  const loadDefaultForMode = (mode) => { setActivePromptMode(mode); setSystemPromptText(defaultPrompts[mode] || ''); try { localStorage.removeItem('zc_system_prompt'); } catch {} };

  const handleGenerateImages = async () => { if (!imgPrompt.trim()) return alert('Enter an image description'); if (selectedModel !== 'gemini-2.5-flash') setSelectedModel('gemini-2.5-flash'); setImgGenerating(true); setImgResults([]); try { const { data } = await api.post('/api/build/generate-image', { prompt: imgPrompt, style: imgStyle, aspectRatio: imgAspect, count: 2 }); if (data.images?.length) { setImgResults(data.images); setCoinData(p => ({ ...p, balance: data.balanceRemaining })); } else alert('Image generation failed. Please try again.'); } catch (e) { alert(e.response?.data?.error || 'Image generation failed'); } finally { setImgGenerating(false); } };
  const handlePhotoUpload = (files) => { const file = files[0]; if (!file) return; if (selectedModel !== 'gemini-2.5-flash') setSelectedModel('gemini-2.5-flash'); const reader = new FileReader(); reader.onload = (e) => { const base64 = e.target.result.split(',')[1]; setUploadedPhoto({ base64, mimeType: file.type || 'image/jpeg', preview: e.target.result }); setVibeResult(null); }; reader.readAsDataURL(file); };
  const handleVibeTransform = async () => { if (!uploadedPhoto) return alert('Upload a photo first'); if (selectedModel !== 'gemini-2.5-flash') setSelectedModel('gemini-2.5-flash'); setVibeGenerating(true); setVibeResult(null); try { const { data } = await api.post('/api/build/edit-photo', { image: { base64: uploadedPhoto.base64, mimeType: uploadedPhoto.mimeType }, preset: vibeCustomPrompt.trim() ? null : vibePreset, customPrompt: vibeCustomPrompt.trim() || null }); if (data.images?.length) { const transformedUrl = `data:${data.images[0].mimeType};base64,${data.images[0].base64}`; setVibeResult(transformedUrl); setCoinData(p => ({ ...p, balance: data.balanceRemaining })); setPendingMedia(prev => [...prev, { type: 'image', base64: data.images[0].base64, mimeType: data.images[0].mimeType, slot: prev.filter(m => m.type === 'image').length + 1, label: 'transformed photo' }]); } else alert('Photo transformation failed. Please try again.'); } catch (e) { alert(e.response?.data?.error || 'Photo transformation failed'); } finally { setVibeGenerating(false); } };
  const handleGenerateVideo = async () => { if (!videoPrompt.trim() && !uploadedPhoto) return alert('Enter a video description'); const effectiveVideoPrompt = videoPrompt.trim() || 'animate this photo with smooth natural movement'; setVideoGenerating(true); setVideoResult(null); try { const body = { prompt: effectiveVideoPrompt, durationSeconds: videoDuration, aspectRatio: '16:9' }; if (uploadedPhoto) { let photoB64 = uploadedPhoto.base64; if (photoB64.length > 500000) { try { const img = new Image(); const canvas = document.createElement('canvas'); await new Promise(r => { img.onload = r; img.src = `data:${uploadedPhoto.mimeType};base64,${photoB64}`; }); const maxDim = 720; const scale = Math.min(maxDim / img.width, maxDim / img.height, 1); canvas.width = img.width * scale; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); photoB64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]; } catch(e) { console.warn('Photo compress failed:', e); } } body.referenceImage = { base64: photoB64, mimeType: 'image/jpeg' }; } const { data } = await api.post('/api/build/generate-video', body); if (data.video) { setVideoResult(data.video); setCoinData(p => ({ ...p, balance: data.balanceRemaining })); if (data.video.publicUrl && files.length > 0) { const videoTag = `<video autoplay loop muted playsinline style="width:100%;max-height:500px;object-fit:cover;border-radius:8px;" src="${data.video.publicUrl}"><source src="${data.video.publicUrl}" type="video/mp4"></video>`; setPendingMedia(prev => [...prev, { type: 'veo-video', embedHtml: videoTag, label: 'AI-generated video' }]); } } else { alert(data.error || 'Video generation failed. Check Render logs for details.'); } } catch (e) { alert(e.response?.data?.error || 'Video generation failed'); } finally { setVideoGenerating(false); } };
  const injectImageIntoHTML = (html, dataUrl) => {
    // RULE: Never replace an already-inserted AI image (data: URLs). Only replace placeholders.
    // 1. picsum.photos — replace first occurrence only
    if (/https?:\/\/picsum\.photos\/[^\s"')]+/.test(html)) {
      return html.replace(/https?:\/\/picsum\.photos\/[^\s"')]+/, dataUrl);
    }
    // 2. Other placeholder services
    const ps = [/https?:\/\/via\.placeholder\.com\/[^\s"')]+/,/https?:\/\/placehold\.it\/[^\s"')]+/,/https?:\/\/placeimg\.com\/[^\s"')]+/,/https?:\/\/loremflickr\.com\/[^\s"')]+/,/https?:\/\/dummyimage\.com\/[^\s"')]+/,/https?:\/\/placeholder\.com\/[^\s"')]+/];
    for (const re of ps) { if (re.test(html)) return html.replace(re, dataUrl); }
    // 3. Empty src or src="#" on img tags
    if (/(<img\s[^>]*src=["'])["'#]([^>]*>)/.test(html)) {
      return html.replace(/(<img\s[^>]*src=["'])["'#]([^>]*>)/, `$1${dataUrl}"$2`);
    }
    // 4. Empty CSS background-image
    if (/background-image:\s*url\(['"]?['"]?\)/.test(html)) {
      return html.replace(/background-image:\s*url\(['"]?['"]?\)/, `background-image: url('${dataUrl}')`);
    }
    // 5. CSS background with placeholder service
    if (/background-image:\s*url\(['"]https?:\/\/(?:picsum|via\.placeholder|placehold)[^\s)'"]+['"]?\)/.test(html)) {
      return html.replace(/background-image:\s*url\(['"]https?:\/\/(?:picsum|via\.placeholder|placehold)[^\s)'"]+['"]?\)/, `background-image: url('${dataUrl}')`);
    }
    // 6. First <img> with http src that is NOT a data: URL (skip previously inserted images)
    const imgRegex = /<img\s[^>]*src=["'](https?:\/\/[^"']+)["']/g;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      const srcUrl = match[1];
      // Skip data: URLs (already inserted) and known CDN/font URLs
      if (srcUrl.startsWith('data:')) continue;
      if (srcUrl.includes('fonts.googleapis') || srcUrl.includes('cdnjs.cloudflare')) continue;
      // Replace this one
      return html.replace(srcUrl, dataUrl);
    }
    // 7. Nothing found — insert as a visible hero image after <body> or first <header>/<main>
    if (html.includes('<main')) {
      return html.replace(/<main[^>]*>/, match => `${match}\n<img src="${dataUrl}" alt="AI Generated" style="width:100%;max-height:400px;object-fit:cover;border-radius:8px;margin:20px 0;" />`);
    }
    if (html.includes('<header')) {
      return html.replace(/<\/header>/, match => `${match}\n<img src="${dataUrl}" alt="AI Generated" style="width:100%;max-height:400px;object-fit:cover;" />`);
    }
    return html.replace(/<body[^>]*>/, match => `${match}\n<img src="${dataUrl}" alt="AI Generated" style="width:100%;max-height:400px;object-fit:cover;" />`);
  };
  // ── Video URL helpers (YouTube, Facebook, Vimeo, TikTok, Instagram, Twitter/X, Dailymotion) ──
  const detectVideoPlatform = (url) => {
    if (!url) return null;
    const u = url.trim();
    // YouTube
    const ytMatch = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return { platform: 'youtube', id: ytMatch[1], embed: `https://www.youtube.com/embed/${ytMatch[1]}` };
    // Vimeo
    const vimeoMatch = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeoMatch) return { platform: 'vimeo', id: vimeoMatch[1], embed: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
    // Facebook video
    if (u.includes('facebook.com') && (u.includes('/videos/') || u.includes('/watch') || u.includes('/reel'))) {
      return { platform: 'facebook', id: null, embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false` };
    }
    // TikTok
    const tiktokMatch = u.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    if (tiktokMatch) return { platform: 'tiktok', id: tiktokMatch[1], embed: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}` };
    // Instagram Reel/Post
    const igMatch = u.match(/instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
    if (igMatch) return { platform: 'instagram', id: igMatch[1], embed: `https://www.instagram.com/p/${igMatch[1]}/embed` };
    // Twitter/X video
    const xMatch = u.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/);
    if (xMatch) return { platform: 'twitter', id: xMatch[1], embed: `https://platform.twitter.com/embed/Tweet.html?id=${xMatch[1]}` };
    // Dailymotion
    const dmMatch = u.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
    if (dmMatch) return { platform: 'dailymotion', id: dmMatch[1], embed: `https://www.dailymotion.com/embed/video/${dmMatch[1]}` };
    // Direct video URL (.mp4, .webm, .mov)
    if (/\.(mp4|webm|mov|ogg)(\?|$)/i.test(u)) return { platform: 'direct', id: null, embed: u };
    return null;
  };
  const extractYouTubeId = (url) => { const v = detectVideoPlatform(url); return v?.platform === 'youtube' ? v.id : null; };
  const getVideoEmbedHtml = (url) => {
    const v = detectVideoPlatform(url);
    if (!v) return null;
    if (v.platform === 'direct') {
      return `<div style="width:100%;max-width:800px;margin:20px auto;"><video src="${v.embed}" controls playsinline style="width:100%;border-radius:8px;" /></div>`;
    }
    const heights = { youtube: '', vimeo: '', facebook: 'height:400px;', tiktok: 'height:740px;', instagram: 'height:540px;', twitter: 'height:400px;', dailymotion: '' };
    const extra = heights[v.platform] || '';
    return `<div style="width:100%;max-width:800px;margin:20px auto;${!extra ? 'aspect-ratio:16/9;' : ''}"><iframe src="${v.embed}" style="width:100%;${extra || 'height:100%;'}border:none;border-radius:8px;" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>`;
  };
  const getThumbnail = (url) => {
    const v = detectVideoPlatform(url);
    if (!v) return null;
    if (v.platform === 'youtube') return `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`;
    if (v.platform === 'vimeo') return null; // Vimeo requires API call for thumbnails
    return null;
  };
  // ── Undo last media insertion ──
  const undoLastInsert = () => {
    if (undoStack.length === 0) return;
    const previousFiles = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setFiles(previousFiles);
    const htmlFile = previousFiles.find(f => f.name.endsWith('.html'));
    if (htmlFile) { setPreview(htmlFile.content); if (iframeRef.current) iframeRef.current.srcdoc = htmlFile.content; }
  };
  const saveUndoState = () => {
    setUndoStack(prev => [...prev.slice(-9), files.map(f => ({ ...f }))]);
  };

  const insertVideoUrlIntoSite = () => {
    if (!youtubeUrl.trim()) return alert('Paste a video URL first');
    const embedHtml = getVideoEmbedHtml(youtubeUrl);
    if (!embedHtml) return alert('Unsupported video URL.');
    const v = detectVideoPlatform(youtubeUrl);
    setPendingMedia(prev => [...prev, { type: 'video-url', embedHtml, label: `${v.platform} video` }]);
    setChatInput(prev => prev || '');
    alert(`✅ ${v.platform.charAt(0).toUpperCase() + v.platform.slice(1)} video queued! Now type WHERE you want it placed in the chat box below and press Send.`);
  };

  const insertImageIntoSite = (base64, mimeType) => {
    if (!files.length) return alert('Generate a site first, then images can be inserted.');
    const slotNum = pendingMedia.filter(m => m.type === 'image').length + 1;
    setPendingMedia(prev => [...prev, { type: 'image', base64, mimeType, slot: slotNum, label: 'image' }]);
    setChatInput(prev => prev || '');
    alert(`✅ Image queued! Now type WHERE you want it placed in the chat box below and press Send.`);
  };

  const insertVeoVideoIntoSite = () => {
    if (!videoResult?.publicUrl) return;
    const videoTag = `<video autoplay loop muted playsinline style="width:100%;max-height:500px;object-fit:cover;display:block;" src="${videoResult.publicUrl}"><source src="${videoResult.publicUrl}" type="video/mp4"></video>`;
    setPendingMedia(prev => [...prev, { type: 'veo-video', embedHtml: videoTag, label: 'AI-generated video' }]);
    setChatInput(prev => prev || '');
    alert(`✅ Video queued! Now type WHERE you want it placed in the chat box below and press Send.`);
  };
  const saveMessageToMemory = async (role, content, mediaPrompts = {}) => { if (!currentProjectId) return; const msg = { role, content, mediaPrompts, timestamp: new Date().toISOString() }; try { await api.post('/api/build/save-message', { projectId: currentProjectId, message: msg }); } catch (_) {} };
  const getActiveMediaPrompts = () => ({ imagePrompt: imgResults.length > 0 ? imgPrompt : '', vibePrompt: vibeResult ? vibeCustomPrompt || vibePreset : '', videoPrompt: videoResult ? videoPrompt : '' });
  const getActiveReferenceMedia = () => { const media = []; if (imgResults.length > 0) imgResults.forEach(img => media.push({ base64: img.base64, mimeType: img.mimeType })); if (vibeResult) { const b64 = vibeResult.split(',')[1]; const mime = vibeResult.split(':')[1]?.split(';')[0] || 'image/png'; if (b64) media.push({ base64: b64, mimeType: mime }); } return media; };
  const handleFallbackConfirm = (nextModel) => { setFallbackDialog(null); setSelectedModel(nextModel); setPendingChatSubmit(true); };

  // ── Groq pre-read: analyze user's typing after 10s idle to catch missing instructions ──
  const hasActiveMedia = () => {
    const media = [];
    if (uploadedPhoto) media.push('uploaded photo');
    if (youtubeUrl && detectVideoPlatform(youtubeUrl)) media.push(`${detectVideoPlatform(youtubeUrl).platform} video URL`);
    // NOTE: generated images and videos use Insert buttons, not AI prompt injection
    return media;
  };

  const groqPreRead = async (text) => {
    if (!text.trim() || text.trim().length < 5) return;
    const media = hasActiveMedia();
    if (media.length === 0) return; // No media active, no need to check
    if (text === lastGroqCheckRef.current) return; // Already checked this exact text
    lastGroqCheckRef.current = text;
    try {
      const { data } = await api.post('/api/build/groq-pre-check', {
        prompt: text,
        activeMedia: media,
      });
      if (data.suggestion) {
        setGroqHint({ message: data.suggestion, timestamp: Date.now() });
        // Also add to chat as a subtle AI hint
        const hintMsg = { role: 'ai', content: `💡 ${data.suggestion}`, timestamp: new Date().toISOString(), isHint: true };
        setChatMessages(prev => {
          // Don't add duplicate hints
          const last = prev[prev.length - 1];
          if (last?.isHint) return [...prev.slice(0, -1), hintMsg];
          return [...prev.slice(-19), hintMsg];
        });
      } else {
        // Clear any previous hint if prompt is now complete
        setGroqHint(null);
      }
    } catch (_) { /* silent — this is a nice-to-have, not critical */ }
  };

  const handleChatInputChange = (value) => {
    setChatInput(value);
    // Reset Groq timer on every keystroke
    if (groqTimerRef.current) clearTimeout(groqTimerRef.current);
    // After 10 seconds of no typing, Groq pre-reads the message
    if (value.trim().length >= 10) {
      groqTimerRef.current = setTimeout(() => groqPreRead(value), 10000);
    }
  };

  const handleSendChat = async () => {
    const text = chatInput.trim(); if (!text || generating || aiThinking) return; setChatInput('');
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setChatMessages(prev => [...prev.slice(-19), userMsg]);
    if (awaitingClarify) { setAwaitingClarify(false); setPrompt(text); setPendingChatSubmit(true); return; }
    setAiThinking(true);
    try { const { data } = await api.post('/api/build/check-clarity', { prompt: text, projectId: currentProjectId, isEditMode: isEditMode }); if (data.needsClarification && data.question) { const aiMsg = { role: 'ai', content: data.question, timestamp: new Date().toISOString(), isQuestion: true }; setChatMessages(prev => [...prev.slice(-19), aiMsg]); setAwaitingClarify(true); setAiThinking(false); return; } } catch (_) {}
    setAiThinking(false); setPrompt(text); setPendingChatSubmit(true);
  };
  const handleChatKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } };

  const handleGenerate = async () => {
    if (!prompt.trim()) return alert('Enter a description');
    const editFiles = files.length > 0 ? [...files] : null;
    if (editFiles) { setGenerating(true); setGenResult(null); setDeployUrl(''); setProgressMessages([]); setProgressStep('validating'); }
    else { setActivePromptMode('gen'); setGenerating(true); setGenResult(null); setFiles([]); setPreview(''); setDeployUrl(''); setProgressMessages([]); setProgressStep('validating'); }
    if (isMobile) setMobileView('build');
    const controller = new AbortController(); abortControllerRef.current = controller;
    try {
      const token = localStorage.getItem('token');
      const requestBody = { prompt, model: effectiveModel, template, projectName: projectName || 'My Website', projectId: currentProjectId || undefined };
      if (editFiles) { let imgIdx = 0; requestBody.existingFiles = editFiles.map(f => { if (!f.name.endsWith('.html')) return f; return { ...f, content: f.content.replace(/data:(image|video)\/[^;]+;base64,[A-Za-z0-9+/=]{500,}/g, () => `EXISTING_MEDIA_${++imgIdx}_DO_NOT_REMOVE`) }; }); requestBody.isEditing = true; }
      else { if (autoAttachPrompt && systemPromptText && systemPromptText.trim().length > 50) requestBody.customSystemPrompt = systemPromptText; }

      // ── User uploaded photo: only inject when NOT already queued via pendingMedia Insert button ──
      if (uploadedPhoto && pendingMedia.length === 0) {
        requestBody.prompt = requestBody.prompt + '\n\n[USER PHOTO: The user uploaded their own photo. Create an <img> tag with EXACTLY: id="user-uploaded-photo" src="USER_PHOTO_PLACEHOLDER". If the user specified WHERE to place it, follow those instructions exactly. If the user did NOT specify where, ask: "Where would you like me to place your uploaded photo?". Do NOT delete any existing content on the site. The placeholder will be replaced with the actual photo after generation.]';
      }

      // ══════════════════════════════════════════════════════════════
      // MEDIA INJECTION — STRICT RULES:
      // 1. Uploaded photo: ALWAYS inject placeholder (user uploaded it for a reason)
      // 2. URLs in user's TYPED prompt: detect and embed
      // 3. Generated images/videos: NEVER auto-inject. User must use Insert buttons.
      // ══════════════════════════════════════════════════════════════

      // Video/embed URLs found DIRECTLY in the user's typed prompt text
      const urlsInPrompt = (prompt || '').match(/https?:\/\/[^\s"'<>]+/g);
      if (urlsInPrompt) {
        for (const url of urlsInPrompt) {
          const detected = detectVideoPlatform(url);
          if (detected) {
            const embedHtml = getVideoEmbedHtml(url);
            if (embedHtml) {
              requestBody.prompt = requestBody.prompt + `\n\n[MANDATORY VIDEO EMBED — DO NOT CHANGE THE URL]\nInsert this EXACT HTML:\n${embedHtml}\nPlace where user described. If no placement specified, ask where.`;
            }
            break; // Only one video URL per prompt
          }
        }
      }

      // YouTube URL from the Video tab state — ONLY if user's prompt mentions it
      if (youtubeUrl.trim() && detectVideoPlatform(youtubeUrl) && !urlsInPrompt?.some(u => detectVideoPlatform(u))) {
        const promptLower = (prompt || '').toLowerCase();
        if (/youtube|video url|embed.*video|that video|the video|video.*tab|video.*link/.test(promptLower)) {
          const embedHtml = getVideoEmbedHtml(youtubeUrl);
          if (embedHtml) {
            requestBody.prompt = requestBody.prompt + `\n\n[MANDATORY VIDEO EMBED — DO NOT CHANGE THE URL]\nInsert this EXACT HTML:\n${embedHtml}\nPlace where user described. If no placement specified, ask where.`;
          }
        }
      }

      // ── Pending media: queued by Insert buttons, user provides placement instructions ──
      const currentPendingMedia = [...pendingMedia];
      if (currentPendingMedia.length > 0) {
        const mediaInstructions = currentPendingMedia.map((m, i) => {
          const marker = `<!-- MEDIA_SLOT_${i + 1} -->`;
          if (m.type === 'image') {
            return `Media ${i + 1}: Place this HTML comment EXACTLY where the user wants the image: ${marker}`;
          } else if (m.type === 'video-url' || m.type === 'veo-video') {
            return `Media ${i + 1}: Place this HTML comment EXACTLY where the user wants the ${m.label}: ${marker}`;
          }
          return '';
        }).filter(Boolean).join('\n');

        requestBody.prompt = requestBody.prompt + `\n\n[MEDIA PLACEMENT]\nThe user has ${currentPendingMedia.length} media item(s) to place. Insert these HTML comments at the EXACT locations the user described:\n${mediaInstructions}\n\nRULES:\n1. Place each <!-- MEDIA_SLOT_N --> comment EXACTLY where the user said\n2. Do NOT delete or replace ANY existing images, videos, or content\n3. Do NOT move existing content unless user explicitly asked\n4. ONLY add the comment markers — the actual media will be injected automatically`;
      }

      // ── GLOBAL RULE: never delete existing content without explicit user request ──
      if (editFiles?.length > 0) {
        requestBody.prompt = requestBody.prompt + '\n\n[STRICT RULE: Do NOT delete, remove, replace, or modify any existing images, videos, text, or sections on the site unless the user EXPLICITLY asks you to delete or replace something. Only ADD or MODIFY what the user specifically requested. Any src attributes containing "EXISTING_MEDIA" are real images — you MUST keep them exactly as they are. Never remove or change any img tag or video tag that already exists.]';
      }

      const mediaPrompts = getActiveMediaPrompts();
      saveMessageToMemory('user', prompt, mediaPrompts);
      const response = await fetch(`${API_URL}/api/build/generate-with-progress`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(requestBody), signal: controller.signal });
      if (!response.ok) { let msg = `Server error ${response.status}`; try { msg = (await response.json()).error || msg; } catch {} throw new Error(msg); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'progress') { setProgressStep(data.step); setProgressMessages(p => [...p.slice(-20), { step: data.step, message: data.message, time: new Date() }]); if (data.sessionId) setSessionId(data.sessionId); }
            else if (data.type === 'complete') {
              let completedFiles = data.files || [];
              let completedPreview = data.preview || '';

              // Restore base64 images that were stripped before sending to AI
              if (editFiles && completedFiles.length > 0) {
                const oldHtml = editFiles.find(f => f.name.endsWith('.html'))?.content || '';
                const base64Images = oldHtml.match(/data:(?:image|video)\/[^;]+;base64,[A-Za-z0-9+/=]{500,}/g) || [];
                if (base64Images.length > 0) {
                  completedFiles = completedFiles.map(f => {
                    if (!f.name.endsWith('.html')) return f;
                    let html = f.content;
                    let idx = 0;
                    while (html.match(/EXISTING_MEDIA_\d+_DO_NOT_REMOVE/) && idx < base64Images.length) {
                      html = html.replace(/EXISTING_MEDIA_\d+_DO_NOT_REMOVE/, base64Images[idx]);
                      idx++;
                    }
                    return { ...f, content: html };
                  });
                  const htmlFile = completedFiles.find(f => f.name.endsWith('.html'));
                  if (htmlFile) completedPreview = htmlFile.content;
                }
              }

              // ── Replace MEDIA_SLOT comments AND new placeholder images with actual media ──
              if (currentPendingMedia.length > 0 && completedFiles.length > 0) {
                completedFiles = completedFiles.map(f => {
                  if (!f.name.endsWith('.html')) return f;
                  let html = f.content;
                  let unusedMedia = [];
                  currentPendingMedia.forEach((m, i) => {
                    const marker = `<!-- MEDIA_SLOT_${i + 1} -->`;
                    let replacement = '';
                    if (m.type === 'image') {
                      replacement = `<img src="data:${m.mimeType};base64,${m.base64}" alt="User image" style="width:100%;max-height:600px;object-fit:cover;display:block;margin:0 auto;border-radius:8px;" />`;
                    } else if (m.type === 'video-url') {
                      replacement = m.embedHtml;
                    } else if (m.type === 'veo-video') {
                      replacement = m.embedHtml;
                    }
                    if (html.includes(marker)) {
                      html = html.replace(marker, replacement);
                    } else {
                      unusedMedia.push({ ...m, replacement });
                    }
                  });
                  if (unusedMedia.length > 0) {
                    const oldHtmlSrc = editFiles ? (editFiles.find(ef => ef.name.endsWith('.html'))?.content || '') : '';
                    unusedMedia.forEach(m => {
                      if (m.type === 'image') {
                        const placeholderPatterns = [
                          /(<img\s[^>]*src=["'])(https?:\/\/placehold\.co\/[^"']+)(["'][^>]*>)/g,
                          /(<img\s[^>]*src=["'])(https?:\/\/via\.placeholder\.com\/[^"']+)(["'][^>]*>)/g,
                          /(<img\s[^>]*src=["'])(https?:\/\/placehold\.it\/[^"']+)(["'][^>]*>)/g,
                          /(<img\s[^>]*src=["'])(https?:\/\/dummyimage\.com\/[^"']+)(["'][^>]*>)/g,
                          /(<img\s[^>]*src=["'])([^"']*(?:placeholder|Placeholder|PLACEHOLDER)[^"']*)(["'][^>]*>)/g,
                        ];
                        for (const pattern of placeholderPatterns) {
                          const match = pattern.exec(html);
                          if (match && !oldHtmlSrc.includes(match[2])) {
                            html = html.replace(match[0], m.replacement);
                            break;
                          }
                          pattern.lastIndex = 0;
                        }
                      }
                    });
                  }
                  return { ...f, content: html };
                });
                const htmlFile = completedFiles.find(f => f.name.endsWith('.html'));
                if (htmlFile) completedPreview = htmlFile.content;
              }

              // ── Replace USER_PHOTO_PLACEHOLDER with actual uploaded photo (skip if pendingMedia handled it) ──
              const pendingHandledImage = currentPendingMedia.some(m => m.type === 'image');
              if (uploadedPhoto && completedFiles.length > 0 && !pendingHandledImage) {
                const photoDataUrl = `data:${uploadedPhoto.mimeType};base64,${uploadedPhoto.base64}`;
                completedFiles = completedFiles.map(f => {
                  if (!f.name.endsWith('.html')) return f;
                  let html = f.content;
                  if (html.includes('USER_PHOTO_PLACEHOLDER')) {
                    html = html.replace(/USER_PHOTO_PLACEHOLDER/g, photoDataUrl);
                  }
                  return { ...f, content: html };
                });
                const htmlFile = completedFiles.find(f => f.name.endsWith('.html'));
                if (htmlFile) completedPreview = htmlFile.content;
              }



              // ── Replace USER_PHOTO_PLACEHOLDER for vibe-transformed photos ──
              if (vibeResult && completedFiles.length > 0 && !pendingHandledImage) {
                const b64 = vibeResult.split(',')[1];
                const mime = vibeResult.split(':')[1]?.split(';')[0] || 'image/png';
                if (b64) {
                  completedFiles = completedFiles.map(f => {
                    if (!f.name.endsWith('.html')) return f;
                    let html = f.content;
                    if (html.includes('USER_PHOTO_PLACEHOLDER')) {
                      html = html.replace(/USER_PHOTO_PLACEHOLDER/g, `data:${mime};base64,${b64}`);
                    }
                    return { ...f, content: html };
                  });
                  const htmlFile = completedFiles.find(f => f.name.endsWith('.html'));
                  if (htmlFile) completedPreview = htmlFile.content;
                }
              }

              setFiles(completedFiles);
              setPreview(completedPreview);
              setCoinData(p => ({ ...p, balance: data.balanceRemaining }));
              if (iframeRef.current && completedPreview) iframeRef.current.srcdoc = completedPreview;
              setProgressStep('done'); setGenResult('done');
              const doneMsg = `Done! ${data.fileCount} file(s) using ${MODEL_LABELS[data.model] || data.model}. Cost: ${(data.blSpent||0).toLocaleString()} BL.`;
              setProgressMessages(p => [...p, { step: 'done', message: doneMsg, time: new Date() }]);
              const aiChatMsg = { role: 'ai', content: `✅ ${doneMsg}`, timestamp: new Date().toISOString() };
              setChatMessages(prev => [...prev.slice(-19), aiChatMsg]);
              saveMessageToMemory('ai', `Built with ${MODEL_LABELS[data.model] || data.model}. ${data.fileCount} file(s) generated.`);
              // ── Auto-save after every successful generation ──
              autoSaveProject(completedFiles, completedPreview);
              // Clear ALL media AFTER insertion to prevent re-insertion
              if (imgResults.length > 0) setImgResults([]);
              if (vibeResult) { setVibeResult(null); setUploadedPhoto(null); }
              if (currentPendingMedia.length > 0) setPendingMedia([]);
              if (uploadedPhoto) setUploadedPhoto(null);
              if (videoResult) setVideoResult(null);
              if (youtubeUrl) setYoutubeUrl('');
              setImgPrompt('');
              setVideoPrompt('');
              setVibeCustomPrompt('');
              api.get('/api/build/available-models').then(r => setAvailableModels(r.data.models || [])).catch(() => {});
              if (isMobile) setTimeout(() => setMobileView('preview'), 1500);
            }
            else if (data.type === 'error') { setProgressStep('error'); setGenResult('error'); setProgressMessages(p => [...p, { step: 'error', message: data.error + (data.suggestion ? ` — ${data.suggestion}` : ''), time: new Date() }]); }
            else if (data.type === 'stopped') { setProgressStep('stopped'); setGenResult('stopped'); setProgressMessages(p => [...p, { step: 'stopped', message: data.message || 'Stopped. Coins refunded.', time: new Date() }]); }
            else if (data.type === 'fallback_needed') { setGenerating(false); setProgressStep('error'); setGenResult('error'); setFallbackDialog({ currentModel: data.currentModel, nextModel: data.nextModel, nextModelId: data.nextModelId, nextCost: data.nextCost, balance: data.balance, isGroqWarn: data.isGroqWarn, noMoreModels: data.noMoreModels, onConfirm: () => { if (data.nextModelId) { setSelectedModel(data.nextModelId); setFallbackDialog(null); setPendingChatSubmit(true); } } }); }
          } catch (e) { console.warn('[SSE] Parse error:', e.message); }
        }
      }
    } catch (err) { if (err.name === 'AbortError') { if (!genResult) { setProgressStep('stopped'); setGenResult('stopped'); } } else { setProgressStep('error'); setGenResult('error'); setProgressMessages(p => [...p, { step: 'error', message: err.message || 'Connection failed', time: new Date() }]); } }
    finally { abortControllerRef.current = null; setGenerating(false); setSessionId(null); }
  };

  useEffect(() => { if (pendingChatSubmit && !generating) { setPendingChatSubmit(false); handleGenerate(); } }, [pendingChatSubmit, generating]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleStop = async () => { if (abortControllerRef.current) abortControllerRef.current.abort(); try { await api.post('/api/build/stop', { sessionId }); } catch {} setProgressStep('stopped'); setGenResult('stopped'); setProgressMessages(p => [...p, { step: 'stopped', message: 'Stopped. Coins refunded.', time: new Date() }]); setGenerating(false); };
  const handleDismissProgress = () => { setGenResult(null); setProgressMessages([]); setProgressStep(''); };
  const handleSaveProject = async () => { if (!files.length) return alert('No files'); try { const payload = { projectId: currentProjectId, name: projectName || 'Untitled', files, preview, template, description: prompt, skipSanitize: true }; if (editingDeployedSite) payload.subdomain = editingDeployedSite; const { data } = await api.post('/api/build/save-project', payload); setCurrentProjectId(data.project.projectId); alert(`Saved! (v${data.project.version})`); } catch (e) { alert(e.response?.data?.error || 'Save failed'); } };

  // ── Auto-save: silently saves current files to the project after every generation ──
  // skipSanitize=true so base64 images are preserved during editing
  const autoSaveProject = async (filesToSave, previewToSave) => {
    try {
      const pid = currentProjectId;
      if (!pid || !filesToSave?.length) return;
      const payload = { projectId: pid, name: projectName || 'Untitled', files: filesToSave, preview: (previewToSave || '').slice(0, 50000), template, skipSanitize: true };
      if (editingDeployedSite) payload.subdomain = editingDeployedSite;
      const { data } = await api.post('/api/build/save-project', payload);
      if (data.project?.projectId) setCurrentProjectId(data.project.projectId);
      console.log(`[AutoSave] Saved v${data.project?.version || '?'} — ${filesToSave.length} file(s)`);
    } catch (e) {
      console.warn('[AutoSave] Failed:', e.response?.data?.error || e.message);
      // Silent fail — auto-save is a safety net, not critical
    }
  };
  const handleDeploy = async () => {
    if (!files.length) return alert('Generate or load files first');
    setDeploying(true);
    try {
      if (editingDeployedSite && currentProjectId) {
        // Send CURRENT files from browser directly to redeploy
        // This ensures the live site gets exactly what the user sees in preview
        const { data } = await api.post('/api/build/redeploy-from-project', {
          projectId: currentProjectId,
          currentFiles: files, // Send browser files directly
          name: projectName || 'Untitled',
        });
        setDeployUrl(data.url);
        alert(`Re-deployed to ${data.url}!`);
      } else {
        if (!subdomain.trim()) return alert('Enter a subdomain');
        const { data } = await api.post('/api/build/deploy', { subdomain: subdomain.toLowerCase(), files, title: projectName || subdomain });
        setDeployUrl(data.url);
        if (data.linkedProjectId) setCurrentProjectId(data.linkedProjectId);
        setEditingDeployedSite(data.subdomain);
        alert(`Deployed to ${data.url}!`);
      }
    } catch (e) { alert(e.response?.data?.error || 'Deploy failed'); }
    finally { setDeploying(false); }
  };
  const handleCloneAnalyze = async () => { if (!cloneUrl.trim()) return; setAnalyzing(true); try { const { data } = await api.post('/api/build/clone-analyze', { url: cloneUrl }); setCloneAnalysis(data.analysis); } catch (e) { alert(e.response?.data?.error || 'Failed'); } finally { setAnalyzing(false); } };
  const handleFileUpload = (fileList) => { const uploaded = Array.from(fileList); const zips = uploaded.filter(f => f.name.endsWith('.zip')); const texts = uploaded.filter(f => !f.name.endsWith('.zip')); if (zips.length) { const fd = new FormData(); zips.forEach(f => fd.append('files', f)); api.post('/api/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(({ data }) => { setFixFiles(p => [...p, ...data.files]); alert(`${data.totalFiles} files extracted`); }).catch(e => alert(e.response?.data?.error || 'ZIP failed')); } if (texts.length) Promise.all(texts.map(f => new Promise(r => { const rd = new FileReader(); rd.onload = e => r({ name: f.name, content: e.target.result }); rd.readAsText(f); }))).then(p => setFixFiles(prev => [...prev, ...p])); };
  const handleCodeFix = async () => { if (!fixFiles.length) return alert('Upload files first'); setFixing(true); try { const { data } = await api.post('/api/build/code-fix', { files: fixFiles, description: fixDescription, model: effectiveModel }); setFiles(data.files || []); setPreview(data.preview || ''); setCoinData(p => ({ ...p, balance: data.balanceRemaining })); if (iframeRef.current && data.preview) iframeRef.current.srcdoc = data.preview; setTab('build'); if (isMobile) setMobileView('preview'); } catch (e) { alert(e.response?.data?.error || 'Fix failed'); } finally { setFixing(false); } };

  const modelSelectorItems = (() => { const items = []; const availableIds = new Set(availableModels.map(m => m.id)); for (const m of availableModels) items.push({ ...m, locked: false }); for (const m of ALL_MODELS_DISPLAY) { if (!availableIds.has(m.id)) items.push({ id: m.id, name: m.name, cost: BL_COST_LABELS[m.id] || 5000, available: false, locked: true, requiredTier: m.tier, monthlyLimit: '—', monthlyUsed: 0, type: 'locked' }); } return items; })();
  const showProgress = generating || (genResult && progressMessages.length > 0);
  const pColor = genResult === 'error' ? '#ef4444' : genResult === 'done' ? '#22c55e' : genResult === 'stopped' ? '#f59e0b' : '#6366f1';
  const isEditMode = files.length > 0 || editingDeployedSite;
  const existingCodeSize = files.reduce((sum, f) => sum + (f.content?.length || 0), 0);
  const groqTooSmallForEdit = isEditMode && effectiveModel === 'groq' && existingCodeSize > 5000;

  const renderAIMediaPanel = () => (<div style={{ marginTop: 4 }}><button style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${showMediaPanel ? '#00E5A0' : 'var(--border)'}`, background: showMediaPanel ? 'rgba(0,229,160,0.08)' : 'transparent', color: showMediaPanel ? '#00E5A0' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.2s' }} onClick={() => setShowMediaPanel(!showMediaPanel)}>{showMediaPanel ? '▼' : '▶'} 🎨 AI Media — Images · Photo Editor · Video</button>{showMediaPanel && (<div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'rgba(255,255,255,0.02)' }}><div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>{[['images','🖼️ Images'],['photo','✏️ Photo'],['video','🎬 Video']].map(([id, label]) => (<button key={id} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${mediaTab === id ? '#6366f1' : 'var(--border)'}`, background: mediaTab === id ? 'rgba(99,102,241,0.15)' : 'transparent', color: mediaTab === id ? '#6366f1' : 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setMediaTab(id)}>{label}</button>))}</div>{mediaTab === 'images' && (<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}><div style={{ position: 'relative' }}><input style={{ width: '100%', padding: '7px 10px', paddingRight: voiceSupported ? 32 : 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} placeholder="Describe the image (e.g. 'hero banner for BBQ restaurant at sunset')" value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} />{voiceSupported && <button onClick={() => toggleImgVoice(imgPrompt)} style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: '50%', border: 'none', background: imgVoiceListening ? 'rgba(255,80,80,0.2)' : 'rgba(99,102,241,0.15)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{imgVoiceListening ? '🔴' : '🎙️'}</button>}</div><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{['photorealistic','illustration','minimalist','luxury','cyberpunk','watercolor'].map(s => (<button key={s} style={{ padding: '3px 7px', borderRadius: 100, border: `1px solid ${imgStyle === s ? '#00E5A0' : 'var(--border)'}`, background: imgStyle === s ? 'rgba(0,229,160,0.08)' : 'transparent', color: imgStyle === s ? '#00E5A0' : 'var(--text-muted)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }} onClick={() => setImgStyle(s)}>{s}</button>))}</div><div style={{ display: 'flex', gap: 4 }}>{['16:9','1:1','4:3','9:16'].map(r => (<button key={r} style={{ padding: '3px 7px', borderRadius: 6, border: `1px solid ${imgAspect === r ? '#6366f1' : 'var(--border)'}`, background: imgAspect === r ? 'rgba(99,102,241,0.15)' : 'transparent', color: imgAspect === r ? '#6366f1' : 'var(--text-muted)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setImgAspect(r)}>{r}</button>))}</div><button style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={handleGenerateImages} disabled={imgGenerating}>{imgGenerating ? '⏳ Generating...' : '⚡ Generate Image (Imagen 4) — 5K BL'}</button>{imgResults.length > 0 && (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>{imgResults.map((img, i) => (<div key={i} style={{ position: 'relative' }}><img src={`data:${img.mimeType};base64,${img.base64}`} alt={`AI ${i}`} style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border)', display: 'block' }} /><button style={{ position: 'absolute', bottom: 4, right: 4, padding: '3px 6px', borderRadius: 4, border: 'none', background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }} onClick={() => insertImageIntoSite(img.base64, img.mimeType)}>Insert</button></div>))}</div>)}</div>)}{mediaTab === 'photo' && (<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}><div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 14, textAlign: 'center', cursor: 'pointer', background: uploadedPhoto ? 'rgba(0,229,160,0.04)' : 'transparent' }} onClick={() => photoInputRef.current?.click()}><input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePhotoUpload(e.target.files)} />{uploadedPhoto ? <img src={uploadedPhoto.preview} alt="Uploaded" style={{ width: '100%', maxHeight: 90, objectFit: 'contain', borderRadius: 4 }} /> : <><div style={{ fontSize: 18, marginBottom: 4 }}>📸</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Upload photo, logo, or product image</div></>}</div>{uploadedPhoto && (<><button style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginBottom: 8 }} onClick={() => insertImageIntoSite(uploadedPhoto.base64, uploadedPhoto.mimeType)}>📸 Insert Original Photo into Site — FREE</button><div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>— OR transform it first with AI below —</div><div style={{ marginBottom: 4 }}><div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 600 }}>QUICK PRESETS (or type your own below):</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{VIBE_PRESETS.map(p => (<button key={p.id} style={{ padding: '3px 7px', borderRadius: 100, border: `1px solid ${vibePreset === p.id && !vibeCustomPrompt ? '#00E5A0' : 'var(--border)'}`, background: vibePreset === p.id && !vibeCustomPrompt ? 'rgba(0,229,160,0.08)' : 'transparent', color: vibePreset === p.id && !vibeCustomPrompt ? '#00E5A0' : 'var(--text-muted)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => { setVibePreset(p.id); setVibeCustomPrompt(''); }}>{p.label}</button>))}</div></div><div><div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>OR DESCRIBE EXACTLY WHAT YOU WANT:</div><div style={{ position: 'relative' }}><textarea value={vibeCustomPrompt} onChange={e => setVibeCustomPrompt(e.target.value)} placeholder="e.g. Make this cat fishing for shark in the ocean, dramatic waves, sunset sky" style={{ width: '100%', padding: '8px 10px', paddingRight: voiceSupported ? 32 : 10, borderRadius: 8, border: `1px solid ${vibeCustomPrompt ? '#8b5cf6' : 'var(--border)'}`, background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', minHeight: 56, boxSizing: 'border-box', lineHeight: 1.5 }} />{voiceSupported && <button onClick={() => toggleVibeVoice(vibeCustomPrompt)} style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: vibeVoiceListening ? 'rgba(255,80,80,0.2)' : 'rgba(139,92,246,0.15)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{vibeVoiceListening ? '🔴' : '🎙️'}</button>}</div>{vibeCustomPrompt && <div style={{ fontSize: 10, color: '#8b5cf6', marginTop: 3 }}>✓ Custom prompt will override preset</div>}</div><button style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={handleVibeTransform} disabled={vibeGenerating}>{vibeGenerating ? '⏳ Transforming...' : vibeCustomPrompt ? `✨ "${vibeCustomPrompt.slice(0,30)}${vibeCustomPrompt.length>30?'…':''}" — 5K BL` : `✨ ${vibePreset.replace('-',' ')} Transform — 5K BL`}</button>{vibeResult && (<div><img src={vibeResult} alt="Transformed" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border)', display: 'block', marginBottom: 5 }} /><button style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }} onClick={() => { const b64 = vibeResult.split(',')[1]; const mime = vibeResult.split(':')[1].split(';')[0]; insertImageIntoSite(b64, mime); }}>Insert into Site</button></div>)}{uploadedPhoto && (<div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(8,145,178,0.08)', border: '1px solid rgba(8,145,178,0.25)', borderRadius: 8 }}><div style={{ fontSize: 10, fontWeight: 700, color: '#0891b2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>🎬 Transform Photo to Video</div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>AI will animate your uploaded photo based on the prompt above</div><button style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#0f766e,#0891b2)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }} onClick={() => { setVideoPrompt(vibeCustomPrompt.trim() || 'animate this photo with natural movement'); setMediaTab('video'); setTimeout(() => handleGenerateVideo(), 100); }} disabled={videoGenerating}>{videoGenerating ? '⏳ Generating Video...' : '🎬 Animate Photo to Video — 50K BL'}</button></div>)}</>)}</div>)}{mediaTab === 'video' && (<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}><div style={{ background: 'rgba(255,0,0,0.04)', border: '1px solid rgba(255,0,0,0.15)', borderRadius: 10, padding: 10 }}><div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>📺 Embed Video from URL</div><input style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${detectVideoPlatform(youtubeUrl) ? 'rgba(0,229,160,0.4)' : 'var(--border)'}`, background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 6 }} placeholder="Paste video URL (YouTube, Facebook, Vimeo, TikTok, Instagram, X...)" value={youtubeUrl} onChange={e => { setYoutubeUrl(e.target.value); if (selectedModel !== 'gemini-2.5-flash') setSelectedModel('gemini-2.5-flash'); }} />{youtubeUrl && detectVideoPlatform(youtubeUrl) && (<div style={{ marginBottom: 6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><span style={{ fontSize: 10, color: '#00e5a0', fontWeight: 600 }}>✅ {detectVideoPlatform(youtubeUrl).platform.charAt(0).toUpperCase() + detectVideoPlatform(youtubeUrl).platform.slice(1)} video detected</span></div>{getThumbnail(youtubeUrl) && <div style={{ aspectRatio: '16/9', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', maxHeight: 120 }}><img src={getThumbnail(youtubeUrl)} alt="Video thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}</div>)}{youtubeUrl && !detectVideoPlatform(youtubeUrl) && <div style={{ fontSize: 10, color: '#ef4444', marginBottom: 4 }}>⚠ Unrecognized URL — try YouTube, Facebook, Vimeo, TikTok, Instagram, or X</div>}<div style={{ display: 'flex', gap: 6 }}><button style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!youtubeUrl || !detectVideoPlatform(youtubeUrl)) ? 0.5 : 1 }} onClick={insertVideoUrlIntoSite} disabled={!youtubeUrl || !detectVideoPlatform(youtubeUrl)}>▶ Quick Insert — FREE</button></div><div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Or paste the URL in chat with instructions like "Put this video in the About section, full width"</div></div><div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>— OR generate AI video below —</div><div style={{ position: 'relative' }}><input style={{ width: '100%', padding: '7px 10px', paddingRight: voiceSupported ? 32 : 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} placeholder="Describe the video (e.g. 'drone shot over restaurant at golden hour')" value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} />{voiceSupported && <button onClick={() => toggleVideoVoice(videoPrompt)} style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: '50%', border: 'none', background: videoVoiceListening ? 'rgba(255,80,80,0.2)' : 'rgba(99,102,241,0.15)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{videoVoiceListening ? '🔴' : '🎙️'}</button>}</div><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Duration:</span>{[5,6,8].map(d => (<button key={d} style={{ padding: '3px 7px', borderRadius: 6, border: `1px solid ${videoDuration === d ? '#6366f1' : 'var(--border)'}`, background: videoDuration === d ? 'rgba(99,102,241,0.15)' : 'transparent', color: videoDuration === d ? '#6366f1' : 'var(--text-muted)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setVideoDuration(d)}>{d}s</button>))}</div><button style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#0f766e,#0891b2)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={handleGenerateVideo} disabled={videoGenerating}>{videoGenerating ? '⏳ Generating... (~1-3 min)' : '🎬 Generate Video (Veo) — 50K BL'}</button>{videoResult && (<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{videoResult.publicUrl ? (<video src={videoResult.publicUrl} autoPlay loop muted playsInline style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', maxHeight: 180, objectFit: 'cover' }} />) : (<div style={{ padding: '8px 10px', background: 'rgba(0,229,160,0.06)', borderRadius: 8, fontSize: 11, color: '#00E5A0' }}>✅ Video generated!</div>)}<div style={{ fontSize: 10, color: 'var(--text-muted)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{videoResult.publicUrl || videoResult.gcsUri}</div>{videoResult.publicUrl && files.length > 0 && (<button style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={insertVeoVideoIntoSite}>🎬 Insert Video into Site</button>)}</div>)}</div>)}</div>)}</div>);

  const EditModeBanner = () => { if (!isEditMode || tab !== 'build') return null; return (<div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 10, border: '1px solid rgba(99,102,241,.3)', background: 'rgba(99,102,241,.08)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: groqTooSmallForEdit ? 6 : 0 }}><span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>✏️ Edit Mode</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— AI will modify your existing website, not create a new one</span></div>{groqTooSmallForEdit && (<div style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,.1)', padding: '4px 8px', borderRadius: 4 }}>⚠️ Groq can't handle files this large ({Math.round(existingCodeSize / 1000)}K chars). Use Gemini Flash or higher for better edits.</div>)}</div>); };

  const SystemPromptPanel = () => (<div style={{ marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: 'var(--bg-elevated)', cursor: 'pointer', marginBottom: showSystemPrompt ? 8 : 0 }} onClick={() => setShowSystemPrompt(!showSystemPrompt)}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: autoAttachPrompt ? '#22c55e' : 'var(--text-muted)' }}>{showSystemPrompt ? '▼' : '▶'} System Prompt</span><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: autoAttachPrompt ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)', color: autoAttachPrompt ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{autoAttachPrompt ? 'ON' : 'OFF'}</span></div><div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}><button style={{ padding: '3px 8px', borderRadius: 4, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer', background: autoAttachPrompt ? 'rgba(34,197,94,.2)' : 'rgba(255,255,255,.06)', color: autoAttachPrompt ? '#22c55e' : 'var(--text-muted)' }} onClick={toggleAutoAttach}>{autoAttachPrompt ? '✓ Auto' : '✗ Auto'}</button></div></div>{showSystemPrompt && (<div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg-card)' }}><div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>{[{id:'gen',label:'New Website'},{id:'edit',label:'Edit Website'},{id:'fix',label:'Fix Bugs'}].filter(m => !(m.id === 'gen' && isEditMode)).map(m => (<button key={m.id} style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, border: activePromptMode === m.id ? '1px solid #22c55e' : '1px solid var(--border)', background: activePromptMode === m.id ? 'rgba(34,197,94,.15)' : 'transparent', color: activePromptMode === m.id ? '#22c55e' : 'var(--text-secondary)' }} onClick={() => loadDefaultForMode(m.id)}>{m.label}</button>))}</div><textarea value={systemPromptText} onChange={e => setSystemPromptText(e.target.value)} placeholder="System prompt instructions for the AI..." style={{ width: '100%', minHeight: 150, maxHeight: 300, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'Consolas, monospace', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }} /><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 6 }}><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{systemPromptText.length.toLocaleString()} chars</span><div style={{ display: 'flex', gap: 4 }}><button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 10, fontWeight: 600 }} onClick={saveSystemPrompt}>💾 Save</button><button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontWeight: 600 }} onClick={resetSystemPrompt}>↺ Reset</button><button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 10, fontWeight: 600 }} onClick={deleteSystemPrompt}>✗ Clear</button></div></div></div>)}</div>);

  const renderFallbackDialog = () => { if (!fallbackDialog) return null; const { currentModel, nextModel, nextCost, balance, onConfirm, isGroqWarn, noMoreModels } = fallbackDialog; return (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}><div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 400, width: '100%' }}>{noMoreModels ? (<><div style={{ fontSize: 20, marginBottom: 12 }}>⚠️</div><div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>AI is currently unresponsive</div><p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>Please try again in a few minutes. Upgrading your plan gives you access to more AI models as backup.</p><div style={{ display: 'flex', gap: 8 }}><button style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }} onClick={() => { setFallbackDialog(null); handleGenerate(); }}>Try Again</button><button style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }} onClick={() => { setFallbackDialog(null); window.location.href = '/pricing'; }}>View Plans</button></div></>) : isGroqWarn ? (<><div style={{ fontSize: 20, marginBottom: 12 }}>⚠️</div><div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#f59e0b' }}>All preferred AI models unresponsive</div><p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>Last option: <strong style={{ color: '#f59e0b' }}>Groq AI</strong> — Cost: <strong style={{ color: '#f59e0b' }}>{(nextCost || 5000).toLocaleString()} BL</strong></p><p style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8, marginBottom: 20, lineHeight: 1.6 }}>⚠️ WARNING: Groq may produce incomplete code for large websites. Some sections may be missing.</p><div style={{ display: 'flex', gap: 8 }}><button style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }} onClick={onConfirm}>Try Groq Anyway</button><button style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }} onClick={() => setFallbackDialog(null)}>Cancel</button></div></>) : (<><div style={{ fontSize: 20, marginBottom: 12 }}>⚠️</div><div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#F0F4F8' }}>{currentModel} is not responding</div><div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span style={{ color: 'var(--text-muted)' }}>Next AI:</span><strong style={{ color: '#6366f1' }}>{nextModel}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span style={{ color: 'var(--text-muted)' }}>Cost:</span><strong style={{ color: '#f59e0b' }}>{(nextCost || 0).toLocaleString()} BL</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--text-muted)' }}>Your balance:</span><strong style={{ color: '#22c55e' }}>{(balance || 0).toLocaleString()} BL</strong></div></div><p style={{ fontSize: 12, color: '#22c55e', marginBottom: 20 }}>✅ Your last 20 messages and 5 summaries will transfer automatically.</p><div style={{ display: 'flex', gap: 8 }}><button style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }} onClick={onConfirm}>Yes, use {nextModel}</button><button style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }} onClick={() => setFallbackDialog(null)}>Cancel</button></div></>)}</div></div>); };

  const renderMemoryPanel = () => { if (!currentProjectId || (memorySummaries.length === 0 && chatMessages.length === 0)) return null; return (<div style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(99,102,241,0.08)', cursor: 'pointer' }} onClick={() => setMemoryExpanded(!memoryExpanded)}><span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>📋 Memory: {memorySummaries.length} summar{memorySummaries.length !== 1 ? 'ies' : 'y'} · {chatMessages.length} message{chatMessages.length !== 1 ? 's' : ''}</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{memoryExpanded ? '▲ collapse' : '▼ expand'}</span></div>{memoryExpanded && (<div style={{ padding: 12, background: 'var(--bg-elevated)', maxHeight: 200, overflowY: 'auto' }}>{memorySummaries.map((s, i) => (<div key={i} style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(99,102,241,0.06)', borderRadius: 8, borderLeft: '2px solid #6366f1' }}><div style={{ fontSize: 10, color: '#6366f1', fontWeight: 700, marginBottom: 4 }}>Summary {i + 1} — {s.messageRange} · {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ''}</div><p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{s.content}</p></div>))}{memorySummaries.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>No summaries yet — summaries are created every 20 messages.</p>}</div>)}</div>); };

  const renderChatHistory = () => { if (chatMessages.length === 0) return null; return (<div style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}><div style={{ padding: '6px 12px', background: 'var(--bg-elevated)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>💬 Conversation History</div><div style={{ maxHeight: 240, overflowY: 'auto', padding: '8px 0' }}>{chatMessages.map((m, i) => (<div key={i} style={{ padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}><span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{m.role === 'user' ? '👤' : '🤖'}</span><div style={{ flex: 1 }}><p style={{ fontSize: 12, color: m.role === 'user' ? 'var(--text-primary)' : m.isQuestion ? '#f59e0b' : 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{m.content}</p>{m.timestamp && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}</div></div>))}<div ref={chatEndRef} /></div></div>); };

  const ProgressPanel = () => showProgress && progressMessages.length > 0 ? (<div style={{ padding: 12, background: `${pColor}11`, borderBottom: `1px solid ${pColor}33`, borderRadius: isMobile ? 10 : 0, margin: isMobile ? '0 0 10px 0' : 0 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 700, color: pColor }}>{generating ? '⚡ Generating...' : genResult === 'done' ? '✅ Complete' : genResult === 'error' ? '❌ Failed' : '⛔ Stopped'}</span><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{generating && (<><span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.15)', padding: '2px 8px', borderRadius: 6 }}>{Math.min(95, Math.round((progressMessages.length / 12) * 100))}%</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>~{Math.max(5, 60 - Math.round((progressMessages.length / 12) * 55))}s left</span></>)}{generating && <button style={{ padding: '5px 12px', borderRadius: 8, border: '2px solid #ef4444', background: 'rgba(239,68,68,.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: 12 }} onClick={handleStop}>⛔ Stop</button>}{!generating && genResult && <button style={{ padding: '5px 12px', fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }} onClick={handleDismissProgress}>✕</button>}</div></div>{generating && (<div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginBottom: 8, overflow: 'hidden' }}><div style={{ height: '100%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 2, width: `${Math.min(95, Math.round((progressMessages.length / 12) * 100))}%`, transition: 'width 1s ease' }} /></div>)}<div style={{ maxHeight: isMobile ? 200 : 250, overflowY: 'auto' }}>{progressMessages.map((m, i) => (<div key={i} style={{ padding: '4px 0', fontSize: 12, color: m.step === 'error' ? '#ef4444' : m.step === 'building' ? '#06b6d4' : 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'flex-start' }}><div style={{ width: 7, height: 7, borderRadius: 4, marginTop: 4, flexShrink: 0, background: m.step === 'error' ? '#ef4444' : m.step === 'done' ? '#22c55e' : m.step === 'stopped' ? '#f59e0b' : m.step === 'building' ? '#06b6d4' : '#6366f1' }} /><span>{m.message}</span></div>))}<div ref={progressEndRef} /></div>{genResult === 'error' && !generating && <button style={{ marginTop: 8, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }} onClick={() => { handleDismissProgress(); handleGenerate(); }}>🔄 Retry</button>}{isMobile && genResult === 'done' && preview && (<div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}><button style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }} onClick={() => setMobileView('preview')}>👁️ View Preview & Deploy</button><button style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }} onClick={() => window.location.href = '/projects'}>← Back to Projects</button></div>)}</div>) : null;

  // ── MOBILE LAYOUT ──
  if (isMobile) { return (<div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', overflow: 'hidden' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', flexWrap: 'wrap', gap: 6 }}><div style={{ display: 'flex', gap: 3 }}>{[{id:'build',label:'💬 Build',view:'build'},{id:'clone',label:'🔄 Clone',view:'build'},{id:'fix',label:'🔧 Fix',view:'build'}].map(t => (<button key={t.id} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: tab === t.id ? '#6366f1' : 'transparent', color: tab === t.id ? '#fff' : 'var(--text-secondary)' }} onClick={() => { setTab(t.id); setMobileView(t.view); }}>{t.label}</button>))}{preview && (<button style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: mobileView === 'preview' ? '#22c55e' : 'transparent', color: mobileView === 'preview' ? '#fff' : '#22c55e' }} onClick={() => setMobileView('preview')}>👁️ Preview</button>)}</div><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, color: '#000', background: TIER_COLORS[plan] }}>{plan.toUpperCase()}</span><span style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b', padding: '3px 8px', borderRadius: 10, fontWeight: 700, fontSize: 12 }}>🪙 {formatBL(balance)}</span></div></div>{mobileView === 'build' && (<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}><div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>{tab === 'build' && (<><ProgressPanel /><EditModeBanner /><div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}><input style={{ flex: 1, minWidth: 100, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, boxSizing: 'border-box' }} placeholder="Project name" value={projectName} onChange={e => setProjectName(e.target.value)} />{files.length > 0 && (<><button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #22c55e', background: 'transparent', color: '#22c55e', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={handleSaveProject}>💾 Save</button><button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => { const h = files.find(f => f.name.endsWith('.html')); if (h) { const b = new Blob([h.content], { type: 'text/html' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'index.html'; a.click(); } }}>💾 HTML</button></>)}</div><button style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px solid ${showModelPanel ? '#6366f1' : 'var(--border)'}`, background: showModelPanel ? 'rgba(99,102,241,0.08)' : 'transparent', color: showModelPanel ? '#6366f1' : 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', marginBottom: 6 }} onClick={() => setShowModelPanel(!showModelPanel)}>{showModelPanel ? '▼' : '▶'} 🤖 AI Model: {MODEL_LABELS[effectiveModel] || effectiveModel}</button>{showModelPanel && (<div style={{ marginBottom: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>{modelSelectorItems.map(m => (<button key={m.id} style={{ padding: '4px 8px', borderRadius: 6, border: effectiveModel === m.id ? '1px solid #6366f1' : m.locked ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--border)', cursor: m.available ? 'pointer' : 'default', fontWeight: 600, fontSize: 10, background: effectiveModel === m.id ? 'rgba(99,102,241,.2)' : 'transparent', color: effectiveModel === m.id ? '#6366f1' : m.locked ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: m.locked ? 0.5 : 1 }} onClick={() => m.available && !m.locked && setSelectedModel(m.id)} disabled={!m.available || m.locked}>{m.locked ? '🔒 ' : ''}{m.name} {!m.locked && `(${formatBL(m.cost)})`}</button>))}</div>)}<SystemPromptPanel />{renderAIMediaPanel()}</>)}{tab === 'clone' && (<><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>🔄 Clone a Website</div><input style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} placeholder="https://example.com" value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} /><button style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#6366f1', color: '#fff' }} onClick={handleCloneAnalyze} disabled={analyzing}>{analyzing ? 'Analyzing...' : 'Analyze'}</button>{cloneAnalysis && <><pre style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: 12, marginTop: 8, fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{JSON.stringify(cloneAnalysis, null, 2)}</pre><button style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#22c55e', color: '#fff', marginTop: 8 }} onClick={() => { setPrompt(`Rebuild:\n${JSON.stringify(cloneAnalysis, null, 2)}`); setTab('build'); }}>Rebuild →</button></>}</>)}{tab === 'fix' && (<><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>🔧 Fix Your Code</div><div style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 16, textAlign: 'center', cursor: 'pointer', marginBottom: 8 }} onClick={() => fileInputRef.current?.click()}><input ref={fileInputRef} type="file" multiple accept=".html,.css,.js,.jsx,.ts,.tsx,.json,.py,.zip" onChange={e => handleFileUpload(e.target.files)} style={{ display: 'none' }} /><p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>📁 Tap to upload files</p></div>{fixFiles.length > 0 && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fixFiles.length} file(s)</span><button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, marginLeft: 8 }} onClick={() => setFixFiles([])}>Clear</button></div>}<textarea style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', minHeight: 60, fontFamily: 'inherit', boxSizing: 'border-box' }} placeholder="Describe what needs fixing..." value={fixDescription} onChange={e => setFixDescription(e.target.value)} /><button style={{ padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#8b5cf6', color: '#fff', marginTop: 8, width: '100%' }} onClick={handleCodeFix} disabled={fixing}>{fixing ? 'Fixing...' : `Fix Code (${cost.toLocaleString()} BL)`}</button></>)}</div>{tab === 'build' && (<div style={{ padding: 10, borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>{renderMemoryPanel()}{renderChatHistory()}<div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 6 }}><div style={{ flex: 1, position: 'relative' }}>{voiceSupported && (<button onClick={() => toggleVoice(chatInput)} style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 2, width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', background: voiceListening ? 'rgba(255,80,80,0.2)' : 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{voiceListening ? '🔴' : '🎙️'}</button>)}<textarea style={{ width: '100%', padding: 10, paddingRight: voiceSupported ? 40 : 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, resize: 'none', height: 56, fontFamily: 'inherit', boxSizing: 'border-box' }} placeholder={awaitingClarify ? "Answer AI's question…" : isEditMode ? "Describe changes…" : "Describe what you want to build…"} value={chatInput} onChange={e => handleChatInputChange(e.target.value)} onKeyDown={handleChatKeyDown} /></div><button style={{ padding: '10px 14px', borderRadius: 8, border: 'none', cursor: aiThinking || generating ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, background: aiThinking || generating ? 'var(--bg-elevated)' : awaitingClarify ? '#f59e0b' : '#6366f1', color: aiThinking || generating ? 'var(--text-muted)' : '#fff', opacity: aiThinking || generating ? 0.6 : 1, flexShrink: 0, height: 56, fontFamily: 'inherit' }} onClick={handleSendChat} disabled={aiThinking || generating || !chatInput.trim()}>{aiThinking ? '🤔' : generating ? '⚡' : '➤'}</button></div>{voiceListening && <div style={{ fontSize: 11, color: '#FFBD2E', marginTop: 3 }}>🔴 Listening… (5s silence stops)</div>}{voiceError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{voiceError}</div>}<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, fontSize: 11 }}><span style={{ color: 'var(--text-muted)' }}>Cost: <strong style={{ color: '#f59e0b' }}>{cost.toLocaleString()} BL</strong></span>{generating && <button style={{ padding: '5px 10px', borderRadius: 6, border: '2px solid #ef4444', background: 'rgba(239,68,68,.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: 11, fontFamily: 'inherit' }} onClick={handleStop}>⛔ Stop</button>}</div></div>)}</div>)}{mobileView === 'preview' && (<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{preview ? (<><iframe ref={iframeRef} srcDoc={preview} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} title="Preview" sandbox="allow-scripts allow-same-origin" /><div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><input style={{ flex: 1, minWidth: '100%', padding: '10px 12px', borderRadius: 8, border: editingDeployedSite ? '1px solid #22c55e' : '1px solid var(--border)', background: editingDeployedSite ? 'rgba(34,197,94,.08)' : 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }} placeholder="Enter subdomain (.zapcodes.net)" value={subdomain} onChange={e => { if (!editingDeployedSite) setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} readOnly={!!editingDeployedSite} />{editingDeployedSite && <div style={{ fontSize: 10, color: '#22c55e', padding: '2px 0' }}>🔒 Subdomain locked — editing deployed site</div>}<button style={{ padding: '12px 20px', borderRadius: 8, border: 'none', cursor: deploying ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, background: deploying ? 'var(--bg-elevated)' : '#22c55e', color: '#fff', opacity: deploying ? .5 : 1, width: '100%' }} onClick={handleDeploy} disabled={deploying}>{deploying ? 'Deploying...' : editingDeployedSite ? '🚀 Re-deploy to .zapcodes.net' : '🚀 Deploy to .zapcodes.net'}</button></div>{deployUrl && <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,.1)', fontSize: 12 }}>✅ Live at <a href={deployUrl} target="_blank" rel="noreferrer" style={{ color: '#22c55e', fontWeight: 600 }}>{deployUrl}</a></div>}<button style={{ padding: '10px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={() => window.location.href='/projects'}>← Back to Projects</button></>) : (<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.3)', fontSize: 16, textAlign: 'center', padding: 30 }}>{generating ? '⚡ Generating...' : 'No preview yet.\nGenerate a website first!'}<br /><br /><button style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }} onClick={() => window.location.href='/projects'}>← Back to Projects</button></div>)}</div>)}{codeViewFile && (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }} onClick={() => setCodeViewFile(null)}><div style={{ background: 'var(--bg-card, #1e1e2e)', border: '1px solid var(--border, #333)', borderRadius: 14, width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}><div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>📄 {codeViewFile.name}</span><div style={{ display: 'flex', gap: 6 }}><button style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => navigator.clipboard.writeText(codeViewFile.content)}>📋</button><button style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,.2)', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => setCodeViewFile(null)}>✕</button></div></div><pre style={{ flex: 1, margin: 0, padding: 16, overflow: 'auto', fontSize: 11, lineHeight: 1.5, color: '#e0e0e0', background: '#0d0d1a', fontFamily: "Consolas, monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{codeViewFile.content}</pre></div></div>)}</div>); }

  // ── DESKTOP LAYOUT ──
  const s = { page: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', overflow: 'hidden' }, topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', flexWrap: 'wrap', gap: 8 }, tabs: { display: 'flex', gap: 4 }, tab: (a) => ({ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: a ? '#6366f1' : 'transparent', color: a ? '#fff' : 'var(--text-secondary)', transition: 'all .2s' }), stats: { display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }, main: { display: 'flex', flex: 1, overflow: 'hidden' }, leftPanel: { width: '40%', minWidth: 340, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg-surface)' }, rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', background: '#1a1a2e' }, chatArea: { flex: 1, padding: 16, overflowY: 'auto' }, inputArea: { padding: 16, borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }, textarea: { width: '100%', padding: 12, paddingRight: 48, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, resize: 'vertical', minHeight: 80, fontFamily: 'inherit', boxSizing: 'border-box' }, genBtn: (d) => ({ padding: '12px 24px', borderRadius: 10, border: 'none', cursor: d ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, background: d ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: d ? 'var(--text-muted)' : '#fff', opacity: d ? .5 : 1, flex: 1 }), stopBtn: { padding: '12px 20px', borderRadius: 10, border: '2px solid #ef4444', background: 'rgba(239,68,68,.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: 14 }, iframe: { width: '100%', height: '100%', border: 'none', background: '#fff' }, emptyPreview: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(255,255,255,.3)', fontSize: 18, textAlign: 'center', padding: 40 }, fileItem: { padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', marginBottom: 4, fontSize: 13, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }, dropZone: { border: '2px dashed var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer', marginBottom: 12 }, modelBtn: (selected, available, locked) => ({ padding: '6px 10px', borderRadius: 8, border: selected ? '1px solid #6366f1' : locked ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--border)', cursor: available ? 'pointer' : 'default', fontWeight: 600, fontSize: 11, background: selected ? 'rgba(99,102,241,.2)' : locked ? 'rgba(255,255,255,0.02)' : 'transparent', color: selected ? '#6366f1' : locked ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: locked ? 0.5 : available ? 1 : 0.6, transition: 'all .2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 80 }) };

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <div style={s.tabs}><button style={s.tab(tab === 'build')} onClick={() => setTab('build')}>💬 AI Builder</button><button style={s.tab(tab === 'clone')} onClick={() => setTab('clone')}>🔄 Clone</button><button style={s.tab(tab === 'fix')} onClick={() => setTab('fix')}>🔧 Code Fix</button>{tc.canProDev && <button style={s.tab(tab === 'pro')} onClick={() => setTab('pro')}>⚡ Pro Dev</button>}</div>
        <div style={s.stats}><span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, color: '#000', background: TIER_COLORS[plan] }}>{plan.toUpperCase()}</span><span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(99,102,241,.2)', color: '#6366f1' }}>{MODEL_LABELS[effectiveModel] || effectiveModel}</span><span style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b', padding: '4px 10px', borderRadius: 12, fontWeight: 700, fontSize: 13 }}>🪙 {formatBL(balance)}</span></div>
      </div>
      <div style={s.main}>
        <div style={s.leftPanel}>
          {tab === 'build' && (<>
            <div style={s.chatArea}>
              {/* ── Project Name + Save/HTML/New Tab at top ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <input style={{ flex: 1, minWidth: 120, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }} placeholder="Project name (optional)" value={projectName} onChange={e => setProjectName(e.target.value)} />
                {files.length > 0 && (<div style={{ display: 'flex', gap: 4, flexShrink: 0 }}><button style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #22c55e', background: 'transparent', color: '#22c55e', cursor: 'pointer', fontWeight: 600, fontSize: 11 }} onClick={handleSaveProject}>💾 Save</button><button style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 11 }} onClick={() => { const h = files.find(f => f.name.endsWith('.html')); if (h) { const b = new Blob([h.content], { type: 'text/html' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'index.html'; a.click(); } }}>💾 HTML</button><button style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#f59e0b', color: '#000', cursor: 'pointer', fontWeight: 600, fontSize: 11 }} onClick={() => { const h = files.find(f => f.name.endsWith('.html')); if (h) window.open(URL.createObjectURL(new Blob([h.content], { type: 'text/html' })), '_blank'); }}>🔗 New Tab</button>{undoStack.length > 0 && <button style={{ padding: '6px 12px', borderRadius: 7, border: '2px solid #f59e0b', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', cursor: 'pointer', fontWeight: 700, fontSize: 11 }} onClick={undoLastInsert}>↩️ Undo</button>}</div>)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{isEditMode ? '✏️ Edit your website' : '💬 Build your website'}</div>
              <ProgressPanel />
              <EditModeBanner />
              {/* ── AI Model — collapsible ── */}
              <button style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${showModelPanel ? '#6366f1' : 'var(--border)'}`, background: showModelPanel ? 'rgba(99,102,241,0.08)' : 'transparent', color: showModelPanel ? '#6366f1' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.2s', marginBottom: 8 }} onClick={() => setShowModelPanel(!showModelPanel)}>{showModelPanel ? '▼' : '▶'} 🤖 AI Model: {MODEL_LABELS[effectiveModel] || effectiveModel}</button>
              {showModelPanel && (<div style={{ marginBottom: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{modelSelectorItems.map(m => (<button key={m.id} style={s.modelBtn(effectiveModel === m.id, m.available, m.locked)} onClick={() => m.available && !m.locked && setSelectedModel(m.id)} disabled={!m.available || m.locked} title={m.locked ? `Requires ${m.requiredTier?.charAt(0).toUpperCase() + m.requiredTier?.slice(1)}+` : `${m.name} — ${formatBL(m.cost)} BL`}><span style={{ fontSize: 12, fontWeight: 700 }}>{m.locked ? '🔒 ' : ''}{m.name}</span>{!m.locked && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatBL(m.cost)} BL{m.monthlyLimit && m.monthlyLimit !== 'Unlimited' && m.monthlyLimit !== '—' ? ` · ${m.monthlyUsed || 0}/${m.monthlyLimit}` : m.monthlyLimit === 'Unlimited' ? ' · ∞' : ''}{m.type === 'one_time_trial' ? ' (trial)' : ''}</span>}{m.locked && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{m.requiredTier?.charAt(0).toUpperCase() + m.requiredTier?.slice(1)}+</span>}</button>))}</div></div>)}
              <SystemPromptPanel />
              {renderAIMediaPanel()}
              {renderMemoryPanel()}
              {renderChatHistory()}
            </div>
            <div style={s.inputArea}>
              {pendingMedia.length > 0 && (<div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', marginBottom: 6, fontSize: 11 }}><span style={{ color: '#22c55e', fontWeight: 700 }}>📎 {pendingMedia.length} media queued:</span> {pendingMedia.map(m => m.label).join(', ')} — <span style={{ color: 'var(--text-muted)' }}>Type WHERE to place {pendingMedia.length === 1 ? 'it' : 'them'} below</span><button style={{ marginLeft: 8, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 10, fontWeight: 600 }} onClick={() => setPendingMedia([])}>✕ Clear</button></div>)}
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}><div style={{ flex: 1, position: 'relative' }}><textarea style={{ ...s.textarea, minHeight: 60, paddingRight: voiceSupported ? 38 : 12 }} placeholder={pendingMedia.length > 0 ? `Tell AI where to place your ${pendingMedia.map(m => m.label).join(' & ')} (e.g. "put it in the hero section, full width")` : awaitingClarify ? "Answer AI's question above, then press Send…" : isEditMode ? "Describe changes, or ask AI anything about your site…" : "Describe your website or app…"} value={chatInput} onChange={e => handleChatInputChange(e.target.value)} onKeyDown={handleChatKeyDown} />{voiceSupported && (<button onClick={() => toggleVoice(chatInput)} style={{ position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', background: voiceListening ? 'rgba(255,80,80,0.2)' : 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }} title="Speak — appends to your message">{voiceListening ? '🔴' : '🎙️'}</button>)}</div><button style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: aiThinking || generating ? 'var(--bg-elevated)' : awaitingClarify ? '#f59e0b' : '#6366f1', color: aiThinking || generating ? 'var(--text-muted)' : '#fff', fontWeight: 700, fontSize: 13, cursor: aiThinking || generating ? 'not-allowed' : 'pointer', opacity: aiThinking || generating ? 0.6 : 1, flexShrink: 0, fontFamily: 'inherit', height: 60 }} onClick={handleSendChat} disabled={aiThinking || generating || !chatInput.trim()}>{aiThinking ? '🤔' : generating ? '⚡' : awaitingClarify ? 'Reply ➤' : 'Send ➤'}</button></div>
              {voiceListening && <div style={{ fontSize: 11, color: '#FFBD2E', marginTop: 4 }}>🔴 Listening… (5s silence auto-stops)</div>}
              {voiceError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{voiceError}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 11 }}><span style={{ color: 'var(--text-muted)' }}>Cost: <strong style={{ color: '#f59e0b' }}>{cost.toLocaleString()} BL</strong> {balance < cost && <span style={{ color: '#ef4444' }}>(insufficient)</span>}</span>{generating && <button style={{ padding: '5px 12px', borderRadius: 8, border: '2px solid #ef4444', background: 'rgba(239,68,68,.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }} onClick={handleStop}>⛔ Stop</button>}</div>
            </div>
          </>)}
          {tab === 'clone' && (<div style={s.chatArea}><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🔄 Clone a Website</div><input style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} placeholder="https://example.com" value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} /><button style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: '#6366f1', color: '#fff' }} onClick={handleCloneAnalyze} disabled={analyzing}>{analyzing ? 'Analyzing...' : 'Analyze'}</button>{cloneAnalysis && <><pre style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, marginTop: 12, fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>{JSON.stringify(cloneAnalysis, null, 2)}</pre><button style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: '#22c55e', color: '#fff', marginTop: 12 }} onClick={() => { setPrompt(`Rebuild:\n${JSON.stringify(cloneAnalysis, null, 2)}`); setTab('build'); }}>Rebuild with AI →</button></>}</div>)}
          {tab === 'fix' && (<div style={s.chatArea}><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🔧 Fix Your Code</div><div style={{ ...s.dropZone, ...(dragActive ? { borderColor: '#6366f1' } : {}) }} onDragOver={e => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.length) handleFileUpload(e.dataTransfer.files); }} onClick={() => fileInputRef.current?.click()}><input ref={fileInputRef} type="file" multiple accept=".html,.css,.js,.jsx,.ts,.tsx,.json,.py,.zip" onChange={e => handleFileUpload(e.target.files)} style={{ display: 'none' }} /><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{dragActive ? '📦 Drop here!' : '📁 Drag & drop or click'}</p></div>{fixFiles.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fixFiles.length} file(s)</span><button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }} onClick={() => setFixFiles([])}>Clear</button></div>{fixFiles.slice(0, 10).map((f, i) => <div key={i} style={{ ...s.fileItem, cursor: 'default' }}>{f.name}</div>)}</div>}<textarea style={s.textarea} placeholder="Describe what needs fixing..." value={fixDescription} onChange={e => setFixDescription(e.target.value)} /><button style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: '#8b5cf6', color: '#fff', marginTop: 12 }} onClick={handleCodeFix} disabled={fixing}>{fixing ? 'Fixing...' : `Fix Code (${cost.toLocaleString()} BL)`}</button></div>)}
          {tab === 'pro' && <div style={s.chatArea}><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>⚡ Pro Dev</div><p style={{ color: 'var(--text-secondary)' }}>🚧 Coming soon</p></div>}
        </div>
        <div style={s.rightPanel}>
          {preview ? (<><iframe ref={iframeRef} srcDoc={preview} style={s.iframe} title="Preview" sandbox="allow-scripts allow-same-origin" /><div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: editingDeployedSite ? '1px solid #22c55e' : '1px solid var(--border)', background: editingDeployedSite ? 'rgba(34,197,94,.08)' : 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }} placeholder="subdomain" value={subdomain} onChange={e => { if (!editingDeployedSite) setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} readOnly={!!editingDeployedSite} /><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>.zapcodes.net</span><button style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: deploying ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, background: deploying ? 'var(--bg-elevated)' : '#22c55e', color: '#fff', opacity: deploying ? .5 : 1 }} onClick={handleDeploy} disabled={deploying}>{deploying ? 'Deploying...' : editingDeployedSite ? '🚀 Re-deploy' : '🚀 Deploy'}</button></div>{editingDeployedSite && <div style={{ fontSize: 10, color: '#22c55e', marginTop: 4 }}>🔒 Subdomain locked — editing deployed site</div>}</div>{deployUrl && <div style={{ padding: '8px 16px', background: 'rgba(34,197,94,.1)', fontSize: 13 }}>✅ Live at <a href={deployUrl} target="_blank" rel="noreferrer" style={{ color: '#22c55e', fontWeight: 600 }}>{deployUrl}</a></div>}</>) : (<div style={s.emptyPreview}>{generating ? '⚡ Generating...' : genResult === 'error' ? '' : 'Your preview will appear here.\nDescribe what you want to build!'}</div>)}
        </div>
      </div>
      {renderFallbackDialog()}
      {codeViewFile && (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setCodeViewFile(null)}><div style={{ background: 'var(--bg-card, #1e1e2e)', border: '1px solid var(--border, #333)', borderRadius: 16, width: '90%', maxWidth: 800, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}><div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>📄 {codeViewFile.name}</span><div style={{ display: 'flex', gap: 8 }}><button style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => navigator.clipboard.writeText(codeViewFile.content)}>📋 Copy</button><button style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => { const b = new Blob([codeViewFile.content], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = codeViewFile.name; a.click(); }}>💾 Download</button><button style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,.2)', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => setCodeViewFile(null)}>✕</button></div></div><pre style={{ flex: 1, margin: 0, padding: 20, overflow: 'auto', fontSize: 12, lineHeight: 1.6, color: '#e0e0e0', background: '#0d0d1a', fontFamily: "Consolas, 'Fira Code', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{codeViewFile.content}</pre></div></div>)}
    </div>
  );
}
