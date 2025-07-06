// Route optimization functionality
const OPENROUTESERVICE_BASE_URL = 'https://api.openrouteservice.org/v2';
const OPENROUTESERVICE_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImJjOWQ4ZTU2NTAzYTRlNDRhMTk5NzU5ZjBiMDJhZGZiIiwiaCI6Im11cm11cjY0In0=';  // Provided by user
const DISTANCE_MATRIX_CACHE = new Map();

// Rate limiting for OpenRouteService API
let lastRoutingRequest = 0;
const ROUTING_DELAY = 500; // 500ms between requests

async function optimizeDeliveryRoute(startingPoint, addresses, settings) {
    console.log('Starting route optimization...');
    
    if (!startingPoint || addresses.length === 0) {
        throw new Error('Starting point and addresses are required');
    }
    
    // Filter out addresses that are too far from starting point
    const { regularAddresses, postalAddresses } = await filterAddressesByDistance(
        startingPoint, 
        addresses, 
        settings
    );
    
    if (regularAddresses.length === 0) {
        return {
            route: {
                addresses: [],
                totalDistance: 0,
                totalTime: 0
            },
            postalAddresses: postalAddresses
        };
    }
    
    // Get distance matrix for regular addresses
    const distanceMatrix = await getDistanceMatrix(startingPoint, regularAddresses, settings.vehicleType);
    
    // Optimize route using nearest neighbor with 2-opt improvement
    const optimizedOrder = optimizeWithNearestNeighborAnd2Opt(distanceMatrix);
    
    // Build final route
    const optimizedAddresses = optimizedOrder.map(index => regularAddresses[index]);
    const routeStats = calculateRouteStats(distanceMatrix, optimizedOrder);
    
    return {
        route: {
            addresses: optimizedAddresses,
            totalDistance: routeStats.totalDistance,
            totalTime: routeStats.totalTime
        },
        postalAddresses: postalAddresses
    };
}

async function filterAddressesByDistance(startingPoint, addresses, settings) {
    const regularAddresses = [];
    const postalAddresses = [];
    
    for (const address of addresses) {
        // Calculate straight-line distance first (quick filter)
        const straightLineDistance = calculateDistance(
            startingPoint.lat, startingPoint.lng,
            address.lat, address.lng
        );
        
        if (straightLineDistance > settings.maxDistance * 1000) {
            postalAddresses.push({
                ...address,
                reason: `Too far (${(straightLineDistance / 1000).toFixed(1)} km)`
            });
        } else {
            regularAddresses.push(address);
        }
    }
    
    // For remaining addresses, check if they add too much time to the route
    if (regularAddresses.length > 1 && settings.maxTime > 0) {
        const timeFilteredAddresses = [];
        
        for (const address of regularAddresses) {
            // Estimate additional time by calculating detour
            const directDistance = calculateDistance(
                startingPoint.lat, startingPoint.lng,
                startingPoint.lat, startingPoint.lng
            ); // This would be 0, but we need the round trip
            
            const detourDistance = calculateDistance(
                startingPoint.lat, startingPoint.lng,
                address.lat, address.lng
            ) * 2; // Round trip
            
            const additionalTime = (detourDistance / 1000) / 50; // Assume 50 km/h average speed
            
            if (additionalTime > settings.maxTime) {
                postalAddresses.push({
                    ...address,
                    reason: `Adds too much time (${additionalTime.toFixed(1)} hours)`
                });
            } else {
                timeFilteredAddresses.push(address);
            }
        }
        
        return { regularAddresses: timeFilteredAddresses, postalAddresses };
    }
    
    return { regularAddresses, postalAddresses };
}

async function getDistanceMatrix(startingPoint, addresses, vehicleType = 'driving-car') {
    const allPoints = [startingPoint, ...addresses];
    const cacheKey = generateMatrixCacheKey(allPoints, vehicleType);
    
    if (DISTANCE_MATRIX_CACHE.has(cacheKey)) {
        console.log('Using cached distance matrix');
        return DISTANCE_MATRIX_CACHE.get(cacheKey);
    }
    
    // For small numbers of addresses, use simple distance calculation
    // For larger numbers, we would use OpenRouteService API
    // Removed simple distance path; using OpenRouteService for all sizes

    
    // Routing above replaced with ORS.
    DISTANCE_MATRIX_CACHE.set(cacheKey, matrix);
    return matrix;
}

