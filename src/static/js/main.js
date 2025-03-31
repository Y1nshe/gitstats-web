import PathSelector from './path-selector.js';

let eventSource = null;

document.addEventListener('DOMContentLoaded', function() {
    // Get element references
    const statsForm = document.getElementById('statsForm');
    const submitButton = statsForm.querySelector('button[type="submit"]');
    const outputDiv = document.getElementById('output');

    // Form submission handler
    statsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const repositoryPath = document.getElementById('repositoryPathInput').value;
        const outputPath = document.getElementById('outputPathInput').value;
        const outputDiv = document.getElementById('output');

        if (!repositoryPath || !outputPath) {
            outputDiv.innerHTML = '<div class="error">Please fill in all required information</div>';
            return;
        }

        // Disable form
        submitButton.disabled = true;
        outputDiv.innerHTML = 'Generating statistics report...';

        // Close previous connection if exists
        if (eventSource) {
            eventSource.close();
        }

        // Send request to backend
        fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                repositoryPath: repositoryPath,
                outputPath: outputPath
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                outputDiv.innerHTML = `<div class="error">Error: ${data.error}</div>`;
                submitButton.disabled = false;
                return;
            }

            // Establish SSE connection
            eventSource = new EventSource('/stream');
            let output = '';

            eventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);
                if (data.message === 'heartbeat') {
                    return;
                }
                output += data.message + '\n';
                outputDiv.textContent = output;
                outputDiv.scrollTop = outputDiv.scrollHeight;

                // Check if it's a completion message
                if (data.message.includes('Statistics report generation completed!')) {
                    submitButton.disabled = false;
                }
            };

            eventSource.onerror = function(error) {
                console.error('SSE Error:', error);
                eventSource.close();
                this.querySelector('button[type="submit"]').disabled = false;
            }.bind(this);
        })
        .catch(error => {
            console.error('Request Error:', error);
            outputDiv.innerHTML = `<div class="error">Request Error: ${error.message}</div>`;
            this.querySelector('button[type="submit"]').disabled = false;
        });
    });

    // Initialize path selectors
    const repositoryPathSelector = new PathSelector('repositoryPathInput', 'repositoryPathToggleButton', 'repositoryPathDirectorySelector');
    const outputPathSelector = new PathSelector('outputPathInput', 'outputPathToggleButton', 'outputPathDirectorySelector');
});