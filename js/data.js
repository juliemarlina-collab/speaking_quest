/* ==========================================================================
   Crystal Quest 2: Speak & Conquer - GAME DATA (edit this file to change content)
   --------------------------------------------------------------------------
   HEROES : the 4 playable heroes (equal abilities).
   WORLDS : the 3 levels. Each level has 3 speaking missions in `challenges`.
            See the mission field guide just above WORLDS.
   ========================================================================== */
window.CQ_DATA = (function () {
  'use strict';
  const HEROES = [
    {
      id: 'aiden',
      name: 'Aiden',
      title: 'The Young Adventurer',
      portrait: 'art/portrait_aiden.jpg',
      traits: 'Brave, enthusiastic & adventurous',
      effectLabel: 'Golden Sparkles ✨',
      colors: {
        hair: 0x5c3317,
        tunic: 0x2563eb,
        accent: 0xef4444,
        skin: 0xffe0bd,
        boots: 0x78350f,
        particle: 0xfbbf24,
        eyeColor: '#1e3a8a'
      }
    },
    {
      id: 'luna',
      name: 'Luna',
      title: 'The Forest Mage',
      portrait: 'art/portrait_luna.jpg',
      traits: 'Curious, intelligent & cheerful',
      effectLabel: 'Purple Magic Particles 🔮',
      colors: {
        hair: 0xf472b6,
        tunic: 0x7e22ce,
        accent: 0xfacc15,
        skin: 0xffe4c8,
        boots: 0x581c87,
        particle: 0xc084fc,
        eyeColor: '#6b21a8'
      }
    },
    {
      id: 'rex',
      name: 'Rex',
      title: 'The Scout Ranger',
      portrait: 'art/portrait_rex.jpg',
      traits: 'Energetic, resourceful & observant',
      effectLabel: 'Green Leaf Particles 🍃',
      colors: {
        hair: 0xfbbf24,
        tunic: 0x16a34a,
        accent: 0x854d0e,
        skin: 0xffe0bd,
        boots: 0x422006,
        particle: 0x4ade80,
        eyeColor: '#14532d'
      }
    },
    {
      id: 'mia',
      name: 'Mia',
      title: 'The Crystal Explorer',
      portrait: 'art/portrait_mia.jpg',
      traits: 'Confident, friendly & determined',
      effectLabel: 'Blue & Gold Crystal Particles 💎',
      colors: {
        hair: 0x451a03,
        tunic: 0xeab308,
        accent: 0x9333ea,
        skin: 0xffe0bd,
        boots: 0x5b21b6,
        particle: 0x38bdf8,
        eyeColor: '#7c2d12'
      }
    }
  ];

  /* ------------------------------------------------------------------------
     Each mission (one Guardian + one Voice Crystal):
       id, title, guardian       : shown in the speaking panel
       prompt                    : the task the Guardian speaks (text-to-speech + text)
       targetSec: [min, max]     : suggested speaking time (a guide, never a penalty)
       thinkSec                  : optional planning time (Level 3, like MUET Part 1)
       model                     : model answer (Support mode 1)
       starters                  : sentence starters (Support mode 2)
       keywords                  : useful words (Support mode 3)
       structureLabel / structure: the target structure + words the game looks for
                                   (only suggests a tick; the student decides)
       detailWords               : words that suggest a reason or detail
       prep                      : true = show the 4 PREP cards
       npcClaim / npcReply       : scripted Guardian lines for the debate mission
       bonus                     : optional extra speaking task for bonus points
       unlock                    : message when the mission is completed
     ------------------------------------------------------------------------ */
  const WORLDS = [
    {
      id: 1,
      level: 4,
      name: 'Innovation Isle',
      subtitle: 'Level 4 • Find Your Voice • 10–20 second answers',
      thumb: 'art/thumb_w1.jpg',
      objectiveDesc: 'Introduce yourself, talk about a hobby and describe a favourite place.',
      skyColor: 0x38bdf8,
      fogColor: 0x7dd3fc,
      waterColor: 0x0284c7,
      groundColor: 0x6cbd4a,
      platformColor: 0x86c95f,
      crystalColor: 0x4ade80,
      portalColor: 0x10b981,
      totalCoins: 20,
      totalChests: 1,
      chestIndices: [1],
      challenges: [
        {
          id: 'L1-M1',
          title: 'Hello, Adventurer!',
          guardian: 'Lantern Keeper Lila',
          speaker: 'Lantern Keeper Lila',
          skill: 'Introducing yourself',
          prompt: 'Welcome to Innovation Isle! Tell me your name and one thing you like.',
          targetSec: [10, 20],
          model: 'Hello! My name is Aina. I am a student at the polytechnic. I like playing badminton with my friends in the evening.',
          starters: ['Hello! My name is ___.', 'I am a student at ___.', 'I like ___.'],
          keywords: ['name', 'student', 'like', 'hobby', 'friends', 'favourite'],
          structureLabel: 'I said my name AND one thing I like',
          structure: ['my name is', "i'm", 'i am', 'call me'],
          structure2: ['i like', 'i love', 'i enjoy', 'my favourite'],
          detailWords: ['because', 'with my', 'every', 'in the', 'and i', 'also'],
          detailLabel: 'I added one more detail (who, when or why)',
          unlock: '🏮 The welcome lantern is glowing! The path ahead is open.'
        },
        {
          id: 'L1-M2',
          title: 'My Favourite Thing',
          guardian: 'Gardener Bram',
          speaker: 'Gardener Bram',
          skill: 'Talking about a hobby',
          prompt: 'What hobby do you enjoy? Why do you enjoy it?',
          targetSec: [10, 20],
          model: 'I enjoy cooking. I usually cook fried rice for my family on weekends. It makes me feel happy and relaxed.',
          starters: ['I enjoy ___.', 'I usually ___ on / at ___.', 'It makes me feel ___.'],
          keywords: ['enjoy', 'usually', 'weekend', 'relaxed', 'happy', 'because'],
          structureLabel: 'I named my hobby AND said how it makes me feel',
          structure: ['i enjoy', 'my hobby', 'i like', 'i love'],
          structure2: ['makes me feel', 'feel', 'because', 'happy', 'relaxed', 'calm', 'excited'],
          detailWords: ['because', 'usually', 'every', 'on weekends', 'with my', 'when i'],
          detailLabel: 'I gave a reason or an example',
          unlock: '🌸 The flower bridge is blooming! Cross to the next island.'
        },
        {
          id: 'L1-M3',
          title: 'A Special Place',
          guardian: 'Elder Willow',
          speaker: 'Elder Willow',
          skill: 'Describing a place',
          prompt: 'Describe a place you enjoy visiting. Why do you go there?',
          targetSec: [10, 20],
          model: 'I like going to Port Dickson beach. I go there because the sea is calm and the sunset is beautiful. I usually go with my family.',
          starters: ['I like going to ___.', 'I go there because ___.', 'It is ___ and ___.'],
          keywords: ['beach', 'park', 'calm', 'beautiful', 'because', 'usually'],
          structureLabel: 'I named the place AND gave a reason',
          structure: ['i like going to', 'i like to go', 'i enjoy visiting', 'my favourite place', 'i like visiting'],
          structure2: ['because', 'so', 'the reason'],
          detailWords: ['beautiful', 'calm', 'quiet', 'big', 'with my', 'usually', 'there is', 'there are'],
          detailLabel: 'I described the place (what it is like)',
          bonus: {
            prompt: 'Bonus: Describe this mystery object without saying its name. It is something you use every day.',
            starters: ['It is small and ___.', 'You use it to ___.', 'You can find it in ___.'],
            targetSec: [10, 20],
            points: 100,
            label: '+10 bonus coins'
          },
          unlock: '💎 The first Voice Crystal shard is restored!'
        }
      ]
    },
    {
      id: 2,
      level: 5,
      name: 'Global Community Hub',
      subtitle: 'Level 5 • Build Your Argument (PREP) • 20–40 second answers',
      thumb: 'art/thumb_w2.jpg',
      objectiveDesc: 'Give your opinion with reasons and examples using PREP: Point, Reason, Example, Point.',
      skyColor: 0x0ea5e9,
      fogColor: 0x38bdf8,
      waterColor: 0x0369a1,
      groundColor: 0x4f9a5a,
      platformColor: 0x6d9fc4,
      crystalColor: 0x67e8f9,
      portalColor: 0x06b6d4,
      totalCoins: 30,
      totalChests: 2,
      chestIndices: [0, 2],
      challenges: [
        {
          id: 'L2-M1',
          title: 'Make Your Point',
          guardian: 'Point Keeper Pax',
          speaker: 'Point Keeper Pax',
          skill: 'Giving an opinion (Point)',
          prompt: 'Are games helpful for learning English? Give your opinion and one reason.',
          targetSec: [20, 40],
          prep: true,
          prepFocus: ['P', 'R'],
          model: 'I think games are helpful for learning English because they make practice fun. When I play online games, I read instructions and chat in English, so I learn new words without feeling bored.',
          starters: ['I think ___ because ___.', 'In my opinion, ___.', 'This is because ___.'],
          keywords: ['I think', 'helpful', 'because', 'practise', 'new words', 'fun'],
          structureLabel: 'I gave my opinion (Point) with "because"',
          structure: ['i think', 'i believe', 'in my opinion', 'i feel', 'i agree', 'i disagree'],
          structure2: ['because', 'this is because', 'the reason'],
          detailWords: ['for example', 'for instance', 'such as', 'when i', 'like'],
          detailLabel: 'I explained my reason with more detail',
          unlock: '🔥 The Point bridge is lit!'
        },
        {
          id: 'L2-M2',
          title: 'Tell Me Why',
          guardian: 'Reason Ranger Rowan',
          speaker: 'Reason Ranger Rowan',
          skill: 'Explaining reasons (Reason)',
          prompt: 'Why is teamwork important? Give two reasons.',
          targetSec: [20, 40],
          prep: true,
          prepFocus: ['P', 'R'],
          model: 'Teamwork is important because we can share ideas and finish work faster. Another reason is that we learn from each other. For example, in my group project, my friend helped me design the poster while I wrote the report.',
          starters: ['Teamwork is important because ___.', 'Another reason is ___.', 'For example, ___.'],
          keywords: ['share ideas', 'faster', 'help each other', 'another reason', 'project', 'responsibility'],
          structureLabel: 'I gave TWO reasons (e.g. "Another reason is…")',
          structure: ['because', 'one reason', 'first'],
          structure2: ['another reason', 'also', 'second', 'besides', 'moreover', 'in addition'],
          detailWords: ['for example', 'for instance', 'such as', 'in my'],
          detailLabel: 'I gave an example from my life',
          unlock: '🔥 The Reason bridge is lit!'
        },
        {
          id: 'L2-M3',
          title: 'The PREP Bridge',
          guardian: 'Bridge Master Brindle',
          speaker: 'Bridge Master Brindle',
          skill: 'Full PREP answer',
          prompt: 'Should students read every day? Answer using Point, Reason, Example and Point again.',
          targetSec: [25, 40],
          prep: true,
          prepFocus: ['P', 'R', 'E', 'P2'],
          model: 'I believe students should read every day. This is because reading improves our vocabulary and our writing. For example, after I read short news articles every night, I could write better essays for my English class. Therefore, students should make reading a daily habit.',
          starters: ['Point: I believe ___.', 'Reason: This is because ___.', 'Example: For example, ___.', 'Point again: Therefore, ___.'],
          keywords: ['I believe', 'vocabulary', 'for example', 'habit', 'therefore', 'improve'],
          structureLabel: 'I used all 4 PREP parts',
          structure: ['__PREP_ALL__'],
          detailWords: ['for example', 'for instance', 'such as'],
          detailLabel: 'I gave a real example',
          bonus: {
            prompt: 'Bonus: Give a SECOND example to support your point.',
            starters: ['Another example is ___.', 'Also, ___.'],
            targetSec: [10, 20],
            points: 150,
            label: '+1 extra crystal'
          },
          unlock: '💎 The second Voice Crystal shard is restored!'
        }
      ]
    },
    {
      id: 3,
      level: 6,
      name: 'Future Voices Summit',
      subtitle: 'Level 6 • Speak to Conquer • 30–45 second answers',
      thumb: 'art/thumb_w3.jpg',
      objectiveDesc: 'Plan, then speak for longer. Watch out for the crystal dragon: your voice will calm it!',
      skyColor: 0x4f46e5,
      fogColor: 0x818cf8,
      waterColor: 0x3730a3,
      groundColor: 0xa48fdc,
      platformColor: 0x9c86e0,
      crystalColor: 0xe879f9,
      portalColor: 0xc084fc,
      totalCoins: 30,
      totalChests: 2,
      chestIndices: [0, 1],
      challenges: [
        {
          id: 'L3-M1',
          title: 'Share Your Opinion',
          guardian: 'Arena Herald Hana',
          speaker: 'Arena Herald Hana',
          skill: 'Opinion + reason + example',
          prompt: 'What is one good way to stay healthy? Explain why and give an example.',
          targetSec: [30, 45],
          thinkSec: 30,
          prep: true,
          prepFocus: ['P', 'R', 'E'],
          model: 'I think one good way to stay healthy is to exercise regularly. One reason is that exercise makes our heart and body stronger. For example, I jog around the polytechnic field three times a week, and now I feel more energetic in class. So, I believe everyone should find a sport they enjoy.',
          starters: ['I think one good way is ___.', 'One reason is ___.', 'For example, ___.', 'So, I believe ___.'],
          keywords: ['exercise', 'balanced diet', 'enough sleep', 'regularly', 'energetic', 'for example'],
          structureLabel: 'I gave an opinion, a reason AND an example',
          structure: ['__PREP_PRE__'],
          detailWords: ['for example', 'for instance', 'such as', 'every', 'times a week'],
          detailLabel: 'My example was specific (who, when, how often)',
          unlock: '🏟️ The summit gate opens!'
        },
        {
          id: 'L3-M2',
          title: 'The Friendly Debate',
          guardian: 'Debate Champion Dax',
          speaker: 'Debate Champion Dax',
          skill: 'Agreeing / disagreeing politely',
          prompt: 'Dax says: "Online learning is always better than learning in class." Do you agree or disagree? Explain why.',
          npcClaim: 'Online learning is always better than learning in class. Do you agree or disagree?',
          npcReply: 'Interesting point! But some students say online classes are lonely and it is hard to ask the lecturer questions. What would you say to them?',
          targetSec: [30, 45],
          thinkSec: 30,
          prep: true,
          prepFocus: ['P', 'R', 'E'],
          model: 'I partly disagree with Dax. Online learning is useful because we can watch recorded lessons again. However, it is not always better. For example, in lab classes we need to practise with real equipment and ask the lecturer for help. So, I think a mix of online and face-to-face learning is the best.',
          starters: ['I agree / disagree because ___.', 'However, ___.', 'For example, ___.', 'So, I think ___.'],
          keywords: ['agree', 'disagree', 'however', 'flexible', 'face-to-face', 'a mix of'],
          structureLabel: 'I said if I agree or disagree AND gave a reason',
          structure: ['i agree', 'i disagree', 'partly agree', 'partly disagree', "i don't agree", 'i do not agree', 'i am not sure'],
          structure2: ['because', 'this is because', 'the reason'],
          detailWords: ['however', 'for example', 'on the other hand', 'but'],
          detailLabel: 'I showed the other side ("However…" / "But…")',
          bonus: {
            prompt: 'Bonus: Answer Dax. Some students say online classes are lonely. What would you say to them?',
            starters: ['I understand that ___, but ___.', 'They could try ___.'],
            targetSec: [15, 30],
            points: 150,
            label: '+150 points'
          },
          unlock: '💬 The discussion crystal is active!'
        },
        {
          id: 'L3-M3',
          title: 'Voice Champion',
          guardian: 'The Crystal Guardian',
          speaker: 'The Crystal Guardian',
          skill: 'Extended answer (45 seconds)',
          prompt: 'How can students reduce examination stress? Speak for about 45 seconds. Your voice will calm the dragon!',
          targetSec: [35, 50],
          thinkSec: 45,
          prep: true,
          prepFocus: ['P', 'R', 'E', 'P2'],
          model: 'In my opinion, students can reduce examination stress by planning their revision early. This is because last-minute studying makes us panic and lose sleep. For example, before my final exam, I made a two-week timetable and studied one subject a day, so I felt calm on the exam day. Students should also sleep enough and take short breaks. Therefore, good planning and healthy habits are the best ways to reduce stress.',
          starters: ['In my opinion, students can ___.', 'This is because ___.', 'For example, ___.', 'Students should also ___.', 'Therefore, ___.'],
          keywords: ['plan', 'revision timetable', 'enough sleep', 'short breaks', 'study group', 'therefore'],
          structureLabel: 'I used PREP (Point, Reason, Example, Point again)',
          structure: ['__PREP_ALL__'],
          detailWords: ['also', 'another', 'besides', 'in addition', 'moreover'],
          detailLabel: 'I gave more than one idea',
          bonus: {
            prompt: 'Surprise question! Which tip would help YOU the most, and why?',
            starters: ['The tip that helps me most is ___ because ___.'],
            targetSec: [15, 30],
            points: 200,
            label: '🏅 Voice Champion badge'
          },
          unlock: '👑 The final Voice Crystal shard is restored! The kingdom can speak again!'
        }
      ]
    }
  ];

  return { HEROES, WORLDS };
})();
