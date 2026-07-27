const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

// ✅ AGREGAR FIREBASE ADMIN
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ INICIALIZAR FIREBASE ADMIN SDK
try {
    // Intentar cargar el service account
    const serviceAccount = require('./firebase-service-account.json');
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || 'push-notifications-poc'
    });
    console.log('✅ Firebase Admin SDK inicializado correctamente');
} catch (error) {
    console.error('❌ Error al inicializar Firebase:', error.message);
    console.log('⚠️ Las notificaciones FCM no funcionarán');
}

// Almacenamiento temporal de tokens
let registeredTokens = [];

// Middleware de seguridad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "*"]
    }
  }
}));

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// ✅ RUTAS DE NOTIFICACIONES (FCM)
// ============================================

// Registrar dispositivo
app.post('/api/register-device', (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({
            success: false,
            error: 'Token es requerido'
        });
    }

    // Evitar duplicados
    if (!registeredTokens.includes(token)) {
        registeredTokens.push(token);
        console.log(`📱 Dispositivo registrado: ${token.substring(0, 30)}...`);
        console.log(`📊 Total dispositivos: ${registeredTokens.length}`);
    }

    res.json({
        success: true,
        message: 'Dispositivo registrado exitosamente',
        token: token,
        totalDevices: registeredTokens.length,
        timestamp: new Date().toISOString()
    });
});

// Enviar notificación
app.post('/api/send-notification', async (req, res) => {
    const { token, title, body, data } = req.body;
    
    console.log('📨 Recibida solicitud de notificación:');
    console.log('  Token:', token ? token.substring(0, 30) + '...' : 'NO');
    console.log('  Título:', title);
    console.log('  Mensaje:', body);

    if (!token) {
        return res.status(400).json({
            success: false,
            error: 'Token es requerido'
        });
    }

    // Verificar si es un token FCM real (empieza con dQjpi)
    const isFCMToken = token.startsWith('dQjpi') || token.length > 50;
    
    if (isFCMToken) {
        console.log('🔑 Token FCM REAL detectado');
    } else {
        console.log('⚠️ Token de prueba detectado');
    }

    try {
        let messageId = null;
        
        // Si es un token FCM real, enviar a Firebase
        if (isFCMToken) {
            try {
                const message = {
                    token: token,
                    notification: {
                        title: title || 'Notificación',
                        body: body || 'Mensaje'
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            channelId: 'default_channel',
                            sound: 'default',
                            priority: 'high',
                            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                        }
                    },
                    data: {
                        title: title || 'Notificación',
                        body: body || 'Mensaje',
                        timestamp: new Date().toISOString(),
                        ...data
                    }
                };
                
                console.log('📤 Enviando a Firebase FCM...');
                const response = await admin.messaging().send(message);
                messageId = response;
                console.log('✅ FCM Response:', response);
                
            } catch (fcmError) {
                console.error('❌ Error FCM:', fcmError.message);
                return res.status(500).json({
                    success: false,
                    error: fcmError.message,
                    code: fcmError.code || 'FCM_ERROR'
                });
            }
        } else {
            // Token de prueba - simular envío
            console.log('📤 Simulando envío para token de prueba');
            messageId = 'test_' + Date.now();
        }
        
        res.json({
            success: true,
            message: 'Notificación enviada correctamente',
            messageId: messageId,
            tokenType: isFCMToken ? 'FCM_REAL' : 'TEST',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error al enviar notificación:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error interno del servidor'
        });
    }
});

// Ver tokens registrados
app.get('/api/tokens', (req, res) => {
    res.json({
        count: registeredTokens.length,
        tokens: registeredTokens
    });
});

// Eliminar todos los tokens (para pruebas)
app.delete('/api/tokens', (req, res) => {
    registeredTokens = [];
    res.json({
        success: true,
        message: 'Todos los tokens eliminados'
    });
});

// ============================================
// ✅ RUTAS EXISTENTES
// ============================================

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        fcmInitialized: !!admin.apps.length
    });
});

// API Status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        registeredDevices: registeredTokens.length,
        fcmReady: !!admin.apps.length
    });
});

// Manejo de errores 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'El recurso solicitado no existe'
    });
});

// Manejo de errores global
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message || 'Ocurrió un error en el servidor'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor web corriendo en puerto ${PORT}`);
    console.log(`📱 URL: http://localhost:${PORT}`);
    console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔥 Firebase FCM: ${admin.apps.length ? '✅ ACTIVADO' : '❌ DESACTIVADO'}`);
});