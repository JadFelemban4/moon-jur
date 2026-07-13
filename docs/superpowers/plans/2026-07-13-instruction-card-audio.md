# Instruction Card Narration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically play the matching recorded MP3 for each instruction card, stopping the current narration before the next card starts and integrating narration with the existing sound toggle.

**Architecture:** Add a focused `createLessonNarration` controller inside the existing single-file application. It owns one browser `Audio` element, while the existing WebAudio engine continues to own ambience and procedural effects; card transitions and the wrist sound toggle coordinate the two controllers.

**Tech Stack:** HTML5 `Audio`, vanilla JavaScript, Node.js built-in `node:test`, existing Three.js r128/WebXR single-file application.

## Global Constraints

- Use the 15 existing MP3 files in `source/audio_tracks/`; do not embed them as base64.
- Map zero-based runtime stage/card indices to `source/audio_tracks/{stage + 1}.{card + 1}.mp3`.
- Keep existing card text, xAPI events, visual lesson effects, scene flow, and bilingual UI unchanged.
- Do not add controls or desktop/mobile UI; the experience remains VR-only.
- Use one reusable media element so narration tracks cannot overlap.
- Sound-off must stop narration immediately; sound-on during an open lesson must replay the current card from the beginning.
- Language switching must redraw text without restarting narration.
- Playback rejection or media loading failure must never block lesson progression.
- Quest 3 audible behavior requires user verification; automated checks cannot claim headset playback success.

---

## File Map

- Create `tests/instruction-card-audio.test.js`: dependency-free Node regression tests that extract and exercise the real inline narration controller and verify its integration call sites.
- Modify `MOON-JOURNEY-02-VR.html`: add the narration controller, instantiate it, and connect it to card transitions, stage transitions, and the wrist sound toggle.
- Modify `claude/Context.md`: document the recorded narration controller and its lifecycle.
- Modify `claude/handoff.md`: record the completed change and Quest 3 verification checklist.

### Task 1: Single-Element Narration Controller

**Files:**
- Create: `tests/instruction-card-audio.test.js`
- Modify: `MOON-JOURNEY-02-VR.html:4045-4190`

**Interfaces:**
- Consumes: `AudioCtor` with `pause()`, `play()`, `src`, `currentTime`, `preload`, and `addEventListener()`; `isSoundEnabled(): boolean`.
- Produces: `createLessonNarration({ AudioCtor, isSoundEnabled, basePath? })` returning `{ play(stageIndex, cardIndex): Promise<boolean>, stop(): void, setEnabled(enabled, currentCard): Promise<boolean> }`.
- Produces: singleton `lessonNarration`, configured with `window.Audio` and `audio.isEnabled()`.

- [ ] **Step 1: Write the failing controller tests**

Create `tests/instruction-card-audio.test.js` with:

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'MOON-JOURNEY-02-VR.html');

function readHtml() {
  return fs.readFileSync(HTML_PATH, 'utf8');
}

