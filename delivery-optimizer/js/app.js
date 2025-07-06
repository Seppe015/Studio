// Global application state
let appState = {
    addresses: [],
    startingPoint: null,
    optimizedRoute: null,
    postalAddresses: [],
    map: null,
    settings: {
        maxDistance: 100,
        maxTime: 2,
        vehicleType: 'driving-car'
    }
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Initialize map
    initializeMap();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load settings from localStorage if available
    loadSettings();
    
    console.log('Delivery Route Optimizer initialized');
}

function setupEventListeners() {
    // File upload events
    const fileInput = document.getElementById('fileInput');
    const fileUploadArea = document.getElementById('fileUploadArea');
    
    fileUploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    
    // Drag and drop events
    fileUploadArea.addEventListener('dragover', handleDragOver);
    fileUploadArea.addEventListener('dragleave', handleDragLeave);
    fileUploadArea.addEventListener('drop', handleFileDrop);
    
    // Manual entry events
    document.getElementById('newAddress').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addAddress();
        }
    });
    
    document.getElementById('startingAddress').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            validateStartingPoint();
        }
    });
    
    // Settings change events
    document.getElementById('maxDistance').addEventListener('change', updateSettings);
    document.getElementById('maxTime').addEventListener('change', updateSettings);
    document.getElementById('vehicleType').addEventListener('change', updateSettings);
}

function switchTab(tabName, clickedButton) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    // Show selected tab content
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // Add active class to clicked button
    if (clickedButton) {
        clickedButton.classList.add('active');
    } else {
        // Fallback: find the button by tab name
        const targetButton = Array.from(tabButtons).find(btn => 
            btn.textContent.toLowerCase().includes(tabName.toLowerCase())
        );
        if (targetButton) {
            targetButton.classList.add('active');
        }
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('fileUploadArea').classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('fileUploadArea').classList.remove('dragover');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('fileUploadArea').classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
}

async function validateStartingPoint() {
    const address = document.getElementById('startingAddress').value.trim();
    if (!address) {
        alert('Please enter a starting address');
        return;
    }
    
    try {
        const coordinates = await geocodeAddress(address);
        if (coordinates) {
            appState.startingPoint = {
                address: address,
                lat: coordinates.lat,
                lng: coordinates.lng
            };
            
            // Update map center and add starting point marker
            updateMapWithStartingPoint();
            
            // Enable optimize button if we have addresses
            updateOptimizeButton();
            
            alert('Starting point validated successfully!');
        } else {
            alert('Could not validate the starting address. Please check and try again.');
        }
    } catch (error) {
        console.error('Error validating starting point:', error);
        alert('Error validating starting point. Please try again.');
    }
}

async function addAddress() {
    const addressInput = document.getElementById('newAddress');
    const address = addressInput.value.trim();
    
    if (!address) {
        alert('Please enter an address');
        return;
    }
    
    // Check if address already exists
    if (appState.addresses.some(addr => addr.address.toLowerCase() === address.toLowerCase())) {
        alert('This address has already been added');
        return;
    }
    
    // Add address with pending status
    const addressObj = {
        id: Date.now(),
        address: address,
        status: 'pending',
        lat: null,
        lng: null
    };
    
    appState.addresses.push(addressObj);
    updateAddressList();
    addressInput.value = '';
    
    // Validate address in background
    try {
        const coordinates = await geocodeAddress(address);
        if (coordinates) {
            addressObj.lat = coordinates.lat;
            addressObj.lng = coordinates.lng;
            addressObj.status = 'valid';
        } else {
            addressObj.status = 'invalid';
        }
    } catch (error) {
        console.error('Error geocoding address:', error);
        addressObj.status = 'invalid';
    }
    
    updateAddressList();
    updateOptimizeButton();
}

function removeAddress(id) {
    appState.addresses = appState.addresses.filter(addr => addr.id !== id);
    updateAddressList();
    updateOptimizeButton();
    updateMapMarkers();
}

function updateAddressList() {
    const addressesContainer = document.getElementById('addresses');
    
    if (appState.addresses.length === 0) {
        addressesContainer.innerHTML = '<p style="color: #7f8c8d; font-style: italic;">No addresses added yet</p>';
        return;
    }
    
    addressesContainer.innerHTML = appState.addresses.map(addr => `
        <div class="address-item ${addr.status === 'valid' ? 'validated' : addr.status === 'invalid' ? 'error' : ''}">
            <span class="address-text">${addr.address}</span>
            <span class="address-status status-${addr.status}">${addr.status.toUpperCase()}</span>
            <button class="remove-btn" onclick="removeAddress(${addr.id})">Remove</button>
        </div>
    `).join('');
}

