# voice_app_launcher.py
# Standalone Voice Command App Launcher - can work independently or send commands to server
import requests
import json
import sys

def send_command_to_server(command):
    """Send command to the Flask server for processing."""
    try:
        url = "http://localhost:5000/api/execute"
        payload = {"text": command}
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            if result.get("ok"):
                print(f"✓ {result.get('message', 'Command executed successfully')}")
                return True
            else:
                print(f"ℹ {result.get('message', 'Command not recognized')}")
                return False
        else:
            print(f"✗ Server error: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("✗ Could not connect to server. Make sure server.py is running on port 5000.")
        return False
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

def test_commands():
    """Test various voice commands with the server."""
    test_commands = [
        "open notepad",
        "open calculator", 
        "open chrome",
        "open youtube",
        "open vs code",
        "open file explorer",
        "start word",
        "launch excel",
        "go to google",
        "visit github",
        "open browser",
        "start paint"
    ]
    
    print("Testing voice commands with the server...")
    print("=" * 50)
    
    for cmd in test_commands:
        print(f"\nTesting: '{cmd}'")
        send_command_to_server(cmd)
    
    print("\n" + "=" * 50)
    print("Test completed!")

def interactive_mode():
    """Interactive mode where you can type commands to test."""
    print("Interactive Voice Command Tester")
    print("Type commands to test them with the server.")
    print("Examples: 'open notepad', 'open youtube', 'start chrome'")
    print("Type 'test' to run all test commands, or 'quit' to exit.")
    print("-" * 50)
    
    while True:
        try:
            command = input("\nEnter command: ").strip()
            
            if not command:
                continue
            elif command.lower() in ['quit', 'exit', 'q']:
                print("Goodbye!")
                break
            elif command.lower() == 'test':
                test_commands()
            else:
                send_command_to_server(command)
                
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "test":
            test_commands()
        else:
            # Execute single command from command line
            command = " ".join(sys.argv[1:])
            send_command_to_server(command)
    else:
        interactive_mode()
