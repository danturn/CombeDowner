#!/usr/bin/env python3
"""The station announcer's voice (web/src/announce.ts): every word and phrase the announcements are
stitched together from, said once each by a British woman's voice, the way the real ones are made up
of recorded pieces, packed into one sound file the game plays them from through its tannoy.

    pip install piper-tts
    python3 tools/station_voice.py            # writes web/public/sounds/station.mp3 and station.json

The voice is Piper's "Cori" (en_GB, trained on LibriVox recordings, which are in the public domain);
its model (about 110 MB) is downloaded into data/raw/voices/ the first time, from Hugging Face. Only
what it says is kept in the repo: the model, and the speech engine, are only needed to make it again.

Add a word here when announce.ts can say one that isn't (a new station, say), and run it again: a
phrase with a word that isn't here is read out by the browser's own voice instead, unfiltered.
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = "en_GB-cori-high"
URL = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/high/{MODEL}"
GAP = 0.3   # seconds of silence between the pieces in the file

ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
        "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
TENS = ["twenty", "thirty", "forty", "fifty"]
STATIONS = ["Avoncliff", "Bath Spa", "Bradford-on-Avon", "Bristol Temple Meads", "Cardiff Central", "Chippenham",
            "Didcot Parkway", "Filton Abbey Wood", "Freshford", "Keynsham", "London Paddington", "Newport",
            "Oldfield Park", "Reading", "Swindon", "Trowbridge", "Westbury"]
# the pieces the announcements are made of, as announce.ts writes them
PIECES = [
    "Platform", "for", "the", "service", "Great Western Railway service", "to", "Calling at", "and", "only.",
    "This train is formed of", "coaches.", "The train now approaching platform", "The train now approaching", "is",
    "is not in service.", "Please do not board this train.", "Please stand behind the yellow line.",
    "oh", "o'clock", "hundred", "zero zero",
    # the announcements that aren't about a train (FILLERS)
    "If you see something that doesn't look right,", "speak to staff,", "or text the British Transport Police",
    "on six one, oh one six.", "We'll sort it.", "See it.", "Say it.", "Sorted.",
    "Please keep your personal belongings with you", "at all times.",
    "This is a no smoking station.", "Smoking, including e-cigarettes,", "is not permitted anywhere on this station.",
    "Customers are reminded", "that cycling, skateboarding and pogo sticks", "are not permitted on the platforms.",
    "Please take care when using the stairs.", "Use the handrail,", "and do not run on the platforms.",
] + ONES + TENS


def key(text: str) -> str:
    """A piece's name, as announce.ts looks it up: lower case, words only, a full stop kept at the end
    (a station said at the end of a sentence, falling, rather than in a list)."""
    end = "." if text.rstrip().endswith(".") else ""
    words = "".join(c if c.isalnum() or c == "'" else " " for c in text.lower()).split()
    return " ".join(words) + end


def main():
    from piper import PiperVoice
    from piper.config import SynthesisConfig

    model_dir = os.path.join(ROOT, "data", "raw", "voices")
    os.makedirs(model_dir, exist_ok=True)
    model = os.path.join(model_dir, MODEL + ".onnx")
    for ext in (".onnx", ".onnx.json"):
        path = model[: -len(".onnx")] + ext
        if not os.path.exists(path):
            print("downloading", os.path.basename(path), file=sys.stderr)
            urllib.request.urlretrieve(URL + ext, path)
    voice = PiperVoice.load(model)
    # a touch slower and steadier than she reads a book
    syn = SynthesisConfig(length_scale=1.12, noise_scale=0.5, noise_w_scale=0.6)

    texts = list(PIECES)
    for s in STATIONS:
        texts += [s + ",", s + "."]   # in a list, and at the end
    pieces, seen = [], set()
    for t in texts:
        k = key(t)
        if k not in seen:
            seen.add(k)
            pieces.append((k, t))

    out = os.path.join(ROOT, "web", "public", "sounds")
    os.makedirs(out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        allwav = os.path.join(tmp, "all.wav")
        rate, at, index, frames = 0, 0.0, {}, []
        for k, t in pieces:
            path = os.path.join(tmp, "one.wav")
            with wave.open(path, "wb") as w:
                voice.synthesize_wav(t, w, syn_config=syn)
            with wave.open(path, "rb") as w:
                rate = w.getframerate()
                data = w.readframes(w.getnframes())
            # trim the quiet at either end, so the pieces follow on as tightly as the real ones
            samples = memoryview(data).cast("h")
            loud = [i for i in range(len(samples)) if abs(samples[i]) > 300]
            a, b = (max(0, loud[0] - int(rate * 0.02)), min(len(samples), loud[-1] + int(rate * 0.05))) if loud else (0, 0)
            clip = bytes(data[a * 2: b * 2])
            index[k] = [round(at + GAP, 3), round((b - a) / rate, 3)]
            frames.append(b"\0\0" * int(rate * GAP) + clip)
            at += GAP + (b - a) / rate
        with wave.open(allwav, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
            w.writeframes(b"".join(frames) + b"\0\0" * int(rate * GAP))
        # small: a tannoy carries nothing over a few kHz anyway
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", allwav, "-ac", "1", "-ar", "16000",
                        "-c:a", "libmp3lame", "-b:a", "32k", os.path.join(out, "station.mp3")], check=True)
    with open(os.path.join(out, "station.json"), "w") as f:
        json.dump({"voice": f"Piper {MODEL}", "pieces": index}, f, separators=(",", ":"))
    print(f"{len(index)} pieces, {at:.0f} s, {os.path.getsize(os.path.join(out, 'station.mp3')) // 1024} KB", file=sys.stderr)


if __name__ == "__main__":
    main()