function calculateSimpleDistanceMatrix(points) {
    const matrix = {
        distances: [],
        durations: []
    };
    
    for (let i = 0; i < points.length; i++) {
        matrix.distances[i] = [];
        matrix.durations[i] = [];
        
        for (let j = 0; j < points.length; j++) {
            if (i === j) {
                matrix.distances[i][j] = 0;
                matrix.durations[i][j] = 0;
            } else {
                const distance = calculateDistance(
                    points[i].lat, points[i].lng,
                    points[j].lat, points[j].lng
                );
                
                matrix.distances[i][j] = distance;
                // Estimate duration: assume average speed of 40 km/h in urban areas
                matrix.durations[i][j] = (distance / 1000) / 40 * 3600; // seconds
            }
        }
    }
    
    return matrix;
}

function optimizeWithNearestNeighborAnd2Opt(distanceMatrix) {
    const n = distanceMatrix.distances.length - 1; // Exclude starting point from optimization
    
    if (n <= 1) {
        return Array.from({ length: n }, (_, i) => i + 1);
    }
    
    // Nearest neighbor starting from depot (index 0)
    let route = nearestNeighborTSP(distanceMatrix);
    
    // Apply 2-opt improvement
    route = twoOptImprovement(route, distanceMatrix);
    
    return route;
}

function nearestNeighborTSP(distanceMatrix) {
    const n = distanceMatrix.distances.length - 1; // Number of delivery addresses
    const unvisited = new Set(Array.from({ length: n }, (_, i) => i + 1)); // Indices 1 to n
    const route = [];
    let current = 0; // Start from depot
    
    while (unvisited.size > 0) {
        let nearest = null;
        let nearestDistance = Infinity;
        
        for (const next of unvisited) {
            const distance = distanceMatrix.distances[current][next];
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = next;
            }
        }
        
        route.push(nearest);
        unvisited.delete(nearest);
        current = nearest;
    }
    
    return route.map(index => index - 1); // Convert back to 0-based indexing for addresses array
}

function twoOptImprovement(route, distanceMatrix) {
    if (route.length < 4) return route;
    
    let improved = true;
    let bestRoute = [...route];
    
    while (improved) {
        improved = false;
        
        for (let i = 0; i < route.length - 2; i++) {
            for (let j = i + 2; j < route.length; j++) {
                const newRoute = twoOptSwap(bestRoute, i, j);
                
                if (calculateRouteCost(newRoute, distanceMatrix) < calculateRouteCost(bestRoute, distanceMatrix)) {
                    bestRoute = newRoute;
                    improved = true;
                }
            }
        }
    }
    
    return bestRoute;
}

function twoOptSwap(route, i, j) {
    const newRoute = [...route];
    
    // Reverse the segment between i+1 and j
    while (i + 1 < j) {
        [newRoute[i + 1], newRoute[j]] = [newRoute[j], newRoute[i + 1]];
        i++;
        j--;
    }
    
    return newRoute;
}

function calculateRouteCost(route, distanceMatrix) {
    let totalCost = 0;
    let current = 0; // Start from depot
    
    for (const next of route) {
        totalCost += distanceMatrix.distances[current][next + 1]; // +1 because route indices are for addresses array
        current = next + 1;
    }
    
    // Return to depot
    totalCost += distanceMatrix.distances[current][0];
    
    return totalCost;
}

function calculateRouteStats(distanceMatrix, route) {
    let totalDistance = 0;
    let totalTime = 0;
    let current = 0; // Start from depot
    
    for (const next of route) {
        const addressIndex = next + 1; // +1 because route indices are for addresses array
        totalDistance += distanceMatrix.distances[current][addressIndex];
        totalTime += distanceMatrix.durations[current][addressIndex];
        current = addressIndex;
    }
    
    // Return to depot
    totalDistance += distanceMatrix.distances[current][0];
    totalTime += distanceMatrix.durations[current][0];
    
    return { totalDistance, totalTime };
}

function generateMatrixCacheKey(points, vehicleType) {
    const coordinates = points.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');
    return `${vehicleType}:${coordinates}`;
}

