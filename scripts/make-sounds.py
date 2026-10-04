# /// script
# dependencies = ["kokoro-onnx", "soundfile"]
# ///
# Regenerates sounds/*.wav: Kokoro TTS (Apache-2.0) voice, then an ffmpeg radio filter.
# Needs ffmpeg plus kokoro-v1.0.onnx and voices-v1.0.bin from
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 in the cwd.
#   uv run scripts/make-sounds.py [voice]
import subprocess, sys, tempfile, soundfile as sf
from pathlib import Path
from kokoro_onnx import Kokoro

CALLS = {
    "locknload": "Locked and loaded!",
    "bombdef": "Bomb has been defused.",
    "negative": "Negative.",
    "fallback": "Fall back!",
    "ct_fireinhole": "Fire in the hole!",
    "ctwin": "Counter-Terrorists win.",
    "terwin": "Terrorists win.",
}
RADIO = (
    "[0]aresample=24000,highpass=f=350,lowpass=f=3300,volume=6dB,asoftclip=type=tanh,"
    "acompressor=threshold=-18dB:ratio=6:attack=2:release=60,highpass=f=300,lowpass=f=3400[v];"
    "[1]highpass=f=500,lowpass=f=4000[a];[2]highpass=f=500,lowpass=f=4000,afade=t=out:d=0.09[b];"
    "[a][v][b]concat=n=3:v=0:a=1,loudnorm=I=-16:TP=-1.5,aresample=22050"
)

voice = sys.argv[1] if len(sys.argv) > 1 else "am_michael"
out = Path(__file__).resolve().parent.parent / "sounds"
out.mkdir(exist_ok=True)
k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
with tempfile.TemporaryDirectory() as tmp:
    for name, text in CALLS.items():
        samples, sr = k.create(text, voice=voice, speed=1.1, lang="en-us")
        raw = f"{tmp}/{name}.wav"
        sf.write(raw, samples, sr)
        noise = ["-f", "lavfi", "-i", "anoisesrc=c=pink:a=0.25:r=24000"]
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", raw,
             "-t", "0.07", *noise, "-t", "0.09", *noise,
             "-filter_complex", RADIO, "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le",
             str(out / f"{name}.wav")],
            check=True,
        )
        print(f"{name}: {text}", flush=True)
