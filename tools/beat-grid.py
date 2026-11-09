#!/usr/bin/env python3
"""Measure a track's beat grid and cut a loopable clip for a music-synced scene.

    python3 tools/beat-grid.py <audio or video>                       # report: tempo, beat, drop, loop windows
    python3 tools/beat-grid.py <file> --drop 17.101 --intro 4 --loop 16 \\
        --clip pages/<name>/media/clip.wav --levels lab/<id>/levels.json   # write the clip and the band levels

Needs ffmpeg, numpy, scipy and librosa (pip install librosa). Music the user supplies is THEIR material: write the
clip under pages/<name>/media/ (git-ignored) or .morph/, never into a published folder.

What it does, and why:
- beat: librosa's tempo, then refined on the onsets themselves (an eighth-note grid anchored on the drop), because a
  tracker's beat times wobble by ±10 ms and a motion hit 10 ms late reads as late;
- drop: the largest jump in loudness after a quiet dip (a riser's end) — the natural place for the logo to land;
- loop windows: n-beat windows starting on a bar, ranked by how alike the music is at the window's end and its start
  (chroma), so the loop seam is musical;
- clip: [drop - intro beats, drop + loop beats), with the last 25 ms crossfaded into the audio just before the loop
  start — the sample after loopEnd is then the natural continuation of the one at loopStart (no click);
- levels: 5 bands (lows → highs) at 60 fps over the clip, fast attack and slower release, 0..1 — for visuals that
  move to the music (sound bars, pulses) deterministically.
"""
import argparse, json, os, subprocess, sys, tempfile

import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("file")
ap.add_argument("--drop", type=float, help="drop time in seconds (default: detected)")
ap.add_argument("--intro", type=int, default=4, help="beats before the drop kept in the clip")
ap.add_argument("--loop", type=int, default=16, help="beats in the loop")
ap.add_argument("--clip", help="write the loopable clip (WAV, 32 kHz stereo) here")
ap.add_argument("--levels", help="write band levels (JSON) here")
args = ap.parse_args()

try:
    import librosa
    from scipy.io import wavfile
except ImportError:
    sys.exit("beat-grid needs librosa and scipy: pip install librosa scipy")

tmp = tempfile.mkdtemp()
mono, stereo = os.path.join(tmp, "mono.wav"), os.path.join(tmp, "stereo.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", args.file, "-vn", "-ac", "1", "-ar", "22050", mono], check=True)
y, sr = librosa.load(mono, sr=22050)
dur = len(y) / sr

# ——— tempo, then a grid fitted on the onsets ———
tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
tempo = float(np.atleast_1d(tempo)[0])
onsets = librosa.onset.onset_detect(y=y, sr=sr, hop_length=256, units="time")
rms = librosa.feature.rms(y=y, hop_length=256)[0]
rt = librosa.times_like(rms, sr=sr, hop_length=256)

drop = args.drop
if drop is None:
    # The biggest rise in loudness (0.25 s windows) after a dip, snapped to the nearest onset.
    win = int(0.25 * sr / 256)
    level = np.convolve(rms, np.ones(win) / win, mode="same")
    rise = level[win:] / (level[:-win] + 1e-6)
    i = int(np.argmax(rise[: int((dur - 10) * sr / 256)])) + win
    drop = float(onsets[np.argmin(np.abs(onsets - rt[i]))])

seg = onsets[(onsets > drop - 0.01) & (onsets < drop + 40)]
best = (0.0, 30 / tempo)
for p in np.linspace(0.97 * 30 / tempo, 1.03 * 30 / tempo, 600):       # eighth notes near the tracker's tempo
    k = np.round((seg - drop) / p)
    score = float((np.abs(seg - drop - k * p) < 0.02).mean())
    if score > best[0]:
        best = (score, p)
beat = 2 * best[1]

# ——— loop windows: seam similarity (chroma just after the end vs just after the start) ———
C = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=256)
ct = librosa.times_like(C, sr=sr, hop_length=256)
def vec(t):
    m = (ct >= t) & (ct < t + beat)
    v = C[:, m].mean(1)
    return v / (np.linalg.norm(v) + 1e-9)
windows = []
for bar in range(0, 64, 4):
    s = drop + bar * beat
    e = s + args.loop * beat
    if e + beat > dur:
        break
    windows.append({"start": round(s, 3), "end": round(e, 3), "seam": round(float(vec(e) @ vec(s)), 3)})

report = {"tempo_bpm": round(60 / beat, 2), "beat": round(beat, 4), "grid_fit": round(best[0], 2), "drop": round(drop, 3),
          "intro_from": round(drop - args.intro * beat, 3),
          "loop_windows": sorted(windows, key=lambda w: -w["seam"])[:5]}
print(json.dumps(report, indent=2))

# ——— the clip and the levels ———
t0, loop_start, loop_end = drop - args.intro * beat, args.intro * beat, (args.intro + args.loop) * beat
if args.clip:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", args.file, "-vn", "-ac", "2", "-ar", "32000", "-c:a", "pcm_s16le", stereo], check=True)
    rate, x = wavfile.read(stereo)
    x = x.astype(np.float32)
    s0, n, ls, fade = int(round(t0 * rate)), int(round(loop_end * rate)), int(round(loop_start * rate)), int(0.025 * rate)
    clip = x[s0:s0 + n].copy()
    w = np.linspace(0, 1, fade)[:, None]
    clip[n - fade:n] = clip[n - fade:n] * (1 - w) + x[s0 + ls - fade:s0 + ls] * w     # the seam
    head = int(0.01 * rate)
    clip[:head] *= np.linspace(0, 1, head)[:, None]
    os.makedirs(os.path.dirname(os.path.abspath(args.clip)), exist_ok=True)
    wavfile.write(args.clip, rate, np.clip(clip, -32768, 32767).astype(np.int16))
    print("clip", args.clip, round(n / rate, 3), "s, loop", round(loop_start, 4), "→", round(loop_end, 4))
if args.levels:
    part = y[int(t0 * sr): int((t0 + loop_end) * sr) + sr]
    hop = sr // 60
    S = np.abs(librosa.stft(part, n_fft=2048, hop_length=hop)) ** 2
    f = librosa.fft_frequencies(sr=sr, n_fft=2048)
    edges = [40, 160, 500, 1400, 3500, 9000]
    bands = []
    for a, b in zip(edges[:-1], edges[1:]):
        e = np.log1p(S[(f >= a) & (f < b)].sum(0) * 1e3)
        lo, hi = np.percentile(e, 5), np.percentile(e, 99)
        v = np.clip((e - lo) / (hi - lo + 1e-9), 0, 1)
        out, acc = np.zeros_like(v), 0.0
        for i, val in enumerate(v):
            acc = val if val > acc else acc + (val - acc) * 0.18
            out[i] = acc
        bands.append(out)
    frames = int(loop_end * 60) + 1
    data = [[round(float(bands[k][i]), 2) for k in range(5)] for i in range(frames)]
    with open(args.levels, "w") as fh:
        json.dump({"fps": 60, "beat": round(beat, 4), "intro": args.intro, "loop": [round(loop_start, 4), round(loop_end, 4)], "bands": data}, fh, separators=(",", ":"))
    print("levels", args.levels, frames, "frames")