function updateOptimizeButton() {
    const optimizeBtn = document.getElementById('optimizeBtn');
    const hasValidAddresses = appState.addresses.some(addr => addr.status === 'valid');
    const hasStartingPoint = appState.startingPoint !== null;
    
    optimizeBtn.disabled = !(hasValidAddresses && hasStartingPoint);
}

function updateSettings() {
    appState.settings.maxDistance = parseFloat(document.getElementById('maxDistance').value);
    appState.settings.maxTime = parseFloat(document.getElementById('maxTime').value);
    appState.settings.vehicleType = document.getElementById('vehicleType').value;
    
    // Save settings to localStorage
    localStorage.setItem('deliveryOptimizerSettings', JSON.stringify(appState.settings));
}

function loadSettings() {
    const savedSettings = localStorage.getItem('deliveryOptimizerSettings');
    if (savedSettings) {
        appState.settings = { ...appState.settings, ...JSON.parse(savedSettings) };
        
        // Update UI
        document.getElementById('maxDistance').value = appState.settings.maxDistance;
        document.getElementById('maxTime').value = appState.settings.maxTime;
        document.getElementById('vehicleType').value = appState.settings.vehicleType;
    }
}

async function optimizeRoute() {
    if (!appState.startingPoint) {
        alert('Please set a starting point first');
        return;
    }
    
    const validAddresses = appState.addresses.filter(addr => addr.status === 'valid');
    if (validAddresses.length === 0) {
        alert('Please add at least one valid address');
        return;
    }
    
    // Show loading overlay
    document.getElementById('loadingOverlay').style.display = 'flex';
    
    try {
        // Optimize the route
        const result = await optimizeDeliveryRoute(appState.startingPoint, validAddresses, appState.settings);
        
        appState.optimizedRoute = result.route;
        appState.postalAddresses = result.postalAddresses;
        
        // Update map with optimized route
        displayOptimizedRoute();
        
        // Show results
        displayResults();
        
        // Show results section
        document.getElementById('resultsSection').style.display = 'block';
        
    } catch (error) {
        console.error('Error optimizing route:', error);
        alert('Error optimizing route. Please try again.');
    } finally {
        // Hide loading overlay
        document.getElementById('loadingOverlay').style.display = 'none';
    }
}

function displayResults() {
    if (!appState.optimizedRoute) return;
    
    const routeSummary = document.getElementById('routeSummary');
    const regularDeliveries = document.getElementById('regularDeliveries');
    const postalDeliveries = document.getElementById('postalDeliveries');
    
    // Route summary
    const totalDistance = appState.optimizedRoute.totalDistance;
    const totalTime = appState.optimizedRoute.totalTime;
    const totalStops = appState.optimizedRoute.addresses.length;
    
    routeSummary.innerHTML = `
        <div class="result-item">
            <span class="result-label">Total Distance:</span>
            <span class="result-value">${(totalDistance / 1000).toFixed(1)} km</span>
        </div>
        <div class="result-item">
            <span class="result-label">Estimated Time:</span>
            <span class="result-value">${Math.round(totalTime / 60)} minutes</span>
        </div>
        <div class="result-item">
            <span class="result-label">Regular Stops:</span>
            <span class="result-value">${totalStops}</span>
        </div>
        <div class="result-item">
            <span class="result-label">Postal Deliveries:</span>
            <span class="result-value">${appState.postalAddresses.length}</span>
        </div>
    `;
    
    // Regular deliveries
    if (appState.optimizedRoute.addresses.length > 0) {
        regularDeliveries.innerHTML = appState.optimizedRoute.addresses.map((addr, index) => `
            <div class="result-item">
                <span class="result-label">Stop ${index + 1}:</span>
                <span class="result-value">${addr.address}</span>
            </div>
        `).join('');
    } else {
        regularDeliveries.innerHTML = '<p style="color: #7f8c8d; font-style: italic;">No regular deliveries</p>';
    }
    
    // Postal deliveries
    if (appState.postalAddresses.length > 0) {
        postalDeliveries.innerHTML = appState.postalAddresses.map(addr => `
            <div class="result-item">
                <span class="result-label">${addr.reason}:</span>
                <span class="result-value">${addr.address}</span>
            </div>
        `).join('');
    } else {
        postalDeliveries.innerHTML = '<p style="color: #7f8c8d; font-style: italic;">No postal deliveries needed</p>';
    }
}

