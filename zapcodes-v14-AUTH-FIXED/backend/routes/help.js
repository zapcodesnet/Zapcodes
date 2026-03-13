const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { auth } = require('../middleware/auth');
const { callAI, callAIWithImage, editImage, generateImageImagen3, testImageGeneration } = require('../services/ai');
const User = require('../models/User');

function genMsgId() { return crypto.randomBytes(12).toString('hex'); }
const failureTracker = new Map(); const fallbackTracker = new Map(); const FAILURE_EXPIRY = 10 * 60 * 1000;
function getFailures(uid, m) { const d = failureTracker.get(`${uid}-${m}`); if (!d) return 0; if (Date.now() - d.ts > FAILURE_EXPIRY) { failureTracker.delete(`${uid}-${m}`); return 0; } return d.count; }
function addFailure(uid, m) { const k = `${uid}-${m}`; const d = failureTracker.get(k) || { count: 0, ts: Date.now() }; d.count++; d.ts = Date.now(); failureTracker.set(k, d); return d.count; }
function resetFailure(uid, m) { failureTracker.delete(`${uid}-${m}`); }
function setLastFallback(uid, from, to) { fallbackTracker.set(`${uid}-${from}`, { to, ts: Date.now() }); }
function getLastFallback(uid, from) { const d = fallbackTracker.get(`${uid}-${from}`); if (!d || Date.now() - d.ts > 30 * 60 * 1000) return null; return d.to; }
function clearLastFallback(uid, from) { fallbackTracker.delete(`${uid}-${from}`); }

