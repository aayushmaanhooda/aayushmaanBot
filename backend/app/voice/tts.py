import os
import uuid

import edge_tts

TTS_VOICE = "en-US-AndrewMultilingualNeural"
AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "audio_files")
os.makedirs(AUDIO_DIR, exist_ok=True)


async def synthesize(text: str) -> str:
    """Convert text to speech. Clears old files first, returns new file path."""
    for f in os.listdir(AUDIO_DIR):
        os.remove(os.path.join(AUDIO_DIR, f))

    filename = f"{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)
    communicate = edge_tts.Communicate(text, TTS_VOICE)
    await communicate.save(filepath)
    return filepath