function functionSource(name) {
  const html = readHtml();
  const token = `function ${name}(`;
  const start = html.indexOf(token);
  assert.notEqual(start, -1, `${name} must exist in the application script`);
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Could not find the end of ${name}`);
}

function loadNarrationFactory() {
  return vm.runInNewContext(`(${functionSource('createLessonNarration')})`);
}

class FakeAudio {
  constructor() {
    this.src = '';
    this.currentTime = 0;
    this.preload = '';
    this.events = [];
    this.listeners = {};
    FakeAudio.instance = this;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  pause() {
    this.events.push(`pause:${this.src}`);
  }

  play() {
    this.events.push(`play:${this.src}`);
    if (FakeAudio.rejectNextPlay) {
      FakeAudio.rejectNextPlay = false;
      return Promise.reject(new Error('blocked'));
    }
    return Promise.resolve();
  }
}

function setupController(initialEnabled = true) {
  FakeAudio.instance = null;
  FakeAudio.rejectNextPlay = false;
  let enabled = initialEnabled;
  const createLessonNarration = loadNarrationFactory();
  const narration = createLessonNarration({
    AudioCtor: FakeAudio,
    isSoundEnabled: () => enabled
  });
  return {
    narration,
    player: FakeAudio.instance,
    setGlobalEnabled(value) { enabled = value; }
  };
}

test('all 15 narration assets exist and are non-empty', () => {
  for (let stage = 1; stage <= 5; stage += 1) {
    for (let card = 1; card <= 3; card += 1) {
      const asset = path.join(ROOT, 'source', 'audio_tracks', `${stage}.${card}.mp3`);
      assert.ok(fs.statSync(asset).size > 0, `${stage}.${card}.mp3 must be non-empty`);
    }
  }
});

test('maps first and final zero-based card indices to their MP3 paths', async () => {
  const { narration, player } = setupController();
  await narration.play(0, 0);
  assert.equal(player.src, 'source/audio_tracks/1.1.mp3');
  await narration.play(4, 2);
  assert.equal(player.src, 'source/audio_tracks/5.3.mp3');
});

test('stops and resets the current track before playing the next track', async () => {
  const { narration, player } = setupController();
  await narration.play(0, 0);
  player.currentTime = 4.2;
  await narration.play(0, 1);
  const stopOld = player.events.indexOf('pause:source/audio_tracks/1.1.mp3');
  const playNew = player.events.indexOf('play:source/audio_tracks/1.2.mp3');
  assert.ok(stopOld >= 0 && stopOld < playNew);
  assert.equal(player.currentTime, 0);
});

test('mute stops narration and unmute replays the current lesson card', async () => {
  const { narration, player, setGlobalEnabled } = setupController();
  await narration.play(1, 2);
  player.currentTime = 2;
  setGlobalEnabled(false);
  await narration.setEnabled(false, { stageIndex: 1, cardIndex: 2 });
  assert.equal(player.currentTime, 0);
  const eventCountWhileMuted = player.events.length;
  setGlobalEnabled(true);
  await narration.setEnabled(true, { stageIndex: 1, cardIndex: 2 });
  assert.equal(player.src, 'source/audio_tracks/2.3.mp3');
  assert.equal(player.events[eventCountWhileMuted + 1], 'play:source/audio_tracks/2.3.mp3');
});

test('playback rejection resolves false instead of breaking lesson flow', async () => {
  const { narration } = setupController();
  FakeAudio.rejectNextPlay = true;
  await assert.doesNotReject(async () => {
    assert.equal(await narration.play(2, 1), false);
  });
});
```

- [ ] **Step 2: Run the controller tests and verify RED**

Run:

```powershell
node --test tests/instruction-card-audio.test.js
```

Expected: the asset test passes, while the controller tests fail with `createLessonNarration must exist in the application script`.

- [ ] **Step 3: Add the minimal narration controller**

In `MOON-JOURNEY-02-VR.html`, insert this function after `createAudioEngine()` and before the application singleton declarations:

```javascript
function createLessonNarration({
  AudioCtor = window.Audio,
  isSoundEnabled = () => true,
  basePath = 'source/audio_tracks'
} = {}) {
  const player = new AudioCtor();
  player.preload = 'auto';
  player.addEventListener('error', () => {}, false);

  function stop() {
    player.pause();
    try { player.currentTime = 0; } catch (e) {}
  }

  async function play(stageIndex, cardIndex) {
    stop();
    if (!isSoundEnabled()) return false;
    player.src = `${basePath}/${stageIndex + 1}.${cardIndex + 1}.mp3`;
    try {
      await player.play();
      return true;
    } catch (e) {
      return false;
    }
  }

  function setEnabled(enabled, currentCard) {
    if (!enabled) {
      stop();
      return Promise.resolve(false);
    }
    if (currentCard) return play(currentCard.stageIndex, currentCard.cardIndex);
    return Promise.resolve(false);
  }

  return { play, stop, setEnabled };
}
```

Immediately after `const audio = createAudioEngine();`, add:

```javascript
const lessonNarration = createLessonNarration({
  AudioCtor: window.Audio,
  isSoundEnabled: () => audio.isEnabled()
});
```

- [ ] **Step 4: Run the controller tests and verify GREEN**

Run:

```powershell
node --test tests/instruction-card-audio.test.js
```

Expected: `5` tests pass and `0` fail.

- [ ] **Step 5: Commit the controller and its tests**

```powershell
git add -- tests/instruction-card-audio.test.js MOON-JOURNEY-02-VR.html
git commit -m "Add lesson narration controller"
```

### Task 2: Card, Stage, Language, and Mute Integration

**Files:**
- Modify: `tests/instruction-card-audio.test.js`
- Modify: `MOON-JOURNEY-02-VR.html:4545-4553`
- Modify: `MOON-JOURNEY-02-VR.html:5451-5518`

**Interfaces:**
- Consumes: Task 1's `lessonNarration.play(stageIndex, cardIndex)`, `lessonNarration.stop()`, and `lessonNarration.setEnabled(enabled, currentCard)`.
- Consumes: existing `sm.currentIndex`, `currentCard.index`, `app.hud.mode`, `audio.setEnabled()`, and `audio.isEnabled()`.
- Produces: automatic narration on real card transitions, non-restarting language redraws, global mute synchronization, and defensive stop on stage transitions.

- [ ] **Step 1: Add failing integration-source tests**

Append to `tests/instruction-card-audio.test.js`:

```javascript
test('open and next card transitions coordinate narration in order', () => {
  const openLesson = functionSource('openLesson');
  const lessonNext = functionSource('lessonNext');

  assert.match(
    openLesson,
    /renderLessonCard\(\);\s*lessonNarration\.play\(sm\.currentIndex, currentCard\.index\);/
  );

  const stop = lessonNext.indexOf('lessonNarration.stop();');
  const doneCheck = lessonNext.indexOf('if (currentCard.done)');
  const nextCard = lessonNext.indexOf('currentCard = sm.nextLesson();');
  const nextPlay = lessonNext.indexOf('lessonNarration.play(sm.currentIndex, currentCard.index);');
  assert.ok(stop >= 0 && stop < doneCheck);
  assert.ok(nextCard > doneCheck && nextCard < nextPlay);
});

test('language redraw does not restart narration', () => {
  assert.doesNotMatch(functionSource('renderLessonCard'), /lessonNarration/);
});

test('wrist sound toggle synchronizes procedural and lesson audio', () => {
  const panel = functionSource('drawWristPanel');
  assert.match(
    panel,
    /const soundEnabled = audio\.setEnabled\(!audio\.isEnabled\(\)\);/
  );
  assert.match(
    panel,
    /lessonNarration\.setEnabled\(soundEnabled, lessonCard\);/
  );
  assert.match(
    panel,
    /app\.hud\.mode === 'lesson' && currentCard/
  );
});

test('successful stage advance stops stale narration before rebuilding the scene', () => {
  const advance = functionSource('next');
  const blockedGuard = advance.indexOf('if (!res.moved)');
  const stop = advance.indexOf('lessonNarration.stop();');
  const rebuild = advance.indexOf('SCENE_BUILDERS[res.index]();');
  assert.ok(stop > blockedGuard && stop < rebuild);
});
```

- [ ] **Step 2: Run the integration tests and verify RED**

Run:

```powershell
node --test tests/instruction-card-audio.test.js
```

Expected: the original `5` tests pass and the new integration tests fail because the card and sound-toggle call sites do not yet reference `lessonNarration`.

- [ ] **Step 3: Synchronize the wrist sound toggle**

In `drawWristPanel()`, replace the current sound-button callback:

```javascript
  hudButton(ctx, HUD_W - 96, 14, 82, 40, audio.isEnabled() ? '🔊' : '🔇', () => {
    audio.unlock(); audio.setEnabled(!audio.isEnabled()); drawWristPanel();
  }, { color: 'rgba(245,158,11,.85)' });
```

with:

```javascript
  hudButton(ctx, HUD_W - 96, 14, 82, 40, audio.isEnabled() ? '🔊' : '🔇', () => {
    audio.unlock();
    const soundEnabled = audio.setEnabled(!audio.isEnabled());
    const lessonCard = app.hud.mode === 'lesson' && currentCard
      ? { stageIndex: sm.currentIndex, cardIndex: currentCard.index }
      : null;
    lessonNarration.setEnabled(soundEnabled, lessonCard);
    drawWristPanel();
  }, { color: 'rgba(245,158,11,.85)' });
```

- [ ] **Step 4: Connect narration to lesson transitions**

Replace `openLesson()` and `lessonNext()` with:

```javascript
function openLesson() {
  const st = sm.stageState(sm.currentIndex);
  if (st.lessonDone) return;
  currentCard = sm.nextLesson();               // xAPI 'experienced' inside
  app.hud.blocking = true;
  app.hud.mode = 'lesson';
  renderLessonCard();
  lessonNarration.play(sm.currentIndex, currentCard.index);
}

function lessonNext() {
  audio.click();
  lessonNarration.stop();
  if (currentCard.done) {
    app.hud.blocking = false;
    app.hud.mode = 'stage';
    if (app.onLessonEnd) { app.onLessonEnd(); app.onLessonEnd = null; }
    refreshHUD();
    return;
  }
  currentCard = sm.nextLesson();
  renderLessonCard();
  lessonNarration.play(sm.currentIndex, currentCard.index);
}
```

Do not add narration calls to `renderLessonCard()`. That function is also called for language redraws.

- [ ] **Step 5: Stop narration on successful stage transitions**

In `next()`, add `lessonNarration.stop();` after the blocked-advance guard and before the click/finish branches:

```javascript
function next() {
  const res = sm.advance();
  if (!res.moved) { toast(language.getLang() === 'ar' ? res.ar : res.en, 'err'); return; }
  lessonNarration.stop();
  audio.click();
  if (res.finished) { audio.success(); showCertificate(res.certificate); return; }
  SCENE_BUILDERS[res.index]();
  const amb = AMBIENTS[res.index];
  if (amb) audio.startAmbient(amb); else audio.stopAmbient();
  refreshHUD();
  openLesson();
}
```

- [ ] **Step 6: Run all narration tests and verify GREEN**

Run:

```powershell
node --test tests/instruction-card-audio.test.js
```

Expected: `9` tests pass and `0` fail.

- [ ] **Step 7: Run the inline-script syntax check**

Run:

```powershell
node -e "const fs=require('fs');const html=fs.readFileSync('MOON-JOURNEY-02-VR.html','utf8');const s=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);let failed=0;s.forEach((x,i)=>{try{new Function(x);console.log(i,'OK')}catch(e){failed++;console.log(i,'ERR:',e.message)}});if(failed)process.exit(1)"
```

Expected: `0 OK` and exit code `0`.

- [ ] **Step 8: Commit the integration**

```powershell
git add -- tests/instruction-card-audio.test.js MOON-JOURNEY-02-VR.html
git commit -m "Play narration with instruction cards"
```

### Task 3: Documentation and Final Verification

**Files:**
- Modify: `claude/Context.md`
- Modify: `claude/handoff.md`

**Interfaces:**
- Consumes: the final behavior and passing checks from Tasks 1 and 2.
- Produces: durable project documentation and a precise Quest 3 manual test checklist.

- [ ] **Step 1: Document the narration architecture**

Append this section to `claude/Context.md`:

```markdown

## Recorded instruction-card narration

- `createLessonNarration()` owns one reusable HTML `Audio` element for the 15 files in `source/audio_tracks/`.
- The zero-based stage/card indices map to `{stage + 1}.{card + 1}.mp3`.
- `openLesson()` and `lessonNext()` start narration only on real card transitions; `renderLessonCard()` never starts audio because language changes also call it.
- Next, lesson close, stage advance, and global mute stop and reset the current narration.
- Re-enabling sound while a lesson card is open replays that card from the beginning.
- Playback errors are swallowed so text learning and xAPI progression remain available.
```

- [ ] **Step 2: Record the handoff and manual verification checklist**

Append this section to `claude/handoff.md`:

```markdown

## 2026-07-13 — instruction-card narration

- Added automatic MP3 narration for all 15 instruction cards using `source/audio_tracks/{stage}.{card}.mp3`.
- A single reusable media element prevents overlap; Next stops/reset the old track before the new one starts.
- The wrist sound toggle now controls narration as well as WebAudio effects and ambience.
- Language redraws do not restart narration, and playback failure never blocks progress.
- Automated verification: `node --test tests/instruction-card-audio.test.js` and the inline-script syntax check.
- Quest 3 verification still required:
  1. Open stage 1 instructions and confirm `1.1.mp3` starts automatically.
  2. Press Next mid-track and confirm the old voice stops before `1.2.mp3` starts.
  3. Mute mid-track, confirm silence, then unmute and confirm the same card restarts.
  4. Switch AR/EN mid-track and confirm the voice does not restart.
  5. Finish card 3 and confirm no narration continues into exploration.
  6. Enter a later stage and confirm its matching numbered files play.
```

- [ ] **Step 3: Run fresh full verification**

Run:

```powershell
node --test tests/instruction-card-audio.test.js
```

Expected: `9` tests pass and `0` fail.

Run:

```powershell
node -e "const fs=require('fs');const html=fs.readFileSync('MOON-JOURNEY-02-VR.html','utf8');const s=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);let failed=0;s.forEach((x,i)=>{try{new Function(x);console.log(i,'OK')}catch(e){failed++;console.log(i,'ERR:',e.message)}});if(failed)process.exit(1)"
```

Expected: `0 OK` and exit code `0`.

Run:

```powershell
git diff --check
git status -sb
```

Expected: `git diff --check` prints nothing. `git status -sb` lists only the intended documentation changes plus the pre-existing untracked `.superpowers/` directory.

- [ ] **Step 4: Commit documentation**

```powershell
git add -- claude/Context.md claude/handoff.md
git commit -m "Document instruction card narration"
```

- [ ] **Step 5: Report the headset verification boundary**

Report the automated test totals and syntax result. Ask the user to run the six Quest 3 checks from `claude/handoff.md`; do not claim audible VR playback is verified until the user confirms it.
