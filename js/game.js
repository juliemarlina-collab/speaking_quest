/* Crystal Quest 2: Speak & Conquer - game engine (Three.js r128). Speaking missions: js/speaking.js */
(function() {
  'use strict';

  // -------------------------------------------------------------------
  // 1. FOUR PLAYABLE HERO DEFINITIONS
  // -------------------------------------------------------------------
  const HEROES = window.CQ_DATA.HEROES;

  // -------------------------------------------------------------------
  // 2. THREE WORLDS • 8 REAL VOA RECORDINGS • 28 MUET-STYLE 3-OPTION QUESTIONS
  // Each crystal = one real VOA Learning English recording + 3-4 MUET-style
  // 3-option questions. Choices are shuffled at runtime. 'evidence' is shown
  // only after the student answers.
  // -------------------------------------------------------------------
  const WORLDS = window.CQ_DATA.WORLDS;

  // -------------------------------------------------------------------
  // 3. PERSISTENT STATE & CAMERA MODES
  // -------------------------------------------------------------------
  const STORAGE_KEY = 'crystal_quest_speak_save_v1';
  const RESULTS_KEY = 'crystal_quest_speak_results_v1';
  const PROFILE_KEY = 'crystal_quest_student_v3';
  const CAM_MODES = [
    { id: 'close', label: 'Cam: Close', dist: 6.2, height: 3.1, front: false },
    { id: 'selfie', label: 'Cam: Selfie', dist: 5.2, height: 2.3, front: true },
    { id: 'action', label: 'Cam: Action', dist: 8.5, height: 4.5, front: false },
    { id: 'top', label: 'Cam: Top', dist: 7.5, height: 8.8, front: false }
  ];

  const state = {
    selectedHeroId: 'aiden',
    currentWorldId: 1,
    totalScore: 0,
    masterVolume: 1.0,
    musicEnabled: true,
    sfxEnabled: true,
    saveTranscripts: true,
    missionStars: {},
    bonusDone: {},
    badges: {},
    studentName: '',
    studentClass: '',
    levelLog: [],
    touchControlsEnabled: ('ontouchstart' in window) || window.innerWidth < 900,
    camModeIndex: 0,
    camOrbitYaw: 0, // User drag orbit offset
    isPlaying: false,
    isPaused: false,
    isListeningModalOpen: false,
    // Current level live metrics
    hearts: 3,
    levelScore: 0,
    coinsCollected: 0,
    chestsCollected: 0,
    challengesSolved: 0,
    firstAttemptCorrectCount: 0,
    currentCheckpoint: { x: 0, y: 1.5, z: 0 },
    activeCrystalObj: null,
    activeChallengeAttempt: 1,
    worldProgress: {
      1: { stars: 0, bestScore: 0, coins: 0, chests: 0, solved: 0, completed: false },
      2: { stars: 0, bestScore: 0, coins: 0, chests: 0, solved: 0, completed: false },
      3: { stars: 0, bestScore: 0, coins: 0, chests: 0, solved: 0, completed: false }
    }
  };

  function loadSaveData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.selectedHeroId) state.selectedHeroId = parsed.selectedHeroId;
      if (parsed.currentWorldId) state.currentWorldId = parsed.currentWorldId;
      if (typeof parsed.totalScore === 'number') state.totalScore = parsed.totalScore;
      if (parsed.missionStars) state.missionStars = parsed.missionStars;
      if (parsed.bonusDone) state.bonusDone = parsed.bonusDone;
      if (parsed.badges) state.badges = parsed.badges;
      if (typeof parsed.saveTranscripts === 'boolean') state.saveTranscripts = parsed.saveTranscripts;
      if (parsed.worldProgress) {
        for (const k of [1, 2, 3]) {
          if (parsed.worldProgress[k]) {
            state.worldProgress[k] = Object.assign(state.worldProgress[k], parsed.worldProgress[k]);
          }
        }
      }
    } catch (err) {}
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedHeroId: state.selectedHeroId,
        currentWorldId: state.currentWorldId,
        totalScore: state.totalScore,
        worldProgress: state.worldProgress,
        missionStars: state.missionStars,
        bonusDone: state.bonusDone,
        badges: state.badges,
        saveTranscripts: state.saveTranscripts
      }));
    } catch (err) {}
    updateMainMenuSummary();
  }

  // -------------------------------------------------------------------
  // 4. HIGH-OUTPUT DUAL-ENGINE VOICE & MASTER AUDIO SYSTEM
  // Solves silent iframe TTS by combining fixed Web Speech API +
  // Expressive Formant Syllable Voice Synth + Compressor Boost!
  // -------------------------------------------------------------------
  let audioCtx = null;
  let masterCompressor = null;
  let masterGain = null;
  let bgmGainNode = null;
  let bgmInterval = null;
  let speechProgressTimer = null;
  let availableVoices = [];

  function initVoices() {
    if ('speechSynthesis' in window) {
      try {
        availableVoices = window.speechSynthesis.getVoices() || [];
        window.speechSynthesis.onvoiceschanged = () => {
          availableVoices = window.speechSynthesis.getVoices() || [];
        };
      } catch (e) {}
    }
  }
  initVoices();

  function pickBestEnglishVoice() {
    if (!availableVoices || !availableVoices.length) {
      try { availableVoices = window.speechSynthesis.getVoices() || []; } catch (e) {}
    }
    const enVoices = availableVoices.filter(v => /^en(-|_|$)/i.test(v.lang));
    const preferred = enVoices.find(v => /Google|Natural|Samantha|Aria|Jenny|Guy|Daniel/i.test(v.name));
    return preferred || enVoices[0] || availableVoices[0] || null;
  }

  function ensureAudioContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
        masterCompressor = audioCtx.createDynamicsCompressor();
        masterCompressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
        masterCompressor.knee.setValueAtTime(12, audioCtx.currentTime);
        masterCompressor.ratio.setValueAtTime(6, audioCtx.currentTime);
        masterCompressor.attack.setValueAtTime(0.005, audioCtx.currentTime);
        masterCompressor.release.setValueAtTime(0.15, audioCtx.currentTime);

        masterGain = audioCtx.createGain();
        masterGain.gain.value = state.masterVolume;

        bgmGainNode = audioCtx.createGain();
        bgmGainNode.gain.value = 0.22;

        bgmGainNode.connect(masterCompressor);
        masterCompressor.connect(masterGain);
        masterGain.connect(audioCtx.destination);
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    if (masterGain && audioCtx) {
      masterGain.gain.setValueAtTime(state.masterVolume, audioCtx.currentTime);
    }
  }

  function setBgmDucking(ducked) {
    if (!audioCtx || !bgmGainNode) return;
    const target = !state.musicEnabled ? 0.0001 : (ducked ? 0.03 : 0.22);
    bgmGainNode.gain.setTargetAtTime(target, audioCtx.currentTime, 0.12);
  }

  // Expressive Vowel-Formant Voice Syllable Synthesizer
  // Plays warm spoken-cadence syllables so the guardian is ALWAYS audible
  function playVoiceSyllable(pitchMultiplier, wordStr) {
    if (!state.sfxEnabled) return;
    ensureAudioContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const charSum = wordStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const baseF0 = (195 + (charSum % 75)) * (pitchMultiplier || 1.0);

    // Fundamental glottal carrier + harmonic formant filter
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const syllGain = audioCtx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(baseF0, now);
    osc1.frequency.exponentialRampToValueAtTime(baseF0 * 1.08, now + 0.06);
    osc1.frequency.exponentialRampToValueAtTime(baseF0 * 0.94, now + 0.14);

    osc2.frequency.setValueAtTime(baseF0 * 2.0, now);

    // Vowel formant resonance (800Hz - 1800Hz)
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900 + (charSum % 900), now);
    filter.Q.setValueAtTime(3.2, now);

    const vol = 0.28;
    syllGain.gain.setValueAtTime(0.001, now);
    syllGain.gain.linearRampToValueAtTime(vol, now + 0.018);
    syllGain.gain.exponentialRampToValueAtTime(0.001, now + 0.145);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(syllGain);
    syllGain.connect(masterCompressor);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.15);
    osc2.stop(now + 0.15);
  }

  function startBackgroundMusic(worldId) {
    stopBackgroundMusic();
    if (!state.musicEnabled) return;
    ensureAudioContext();
    if (!audioCtx) return;

    const scales = {
      1: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 659.25], // Sunlit Forest
      2: [293.66, 349.23, 392.00, 440.00, 523.25, 587.33, 698.46], // Echo Falls
      3: [329.63, 392.00, 493.88, 523.25, 587.33, 659.25, 783.99]  // Celestial Kingdom
    };
    const notes = scales[worldId] || scales[1];
    let step = 0;

    bgmInterval = setInterval(() => {
      if (!state.musicEnabled || state.isPaused || !audioCtx || audioCtx.state !== 'running') return;
      const now = audioCtx.currentTime;
      const freq = notes[step % notes.length];
      step = (step + (step % 3 === 0 ? 2 : 1)) % notes.length;

      const osc = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();
      osc.type = worldId === 2 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.linearRampToValueAtTime(0.26, now + 0.04);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

      osc.connect(noteGain);
      noteGain.connect(bgmGainNode);
      osc.start(now);
      osc.stop(now + 0.55);
    }, 480);
  }

  function stopBackgroundMusic() {
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
  }

  function playSfx(type) {
    if (!state.sfxEnabled) return;
    ensureAudioContext();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    const playTone = (freqStart, freqEnd, dur, wave = 'triangle', vol = 0.35, delay = 0) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freqStart, now + delay);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, now + delay + dur);
      }
      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.linearRampToValueAtTime(vol, now + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(gain);
      gain.connect(masterCompressor);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.02);
    };

    if (type === 'jump') {
      playTone(280, 620, 0.2, 'triangle', 0.38);
    } else if (type === 'bounce') {
      playTone(220, 880, 0.32, 'sine', 0.45);
    } else if (type === 'coin') {
      playTone(587.33, 587.33, 0.09, 'triangle', 0.4, 0);
      playTone(880.00, 880.00, 0.22, 'triangle', 0.42, 0.08);
    } else if (type === 'chest') {
      [523.25, 659.25, 783.99, 1046.50].forEach((f, idx) => {
        playTone(f, f, 0.2, 'triangle', 0.42, idx * 0.09);
      });
    } else if (type === 'checkpoint') {
      playTone(440, 660, 0.22, 'sine', 0.38, 0);
      playTone(660, 880, 0.25, 'sine', 0.38, 0.12);
    } else if (type === 'correct') {
      [523.25, 659.25, 783.99, 1046.50].forEach((f, idx) => {
        playTone(f, f * 1.02, 0.24, 'triangle', 0.45, idx * 0.08);
      });
    } else if (type === 'wrong') {
      playTone(300, 210, 0.22, 'sawtooth', 0.28, 0);
      playTone(210, 175, 0.25, 'sawtooth', 0.28, 0.15);
    } else if (type === 'damage') {
      playTone(240, 110, 0.3, 'sawtooth', 0.35, 0);
    } else if (type === 'portal') {
      [392.00, 493.88, 587.33, 783.99, 987.77, 1174.66].forEach((f, idx) => {
        playTone(f, f * 1.05, 0.28, 'triangle', 0.42, idx * 0.07);
      });
    }
  }

  // Speaking missions live in js/speaking.js (window.CQSpeak)
  function stopSpeechAudio() {
    if (window.CQSpeak) window.CQSpeak.stopAll();
  }
  function applyAudioSettings() {}

  // Main menu: test the microphone (and play a chime so students can check volume)
  document.getElementById('btn-test-voice').addEventListener('click', () => {
    ensureAudioContext();
    playSfx('correct');
    window.CQSpeak.micTest();
  });

  // -------------------------------------------------------------------
  // 5. THREE.JS SUNLIT REALISTIC FANTASY SCENE & EXPRESSIVE HERO RIG
  // -------------------------------------------------------------------
  const container = document.getElementById('game-canvas-container');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x38bdf8);
  scene.fog = new THREE.FogExp2(0x7dd3fc, 0.0065);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 260);
  camera.position.set(0, 4.2, 6.8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Warm Realistic Hemisphere + Sun Lighting
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4ade80, 0.85);
  hemiLight.position.set(0, 50, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.15);
  dirLight.position.set(24, 42, 28);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // Dedicated Spotlight following the Hero so the player ALWAYS stands out clearly
  const heroSpotLight = new THREE.PointLight(0xfffbeb, 0.9, 12);
  scene.add(heroSpotLight);

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // Collections
  let platforms = [];
  let movingPlatforms = [];
  let bouncyMushrooms = [];
  let crystalCoins = [];
  let listeningCrystals = [];
  let treasureChests = [];
  let checkpoints = [];
  let enemies = [];
  let clouds = [];
  let waterfallParticles = [];
  let waterWheels = [];
  let ambientParticles = [];
  let trailParticles = [];
  let portalObject = null;
  let waterMesh = null;

  // Hero 3D Rig & Physics State
  let heroMesh = null;
  let heroParts = {};
  const player = {
    pos: new THREE.Vector3(0, 1.5, 0),
    vel: new THREE.Vector3(0, 0, 0),
    onGround: false,
    facingAngle: Math.PI,
    animState: 'idle',
    animTimer: 0,
    invulnerableTimer: 0,
    standingPlatform: null
  };

  // Generate a crisp painted Anime Face Texture for the 3D Hero Head
  function createAnimeFaceTexture(skinHex, eyeColorStr) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Skin background
    const hexStr = '#' + skinHex.toString(16).padStart(6, '0');
    ctx.fillStyle = hexStr;
    ctx.fillRect(0, 0, 256, 256);

    // Rosy adventure cheeks
    ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
    ctx.beginPath();
    ctx.ellipse(75, 152, 18, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(181, 152, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Expressive Eyes (Left & Right)
    const drawEye = (cx, cy) => {
      // White sclera
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 20, 24, 0, 0, Math.PI * 2);
      ctx.fill();

      // Colored iris
      ctx.fillStyle = eyeColorStr || '#1e3a8a';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 14, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dark pupil
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx, cy + 4, 8, 0, Math.PI * 2);
      ctx.fill();

      // Bright anime catchlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 6, 5, 0, Math.PI * 2);
      ctx.arc(cx + 5, cy + 7, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Upper eyelash arch
      ctx.strokeStyle = '#1e1b4b';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(cx, cy - 2, 20, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    };
    drawEye(88, 122);
    drawEye(168, 122);

    // Cheerful confident smile
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(128, 154, 16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function buildHeroMesh(heroDef) {
    if (ART_OK && artTex[heroDef.id + '_idle']) { buildSpriteHero(heroDef); return; }
    if (heroMesh) {
      scene.remove(heroMesh);
    }
    const root = new THREE.Group();
    const c = heroDef.colors;

    const matSkin = new THREE.MeshStandardMaterial({ color: c.skin, roughness: 0.45 });
    const matTunic = new THREE.MeshStandardMaterial({ color: c.tunic, roughness: 0.35 });
    const matAccent = new THREE.MeshStandardMaterial({ color: c.accent, roughness: 0.3 });
    const matHair = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.4 });
    const matBoots = new THREE.MeshStandardMaterial({ color: c.boots, roughness: 0.5 });
    const matGlow = new THREE.MeshBasicMaterial({ color: c.particle });

    // Glowing Hero Ground Ring ("See Yourself" Locator Ring underfoot!)
    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.82, 32),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    groundRing.rotation.x = Math.PI / 2;
    groundRing.position.y = 0.04;
    root.add(groundRing);

    // Torso + Tunic Skirt
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 0.82, 14), matTunic);
    torso.position.y = 0.82;
    torso.castShadow = true;
    root.add(torso);

    // Belt & Golden Buckle
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14), matBoots);
    belt.position.y = 0.58;
    root.add(belt);

    // Scarf / Collar + Flowing Cape Back
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 10, 18), matAccent);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.18;
    root.add(collar);

    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.08), matAccent);
    cape.position.set(0, 0.82, -0.36);
    cape.rotation.x = 0.18;
    root.add(cape);

    // Head with Painted Anime Face Texture
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.62;
    const faceTex = createAnimeFaceTexture(c.skin, c.eyeColor);
    const headMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.4 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 20), headMat);
    head.rotation.y = -Math.PI / 2; // Align canvas front with +Z
    head.castShadow = true;
    headGroup.add(head);

    // Sculpted Hair Cap + Spiky Tufts
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.49, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), matHair);
    hairCap.rotation.x = -0.22;
    headGroup.add(hairCap);

    // Hero-specific headgear & props
    if (heroDef.id === 'aiden' || heroDef.id === 'mia') {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.04, 8, 22), matBoots);
      strap.rotation.x = Math.PI / 2;
      strap.position.y = 0.18;
      const lensMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.6, roughness: 0.15 });
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.7, roughness: 0.2 });
      const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14), lensMat);
      lensL.rotation.x = Math.PI / 2;
      lensL.position.set(-0.16, 0.19, 0.45);
      const lensR = lensL.clone();
      lensR.position.x = 0.16;
      const rimL = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 16), frameMat);
      rimL.position.set(-0.16, 0.19, 0.49);
      const rimR = rimL.clone();
      rimR.position.x = 0.16;
      headGroup.add(strap, lensL, lensR, rimL, rimR);

      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.28), matAccent);
      pack.position.set(0, 0.85, -0.38);
      root.add(pack);
    } else if (heroDef.id === 'luna') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 18), matTunic);
      brim.position.y = 0.3;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.82, 16), matTunic);
      cone.position.y = 0.7;
      cone.rotation.z = -0.12;
      const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 18), matAccent);
      hatBand.rotation.x = Math.PI / 2;
      hatBand.position.y = 0.34;
      headGroup.add(brim, cone, hatBand);
    } else if (heroDef.id === 'rex') {
      const hoodCone = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.62, 14), matTunic);
      hoodCone.position.set(0, 0.38, -0.16);
      hoodCone.rotation.x = -0.5;
      headGroup.add(hoodCone);
      const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.62, 10), matAccent);
      quiver.position.set(0.2, 0.9, -0.38);
      quiver.rotation.z = -0.25;
      root.add(quiver);
    }

    root.add(headGroup);

    // Articulated Arms & Hands
    const armGeo = new THREE.CylinderGeometry(0.11, 0.1, 0.54, 10);
    const leftArm = new THREE.Mesh(armGeo, matTunic);
    leftArm.position.set(-0.5, 0.86, 0);
    const rightArm = new THREE.Mesh(armGeo, matTunic);
    rightArm.position.set(0.5, 0.86, 0);

    // Glowing Adventurer Staff / Crystal Wand on Right Hand
    const wandStick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), matAccent);
    wandStick.position.set(0, -0.28, 0.2);
    wandStick.rotation.x = Math.PI / 3;
    const wandGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), matGlow);
    wandGem.position.set(0, 0.36, 0);
    wandStick.add(wandGem);
    rightArm.add(wandStick);

    root.add(leftArm, rightArm);

    // Legs & Boots
    const legGeo = new THREE.CylinderGeometry(0.13, 0.14, 0.45, 10);
    const leftLeg = new THREE.Mesh(legGeo, matBoots);
    leftLeg.position.set(-0.2, 0.24, 0);
    const rightLeg = new THREE.Mesh(legGeo, matBoots);
    rightLeg.position.set(0.2, 0.24, 0);
    root.add(leftLeg, rightLeg);

    // Listening Soundwave Ring
    const listenRing = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.78, 28),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    listenRing.rotation.x = Math.PI / 2;
    listenRing.position.y = 1.6;
    listenRing.visible = false;
    root.add(listenRing);

    // Scale hero up slightly so they are super clear and prominent!
    root.scale.setScalar(1.22);

    heroMesh = root;
    heroParts = { headGroup, leftArm, rightArm, leftLeg, rightLeg, torso, cape, groundRing, listenRing, particleColor: c.particle };
    scene.add(heroMesh);
  }

  function setHeroAnimState(stateName, duration = 0) {
    player.animState = stateName;
    player.animTimer = duration;
    const poseNames = {
      idle: 'Ready ✨',
      run: 'Running 🏃',
      jump: 'Leaping ⬆️',
      fall: 'Gliding 🪂',
      listen: 'Planning 💭',
      answer: 'Speaking 🎙️',
      collect: 'Got Crystal! 💎',
      celebrate: 'Victory! 🎉',
      damage: 'Ouch! 💥'
    };
    const label = poseNames[stateName] || 'Exploring ✨';
    const tagPose = document.getElementById('hero-tag-pose');
    const mirrorPose = document.getElementById('mirror-pose-pill');
    if (tagPose) tagPose.textContent = '• ' + label;
    if (mirrorPose) mirrorPose.textContent = 'Pose: ' + label;
  }

  // -------------------------------------------------------------------
  // 6. 3D NPC GUARDIANS, ENEMIES, BOUNCY MUSHROOMS & SCENERY
  // -------------------------------------------------------------------
  function createGuardianNPC(worldId, index) {
    const kenneyGuardian = makeGuardianModel(worldId);
    if (kenneyGuardian) return kenneyGuardian;
    const g = new THREE.Group();
    if (worldId === 1) {
      // Wise Forest Spirit / Lantern Guardian
      const robe = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 1.35, 12),
        new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 })
      );
      robe.position.y = 0.68;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xfde68a })
      );
      head.position.y = 1.5;
      const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.48, 0.65, 12),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24 })
      );
      hat.position.y = 1.95;
      g.add(robe, head, hat);
    } else if (worldId === 2) {
      // Echo Falls Water Guardian
      const robe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.55, 1.35, 12),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 })
      );
      robe.position.y = 0.68;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xbae6fd })
      );
      head.position.y = 1.5;
      const crown = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.25),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
      );
      crown.position.y = 2.0;
      g.add(robe, head, crown);
    } else {
      // Celestial Archmage Guardian
      const robe = new THREE.Mesh(
        new THREE.ConeGeometry(0.58, 1.45, 12),
        new THREE.MeshStandardMaterial({ color: 0x6b21a8, roughness: 0.3 })
      );
      robe.position.y = 0.72;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xfef08a })
      );
      head.position.y = 1.55;
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.05, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 2.05;
      g.add(robe, head, halo);
    }
    return g;
  }

  function createCuteEnemyMesh(type) {
    const g = new THREE.Group();
    if (ART_OK && artTex['enemy_' + type]) {
      const h = type === 'sprite' ? 1.4 : 1.15;
      const sp = makeSprite('enemy_' + type, h);
      if (type === 'sprite') sp.position.y = 0.25;
      g.add(makeBlobShadow(0.45), sp);
      return g;
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    if (type === 'slime') {
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 16, 14),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, transparent: true, opacity: 0.9 })
      );
      body.scale.set(1.15, 0.82, 1.15);
      body.position.y = 0.45;
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.35, 10),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15 })
      );
      tip.position.y = 0.92;
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), eyeMat);
      eyeL.position.set(-0.18, 0.48, 0.52);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.18;
      g.add(body, tip, eyeL, eyeR);
    } else if (type === 'mushroom') {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.38, 0.55, 12),
        new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.5 })
      );
      stem.position.y = 0.3;
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.58, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35 })
      );
      cap.position.y = 0.52;
      const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (let i = 0; i < 4; i++) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), spotMat);
        const ang = (i / 4) * Math.PI * 2;
        spot.position.set(Math.cos(ang) * 0.36, 0.78, Math.sin(ang) * 0.36);
        g.add(spot);
      }
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), eyeMat);
      eyeL.position.set(-0.14, 0.35, 0.34);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.14;
      g.add(stem, cap, eyeL, eyeR);
    } else {
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.48, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0x581c87, roughness: 0.3 })
      );
      body.position.y = 0.75;
      const glowEyeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), glowEyeMat);
      eyeL.position.set(-0.16, 0.78, 0.42);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.16;
      const earGeo = new THREE.ConeGeometry(0.14, 0.35, 8);
      const earMat = new THREE.MeshStandardMaterial({ color: 0x7e22ce });
      const earL = new THREE.Mesh(earGeo, earMat);
      earL.position.set(-0.26, 1.22, 0);
      earL.rotation.z = 0.3;
      const earR = new THREE.Mesh(earGeo, earMat);
      earR.position.set(0.26, 1.22, 0);
      earR.rotation.z = -0.3;
      g.add(body, eyeL, eyeR, earL, earR);
    }
    return g;
  }

  // -------------------------------------------------------------------
  // 7. SUNLIT 3D FANTASY VALLEY GENERATOR (WITH CLOUDS, WATERFALLS & TREES)
  // -------------------------------------------------------------------
  function clearWorld() {
    while (worldGroup.children.length > 0) {
      worldGroup.remove(worldGroup.children[0]);
    }
    platforms = [];
    movingPlatforms = [];
    bouncyMushrooms = [];
    crystalCoins = [];
    listeningCrystals = [];
    treasureChests = [];
    checkpoints = [];
    enemies = [];
    clouds = [];
    waterfallParticles = [];
    waterWheels = [];
    swayers = [];
    flames = [];
    dragon = null;
    flowingWaters = [];
    ambientParticles = [];
    trailParticles = [];
    portalObject = null;
    waterMesh = null;
  }

  function addPlatform(x, y, z, w, h, d, colorHex, isMoving = false, moveSpec = null) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Lush Top Grass / Crystal Cap with rounded bevel look
    const topMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h * 0.36, d),
      new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45 })
    );
    topMesh.position.y = h * 0.32;
    topMesh.receiveShadow = true;

    // Warm Cliff / Stone Base
    const baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, h * 0.68, d * 0.92),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.75 })
    );
    baseMesh.position.y = -h * 0.18;
    baseMesh.receiveShadow = true;

    group.add(topMesh, baseMesh);
    dressPlatform(group, topMesh, baseMesh, w, d, colorHex, buildingWorldId);
    worldGroup.add(group);

    const platObj = {
      mesh: group,
      x, y, z,
      w, h, d,
      topY: y + h * 0.5,
      active: true,
      isMoving,
      moveSpec,
      baseX: x,
      baseY: y,
      baseZ: z,
      dx: 0,
      dy: 0,
      dz: 0
    };
    platforms.push(platObj);
    if (isMoving) movingPlatforms.push(platObj);
    return platObj;
  }

  function addBouncyMushroom(x, y, z) {
    if (ART_OK && artTex.item_bounce_mushroom) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.add(makeBlobShadow(0.8), makeSprite('item_bounce_mushroom', 1.7));
      worldGroup.add(g);
      bouncyMushrooms.push({ mesh: g, x, y, z });
      return;
    }
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 0.7, 12),
      new THREE.MeshStandardMaterial({ color: 0xfef3c7 })
    );
    stem.position.y = 0.35;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0x881337, emissiveIntensity: 0.25 })
    );
    cap.position.y = 0.65;
    g.add(stem, cap);
    worldGroup.add(g);
    bouncyMushrooms.push({ mesh: g, x, y, z });
  }

  function addCloud(x, y, z, scale = 1.0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0.92 });
    const p1 = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 12), mat);
    const p2 = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 12), mat);
    p2.position.set(1.5, -0.2, 0.2);
    const p3 = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 12), mat);
    p3.position.set(-1.4, -0.3, -0.2);
    g.add(p1, p2, p3);
    g.scale.setScalar(scale);
    worldGroup.add(g);
    clouds.push({ mesh: g, baseX: x, speed: 0.3 + Math.random() * 0.4, phase: Math.random() * 10 });
  }

  function addDecorativeScenery(worldDef, x, y, z, index) {
    if (MODELS_OK) { addKenneyFeature(worldDef, x, y, z, index); return; }
    const group = new THREE.Group();
    group.position.set(x, y, z);

    if (worldDef.id === 1) {
      // Lush Forest Trees, Cozy Treehouse & Glowing Flowers
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.48, 2.5, 10),
        new THREE.MeshStandardMaterial({ color: 0x78350f })
      );
      trunk.position.y = 1.25;
      const foliage1 = new THREE.Mesh(
        new THREE.SphereGeometry(1.45, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.6 })
      );
      foliage1.position.y = 2.9;
      const foliage2 = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.6 })
      );
      foliage2.position.set(0.4, 3.7, 0.3);
      group.add(trunk, foliage1, foliage2);

      // Add a cozy wooden treehouse lantern on every 3rd tree
      if (index % 3 === 0) {
        const house = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 1.1, 1.4),
          new THREE.MeshStandardMaterial({ color: 0x92400e })
        );
        house.position.y = 2.2;
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(1.46, 0.4, 0.4),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        win.position.y = 2.25;
        group.add(house, win);
      }
    } else if (worldDef.id === 2) {
      // Echo Falls: Animated Waterfall Cascade + Spinning Wooden Waterwheel
      const cliff = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 5.2, 1.8),
        new THREE.MeshStandardMaterial({ color: 0x475569 })
      );
      cliff.position.y = 2.2;
      const fall = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 5.3, 1.9),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.78 })
      );
      fall.position.y = 2.2;
      group.add(cliff, fall);

      if (index % 2 === 0) {
        const wheel = new THREE.Mesh(
          new THREE.TorusGeometry(1.2, 0.18, 10, 16),
          new THREE.MeshStandardMaterial({ color: 0x92400e })
        );
        wheel.position.set(1.1, 1.8, 0);
        wheel.rotation.y = Math.PI / 2;
        group.add(wheel);
        waterWheels.push(wheel);
      }
    } else {
      // Celestial Kingdom: Golden Astral Towers & Floating Crystal Clusters
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.7, 3.8, 12),
        new THREE.MeshStandardMaterial({ color: 0xfef08a, metalness: 0.3, roughness: 0.3 })
      );
      tower.position.y = 1.9;
      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 1.6, 12),
        new THREE.MeshStandardMaterial({ color: 0xc084fc, emissive: 0x7e22ce, emissiveIntensity: 0.4 })
      );
      spire.position.y = 4.5;
      group.add(tower, spire);
    }
    worldGroup.add(group);
  }

  function addCoin(x, y, z) {
    if (ART_OK && artTex.item_crystal_purple) {
      const sp = makeSprite('item_crystal_purple', 0.8, 0.5);
      sp.position.set(x, y, z);
      worldGroup.add(sp);
      crystalCoins.push({ mesh: sp, x, y, z, collected: false });
      return;
    }
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.5,
        metalness: 0.5,
        roughness: 0.15
      })
    );
    mesh.position.set(x, y, z);
    worldGroup.add(mesh);
    crystalCoins.push({ mesh, x, y, z, collected: false });
  }

  function addTreasureChest(x, y, z) {
    if (ART_OK && artTex.item_chest) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const sp = makeSprite('item_chest', 1.0);
      g.add(makeBlobShadow(0.6), sp);
      worldGroup.add(g);
      treasureChests.push({ mesh: g, sprite: sp, x, y, z, opened: false });
      return;
    }
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.65, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x9333ea, roughness: 0.35 })
    );
    box.position.y = 0.32;
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.18, 0.76),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.6, roughness: 0.2 })
    );
    trim.position.y = 0.58;
    const lock = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.26, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xfef08a })
    );
    lock.position.y = 0.46;
    g.add(box, trim, lock);
    worldGroup.add(g);
    treasureChests.push({ mesh: g, x, y, z, opened: false });
  }

  function addCheckpoint(x, y, z) {
    if (ART_OK && artTex.item_checkpoint) {
      const g = new THREE.Group();
      g.position.set(x - 2.6, y, z);
      const sp = makeSprite('item_checkpoint', 1.5);
      const orb = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 32), new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }));
      orb.rotation.x = -Math.PI / 2;
      orb.position.y = 0.05;
      g.add(orb, sp);
      worldGroup.add(g);
      checkpoints.push({ mesh: g, orb, x, y, z, activated: false });
      return;
    }
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.0, 0.22, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
    );
    base.position.y = 0.11;
    const orb = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.09, 10, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    orb.position.y = 0.82;
    g.add(base, orb);
    worldGroup.add(g);
    checkpoints.push({ mesh: g, orb, x, y, z, activated: false });
  }

  // -------------------------------------------------------------------
  // 6b. PAINTED ART SPRITES (loaded from the art/ folder)
  // Replace any .webp in art/ with a sharper image of the same name:
  // no code change needed. If art/ cannot load (e.g. the HTML is opened
  // as a local file), the game falls back to the simple 3D shapes.
  // -------------------------------------------------------------------
  const ART_BASE = 'art/';
  const HERO_POSES = ['idle', 'run', 'jump', 'fall', 'listen', 'answer', 'celebrate', 'back', 'damage'];
  const ART_FILES = [];
  ['aiden', 'luna', 'rex', 'mia'].forEach(h => HERO_POSES.forEach(p => {
    if (p === 'damage' && (h === 'luna' || h === 'mia')) return; // no damage pose on these sheets
    ART_FILES.push(h + '_' + p);
  }));
  ['enemy_slime', 'enemy_mushroom', 'enemy_sprite',
   'item_crystal_purple', 'item_crystal_blue', 'item_chest', 'item_chest_open', 'item_checkpoint',
   'item_portal_green', 'item_portal_blue', 'item_portal_purple', 'item_signpost', 'item_bounce_mushroom',
   'backdrop_w1', 'backdrop_w2', 'backdrop_w3'].forEach(n => ART_FILES.push(n));
  ['dragon_idle', 'dragon_roar', 'dragon_fire', 'dragon_hit', 'dragon_calm', 'dragon_fly'].forEach(n => ART_FILES.push(n));
  const artTex = {};
  let ART_OK = false;
  const HERO_H = 2.4;

  function loadArt() {
    // Browsers block WebGL textures from local files, so only load art when served over http(s)
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve(false);
    const loader = new THREE.TextureLoader();
    return Promise.all(ART_FILES.map(name => new Promise(resolve => {
      loader.load(ART_BASE + name + '.webp', tex => {
        tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        artTex[name] = tex;
        resolve(true);
      }, undefined, () => resolve(false));
    }))).then(() => {
      ART_OK = !!(artTex.aiden_idle && artTex.mia_idle && artTex.luna_idle && artTex.rex_idle);
      return ART_OK;
    });
  }

  function flippedTex(tex) {
    if (!tex._flip) {
      const f = tex.clone();
      f.wrapS = THREE.RepeatWrapping;
      f.repeat.x = -1;
      f.offset.x = 1;
      f.needsUpdate = true;
      tex._flip = f;
    }
    return tex._flip;
  }

  function setSpriteSize(sprite, tex, h) {
    const img = tex.image;
    sprite.userData.baseW = h * img.width / img.height;
    sprite.userData.baseH = h;
    sprite.scale.set(sprite.userData.baseW, h, 1);
  }

  function makeSprite(name, h, centerY = 0) {
    const tex = artTex[name];
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.08 });
    const s = new THREE.Sprite(mat);
    s.center.set(0.5, centerY);
    setSpriteSize(s, tex, h);
    return s;
  }

  function addProp(name, x, y, z, h) {
    if (!ART_OK || !artTex[name]) return null;
    const s = makeSprite(name, h);
    s.position.set(x, y, z);
    worldGroup.add(s);
    return s;
  }

  function makeBlobShadow(r) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    return m;
  }

  // Panorama backdrop on a large cylinder that follows the player
  let backdropMesh = null;
  function setBackdrop(worldId) {
    if (backdropMesh) { scene.remove(backdropMesh); backdropMesh = null; }
    const tex = ART_OK && artTex['backdrop_w' + worldId];
    if (!tex) return;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1; // seen from inside the cylinder
    tex.needsUpdate = true;
    const r = 150;
    const h = (2 * Math.PI * r) * (tex.image.height / tex.image.width);
    backdropMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 64, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    backdropMesh.position.y = h / 2 - 14;
    backdropMesh.rotation.y = Math.PI / 2;
    backdropMesh.renderOrder = -1;
    scene.add(backdropMesh);
  }

  function buildSpriteHero(heroDef) {
    if (heroMesh) scene.remove(heroMesh);
    const root = new THREE.Group();
    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.82, 32),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    groundRing.rotation.x = Math.PI / 2;
    groundRing.position.y = 0.04;
    const listenRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.0, 32),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    listenRing.rotation.x = Math.PI / 2;
    listenRing.position.y = 0.06;
    listenRing.visible = false;
    const sprite = makeSprite(heroDef.id + '_idle', HERO_H);
    root.add(makeBlobShadow(0.55), groundRing, listenRing, sprite);
    heroMesh = root;
    heroParts = { groundRing, listenRing, sprite, heroId: heroDef.id, faceLeft: false, pose: 'idle', particleColor: heroDef.colors.particle };
    scene.add(heroMesh);
  }

  const _camFwd = new THREE.Vector3();
  function updateSpriteHero(elapsed, mirrorImg) {
    const hp = heroParts;
    const id = hp.heroId;
    const st = player.animState;
    let pose = 'idle';
    if (state.isListeningModalOpen) pose = st === 'answer' ? 'answer' : 'listen';
    else if (st === 'celebrate' || st === 'collect') pose = 'celebrate';
    else if (st === 'damage') pose = artTex[id + '_damage'] ? 'damage' : 'fall';
    else if (!player.onGround) pose = player.vel.y > 0 ? 'jump' : 'fall';
    else if (st === 'run') pose = 'run';

    // Which way is the hero moving, as seen by the camera?
    camera.getWorldDirection(_camFwd);
    _camFwd.y = 0;
    _camFwd.normalize();
    const rx = -_camFwd.z, rz = _camFwd.x; // camera right
    const vx = player.vel.x, vz = player.vel.z;
    const side = vx * rx + vz * rz;
    const ahead = vx * _camFwd.x + vz * _camFwd.z;
    if (Math.hypot(vx, vz) > 0.8 && Math.abs(side) > 0.4) hp.faceLeft = side < 0;
    if (pose === 'run' && ahead > Math.abs(side) * 1.4 && artTex[id + '_back']) pose = 'back';

    const base = artTex[id + '_' + pose] || artTex[id + '_idle'];
    const tex = (hp.faceLeft && pose !== 'back') ? flippedTex(base) : base;
    if (hp.sprite.material.map !== tex) {
      hp.sprite.material.map = tex;
      hp.sprite.material.needsUpdate = true;
      setSpriteSize(hp.sprite, base, pose === 'fall' ? HERO_H * 0.85 : HERO_H);
    }

    let bob = 0, sx = 1, sy = 1;
    if (pose === 'run' || pose === 'back') {
      const ph = Math.abs(Math.sin(elapsed * 12));
      bob = ph * 0.12; sy = 1 + ph * 0.04; sx = 1 - ph * 0.03;
    } else if (pose === 'idle' || pose === 'listen' || pose === 'answer') {
      sy = 1 + Math.sin(elapsed * 2.5) * 0.02;
    } else if (pose === 'celebrate') {
      bob = Math.abs(Math.sin(elapsed * 8)) * 0.25;
    }
    hp.sprite.position.y = bob;
    hp.sprite.scale.set(hp.sprite.userData.baseW * sx, hp.sprite.userData.baseH * sy, 1);
    if (mirrorImg) mirrorImg.style.transform = pose === 'run' ? `translateY(${Math.sin(elapsed * 12) * 3}px)` : 'none';
  }

  // -------------------------------------------------------------------
  // 6c. KENNEY 3D SCENERY (models/ folder, CC0 Kenney Nature Kit)
  // Trees, rocks, flowers, statues and waterfalls per world, plus
  // textured ground. Falls back to simple shapes if models cannot load.
  // -------------------------------------------------------------------
  const MODELS_BASE = 'models/';
  const WORLD_SCENERY = {
    1: { // Level 4: Innovation Isle
      extra: ['fence_simple', 'fence_planks', 'log_stack', 'pot_large', 'stone_tallA', 'lily_large', 'campfire_stones'],
      waterfall: true,
      features: ['tree_oak', 'tree_detailed', 'tree_default', 'tree_fat'],
      featureScale: [3.0, 3.6],
      small: ['mushroom_redGroup', 'flower_purpleA', 'flower_redA', 'flower_yellowA', 'plant_bushLarge', 'grass_large', 'stump_round', 'rock_smallA'],
      smallScale: [2.2, 3.2],
      guardian: 'statue_head',
      topTint: 0x5ea548, cliffTint: 0x8d6e4c, waterTint: 0x2b9fd6
    },
    2: { // Level 5: Global Community Hub
      extra: ['tent_detailedOpen', 'tent_smallOpen', 'campfire_stones', 'fence_simple', 'sign', 'pot_large', 'log_stack', 'tree_oak', 'tree_default', 'tree_detailed', 'tree_fat'],
      features: ['tree_oak', 'tree_default', 'tree_detailed', 'tree_fat'],
      featureScale: [3.0, 3.8],
      small: ['flower_yellowA', 'plant_bush', 'grass_large', 'mushroom_tanGroup', 'rock_smallA', 'lily_large'],
      smallScale: [2.2, 3.2],
      guardian: 'statue_head',
      waterfall: false,
      topTint: 0x6aa86b, cliffTint: 0x7c8a99, waterTint: 0x1aa6d8
    },
    3: { // Level 6: Future Voices Summit
      features: ['statue_column', 'statue_obelisk', 'statue_columnDamaged', 'tree_cone'],
      featureScale: [3.2, 4.2],
      small: ['flower_purpleA', 'flower_purpleB', 'flower_purpleC', 'grass_large', 'stone_smallA', 'statue_ring'],
      smallScale: [2.0, 3.0],
      guardian: 'statue_ring',
      topTint: 0xcdbdf0, cliffTint: 0xd8d2e8, waterTint: 0x8b7cf6
    }
  };
  const KENNEY_COLOURS = {
    leafsGreen: 0x3f9e3c, leafsDark: 0x2a6e45, leafsFall: 0xd9822b,
    grass: 0x57a843, dirt: 0x8d6e4c,
    woodBark: 0x7a4f2a, woodBarkDark: 0x5c3b20, wood: 0x9a6a3a, woodDark: 0x6e4a2a,
    stone: 0xaab4bb, stoneDark: 0x7f8a92
  };
  const modelTpl = {};
  let MODELS_OK = false;
  let swayers = [];
  let flowingWaters = [];

  function loadModels() {
    if (!/^https?:$/.test(location.protocol) || !THREE.GLTFLoader) return Promise.resolve(false);
    const names = new Set();
    Object.values(WORLD_SCENERY).forEach(w => {
      w.features.concat(w.small, [w.guardian], w.extra || []).forEach(n => names.add(n));
    });
    const loader = new THREE.GLTFLoader();
    return Promise.all([...names].map(n => new Promise(res => {
      loader.load(MODELS_BASE + n + '.glb', gltf => {
        gltf.scene.traverse(o => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            // glTF defaults to fully metallic, which renders near-black without an env map
            mats.forEach(m => {
              if (!m || !('metalness' in m)) return;
              m.metalness = 0;
              m.roughness = 0.85;
              // Natural colours for Kenney's pastel palette (by material name)
              const nice = KENNEY_COLOURS[m.name];
              if (nice !== undefined && m.color) m.color.setHex(nice);
            });
          }
        });
        modelTpl[n] = gltf.scene;
        res(true);
      }, undefined, () => res(false));
    }))).then(r => {
      MODELS_OK = r.filter(Boolean).length >= names.size * 0.8;
      return MODELS_OK;
    });
  }

  function placeModel(name, x, y, z, scale, rotY = Math.random() * Math.PI * 2) {
    if (!modelTpl[name]) return null;
    const m = modelTpl[name].clone(true);
    m.scale.setScalar(scale);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    worldGroup.add(m);
    return m;
  }

  // Seeded random so each world looks the same every time it loads
  let _seed = 1;
  function srand(s) { _seed = s; }
  function rnd() { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function range(a, b) { return a + rnd() * (b - a); }

  // ---- Procedural textures (no image files needed) ----
  const _texCache = {};
  function noiseTexture(kind) {
    if (_texCache[kind]) return _texCache[kind];
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    if (kind === 'grass') {
      for (let i = 0; i < 2600; i++) {
        const v = 150 + Math.floor(Math.random() * 105);
        g.fillStyle = `rgb(${v},${v},${v})`;
        const x = Math.random() * 256, y = Math.random() * 256;
        g.fillRect(x, y, 2, 3 + Math.random() * 4);
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(120,120,120,0.18)';
        g.beginPath();
        g.arc(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 14, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 'rock') {
      for (let i = 0; i < 900; i++) {
        const v = 150 + Math.floor(Math.random() * 105);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 10, 2 + Math.random() * 5);
      }
      g.strokeStyle = 'rgba(90,90,90,0.35)';
      g.lineWidth = 2;
      for (let y = 32; y < 256; y += 40 + Math.random() * 20) {
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + (Math.random() - 0.5) * 10);
        g.stroke();
      }
    } else if (kind === 'planks') {
      for (let y = 0; y < 256; y += 32) {
        const v = 190 + Math.floor(Math.random() * 50);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(0, y, 256, 30);
        g.fillStyle = 'rgba(80,60,40,0.55)';
        g.fillRect(0, y + 30, 256, 2);
        g.fillStyle = 'rgba(80,60,40,0.35)';
        g.fillRect(20 + Math.random() * 200, y + 12, 4, 4);
      }
    } else if (kind === 'water') {
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#e0f7ff'); grd.addColorStop(1, '#ffffff');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(160,220,255,${0.25 + Math.random() * 0.4})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 6, 30 + Math.random() * 90);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    _texCache[kind] = t;
    return t;
  }

  function texturedMat(kind, color, w, d) {
    const t = noiseTexture(kind).clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, w / 3), Math.max(1, d / 3));
    return new THREE.MeshStandardMaterial({ map: t, color, roughness: 0.85 });
  }

  // Called by addPlatform to dress the top and cliff with texture
  function dressPlatform(group, topMesh, baseMesh, w, d, colorHex, worldId) {
    const sc = WORLD_SCENERY[worldId] || WORLD_SCENERY[1];
    topMesh.material = texturedMat('grass', colorHex, w, d);
    baseMesh.material = texturedMat('rock', sc.cliffTint, w, 2);
  }

  function makePlanks(plat) {
    const top = plat.mesh.children[0];
    top.material = texturedMat('planks', 0xd29a62, 2, 3);
    if (plat.mesh.children[1]) plat.mesh.children[1].material = texturedMat('planks', 0x9c6b3c, 2, 1);
  }

  function addWaterfall(x, y, z, h, rotY) {
    const mat = new THREE.MeshBasicMaterial({
      map: noiseTexture('water').clone(), color: 0x9fe7ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false
    });
    mat.map.needsUpdate = true;
    mat.map.repeat.set(1, 2);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.6, h), mat);
    fall.position.set(x, y + h / 2 - 0.3, z);
    fall.rotation.y = rotY;
    worldGroup.add(fall);
    flowingWaters.push(mat.map);
    const foam = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(x, y + 0.06, z + 0.2);
    worldGroup.add(foam);
  }

  // Replaces the old block trees / towers with Kenney models
  function addKenneyFeature(worldDef, x, y, z, index) {
    const sc = WORLD_SCENERY[worldDef.id];
    const name = sc.features[index % sc.features.length];
    const s = range(sc.featureScale[0], sc.featureScale[1]);
    const m = placeModel(name, x, y, z, s);
    if (m && name.startsWith('tree')) swayers.push({ obj: m, phase: rnd() * 6 });
    if (sc.waterfall && index % 2 === 0) {
      // tall rock with a flowing waterfall in front of it
      const rock = placeModel('stone_tallA', x, y, z - 0.6, 4.2, 0);
      if (rock) addWaterfall(x, y, z + 0.9, 4.0, 0);
    }
    // a few small props around the feature
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2, r = range(0.9, 1.6);
      const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
      if (Math.abs(nx) < 2.6) continue; // keep the centre path clear
      placeModel(pick(sc.small.filter(n => n !== 'lily_large')), nx, y, nz, range(sc.smallScale[0], sc.smallScale[1]));
    }
  }

  // Scatter flowers, grass and rocks along the island edges
  function decorateIsland(worldDef, islandZ, w, d, topY) {
    const sc = WORLD_SCENERY[worldDef.id];
    const n = 14;
    for (let k = 0; k < n; k++) {
      const sideSign = k % 2 === 0 ? -1 : 1;
      const x = sideSign * range(w / 2 - 1.4, w / 2 - 0.35);
      const z = islandZ + range(-d / 2 + 0.6, d / 2 - 0.6);
      const name = pick(sc.small.filter(n => n !== 'lily_large' && n !== 'log_large' && n !== 'log_stack'));
      placeModel(name, x, topY, z, range(sc.smallScale[0], sc.smallScale[1]));
    }
    if (sc.small.includes('lily_large')) {
      for (let k = 0; k < 6; k++) {
        placeModel('lily_large', range(-12, 12), -4.1, islandZ + range(-8, 8), range(3, 5));
      }
    }
  }

  function makeGuardianModel(worldId) {
    const sc = WORLD_SCENERY[worldId];
    if (!MODELS_OK || !modelTpl[sc.guardian]) return null;
    const g = modelTpl[sc.guardian].clone(true);
    g.scale.setScalar(sc.guardian === 'statue_head' ? 1.6 : 2.2);
    return g;
  }

  function animateScenery(dt, elapsed) {
    for (const s of swayers) {
      s.obj.rotation.z = Math.sin(elapsed * 1.2 + s.phase) * 0.025;
    }
    updateDragon(dt, elapsed);
    for (const f of flames) {
      const k = 0.85 + Math.sin(elapsed * 14 + f.phase) * 0.12 + Math.sin(elapsed * 23 + f.phase) * 0.06;
      f.obj.scale.set(k, 1 + (k - 0.85) * 1.6, k);
    }
    for (const t of flowingWaters) {
      t.offset.y += dt * 1.4;
    }
  }

  // -------------------------------------------------------------------
  // Speaking-quest set pieces (Kenney models):
  //   Level 4 Innovation Isle  : waterfalls, workshop fences, log piles
  //   Level 5 Community Hub    : tents, campfires + P / R / E / P posts
  //   Level 6 Future Voices    : ring of columns + the crystal dragon
  // -------------------------------------------------------------------
  let flames = [];
  const PREP_LETTERS = [['P', 'Point'], ['R', 'Reason'], ['E', 'Example'], ['P', 'Point again']];

  function labelSprite(letter, word, colour) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 300;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(15,23,42,0.9)';
    g.beginPath(); g.arc(128, 120, 104, 0, Math.PI * 2); g.fill();
    g.lineWidth = 12; g.strokeStyle = colour; g.stroke();
    g.fillStyle = colour;
    g.font = 'bold 130px Fredoka, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, 128, 126);
    g.font = 'bold 40px Fredoka, Arial, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(word, 128, 272);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    s.scale.set(1.5, 1.75, 1);
    return s;
  }

  function addCampfire(x, y, z) {
    placeModel('campfire_stones', x, y, z, 2.6, 0);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa531, transparent: true, opacity: 0.9 })
    );
    flame.position.set(x, y + 0.5, z);
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.55, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff1a8 })
    );
    core.position.set(x, y + 0.38, z);
    worldGroup.add(flame, core);
    flames.push({ obj: flame, phase: rnd() * 6 }, { obj: core, phase: rnd() * 6 });
  }

  function addPrepPost(x, y, z, idx) {
    const [letter, word] = PREP_LETTERS[idx];
    placeModel('sign', x, y, z, 3.4, 0);
    const lab = labelSprite(letter, word, idx === 3 ? '#34d399' : '#fbbf24');
    lab.position.set(x, y + 2.75, z);
    worldGroup.add(lab);
  }

  function addLevelSetPiece(worldDef, i, islandZ) {
    const y = 0.8;
    if (worldDef.id === 1) {
      // Innovation Isle: workshop yard with fences, log piles and pots
      for (let z = islandZ + 4.6; z > islandZ - 5.2; z -= 1.95) {
        placeModel(i % 2 ? 'fence_planks' : 'fence_simple', -5.0, y, z, 1.95, Math.PI / 2);
      }
      placeModel('log_stack', -3.9, y, islandZ + 4.4, 2.6, 0.4);
      placeModel('pot_large', 4.3, y, islandZ + 3.6, 2.2);
      placeModel('pot_large', 4.5, y, islandZ - 0.6, 1.8);
    } else if (worldDef.id === 2) {
      // Global Community Hub: tents, campfire + a P / R / E post before each bridge
      placeModel(i % 2 ? 'tent_smallOpen' : 'tent_detailedOpen', 3.7, y, islandZ - 1.0, 3.3, -Math.PI / 2 + 0.35);
      addCampfire(2.5, y, islandZ - 2.3);
      for (let z = islandZ + 4.6; z > islandZ - 5.2; z -= 1.95) {
        placeModel('fence_simple', -5.0, y, z, 1.95, Math.PI / 2);
      }
      placeModel('log_stack', -3.9, y, islandZ + 4.4, 2.6, 0.4);
      addPrepPost(-3.0, y, islandZ - 5.2, i);
    } else {
      // Future Voices Summit: a ring of columns around each island
      const n = 10;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = Math.cos(a) * 4.75;
        const z = islandZ + Math.sin(a) * 5.4;
        if (Math.abs(x) < 2.6) continue; // keep the path and bridges open
        if (i === worldDef.challenges.length - 1 && x > 0 && Math.abs(z - islandZ) < 2.5) continue; // dragon's side
        placeModel(k % 3 === 0 ? 'statue_columnDamaged' : 'statue_column', x, y, z, 3.8, 0);
      }
      if (i === worldDef.challenges.length - 1) addDragon(islandZ);
    }
  }

  function addFinalSetPiece(worldDef, finalZ) {
    const y = 1.0;
    if (worldDef.id === 1) {
      addCampfire(0, y, finalZ + 1.4);
      for (let k = 0; k < 6; k++) placeModel('lily_large', range(-12, 12), -4.1, finalZ + range(-6, 6), range(3, 5));
    } else if (worldDef.id === 2) {
      addPrepPost(-3.4, y, finalZ - 1.0, 3);
      addCampfire(0, y, finalZ + 1.4);
      [[-3.8, 2.4], [3.8, 2.4], [3.8, -2.6]].forEach(([x, dz], k) => {
        placeModel(k % 2 ? 'tent_smallOpen' : 'tent_detailedOpen', x, y, finalZ + dz, 3.2, x > 0 ? -Math.PI / 2 : Math.PI / 2);
      });
    } else {
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const x = Math.cos(a) * 5.2, z = finalZ + Math.sin(a) * 5.2;
        if (z > finalZ + 3.5 && Math.abs(x) < 2.8) continue; // summit entrance
        placeModel(k % 4 === 0 ? 'statue_obelisk' : 'statue_column', x, y, z, k % 4 === 0 ? 4.4 : 4.6, 0);
      }
    }
  }

  // -------------------------------------------------------------------
  // LEVEL 6 CRYSTAL DRAGON
  // Hovers beside the last island and breathes fire across the path in a
  // fixed rhythm (roar = warning, then fire). Touching the fire costs a heart
  // and returns the hero to the checkpoint. It never reacts to speaking
  // mistakes. Finishing the Voice Champion mission calms it and it flies away.
  // -------------------------------------------------------------------
  let dragon = null;
  const DRAGON_H = 3.4;

  function addDragon(islandZ) {
    if (!ART_OK || !artTex.dragon_idle) return;
    const sp = makeSprite('dragon_idle', DRAGON_H, 0.5);
    const baseX = 6.4, baseY = 3.3, z = islandZ + 0.6;
    sp.position.set(baseX, baseY, z);
    worldGroup.add(sp);

    // fire breath: a long cone pointing from the dragon's mouth across the island
    const mk = (r, color, opacity) => {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(r, 11, 20, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
      );
      m.rotation.z = -Math.PI / 2;            // tip points to +x (the dragon), wide end to -x
      m.position.set(baseX - 6.6, 1.65, z);
      m.visible = false;
      worldGroup.add(m);
      return m;
    };
    const flame = mk(1.15, 0xff6a13, 0.7);
    const core = mk(0.55, 0xffe066, 0.85);
    // warning strip on the ground so students can see where the fire lands
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xff4d00, transparent: true, opacity: 0, depthWrite: false })
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.84, z);
    worldGroup.add(strip);
    dragon = { sprite: sp, flame, core, strip, baseX, baseY, z, mode: 'idle', t: 0, warned: false, pose: '', flip: null };
  }

  function dragonPose(name, flip) {
    if (!dragon) return;
    if (dragon.pose === name && dragon.flip === flip) return;
    const base = artTex['dragon_' + name] || artTex.dragon_idle;
    dragon.sprite.material.map = flip ? flippedTex(base) : base;
    dragon.sprite.material.needsUpdate = true;
    setSpriteSize(dragon.sprite, base, name === 'hit' || name === 'calm' ? DRAGON_H * 0.85 : DRAGON_H);
    dragon.pose = name;
    dragon.flip = flip;
  }

  function setDragonFire(on) {
    dragon.flame.visible = dragon.core.visible = on;
  }

  function updateDragon(dt, elapsed) {
    if (!dragon) return;
    const d = dragon;
    d.t += dt;
    const busy = !state.isPlaying || state.isPaused || state.isListeningModalOpen;

    if (d.mode === 'calm') {
      dragonPose('calm', true);
      d.sprite.position.y = d.baseY - 0.4 + Math.sin(elapsed * 2) * 0.08;
      if (d.t > 2.8) { d.mode = 'leave'; d.t = 0; }
      return;
    }
    if (d.mode === 'leave') {
      dragonPose('fly', false);
      d.sprite.position.x += dt * 7;
      d.sprite.position.y += dt * 3.2;
      d.sprite.material.opacity = Math.max(0, 1 - d.t / 3.5);
      if (d.t > 3.6) {
        worldGroup.remove(d.sprite, d.flame, d.core, d.strip);
        dragon = null;
      }
      return;
    }

    // hover
    d.sprite.position.y = d.baseY + Math.sin(elapsed * 2.4) * 0.25;
    d.sprite.position.z = d.z + Math.sin(elapsed * 0.9) * 0.3;

    if (busy) {
      d.mode = 'idle'; d.t = 0;
      setDragonFire(false);
      d.strip.material.opacity = 0;
      dragonPose('idle', true);
      return;
    }

    if (d.mode === 'idle') {
      dragonPose('idle', true);
      setDragonFire(false);
      d.strip.material.opacity = 0;
      if (d.t > 3.2) { d.mode = 'roar'; d.t = 0; }
    } else if (d.mode === 'roar') {
      dragonPose('roar', true);
      d.strip.material.opacity = 0.18 + Math.abs(Math.sin(elapsed * 10)) * 0.2; // warning flash
      if (!d.warned && Math.abs(player.pos.z - d.z) < 9) {
        d.warned = true;
        showToast('🐉 The dragon roars! Wait for the fire to stop, then run past.');
      }
      if (d.t > 1.1) { d.mode = 'fire'; d.t = 0; playSfx('damage'); }
    } else if (d.mode === 'fire') {
      dragonPose('fire', true);
      setDragonFire(true);
      const flick = 0.9 + Math.sin(elapsed * 30) * 0.08;
      d.flame.scale.set(flick, 1, flick);
      d.flame.position.z = d.core.position.z = d.strip.position.z = d.sprite.position.z;
      d.strip.material.opacity = 0.35;
      // hit test: hero inside the fire lane on the island
      if (player.invulnerableTimer <= 0 && player.pos.x < d.baseX - 0.5 &&
          Math.abs(player.pos.z - d.sprite.position.z) < 1.25 && player.pos.y < 3.4) {
        takePlayerDamage('🔥 Too hot! Wait for the dragon to stop breathing fire.');
      }
      if (d.t > 1.8) { d.mode = 'idle'; d.t = 0; }
    }
  }

  function calmDragon(silent) {
    if (!dragon) return;
    setDragonFire(false);
    dragon.strip.material.opacity = 0;
    if (silent) {
      worldGroup.remove(dragon.sprite, dragon.flame, dragon.core, dragon.strip);
      dragon = null;
      return;
    }
    dragon.mode = 'calm';
    dragon.t = 0;
    dragon.sprite.material.transparent = true;
    setTimeout(() => showToast('🐉💜 Your voice calmed the crystal dragon! It flies away and the summit is safe.'), 1200);
  }

  let buildingWorldId = 1;
  function buildWorld(worldId) {
    clearWorld();
    const worldDef = WORLDS.find(w => w.id === worldId) || WORLDS[0];
    buildingWorldId = worldDef.id;
    srand(worldDef.id * 1000 + 7);

    scene.background = new THREE.Color(worldDef.skyColor);
    setBackdrop(worldDef.id);
    scene.fog = new THREE.FogExp2(worldDef.fogColor, 0.006);

    // Shimmering Crystal River / Sky Sea Plane below the islands
    waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 320, 24, 24),
      new THREE.MeshStandardMaterial({
        color: worldDef.waterColor,
        roughness: 0.2,
        metalness: 0.15,
        transparent: true,
        opacity: 0.85
      })
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(0, -4.2, -90);
    worldGroup.add(waterMesh);

    // Fluffy 3D Clouds in the Sky
    for (let c = 0; c < 18; c++) {
      addCloud(
        (Math.random() - 0.5) * 75,
        12 + Math.random() * 10,
        20 - c * 14,
        0.9 + Math.random() * 0.8
      );
    }

    // Reset level counters
    state.hearts = 3;
    state.levelScore = 0;
    state.coinsCollected = 0;
    state.chestsCollected = 0;
    state.challengesSolved = 0;
    state.firstAttemptCorrectCount = 0;
    state.levelLog = [];
    state.currentCheckpoint = { x: 0, y: 1.5, z: 4.5 };

    const numChallenges = worldDef.challenges.length;
    let curZ = 0;
    let coinsPlaced = 0;
    const coinsPerSegment = Math.floor(worldDef.totalCoins / numChallenges);

    for (let i = 0; i < numChallenges; i++) {
      const ch = worldDef.challenges[i];
      const islandZ = curZ;

      // Main Sunlit Island Platform
      addPlatform(0, 0, islandZ, 10.5, 1.6, 12.0, worldDef.groundColor);
      if (MODELS_OK) { decorateIsland(worldDef, islandZ, 10.5, 12.0, 0.8); addLevelSetPiece(worldDef, i, islandZ); }

      // Decorative Trees / Waterfalls / Astral Towers on Island Edges
      addDecorativeScenery(worldDef, -4.1, 0.8, islandZ - 2.2, i);
      addDecorativeScenery(worldDef, 4.1, 0.8, islandZ + 2.2, i + 1);

      // Bouncy Giant Red Mushroom Pad on side of island for fun high jumps!
      addBouncyMushroom(-3.2, 0.8, islandZ + 1.2);

      // Checkpoint at start of each island
      addCheckpoint(0, 0.8, islandZ + 3.5);
      addProp('item_signpost', 3.4, 0.8, islandZ + 4.4, 1.3);
      addProp('item_crystal_blue', -4.3, 0.8, islandZ - 0.8, 1.0);

      // Crystal Coins along the island
      for (let c = 0; c < coinsPerSegment && coinsPlaced < worldDef.totalCoins; c++) {
        const cx = ((c % 3) - 1) * 2.0;
        const cz = islandZ + 2.2 - c * 1.4;
        addCoin(cx, 1.55, cz);
        coinsPlaced++;
      }

      // Cute Patrolling Critter
      const enemyTypes = worldDef.id === 1 ? ['slime', 'mushroom'] : (worldDef.id === 2 ? ['mushroom', 'sprite'] : ['sprite', 'slime']);
      const eType = enemyTypes[i % enemyTypes.length];
      if (!(worldDef.id === 3 && i === numChallenges - 1)) {
      const eMesh = createCuteEnemyMesh(eType);
      const eZ = islandZ + 0.2;
      eMesh.position.set(0, 0.8, eZ);
      worldGroup.add(eMesh);
      enemies.push({
        mesh: eMesh,
        type: eType,
        baseX: 0,
        y: 0.8,
        z: eZ,
        range: 3.0,
        speed: 1.3 + worldDef.id * 0.2,
        phase: i * 1.3
      });
      }

      // Hidden Treasure Chests on bonus side islands
      const chestIndices = worldDef.chestIndices || [];
      if (chestIndices.includes(i)) {
        const sideX = (i % 2 === 0) ? -7.6 : 7.6;
        addPlatform(sideX * 0.55, 0.4, islandZ, 2.8, 1.0, 2.8, worldDef.platformColor);
        addPlatform(sideX, 0.7, islandZ, 3.8, 1.2, 3.8, worldDef.platformColor);
        addTreasureChest(sideX, 1.3, islandZ);
      }

      // Glowing Listening Crystal Pedestal + 3D NPC Guardian at north (-Z) edge
      const crystalZ = islandZ - 4.4;
      const crystalGroup = new THREE.Group();
      crystalGroup.position.set(0, 0.8, crystalZ);

      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.95, 0.55, 14),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 })
      );
      ped.position.y = 0.28;

      const gem = (ART_OK && artTex.item_crystal_blue)
        ? makeSprite('item_crystal_blue', 1.7, 0.5)
        : new THREE.Mesh(
          new THREE.OctahedronGeometry(0.82, 0),
          new THREE.MeshStandardMaterial({
            color: worldDef.crystalColor,
            emissive: worldDef.crystalColor,
            emissiveIntensity: 0.7,
            roughness: 0.1
          })
        );
      gem.position.y = 1.55;

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.15, 0.07, 10, 28),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.32;

      // Friendly 3D Guardian standing right next to the Listening Crystal
      const guardianMesh = createGuardianNPC(worldDef.id, i);
      guardianMesh.position.set(1.45, 0, 0.2);
      guardianMesh.rotation.y = -0.4;

      crystalGroup.add(ped, gem, ring, guardianMesh);
      worldGroup.add(crystalGroup);

      // Locked Golden Rope/Crystal Bridge + Moving Platform linking to the next island
      const bridgeZ = islandZ - 8.5;
      const bridgePlat = addPlatform(0, 0.1, bridgeZ, 4.6, 0.7, 5.6, 0xfbbf24);
      bridgePlat.active = false;
      bridgePlat.mesh.visible = false;
      makePlanks(bridgePlat);

      const movePlatZ = islandZ - 13.4;
      const moveSpec = {
        axis: (i % 2 === 0) ? 'x' : 'y',
        amp: (i % 2 === 0) ? 2.4 : 1.0,
        speed: 1.4 + worldDef.id * 0.18,
        phase: i
      };
      // Locked too, so the gap cannot be jumped before the crystal is solved
      const movePlat = addPlatform(0, 0.2, movePlatZ, 4.4, 0.8, 4.4, worldDef.platformColor, true, moveSpec);
      movePlat.active = false;
      movePlat.mesh.visible = false;

      listeningCrystals.push({
        id: ch.id,
        index: i,
        challenge: ch,
        group: crystalGroup,
        gem,
        ring,
        guardianMesh,
        x: 0,
        y: 0.8,
        z: crystalZ,
        solved: false,
        bridgePlat,
        movePlat
      });

      curZ -= 21.0; // wider gap between islands
    }

    // Final Sanctuary Island + Portal
    const finalZ = curZ;
    addPlatform(0, 0.2, finalZ, 11.5, 1.6, 11.5, worldDef.groundColor);
    while (coinsPlaced < worldDef.totalCoins) {
      const ang = (coinsPlaced / 8) * Math.PI * 2;
      addCoin(Math.cos(ang) * 3.4, 1.7, finalZ + Math.sin(ang) * 3.4);
      coinsPlaced++;
    }

    if (MODELS_OK) addFinalSetPiece(worldDef, finalZ);
    const portalGroup = new THREE.Group();
    portalGroup.position.set(0, 1.0, finalZ - 2.4);
    const portalArt = ['item_portal_green', 'item_portal_blue', 'item_portal_purple'][worldDef.id - 1];
    if (ART_OK && artTex[portalArt]) {
      const sp = makeSprite(portalArt, 4.4);
      sp.material.opacity = 0.55;
      portalGroup.add(sp);
      worldGroup.add(portalGroup);
      portalObject = { group: portalGroup, vortex: sp, x: 0, y: 1.0, z: finalZ - 2.4, unlocked: false };
    } else {
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.35, 12, 28, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.3 })
    );
    const vortex = new THREE.Mesh(
      new THREE.CircleGeometry(1.95, 28),
      new THREE.MeshBasicMaterial({
        color: worldDef.portalColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45
      })
    );
    vortex.position.y = 1.0;
    arch.position.y = 0.2;
    portalGroup.add(arch, vortex);
    worldGroup.add(portalGroup);

    portalObject = {
      group: portalGroup,
      vortex,
      x: 0,
      y: 1.0,
      z: finalZ - 2.4,
      unlocked: false
    };
    }

    // Sunbeams / Floating Firefly Particles
    const pGeo = new THREE.SphereGeometry(0.1, 6, 6);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    for (let p = 0; p < 50; p++) {
      const pm = new THREE.Mesh(pGeo, pMat);
      pm.position.set(
        (Math.random() - 0.5) * 28,
        1.5 + Math.random() * 7,
        -Math.random() * Math.abs(finalZ - 8)
      );
      worldGroup.add(pm);
      ambientParticles.push({
        mesh: pm,
        baseY: pm.position.y,
        phase: Math.random() * Math.PI * 2
      });
    }

    const heroDef = HEROES.find(h => h.id === state.selectedHeroId) || HEROES[0];
    buildHeroMesh(heroDef);
    respawnAtCheckpoint(false);
    updateHUD();
  }

  function respawnAtCheckpoint(playSound = true) {
    player.pos.set(state.currentCheckpoint.x, state.currentCheckpoint.y + 0.5, state.currentCheckpoint.z);
    player.vel.set(0, 0, 0);
    player.onGround = false;
    if (heroMesh) {
      heroMesh.position.copy(player.pos);
    }
    if (playSound) playSfx('checkpoint');
  }

  // -------------------------------------------------------------------
  // 8. CONTROLS, 360° MOUSE ORBIT & CAMERA VIEW SWITCHER ("SEE YOURSELF")
  // -------------------------------------------------------------------
  const keys = { up: false, down: false, left: false, right: false, jump: false };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.up = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.down = true;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space') {
      keys.jump = true;
      triggerJump();
    }
    if (e.code === 'KeyE') {
      triggerInteract();
    }
    if (e.code === 'KeyC') {
      cycleCameraMode();
    }
    if (e.code === 'Escape') {
      if (state.isListeningModalOpen) {
        closeListeningModal();
      } else if (state.isPlaying) {
        togglePauseModal();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.up = false;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.down = false;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space') keys.jump = false;
  });

  // Mouse / Pointer Drag on 3D Canvas to Orbit 360° Around Hero!
  let isDraggingCam = false;
  let dragStartX = 0;
  container.addEventListener('pointerdown', (e) => {
    isDraggingCam = true;
    dragStartX = e.clientX;
  });
  window.addEventListener('pointermove', (e) => {
    if (!isDraggingCam) return;
    const dx = e.clientX - dragStartX;
    dragStartX = e.clientX;
    state.camOrbitYaw -= dx * 0.008;
  });
  window.addEventListener('pointerup', () => {
    isDraggingCam = false;
  });

  function cycleCameraMode() {
    state.camModeIndex = (state.camModeIndex + 1) % CAM_MODES.length;
    state.camOrbitYaw = 0;
    const mode = CAM_MODES[state.camModeIndex];
    document.getElementById('label-cam-mode').textContent = mode.label;
    showToast(`🎥 Switched to ${mode.label} (Tip: Drag screen to orbit 360° around your hero!)`);
  }

  document.getElementById('btn-hud-cam').addEventListener('click', cycleCameraMode);
  document.getElementById('btn-center-hero').addEventListener('click', () => {
    state.camOrbitYaw = 0;
    showToast('🎥 Camera centered behind hero!');
  });

  // Toggle Hero Mirror card
  document.getElementById('btn-hud-webcam').addEventListener('click', () => {
    const card = document.getElementById('self-mirror-card');
    card.classList.toggle('hidden');
  });

  // Touch directional buttons
  document.querySelectorAll('.touch-dir-btn').forEach(btn => {
    const dir = btn.getAttribute('data-dir');
    const setDir = (val) => { keys[dir] = val; };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setDir(true); });
    btn.addEventListener('pointerup', (e) => { e.preventDefault(); setDir(false); });
    btn.addEventListener('pointerleave', () => setDir(false));
    btn.addEventListener('pointercancel', () => setDir(false));
  });

  document.getElementById('btn-touch-jump').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    triggerJump();
  });

  document.getElementById('btn-touch-listen').addEventListener('click', triggerInteract);
  document.getElementById('btn-interact-prompt').addEventListener('click', triggerInteract);

  function triggerJump() {
    if (!state.isPlaying || state.isPaused || state.isListeningModalOpen) return;
    if (player.onGround) {
      player.vel.y = 10.6;
      player.onGround = false;
      setHeroAnimState('jump', 0.55);
      playSfx('jump');
      spawnHeroBurst(8, heroParts.particleColor);
    }
  }

  function spawnHeroBurst(count, colorHex) {
    const geo = new THREE.SphereGeometry(0.09, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex || 0xfbbf24 });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(player.pos).add(new THREE.Vector3(0, 0.7, 0));
      worldGroup.add(m);
      trailParticles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4.5, 1.8 + Math.random() * 3.2, (Math.random() - 0.5) * 4.5),
        life: 0.6
      });
    }
  }

  // -------------------------------------------------------------------
  // 9. INTERACTION & SPEAKING MISSIONS (see js/speaking.js)
  // -------------------------------------------------------------------
  function findNearestListeningCrystal() {
    let nearest = null;
    let minDist = 3.5;
    for (const lc of listeningCrystals) {
      const dist = Math.hypot(player.pos.x - lc.x, player.pos.z - lc.z);
      if (dist < minDist) {
        minDist = dist;
        nearest = lc;
      }
    }
    return nearest;
  }

  function triggerInteract() {
    if (!state.isPlaying || state.isPaused || state.isListeningModalOpen) return;
    const nearCrystal = findNearestListeningCrystal();
    if (nearCrystal) {
      openListeningModal(nearCrystal);
    } else {
      showToast('Walk up to a glowing Voice Crystal & Guardian ahead!');
    }
  }

  function openListeningModal(crystalObj) {
    state.isListeningModalOpen = true;
    state.activeCrystalObj = crystalObj;
    keys.up = keys.down = keys.left = keys.right = false;

    player.pos.set(crystalObj.x - 1.35, crystalObj.y, crystalObj.z + 0.4);
    player.facingAngle = 0.35;
    state.currentCheckpoint = { x: crystalObj.x, y: crystalObj.y, z: crystalObj.z + 2.2 };

    const worldDef = WORLDS.find(w => w.id === state.currentWorldId);
    window.CQSpeak.open({
      mission: crystalObj.challenge,
      index: crystalObj.index,
      total: worldDef.challenges.length,
      review: crystalObj.solved,
      onComplete: result => {
        const pts = crystalObj.solved ? 0 : result.stars * 100;
        logMission(result, pts);
        if (!crystalObj.solved) {
          state.levelScore += pts;
          state.totalScore += pts;
          state.missionStars[result.missionId] = Math.max(state.missionStars[result.missionId] || 0, result.stars);
          completeCrystal(crystalObj);
          showToast(crystalObj.challenge.unlock || '🌉 Bridge unlocked!');
        } else {
          showToast('✨ Great practice!');
        }
        updateHUD();
      },
      onBonus: result => {
        const b = crystalObj.challenge.bonus || {};
        const pts = b.points || 100;
        logMission(result, pts);
        state.levelScore += pts;
        state.totalScore += pts;
        state.bonusDone[crystalObj.challenge.id] = true;
        if (/badge/i.test(b.label || '')) state.badges.voiceChampion = true;
        spawnHeroBurst(18, 0xfbbf24);
        showToast(`⭐ Bonus complete! ${b.label || ''}`);
        updateHUD();
        saveProgress();
      },
      onClose: () => {
        state.isListeningModalOpen = false;
        if (player.animState === 'listen' || player.animState === 'answer') setHeroAnimState('idle', 0);
      }
    });
  }

  // Hero pose follows the speaking panel
  function speakingPhase(phase) {
    if (phase === 'speak') setHeroAnimState('answer', 9999);
    else if (phase === 'listen') setHeroAnimState('listen', 9999);
    else setHeroAnimState('idle', 0);
  }

  function logMission(r, points) {
    const entry = {
      time: new Date().toISOString(),
      student: state.studentName || '',
      group: state.studentClass || '',
      world: state.currentWorldId,
      mission: r.missionId + (r.bonus ? ' (bonus)' : ''),
      title: r.title,
      support: r.support,
      supportsUsed: (r.supportsUsed || []).join(' / '),
      mode: r.mode,
      seconds: r.seconds,
      words: r.words,
      stars: r.stars,
      points: points,
      tries: r.tries,
      selfCheck: Object.keys(r.checks).filter(k => r.checks[k]).join(' + '),
      spotted: [r.autoSpotted.detail ? 'detail' : '', r.autoSpotted.structure ? 'structure' : ''].filter(Boolean).join(' + '),
      transcript: state.saveTranscripts ? r.transcript : ''
    };
    state.levelLog.push(entry);
    try {
      const all = JSON.parse(localStorage.getItem(RESULTS_KEY) || '[]');
      all.push(entry);
      localStorage.setItem(RESULTS_KEY, JSON.stringify(all.slice(-2000)));
    } catch (e) {}
  }

  function completeCrystal(crystalObj, silent = false) {
    crystalObj.solved = true;
    state.challengesSolved++;
    for (const p of [crystalObj.bridgePlat, crystalObj.movePlat]) {
      if (p) { p.active = true; p.mesh.visible = true; }
    }
    if (crystalObj.gem.isSprite && artTex.item_crystal_purple) {
      crystalObj.gem.material.map = artTex.item_crystal_purple; // restored crystal turns purple
      crystalObj.gem.material.needsUpdate = true;
    } else {
      crystalObj.gem.material.color.setHex(0xfbbf24);
      if (crystalObj.gem.material.emissive) crystalObj.gem.material.emissive.setHex(0xf59e0b);
    }
    const worldDef = WORLDS.find(w => w.id === state.currentWorldId);
    const allDone = state.challengesSolved >= worldDef.challenges.length;
    if (allDone && portalObject) {
      portalObject.unlocked = true;
      portalObject.vortex.material.opacity = 0.95;
    }
    if (worldDef.id === 3 && crystalObj.index === worldDef.challenges.length - 1) calmDragon(silent);
    if (!silent) {
      setHeroAnimState('celebrate', 2.8);
      spawnHeroBurst(22, 0xfbbf24);
      playSfx('chest');
      if (allDone) setTimeout(() => showToast('🌀 All three missions done! The portal is open.'), 2600);
    }
    updateHUD();
    saveProgress();
  }

  // Resume: missions finished in an earlier session stay finished
  function applySavedMissions() {
    for (const lc of listeningCrystals) {
      if (state.missionStars[lc.challenge.id]) completeCrystal(lc, true);
    }
  }

  function closeListeningModal() {
    if (window.CQSpeak.isOpen()) window.CQSpeak.close();
    state.isListeningModalOpen = false;
  }

  // -------------------------------------------------------------------
  // 10. LEVEL COMPLETION & SPEAKING REPORT
  // -------------------------------------------------------------------
  function completeCurrentLevel() {
    state.isPlaying = false;
    playSfx('portal');

    const worldDef = WORLDS.find(w => w.id === state.currentWorldId);
    const levelBonus = 300;
    state.levelScore += levelBonus;
    state.totalScore += levelBonus;

    const missionIds = worldDef.challenges.map(c => c.id);
    const starSum = missionIds.reduce((n, id) => n + (state.missionStars[id] || 0), 0);
    const stars = Math.max(1, Math.round(starSum / missionIds.length));

    const wp = state.worldProgress[state.currentWorldId];
    wp.completed = true;
    wp.stars = Math.max(wp.stars, stars);
    wp.bestScore = Math.max(wp.bestScore, state.levelScore);
    wp.coins = Math.max(wp.coins, state.coinsCollected);
    wp.chests = Math.max(wp.chests, state.chestsCollected);
    wp.solved = worldDef.challenges.length;
    saveProgress();

    const isFinalWorld = state.currentWorldId === 3;
    document.getElementById('results-crown').textContent = isFinalWorld ? '👑' : '🏆';
    document.getElementById('results-title').textContent = isFinalWorld
      ? 'The Kingdom Can Speak Again!'
      : `Level ${worldDef.level || state.currentWorldId}: ${worldDef.name} Complete!`;
    document.getElementById('results-subtitle').textContent =
      (state.studentName ? state.studentName + (state.studentClass ? ' (' + state.studentClass + ')' : '') + ': ' : '') +
      (isFinalWorld
        ? 'You reunited all three Voice Crystal shards.' + (state.badges.voiceChampion ? ' 🏅 Voice Champion!' : '')
        : `Voice Crystal shard ${state.currentWorldId} restored! +300 points.`);

    document.getElementById('results-stars').innerHTML =
      [1, 2, 3].map(n => n <= stars ? '<span>⭐</span>' : '<span class="opacity-25">⭐</span>').join('');
    document.getElementById('results-score').textContent = state.levelScore.toLocaleString() + ' pts';
    document.getElementById('results-accuracy').textContent = `${starSum} / ${missionIds.length * 3} ⭐`;
    document.getElementById('results-coins').textContent = `${state.coinsCollected} / ${worldDef.totalCoins}`;
    document.getElementById('results-chests').textContent = `${state.chestsCollected} / ${worldDef.totalChests}`;

    // Per-mission summary (latest attempt of each mission this session)
    const rows = worldDef.challenges.map(c => {
      const tries = state.levelLog.filter(e => e.mission === c.id);
      const last = tries[tries.length - 1];
      const st = state.missionStars[c.id] || 0;
      if (!last) {
        return `<tr><td class="py-1 pr-2">${c.id} ${c.title}</td><td class="py-1 text-right">${'⭐'.repeat(st) || '-'}</td><td class="py-1 pl-2 text-slate-400">earlier session</td></tr>`;
      }
      const how = last.mode === 'typed' ? '⌨️ typed' : `🎙️ ${last.seconds}s`;
      return `<tr><td class="py-1 pr-2">${c.id} ${c.title}</td><td class="py-1 text-right">${'⭐'.repeat(st)}</td><td class="py-1 pl-2 text-slate-300">${how} • ${last.support}</td></tr>`;
    }).join('');
    document.getElementById('results-skills').innerHTML =
      `<table class="w-full"><thead><tr class="text-purple-300"><th class="text-left font-semibold pb-1">Mission</th><th class="text-right font-semibold pb-1">Stars</th><th class="text-left font-semibold pb-1 pl-2">How / help</th></tr></thead><tbody>${rows}</tbody></table>`;

    const nextBtn = document.getElementById('btn-results-next');
    nextBtn.textContent = isFinalWorld ? '🎉 Play Level 1 Again' : `⏭️ Next Level →`;
    document.getElementById('modal-results').classList.remove('hidden');
  }

  function getAllResults() {
    try { return JSON.parse(localStorage.getItem(RESULTS_KEY) || '[]'); } catch (e) { return []; }
  }

  const REPORT_COLS = [
    ['time', 'Time'], ['student', 'Student'], ['group', 'Class'], ['world', 'Level'], ['mission', 'Mission'],
    ['title', 'Title'], ['support', 'Support'], ['supportsUsed', 'Supports viewed'], ['mode', 'Mode'],
    ['seconds', 'Seconds'], ['words', 'Words'], ['stars', 'Stars'], ['points', 'Points'], ['tries', 'Tries'],
    ['selfCheck', 'Student ticked'], ['spotted', 'Game spotted'], ['transcript', 'Transcript']
  ];
  function resultsAsTSV(log) {
    const clean = v => String(v === undefined ? '' : v).replace(/[\t\n\r]+/g, ' ');
    return [REPORT_COLS.map(c => c[1]).join('\t')]
      .concat(log.map(e => REPORT_COLS.map(c => clean(e[c[0]])).join('\t'))).join('\n');
  }
  function resultsAsCSV(log) {
    const esc = v => '"' + String(v === undefined ? '' : v).replace(/"/g, '""') + '"';
    return [REPORT_COLS.map(c => esc(c[1])).join(',')]
      .concat(log.map(e => REPORT_COLS.map(c => esc(e[c[0]])).join(','))).join('\n');
  }

  document.getElementById('btn-results-copy').addEventListener('click', async () => {
    const text = resultsAsTSV(state.levelLog);
    try {
      await navigator.clipboard.writeText(text);
      showToast('📋 Results copied. Paste into Google Sheets or Excel.');
    } catch (e) {
      window.prompt('Copy these results:', text);
    }
  });

  document.getElementById('btn-results-csv').addEventListener('click', () => {
    const log = getAllResults();
    if (!log.length) { showToast('No results saved on this device yet.'); return; }
    const blob = new Blob(['﻿' + resultsAsCSV(log)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const who = (state.studentName || 'student').replace(/[^\w-]+/g, '_');
    a.download = `CrystalQuest2_speaking_${who}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });

  // -------------------------------------------------------------------
  // 11. UI RENDERING
  // -------------------------------------------------------------------
  function renderHeroCards() {
    const grid = document.getElementById('hero-cards-grid');
    grid.innerHTML = '';
    HEROES.forEach(h => {
      const isSelected = h.id === state.selectedHeroId;
      const card = document.createElement('div');
      card.className = `rounded-2xl p-3.5 border-2 transition cursor-pointer flex flex-col justify-between ${
        isSelected
          ? 'bg-purple-900/80 border-amber-400 shadow-lg shadow-amber-400/20'
          : 'bg-slate-900/80 border-purple-500/30 hover:border-purple-400'
      }`;
      card.innerHTML = `
        <div class="space-y-2.5">
          <div class="relative w-full h-32 rounded-xl overflow-hidden bg-slate-950 border border-purple-400/30">
            <img src="${h.portrait}" alt="${h.name}" class="w-full h-full object-cover" />
            ${isSelected ? '<span class="absolute top-2 right-2 bg-amber-400 text-slate-950 text-[11px] font-extrabold px-2 py-0.5 rounded-full">SELECTED</span>' : ''}
          </div>
          <div>
            <h3 class="font-display font-bold text-base text-white">${h.name}</h3>
            <div class="text-xs font-semibold text-amber-300">${h.title}</div>
            <p class="text-xs text-purple-200 mt-1">${h.traits}</p>
          </div>
        </div>
        <div class="mt-3 pt-2 border-t border-purple-400/20 text-xs font-semibold text-cyan-300">
          ${h.effectLabel}
        </div>
      `;
      card.addEventListener('click', () => {
        state.selectedHeroId = h.id;
        buildHeroMesh(h);
        updateHUD();
        saveProgress();
        renderHeroCards();
        playSfx('coin');
      });
      grid.appendChild(card);
    });
  }

  function renderWorldCards() {
    const grid = document.getElementById('world-cards-grid');
    grid.innerHTML = '';
    WORLDS.forEach(w => {
      const wp = state.worldProgress[w.id];
      const starsStr = [1, 2, 3].map(n => n <= wp.stars ? '⭐' : '☆').join(' ');
      const card = document.createElement('div');
      card.className = 'rounded-2xl p-4 bg-slate-900/85 border-2 border-purple-400/40 hover:border-amber-400 transition flex flex-col justify-between space-y-3';
      card.innerHTML = `
        <div class="space-y-2.5">
          <div class="relative w-full h-32 rounded-xl overflow-hidden border border-purple-400/30">
            <img src="${ART_OK ? ART_BASE + 'card_w' + w.id + '.webp' : w.thumb}" alt="${w.name}" class="w-full h-full object-cover" />
            <span class="absolute top-2 left-2 bg-slate-950/85 text-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-400/40">Level ${w.level || w.id}</span>
            <span class="absolute top-2 right-2 bg-slate-950/85 text-yellow-300 text-xs font-bold px-2 py-0.5 rounded-full">${starsStr}</span>
          </div>
          <div>
            <h3 class="font-display font-bold text-lg text-white">${w.name}</h3>
            <div class="text-xs font-semibold text-cyan-300">${w.subtitle}</div>
            <p class="text-xs text-purple-200 mt-1">${w.objectiveDesc}</p>
          </div>
          <div class="grid grid-cols-3 gap-1 text-xs bg-slate-950/70 p-2 rounded-xl text-center text-slate-300">
            <div>🎧 ${w.challenges.length} Clips</div>
            <div>💎 ${w.totalCoins} Coins</div>
            <div>🎁 ${w.totalChests} Chests</div>
          </div>
        </div>
        <button type="button" class="crystal-btn w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 font-display font-extrabold text-sm shadow">
          ▶️ Enter ${w.name}
        </button>
      `;
      card.querySelector('button').addEventListener('click', () => {
        document.getElementById('modal-worlds').classList.add('hidden');
        startGameLevel(w.id);
      });
      grid.appendChild(card);
    });
  }

  function updateMainMenuSummary() {
    const heroDef = HEROES.find(h => h.id === state.selectedHeroId) || HEROES[0];
    document.getElementById('menu-hero-img').src = heroDef.portrait;
    document.getElementById('menu-hero-title').textContent = `${heroDef.name} — ${heroDef.title}`;
    document.getElementById('menu-hero-desc').textContent = `${heroDef.traits}. Trail: ${heroDef.effectLabel}`;

    const totalStars = state.worldProgress[1].stars + state.worldProgress[2].stars + state.worldProgress[3].stars;
    document.getElementById('menu-progress-summary').textContent = `Saved Progress: ${totalStars} / 9 ⭐ | ${state.totalScore.toLocaleString()} Pts`;

    const curWorld = WORLDS.find(w => w.id === state.currentWorldId) || WORLDS[0];
    document.getElementById('label-continue-btn').textContent = `Continue Saved Quest`;

    const listEl = document.getElementById('menu-worlds-list');
    listEl.innerHTML = WORLDS.map(w => {
      const wp = state.worldProgress[w.id];
      const st = [1, 2, 3].map(n => n <= wp.stars ? '⭐' : '☆').join('');
      return `
        <div class="flex items-center justify-between bg-slate-950/60 px-3 py-1.5 rounded-lg border border-purple-500/20">
          <span class="font-semibold text-purple-100">Lv.${w.level || w.id} ${w.name}</span>
          <span class="text-amber-300 font-bold">${st} (${w.challenges.length} 🎧)</span>
        </div>
      `;
    }).join('');
  }

  function updateHUD() {
    const heroDef = HEROES.find(h => h.id === state.selectedHeroId) || HEROES[0];
    const worldDef = WORLDS.find(w => w.id === state.currentWorldId) || WORLDS[0];

    document.getElementById('hud-hero-img').src = heroDef.portrait;
    document.getElementById('mirror-hero-img').src = heroDef.portrait;
    document.getElementById('hud-hero-name').textContent = heroDef.name;
    document.getElementById('hero-tag-name').textContent = `YOU (${heroDef.name})`;
    document.getElementById('hud-level-badge').textContent = `Lv.${worldDef.level || worldDef.id} ${worldDef.name}`;

    const heartsEl = document.getElementById('hud-hearts');
    heartsEl.innerHTML = [1, 2, 3].map(n =>
      n <= state.hearts
        ? '<span class="text-rose-500 text-base drop-shadow">❤️</span>'
        : '<span class="text-slate-600 text-base">🖤</span>'
    ).join('');

    document.getElementById('hud-coins').textContent = `${state.coinsCollected} / ${worldDef.totalCoins}`;
    document.getElementById('hud-listening').textContent = `${state.challengesSolved} / ${worldDef.challenges.length}`;
    document.getElementById('hud-chests').textContent = `${state.chestsCollected} / ${worldDef.totalChests}`;
    document.getElementById('hud-score').textContent = state.levelScore.toLocaleString();

    const objText = document.getElementById('hud-objective-text');
    if (state.challengesSolved < worldDef.challenges.length) {
      objText.textContent = `Talk to Guardian ${state.challengesSolved + 1} of ${worldDef.challenges.length} ahead (Press E) to unlock the bridge!`;
    } else {
      objText.textContent = `All ${worldDef.challenges.length} missions complete! Step into the glowing Portal ahead!`;
    }
  }

  let lastToastMsg = '';
  let lastToastAt = 0;
  function showToast(msg) {
    const nowMs = performance.now();
    if (msg === lastToastMsg && nowMs - lastToastAt < 2500) return;
    lastToastMsg = msg;
    lastToastAt = nowMs;
    const t = document.getElementById('game-toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  function startGameLevel(worldId) {
    ensureAudioContext();
    state.currentWorldId = worldId;
    state.isPlaying = true;
    state.isPaused = false;
    state.isListeningModalOpen = false;

    document.getElementById('modal-main-menu').classList.add('hidden');
    document.getElementById('modal-worlds').classList.add('hidden');
    document.getElementById('modal-heroes').classList.add('hidden');
    document.getElementById('modal-results').classList.add('hidden');
    document.getElementById('modal-pause').classList.add('hidden');

    document.getElementById('hud-bar').classList.remove('hidden');
    document.getElementById('hero-screen-tag').classList.remove('hidden');
    document.getElementById('hud-objective-wrap').classList.remove('hidden');
    if (state.touchControlsEnabled) {
      document.getElementById('touch-controls').classList.remove('hidden');
    }

    buildWorld(worldId);
    applySavedMissions();
    player.invulnerableTimer = 4.0;
    startBackgroundMusic(worldId);
    if (ART_OK) {
      const sp = document.getElementById('level-splash');
      const wd = WORLDS.find(w => w.id === worldId);
      document.getElementById('level-splash-img').src = ART_BASE + 'card_w' + worldId + '.webp';
      document.getElementById('level-splash-title').textContent = '';
      document.getElementById('level-splash-sub').textContent = wd.objectiveDesc;
      sp.classList.remove('hidden');
      requestAnimationFrame(() => { sp.style.opacity = '1'; });
      clearTimeout(sp._t1); clearTimeout(sp._t2);
      sp._t1 = setTimeout(() => { sp.style.opacity = '0'; }, 2600);
      sp._t2 = setTimeout(() => { sp.classList.add('hidden'); }, 3300);
      sp.onclick = () => { sp.style.opacity = '0'; setTimeout(() => sp.classList.add('hidden'), 400); };
    }
    saveProgress();
  }

  function togglePauseModal() {
    state.isPaused = !state.isPaused;
    document.getElementById('modal-pause').classList.toggle('hidden', !state.isPaused);
  }

  // -------------------------------------------------------------------
  // 12. BUTTON EVENT LISTENERS
  // -------------------------------------------------------------------
  document.getElementById('btn-menu-play').addEventListener('click', () => startGameLevel(1));
  document.getElementById('btn-menu-continue').addEventListener('click', () => startGameLevel(state.currentWorldId || 1));

  document.getElementById('btn-menu-heroes').addEventListener('click', () => {
    renderHeroCards();
    document.getElementById('modal-heroes').classList.remove('hidden');
  });
  document.getElementById('btn-menu-swap-hero').addEventListener('click', () => {
    renderHeroCards();
    document.getElementById('modal-heroes').classList.remove('hidden');
  });
  document.getElementById('btn-hud-hero').addEventListener('click', () => {
    renderHeroCards();
    document.getElementById('modal-heroes').classList.remove('hidden');
  });
  document.getElementById('btn-close-heroes').addEventListener('click', () => {
    document.getElementById('modal-heroes').classList.add('hidden');
  });
  document.getElementById('btn-confirm-hero').addEventListener('click', () => {
    document.getElementById('modal-heroes').classList.add('hidden');
  });

  document.getElementById('btn-menu-worlds').addEventListener('click', () => {
    renderWorldCards();
    document.getElementById('modal-worlds').classList.remove('hidden');
  });
  document.getElementById('btn-hud-map').addEventListener('click', () => {
    renderWorldCards();
    document.getElementById('modal-worlds').classList.remove('hidden');
  });
  document.getElementById('btn-close-worlds').addEventListener('click', () => {
    document.getElementById('modal-worlds').classList.add('hidden');
  });

  document.getElementById('btn-menu-howto').addEventListener('click', () => {
    document.getElementById('modal-howto').classList.remove('hidden');
  });
  document.getElementById('btn-close-howto').addEventListener('click', () => {
    document.getElementById('modal-howto').classList.add('hidden');
  });

  document.getElementById('btn-menu-settings').addEventListener('click', () => {
    document.getElementById('modal-pause').classList.remove('hidden');
  });
  document.getElementById('btn-hud-pause').addEventListener('click', togglePauseModal);
  document.getElementById('btn-close-pause').addEventListener('click', () => {
    state.isPaused = false;
    document.getElementById('modal-pause').classList.add('hidden');
  });
  document.getElementById('btn-pause-resume').addEventListener('click', () => {
    state.isPaused = false;
    document.getElementById('modal-pause').classList.add('hidden');
  });
  document.getElementById('btn-pause-checkpoint').addEventListener('click', () => {
    state.hearts = 3;
    state.isPaused = false;
    document.getElementById('modal-pause').classList.add('hidden');
    respawnAtCheckpoint(true);
    updateHUD();
  });
  document.getElementById('btn-pause-restart').addEventListener('click', () => {
    document.getElementById('modal-pause').classList.add('hidden');
    startGameLevel(state.currentWorldId);
  });
  document.getElementById('btn-pause-mainmenu').addEventListener('click', () => {
    stopSpeechAudio();
    stopBackgroundMusic();
    state.isPlaying = false;
    state.isPaused = false;
    document.getElementById('modal-pause').classList.add('hidden');
    document.getElementById('hud-bar').classList.add('hidden');
    document.getElementById('self-mirror-card').classList.add('hidden');
    document.getElementById('hero-screen-tag').classList.add('hidden');
    document.getElementById('hud-objective-wrap').classList.add('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
    document.getElementById('interaction-prompt').classList.add('hidden');
    updateMainMenuSummary();
    document.getElementById('modal-main-menu').classList.remove('hidden');
  });

  document.getElementById('slider-master-vol').addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10) || 100;
    state.masterVolume = val / 100;
    document.getElementById('volume-pct-label').textContent = val + '%';
    ensureAudioContext();
    applyAudioSettings();
  });

  document.getElementById('btn-hud-mute').addEventListener('click', () => {
    state.musicEnabled = !state.musicEnabled;
    state.sfxEnabled = state.musicEnabled;
    document.getElementById('toggle-music').checked = state.musicEnabled;
    document.getElementById('toggle-sfx').checked = state.sfxEnabled;
    document.getElementById('btn-hud-mute').textContent = state.musicEnabled ? '🔊' : '🔇';
    if (state.musicEnabled && state.isPlaying) {
      startBackgroundMusic(state.currentWorldId);
    } else {
      stopBackgroundMusic();
    }
  });

  document.getElementById('toggle-music').addEventListener('change', (e) => {
    state.musicEnabled = e.target.checked;
    if (state.musicEnabled && state.isPlaying) startBackgroundMusic(state.currentWorldId);
    else stopBackgroundMusic();
  });
  document.getElementById('toggle-sfx').addEventListener('change', (e) => {
    state.sfxEnabled = e.target.checked;
  });
  document.getElementById('toggle-touch').addEventListener('change', (e) => {
    state.touchControlsEnabled = e.target.checked;
    if (state.isPlaying) {
      document.getElementById('touch-controls').classList.toggle('hidden', !state.touchControlsEnabled);
    }
  });

  document.getElementById('btn-results-next').addEventListener('click', () => {
    const nextId = state.currentWorldId < 3 ? state.currentWorldId + 1 : 1;
    startGameLevel(nextId);
  });
  document.getElementById('btn-results-retry').addEventListener('click', () => {
    startGameLevel(state.currentWorldId);
  });
  document.getElementById('btn-results-menu').addEventListener('click', () => {
    document.getElementById('modal-results').classList.add('hidden');
    document.getElementById('hud-bar').classList.add('hidden');
    document.getElementById('self-mirror-card').classList.add('hidden');
    document.getElementById('hero-screen-tag').classList.add('hidden');
    document.getElementById('hud-objective-wrap').classList.add('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
    updateMainMenuSummary();
    document.getElementById('modal-main-menu').classList.remove('hidden');
  });

  // -------------------------------------------------------------------
  // 13. MAIN 3D PHYSICS, COLLISION, CAMERA & ANIMATION LOOP
  // -------------------------------------------------------------------
  let lastTime = performance.now();
  const projVec = new THREE.Vector3();

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const elapsed = now * 0.001;

    // Drift clouds & spin waterwheels
    for (const cl of clouds) {
      cl.mesh.position.x = cl.baseX + Math.sin(elapsed * 0.15 + cl.phase) * 5.0;
    }
    for (const ww of waterWheels) {
      ww.rotation.x += dt * 1.4;
    }

    // Update moving platforms
    for (const mp of movingPlatforms) {
      if (!mp.moveSpec) continue;
      const s = mp.moveSpec;
      const offset = Math.sin(elapsed * s.speed + s.phase) * s.amp;
      const prevX = mp.x;
      const prevY = mp.y;
      if (s.axis === 'x') {
        mp.x = mp.baseX + offset;
      } else {
        mp.y = mp.baseY + offset;
      }
      mp.dx = mp.x - prevX;
      mp.dy = mp.y - prevY;
      mp.topY = mp.y + mp.h * 0.5;
      mp.mesh.position.set(mp.x, mp.y, mp.z);
    }

    // Rotate coins, listening crystals, guardians, portal & ambient particles
    for (const coin of crystalCoins) {
      if (!coin.collected) {
        coin.mesh.rotation.y += dt * 2.6;
        coin.mesh.position.y = coin.y + Math.sin(elapsed * 3 + coin.z) * 0.12;
      }
    }
    for (const lc of listeningCrystals) {
      lc.gem.rotation.y += dt * 1.8;
      lc.gem.position.y = 1.55 + Math.sin(elapsed * 2.5 + lc.index) * 0.14;
      lc.ring.rotation.z += dt * 1.2;
      if (lc.guardianMesh) {
        lc.guardianMesh.position.y = Math.sin(elapsed * 2.2 + lc.index) * 0.08;
      }
    }
    if (portalObject) {
      portalObject.vortex.rotation.z += dt * 2.2;
    }
    for (const ap of ambientParticles) {
      ap.mesh.position.y = ap.baseY + Math.sin(elapsed * 1.8 + ap.phase) * 0.45;
      ap.mesh.visible = ap.mesh.position.distanceToSquared(camera.position) > 9;
    }

    // Update trail particles
    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const tp = trailParticles[i];
      tp.life -= dt;
      tp.mesh.position.addScaledVector(tp.vel, dt);
      tp.mesh.scale.setScalar(Math.max(0.01, tp.life * 1.8));
      if (tp.life <= 0) {
        worldGroup.remove(tp.mesh);
        trailParticles.splice(i, 1);
      }
    }

    // Gameplay movement & collisions when active
    if (state.isPlaying && !state.isPaused && !state.isListeningModalOpen) {
      const moveSpeed = 7.0;
      let mx = 0;
      let mz = 0;
      if (keys.left) mx -= 1;
      if (keys.right) mx += 1;
      if (keys.up) mz -= 1;
      if (keys.down) mz += 1;

      if (mx !== 0 || mz !== 0) {
        const len = Math.hypot(mx, mz);
        mx /= len;
        mz /= len;
        player.vel.x = mx * moveSpeed;
        player.vel.z = mz * moveSpeed;
        player.facingAngle = Math.atan2(mx, mz);
        if (player.onGround && player.animTimer <= 0) {
          setHeroAnimState('run', 0);
        }
      } else {
        player.vel.x *= 0.78;
        player.vel.z *= 0.78;
        if (player.onGround && player.animTimer <= 0) {
          setHeroAnimState('idle', 0);
        }
      }

      if (player.onGround && player.standingPlatform && player.standingPlatform.isMoving) {
        player.pos.x += player.standingPlatform.dx;
        player.pos.y += player.standingPlatform.dy;
      }

      // Gravity
      player.vel.y -= 24.0 * dt;
      player.pos.x += player.vel.x * dt;
      player.pos.z += player.vel.z * dt;
      const prevY = player.pos.y;
      player.pos.y += player.vel.y * dt;

      // Platform landing collision
      player.onGround = false;
      player.standingPlatform = null;
      for (const p of platforms) {
        if (!p.active) continue;
        const halfW = p.w * 0.5 + 0.32;
        const halfD = p.d * 0.5 + 0.32;
        if (
          Math.abs(player.pos.x - p.x) <= halfW &&
          Math.abs(player.pos.z - p.z) <= halfD
        ) {
          if (prevY >= p.topY - 0.38 && player.pos.y <= p.topY + 0.14 && player.vel.y <= 0) {
            player.pos.y = p.topY;
            player.vel.y = 0;
            player.onGround = true;
            player.standingPlatform = p;
            break;
          }
        }
      }

      // Bouncy Giant Mushroom Pads!
      for (const bm of bouncyMushrooms) {
        if (
          Math.hypot(player.pos.x - bm.x, player.pos.z - bm.z) < 1.15 &&
          Math.abs(player.pos.y - (bm.y + 0.7)) < 0.75 &&
          player.vel.y <= 0
        ) {
          player.vel.y = 14.5;
          player.onGround = false;
          setHeroAnimState('jump', 0.8);
          playSfx('bounce');
          spawnHeroBurst(14, 0xf43f5e);
          showToast('🍄 Super Mushroom Bounce!');
        }
      }

      if (!player.onGround && player.vel.y < -2.0 && player.animTimer <= 0) {
        setHeroAnimState('fall', 0);
      }

      if (player.pos.y < -4.5) {
        takePlayerDamage('Splash! Returning safely to your last checkpoint.');
      }

      // Collect Crystal Coins
      for (const coin of crystalCoins) {
        if (!coin.collected && Math.hypot(player.pos.x - coin.x, player.pos.y + 0.7 - coin.y, player.pos.z - coin.z) < 1.25) {
          coin.collected = true;
          coin.mesh.visible = false;
          state.coinsCollected++;
          state.levelScore += 10;
          state.totalScore += 10;
          playSfx('coin');
          setHeroAnimState('collect', 0.45);
          spawnHeroBurst(8, 0xfbbf24);
          updateHUD();
        }
      }

      // Open Hidden Treasure Chests
      for (const ch of treasureChests) {
        if (!ch.opened && Math.hypot(player.pos.x - ch.x, player.pos.z - ch.z) < 1.55) {
          ch.opened = true;
          if (ch.sprite && artTex.item_chest_open) {
            ch.sprite.material.map = artTex.item_chest_open;
            ch.sprite.material.needsUpdate = true;
            setSpriteSize(ch.sprite, artTex.item_chest_open, 1.25);
          } else {
            ch.mesh.scale.set(1.15, 0.65, 1.15);
          }
          state.chestsCollected++;
          state.levelScore += 100;
          state.totalScore += 100;
          playSfx('chest');
          setHeroAnimState('celebrate', 1.2);
          spawnHeroBurst(16, 0xfbbf24);
          showToast('🎁 Hidden Treasure Chest Discovered! +100 Bonus Points!');
          updateHUD();
        }
      }

      // Activate Checkpoints
      for (const cp of checkpoints) {
        if (!cp.activated && Math.hypot(player.pos.x - cp.x, player.pos.z - cp.z) < 1.6) {
          cp.activated = true;
          cp.orb.material.color.setHex(0x4ade80);
          state.currentCheckpoint = { x: cp.x, y: cp.y, z: cp.z };
          playSfx('checkpoint');
          showToast('🚩 Checkpoint Reached!');
        }
      }

      // Enemy Patrol & Collision
      if (player.invulnerableTimer > 0) {
        player.invulnerableTimer -= dt;
      }
      for (const en of enemies) {
        en.mesh.position.x = en.baseX + Math.sin(elapsed * en.speed + en.phase) * en.range;
        en.mesh.position.y = en.y + Math.abs(Math.sin(elapsed * 4 + en.phase)) * 0.18;
        if (
          player.invulnerableTimer <= 0 &&
          Math.hypot(player.pos.x - en.mesh.position.x, player.pos.z - en.z) < 0.92 &&
          Math.abs(player.pos.y - en.y) < 1.0
        ) {
          takePlayerDamage('Bumped into a critter! -1 Heart');
        }
      }

      const nearCrystal = findNearestListeningCrystal();
      const promptEl = document.getElementById('interaction-prompt');
      if (nearCrystal) {
        promptEl.classList.remove('hidden');
        document.getElementById('interaction-prompt-label').textContent = nearCrystal.solved
          ? `Practise again with ${nearCrystal.challenge.guardian}`
          : `Speak with ${nearCrystal.challenge.guardian} (Mission ${nearCrystal.index + 1})`;
      } else {
        promptEl.classList.add('hidden');
      }

      if (portalObject && Math.hypot(player.pos.x - portalObject.x, player.pos.z - portalObject.z) < 1.95) {
        if (portalObject.unlocked) {
          completeCurrentLevel();
        } else {
          showToast('🔒 Finish all three speaking missions to open the Portal!');
        }
      }
    }

    animateScenery(dt, elapsed);
    if (backdropMesh) backdropMesh.position.set(player.pos.x, backdropMesh.position.y, player.pos.z);

    // Update Hero 3D Pose, Spotlight & Screen Callout Tag
    if (heroMesh) {
      heroMesh.position.copy(player.pos);
      heroMesh.rotation.y = player.facingAngle;
      heroSpotLight.position.set(player.pos.x, player.pos.y + 4.5, player.pos.z + 2.0);

      if (player.animTimer > 0) {
        player.animTimer -= dt;
      }

      const st = player.animState;
      heroParts.listenRing.visible = (st === 'listen' || state.isListeningModalOpen);
      if (heroParts.listenRing.visible) {
        const s = 1 + Math.sin(elapsed * 6) * 0.15;
        heroParts.listenRing.scale.set(s, s, 1);
      }
      heroParts.groundRing.rotation.z += dt * 1.5;

      const mirrorImg = document.getElementById('mirror-hero-img');
      if (heroParts.sprite) {
        updateSpriteHero(elapsed, mirrorImg);
      } else if (st === 'run') {
        const swing = Math.sin(elapsed * 14) * 0.7;
        heroParts.leftLeg.rotation.x = swing;
        heroParts.rightLeg.rotation.x = -swing;
        heroParts.leftArm.rotation.x = -swing * 0.85;
        heroParts.rightArm.rotation.x = swing * 0.85;
        heroParts.cape.rotation.x = 0.45 + Math.abs(swing) * 0.25;
        heroParts.headGroup.position.y = 1.62 + Math.abs(Math.sin(elapsed * 14)) * 0.06;
        if (mirrorImg) mirrorImg.style.transform = `translateY(${Math.sin(elapsed * 14) * 3}px)`;
      } else if (st === 'jump' || st === 'fall') {
        heroParts.leftArm.rotation.x = -2.3;
        heroParts.rightArm.rotation.x = -2.3;
        heroParts.leftLeg.rotation.x = 0.45;
        heroParts.rightLeg.rotation.x = -0.45;
        heroParts.cape.rotation.x = 0.7;
        if (mirrorImg) mirrorImg.style.transform = 'scale(1.08) translateY(-4px)';
      } else if (st === 'listen' || state.isListeningModalOpen) {
        heroParts.rightArm.rotation.x = -1.9;
        heroParts.headGroup.rotation.z = Math.sin(elapsed * 3.5) * 0.14;
        if (mirrorImg) mirrorImg.style.transform = `rotate(${Math.sin(elapsed * 3.5) * 4}deg)`;
      } else if (st === 'celebrate' || st === 'collect') {
        heroParts.leftArm.rotation.x = -2.6;
        heroParts.rightArm.rotation.x = -2.6;
        heroMesh.rotation.y = elapsed * 5.5;
        if (mirrorImg) mirrorImg.style.transform = 'scale(1.12)';
      } else {
        heroParts.leftLeg.rotation.x = 0;
        heroParts.rightLeg.rotation.x = 0;
        heroParts.leftArm.rotation.x = Math.sin(elapsed * 2.5) * 0.08;
        heroParts.rightArm.rotation.x = -Math.sin(elapsed * 2.5) * 0.08;
        heroParts.cape.rotation.x = 0.18;
        heroParts.headGroup.position.y = 1.62 + Math.sin(elapsed * 2.5) * 0.03;
        heroParts.headGroup.rotation.z = 0;
        if (mirrorImg) mirrorImg.style.transform = 'none';
      }

      // Update Floating Overhead "YOU" Screen Tag
      const tagEl = document.getElementById('hero-screen-tag');
      if (state.isPlaying && tagEl) {
        projVec.set(player.pos.x, player.pos.y + 3.1, player.pos.z);
        projVec.project(camera);
        if (projVec.z < 1) {
          const sx = (projVec.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-projVec.y * 0.5 + 0.5) * window.innerHeight;
          tagEl.style.left = `${sx}px`;
          tagEl.style.top = `${sy}px`;
          tagEl.classList.remove('hidden');
        } else {
          tagEl.classList.add('hidden');
        }
      }
    }

    // Dynamic Camera System:
    // - On Main Menu: Slowly orbits close around the Hero so you see your Hero's face & sunlit world!
    // - During Listening Modal: Zooms into a cinematic face-to-face shot of Hero + Guardian in top half of screen!
    // - During Gameplay: Follows selected Camera Mode (Close / Selfie Front / Action / Top) + Mouse Orbit!
    if (!state.isPlaying) {
      const menuAngle = elapsed * 0.45;
      camera.position.set(
        player.pos.x + Math.sin(menuAngle) * 4.8,
        player.pos.y + 2.4,
        player.pos.z + Math.cos(menuAngle) * 4.8
      );
      camera.lookAt(player.pos.x, player.pos.y + 1.5, player.pos.z);
    } else if (state.isListeningModalOpen && state.activeCrystalObj) {
      const lc = state.activeCrystalObj;
      const targetX = lc.x;
      const targetY = lc.y + 2.2;
      const targetZ = lc.z + 4.4;
      camera.position.x += (targetX - camera.position.x) * 0.1;
      camera.position.y += (targetY - camera.position.y) * 0.1;
      camera.position.z += (targetZ - camera.position.z) * 0.1;
      // Look slightly lower so Hero & Guardian appear in the upper clear half of the viewport above the docked panel!
      camera.lookAt(lc.x, lc.y + 0.2, lc.z);
    } else {
      const mode = CAM_MODES[state.camModeIndex] || CAM_MODES[0];
      const baseYaw = mode.front ? Math.PI : 0;
      const totalYaw = baseYaw + state.camOrbitYaw;
      const targetCamX = player.pos.x + Math.sin(totalYaw) * mode.dist;
      const targetCamY = player.pos.y + mode.height;
      const targetCamZ = player.pos.z + Math.cos(totalYaw) * mode.dist;

      camera.position.x += (targetCamX - camera.position.x) * 0.1;
      camera.position.y += (targetCamY - camera.position.y) * 0.1;
      camera.position.z += (targetCamZ - camera.position.z) * 0.1;
      camera.lookAt(player.pos.x, player.pos.y + 1.45, player.pos.z - (mode.front ? -0.5 : 1.2));
    }

    renderer.render(scene, camera);
  }

  function takePlayerDamage(reasonMsg) {
    playSfx('damage');
    setHeroAnimState('damage', 0.8);
    player.invulnerableTimer = 1.6;
    state.hearts--;
    if (state.hearts <= 0) {
      state.hearts = 3;
      showToast('💖 Hearts restored at Checkpoint! Keep trying!');
    } else {
      showToast(reasonMsg);
    }
    respawnAtCheckpoint(false);
    updateHUD();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Student details & practice mode
  function loadProfile() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
      state.studentName = p.name || '';
      state.studentClass = p.group || '';
    } catch (e) {}
    document.getElementById('input-student-name').value = state.studentName;
    document.getElementById('input-student-class').value = state.studentClass;
  }
  function saveProfile() {
    state.studentName = document.getElementById('input-student-name').value.trim();
    state.studentClass = document.getElementById('input-student-class').value.trim();
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: state.studentName, group: state.studentClass })); } catch (e) {}
  }
  document.getElementById('input-student-name').addEventListener('input', saveProfile);
  document.getElementById('input-student-class').addEventListener('input', saveProfile);
  // Typing in the name boxes must not move the hero or trigger shortcuts
  ['input-student-name', 'input-student-class'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('keydown', e => e.stopPropagation());
    el.addEventListener('keyup', e => e.stopPropagation());
  });
  const tSave = document.getElementById('toggle-save-transcripts');
  tSave.addEventListener('change', e => {
    state.saveTranscripts = e.target.checked;
    saveProgress();
    showToast(state.saveTranscripts ? '📝 Transcripts will be saved on this device.' : '🔒 Transcripts will not be saved.');
  });
  const delBtn = document.getElementById('btn-delete-progress');
  delBtn.addEventListener('click', () => {
    if (!delBtn.dataset.armed) {
      delBtn.dataset.armed = '1';
      delBtn.textContent = '⚠️ Tap again to delete everything';
      setTimeout(() => { delete delBtn.dataset.armed; delBtn.textContent = '🗑️ Delete my progress & transcripts'; }, 4000);
      return;
    }
    try {
      [STORAGE_KEY, RESULTS_KEY].forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    window.CQSpeak.resetConsent();
    location.reload();
  });

  window.addEventListener('load', () => {
    loadSaveData();
    loadProfile();
    tSave.checked = state.saveTranscripts;
    window.CQSpeak.init({ onPhase: speakingPhase, toast: showToast, sfx: playSfx, volume: () => state.masterVolume });
    document.getElementById('toggle-touch').checked = state.touchControlsEnabled;
    Promise.all([loadArt(), loadModels()]).then(([ok]) => {
      buildWorld(state.currentWorldId || 1);
      updateMainMenuSummary();
      requestAnimationFrame(animate);
      if (!ok && !/^https?:$/.test(location.protocol)) {
        setTimeout(() => showToast('🎨 Open the game from your GitHub Pages link to see the full artwork (the microphone also needs https).'), 1200);
      }
    });
  });
})();
