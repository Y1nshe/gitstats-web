from flask import Flask, render_template, request, Response, jsonify
import subprocess
import os
import sys
import json
import threading
import queue
import re

app = Flask(__name__)

# Global configuration
app.config['PLATFORM'] = os.environ.get('PLATFORM', 'LINUX')  # Default to LINUX
app.config['DEFAULT_DIR'] = os.environ.get('DEFAULT_DIR', '/')  # Default to root directory

# Queue for storing process output
output_queue = queue.Queue()

def windows_to_linux_path(win_path):
    """Convert Windows format path to Linux format path in Docker"""
    if not win_path:
        return '/mnt'

    # Handle absolute paths (e.g., C:\path\to\directory)
    if re.match(r'^[a-zA-Z]:', win_path):
        drive, rest = win_path.split(':', 1)
        # Replace backslashes with forward slashes, remove leading slash
        rest = rest.replace('\\', '/')
        if rest.startswith('/'):
            rest = rest[1:]
        return f'/mnt/{drive.lower()}/{rest}'

    # Handle relative paths or paths already in Linux format
    return win_path.replace('\\', '/')

def read_stream(stream, prefix, queue, stop_event):
    """Read stream and send content to queue"""
    try:
        while not stop_event.is_set():
            line = stream.readline()
            if not line:  # Empty string indicates stream has ended
                break

            if line.strip():
                print(f"{prefix}: {line.strip()}")
                if prefix == "Error":
                    queue.put(f"Error: {line.strip()}")
                else:
                    queue.put(line.strip())
    except Exception as e:
        print(f"Error reading stream: {str(e)}")
        queue.put(f"Error reading stream: {str(e)}")
    finally:
        stream.close()

def run_gitstats(repository_path, output_path):
    """Run gitstats and collect output"""
    try:
        # Ensure output directory exists
        os.makedirs(output_path, exist_ok=True)
        output_queue.put(f"Creating output directory: {output_path}")

        # Build gitstats command
        cmd = ['./gitstats', repository_path, output_path]
        output_queue.put(f"Executing command: {' '.join(cmd)}")
        output_queue.put(f"Current working directory: {os.getcwd()}")
        output_queue.put(f"gitstats file exists: {os.path.exists('./gitstats')}")
        output_queue.put(f"gitstats file permissions: {oct(os.stat('./gitstats').st_mode)[-3:]}")
        output_queue.put(f"Environment variables: {os.environ.get('PATH')}")

        # Use Popen to get real-time output
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,  # Line buffering
            env=dict(os.environ, PYTHONUNBUFFERED='1')
        )

        # Create stop event
        stop_event = threading.Event()

        # Create threads to read stdout and stderr
        stdout_thread = threading.Thread(
            target=read_stream,
            args=(process.stdout, "Standard Output", output_queue, stop_event)
        )
        stderr_thread = threading.Thread(
            target=read_stream,
            args=(process.stderr, "Error", output_queue, stop_event)
        )

        # Start threads
        stdout_thread.start()
        stderr_thread.start()

        # Wait for process to complete
        process.wait()

        # Set stop event to notify threads to stop
        stop_event.set()

        # Wait for threads to complete (with timeout to prevent permanent blocking)
        stdout_thread.join(timeout=5)
        stderr_thread.join(timeout=5)

        # Check process exit status
        if process.returncode != 0:
            output_queue.put(f"Command execution failed, exit code: {process.returncode}")
        else:
            # Check if files were generated in output directory
            if os.path.exists(output_path):
                files = os.listdir(output_path)
                output_queue.put(f"Output directory contents: {files}")
                if files:
                    output_queue.put("Statistics report generation completed!")
                else:
                    output_queue.put("Warning: Output directory is empty")
            else:
                output_queue.put(f"Warning: Output directory does not exist: {output_path}")

    except Exception as e:
        print(f"Error occurred: {str(e)}")
        print(f"Error type: {type(e)}")
        print(f"Error details: {str(e)}", file=sys.stderr)
        output_queue.put(f"Error occurred: {str(e)}")

