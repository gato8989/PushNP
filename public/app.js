class PushNotificationApp {
    constructor() {
        // Configuración
        this.backendUrl = localStorage.getItem('backendUrl') || 'https://pushnp-production.up.railway.app';
        
        // ✅ USAR TOKEN FCM REAL SI EXISTE
        // El token se inyecta desde la app Android mediante WebView
        const fcmTokenFromAndroid = window.fcmToken || window.androidToken;
        
        if (fcmTokenFromAndroid && fcmTokenFromAndroid.length > 50) {
            this.deviceToken = fcmTokenFromAndroid;
            localStorage.setItem('deviceToken', fcmTokenFromAndroid);
            localStorage.setItem('tokenType', 'fcm_real');
            this.isRegistered = true;
            this.addLog('✅ Token FCM real detectado desde Android', 'success');
        } else {
            this.deviceToken = localStorage.getItem('deviceToken') || null;
            this.isRegistered = false;
        }
        
        this.serverStatus = 'offline';
        this.elements = {};
        this.initializeApp();
    }

    initializeApp() {
        // Obtener referencias a elementos
        this.cacheElements();
        
        // Configurar event listeners
        this.setupEventListeners();
        
        // Actualizar UI
        this.updateUI();
        
        // Verificar conexión al servidor
        this.checkServerConnection();
        
        // Cargar URL guardada
        this.loadSavedConfig();
        
        // Log de inicio
        this.addLog('🚀 Aplicación iniciada correctamente', 'info');
        this.addLog('💡 Registra un dispositivo para comenzar', 'info');
    }

    cacheElements() {
        this.elements = {
            // Status
            serverStatus: document.getElementById('serverStatus'),
            statusDot: document.querySelector('.status-dot'),
            statusText: document.querySelector('.status-text'),
            
            // Device
            deviceBadge: document.getElementById('deviceBadge'),
            deviceStatus: document.getElementById('deviceStatus'),
            deviceToken: document.getElementById('deviceTokenDisplay'),
            
            // Buttons
            registerBtn: document.getElementById('registerBtn'),
            sendNotificationBtn: document.getElementById('sendNotificationBtn'),
            sendToAllBtn: document.getElementById('sendToAllBtn'),
            testConnectionBtn: document.getElementById('testConnectionBtn'),
            clearLogsBtn: document.getElementById('clearLogsBtn'),
            
            // Inputs
            serverUrl: document.getElementById('serverUrl'),
            notifTitle: document.getElementById('notifTitle'),
            notifBody: document.getElementById('notifBody'),
            
            // Logs
            statusLog: document.getElementById('statusLog'),
            
            // Server info
            serverInfo: document.getElementById('serverInfo')
        };
    }

    setupEventListeners() {
        // Registro de dispositivo
        this.elements.registerBtn.addEventListener('click', () => this.registerDevice());
        
        // Envío de notificaciones
        this.elements.sendNotificationBtn.addEventListener('click', () => this.sendNotification());
        this.elements.sendToAllBtn.addEventListener('click', () => this.sendToAll());
        
        // Configuración
        this.elements.testConnectionBtn.addEventListener('click', () => this.testConnection());
        this.elements.clearLogsBtn.addEventListener('click', () => this.clearLogs());
        
        // Guardar URL al cambiar
        this.elements.serverUrl.addEventListener('change', (e) => {
            this.backendUrl = e.target.value.trim();
            localStorage.setItem('backendUrl', this.backendUrl);
            this.addLog(`🔧 URL del backend actualizada: ${this.backendUrl}`, 'info');
        });
        
        // Enter key en campos
        this.elements.notifTitle.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.elements.notifBody.focus();
            }
        });
        
        this.elements.notifBody.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.sendNotification();
            }
        });
    }

    loadSavedConfig() {
        const savedUrl = localStorage.getItem('backendUrl');
        if (savedUrl) {
            this.elements.serverUrl.value = savedUrl;
            this.backendUrl = savedUrl;
        }
        
        const savedToken = localStorage.getItem('deviceToken');
        if (savedToken) {
            this.deviceToken = savedToken;
            this.isRegistered = true;
            this.updateUI();
            this.addLog(`🔑 Token recuperado: ${this.deviceToken.substring(0, 20)}...`, 'info');
        }
    }

    async checkServerConnection() {
        try {
            const response = await fetch(`${this.backendUrl}/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateServerStatus('online');
                this.addLog(`✅ Servidor conectado (${data.timestamp})`, 'success');
                this.elements.serverInfo.textContent = `🟢 Servidor en línea`;
                return true;
            } else {
                throw new Error('Respuesta inválida del servidor');
            }
        } catch (error) {
            this.updateServerStatus('offline');
            this.addLog(`❌ Error de conexión: ${error.message}`, 'error');
            this.elements.serverInfo.textContent = '🔴 Servidor desconectado';
            return false;
        }
    }

    updateServerStatus(status) {
        this.serverStatus = status;
        const dot = this.elements.statusDot;
        const text = this.elements.statusText;
        
        if (status === 'online') {
            dot.className = 'status-dot online';
            text.textContent = 'Conectado';
        } else {
            dot.className = 'status-dot offline';
            text.textContent = 'Desconectado';
        }
    }

    async registerDevice() {
        try {
            // Verificar conexión primero
            const isConnected = await this.checkServerConnection();
            if (!isConnected) {
                this.addLog('⚠️ No se puede registrar sin conexión al servidor', 'error');
                return;
            }

            // Generar token único
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(7);
            const token = `device_${timestamp}_${random}`;
            
            this.addLog('🔑 Generando token de dispositivo...', 'info');
            
            // Registrar en el backend
            const response = await fetch(`${this.backendUrl}/api/register-device`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
            });

            const data = await response.json();

            if (data.success) {
                this.deviceToken = token;
                this.isRegistered = true;
                localStorage.setItem('deviceToken', token);
                
                this.addLog(`✅ Dispositivo registrado exitosamente`, 'success');
                this.addLog(`🔑 Token: ${token.substring(0, 30)}...`, 'info');
                
                this.updateUI();
            } else {
                throw new Error(data.error || 'Error al registrar dispositivo');
            }
        } catch (error) {
            this.addLog(`❌ Error al registrar: ${error.message}`, 'error');
        }
    }

    async sendNotification() {
        if (!this.isRegistered || !this.deviceToken) {
            this.addLog('⚠️ Primero debes registrar un dispositivo', 'error');
            this.elements.registerBtn.focus();
            return;
        }

        const title = this.elements.notifTitle.value.trim() || '📢 Notificación de prueba';
        const body = this.elements.notifBody.value.trim() || 'Esta es una notificación de prueba desde el servidor';

        try {
            this.addLog(`📨 Enviando notificación: "${title}"`, 'info');
            
            const response = await fetch(`${this.backendUrl}/api/send-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: this.deviceToken,
                    title,
                    body,
                    data: {
                        timestamp: new Date().toISOString(),
                        source: 'web-app',
                        device: this.deviceToken
                    }
                })
            });

            const data = await response.json();

            if (data.success) {
                this.addLog(`✅ Notificación enviada exitosamente`, 'success');
                this.addLog(`📤 Destino: ${data.data.token.substring(0, 20)}...`, 'info');
                
                // Efecto visual
                this.elements.sendNotificationBtn.classList.add('pulse');
                setTimeout(() => {
                    this.elements.sendNotificationBtn.classList.remove('pulse');
                }, 1000);
            } else {
                throw new Error(data.error || 'Error al enviar notificación');
            }
        } catch (error) {
            this.addLog(`❌ Error al enviar: ${error.message}`, 'error');
        }
    }

