# voice_task_manager.py

import speech_recognition as sr
import pyttsx3
import dateparser
import threading
import time
from datetime import datetime

# ------------------ Voice Functions ------------------
def listen():
    r = sr.Recognizer()
    with sr.Microphone() as source:
        print("🎤 Say something...")
        audio = r.listen(source)
    try:
        text = r.recognize_google(audio)
        print("You said:", text)
        return text.lower()
    except sr.UnknownValueError:
        return "Could not understand audio"
    except sr.RequestError:
        return "API unavailable"


# ------------------ Task Manager ------------------
tasks = []

def add_task(task_desc, time_str=None):
    due_time = dateparser.parse(time_str) if time_str else None
    tasks.append({"task": task_desc, "due": due_time, "done": False})
    return f"Task added: {task_desc}" + (f" at {due_time}" if due_time else "")

def list_tasks():
    if not tasks:
        return "No tasks yet."
    
    print("\n📋 Your Tasks:")
    output_lines = []
    for i, t in enumerate(tasks):
        status = "✅ Done" if t["done"] else "❌ Pending"
        due = f"(Due: {t['due']})" if t["due"] else ""
        line = f"{i+1}. {t['task']} - {status} {due}"
        print(line)
        output_lines.append(line)
    
    return "\n".join(output_lines)

def complete_task(index):
    if 0 <= index < len(tasks):
        tasks[index]["done"] = True
        return f"Task {index+1} marked complete."
    return "Invalid task number"


# ------------------ Command Handler ------------------
def handle_command(command):
    if "add task" in command:
        # Example: "add task submit report at 5 pm"
        parts = command.replace("add task", "").strip()
        
        if " at " in parts:
            task, time_str = parts.split(" at ", 1)
            return add_task(task.strip(), time_str.strip())
        else:
            return add_task(parts)
        
    elif "list tasks" in command:
        return list_tasks()
    
    elif "complete task" in command:
        try:
            num = int(command.split()[-1]) - 1
            return complete_task(num)
        except:
            return "Please say a valid task number."
    
    else:
        return "I didn’t get that. Try saying 'add task', 'list tasks', or 'complete task'."


# ------------------ Reminder Thread ------------------
engine = pyttsx3.init()

def remind():
    while True:
        now = datetime.now()
        for t in tasks:
            if t["due"] and not t["done"]:
                # if time is due (within 1 minute tolerance)
                if abs((t["due"] - now).total_seconds()) < 60:
                    msg = f"Reminder! Task due: {t['task']}"
                    print("🔔", msg)
                    engine.say(msg)
                    engine.runAndWait()
                    t["done"] = True  # auto mark done after reminder
        time.sleep(30)  # check every 30 sec


# ------------------ Main Loop ------------------
def main():
    print("🤖 Voice Task Manager started. Say 'exit' to quit.")
    while True:
        command = listen()
        if "exit" in command:
            print("Goodbye 👋")
            break
        response = handle_command(command)
        print("🤖:", response)

if __name__ == "__main__":
    threading.Thread(target=remind, daemon=True).start()
    main()
