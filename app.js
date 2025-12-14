// ======================================================
// 1. CONFIGURACIÓN INICIAL Y GLOBAL
// ======================================================

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzo9rp3DLIavkYPQMOS_A5jBSEVGK4pK_Ba9iajM1UoKb6--yDO8uWvubUUqFm9OwFI/exec'; 

const formElements = {
    form: document.getElementById('upload-form'),
    ciclo: document.getElementById('ciclo'),
    sector: document.getElementById('sector'),
    ruta: document.getElementById('ruta'),
    tecnico: document.getElementById('tecnico'),
    tecnicoNuevo: document.getElementById('tecnicoNuevo'),
    fileInput: document.getElementById('file-input'),
    fileInputCamera: document.getElementById('file-input-camera'),
    btnTomarFoto: document.getElementById('btnTomarFoto'),
    btnGaleria: document.getElementById('btnGaleria'),
    btnSubir: document.getElementById('btnSubir'),
    statusMessage: document.getElementById('status-message'),
    estadoConexion: document.getElementById('estado-conexion'),
    queueCountDisplay: document.getElementById('queue-count'),
    progressContainer: document.getElementById('progressContainer'),
    progressBar: document.getElementById('progressBar'),
    fileInfo: document.getElementById('file-info')
};

let appData = {
    ciclos: [],
    sectoresPorCiclo: {},
    rutasPorSector: {},
    tecnicos: []
};
let isOnline = navigator.onLine;

localforage.config({
    driver: localforage.INDEXEDDB,
    name: 'SolaraPWA',
    version: 1.0,
    storeName: 'photo_queue',
    description: 'Cola de subida de fotos'
});

// ======================================================
// 2. FUNCIONES DE COMPRESIÓN DE IMÁGENES
// ======================================================