async sendToAll() {
    // ✅ Obtener título y mensaje
    const title = this.elements.notifTitle.value.trim() || '📢 Notificación masiva';
    const body = this.elements.notifBody.value.trim() || 'Esta es una notificación para todos los dispositivos';

    try {
        this.addLog(`📢 Enviando notificación a TODOS los dispositivos...`, 'info');
        
        // ✅ Llamar al endpoint sin necesidad de tener la lista localmente
        const response = await fetch(`${this.backendUrl}/api/send-to-all`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                body: body,
                data: {
                    timestamp: new Date().toISOString(),
                    source: 'web-app',
                    type: 'massive'
                }
            })
        });

        // ✅ Verificar si la respuesta es OK
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('📊 Respuesta del servidor:', data);
        
        // ✅ Mostrar resultados en los logs
        if (data.success) {
            this.addLog(`✅ Notificaciones masivas enviadas exitosamente`, 'success');
            
            // Mostrar estadísticas
            if (data.totalDevices !== undefined) {
                this.addLog(`📊 Total dispositivos: ${data.totalDevices}`, 'info');
            }
            if (data.sentCount !== undefined) {
                this.addLog(`✅ Enviadas: ${data.sentCount}`, 'success');
            }
            if (data.failedCount !== undefined && data.failedCount > 0) {
                this.addLog(`⚠️ Fallaron: ${data.failedCount}`, 'warning');
            }
            
            // Si hay tokens fallidos, mostrarlos
            if (data.failedTokens && data.failedTokens.length > 0) {
                this.addLog(`⚠️ Tokens inválidos: ${data.failedTokens.length}`, 'warning');
                data.failedTokens.forEach((token, i) => {
                    if (i < 3) { // Mostrar solo los primeros 3
                        this.addLog(`   ${i+1}. ${token}...`, 'warning');
                    }
                });
                if (data.failedTokens.length > 3) {
                    this.addLog(`   ... y ${data.failedTokens.length - 3} más`, 'warning');
                }
            }
        } else {
            throw new Error(data.error || 'Error al enviar notificaciones masivas');
        }
    } catch (error) {
        console.error('❌ Error detallado:', error);
        this.addLog(`❌ Error al enviar: ${error.message}`, 'error');
        
        // Sugerir posibles soluciones
        if (error.message.includes('404') || error.message.includes('Not Found')) {
            this.addLog('💡 El endpoint /api/send-to-all no existe en el servidor', 'warning');
            this.addLog('💡 Asegúrate de que el backend tenga el endpoint implementado', 'warning');
        } else if (error.message.includes('400')) {
            this.addLog('💡 No hay dispositivos registrados en el servidor', 'warning');
            this.addLog('💡 Registra al menos un dispositivo primero', 'warning');
        } else if (error.message.includes('500')) {
            this.addLog('💡 Error en el servidor. Revisa los logs de Railway', 'warning');
        }
    }
}
    async testConnection() {
        this.addLog('🔍 Probando conexión con el servidor...', 'info');
        const isConnected = await this.checkServerConnection();
        
        if (isConnected) {
            this.addLog('✅ Conexión establecida correctamente', 'success');
            
            // Intentar obtener configuración
            try {
                const response = await fetch(`${this.backendUrl}/api/status`);
                const data = await response.json();
                this.addLog(`📊 Estado: ${data.status} (${data.timestamp})`, 'info');
            } catch (error) {
                // Ignorar error de status
            }
        } else {
            this.addLog('❌ No se pudo establecer conexión', 'error');
            this.addLog('💡 Verifica la URL y que el servidor esté corriendo', 'warning');
        }
    }

    clearLogs() {
        const logs = this.elements.statusLog;
        logs.innerHTML = '';
        this.addLog('🧹 Logs limpiados', 'info');
    }

    updateUI() {
        const badge = this.elements.deviceBadge;
        const status = this.elements.deviceStatus;
        const tokenDisplay = this.elements.deviceToken;

        if (this.isRegistered && this.deviceToken) {
            badge.textContent = '✅ Registrado';
            badge.className = 'badge badge-success';
            status.innerHTML = '<span class="text-muted">Estado:</span> <span style="color: var(--success); font-weight: 600;">Registrado</span>';
            tokenDisplay.innerHTML = `<span class="text-muted">Token:</span> <span class="device-token">${this.deviceToken}</span>`;
            
            // Habilitar botones
            this.elements.sendNotificationBtn.disabled = false;
            this.elements.sendToAllBtn.disabled = false;
        } else {
            badge.textContent = '❌ No registrado';
            badge.className = 'badge badge-danger';
            status.innerHTML = '<span class="text-muted">Estado:</span> <span style="color: var(--danger);">No registrado</span>';
            tokenDisplay.innerHTML = '<span class="text-muted">Token:</span> <span class="text-muted">No disponible</span>';
            
            // Deshabilitar botones
            this.elements.sendNotificationBtn.disabled = true;
            this.elements.sendToAllBtn.disabled = true;
        }
    }

    addLog(message, type = 'info') {
        const logContainer = this.elements.statusLog;
        const logEntry = document.createElement('div');
        
        const time = new Date().toLocaleTimeString();
        
        logEntry.className = `log-message log-${type}`;
        logEntry.innerHTML = `
            <span class="log-time">${time}</span>
            <span class="log-text">${message}</span>
        `;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;

        // Mantener solo últimos 20 mensajes
        while (logContainer.children.length > 20) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }
}

// Inicializar app cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Pequeño delay para asegurar que todo esté cargado
    setTimeout(() => {
        const app = new PushNotificationApp();
        // Exponer app globalmente para debugging
        window.app = app;
    }, 100);
});

// Soporte para PWA (Progressive Web App)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado');
            })
            .catch(err => {
                console.log('❌ Error al registrar Service Worker:', err);
            });
    });
}