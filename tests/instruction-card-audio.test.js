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
  const bodyStart = html.slice(start).match(/\)\s*\{/);
  assert.ok(bodyStart, `Could not find the body of ${name}`);
  const braceStart = start + bodyStart.index + bodyStart[0].lastIndexOf('{');
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
