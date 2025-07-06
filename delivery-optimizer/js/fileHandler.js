// File handling functionality for CSV and Excel files
async function processFile(file) {
    console.log('Processing file:', file.name);
    
    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    try {
        let addresses = [];
        
        if (fileExtension === 'csv') {
            addresses = await processCSVFile(file);
        } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            addresses = await processExcelFile(file);
        } else {
            throw new Error('Unsupported file format. Please use CSV or Excel files.');
        }
        
        if (addresses.length === 0) {
            throw new Error('No addresses found in the file.');
        }
        
        // Show file preview
        showFilePreview(addresses, file.name);
        
        // Process addresses
        await processAddressesFromFile(addresses);
        
    } catch (error) {
        console.error('Error processing file:', error);
        alert(`Error processing file: ${error.message}`);
    }
}

async function processCSVFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                try {
                    const addresses = extractAddressesFromData(results.data);
                    resolve(addresses);
                } catch (error) {
                    reject(error);
                }
            },
            error: function(error) {
                reject(new Error(`CSV parsing error: ${error.message}`));
            }
        });
    });
}

async function processExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Get the first worksheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert to JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                // Convert to objects with headers
                if (jsonData.length < 2) {
                    throw new Error('Excel file must have at least a header row and one data row.');
                }
                
                const headers = jsonData[0];
                const dataRows = jsonData.slice(1);
                
                const objectData = dataRows.map(row => {
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header] = row[index] || '';
                    });
                    return obj;
                });
                
                const addresses = extractAddressesFromData(objectData);
                resolve(addresses);
                
            } catch (error) {
                reject(new Error(`Excel processing error: ${error.message}`));
            }
        };
        
        reader.onerror = function() {
            reject(new Error('Error reading Excel file'));
        };
        
        reader.readAsArrayBuffer(file);
    });
}

function extractAddressesFromData(data) {
    const addresses = [];
    const possibleAddressFields = [
        'address', 'Address', 'ADDRESS',
        'street', 'Street', 'STREET',
        'location', 'Location', 'LOCATION',
        'destination', 'Destination', 'DESTINATION',
        'full_address', 'Full Address', 'FULL_ADDRESS'
    ];
    
    // Find the address field
    let addressField = null;
    const firstRow = data[0] || {};
    
    for (const field of possibleAddressFields) {
        if (firstRow.hasOwnProperty(field)) {
            addressField = field;
            break;
        }
    }
    
    if (!addressField) {
        // If no standard address field found, look for any field that might contain addresses
        const fields = Object.keys(firstRow);
        if (fields.length > 0) {
            // Use the first field as address field
            addressField = fields[0];
            console.warn(`No standard address field found. Using '${addressField}' as address field.`);
        } else {
            throw new Error('No address field found in the file. Please ensure your file has an "Address" column.');
        }
    }
    
    // Extract addresses
    data.forEach((row, index) => {
        const address = row[addressField];
        if (address && typeof address === 'string' && address.trim()) {
            addresses.push({
                address: address.trim(),
                rowNumber: index + 1,
                originalData: row
            });
        }
    });
    
    if (addresses.length === 0) {
        throw new Error(`No valid addresses found in the '${addressField}' field.`);
    }
    
    return addresses;
}

function showFilePreview(addresses, filename) {
    const previewDiv = document.getElementById('filePreview');
    const previewContent = document.getElementById('previewContent');
    
    const maxPreviewItems = 10;
    const previewAddresses = addresses.slice(0, maxPreviewItems);
    
    let html = `
        <div style="margin-bottom: 15px;">
            <strong>File:</strong> ${filename}<br>
            <strong>Total addresses found:</strong> ${addresses.length}
        </div>
        <div style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 5px;">
    `;
    
    previewAddresses.forEach((addr, index) => {
        html += `
            <div style="padding: 8px; border-bottom: 1px solid #eee; ${index % 2 === 0 ? 'background: #f9f9f9;' : ''}">
                <strong>${index + 1}.</strong> ${addr.address}
            </div>
        `;
    });
    
    if (addresses.length > maxPreviewItems) {
        html += `
            <div style="padding: 8px; text-align: center; color: #7f8c8d; font-style: italic;">
                ... and ${addresses.length - maxPreviewItems} more addresses
            </div>
        `;
    }
    
    html += '</div>';
    
    previewContent.innerHTML = html;
    previewDiv.style.display = 'block';
}

async function processAddressesFromFile(fileAddresses) {
    // Clear existing addresses
    appState.addresses = [];
    updateAddressList();
    
    // Add addresses from file
    for (const fileAddr of fileAddresses) {
        const addressObj = {
            id: Date.now() + Math.random(), // Ensure unique IDs
            address: fileAddr.address,
            status: 'pending',
            lat: null,
            lng: null,
            originalData: fileAddr.originalData
        };
        
        appState.addresses.push(addressObj);
    }
    
    // Update UI
    updateAddressList();
    
    // Switch to manual entry tab to show the addresses
    switchTab('manual');
    
    // Geocode addresses in batches
    await geocodeFileAddresses();
}

async function geocodeFileAddresses() {
    const pendingAddresses = appState.addresses.filter(addr => addr.status === 'pending');
    
    if (pendingAddresses.length === 0) return;
    
    console.log(`Starting geocoding of ${pendingAddresses.length} addresses...`);
    
    // Show progress (could be enhanced with a progress bar)
    let processed = 0;
    
    for (const address of pendingAddresses) {
        try {
            const coordinates = await geocodeAddress(address.address);
            
            if (coordinates) {
                address.lat = coordinates.lat;
                address.lng = coordinates.lng;
                address.status = 'valid';
            } else {
                address.status = 'invalid';
            }
            
            processed++;
            console.log(`Geocoded ${processed}/${pendingAddresses.length}: ${address.address} - ${address.status}`);
            
            // Update UI periodically
            if (processed % 5 === 0 || processed === pendingAddresses.length) {
                updateAddressList();
                updateOptimizeButton();
            }
            
        } catch (error) {
            console.error(`Error geocoding ${address.address}:`, error);
            address.status = 'invalid';
        }
    }
    
    // Final UI update
    updateAddressList();
    updateOptimizeButton();
    updateMapMarkers();
    
    const validCount = appState.addresses.filter(addr => addr.status === 'valid').length;
    const invalidCount = appState.addresses.filter(addr => addr.status === 'invalid').length;
    
    alert(`Geocoding complete!\nValid addresses: ${validCount}\nInvalid addresses: ${invalidCount}`);
}

// Generate sample CSV for download
function generateSampleCSV() {
    const sampleData = [
        'Address',
        '123 Main Street, New York, NY 10001',
        '456 Oak Avenue, Los Angeles, CA 90210',
        '789 Pine Road, Chicago, IL 60601',
        '321 Elm Street, Houston, TX 77001',
        '654 Maple Drive, Phoenix, AZ 85001'
    ];
    
    const csvContent = sampleData.join('\n');
    downloadCSV(csvContent, 'sample_addresses.csv');
}

// Validate file before processing
function validateFile(file) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const allowedExtensions = ['csv', 'xls', 'xlsx'];
    
    // Check file size
    if (file.size > maxSize) {
        throw new Error('File size too large. Maximum size is 10MB.');
    }
    
    // Check file extension
    const extension = file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(extension)) {
        throw new Error('Invalid file type. Please use CSV or Excel files.');
    }
    
    return true;
}

// Export functions for use in other modules
window.processFile = processFile;
window.generateSampleCSV = generateSampleCSV;
window.validateFile = validateFile;