@app.route('/')
def index():
    return render_template('index.html', default_dir=app.config['DEFAULT_DIR'])

@app.route('/generate', methods=['POST'])
def generate():
    try:
        # Get path parameters from request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        repository_path = data.get('repositoryPath', '')
        output_path = data.get('outputPath', '')
        platform = app.config['PLATFORM']

        # Handle different platforms
        if platform in ['LINUX', 'WSL']:
            # Direct processing for LINUX and WSL platforms
            current_repo_path = repository_path or '/'
            current_output_path = output_path or '/'
        elif platform == 'WINDOWS':
            # Special handling for WINDOWS platform
            current_repo_path = windows_to_linux_path(repository_path)
            current_output_path = windows_to_linux_path(output_path)
        else:
            return jsonify({'error': f'Unsupported platform: {platform}'}), 400

        print(f"Repository path: {current_repo_path}")
        print(f"Output path: {current_output_path}")

        # Verify repository path exists and is a directory
        if not os.path.exists(current_repo_path):
            return jsonify({'error': f'Repository path not found: {current_repo_path}'}), 404
        if not os.path.isdir(current_repo_path):
            return jsonify({'error': f'Repository path is not a directory: {current_repo_path}'}), 400

        # Verify output path exists and is a directory
        if not os.path.exists(current_output_path):
            return jsonify({'error': f'Output path not found: {current_output_path}'}), 404
        if not os.path.isdir(current_output_path):
            return jsonify({'error': f'Output path is not a directory: {current_output_path}'}), 400

        # Clear output queue
        while not output_queue.empty():
            output_queue.get()

        # Run gitstats in a new thread
        thread = threading.Thread(
            target=run_gitstats,
            args=(current_repo_path, current_output_path)
        )
        thread.start()

        return jsonify({'message': 'Starting to generate statistics report'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/stream')
def stream():
    def generate():
        while True:
            try:
                # Get output from queue with 1-second timeout
                message = output_queue.get(timeout=1)
                yield f"data: {json.dumps({'message': message})}\n\n"
            except queue.Empty:
                # If queue is empty, send heartbeat to keep connection
                yield f"data: {json.dumps({'message': 'heartbeat'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'message': f'Error: {str(e)}'})}\n\n"
                break

    return Response(generate(), mimetype='text/event-stream')

@app.route('/browse', methods=['POST'])
def browse():
    try:
        # Get path parameter from request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        path = data.get('path', '')
        platform = app.config['PLATFORM']

        # Handle different platforms
        if platform in ['LINUX', 'WSL']:
            # Direct processing for LINUX and WSL platforms
            current_path = path or '/'  # Use root directory if path is empty
        elif platform == 'WINDOWS':
            # Special handling for WINDOWS platform
            current_path = windows_to_linux_path(path)
        else:
            return jsonify({'error': f'Unsupported platform: {platform}'}), 400

        print(f"Current path: {current_path}")

        # Verify path exists and is a directory
        if not os.path.exists(current_path):
            return jsonify({'error': f'Path not found: {current_path}'}), 404
        if not os.path.isdir(current_path):
            return jsonify({'error': f'Path is not a directory: {current_path}'}), 400

        # Get subdirectories
        subdirectories = []
        for item in os.listdir(current_path):
            item_path = os.path.join(current_path, item)
            if os.path.isdir(item_path):
                # For Windows platform and /mnt path, only show single-letter drive letters
                if platform == 'WINDOWS' and current_path == '/mnt':
                    if len(item) == 1 and item.isalpha():
                        subdirectories.append(f"{item.upper()}:")
                else:
                    subdirectories.append(item)

        return jsonify({
            'directories': subdirectories,
            'current_path': current_path
        })
    except PermissionError:
        return jsonify({'error': 'Permission denied'}), 403
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