function exportRoute() {
    if (!appState.optimizedRoute) {
        alert('Please optimize a route first');
        return;
    }
    
    const csvContent = generateRouteCSV();
    downloadCSV(csvContent, 'optimized_route.csv');
}

function generateRouteCSV() {
    let csv = 'Stop,Address,Latitude,Longitude,Type\n';
    
    // Add starting point
    csv += `0,${appState.startingPoint.address},${appState.startingPoint.lat},${appState.startingPoint.lng},Starting Point\n`;
    
    // Add regular deliveries
    appState.optimizedRoute.addresses.forEach((addr, index) => {
        csv += `${index + 1},${addr.address},${addr.lat},${addr.lng},Regular Delivery\n`;
    });
    
    // Add postal deliveries
    appState.postalAddresses.forEach((addr, index) => {
        csv += `P${index + 1},${addr.address},${addr.lat},${addr.lng},Postal Delivery\n`;
    });
    
    return csv;
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function printDirections() {
    if (!appState.optimizedRoute) {
        alert('Please optimize a route first');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    const printContent = generatePrintableDirections();
    
    printWindow.document.write(`
        <html>
            <head>
                <title>Delivery Route Directions</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    h1 { color: #2c3e50; }
                    .route-info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                    .stop { margin-bottom: 10px; padding: 10px; border-left: 3px solid #3498db; }
                    .postal { border-left-color: #e74c3c; background: #fadbd8; }
                    @media print { body { margin: 0; } }
                </style>
            </head>
            <body>
                ${printContent}
            </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
}

function generatePrintableDirections() {
    const totalDistance = (appState.optimizedRoute.totalDistance / 1000).toFixed(1);
    const totalTime = Math.round(appState.optimizedRoute.totalTime / 60);
    
    let html = `
        <h1>Delivery Route Directions</h1>
        <div class="route-info">
            <strong>Route Summary:</strong><br>
            Total Distance: ${totalDistance} km<br>
            Estimated Time: ${totalTime} minutes<br>
            Regular Stops: ${appState.optimizedRoute.addresses.length}<br>
            Postal Deliveries: ${appState.postalAddresses.length}
        </div>
        
        <h2>Delivery Route</h2>
        <div class="stop">
            <strong>Starting Point:</strong> ${appState.startingPoint.address}
        </div>
    `;
    
    appState.optimizedRoute.addresses.forEach((addr, index) => {
        html += `
            <div class="stop">
                <strong>Stop ${index + 1}:</strong> ${addr.address}
            </div>
        `;
    });
    
    if (appState.postalAddresses.length > 0) {
        html += '<h2>Postal Deliveries</h2>';
        appState.postalAddresses.forEach(addr => {
            html += `
                <div class="stop postal">
                    <strong>Postal:</strong> ${addr.address}<br>
                    <em>Reason: ${addr.reason}</em>
                </div>
            `;
        });
    }
    
    return html;
}

function clearAll() {
    if (confirm('Are you sure you want to clear all addresses and reset the application?')) {
        appState.addresses = [];
        appState.startingPoint = null;
        appState.optimizedRoute = null;
        appState.postalAddresses = [];
        
        // Clear UI
        document.getElementById('startingAddress').value = '';
        document.getElementById('newAddress').value = '';
        updateAddressList();
        updateOptimizeButton();
        
        // Clear map
        clearMap();
        
        // Hide results
        document.getElementById('resultsSection').style.display = 'none';
        
        // Clear file preview
        document.getElementById('filePreview').style.display = 'none';
        document.getElementById('fileInput').value = '';
    }
}

// Make functions globally available
window.switchTab = switchTab;
window.validateStartingPoint = validateStartingPoint;
window.addAddress = addAddress;
window.removeAddress = removeAddress;
window.optimizeRoute = optimizeRoute;
window.exportRoute = exportRoute;
window.printDirections = printDirections;
window.clearAll = clearAll;
