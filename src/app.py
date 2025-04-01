from flask import Flask, render_template, request, Response, jsonify
import subprocess
import os
import sys
import json
import threading
import queue

app = Flask(__name__)

def normalize_path(path):
    """Normalize path format to ensure it follows the 'left-closed-right-open' convention:
    - Must start with '/'
    - Must not end with '/' (except for root path '/')

    Special case:
    - Empty path or '/' will return '/'

    Examples:
    - normalize_path('')      -> '/'
    - normalize_path('/')     -> '/'
    - normalize_path('/path') -> '/path'
    - normalize_path('path/') -> '/path'
    - normalize_path('/path/') -> '/path'
    """
    if not path or path == '/':
        return '/'

    # Ensure path starts with '/'
    if not path.startswith('/'):
        path = '/' + path

    # Remove trailing '/' if exists and path is not root
    while len(path) > 1 and path.endswith('/'):
        path = path[:-1]

    return path

# Global configuration
app.config['PLATFORM'] = os.environ.get('PLATFORM', 'LINUX')  # Default to LINUX
app.config['REPOSITORY_ROOT_PATH'] = normalize_path(os.environ.get('REPOSITORY_ROOT_PATH', '/'))  # Default to root directory
app.config['OUTPUT_ROOT_PATH'] = normalize_path(os.environ.get('OUTPUT_ROOT_PATH', '/'))  # Default to root directory
app.config['MOUNT_PATH'] = normalize_path(os.environ.get('MOUNT_PATH', '/'))  # Default to root directory
print(app.config['MOUNT_PATH'])
print(app.config['REPOSITORY_ROOT_PATH'])
print(app.config['OUTPUT_ROOT_PATH'])
print(app.config['PLATFORM'])

# Queue for storing process output
output_queue = queue.Queue()

def get_full_path(path):
    """Get the full path including MOUNT_PATH"""
    if app.config['MOUNT_PATH'] == '/':
        return path
    return app.config['MOUNT_PATH'] + path

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
    return render_template('index.html',
                         repository_root_path=app.config['REPOSITORY_ROOT_PATH'],
                         output_root_path=app.config['OUTPUT_ROOT_PATH'],
                         platform=app.config['PLATFORM'])

@app.route('/generate', methods=['POST'])
def generate():
    try:
        # Get path parameters from request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        repository_path = normalize_path(data.get('repositoryPath', '/'))
        output_path = normalize_path(data.get('outputPath', '/'))

        # Get full paths for actual file system operations
        full_repo_path = get_full_path(repository_path)
        full_output_path = get_full_path(output_path)

        print(f"Repository path: {full_repo_path}")
        print(f"Output path: {full_output_path}")

        # Verify repository path exists and is a directory
        if not os.path.exists(full_repo_path):
            return jsonify({'error': f'Repository path not found: {repository_path}'}), 404
        if not os.path.isdir(full_repo_path):
            return jsonify({'error': f'Repository path is not a directory: {repository_path}'}), 400

        # Verify output path exists and is a directory
        if not os.path.exists(full_output_path):
            return jsonify({'error': f'Output path not found: {output_path}'}), 404
        if not os.path.isdir(full_output_path):
            return jsonify({'error': f'Output path is not a directory: {output_path}'}), 400

        # Clear output queue
        while not output_queue.empty():
            output_queue.get()

        # Run gitstats in a new thread
        thread = threading.Thread(
            target=run_gitstats,
            args=(full_repo_path, full_output_path)
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
        current_path = normalize_path(path)

        # Get full path for actual file system operations
        full_path = get_full_path(current_path)
        print(f"Current path: {full_path}")

        # Verify path exists and is a directory
        if not os.path.exists(full_path):
            return jsonify({'error': f'Path not found: {path}'}), 404
        if not os.path.isdir(full_path):
            return jsonify({'error': f'Path is not a directory: {path}'}), 400

        # Get subdirectories
        subdirectories = []
        for item in os.listdir(full_path):
            item_path = os.path.join(full_path, item)
            if os.path.isdir(item_path):
                subdirectories.append(item)

        return jsonify({
            'directories': subdirectories,
        })
    except PermissionError:
        return jsonify({'error': 'Permission denied'}), 403
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)