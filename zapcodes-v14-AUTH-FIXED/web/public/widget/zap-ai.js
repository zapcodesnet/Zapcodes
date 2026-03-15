/**
 * ZapCodes AI Widget — zap-ai.js
 * Pure vanilla JS. No dependencies. No React. No jQuery.
 * Served from: https://zapcodes-api.onrender.com/widget/zap-ai.js
 *
 * Usage — automatically injected into user's site HTML by ZapCodes builder:
 *   <script>
 *     window.ZapAI = {
 *       siteToken: "your-token-here",
 *       position: "bottom-right",
 *       apiBase: "https://zapcodes-api.onrender.com"
 *     };
 *   </script>
 *   <script src="https://zapcodes-api.onrender.com/widget/zap-ai.js" defer></script>
 */

(function () {
  'use strict';

  // ── Config from window.ZapAI ──────────────────────────────────────────────
  var cfg = window.ZapAI || {};
  if (!cfg.siteToken) { console.warn('[ZapAI] No siteToken set.'); return; }

  var API_BASE   = cfg.apiBase || 'https://zapcodes-api.onrender.com';
  var TOKEN      = cfg.siteToken;
  var POSITION   = cfg.position || 'bottom-right';

  // ── Session identity (per browser tab, clears on close) ──────────────────
  var SESSION_KEY = 'zapai_session_' + TOKEN;
  var sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }

  // ── Remote config (loaded from backend) ───────────────────────────────────
  var widgetConfig = {
    widgetTitle: 'Ask Us Anything',
    greetingMsg: 'Hi! How can I help you today?',
    themeColor:  '#6366f1',
    paused:      false,
  };

  // ── State ──────────────────────────────────────────────────────────────────
  var isOpen      = false;
  var isTyping    = false;
  var messageHistory = [];

  // ── Styles ─────────────────────────────────────────────────────────────────
  function injectStyles(color) {
    var style = document.getElementById('zapai-styles');
    if (style) style.remove();
    style = document.createElement('style');
    style.id = 'zapai-styles';
    style.textContent = [
      '#zapai-bubble{position:fixed;width:56px;height:56px;border-radius:50%;',
      'background:' + color + ';box-shadow:0 4px 24px rgba(0,0,0,0.25);',
      'cursor:pointer;display:flex;align-items:center;justify-content:center;',
      'font-size:24px;z-index:999998;border:none;transition:transform .2s,box-shadow .2s;}',
      '#zapai-bubble:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,0.32);}',
      '#zapai-window{position:fixed;width:340px;max-width:calc(100vw - 24px);',
      'height:480px;max-height:calc(100vh - 100px);',
      'background:#0f1117;border:1px solid #2a2d3a;border-radius:16px;',
      'box-shadow:0 8px 40px rgba(0,0,0,0.5);z-index:999999;',
      'display:flex;flex-direction:column;overflow:hidden;',
      'transition:opacity .2s,transform .2s;}',
      '#zapai-window.zapai-hidden{opacity:0;transform:translateY(12px) scale(0.97);pointer-events:none;}',
      '#zapai-header{padding:14px 16px;background:' + color + ';',
      'display:flex;justify-content:space-between;align-items:center;flex-shrink:0;}',
      '#zapai-header-title{color:#fff;font-weight:700;font-size:14px;',
      'font-family:-apple-system,sans-serif;}',
      '#zapai-close-btn{background:rgba(255,255,255,.2);border:none;color:#fff;',
      'width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;',
      'display:flex;align-items:center;justify-content:center;line-height:1;}',
      '#zapai-messages{flex:1;overflow-y:auto;padding:12px;',
      'display:flex;flex-direction:column;gap:8px;background:#0f1117;}',
      '#zapai-messages::-webkit-scrollbar{width:4px;}',
      '#zapai-messages::-webkit-scrollbar-thumb{background:#2a2d3a;border-radius:2px;}',
      '.zapai-msg{max-width:82%;padding:9px 13px;border-radius:14px;',
      'font-size:13px;line-height:1.5;font-family:-apple-system,sans-serif;word-break:break-word;}',
      '.zapai-msg.user{align-self:flex-end;background:' + color + ';color:#fff;',
      'border-bottom-right-radius:4px;}',
      '.zapai-msg.ai{align-self:flex-start;background:#1e2130;color:#e8eaf0;',
      'border-bottom-left-radius:4px;border:1px solid #2a2d3a;}',
      '.zapai-typing{align-self:flex-start;background:#1e2130;border:1px solid #2a2d3a;',
      'border-radius:14px;border-bottom-left-radius:4px;padding:10px 14px;',
      'display:flex;gap:4px;align-items:center;}',
      '.zapai-dot{width:6px;height:6px;border-radius:50%;background:#888;',
      'animation:zapai-bounce .9s infinite;}',
      '.zapai-dot:nth-child(2){animation-delay:.15s;}',
      '.zapai-dot:nth-child(3){animation-delay:.3s;}',
      '@keyframes zapai-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}',
      '#zapai-input-area{padding:10px 12px;border-top:1px solid #2a2d3a;',
      'display:flex;gap:8px;align-items:center;background:#0f1117;flex-shrink:0;}',
      '#zapai-input{flex:1;background:#1e2130;border:1px solid #2a2d3a;',
      'border-radius:10px;padding:9px 12px;color:#e8eaf0;font-size:13px;',
      'font-family:-apple-system,sans-serif;outline:none;resize:none;',
      'max-height:80px;overflow-y:auto;}',
      '#zapai-input::placeholder{color:#555;}',
      '#zapai-send{background:' + color + ';border:none;color:#fff;',
      'width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:16px;',
      'display:flex;align-items:center;justify-content:center;flex-shrink:0;',
      'transition:opacity .15s;}',
      '#zapai-send:disabled{opacity:0.4;cursor:not-allowed;}',
      '#zapai-powered{padding:5px 12px 8px;text-align:center;',
      'font-size:10px;color:#444;font-family:-apple-system,sans-serif;}',
      '@media(max-width:480px){#zapai-window{width:calc(100vw - 16px);',
      'height:calc(100vh - 80px);bottom:72px!important;left:8px!important;right:8px!important;}}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── Position helpers ───────────────────────────────────────────────────────
  function getPositionStyles(pos) {
    var base = 'position:fixed;';
    switch (pos) {
      case 'bottom-left':           return base + 'bottom:24px;left:24px;';
      case 'bottom-center':         return base + 'bottom:24px;left:50%;transform:translateX(-50%);';
      case 'bottom-right-above-nav':return base + 'bottom:80px;right:24px;';
      default:                      return base + 'bottom:24px;right:24px;';
    }
  }
  function getWindowPositionStyles(pos) {
    var base = 'position:fixed;';
    switch (pos) {
      case 'bottom-left':           return base + 'bottom:92px;left:24px;';
      case 'bottom-center':         return base + 'bottom:92px;left:50%;transform:translateX(-50%);';
      case 'bottom-right-above-nav':return base + 'bottom:148px;right:24px;';
      default:                      return base + 'bottom:92px;right:24px;';
    }
  }

  // ── Build DOM ──────────────────────────────────────────────────────────────
  function buildWidget(config) {
    // Remove existing widget if any
    var old = document.getElementById('zapai-container');
    if (old) old.remove();

    var color = config.themeColor || '#6366f1';
    injectStyles(color);

    var container = document.createElement('div');
    container.id = 'zapai-container';

    // Chat bubble button
    var bubble = document.createElement('button');
    bubble.id = 'zapai-bubble';
    bubble.setAttribute('style', getPositionStyles(POSITION));
    bubble.setAttribute('aria-label', 'Open AI chat');
    bubble.innerHTML = '💬';
    bubble.addEventListener('click', toggleWindow);
    container.appendChild(bubble);

    // Chat window
    var win = document.createElement('div');
    win.id = 'zapai-window';
    win.setAttribute('style', getWindowPositionStyles(POSITION));
    win.classList.add('zapai-hidden');

    // Header
    var header = document.createElement('div');
    header.id = 'zapai-header';
    header.innerHTML =
      '<span id="zapai-header-title">💬 ' + escHtml(config.widgetTitle || 'Ask Us Anything') + '</span>' +
      '<button id="zapai-close-btn" aria-label="Close">✕</button>';
    win.appendChild(header);

    // Messages
    var messages = document.createElement('div');
    messages.id = 'zapai-messages';
    win.appendChild(messages);

    // Input area
    var inputArea = document.createElement('div');
    inputArea.id = 'zapai-input-area';
    inputArea.innerHTML =
      '<textarea id="zapai-input" placeholder="Type a message..." rows="1" maxlength="500"></textarea>' +
      '<button id="zapai-send" aria-label="Send">➤</button>';
    win.appendChild(inputArea);

    // Powered by (empty — no ZapCodes branding per plan)
    var powered = document.createElement('div');
    powered.id = 'zapai-powered';
    win.appendChild(powered);

    container.appendChild(win);
    document.body.appendChild(container);

    // Events
    document.getElementById('zapai-close-btn').addEventListener('click', closeWindow);
    document.getElementById('zapai-send').addEventListener('click', sendMessage);
    var input = document.getElementById('zapai-input');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
      // Auto-resize textarea
      setTimeout(function () {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 80) + 'px';
      }, 0);
    });

    // Show greeting
    addMessage('ai', config.greetingMsg || 'Hi! How can I help you today?');
  }

  // ── Toggle window ──────────────────────────────────────────────────────────
  function toggleWindow() { isOpen ? closeWindow() : openWindow(); }
  function openWindow() {
    isOpen = true;
    var win = document.getElementById('zapai-window');
    if (win) win.classList.remove('zapai-hidden');
    var bubble = document.getElementById('zapai-bubble');
    if (bubble) bubble.innerHTML = '✕';
    scrollToBottom();
  }
  function closeWindow() {
    isOpen = false;
    var win = document.getElementById('zapai-window');
    if (win) win.classList.add('zapai-hidden');
    var bubble = document.getElementById('zapai-bubble');
    if (bubble) bubble.innerHTML = '💬';
  }

  // ── Messages ───────────────────────────────────────────────────────────────
  function addMessage(role, text) {
    var messages = document.getElementById('zapai-messages');
    if (!messages) return;
    var div = document.createElement('div');
    div.className = 'zapai-msg ' + role;
    div.textContent = text;
    messages.appendChild(div);
    scrollToBottom();
    messageHistory.push({ role: role, content: text });
  }

  function showTyping() {
    var messages = document.getElementById('zapai-messages');
    if (!messages || document.getElementById('zapai-typing')) return;
    var typing = document.createElement('div');
    typing.id = 'zapai-typing';
    typing.className = 'zapai-typing';
    typing.innerHTML = '<div class="zapai-dot"></div><div class="zapai-dot"></div><div class="zapai-dot"></div>';
    messages.appendChild(typing);
    scrollToBottom();
  }

  function hideTyping() {
    var t = document.getElementById('zapai-typing');
    if (t) t.remove();
  }

  function scrollToBottom() {
    var messages = document.getElementById('zapai-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  // ── Send message ───────────────────────────────────────────────────────────
  function sendMessage() {
    if (isTyping) return;
    var input = document.getElementById('zapai-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    var sendBtn = document.getElementById('zapai-send');
    if (sendBtn) sendBtn.disabled = true;

    addMessage('user', text);
    isTyping = true;
    showTyping();

    fetch(API_BASE + '/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteToken: TOKEN,
        message:   text,
        sessionId: sessionId,
      }),
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      hideTyping();
      isTyping = false;
      if (sendBtn) sendBtn.disabled = false;
      if (data.error) {
        addMessage('ai', 'Sorry, something went wrong. Please try again.');
      } else if (data.paused) {
        addMessage('ai', data.reply || 'Our AI assistant is temporarily unavailable. Please contact us directly.');
      } else {
        addMessage('ai', data.reply || "I'm not sure about that. Please contact us directly.");
      }
    })
    .catch(function () {
      hideTyping();
      isTyping = false;
      if (sendBtn) sendBtn.disabled = false;
      addMessage('ai', 'Connection issue. Please try again in a moment.');
    });
  }

  // ── Utility ────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Initialize ─────────────────────────────────────────────────────────────
  function init() {
    // Load config from backend
    fetch(API_BASE + '/api/widget/config/' + TOKEN)
      .then(function (res) { return res.json(); })
      .then(function (config) {
        if (config.paused) {
          // Widget paused — don't render anything
          return;
        }
        // Merge with defaults
        Object.assign(widgetConfig, config);
        // Override position if backend provides one
        if (config.position && config.position !== 'auto') {
          POSITION = config.position;
        }
        buildWidget(widgetConfig);
      })
      .catch(function () {
        // If config fetch fails, render with defaults using cfg overrides
        buildWidget({
          widgetTitle: cfg.widgetTitle || 'Ask Us Anything',
          greetingMsg: cfg.greetingMsg || 'Hi! How can I help you today?',
          themeColor:  cfg.themeColor  || '#6366f1',
        });
      });
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
