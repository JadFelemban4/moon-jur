# Instruction Card Narration Design

**Date:** 2026-07-13

## Goal

Play the matching recorded narration automatically whenever an instruction card opens. Moving to the next card must stop the current narration before the next narration starts. The existing sound toggle must control narration as well as the procedural sound effects and ambience.

## Scope

- Use the 15 existing MP3 files in `source/audio_tracks/`.
- Cover the three instruction cards in each of the five stages.
- Keep the existing card text, xAPI events, visual lesson effects, scene flow, and bilingual interface unchanged.
- Do not add new controls or desktop-only UI.

## Audio Mapping

The file name is derived from the one-based stage number and one-based card number:

| Stage | Card 1 | Card 2 | Card 3 |
| --- | --- | --- | --- |
| 1 | `1.1.mp3` | `1.2.mp3` | `1.3.mp3` |
| 2 | `2.1.mp3` | `2.2.mp3` | `2.3.mp3` |
| 3 | `3.1.mp3` | `3.2.mp3` | `3.3.mp3` |
| 4 | `4.1.mp3` | `4.2.mp3` | `4.3.mp3` |
| 5 | `5.1.mp3` | `5.2.mp3` | `5.3.mp3` |

The runtime URL format is `source/audio_tracks/{stage}.{card}.mp3`.

## Architecture

Add one lesson-narration controller backed by a single browser `Audio` element. The controller owns all recorded narration playback and exposes a small interface:

- `play(stageIndex, cardIndex)`: stop and reset any current narration, select the requested MP3, and play it from the beginning when global sound is enabled.
- `stop()`: pause the current narration and reset its position to the beginning.
- `setEnabled(enabled, currentCard)`: stop immediately when disabled; when re-enabled during an open lesson, replay the currently displayed card from the beginning.

Using one media element guarantees that two narration tracks cannot play at the same time and avoids decoding all 15 MP3 files into Quest memory.

The narration controller remains separate from the existing procedural WebAudio engine. The wrist sound button coordinates both controllers so one global sound state continues to govern the whole experience.

## Card Flow

1. `openLesson()` obtains the first card and renders it.
2. After rendering, it asks the narration controller to play the matching stage/card file.
3. `lessonNext()` keeps the existing click sound, stops narration immediately, and then either:
   - obtains and renders the next card before playing its narration, or
   - closes the lesson if the previous card was the last card.
4. Advancing to another stage also stops any stale narration defensively before the new scene and lesson are opened.

Narration playback is triggered only by actual card transitions. Redrawing the same card after switching Arabic/English does not restart its narration.

## Sound Toggle Behavior

- Turning sound off stops and resets narration immediately, then disables the existing effects and ambience.
- Turning sound on during an instruction card restarts that card's narration from the beginning and restores the existing audio behavior.
- Turning sound on outside an instruction card does not start narration.
- The MP3 narration is the supplied recording regardless of whether the displayed card text is Arabic or English; language switching only redraws text.

## Error Handling

`Audio.play()` may reject or a file may fail to load. The controller catches playback rejection and listens for media errors without blocking the lesson, showing an error toast, or changing xAPI progress. The text card and Next button remain usable. A later card transition still attempts to play its own file.

## Testing

Automated tests will extract the inline application script into a controlled browser-like harness and verify:

- the correct file path is selected for representative first, middle, and final cards;
- opening a lesson plays the first narration automatically;
- pressing Next pauses and resets the old track before playing the new track;
- closing the final card leaves no narration playing;
- muting stops narration, and unmuting during a lesson replays the current card;
- changing interface language redraws the card without restarting narration;
- a rejected `play()` promise does not interrupt card progression.

Final verification also includes the existing inline-script syntax check. Quest 3 remains the required manual verification target for audible playback and headset media-policy behavior.

## Acceptance Criteria

- Every instruction card automatically starts its matching MP3 when sound is enabled.
- No two narration tracks overlap.
- Next stops the current track before starting the next one.
- Leaving the final card stops narration.
- The existing sound toggle controls all narration, effects, and ambience.
- Muting, language switching, or MP3 load failure never blocks lesson progression.
