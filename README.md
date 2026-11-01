# Crystal Quest 2: Speak & Conquer — The Lost Kingdom of Voices

A 3D speaking-practice game for beginner English learners and emerging MUET speakers
(Levels 4–6 of the Crystal Quest series; Levels 1–3 are *Listen & Leap*).
The Voice Crystal has shattered into three shards. Students explore three lands, talk
to Guardians and complete **9 speaking missions** to restore the shards.

| Level | Land | Missions | Target answer length |
|---|---|---|---|
| 4 | Innovation Isle (waterfalls, workshop yard) | Hello, Adventurer! · My Favourite Thing · A Special Place | 10–20 s |
| 5 | Global Community Hub (tents, campfires, P-R-E-P posts) | Make Your Point · Tell Me Why · The PREP Bridge | 20–40 s |
| 6 | Future Voices Summit (columns, crystal dragon) | Share Your Opinion · The Friendly Debate · Voice Champion | 30–50 s, with planning time |

Optional bonus tasks: mystery object (L4), second example (L5), reply to Dax and a
surprise question (L6, Voice Champion badge).

**The crystal dragon (Level 6):** hovers beside the last island. It roars (warning, the
ground flashes orange), then breathes fire across the path for about 2 seconds. Wait,
then run past. Touching the fire costs a heart and returns the hero to the checkpoint
(it never reacts to speaking). Completing *Voice Champion* calms the dragon and it flies away.

## Play it

Upload the folder to a GitHub repository and turn on **GitHub Pages**. Open the game
from the `https://…github.io/…` link: browsers only allow the microphone on https,
and only load the 3D models and art from a web address (not from a local file).
If you host Listen & Leap in the same repo, put this game in its own folder
(e.g. `/speak/`); saves are kept separate.

**Best browser:** Chrome or Edge (speech-to-text). Other browsers record the voice for
playback instead. If the microphone is blocked, students can type (marked as typed).

## How a mission works

1. Walk to a Guardian and press **E** (or 🎙️ TALK on tablets). The Guardian reads the task aloud.
2. Choose help: **🎧 Model**, **🧩 Sentence starters**, **🔑 Keywords** or **💪 On my own**.
3. Level 6: optional **⏳ Plan first** timer (MUET Part 1 also gives planning time).
4. Press **Start speaking**, then **Stop**. The timer bar shows the green target zone.
5. Fix any words the computer got wrong, then tick the checklist:
   - I answered the question · My answer is about the topic → ⭐
   - I gave a reason / detail → ⭐
   - I used the target structure (e.g. "because", all 4 PREP parts) → ⭐
   The game only **suggests** ticks from words it spots; the student decides.
6. **Restore the crystal**: the bridge opens, progress is saved.

## Fair and private by design

- No scoring of accent, pronunciation or speech-recognition confidence. No MUET bands.
- Speech-to-text uses the browser's speech service (Chrome may send audio to Google).
  A one-time notice explains this before the microphone starts.
- Recordings stay in memory for playback only; they are never uploaded or saved.
- Progress and (optionally) transcripts are saved on the device only.
  Settings: *Save my transcripts* toggle and *Delete my progress & transcripts*.

## Lecturer report

At the end of each level: stars per mission, how the student answered (spoken seconds
or typed) and which help they used. **Copy** pastes into Google Sheets; **Download CSV**
exports every attempt on that device with: student, class, mission, support used,
mode (speech-to-text / recording / typed), seconds, words, stars, what the student
ticked, what the game spotted, and the transcript.

## Editing missions

All content is in `js/data.js` (prompts, model answers, starters, keywords, checklist
labels, target times, bonus tasks). The field guide is at the top of the `WORLDS` list.

## Folder structure

| Path | What it is |
|---|---|
| `index.html` | Page layout (menus, HUD, speaking panel, results) |
| `css/` | `style.css` (game + speaking panel), `tailwind.css` (compiled) |
| `js/data.js` | Heroes, levels and the 9 missions |
| `js/speaking.js` | Speaking engine: TTS, speech-to-text, recorder, typed fallback, checklist |
| `js/game.js` | 3D world, movement, scenery, dragon, rewards, saving, report |
| `js/lib/` | Three.js r128 + GLTFLoader (local copies) |
| `art/` | Heroes, enemies, items, dragon poses, level cards and backdrops |
| `models/` | Kenney Nature Kit models (CC0) |

Swap art by replacing a file **with the same name**:
`card_w1…w3.webp` (level cards / intro splash, Levels 4–6), `backdrop_w1…w3.webp`
(wide panoramas behind each level), `dragon_idle / roar / fire / hit / calm / fly.webp`
(dragon poses; poses face right).

## Credits

3D scenery: Kenney Nature Kit (www.kenney.nl), CC0 · 3D engine: Three.js (MIT) ·
Hero, enemy, item, dragon and level art: created for the Crystal Quest project,
Politeknik Port Dickson.
