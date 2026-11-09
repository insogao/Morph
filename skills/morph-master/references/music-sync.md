# Music sync: motion on the beat, logo systems that loop

When the user gives a track (or a video with one), the piece is cut **to the music**: every move lands on a beat, the loop is the music's loop, and the picture follows the audio clock. Worked example: MM71 `lab/mm-hum-logo` plus the page `pages/hum/`. It is a motion-logo system: a dot becomes a play button, then sound bars, headphones and a mic, then the dot again. Cut to 112.9 BPM, it plays as a 2-second riser intro followed by a 16-beat seamless loop, in 16:9, 1:1 and 9:16.

**The music is the user's material.** Keep the clip in `pages/<name>/media/` (git-ignored) or `.morph/`. Never commit it, never put it in a published folder, and keep MP4s with the track local. Analysis numbers (`levels.json`) are fine to commit.

## 1. Measure the beat — don't guess it

```bash
python3 tools/beat-grid.py <track or video>                 # tempo, beat, drop, loop windows ranked by seam
python3 tools/beat-grid.py <file> --drop 17.101 --intro 4 --loop 16 \
    --clip pages/<name>/media/clip.wav --levels lab/<id>/levels.json
```

- **Beat:** the tracker's tempo is refined on the onsets themselves (an eighth-note grid anchored on the drop). A hit 10 ms late reads as late, and raw tracker beats wobble by about that much.
- **Drop:** the biggest rise in loudness after a dip, which is the end of a riser. Land the logo there.
- **Loop windows:** windows of n beats starting on a bar, ranked by how alike the music is at the window's end and at its start. Starting the loop **on the drop** makes every pass re-land on the hit. That can be worth a slightly lower seam score, because the clip's crossfade hides the seam.
- **The clip:** intro beats plus the loop. Its last 25 ms are crossfaded into the audio just before the loop start, so it loops with no click. Use WAV, not AAC or MP3: their encoder delay shifts the loop points by 20–50 ms.
- **Levels:** five bands at 60 fps, with a fast attack and a slower release. Use them for anything that should move **to** the music (sound bars, pulses). They are deterministic, so seeking and the tools still work.

Listen-free check: render a spectrogram (`sox file -n trim 14 12 spectrogram -o spec.png`) to see the riser, the drop, and whether there is a voice. Speech shows as gliding formants; instrumental music shows as stacked steady partials and transients.

## 2. Write the scene on the beat grid

- **Write time in beats:** `b = (t − DROP) / BEAT`. Put every window in beats (`[1.25, 2]`, `[3.25, 4]`) and fold `b` into the loop. Duration = intro + **two** loops, so every tool also sees the seam.
- **Land on the beat:** a move starts soft and arrives fast exactly on a beat (`hit(x) = x²(2.2 − 1.2x)`). The landing squashes the icon with a damped impact that is gone within half a beat. During holds, a small kick on each beat keeps it alive.
- **Couple the layers:** the word follows half a beat behind the icon, letter by letter; colour wipes start on the bar's downbeat. Never move icon, word and colour together and then stop.
- **Colour blocking on bars:** the palette turns over on each bar's downbeat (cream → red → ink → cream) with a circle spreading from the icon. The last bar returns to the first palette, so the loop is seamless.
- **First pass vs loop:** the drop's own impact plays on the first pass only. Make sure beat 16 of a loop and beat 0 of the next draw the same frame (`mm pops` shows no pop at the seam).

## 3. Shape grammar that held up

- **Split a shape into its own pieces.** The play triangle's vertical strips **are** the sound bars' starting shapes, a staircase of the triangle's own heights. One shape becomes many without any piece appearing from nowhere.
- **Bent pills for strokes.** A bar, a headband piece and a mic holder are all one primitive: a stroke with round caps and a curvature. Bar → band is then a parameter blend: the bar keeps its thickness and simply bends. Band → holder is a flip: curvature goes from +, through 0, to −, so the arch flattens, drops and cradles. A point morph tangles here, and a rigid spin reads as a broken ")".
- **Halves that slide together.** Two cups become a capsule, and a capsule becomes a dot, as two halves overlapping by a few units across the middle, so no seam opens.
- **Swap pieces only when their union is identical.** Strips ↔ triangle, three band pieces ↔ one band, halves ↔ dot.

## 4. Words: weight morph yes, word morph no

- **Same word, different weight** (hairline → black on the drop): morph it. The glyph structure is the same, so the morph is perfect.
- **Different words** (hum. → play.): **roll** them, don't morph them. Glyph-to-glyph morphs between different letters turn to mush for a beat (checked: MM71 v1, and the MM70 captions). The old word rolls up out of a slot and the new one rolls in under it, letter by letter.

## 5. The page and the deliverables

- **Audio clock:** `t = audioContext.currentTime − t0 − outputLatency`. The picture reads the audio clock and never runs its own timer, so it cannot drift. Loop the source with `loopStart` and `loopEnd` (sample-accurate). After the first pass, fold time into the second loop so the scene draws "not first pass".
- **Start on a click** ("Play with sound"): browsers block autoplay with sound. Without the clip, the page runs silent on the performance clock.
- **One composition per aspect** (16:9, 1:1, 9:16), chosen by window aspect; re-laid out, not cropped.
- **Export:** `node tools/export-page.mjs <name>` inlines the audio as a data URL, giving one offline HTML file of about 1.9 MB with a 10 s WAV.
- **Video:** `node tools/page-video.mjs gallery/page-<name>.html <NAME> --width 1080 --height 1920 --audio track.wav --out .morph/video/x.mp4`. Every frame comes from the page's own seek API (exact, not a screen capture), muxed with the soundtrack laid out on the same timeline. Make one per aspect; these are what gets posted.

## Lyric videos: reuse pieces between lines (MM74)

A general rule, cheaper and more robust than hand-built stories. Worked example: `lab/mm-lyric-flight` plus `pages/lyric/`.

- **Lyrics and songs are copyrighted.** Never write a song's lyrics into the repo, a doc or a demo, and never download the track. Demo with original lines. The user can drop their own lyrics file and audio into git-ignored local folders (`pages/<name>/media/`) to render privately.
- **Lines on the beat:** each line holds a whole number of bars (`tools/beat-grid.py` for the grid and the clip). The change lands on the downbeat.
- **`matchPieces(lineA, lineB)`** (`vector/glyph-pieces.ts`) finds what the next line can reuse, with no radical database. It compares each outline piece inside its own character's em box (IoU on a 28² grid, at least 0.62). The same character flies whole; a shared piece (辶, 亻, 口, a 氵 dot, 青's 月) flies to its new character and morphs to the exact shape. Visible components flush the accent colour on the way, and the donor character visibly loses it (进 → 井).
- **Overlap the rest:** old characters recede to half size while fading, and the new ones form from half size, overlapping the flight. Shrinking each piece to nothing scattered confetti and tripped `vanish`.
- **Camera:** lines lie along a route; fly from one to the next around the change (pan, a little pull-back and bank), and let a dashed route draw behind.
- **Limit:** a component that the font joins to the rest of its character isn't a separate piece and isn't found. How striking the reuse is depends on the lyrics: with these six lines it is two or three pieces per change.

## Limits

- **Only one track has been tried** (steady 112.9 BPM, instrumental). Tracks with tempo changes, swing or rubato would need a beat map instead of a fixed grid; that's untested.
- **Analysis is offline:** levels are baked into JSON, and nothing listens live to a microphone or to arbitrary audio.
- **Lyrics or voice timing** (hitting words) is untested.