async function compressImage(file) {
    const MAX_SIZE_KB = 300;
    const fileSizeKB = file.size / 1024;
    
    // Si ya es menor a 300 KB, no comprimir
    if (fileSizeKB <= MAX_SIZE_KB) {
        console.log(`${file.name}: ${fileSizeKB.toFixed(0)} KB - No requiere compresión`);
        return file;
    }
    
    console.log(`${file.name}: ${fileSizeKB.toFixed(0)} KB - Comprimiendo...`);
    
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Reducir dimensiones si es muy grande
                const MAX_WIDTH = 1920;
                const MAX_HEIGHT = 1920;
                
                if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                    if (width > height) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    } else {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Calcular calidad necesaria para llegar a ~300 KB
                let quality = 0.7;
                if (fileSizeKB > 2000) quality = 0.5;
                else if (fileSizeKB > 1000) quality = 0.6;
                
                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    
                    const newSizeKB = compressedFile.size / 1024;
                    console.log(`${file.name}: Comprimido a ${newSizeKB.toFixed(0)} KB (${((1 - newSizeKB/fileSizeKB) * 100).toFixed(0)}% reducción)`);
                    
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ======================================================
// 3. FUNCIONES DE UTILIDAD (UI)
// ======================================================

function showStatus(message, type = 'info', duration = 4000) {
    const { statusMessage } = formElements;
    statusMessage.className = 'status-message'; 
    statusMessage.style.display = 'block';
    if (type === 'success') statusMessage.classList.add('status-success');
    else if (type === 'error') statusMessage.classList.add('status-error');
    else statusMessage.classList.add('status-info');
    statusMessage.innerHTML = message;
    if (duration > 0) setTimeout(() => statusMessage.style.display = 'none', duration);
}

function updateQueueCount(count) {
    formElements.queueCountDisplay.textContent = count;
}

function updateConnectionStatus() {
    isOnline = navigator.onLine;
    const { estadoConexion } = formElements;
    estadoConexion.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
    estadoConexion.className = isOnline ? 'online' : 'offline';
    if (isOnline) processQueue();
}

function updateFileInfo() {
    const files = formElements.fileInput.files;
    if (files.length > 0) {
        let totalSize = 0;
        for (let file of files) {
            totalSize += file.size;
        }
        const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
        formElements.fileInfo.textContent = `${files.length} foto(s) seleccionadas - ~${totalMB} MB`;
        formElements.fileInfo.style.display = 'block';
    } else {
        formElements.fileInfo.style.display = 'none';
    }
}

// ======================================================
// 4. LÓGICA DE CARGA DE DATOS
// ======================================================

async function fetchDataFromGAS() {
    showStatus('Conectando a Google Sheets...', 'info', 0);
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getAppData`, { method: 'GET' });
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        const result = await response.json();
        if (result.status === 'success') {
            appData = result.data;
            populateSelects();
            showStatus('Datos cargados correctamente.', 'success');
        } else throw new Error(result.message || 'Error al obtener datos.');
    } catch (error) {
        console.error('Error:', error);
        showStatus(`Error: ${error.message}`, 'error', 0);
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
    
    // RESTAURAR selecciones guardadas
    restoreSelections();
    
    ciclo.addEventListener('change', () => {
        updateSectors();
        saveSelections();
    });
    formElements.sector.addEventListener('change', () => {
        updateRutas();
        saveSelections();
    });
    formElements.ruta.addEventListener('change', saveSelections);
    tecnico.addEventListener('change', () => {
        toggleTecnicoNuevo();
        saveSelections();
    });
}

// GUARDAR selecciones en localStorage
function saveSelections() {
    const selections = {
        ciclo: formElements.ciclo.value,
        sector: formElements.sector.value,
        ruta: formElements.ruta.value,
        tecnico: formElements.tecnico.value
    };
    localStorage.setItem('evidencias_selections', JSON.stringify(selections));
    console.log('💾 Selecciones guardadas:', selections);
}

// RESTAURAR selecciones desde localStorage
function restoreSelections() {
    try {
        const saved = localStorage.getItem('evidencias_selections');
        if (saved) {
            const selections = JSON.parse(saved);
            console.log('📂 Restaurando selecciones:', selections);
            
            // Restaurar en orden: ciclo → sector → ruta → técnico
            if (selections.ciclo) {
                formElements.ciclo.value = selections.ciclo;
                updateSectors(); // Esto carga los sectores
                
                setTimeout(() => {
                    if (selections.sector) {
                        formElements.sector.value = selections.sector;
                        updateRutas(); // Esto carga las rutas
                        
                        setTimeout(() => {
                            if (selections.ruta) {
                                formElements.ruta.value = selections.ruta;
                            }
                            if (selections.tecnico) {
                                formElements.tecnico.value = selections.tecnico;
                                toggleTecnicoNuevo();
                            }
                        }, 100);
                    }
                }, 100);
            }
        }
    } catch (error) {
        console.error('Error restaurando selecciones:', error);
    }
}

function populateDropdown(selectElement, dataArray, defaultText) {
    selectElement.innerHTML = '';
    let defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = defaultText;
    selectElement.appendChild(defaultOption);
    if (!dataArray || dataArray.length === 0) {
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
        if (rutas.length > 0) rutasDropdown.value = rutas[0];
    } else {
        rutasDropdown.innerHTML = `<option value="">Seleccione sector primero</option>`;
    }
}

function toggleTecnicoNuevo() {
    const { tecnico, tecnicoNuevo } = formElements;
    tecnicoNuevo.style.display = (tecnico.value === '__NUEVO__') ? 'block' : 'none';
    if (tecnico.value !== '__NUEVO__') tecnicoNuevo.value = '';
}

// ======================================================
// 5. LÓGICA DE SUBIDA
// ======================================================

function getFormData() {
    const { ciclo, sector, ruta, tecnico, tecnicoNuevo, fileInput } = formElements;
    let selectedTecnico = tecnico.value === '__NUEVO__' ? tecnicoNuevo.value.trim() : tecnico.value;
    if (!ciclo.value || !sector.value || !ruta.value || !selectedTecnico || fileInput.files.length === 0) {
        showStatus('Complete todos los campos y seleccione fotos.', 'error');
        return null;
    }
    const filesArray = Array.from(fileInput.files);
    if (filesArray.length > 100) {
        showStatus(`Máximo 100 fotos. Seleccionó ${filesArray.length}.`, "error");
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
             formElements.btnSubir.textContent = `¡Completo!`; 
        } else {
             formElements.btnSubir.textContent = `Subiendo ${uploaded}/${total}...`; 
        }
    }

    for (const file of formData.files) {
        // Comprimir imagen si es necesario
        const compressedFile = await compressImage(file);
        const photoData = await readFileAsBase64(compressedFile);

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
            if (!success) await saveToQueue(dataToSave);
        } else {
            await saveToQueue(dataToSave);
        }
        
        filesProcessedCount++;
        updateProgress(filesProcessedCount, totalFiles);
    }
    
    formElements.fileInput.value = '';
    formElements.fileInfo.style.display = 'none';
    
    // NO resetear selecciones - mantener valores
    // Solo limpiar técnico nuevo si fue usado
    
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
    formElements.btnSubir.textContent = "Subir Foto(s)";
    formElements.form.reset(); // Limpiar formulario completo
    setTimeout(() => formElements.progressContainer.style.display = 'none', 1000);
    
    const queueCount = await localforage.length();
    if (queueCount > 0) {
        showStatus(`💾 OFFLINE: ${queueCount} foto(s) en cola.`, 'info', 0); 
    } else {
        showStatus(`✅ ${totalFiles} foto(s) subidas.`, 'success', 8000); 
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

async function saveToQueue(data) {
    const uniqueKey = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await localforage.setItem(uniqueKey, data);
    updateQueueCount(await localforage.length());
}

async function processQueue() {
    if (!isOnline) return;
    const keys = await localforage.keys();
    if (keys.length === 0) return;
    showStatus(`🔄 Sincronizando ${keys.length} foto(s)...`, 'info', 0);
    let processedCount = 0;
    formElements.progressContainer.style.display = 'block';
    for (const key of keys) {
        const item = await localforage.getItem(key);
        const success = await uploadPhoto(item); 
        if (success) {
            await localforage.removeItem(key);
            processedCount++;
        }
        const percent = Math.round((processedCount / keys.length) * 100);
        formElements.progressBar.style.width = percent + "%";
        formElements.progressBar.textContent = `${processedCount}/${keys.length}`;
    }
    setTimeout(() => formElements.progressContainer.style.display = 'none', 1000);
    const remaining = await localforage.length();
    updateQueueCount(remaining);
    if (remaining === 0) {
        showStatus(`✅ ${processedCount} foto(s) sincronizadas.`, 'success');
    } else {
        showStatus(`⚠️ ${remaining} foto(s) pendientes.`, 'error', 0);
    }
}

async function uploadPhoto(data) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error(`HTTP: ${response.status}`);
        const result = await response.json();
        if (result.status === 'success') return true;
        else throw new Error(result.message || 'Fallo API.');
    } catch (error) {
        console.error('Error subida:', error);
        return false;
    }
}

// ======================================================
// 6. INICIALIZACIÓN
// ======================================================

document.addEventListener('DOMContentLoaded', () => {
    fetchDataFromGAS();
    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    localforage.length().then(count => updateQueueCount(count));
    formElements.form.addEventListener('submit', handleFormSubmit);
    formElements.fileInput.addEventListener('change', updateFileInfo);
    formElements.fileInputCamera.addEventListener('change', handleCameraCapture);
    
    // Botón cámara directa
    if (formElements.btnTomarFoto) {
        formElements.btnTomarFoto.addEventListener('click', () => {
            formElements.fileInputCamera.click();
        });
    }
    
    // Botón galería
    if (formElements.btnGaleria) {
        formElements.btnGaleria.addEventListener('click', () => {
            formElements.fileInput.click();
        });
    }
});

// Manejar foto de cámara - ACUMULAR (CORREGIDO)
function handleCameraCapture(e) {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length === 0) return;
    
    const dataTransfer = new DataTransfer();
    
    // PRIMERO: Agregar fotos existentes del input principal
    const existingFiles = Array.from(formElements.fileInput.files);
    existingFiles.forEach(file => dataTransfer.items.add(file));
    
    // SEGUNDO: Agregar las nuevas fotos de la cámara
    newFiles.forEach(file => dataTransfer.items.add(file));
    
    // Actualizar el input principal con TODAS las fotos
    formElements.fileInput.files = dataTransfer.files;
    
    // Mostrar info actualizada
    updateFileInfo();
    
    // Mensaje de confirmación
    showStatus(`📷 Foto agregada. Total: ${dataTransfer.files.length} foto(s)`, 'success', 2000);
    
    // IMPORTANTE: Limpiar el input de cámara para la próxima captura
    setTimeout(() => {
        formElements.fileInputCamera.value = '';
    }, 100);
}