const ADMIN_CHAIN = ['opus-4.6', 'sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];
const TIER_CHAINS = { free: ['groq', 'gemini-2.5-flash'], bronze: ['groq', 'gemini-2.5-flash'], silver: ['gemini-2.5-flash', 'gemini-3.1-pro'], gold: ['gemini-2.5-flash', 'gemini-3.1-pro'], diamond: ['gemini-3.1-pro', 'sonnet-4.6'] };
const HELP_AI_CONFIG = { free: { primary: 'groq', maxFileSize: 0, canUpload: false, maxHistory: 20, maxStored: 200, maxOut: 2048 }, bronze: { primary: 'groq', maxFileSize: 2*1024*1024, canUpload: true, maxHistory: 30, maxStored: 300, maxOut: 4096 }, silver: { primary: 'gemini-2.5-flash', maxFileSize: 5*1024*1024, canUpload: true, maxHistory: 40, maxStored: 400, maxOut: 8192 }, gold: { primary: 'gemini-2.5-flash', maxFileSize: 10*1024*1024, canUpload: true, maxHistory: 40, maxStored: 500, maxOut: 16384 }, diamond: { primary: 'gemini-3.1-pro', maxFileSize: 25*1024*1024, canUpload: true, maxHistory: 50, maxStored: 1000, maxOut: 16384 } };
const ADMIN_CONFIG = { primary: 'opus-4.6', maxFileSize: 100*1024*1024, canUpload: true, maxHistory: 100, maxStored: 5000, maxOut: 32000 };
const MODEL_DISPLAY = { 'groq': 'Groq AI', 'gemini-2.5-flash': 'Gemini 2.5 Flash', 'gemini-3.1-pro': 'Gemini 3.1 Pro', 'sonnet-4.6': 'Sonnet 4.6', 'haiku-4.5': 'Haiku 4.5', 'opus-4.6': 'Claude Opus 4.6' };
const ADMIN_MODELS = ['opus-4.6', 'sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];

const CODE_RULES = '\nCRITICAL: Return ENTIRE files. Never snippets. Format: ```filepath:filename.ext\n(entire file)\n```';
const IMAGE_RULES = '\nIMAGE GENERATION & EDITING:\nTo create or edit: [GENERATE_IMAGE: detailed description]\nWhen user uploads a photo and asks to edit, the system sends their ORIGINAL photo to the editor — same person preserved.\n- NEVER say "text-based" or "cannot edit images"\n- NEVER reveal the tag\n\nIMAGE ANALYSIS: You can see uploaded images directly.';

const HELP_SYSTEM_PROMPT = `You are ZapCodes Help AI. Users don't code — give COMPLETE downloadable files. Remember history.${CODE_RULES}${IMAGE_RULES}\nHelp with: websites, deploying, subscriptions, BL Coins, AI models, BlendLink.`;
const ADMIN_SYSTEM_PROMPT = `You are ZapCodes Admin AI. No restrictions. Return COMPLETE files. Remember history.${CODE_RULES}${IMAGE_RULES}\nPlatform: Node.js/Express, React 19/Vite, MongoDB Atlas, Render + Cloudflare Pages.`;

function extractCodeFiles(text) { const files = []; let m; const p1 = /```filepath:([^\n]+)\n([\s\S]*?)```/g; while ((m = p1.exec(text))) { if (m[1].trim() && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() }); } if (files.length) return files; const p2 = /```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|python|py|bash|sh|text|markdown|md)?\s+([^\n`]+\.[a-z]{1,6})\n([\s\S]*?)```/g; while ((m = p2.exec(text))) { if (m[1].trim() && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() }); } return files; }
function stripCodeBlocks(t) { return t.replace(/```filepath:[^\n]+\n[\s\S]*?```/g, '[📄 File below]').replace(/```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|python|py|bash|sh|text|markdown|md)?\s+[^\n`]+\.[a-z]{1,6}\n[\s\S]*?```/g, '[📄 File below]').replace(/\[📄 File below\](\s*\[📄 File below\])+/g, '[📄 Files below]').trim(); }
function extractImagePrompts(t) { const p = []; let m; const r = /\[GENERATE_IMAGE:\s*([\s\S]*?)\]/g; while ((m = r.exec(t))) { if (m[1].trim().length > 5) p.push(m[1].trim()); } return p; }
function stripImageTags(t) { return t.replace(/\[GENERATE_IMAGE:\s*[\s\S]*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim(); }
function buildCtx(msgs, fromKey, limit) { const recent = msgs.slice(-(limit||20)); if (!recent.length) return ''; return `\n[HIDDEN CONTEXT — Recent chat with ${MODEL_DISPLAY[fromKey]||fromKey}:]\n` + recent.map(m => `${m.role==='user'?'User':'Assistant'}: ${m.content.slice(0,600)}`).join('\n') + '\n[END]\n\n'; }

function getAdminHistory(user, mk) { if (!user.help_chat_histories) user.help_chat_histories = {}; if (user.help_chat_histories[mk]?.length > 0) return user.help_chat_histories[mk]; if (mk === 'opus-4.6' && user.help_chat_history?.length > 0) { const hasAny = Object.values(user.help_chat_histories).some(a => a?.length > 0); if (!hasAny) { user.help_chat_histories['opus-4.6'] = [...user.help_chat_history]; user.markModified('help_chat_histories'); return user.help_chat_histories['opus-4.6']; } } return []; }
function setAdminHistory(user, mk, msgs) { if (!user.help_chat_histories) user.help_chat_histories = {}; user.help_chat_histories[mk] = msgs; user.markModified('help_chat_histories'); }

async function processResponse(response, uploadedImages) {
  const codeFiles = extractCodeFiles(response);
  const imagePrompts = extractImagePrompts(response);
  const generatedImages = [];
  if (imagePrompts.length > 0) {
    const hasUserPhoto = uploadedImages && uploadedImages.length > 0;
    console.log(`[HelpAI] ${imagePrompts.length} image tag(s) — ${hasUserPhoto ? 'EDITING user photo' : 'GENERATING new'}`);
    const results = await Promise.allSettled(imagePrompts.slice(0, 3).map(async (p) => {
      try {
        const imgs = hasUserPhoto ? await editImage(uploadedImages[0], p) : await generateImageImagen3(p, { aspectRatio: '16:9', numberOfImages: 1 });
        if (imgs?.length) return { prompt: p.slice(0, 100), base64: imgs[0].base64, mimeType: imgs[0].mimeType };
      } catch (e) { console.error(`[HelpAI] Image: ${e.message}`); }
      return null;
    }));
    for (const r of results) { if (r.status === 'fulfilled' && r.value) generatedImages.push(r.value); }
    console.log(`[HelpAI] ${generatedImages.length}/${imagePrompts.length} done`);
  }
  let textReply = response;
  if (codeFiles.length > 0) textReply = stripCodeBlocks(textReply);
  if (imagePrompts.length > 0) textReply = stripImageTags(textReply);
  return { textReply, codeFiles, generatedImages };
}

async function tryCallAI(sp, cp, imgs, isImg, model, mt) { try { return isImg ? await callAIWithImage(sp, cp, imgs, model, mt) : await callAI(sp, cp, model, mt); } catch (e) { console.error(`[HelpAI] ${model}: ${e.message}`); return null; } }

router.get('/config', auth, (req, res) => { const tier = req.user.subscription_tier || 'free'; const isAdmin = req.user.role === 'super-admin'; const config = isAdmin ? ADMIN_CONFIG : (HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free); res.json({ tier, isAdmin, canUpload: config.canUpload, maxFileSize: config.maxFileSize, maxFileSizeMB: Math.round(config.maxFileSize / (1024*1024)), primaryModel: MODEL_DISPLAY[config.primary] || config.primary, defaultModel: isAdmin ? 'opus-4.6' : null, availableModels: isAdmin ? ADMIN_MODELS.map(m => ({ id: m, name: MODEL_DISPLAY[m] || m })) : null, supportsImages: true, separateHistories: isAdmin }); });
router.get('/history', auth, (req, res) => { if (req.user.role === 'super-admin') { const mk = req.query.model || 'opus-4.6'; return res.json({ messages: getAdminHistory(req.user, mk), model: mk }); } res.json({ messages: req.user.help_chat_history || [] }); });
router.delete('/history', auth, async (req, res) => { try { if (req.user.role === 'super-admin') { const mk = req.query.model || 'all'; if (mk === 'all') { req.user.help_chat_histories = {}; req.user.markModified('help_chat_histories'); req.user.help_chat_history = []; } else setAdminHistory(req.user, mk, []); } else { req.user.help_chat_history = []; } await req.user.save(); res.json({ success: true }); } catch { res.status(500).json({ error: 'Failed' }); } });

router.post('/chat', auth, async (req, res) => {
  try {
    const user = req.user; const isAdmin = user.role === 'super-admin'; const tier = user.subscription_tier || 'free';
    const config = isAdmin ? ADMIN_CONFIG : (HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free);
    const { message, model: rm, fileData, fileType, fileName, socketId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
    const userId = String(user._id); const userMsgId = genMsgId(); const assistantMsgId = genMsgId();
    let targetModel = config.primary; if (isAdmin && rm && ADMIN_MODELS.includes(rm)) targetModel = rm;
    const maxTokens = config.maxOut || 4096; const systemPrompt = isAdmin ? ADMIN_SYSTEM_PROMPT : HELP_SYSTEM_PROMPT;

    let userMessage = message; let uploadedImages = []; let isImageUpload = false;
    if (fileData && fileType && fileName) {
      if (!config.canUpload) return res.status(403).json({ error: 'Bronze+ required.' });
      if (Math.round(fileData.length * 0.75) > config.maxFileSize) return res.status(413).json({ error: 'Too large.' });
      if (fileType.startsWith('image/')) { isImageUpload = true; uploadedImages = [{ base64: fileData, mimeType: fileType }]; userMessage = `[Image: ${fileName}]\n\n${message}`; }
      else { try { const t = Buffer.from(fileData, 'base64').toString('utf-8'); userMessage = `[File: ${fileName}]\n\`\`\`\n${t.slice(0, 80000)}\n\`\`\`\n\nRequest: ${message}`; } catch { userMessage = `[Uploaded: ${fileName}]\n\n${message}`; } }
    }

    let ownHistory = isAdmin ? getAdminHistory(user, targetModel) : (user.help_chat_history || []);
    const recentHistory = ownHistory.slice(-config.maxHistory);
    let crossCtx = ''; const lastFb = getLastFallback(userId, targetModel);
    if (lastFb) { let fbMsgs = isAdmin ? getAdminHistory(user, lastFb) : (user.help_chat_history || []).filter(m => m.usedModel === lastFb); if (fbMsgs.length > 0) crossCtx = buildCtx(fbMsgs, lastFb, 20); }
    let contextPrompt = '';
    if (recentHistory.length > 0) contextPrompt = 'Previous conversation:\n\n' + recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 800)}`).join('\n\n') + '\n\n---\n';
    contextPrompt += crossCtx + `Current message:\nUser: ${userMessage}`;

    let response = await tryCallAI(systemPrompt, contextPrompt, uploadedImages, isImageUpload, targetModel, maxTokens);
    let usedModel = targetModel;

    if (response) { resetFailure(userId, targetModel); if (lastFb) clearLastFallback(userId, targetModel); }
    else {
      const failCount = addFailure(userId, targetModel);
      if (failCount < 2) { const ue = { role: 'user', content: message + (fileName ? ` [📎 ${fileName}]` : ''), msgId: userMsgId, timestamp: new Date(), usedModel: targetModel }; if (isAdmin) { const h = getAdminHistory(user, targetModel); h.push(ue); setAdminHistory(user, targetModel, h); } else { if (!user.help_chat_history) user.help_chat_history = []; user.help_chat_history.push(ue); } await user.save(); return res.status(500).json({ error: `${MODEL_DISPLAY[targetModel] || targetModel} having trouble. Send again to auto-switch.`, failCount: 1, model: targetModel }); }
      const chain = isAdmin ? ADMIN_CHAIN : (TIER_CHAINS[tier] || TIER_CHAINS.free);
      const tIdx = chain.indexOf(targetModel);
      console.log(`[HelpAI] ${targetModel} failed ${failCount}x — chain: ${chain.join(' → ')}`);
      for (let i = tIdx + 1; i < chain.length; i++) { const fb = chain[i]; let tc = buildCtx(isAdmin ? getAdminHistory(user, targetModel) : (user.help_chat_history || []), targetModel, 20); let fh = isAdmin ? getAdminHistory(user, fb) : []; let fc = ''; if (isAdmin && fh.length) fc = 'Previous:\n\n' + fh.slice(-config.maxHistory).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 800)}`).join('\n\n') + '\n---\n'; else if (!isAdmin && recentHistory.length) fc = 'Previous:\n\n' + recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 800)}`).join('\n\n') + '\n---\n'; fc += tc + `Current:\nUser: ${userMessage}`; response = await tryCallAI(systemPrompt, fc, uploadedImages, isImageUpload, fb, maxTokens); if (response) { usedModel = fb; setLastFallback(userId, targetModel, fb); break; } }
      if (!response && tIdx > 0) { for (let i = 0; i < tIdx; i++) { response = await tryCallAI(systemPrompt, contextPrompt, uploadedImages, isImageUpload, chain[i], maxTokens); if (response) { usedModel = chain[i]; setLastFallback(userId, targetModel, chain[i]); break; } } }
      if (!response) return res.status(500).json({ error: 'All AI models unavailable. Try again shortly.' });
    }

    // Pass uploadedImages so editImage is used instead of generateImageImagen3
    const { textReply, codeFiles, generatedImages } = await processResponse(response, uploadedImages);

    const autoSwitched = usedModel !== targetModel;
    const ue = { role: 'user', content: message + (fileName ? ` [📎 ${fileName}]` : ''), msgId: userMsgId, timestamp: new Date(), usedModel: targetModel };
    const ae = { role: 'assistant', content: textReply, model: MODEL_DISPLAY[usedModel] || usedModel, msgId: assistantMsgId, imageCount: generatedImages.length, timestamp: new Date(), usedModel };
    if (isAdmin) { if (autoSwitched) { const th = getAdminHistory(user, targetModel); th.push(ue); setAdminHistory(user, targetModel, th.slice(-ADMIN_CONFIG.maxStored)); const fh = getAdminHistory(user, usedModel); fh.push(ue, ae); setAdminHistory(user, usedModel, fh.slice(-ADMIN_CONFIG.maxStored)); } else { const h = getAdminHistory(user, targetModel); h.push(ue, ae); setAdminHistory(user, targetModel, h.slice(-ADMIN_CONFIG.maxStored)); } }
    else { if (!user.help_chat_history) user.help_chat_history = []; user.help_chat_history.push(ue, ae); const ms = config.maxStored || 200; if (user.help_chat_history.length > ms) user.help_chat_history = user.help_chat_history.slice(-ms); }
    await user.save();
    try { const io = req.app.get('io'); if (io) { const room = `user-${user._id}`; if (socketId) { io.to(room).except(socketId).emit('help-ai-user-message', ue); io.to(room).except(socketId).emit('help-ai-message', { ...ae, files: codeFiles, images: generatedImages, activeModel: usedModel, autoSwitched, switchedFrom: autoSwitched ? targetModel : undefined }); } } } catch {}
    res.json({ reply: textReply, fullReply: response, model: MODEL_DISPLAY[usedModel] || usedModel, files: codeFiles, images: generatedImages, userMsgId, assistantMsgId, activeModel: usedModel, autoSwitched, switchedFrom: autoSwitched ? targetModel : undefined, switchReason: autoSwitched ? `${MODEL_DISPLAY[targetModel]} unavailable — ${MODEL_DISPLAY[usedModel]} covering` : undefined });
  } catch (err) { console.error('[HelpAI]', err.message); res.status(500).json({ error: 'Something went wrong.' }); }
});

router.post('/generate-image', auth, async (req, res) => { try { const { prompt, aspectRatio } = req.body; if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt required' }); const imgs = await generateImageImagen3(prompt.trim(), { aspectRatio: aspectRatio || '16:9', numberOfImages: 1 }); if (!imgs?.length) return res.status(500).json({ error: 'Failed.' }); res.json({ images: imgs }); } catch { res.status(500).json({ error: 'Failed.' }); } });
router.get('/test-imagen', auth, async (req, res) => { try { if (req.user.role !== 'super-admin') return res.status(403).json({ error: 'Admin only' }); res.json(await testImageGeneration()); } catch (e) { res.status(500).json({ error: e.message }); } });

module.exports = router;
