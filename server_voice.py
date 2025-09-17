import os
import platform
import subprocess
import re
import webbrowser
import time
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# optional: screenshot
try:
    import pyautogui
except Exception:
    pyautogui = None

app = FastAPI(title="Wednesday Voice Command API")

# Allow frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all during dev
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model for incoming request
class Command(BaseModel):
    text: str

# --- App map: add/change paths for your OS ---
APP_MAP = {
    "Windows": {
        "chrome": r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        "notepad": "notepad.exe",
        "calculator": "calc.exe",
    },
    "Darwin": {  # macOS
        "chrome": "Google Chrome",
        "vscode": "Visual Studio Code",
    },
    "Linux": {
        "chrome": "google-chrome",
        "vscode": "code",
    },
}

def system_name():
    return platform.system()

# Open a URL in browser
def open_url(url: str):
    if not re.match(r"https?://", url):
        url = "https://" + url
    webbrowser.open(url)
    return True, f"Opened {url}"

# Open a known app
def open_application(name: str):
    sysname = system_name()
    mapping = APP_MAP.get(sysname, {})
    name = name.strip().lower()

    if name in mapping:
        path = os.path.expandvars(mapping[name])
        try:
            subprocess.Popen([path])
            return True, f"Opening {name}"
        except Exception as e:
            return False, str(e)

    return False, f"App {name} not found"

# Take a screenshot
def take_screenshot():
    if pyautogui is None:
        return False, "Screenshot feature not available"
    try:
        img = pyautogui.screenshot()
        fname = f"screenshot_{int(time.time())}.png"
        img.save(fname)
        return True, f"Screenshot saved to {fname}"
    except Exception as e:
        return False, str(e)

# Parse the voice command
def parse_and_execute(text: str):
    text = (text or "").lower().strip()

    if "screenshot" in text:
        return take_screenshot()

    if text.startswith("open "):
        target = text.replace("open ", "").strip()

        # Websites
        if "youtube" in target:
            return open_url("https://youtube.com")
        if "google" in target:
            return open_url("https://google.com")

        # Direct URL
        if "." in target:
            return open_url(target)

        # Apps
        return open_application(target)

    return False, "Command not recognized"

# API endpoint
@app.post("/api/execute")
async def execute_command(cmd: Command):
    ok, msg = parse_and_execute(cmd.text)
    return {"ok": ok, "message": msg}
