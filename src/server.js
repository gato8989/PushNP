const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

// ✅ FIREBASE ADMIN
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ INICIALIZAR FIREBASE CON VARIABLES DE ENTORNO
let firebaseInitialized = false;

try {
    // Verificar si tenemos las variables necesarias
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_PRIVATE_KEY && 
        process.env.FIREBASE_CLIENT_EMAIL) {
        
        // Reemplazar \n en la clave privada
        const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: privateKey,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL
            }),
            projectId: process.env.FIREBASE_PROJECT_ID
        });
        
        firebaseInitialized = true;
        console.log('✅ Firebase Admin SDK inicializado con variables de entorno');
        console.log(`📱 Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
        console.log(`📧 Client Email: ${process.env.FIREBASE_CLIENT_EMAIL}`);
        
    } else {
        console.log('⚠️ Variables de entorno no configuradas');
        console.log('💡 Usando archivo local (solo desarrollo)');
        
        // Fallback: intentar usar el archivo (solo en desarrollo)
        try {
            const serviceAccount = require('./firebase-service-account.json');
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: process.env.FIREBASE_PROJECT_ID || 'push-notifications-poc'
            });
            firebaseInitialized = true;
            console.log('✅ Firebase Admin SDK inicializado con archivo local');
        } catch (fileError) {
            console.error('❌ Error al cargar archivo local:', fileError.message);
            console.log('⚠️ Las notificaciones FCM NO funcionarán');
        }
    }
} catch (error) {
    console.error('❌ Error al inicializar Firebase:', error.message);
    console.log('⚠️ Las notificaciones FCM NO funcionarán');
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
    
    console.log('📝 Registrando dispositivo...');
    console.log('  Token:', token ? token.substring(0, 30) + '...' : 'NO');
    
    if (!token) {
        return res.status(400).json({
            success: false,
            error: 'Token es requerido'
        });
    }

    // Evitar duplicados
    if (!registeredTokens.includes(token)) {
        registeredTokens.push(token);
        console.log(`✅ Dispositivo registrado: ${token.substring(0, 30)}...`);
        console.log(`📊 Total dispositivos: ${registeredTokens.length}`);
    } else {
        console.log('ℹ️ Token ya registrado');
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
    console.log('  Título:', title || 'Sin título');
    console.log('  Mensaje:', body || 'Sin mensaje');

    if (!token) {
        return res.status(400).json({
            success: false,
            error: 'Token es requerido'
        });
    }

    // Verificar si es un token FCM real
    const isFCMToken = token.startsWith('dQjpi') || token.length > 50;
    console.log(`🔑 Tipo de token: ${isFCMToken ? 'FCM REAL' : 'TEST'}`);
    
    // Verificar si el token está registrado
    const isRegistered = registeredTokens.includes(token);
    console.log(`📌 Token registrado: ${isRegistered ? '✅ SI' : '❌ NO'}`);
    
    if (!isRegistered) {
        console.log('⚠️ Token no registrado, registrándolo...');
        registeredTokens.push(token);
    }

    // Si no hay Firebase, solo simular
    if (!firebaseInitialized) {
        console.log('⚠️ Firebase NO inicializado, simulando envío');
        return res.json({
            success: true,
            message: 'Notificación simulada (Firebase no disponible)',
            messageId: 'simulated_' + Date.now(),
            tokenType: isFCMToken ? 'FCM_REAL' : 'TEST',
            timestamp: new Date().toISOString(),
            warning: 'Firebase no inicializado'
        });
    }

    try {
        let messageId = null;
        let fcmError = null;
        
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
                
            } catch (error) {
                console.error('❌ Error FCM:', error.message);
                fcmError = error.message;
                
                // Verificar si es un error de token inválido
                if (error.code === 'messaging/registration-token-not-registered') {
                    console.log('⚠️ Token no válido, eliminando...');
                    const index = registeredTokens.indexOf(token);
                    if (index > -1) {
                        registeredTokens.splice(index, 1);
                    }
                    return res.status(400).json({
                        success: false,
                        error: 'Token FCM no válido o expirado',
                        code: 'INVALID_TOKEN',
                        suggestion: 'Reinicia la app Android para obtener un nuevo token'
                    });
                }
                
                return res.status(500).json({
                    success: false,
                    error: fcmError,
                    code: error.code || 'FCM_ERROR'
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
            firebaseAvailable: firebaseInitialized,
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
        tokens: registeredTokens,
        timestamp: new Date().toISOString()
    });
});

// Eliminar todos los tokens (para pruebas)
app.delete('/api/tokens', (req, res) => {
    const count = registeredTokens.length;
    registeredTokens = [];
    res.json({
        success: true,
        message: 'Todos los tokens eliminados',
        deletedCount: count,
        timestamp: new Date().toISOString()
    });
});

// Eliminar un token específico
app.delete('/api/tokens/:token', (req, res) => {
    const token = req.params.token;
    const index = registeredTokens.indexOf(token);
    
    if (index > -1) {
        registeredTokens.splice(index, 1);
        res.json({
            success: true,
            message: 'Token eliminado correctamente',
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Token no encontrado'
        });
    }
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
        firebaseInitialized: firebaseInitialized,
        registeredDevices: registeredTokens.length
    });
});

// API Status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        registeredDevices: registeredTokens.length,
        firebaseAvailable: firebaseInitialized,
        environment: process.env.NODE_ENV || 'development'
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
    console.log(`\n🚀 Servidor web corriendo en puerto ${PORT}`);
    console.log(`📱 URL: http://localhost:${PORT}`);
    console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔥 Firebase FCM: ${firebaseInitialized ? '✅ ACTIVADO' : '❌ DESACTIVADO'}`);
    console.log(`📊 Dispositivos registrados: ${registeredTokens.length}`);
    console.log(`\n📋 Endpoints disponibles:`);
    console.log(`  GET  /health              - Health check`);
    console.log(`  GET  /api/status          - Estado del servidor`);
    console.log(`  POST /api/register-device - Registrar dispositivo`);
    console.log(`  POST /api/send-notification - Enviar notificación`);
    console.log(`  GET  /api/tokens          - Ver tokens registrados`);
    console.log(`  DELETE /api/tokens        - Eliminar todos los tokens`);
    console.log(`\n`);
});