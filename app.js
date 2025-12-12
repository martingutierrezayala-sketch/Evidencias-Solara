// ======================================================
// 1. CONFIGURACIÓN INICIAL Y GLOBAL
// ======================================================

// URL de tu despliegue de Google Apps Script (Termina en /exec)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzo9rp3DLIavkYPQMOS_A5jBSEVGK4pK_Ba9iajM1UoKb6--yDO8uWvubUUqFm9OwFI/exec'; 

const formElements = {
    form: document.getElementById('upload-form'),
    ciclo: document.getElementById('ciclo'),
    sector: document.getElementById('sector'),
    ruta: document.getElementById('ruta'),
    tecnico: document.getElementById('tecnico'),
    tecnicoNuevo: document.getElementById('tecnicoNuevo'),
    fileInput: document.getElementById('file-input'),
    btnSubir: document.getElementById('btnSubir'),
    statusMessage: document.getElementById('status-message'),
    estadoConexion: document.getElementById('estado-conexion'),
    queueCountDisplay: document.getElementById('queue-count'),
    progressContainer: document.getElementById('progressContainer'),
    progressBar: document.getElementById('progressBar')
};

let appData = {
    ciclos: [],
    sectoresPorCiclo: {},
    rutasPorSector: {},
    tecnicos: []
};
let isOnline = navigator.onLine;

// Configuración de localforage (Base de datos offline)
localforage.config({
    driver: localforage.INDEXEDDB,
    name: 'SolaraPWA',
    version: 1.0,
    storeName: 'photo_queue',
    description: 'Cola de subida de fotos'
});

// ======================================================
// 2. FUNCIONES DE UTILIDAD (UI)
// ======================================================

function showStatus(message, type = 'info', duration = 4000) {
    const { statusMessage } = formElements;
    
    statusMessage.className = 'status-message'; 
    statusMessage.style.display = 'block';

    if (type === 'success') {
        statusMessage.classList.add('status-success');
    } else if (type === 'error') {
        statusMessage.classList.add('status-error');
    } else {
        statusMessage.classList.add('status-info');
    }

    statusMessage.innerHTML = message;
    
    if (duration > 0) {
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, duration);
    }
}

function updateQueueCount(count) {
    formElements.queueCountDisplay.textContent = count;
}

function updateConnectionStatus() {
    isOnline = navigator.onLine;
    const { estadoConexion } = formElements;
    
    estadoConexion.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
    estadoConexion.className = isOnline ? 'online' : 'offline';
    
    if (isOnline) {
        processQueue();
    }
}

// ======================================================
// 3. LÓGICA DE CARGA DE DATOS DESDE GOOGLE APPS SCRIPT
// ======================================================

