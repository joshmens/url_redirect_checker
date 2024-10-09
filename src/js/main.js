// Ensure the DOM is fully loaded before running the script
document.addEventListener('DOMContentLoaded', function() {
    // Load the CORS proxy from the config file
    fetch('config.json')
        .then(response => response.json())
        .then(config => {
            const corsProxy = config.corsProxy; // CORS proxy URL from config.json

            document.getElementById('uploadForm').addEventListener('submit', function(event) {
                event.preventDefault();
                
                const fileInput = document.getElementById('fileInput');
                const file = fileInput.files[0];
                
                if (!file) {
                    alert('Please upload a file!');
                    return;
                }
                
                const reader = new FileReader();
                
                reader.onload = function(e) {
                    const contents = e.target.result;
                    const rows = parseCSV(contents);
                    const tableBody = document.getElementById('resultTableBody');
                    tableBody.innerHTML = '';

                    const progressBar = document.getElementById('progressBar');
                    progressBar.style.width = '0%';

                    let completed = 0;

                    rows.forEach((row, index) => {
                        const originalUrl = row[0];
                        const redirectingUrl = row[1];

                        const newRow = tableBody.insertRow();
                        const cellOriginalUrl = newRow.insertCell(0);
                        const cellRedirectingUrl = newRow.insertCell(1);
                        const cellStatus = newRow.insertCell(2);

                        cellOriginalUrl.innerText = originalUrl;
                        cellRedirectingUrl.innerText = redirectingUrl;
                        cellStatus.innerText = 'Processing...';

                        // Update the checkRedirect function call to ensure correct URL format
                        checkRedirect(originalUrl, redirectingUrl).then(result => {
                            cellStatus.innerText = result.status + ' (' + result.message + ')';
                            
                            if (result.status.includes('Correct')) {
                                cellStatus.style.color = 'green';
                            } else {
                                cellStatus.style.color = 'red';
                            }

                            completed++;
                            const percentage = Math.floor((completed / rows.length) * 100);
                            progressBar.style.width = percentage + '%';

                            if (completed === rows.length) {
                                alert('All URLs have been processed!');
                            }
                        });
                    });
                };
                
                reader.readAsText(file);
            });

            function parseCSV(data) {
                const rows = data.split('\n');
                return rows.map(row => row.split(',').map(col => col.trim()));
            }

            function checkRedirect(originalUrl, redirectingUrl) {
                // Use the CORS proxy to make the request
                return fetch(corsProxy + encodeURIComponent(originalUrl), {
                    method: 'HEAD',
                    redirect: 'manual'
                })
                .then(response => {
                    const locationHeader = response.headers.get('Location');
                    const isRedirect = response.status === 301 || response.status === 302;

                    if (isRedirect && locationHeader === redirectingUrl) {
                        return {
                            originalUrl,
                            redirectingUrl,
                            status: `${response.status} - Correct`,
                            message: 'Redirect successful'
                        };
                    } else if (isRedirect && locationHeader !== redirectingUrl) {
                        return {
                            originalUrl,
                            redirectingUrl,
                            status: `${response.status} - Incorrect`,
                            message: 'Redirect points to a different URL'
                        };
                    } else {
                        return {
                            originalUrl,
                            redirectingUrl,
                            status: `${response.status} - Incorrect`,
                            message: 'No redirect or status not 301/302'
                        };
                    }
                })
                .catch(error => {
                    return {
                        originalUrl,
                        redirectingUrl,
                        status: '0 - Request failed',
                        message: error.message
                    };
                });
            }
        })
        .catch(error => {
            console.error('Error loading config.json:', error);
        });
});