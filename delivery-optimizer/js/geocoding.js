// Geocoding functionality using Nominatim (OpenStreetMap)
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const GEOCODING_CACHE = new Map();

// Rate limiting for Nominatim API (1 request per second)
let lastGeocodingRequest = 0;
const GEOCODING_DELAY = 1000;

async function geocodeAddress(address) {
    // Check cache first
    const cacheKey = address.toLowerCase().trim();
    if (GEOCODING_CACHE.has(cacheKey)) {
        return GEOCODING_CACHE.get(cacheKey);
    }
    
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastGeocodingRequest;
    if (timeSinceLastRequest < GEOCODING_DELAY) {
        await new Promise(resolve => setTimeout(resolve, GEOCODING_DELAY - timeSinceLastRequest));
    }
    
    try {
        lastGeocodingRequest = Date.now();
        
        const url = `${NOMINATIM_BASE_URL}/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'DeliveryRouteOptimizer/1.0'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Geocoding request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            const result = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                displayName: data[0].display_name,
                boundingBox: data[0].boundingbox
            };
            
            // Cache the result
            GEOCODING_CACHE.set(cacheKey, result);
            
            return result;
        } else {
            // Cache null result to avoid repeated requests
            GEOCODING_CACHE.set(cacheKey, null);
            return null;
        }
        
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

async function reverseGeocode(lat, lng) {
    const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (GEOCODING_CACHE.has(cacheKey)) {
        return GEOCODING_CACHE.get(cacheKey);
    }
    
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastGeocodingRequest;
    if (timeSinceLastRequest < GEOCODING_DELAY) {
        await new Promise(resolve => setTimeout(resolve, GEOCODING_DELAY - timeSinceLastRequest));
    }
    
    try {
        lastGeocodingRequest = Date.now();
        
        const url = `${NOMINATIM_BASE_URL}/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'DeliveryRouteOptimizer/1.0'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Reverse geocoding request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.display_name) {
            const result = {
                address: data.display_name,
                lat: parseFloat(data.lat),
                lng: parseFloat(data.lon)
            };
            
            // Cache the result
            GEOCODING_CACHE.set(cacheKey, result);
            
            return result;
        } else {
            GEOCODING_CACHE.set(cacheKey, null);
            return null;
        }
        
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return null;
    }
}

// Batch geocoding with proper rate limiting
async function geocodeAddressBatch(addresses) {
    const results = [];
    
    for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        console.log(`Geocoding address ${i + 1}/${addresses.length}: ${address}`);
        
        const result = await geocodeAddress(address);
        results.push({
            address: address,
            coordinates: result,
            success: result !== null
        });
        
        // Progress callback could be added here if needed
        if (window.onGeocodingProgress) {
            window.onGeocodingProgress(i + 1, addresses.length);
        }
    }
    
    return results;
}

// Validate if coordinates are within reasonable bounds
function validateCoordinates(lat, lng) {
    return (
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180 &&
        !isNaN(lat) && !isNaN(lng)
    );
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance * 1000; // Return distance in meters
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

// Get approximate bounds for a set of coordinates
function getBounds(coordinates) {
    if (coordinates.length === 0) return null;
    
    let minLat = coordinates[0].lat;
    let maxLat = coordinates[0].lat;
    let minLng = coordinates[0].lng;
    let maxLng = coordinates[0].lng;
    
    coordinates.forEach(coord => {
        minLat = Math.min(minLat, coord.lat);
        maxLat = Math.max(maxLat, coord.lat);
        minLng = Math.min(minLng, coord.lng);
        maxLng = Math.max(maxLng, coord.lng);
    });
    
    return {
        southwest: { lat: minLat, lng: minLng },
        northeast: { lat: maxLat, lng: maxLng }
    };
}

// Clear geocoding cache (useful for testing or memory management)
function clearGeocodingCache() {
    GEOCODING_CACHE.clear();
    console.log('Geocoding cache cleared');
}

// Get cache statistics
function getGeocodingCacheStats() {
    return {
        size: GEOCODING_CACHE.size,
        entries: Array.from(GEOCODING_CACHE.keys())
    };
}

// Export functions for use in other modules
window.geocodeAddress = geocodeAddress;
window.reverseGeocode = reverseGeocode;
window.geocodeAddressBatch = geocodeAddressBatch;
window.validateCoordinates = validateCoordinates;
window.calculateDistance = calculateDistance;
window.getBounds = getBounds;
window.clearGeocodingCache = clearGeocodingCache;
window.getGeocodingCacheStats = getGeocodingCacheStats;