// Alternative optimization algorithms for different scenarios
function optimizeWithGeneticAlgorithm(distanceMatrix, populationSize = 50, generations = 100) {
    // Simplified genetic algorithm implementation
    const n = distanceMatrix.distances.length - 1;
    
    if (n <= 3) {
        return Array.from({ length: n }, (_, i) => i);
    }
    
    // Initialize population
    let population = [];
    for (let i = 0; i < populationSize; i++) {
        const individual = Array.from({ length: n }, (_, i) => i);
        shuffleArray(individual);
        population.push(individual);
    }
    
    // Evolution
    for (let gen = 0; gen < generations; gen++) {
        // Evaluate fitness
        const fitness = population.map(individual => 1 / (1 + calculateRouteCost(individual, distanceMatrix)));
        
        // Selection and crossover
        const newPopulation = [];
        for (let i = 0; i < populationSize; i++) {
            const parent1 = tournamentSelection(population, fitness);
            const parent2 = tournamentSelection(population, fitness);
            const child = orderCrossover(parent1, parent2);
            
            // Mutation
            if (Math.random() < 0.1) {
                mutateSwap(child);
            }
            
            newPopulation.push(child);
        }
        
        population = newPopulation;
    }
    
    // Return best individual
    const fitness = population.map(individual => calculateRouteCost(individual, distanceMatrix));
    const bestIndex = fitness.indexOf(Math.min(...fitness));
    return population[bestIndex];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function tournamentSelection(population, fitness, tournamentSize = 3) {
    let best = Math.floor(Math.random() * population.length);
    
    for (let i = 1; i < tournamentSize; i++) {
        const competitor = Math.floor(Math.random() * population.length);
        if (fitness[competitor] > fitness[best]) {
            best = competitor;
        }
    }
    
    return population[best];
}

function orderCrossover(parent1, parent2) {
    const n = parent1.length;
    const start = Math.floor(Math.random() * n);
    const end = Math.floor(Math.random() * (n - start)) + start;
    
    const child = new Array(n).fill(-1);
    
    // Copy segment from parent1
    for (let i = start; i <= end; i++) {
        child[i] = parent1[i];
    }
    
    // Fill remaining positions from parent2
    let childIndex = 0;
    for (let i = 0; i < n; i++) {
        if (childIndex === start) {
            childIndex = end + 1;
        }
        
        if (childIndex >= n) break;
        
        if (!child.includes(parent2[i])) {
            child[childIndex] = parent2[i];
            childIndex++;
        }
    }
    
    return child;
}

function mutateSwap(individual) {
    const i = Math.floor(Math.random() * individual.length);
    const j = Math.floor(Math.random() * individual.length);
    [individual[i], individual[j]] = [individual[j], individual[i]];
}

// Clear optimization cache
function clearOptimizationCache() {
    DISTANCE_MATRIX_CACHE.clear();
    console.log('Optimization cache cleared');
}

// Export functions for use in other modules
window.optimizeDeliveryRoute = optimizeDeliveryRoute;
window.clearOptimizationCache = clearOptimizationCache;

/**
 * Fetch distance and duration matrix from OpenRouteService.
 * Falls back to simple Haversine matrix if API fails.
 */
async function fetchORSMatrix(points, vehicleType = 'driving-car') {
    const cacheKey = generateMatrixCacheKey(points, vehicleType);
    if (DISTANCE_MATRIX_CACHE.has(cacheKey)) {
        console.log('Using cached matrix');
        return DISTANCE_MATRIX_CACHE.get(cacheKey);
    }

    const now = Date.now();
    const elapsed = now - lastRoutingRequest;
    if (elapsed < ROUTING_DELAY) {
        await new Promise(r => setTimeout(r, ROUTING_DELAY - elapsed));
    }

    const locations = points.map(pt => [pt.lng, pt.lat]);

    try {
        lastRoutingRequest = Date.now();
        const response = await fetch(`${OPENROUTESERVICE_BASE_URL}/matrix/${vehicleType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': OPENROUTESERVICE_API_KEY
            },
            body: JSON.stringify({
                locations: locations,
                metrics: ['distance', 'duration'],
                units: 'km'
            })
        });

        if (!response.ok) {
            throw new Error(`OpenRouteService error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const matrix = {
            distances: data.distances,
            durations: data.durations
        };
        DISTANCE_MATRIX_CACHE.set(cacheKey, matrix);
        return matrix;
    } catch (err) {
        console.error('OpenRouteService matrix request failed:', err);
        // Fallback
        const fallback = calculateSimpleDistanceMatrix(points);
        DISTANCE_MATRIX_CACHE.set(cacheKey, fallback);
        return fallback;
    }
}

// Overwrite original getDistanceMatrix to delegate to ORS
async function getDistanceMatrix(startingPoint, addresses, vehicleType = 'driving-car') {
    const allPoints = [startingPoint, ...addresses];
    return fetchORSMatrix(allPoints, vehicleType);
}