async function fetchDataFromGAS() {
    showStatus('Conectando a Google Sheets...', 'info', 0);
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getAppData`, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const result = await response.json();

        if (result.status === 'success') {
            appData = result.data;
            console.log('Datos recibidos:', appData);
            populateSelects();
            showStatus('Datos cargados correctamente.', 'success');
        } else {
            throw new Error(result.message || 'Error al obtener datos de la API.');
        }

    } catch (error) {
        console.error('Error al cargar datos iniciales:', error);
        showStatus(`Error crítico al cargar datos: ${error.message}. Verifique la URL de despliegue y los permisos.`, 'error', 0);
    }
}

function populateSelects() {
    const { ciclo, tecnico } = formElements;
    
    populateDropdown(ciclo, appData.ciclos, 'Seleccione un ciclo');
    populateDropdown(tecnico, appData.tecnicos, 'Seleccione un técnico');
    
    let optNuevo = document.createElement("option");
    optNuevo.value = "__NUEVO__";
    optNuevo.textContent = "➕ Agregar técnico nuevo";
    tecnico.appendChild(optNuevo);

    ciclo.addEventListener('change', updateSectors);
    formElements.sector.addEventListener('change', updateRutas);
    tecnico.addEventListener('change', toggleTecnicoNuevo);
}

function populateDropdown(selectElement, dataArray, defaultText) {
    selectElement.innerHTML = '';
    
    let defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = defaultText;
    selectElement.appendChild(defaultOption);

    if (!dataArray || dataArray.length === 0) {
        console.warn(`No hay datos para ${selectElement.id}`);
        selectElement.disabled = true;
        return;
    }

    dataArray.forEach(item => {
        let option = document.createElement('option');
        option.value = item;
        option.textContent = item;
        selectElement.appendChild(option);
    });
    
    selectElement.disabled = false;
}

function updateSectors() {
    const selectedCiclo = formElements.ciclo.value;
    const sectorDropdown = formElements.sector;
    const rutasDropdown = formElements.ruta;

    sectorDropdown.disabled = true;
    rutasDropdown.disabled = true;
    rutasDropdown.innerHTML = `<option value="">Seleccione sector primero</option>`;

    if (selectedCiclo && appData.sectoresPorCiclo[selectedCiclo]) {
        const sectores = appData.sectoresPorCiclo[selectedCiclo];
        populateDropdown(sectorDropdown, sectores, 'Seleccione un sector');
        
        if (sectores.length > 0) {
            sectorDropdown.value = sectores[0];
            updateRutas();
        }
    } else {
        sectorDropdown.innerHTML = `<option value="">Seleccione ciclo primero</option>`;
    }
}

function updateRutas() {
    const selectedSector = formElements.sector.value;
    const rutasDropdown = formElements.ruta;

    rutasDropdown.disabled = true;

    if (selectedSector && appData.rutasPorSector[selectedSector]) {
        const rutas = appData.rutasPorSector[selectedSector];
        populateDropdown(rutasDropdown, rutas, 'Seleccione una ruta');
        
        if (rutas.length > 0) {
            rutasDropdown.value = rutas[0];
        }
    } else {
        rutasDropdown.innerHTML = `<option value="">Seleccione sector primero</option>`;
    }
}

function toggleTecnicoNuevo() {
    const { tecnico, tecnicoNuevo } = formElements;
    tecnicoNuevo.style.display = (tecnico.value === '__NUEVO__') ? 'block' : 'none';
    if (tecnico.value !== '__NUEVO__') {
        tecnicoNuevo.value = '';
    }
}

// ======================================================
// 4. LÓGICA DE SUBIDA DE DATOS Y GESTIÓN DE COLA
// ======================================================

function getFormData() {
    const { ciclo, sector, ruta, tecnico, tecnicoNuevo, fileInput } = formElements;

    let selectedTecnico;
    if (tecnico.value === '__NUEVO__') {
        selectedTecnico = tecnicoNuevo.value.trim();
    } else {
        selectedTecnico = tecnico.value;
    }

    if (!ciclo.value || !sector.value || !ruta.value || !selectedTecnico || fileInput.files.length === 0) {
        showStatus('Por favor, complete todos los campos requeridos y seleccione al menos una foto.', 'error');
        return null;
    }
    
    const filesArray = Array.from(fileInput.files);
    
    if (filesArray.length > 100) {
        showStatus(`Máximo 100 fotos por vez. Seleccionó ${filesArray.length}.`, "error");
        return null;
    }

    return {
        ciclo: ciclo.value,
        sector: sector.value,
        ruta: ruta.value,
        tecnico: selectedTecnico,
        files: filesArray
    };
}

async function handleFormSubmit(event) {
    event.preventDefault();
    
    const selectionsToRetain = {
        ciclo: formElements.ciclo.value,
        sector: formElements.sector.value,
        ruta: formElements.ruta.value,
        tecnicoSelected: formElements.tecnico.value
    };
    
    const formData = getFormData();
    if (!formData) {
        formElements.btnSubir.textContent = "Subir Foto"; 
        formElements.btnSubir.disabled = false;
        return;
    }

    const totalFiles = formData.files.length;
    let filesProcessedCount = 0;
    
    formElements.btnSubir.disabled = true; 
    formElements.progressContainer.style.display = 'block';
    formElements.progressBar.style.width = "0%";
    formElements.progressBar.textContent = `0/${totalFiles}`;

    function updateProgress(uploaded, total) {
        const percent = Math.round((uploaded / total) * 100);
        
        formElements.progressBar.style.width = percent + "%";
        formElements.progressBar.textContent = `${uploaded}/${total}`;
        
        if (uploaded === total) {
             formElements.btnSubir.textContent = `¡Subida Completa! ${total} fotos.`; 
        } else {
             formElements.btnSubir.textContent = `Subiendo ${uploaded} de ${total}...`; 
        }
    }

    for (const file of formData.files) {
        
        const photoData = await readFileAsBase64(file);

        const dataToSave = {
            ciclo: formData.ciclo,
            sector: formData.sector,
            ruta: formData.ruta,
            tecnico: formData.tecnico,
            nombre: file.name,
            contenido: photoData
        };

        let success = false;
        if (isOnline) {
            success = await uploadPhoto(dataToSave);
            if (!success) {
                await saveToQueue(dataToSave);
            }
        } else {
            await saveToQueue(dataToSave);
        }
        
        filesProcessedCount++;
        updateProgress(filesProcessedCount, totalFiles);
    }
    
    formElements.fileInput.value = ''; 
    
    if (selectionsToRetain.tecnicoSelected === '__NUEVO__') {
        formElements.tecnicoNuevo.value = '';
        formElements.tecnicoNuevo.style.display = 'none';
        formElements.tecnico.value = '';
    }
    
    formElements.ciclo.value = selectionsToRetain.ciclo;
    formElements.sector.value = selectionsToRetain.sector;
    formElements.ruta.value = selectionsToRetain.ruta;
    
    if (selectionsToRetain.tecnicoSelected !== '__NUEVO__') {
        formElements.tecnico.value = selectionsToRetain.tecnicoSelected;
    }
    
    formElements.btnSubir.disabled = false; 
    formElements.btnSubir.textContent = "Subir Foto";
    
    setTimeout(() => {
        formElements.progressContainer.style.display = 'none';
    }, 1000);
    
    const queueCount = await localforage.length();
    
    if (queueCount > 0) {
        showStatus(`💾 OFFLINE: ${queueCount} foto(s) guardadas en cola local. Se sincronizarán al recuperar conexión.`, 'info', 0); 
    } else {
        showStatus(`✅ Éxito: ${totalFiles} foto(s) subidas correctamente.`, 'success', 8000); 
    }
    
    updateQueueCount(queueCount);
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// ======================================================
// 5. GESTIÓN DE COLA OFFLINE (localforage)
// ======================================================

async function saveToQueue(data) {
    const uniqueKey = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await localforage.setItem(uniqueKey, data);
    updateQueueCount(await localforage.length());
}

async function processQueue() {
    if (!isOnline) {
        return;
    }
    
    const keys = await localforage.keys();
    if (keys.length === 0) {
        return;
    }

    showStatus(`🔄 Intentando sincronizar ${keys.length} elemento(s) pendientes...`, 'info', 0);
    
    let processedCount = 0;
    let failedCount = 0;

    formElements.progressContainer.style.display = 'block';
    
    for (const key of keys) {
        const item = await localforage.getItem(key);
        const success = await uploadPhoto(item); 
        
        if (success) {
            await localforage.removeItem(key);
            processedCount++;
        } else {
            failedCount++;
        }
        
        const totalKeys = keys.length;
        const uploaded = processedCount + failedCount;
        const percent = Math.round((uploaded / totalKeys) * 100);
        formElements.progressBar.style.width = percent + "%";
        formElements.progressBar.textContent = `Sincronizando: ${uploaded}/${totalKeys}`;
    }

    setTimeout(() => {
        formElements.progressContainer.style.display = 'none';
    }, 1000);
    
    const remaining = await localforage.length();
    updateQueueCount(remaining);
    
    if (remaining === 0) {
        showStatus(`✅ Sincronización completa. ${processedCount} fotos subidas.`, 'success');
    } else {
        showStatus(`⚠️ Sincronización parcial. ${processedCount} subidas, ${failedCount} fallaron. Restan ${remaining} en cola.`, 'error', 0);
    }
}

// ======================================================
// 6. FUNCIÓN DE SUBIDA (fetch)
// ======================================================

async function uploadPhoto(data) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const result = await response.json();

        if (result.status === 'success') {
            return true;
        } else {
            throw new Error(result.message || 'Fallo en la API de Google.');
        }

    } catch (error) {
        console.error('Error durante la subida:', error);
        return false;
    }
}

// ======================================================
// 7. INICIALIZACIÓN Y EVENT LISTENERS
// ======================================================

document.addEventListener('DOMContentLoaded', () => {
    fetchDataFromGAS();

    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);

    localforage.length().then(count => updateQueueCount(count));
    
    formElements.form.addEventListener('submit', handleFormSubmit);
});