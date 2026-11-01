/* ==========================================================================
   Crystal Quest 2: Speak & Conquer - SPEAKING MISSION ENGINE
   --------------------------------------------------------------------------
   - Guardian prompt + model answers read aloud with the browser's voice (TTS)
   - 4 support modes: Model, Sentence starters, Keywords, On my own
   - Speech-to-text (Web Speech API) where the browser supports it
   - MediaRecorder recording for playback (kept in memory only, never uploaded)
   - Typed fallback when the microphone is blocked or unavailable
   - Non-punitive checklist: the game only SUGGESTS ticks from the transcript;
     the student decides. No accent, pronunciation or band scoring.
   ========================================================================== */
window.CQSpeak = (function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const UA = navigator.userAgent || '';
  const IS_ANDROID = /Android/i.test(UA);
  const IS_IOS = /iPad|iPhone|iPod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const CAN_RECORD = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  // Phones/tablets usually cannot run speech-to-text and a recorder on the mic at the same time
  const CAN_BOTH = CAN_RECORD && !!SR && !IS_ANDROID && !IS_IOS;
  const CONSENT_KEY = 'cq2_mic_consent_v1';

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let hooks = { onPhase: () => {}, toast: () => {}, sfx: () => {}, volume: () => 1 };
  let ctx = null;          // current mission context
  let rec = null;          // SpeechRecognition
  let mr = null;           // MediaRecorder
  let stream = null;
  let chunks = [];
  let audioURL = null;
  let recording = false;
  let stopping = false;
  let startTime = 0;
  let timerId = null;
  let thinkId = null;
  let finalText = '';
  let interimText = '';
  let srWorked = false;
  let meter = null;

  // ---------------------------------------------------------------- TTS
  let voices = [];
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = window.speechSynthesis.getVoices() || [];
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  function bestVoice() {
    const prefer = ['en-GB', 'en-AU', 'en-US', 'en-IN', 'en'];
    for (const p of prefer) {
      const v = voices.find(x => x.lang && x.lang.replace('_', '-').startsWith(p) && /natural|google|microsoft|samantha|daniel/i.test(x.name));
      if (v) return v;
    }
    return voices.find(x => x.lang && x.lang.startsWith('en')) || null;
  }
  function speak(text, onEnd) {
    if (!('speechSynthesis' in window)) { if (onEnd) onEnd(); return false; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = bestVoice();
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'en-GB';
      u.rate = 0.92;
      u.volume = Math.max(0.1, Math.min(1, hooks.volume()));
      u.onend = () => { setTtsBtns(false); if (onEnd) onEnd(); };
      u.onerror = () => { setTtsBtns(false); if (onEnd) onEnd(); };
      setTtsBtns(true);
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  function stopTTS() {
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) {}
    setTtsBtns(false);
  }
  function setTtsBtns(on) {
    document.querySelectorAll('.sp-tts-btn').forEach(b => b.classList.toggle('sp-tts-on', on));
  }

  // ---------------------------------------------------------------- helpers
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function words(t) { return (t.trim().match(/[A-Za-z']+/g) || []).length; }
  function has(text, list) {
    const t = ' ' + text.toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
    return (list || []).find(w => t.includes(' ' + w.toLowerCase().replace(/[^a-z' ]+/g, ' ').trim() + ' ')) || null;
  }
  const PREP_WORDS = {
    P: ['i think', 'i believe', 'in my opinion', 'i feel', 'i agree', 'i disagree', 'partly agree', 'partly disagree', 'my point'],
    R: ['because', 'the reason', 'this is because', 'since', 'one reason', 'another reason'],
    E: ['for example', 'for instance', 'such as', 'like when'],
    P2: ['therefore', 'in conclusion', 'that is why', 'so i think', 'so i believe', 'to conclude', 'to sum up', 'so students should', 'so everyone should']
  };
  function prepFound(text) {
    const out = {};
    for (const k of Object.keys(PREP_WORDS)) out[k] = has(text, PREP_WORDS[k]);
    return out;
  }
  function detect(text, m, bonus) {
    const res = { structure: null, detail: null, prep: prepFound(text) };
    if (!text.trim() || bonus) return res;
    const s = m.structure || [];
    if (s[0] === '__PREP_ALL__') {
      const p = res.prep;
      if (p.P && p.R && p.E && p.P2) res.structure = 'P + R + E + P';
    } else if (s[0] === '__PREP_PRE__') {
      const p = res.prep;
      if (p.P && p.R && p.E) res.structure = 'P + R + E';
    } else {
      const a = has(text, s);
      const b = m.structure2 ? has(text, m.structure2) : 'ok';
      if (a && b) res.structure = m.structure2 ? `"${a}" … "${b}"` : `"${a}"`;
    }
    const d = has(text, m.detailWords || []);
    if (d) res.detail = `"${d}"`;
    else if (words(text) >= 25) res.detail = 'a longer answer';
    return res;
  }

  // ---------------------------------------------------------------- UI build
  function setZone() {
    const [lo, hi] = ctx.target;
    const bar = $('sp-time-zone-holder');
    const max = hi * 1.2;
    bar.style.setProperty('--zone-l', (lo / max * 100) + '%');
    bar.style.setProperty('--zone-w', ((hi - lo) / max * 100) + '%');
  }
  function show(id, on) { const el = $(id); if (el) el.classList.toggle('hidden', !on); }

  function renderSupport(mode) {
    const m = ctx.bonus ? ctx.mission.bonus : ctx.mission;
    ctx.support = mode;
    if (!ctx.supportsUsed.includes(mode)) ctx.supportsUsed.push(mode);
    document.querySelectorAll('#sp-support-tabs button').forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('sp-tab-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const box = $('sp-support-box');
    if (mode === 'model') {
      const model = ctx.bonus ? null : ctx.mission.model;
      box.innerHTML = model
        ? `<div class="sp-model">“${esc(model)}”</div>
           <div class="sp-row"><button type="button" id="sp-play-model" class="sp-btn sp-btn-soft sp-tts-btn">🔊 Listen to the model</button>
           <span class="sp-note">Listen, then say it in <strong>your own words</strong>, about <strong>you</strong>.</span></div>`
        : `<div class="sp-note">No model for the bonus. Try the sentence starters!</div>`;
      const b = $('sp-play-model');
      if (b) b.onclick = () => speak(model);
    } else if (mode === 'starters') {
      box.innerHTML = `<ul class="sp-list">${(m.starters || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
    } else if (mode === 'keywords') {
      const kw = ctx.bonus ? (m.starters || []).map(s => s.split(' ').slice(0, 3).join(' ')) : (m.keywords || []);
      box.innerHTML = `<div class="sp-chips">${kw.map(k => `<span class="sp-chip">${esc(k)}</span>`).join('')}</div>`;
    } else {
      box.innerHTML = `<div class="sp-note">💪 No help this time. You can do it! Speak about <strong>your own</strong> life and ideas.</div>`;
    }
  }

  function renderPrep(found) {
    const wrap = $('sp-prep');
    const m = ctx.mission;
    if (!m.prep || ctx.bonus) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    const focus = m.prepFocus || ['P', 'R', 'E', 'P2'];
    const cards = [
      ['P', 'Point', 'I think / I believe…'],
      ['R', 'Reason', 'because… / This is because…'],
      ['E', 'Example', 'For example… / For instance…'],
      ['P2', 'Point again', 'Therefore… / That is why…']
    ];
    wrap.innerHTML = cards.map(([k, name, cue]) => {
      const inFocus = focus.includes(k);
      const lit = found && found[k];
      return `<div class="sp-prep-card ${inFocus ? '' : 'sp-prep-off'} ${lit ? 'sp-prep-lit' : ''}">
        <div class="sp-prep-letter">${k === 'P2' ? 'P' : k}</div>
        <div class="sp-prep-name">${name}${lit ? ' ✓' : ''}</div>
        <div class="sp-prep-cue">${esc(cue)}</div></div>`;
    }).join('');
  }

  function renderChecklist(auto) {
    const m = ctx.mission;
    const hasText = !!$('sp-transcript').value.trim();
    const items = ctx.bonus
      ? [['attempt', 'I answered the bonus question', null]]
      : [
        ['attempt', 'I answered the question (I tried my best)', null],
        ['relevant', 'My answer is about the topic', null],
        ['detail', m.detailLabel || 'I gave a reason or detail', auto.detail],
        ['structure', m.structureLabel, auto.structure]
      ];
    const prev = ctx.checks || {};
    $('sp-checklist').innerHTML = items.map(([id, label, found]) => {
      const checked = prev[id] !== undefined ? prev[id] : (id === 'attempt' && hasText) || (!!found && ctx.autoTickOnce);
      return `<label class="sp-check"><input type="checkbox" data-id="${id}" ${checked ? 'checked' : ''} />
        <span>${esc(label)}${found ? `<em class="sp-found">spotted ${esc(found)}</em>` : ''}</span></label>`;
    }).join('');
    ctx.autoTickOnce = false;
    $('sp-checklist').querySelectorAll('input').forEach(inp => {
      inp.onchange = () => { ctx.checks[inp.dataset.id] = inp.checked; updateStars(); };
      ctx.checks[inp.dataset.id] = inp.checked;
    });
    updateStars();
  }

  function starsNow() {
    const c = ctx.checks;
    if (ctx.bonus) return c.attempt ? 1 : 0;
    if (!c.attempt || !c.relevant) return 0;
    return 1 + (c.detail ? 1 : 0) + (c.structure ? 1 : 0);
  }
  function updateStars() {
    const n = starsNow();
    const max = ctx.bonus ? 1 : 3;
    $('sp-stars').innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < n ? '' : 'sp-star-off'}">⭐</span>`).join('');
    const btn = $('sp-done');
    btn.disabled = n < 1;
    btn.textContent = ctx.bonus ? '✅ Finish bonus' : (ctx.review ? '✅ Done (practice)' : '✅ Restore the crystal');
    $('sp-done-hint').textContent = n < 1
      ? (ctx.bonus ? 'Tick the box when you have answered.' : 'Tick the first two boxes when you have answered the question.')
      : '';
  }

  function setStatus(t, cls) {
    const el = $('sp-status');
    el.textContent = t;
    el.className = 'sp-status ' + (cls || '');
  }

  function modeLabel() {
    if (ctx.typed) return '⌨️ Typed answer (fallback)';
    if (srWorked && audioURL) return '🎙️ Spoken + speech-to-text + recording';
    if (srWorked) return '🎙️ Spoken + speech-to-text';
    if (audioURL) return '🎙️ Spoken (recording only)';
    return '🎙️ Spoken';
  }

  // ---------------------------------------------------------------- recording
  function canSpeak() { return !!SR || CAN_RECORD; }

  function needConsent() {
    try { return localStorage.getItem(CONSENT_KEY) !== 'yes'; } catch (e) { return true; }
  }

  async function startRecording() {
    if (recording) return;
    if (needConsent()) { show('sp-consent', true); $('sp-consent').scrollIntoView({ block: 'nearest' }); return; }
    stopTTS();
    clearThink();
    resetTake();
    ctx.typed = false;
    let micOk = false;
    const wantSR = !!SR;
    const wantMR = CAN_RECORD && (!wantSR || CAN_BOTH);

    if (wantMR) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
        const type = types.find(t => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
        const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
        mr = recorder;
        chunks = [];
        recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = () => {
          if (chunks.length && mr === recorder) {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            audioURL = URL.createObjectURL(blob);
            $('sp-playback').src = audioURL;
            show('sp-playback-wrap', true);
            $('sp-mode-label').textContent = modeLabel();
          }
        };
        recorder.start(250);
        startMeter(stream);
        micOk = true;
      } catch (err) {
        if (!wantSR) { micBlocked(err); return; }
      }
    }

    if (wantSR) {
      try {
        rec = new SR();
        rec.lang = 'en-GB';
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.onresult = e => {
          srWorked = true;
          interimText = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalText += (finalText ? ' ' : '') + r[0].transcript.trim();
            else interimText += r[0].transcript;
          }
          $('sp-live').textContent = (finalText + ' ' + interimText).trim() || '…';
          renderPrep(prepFound(finalText + ' ' + interimText));
        };
        rec.onerror = e => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            if (!micOk || !mr) { micBlocked(e); return; }
            setStatus('Speech-to-text is blocked, but your voice is still being recorded.', 'sp-warn');
          } else if (e.error === 'network') {
            setStatus('Speech-to-text needs internet. ' + (mr ? 'Your voice is still being recorded.' : 'Try typing instead.'), 'sp-warn');
          } else if (e.error === 'audio-capture') {
            if (!mr) micBlocked(e);
          }
        };
        rec.onend = () => {
          // Chrome stops after a pause; restart while the student is still speaking
          if (recording && !stopping) {
            setTimeout(() => { if (recording && !stopping) { try { rec.start(); } catch (err) {} } }, 120);
          }
        };
        rec.start();
        micOk = true;
      } catch (err) {
        if (!micOk) { micBlocked(err); return; }
      }
    }

    if (!micOk) { micBlocked(); return; }
    recording = true;
    stopping = false;
    startTime = performance.now();
    $('sp-rec').classList.add('sp-recording');
    $('sp-rec-label').textContent = 'Stop';
    $('sp-rec-icon').textContent = '⏹';
    show('sp-live-wrap', !!SR);
    $('sp-live').textContent = SR ? 'Listening… start speaking' : '';
    setStatus(SR ? (CAN_BOTH ? 'Recording + speech-to-text on' : 'Speech-to-text on') : 'Recording on (this browser has no speech-to-text)', 'sp-on');
    hooks.onPhase('speak');
    tick();
    timerId = setInterval(tick, 200);
  }

  function tick() {
    const sec = (performance.now() - startTime) / 1000;
    const [lo, hi] = ctx.target;
    $('sp-time').textContent = fmt(sec);
    const pct = Math.min(100, (sec / (hi * 1.2)) * 100);
    $('sp-time-fill').style.width = pct + '%';
    $('sp-time-fill').className = 'sp-time-fill ' + (sec < lo ? 'sp-t-low' : sec <= hi ? 'sp-t-good' : 'sp-t-long');
    if (sec > Math.max(hi * 2.5, 120)) stopRecording(); // safety stop
  }

  function stopRecording() {
    if (!recording) return;
    stopping = true;
    recording = false;
    clearInterval(timerId);
    ctx.seconds = Math.round((performance.now() - startTime) / 1000);
    try { if (rec) rec.stop(); } catch (e) {}
    try { if (mr && mr.state !== 'inactive') mr.stop(); } catch (e) {}
    stopMeter();
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    $('sp-rec').classList.remove('sp-recording');
    $('sp-rec-label').textContent = 'Speak again';
    $('sp-rec-icon').textContent = '🎙️';
    hooks.onPhase('listen');
    ctx.tries++;
    // give the recogniser a moment to deliver its last result
    setTimeout(() => {
      const text = (finalText + ' ' + interimText).trim();
      $('sp-transcript').value = text;
      ctx.autoTickOnce = true;
      ctx.checks = {};
      enterCheck();
      if (!text) {
        setStatus(SR && !srWorked
          ? 'No words were caught. Listen to your recording (if shown), tick what you did, or speak again.'
          : 'Listen back and tick what you did.', 'sp-warn');
      } else {
        setStatus(`You spoke for ${fmt(ctx.seconds)}. Fix any words the computer got wrong.`, 'sp-on');
      }
    }, SR ? 700 : 150);
  }

  function micBlocked() {
    recording = false;
    stopMeter();
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    setStatus('🎙️ The microphone is not available or permission was refused. You can allow it in the browser settings, or type your answer instead.', 'sp-warn');
    show('sp-type-btn', true);
    $('sp-type-btn').classList.add('sp-pulse');
  }

  function resetTake() {
    finalText = '';
    interimText = '';
    srWorked = false;
    mr = null;
    if (audioURL) { URL.revokeObjectURL(audioURL); audioURL = null; }
    $('sp-playback').removeAttribute('src');
    show('sp-playback-wrap', false);
    $('sp-live').textContent = '';
  }

  function startMeter(s) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const src = ac.createMediaStreamSource(s);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const data = new Uint8Array(an.fftSize);
      const loop = () => {
        if (!meter) return;
        an.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
        $('sp-meter-fill').style.width = Math.min(100, peak * 1.6) + '%';
        meter.raf = requestAnimationFrame(loop);
      };
      meter = { ac, raf: 0 };
      show('sp-meter', true);
      loop();
    } catch (e) {}
  }
  function stopMeter() {
    if (meter) {
      cancelAnimationFrame(meter.raf);
      try { meter.ac.close(); } catch (e) {}
      meter = null;
    }
    show('sp-meter', false);
  }

  // ---------------------------------------------------------------- think time
  function startThink() {
    if (recording) return;
    clearThink();
    let left = ctx.mission.thinkSec || 30;
    const btn = $('sp-think');
    btn.classList.add('sp-thinking');
    const upd = () => { btn.textContent = `⏳ Plan… ${left}s (tap to skip)`; };
    upd();
    thinkId = setInterval(() => {
      left--;
      if (left <= 0) {
        clearThink();
        hooks.sfx('coin');
        hooks.toast('⏰ Planning time is over. Start speaking!');
        $('sp-rec').classList.add('sp-pulse');
      } else upd();
    }, 1000);
    btn.onclick = () => { clearThink(); $('sp-rec').classList.add('sp-pulse'); };
  }
  function clearThink() {
    if (thinkId) { clearInterval(thinkId); thinkId = null; }
    const btn = $('sp-think');
    if (btn && ctx && ctx.mission.thinkSec) {
      btn.classList.remove('sp-thinking');
      btn.textContent = `⏳ Plan first (${ctx.mission.thinkSec}s)`;
      btn.onclick = startThink;
    }
  }

  // ---------------------------------------------------------------- steps
  function enterCheck() {
    show('sp-check', true);
    const text = $('sp-transcript').value;
    const auto = detect(text, ctx.mission, ctx.bonus);
    ctx.auto = auto;
    renderPrep(auto.prep);
    renderChecklist(auto);
    $('sp-mode-label').textContent = modeLabel();
    $('sp-check').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function useTyping() {
    if (recording) stopRecording();
    resetTake();
    ctx.typed = true;
    ctx.seconds = 0;
    $('sp-transcript').value = '';
    $('sp-transcript').placeholder = 'Type what you would say…';
    ctx.checks = {};
    show('sp-type-btn', false);
    enterCheck();
    setStatus('⌨️ Typed fallback: this is recorded as a typed answer, not a spoken one. Try speaking next time if you can!', 'sp-warn');
    $('sp-transcript').focus();
  }

  function finish() {
    const text = $('sp-transcript').value.trim();
    const n = starsNow();
    if (n < 1) return;
    const result = {
      missionId: ctx.mission.id,
      title: ctx.mission.title,
      bonus: ctx.bonus,
      support: ctx.support,
      supportsUsed: ctx.supportsUsed.slice(),
      mode: ctx.typed ? 'typed' : (srWorked ? 'speech-to-text' : (audioURL ? 'recording' : 'spoken')),
      seconds: ctx.seconds || 0,
      words: words(text),
      transcript: text,
      checks: Object.assign({}, ctx.checks),
      autoSpotted: { detail: !!(ctx.auto && ctx.auto.detail), structure: !!(ctx.auto && ctx.auto.structure) },
      stars: n,
      tries: ctx.tries || (ctx.typed ? 1 : 0)
    };
    hooks.sfx('correct');
    if (ctx.bonus) {
      if (ctx.onBonus) ctx.onBonus(result);
      close();
      return;
    }
    const m = ctx.mission;
    if (ctx.onComplete) ctx.onComplete(result);
    if (m.bonus && !ctx.review) offerBonus();
    else close();
  }

  function offerBonus() {
    const b = ctx.mission.bonus;
    stopTTS();
    show('sp-main', false);
    show('sp-bonus-offer', true);
    $('sp-bonus-text').textContent = ctx.mission.npcReply ? ctx.mission.npcReply : b.prompt;
    $('sp-bonus-reward').textContent = b.label || '';
    if (ctx.mission.npcReply) speak(ctx.mission.npcReply);
    $('sp-scroll').scrollTop = 0;
  }

  function startBonus() {
    stopTTS();
    const b = ctx.mission.bonus;
    ctx.bonus = true;
    ctx.target = b.targetSec || [10, 20];
    ctx.checks = {};
    ctx.tries = 0;
    ctx.typed = false;
    ctx.supportsUsed = [];
    show('sp-bonus-offer', false);
    show('sp-main', true);
    show('sp-check', false);
    show('sp-type-btn', true);
    $('sp-badge').textContent = 'Bonus';
    $('sp-prompt').textContent = b.prompt;
    $('sp-target').textContent = `🎯 Aim: ${ctx.target[0]}–${ctx.target[1]} s`;
    setZone();
    $('sp-transcript').value = '';
    $('sp-time').textContent = '0:00';
    $('sp-time-fill').style.width = '0%';
    resetTake();
    show('sp-think', false);
    renderPrep(null);
    renderSupport('starters');
    $('sp-rec-label').textContent = 'Start speaking';
    setStatus('Bonus round! Press Start when you are ready.', '');
    $('sp-scroll').scrollTop = 0;
    speak(b.prompt);
  }

  // ---------------------------------------------------------------- open / close
  function open(opts) {
    stopAll();
    const m = opts.mission;
    ctx = {
      mission: m,
      review: !!opts.review,
      bonus: false,
      target: m.targetSec || [10, 20],
      support: 'starters',
      supportsUsed: [],
      checks: {},
      tries: 0,
      typed: false,
      seconds: 0,
      onComplete: opts.onComplete,
      onBonus: opts.onBonus,
      onClose: opts.onClose
    };
    $('sp-badge').textContent = `Mission ${m.id} • ${opts.index + 1} of ${opts.total}`;
    $('sp-skill').textContent = m.skill;
    $('sp-title').textContent = m.title + (ctx.review ? ' (practice again: no points)' : '');
    $('sp-guardian').textContent = '🗣️ ' + m.guardian;
    $('sp-prompt').textContent = m.prompt;
    $('sp-target').textContent = `🎯 Aim: ${ctx.target[0]}–${ctx.target[1]} s`;
    setZone();
    $('sp-transcript').value = '';
    $('sp-transcript').placeholder = 'Your words appear here. You can fix mistakes.';
    show('sp-main', true);
    show('sp-check', false);
    show('sp-bonus-offer', false);
    show('sp-consent', false);
    show('sp-type-btn', true);
    $('sp-type-btn').classList.remove('sp-pulse');
    $('sp-rec').classList.remove('sp-pulse', 'sp-recording');
    $('sp-rec-label').textContent = 'Start speaking';
    $('sp-rec-icon').textContent = '🎙️';
    $('sp-time').textContent = '0:00';
    $('sp-time-fill').style.width = '0%';
    resetTake();
    show('sp-think', !!m.thinkSec);
    clearThink();
    renderPrep(null);
    renderSupport('starters');
    if (!canSpeak()) {
      setStatus('This browser cannot use the microphone. Please type your answer (or use Chrome).', 'sp-warn');
      $('sp-type-btn').classList.add('sp-pulse');
    } else {
      setStatus(SR ? 'Press Start, then speak. Press Stop when you finish.' : 'Press Start to record, then Stop. (No speech-to-text in this browser: you will listen back instead.)', '');
    }
    $('modal-speaking').classList.remove('hidden');
    $('sp-scroll').scrollTop = 0;
    hooks.onPhase('listen');
    if (!ctx.review) setTimeout(() => speak(m.npcClaim ? 'Dax says: ' + m.npcClaim : m.prompt), 350);
  }

  function close() {
    stopAll();
    $('modal-speaking').classList.add('hidden');
    const cb = ctx && ctx.onClose;
    hooks.onPhase('idle');
    if (cb) cb();
  }

  function stopAll() {
    stopTTS();
    clearThink();
    if (recording) {
      stopping = true;
      recording = false;
      clearInterval(timerId);
      try { if (rec) rec.abort(); } catch (e) {}
      try { if (mr && mr.state !== 'inactive') mr.stop(); } catch (e) {}
    }
    stopMeter();
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  function isOpen() { return !$('modal-speaking').classList.contains('hidden'); }

  // ---------------------------------------------------------------- mic test (menu)
  async function micTest() {
    if (!CAN_RECORD) {
      hooks.toast(SR ? '🎙️ Speech-to-text is available. Allow the microphone when asked.' : '⚠️ This browser cannot use the microphone. Typed answers still work.');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      hooks.toast(SR ? '✅ Microphone OK and speech-to-text available!' : '✅ Microphone OK (recording mode: no speech-to-text in this browser).');
    } catch (e) {
      hooks.toast('⚠️ Microphone blocked. Allow it in the browser settings, or type answers instead.');
    }
  }

  // ---------------------------------------------------------------- wiring
  function init(h) {
    hooks = Object.assign(hooks, h || {});
    $('sp-hear').onclick = () => speak(ctx.bonus ? ctx.mission.bonus.prompt : (ctx.mission.npcClaim ? 'Dax says: ' + ctx.mission.npcClaim : ctx.mission.prompt));
    $('sp-close').onclick = close;
    $('sp-rec').onclick = () => { $('sp-rec').classList.remove('sp-pulse'); recording ? stopRecording() : startRecording(); };
    $('sp-type-btn').onclick = useTyping;
    $('sp-again').onclick = () => {
      show('sp-check', false);
      resetTake();
      $('sp-transcript').value = '';
      ctx.typed = false;
      show('sp-type-btn', true);
      setStatus('Ready for another try. Press Start.', '');
      $('sp-rec').scrollIntoView({ block: 'nearest' });
    };
    $('sp-done').onclick = finish;
    $('sp-recheck').onclick = () => {
      const auto = detect($('sp-transcript').value, ctx.mission, ctx.bonus);
      ctx.auto = auto;
      ctx.autoTickOnce = true;
      ctx.checks = {};
      renderPrep(auto.prep);
      renderChecklist(auto);
    };
    $('sp-consent-ok').onclick = () => {
      try { localStorage.setItem(CONSENT_KEY, 'yes'); } catch (e) {}
      show('sp-consent', false);
      startRecording();
    };
    $('sp-consent-type').onclick = () => { show('sp-consent', false); useTyping(); };
    $('sp-bonus-go').onclick = startBonus;
    $('sp-bonus-skip').onclick = close;
    document.querySelectorAll('#sp-support-tabs button').forEach(b => {
      b.onclick = () => renderSupport(b.dataset.mode);
    });
    // typing must never move the hero or trigger game shortcuts
    const ta = $('sp-transcript');
    ['keydown', 'keyup', 'keypress'].forEach(ev => ta.addEventListener(ev, e => e.stopPropagation()));
  }

  return {
    init, open, close, stopAll, isOpen, micTest, speak, stopTTS,
    get capabilities() { return { speechToText: !!SR, recorder: CAN_RECORD, both: CAN_BOTH }; },
    resetConsent() { try { localStorage.removeItem(CONSENT_KEY); } catch (e) {} },
    _detect: detect
  };
})();
