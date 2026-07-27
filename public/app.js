class PushNotificationApp {
    constructor() {
        // ✅ CARGAR CONFIGURACIÓN
        this.backendUrl = localStorage.getItem('backendUrl') || 'https://pushnp-production.up.railway.app';
        
        // ✅ CARGAR TOKEN DE LOCALSTORAGE
        this.deviceToken = localStorage.getItem('deviceToken') || null;
        this.isRegistered = false;
        this.serverStatus = 'offline';
        this.elements = {};
        
        // ✅ SI HAY TOKEN EN LOCALSTORAGE, ESTÁ REGISTRADO
        if (this.deviceToken && this.deviceToken.length > 10) {
            this.isRegistered = true;
            console.log('🔑 Token cargado de localStorage:', this.deviceToken.substring(0, 30) + '...');
        }
        
        this.initializeApp();
    }

    initializeApp() {
        this.cacheElements();
        this.setupEventListeners();
        this.updateUI();
        this.loadSavedConfig();
        
        // ✅ SI YA HAY TOKEN, ACTUALIZAR UI
        if (this.deviceToken) {
            this.addLog(`🔑 Token recuperado: ${this.deviceToken.substring(0, 20)}...`, 'info');
            this.updateUI();
        }
        
        setTimeout(() => {
            this.checkServerConnection();
        }, 1000);
        
        this.addLog('🚀 Aplicación iniciada correctamente', 'info');
        this.addLog(`📡 Backend: ${this.backendUrl}`, 'info');
        
        if (!this.deviceToken) {
            this.addLog('💡 Registra un dispositivo para comenzar', 'info');
        }
    }

    cacheElements() {
        this.elements = {
            serverStatus: document.getElementById('serverStatus'),
            statusDot: document.querySelector('.status-dot'),
            statusText: document.querySelector('.status-text'),
            deviceBadge: document.getElementById('deviceBadge'),
            deviceStatus: document.getElementById('deviceStatus'),
            deviceToken: document.getElementById('deviceTokenDisplay'),
            registerBtn: document.getElementById('registerBtn'),
            sendNotificationBtn: document.getElementById('sendNotificationBtn'),
            sendToAllBtn: document.getElementById('sendToAllBtn'),
            testConnectionBtn: document.getElementById('testConnectionBtn'),
            clearLogsBtn: document.getElementById('clearLogsBtn'),
            serverUrl: document.getElementById('serverUrl'),
            notifTitle: document.getElementById('notifTitle'),
            notifBody: document.getElementById('notifBody'),
            statusLog: document.getElementById('statusLog'),
            serverInfo: document.getElementById('serverInfo')
        };
    }

    setupEventListeners() {
        this.elements.registerBtn.addEventListener('click', () => this.registerDevice());
        this.elements.sendNotificationBtn.addEventListener('click', () => this.sendNotification());
        this.elements.sendToAllBtn.addEventListener('click', () => this.sendToAll());
        this.elements.testConnectionBtn.addEventListener('click', () => this.testConnection());
        this.elements.clearLogsBtn.addEventListener('click', () => this.clearLogs());
        
        this.elements.serverUrl.addEventListener('change', (e) => {
            const url = e.target.value.trim().replace(/\/$/, '');
            this.backendUrl = url;
            localStorage.setItem('backendUrl', this.backendUrl);
            this.addLog(`🔧 URL del backend actualizada: ${this.backendUrl}`, 'info');
            this.checkServerConnection();
        });
    }

    loadSavedConfig() {
        const savedUrl = localStorage.getItem('backendUrl');
        if (savedUrl) {
            this.elements.serverUrl.value = savedUrl;
            this.backendUrl = savedUrl;
        }
    }

    async checkServerConnection() {
        try {
            this.addLog(`🔍 Conectando a: ${this.backendUrl}/health`, 'info');
            
            const response = await fetch(`${this.backendUrl}/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'OK') {
                this.updateServerStatus('online');
                this.addLog(`✅ Servidor conectado correctamente`, 'success');
                this.addLog(`📊 Timestamp: ${data.timestamp}`, 'info');
                this.elements.serverInfo.textContent = `🟢 Servidor en línea (${data.timestamp})`;
                return true;
            } else {
                throw new Error('Respuesta inesperada del servidor');
            }
        } catch (error) {
            this.updateServerStatus('offline');
            this.addLog(`❌ Error de conexión: ${error.message}`, 'error');
            this.addLog(`💡 Verifica que el backend esté ejecutándose en: ${this.backendUrl}`, 'warning');
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
            const isConnected = await this.checkServerConnection();
            if (!isConnected) {
                this.addLog('⚠️ No hay conexión al servidor', 'error');
                return;
            }

            // ✅ VERIFICAR SI YA HAY TOKEN EN LOCALSTORAGE
            let token = localStorage.getItem('deviceToken');
            
            // Si no hay token en localStorage, verificar window
            if (!token || token === 'undefined' || token === 'null') {
                token = window.fcmToken || window.androidToken;
            }
            
            // Si no hay token FCM, generar uno de prueba
            if (!token || token === 'undefined' || token === 'null' || token.length < 10) {
                const timestamp = Date.now();
                const random = Math.random().toString(36).substring(7);
                token = `device_${timestamp}_${random}`;
                this.addLog('🔑 Generando token de prueba...', 'info');
            } else {
                this.addLog('🔑 Usando token existente', 'info');
            }
            
            // ✅ REGISTRAR EN EL SERVIDOR
            this.addLog(`📝 Registrando en el servidor...`, 'info');
            
            const response = await fetch(`${this.backendUrl}/api/register-device`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: token })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log('📊 Registro:', data);
            
            if (data.success) {
                // ✅ GUARDAR EN LOCALSTORAGE Y CLASE
                localStorage.setItem('deviceToken', token);
                this.deviceToken = token;
                this.isRegistered = true;
                
                this.addLog(`✅ Dispositivo registrado exitosamente`, 'success');
                this.addLog(`🔑 Token: ${token.substring(0, 30)}...`, 'info');
                this.addLog(`📊 Total dispositivos: ${data.totalDevices || 'N/A'}`, 'info');
                
                this.updateUI();
            } else {
                throw new Error(data.error || 'Error al registrar dispositivo');
            }
        } catch (error) {
            console.error('❌ Error:', error);
            this.addLog(`❌ Error al registrar: ${error.message}`, 'error');
        }
    }

    async sendNotification() {
        // ✅ OBTENER TOKEN DIRECTAMENTE DE LOCALSTORAGE
        let token = localStorage.getItem('deviceToken');
        
        // Si no hay en localStorage, intentar con window
        if (!token || token === 'undefined' || token === 'null') {
            token = window.fcmToken || window.androidToken;
            if (token) {
                localStorage.setItem('deviceToken', token);
            }
        }
        
        // ✅ VERIFICAR QUE EL TOKEN EXISTA
        if (!token || token === 'undefined' || token === 'null' || token.length < 10) {
            this.addLog('⚠️ No hay token válido. Registra un dispositivo.', 'error');
            this.isRegistered = false;
            this.updateUI();
            return;
        }

        // ✅ ACTUALIZAR EL TOKEN EN LA CLASE
        this.deviceToken = token;
        this.isRegistered = true;
        
        const title = this.elements.notifTitle.value.trim() || '📢 Notificación de prueba';
        const body = this.elements.notifBody.value.trim() || 'Esta es una notificación de prueba';

        try {
            this.addLog(`📨 Enviando notificación: "${title}"`, 'info');
            this.addLog(`🔑 Token: ${token.substring(0, 25)}...`, 'info');
            
            const response = await fetch(`${this.backendUrl}/api/send-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: token,
                    title: title,
                    body: body,
                    data: {
                        timestamp: new Date().toISOString(),
                        source: 'web-app'
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log('📊 Respuesta:', data);
            
            if (data.success) {
                this.addLog(`✅ Notificación enviada exitosamente`, 'success');
                if (data.messageId) {
                    this.addLog(`📤 ID: ${data.messageId}`, 'info');
                }
            } else {
                throw new Error(data.error || 'Error al enviar notificación');
            }
        } catch (error) {
            console.error('❌ Error detallado:', error);
            this.addLog(`❌ Error al enviar: ${error.message}`, 'error');
            
            // Si el error es por token inválido, limpiar
            if (error.message.includes('token') || error.message.includes('400') || error.message.includes('404')) {
                this.addLog('💡 Token inválido. Re-registrando...', 'warning');
                localStorage.removeItem('deviceToken');
                this.deviceToken = null;
                this.isRegistered = false;
                this.updateUI();
            }
        }
    }

    async sendToAll() {
        const title = this.elements.notifTitle.value.trim() || '📢 Notificación masiva';
        const body = this.elements.notifBody.value.trim() || 'Esta es una notificación para todos los dispositivos';

        try {
            this.addLog(`📢 Enviando notificación a TODOS los dispositivos...`, 'info');
            
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

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log('📊 Respuesta:', data);
            
            if (data.success) {
                this.addLog(`✅ Notificaciones masivas enviadas exitosamente`, 'success');
                if (data.sentCount !== undefined) {
                    this.addLog(`✅ Enviadas: ${data.sentCount}`, 'success');
                }
                if (data.failedCount !== undefined && data.failedCount > 0) {
                    this.addLog(`⚠️ Fallaron: ${data.failedCount}`, 'warning');
                }
                if (data.totalDevices !== undefined) {
                    this.addLog(`📊 Total: ${data.totalDevices} dispositivos`, 'info');
                }
            } else {
                throw new Error(data.error || 'Error al enviar');
            }
        } catch (error) {
            console.error('❌ Error:', error);
            this.addLog(`❌ Error al enviar: ${error.message}`, 'error');
            
            if (error.message.includes('404')) {
                this.addLog('💡 El endpoint /api/send-to-all no existe en el servidor', 'warning');
            } else if (error.message.includes('400')) {
                this.addLog('💡 No hay dispositivos registrados en el servidor', 'warning');
            }
        }
    }

    async testConnection() {
        this.addLog('🔍 Probando conexión con el servidor...', 'info');
        const isConnected = await this.checkServerConnection();
        
        if (isConnected) {
            this.addLog('✅ Conexión establecida correctamente', 'success');
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
        const sendBtn = this.elements.sendNotificationBtn;
        const sendAllBtn = this.elements.sendToAllBtn;

        // ✅ OBTENER TOKEN DE LOCALSTORAGE
        let token = localStorage.getItem('deviceToken');
        
        // Si no hay en localStorage, intentar con window
        if (!token || token === 'undefined' || token === 'null') {
            token = window.fcmToken || window.androidToken;
            if (token) {
                localStorage.setItem('deviceToken', token);
            }
        }

        // ✅ ACTUALIZAR CLASE
        if (token && token.length > 10) {
            this.deviceToken = token;
            this.isRegistered = true;
            
            badge.textContent = '✅ Registrado';
            badge.className = 'badge badge-success';
            status.innerHTML = '<span class="text-muted">Estado:</span> <span style="color: var(--success); font-weight: 600;">Registrado</span>';
            tokenDisplay.innerHTML = `<span class="text-muted">Token:</span> <span class="device-token">${token}</span>`;
            
            sendBtn.disabled = false;
            sendAllBtn.disabled = false;
        } else {
            this.deviceToken = null;
            this.isRegistered = false;
            
            badge.textContent = '❌ No registrado';
            badge.className = 'badge badge-danger';
            status.innerHTML = '<span class="text-muted">Estado:</span> <span style="color: var(--danger);">No registrado</span>';
            tokenDisplay.innerHTML = '<span class="text-muted">Token:</span> <span class="text-muted">No disponible</span>';
            
            sendBtn.disabled = true;
            sendAllBtn.disabled = true;
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

        while (logContainer.children.length > 20) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }
}

// Inicializar app
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const app = new PushNotificationApp();
        window.app = app;
    }, 100);
});