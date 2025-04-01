import PathSelector from './path-selector.js';

let eventSource = null;

document.addEventListener('DOMContentLoaded', () => {
    // Get platform from template
    const platform = document.getElementById('platform').value || 'LINUX';
    console.log(platform);

    // Initialize path selectors
    const repositoryPathSelector = new PathSelector(
        'repositoryPathInput',
        'repositoryPathToggleButton',
        'repositoryPathDirectorySelector',
        'repositoryRootPath',
        platform
    );

    const outputPathSelector = new PathSelector(
        'outputPathInput',
        'outputPathToggleButton',
        'outputPathDirectorySelector',
        'outputRootPath',
        platform
    );

    const repositoryFullPath = document.getElementById('repositoryFullPath');
    const outputFullPath = document.getElementById('outputFullPath');
    repositoryFullPath.textContent = repositoryPathSelector.getFullPath();
    outputFullPath.textContent = outputPathSelector.getFullPath();

    // Get form and output elements
    const form = document.getElementById('statsForm');
    const submitButton = form.querySelector('button[type="submit"]');
    const output = document.getElementById('output');

    // Function to update full path display
    function updateFullPathDisplay() {
        if (repositoryFullPath) {
            repositoryFullPath.textContent = repositoryPathSelector.getFullPath();
        }
        if (outputFullPath) {
            outputFullPath.textContent = outputPathSelector.getFullPath();
        }
    }

    // Add input event listeners to update full path display
    document.getElementById('repositoryPathInput').addEventListener('input', updateFullPathDisplay, false);
    document.getElementById('outputPathInput').addEventListener('input', updateFullPathDisplay, false);

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Disable form
        submitButton.disabled = true;
        output.innerHTML = 'Generating statistics report...';

        // Close previous connection if exists
        if (eventSource) {
            eventSource.close();
        }

        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    repositoryPath: repositoryPathSelector.getFullPath(),
                    outputPath: outputPathSelector.getFullPath()
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Request failed (${response.status})`);
            }

            // Establish SSE connection
            eventSource = new EventSource('/stream');
            let outputText = '';

            eventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);
                if (data.message === 'heartbeat') {
                    return;
                }
                outputText += data.message + '\n';
                output.textContent = outputText;
                output.scrollTop = output.scrollHeight;

                // Check if it's a completion message
                if (data.message.includes('Statistics report generation completed!')) {
                    submitButton.disabled = false;
                }
            };

            eventSource.onerror = function(error) {
                console.error('SSE Error:', error);
                eventSource.close();
                submitButton.disabled = false;
            };
        } catch (error) {
            output.textContent = `Error: ${error.message}`;
            submitButton.disabled = false;
        }
    });
});