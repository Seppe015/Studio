// Map management functionality
let mapMarkers = [];
let routeLayer = null;

function initializeMap() {
    // Initialize Leaflet map centered on Europe
    appState.map = L.map('map').setView([50.8503, 4.3517], 10); // Brussels, Belgium as default
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(appState.map);
    
    console.log('Map initialized');
}

function updateMapWithStartingPoint() {
    if (!appState.startingPoint) return;
    
    // Clear existing markers
    clearMapMarkers();
    
    // Center map on starting point
    appState.map.setView([appState.startingPoint.lat, appState.startingPoint.lng], 12);
    
    // Add starting point marker
    const startMarker = L.marker([appState.startingPoint.lat, appState.startingPoint.lng], {
        icon: createCustomIcon('start')
    }).addTo(appState.map);
    
    startMarker.bindPopup(`
        <div class="custom-popup">
            <h4>Starting Point</h4>
            <p>${appState.startingPoint.address}</p>
        </div>
    `);
    
    mapMarkers.push(startMarker);
    
    // Update markers for existing addresses
    updateMapMarkers();
}

function updateMapMarkers() {
    // Clear existing address markers (keep starting point)
    mapMarkers = mapMarkers.filter(marker => {
        if (marker.options.icon.options.className !== 'custom-marker start-marker') {
            appState.map.removeLayer(marker);
            return false;
        }
        return true;
    });
    
    // Add markers for valid addresses
    const validAddresses = appState.addresses.filter(addr => addr.status === 'valid');
    
    validAddresses.forEach((addr, index) => {
        const marker = L.marker([addr.lat, addr.lng], {
            icon: createCustomIcon('delivery')
        }).addTo(appState.map);
        
        marker.bindPopup(`
            <div class="custom-popup">
                <h4>Delivery Address</h4>
                <p>${addr.address}</p>
            </div>
        `);
        
        mapMarkers.push(marker);
    });
    
    // Fit map to show all markers if we have any
    if (mapMarkers.length > 0) {
        const group = new L.featureGroup(mapMarkers);
        appState.map.fitBounds(group.getBounds().pad(0.1));
    }
}

function displayOptimizedRoute() {
    if (!appState.optimizedRoute || !appState.startingPoint) return;
    
    // Clear existing route
    if (routeLayer) {
        appState.map.removeLayer(routeLayer);
    }
    
    // Clear existing markers
    clearMapMarkers();
    
    // Create route coordinates array
    const routeCoords = [
        [appState.startingPoint.lat, appState.startingPoint.lng]
    ];
    
    // Add optimized route coordinates
    appState.optimizedRoute.addresses.forEach(addr => {
        routeCoords.push([addr.lat, addr.lng]);
    });
    
    // Return to starting point
    routeCoords.push([appState.startingPoint.lat, appState.startingPoint.lng]);
    
    // Create route polyline
    routeLayer = L.polyline(routeCoords, {
        color: '#3498db',
        weight: 4,
        opacity: 0.8
    }).addTo(appState.map);
    
    // Add starting point marker
    const startMarker = L.marker([appState.startingPoint.lat, appState.startingPoint.lng], {
        icon: createCustomIcon('start')
    }).addTo(appState.map);
    
    startMarker.bindPopup(`
        <div class="custom-popup">
            <h4>Starting Point</h4>
            <p>${appState.startingPoint.address}</p>
        </div>
    `);
    
    mapMarkers.push(startMarker);
    
    // Add numbered markers for optimized route
    appState.optimizedRoute.addresses.forEach((addr, index) => {
        const marker = L.marker([addr.lat, addr.lng], {
            icon: createNumberedIcon(index + 1)
        }).addTo(appState.map);
        
        marker.bindPopup(`
            <div class="custom-popup">
                <h4>Stop ${index + 1}</h4>
                <p>${addr.address}</p>
            </div>
        `);
        
        mapMarkers.push(marker);
    });
    
    // Add markers for postal addresses (different color)
    appState.postalAddresses.forEach(addr => {
        const marker = L.marker([addr.lat, addr.lng], {
            icon: createCustomIcon('postal')
        }).addTo(appState.map);
        
        marker.bindPopup(`
            <div class="custom-popup">
                <h4>Postal Delivery</h4>
                <p>${addr.address}</p>
                <p><em>${addr.reason}</em></p>
            </div>
        `);
        
        mapMarkers.push(marker);
    });
    
    // Fit map to show the route
    appState.map.fitBounds(routeLayer.getBounds().pad(0.1));
}

function createCustomIcon(type) {
    const iconConfigs = {
        start: {
            html: '🏠',
            className: 'custom-marker start-marker',
            iconSize: [30, 30]
        },
        delivery: {
            html: '📦',
            className: 'custom-marker delivery-marker',
            iconSize: [25, 25]
        },
        postal: {
            html: '📮',
            className: 'custom-marker postal-marker',
            iconSize: [25, 25]
        }
    };
    
    const config = iconConfigs[type] || iconConfigs.delivery;
    
    return L.divIcon({
        html: `<div style="
            background: white;
            border: 2px solid #333;
            border-radius: 50%;
            width: ${config.iconSize[0]}px;
            height: ${config.iconSize[1]}px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        ">${config.html}</div>`,
        className: config.className,
        iconSize: config.iconSize,
        iconAnchor: [config.iconSize[0]/2, config.iconSize[1]/2]
    });
}

function createNumberedIcon(number) {
    return L.divIcon({
        html: `<div style="
            background: #3498db;
            color: white;
            border: 2px solid white;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        ">${number}</div>`,
        className: 'custom-marker numbered-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

function clearMapMarkers() {
    mapMarkers.forEach(marker => {
        appState.map.removeLayer(marker);
    });
    mapMarkers = [];
}

function clearMap() {
    clearMapMarkers();
    
    if (routeLayer) {
        appState.map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    // Reset map view to default
    appState.map.setView([50.8503, 4.3517], 10);
}

// Export functions for use in other modules
window.initializeMap = initializeMap;
window.updateMapWithStartingPoint = updateMapWithStartingPoint;
window.updateMapMarkers = updateMapMarkers;
window.displayOptimizedRoute = displayOptimizedRoute;
window.clearMap = clearMap;
