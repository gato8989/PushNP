const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

// ✅ IMPORTAR FIREBASE ADMIN
let admin;
let firebaseInitialized = false;
let firebaseError = null;

try {
    admin = require('firebase-admin');
    console.log('✅ Firebase Admin cargado correctamente');
} catch (error) {
    console.error('❌ Error al cargar firebase-admin:', error.message);
    console.log('⚠️ Ejecuta: npm install firebase-admin');
    admin = null;
}

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ INICIALIZAR FIREBASE - CON VERIFICACIÓN DE APP EXISTENTE
if (admin) {
    try {
        if (!admin.credential) {
            console.error('❌ admin.credential no disponible');
            throw new Error('admin.credential es undefined');
        }

        let existingApp = null;
        try {
            existingApp = admin.app();
            if (existingApp) {
                console.log('ℹ️ Firebase app ya inicializada, reutilizando...');
                firebaseInitialized = true;
                console.log('✅ Firebase Admin SDK ya estaba inicializado');
            }
        } catch (appError) {
            console.log('ℹ️ No hay app existente, inicializando...');
        }

        if (!existingApp && !firebaseInitialized) {
            if (process.env.FIREBASE_PROJECT_ID && 
                process.env.FIREBASE_PRIVATE_KEY && 
                process.env.FIREBASE_CLIENT_EMAIL) {
                
                console.log('🔧 Inicializando Firebase con variables de entorno...');
                
                let privateKey = process.env.FIREBASE_PRIVATE_KEY;
                
                if (privateKey.includes('\\n')) {
                    privateKey = privateKey.replace(/\\n/g, '\n');
                    console.log('🔑 Reemplazados \\n por saltos de línea');
                }
                
                if (!privateKey.includes('BEGIN PRIVATE KEY')) {
                    console.error('❌ La clave privada no tiene el formato correcto');
                    throw new Error('Formato de clave privada inválido');
                }
                
                if (!privateKey.includes('END PRIVATE KEY')) {
                    console.error('❌ La clave privada no termina correctamente');
                    throw new Error('Formato de clave privada inválido');
                }
                
                privateKey = privateKey.trim();
                
                const credentials = {
                    projectId: process.env.FIREBASE_PROJECT_ID.trim(),
                    privateKey: privateKey,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim()
                };
                
                console.log('📱 Project ID:', credentials.projectId);
                console.log('📧 Client Email:', credentials.clientEmail);
                console.log('🔑 Private Key length:', credentials.privateKey.length);
                
                admin.initializeApp({
                    credential: admin.credential.cert(credentials),
                    projectId: process.env.FIREBASE_PROJECT_ID.trim()
                });
                
                firebaseInitialized = true;
                console.log('✅ Firebase Admin SDK inicializado correctamente');
                
            } else {
                console.log('⚠️ Variables de entorno no configuradas');
                console.log('💡 Usando archivo local (solo desarrollo)');
                
                try {
                    const fs = require('fs');
                    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
                    
                    if (fs.existsSync(serviceAccountPath)) {
                        console.log('📁 Cargando archivo local:', serviceAccountPath);
                        const serviceAccount = require('./firebase-service-account.json');
                        
                        admin.initializeApp({
                            credential: admin.credential.cert(serviceAccount),
                            projectId: serviceAccount.project_id || 'quickalerts-eba8c'
                        });
                        
                        firebaseInitialized = true;
                        console.log('✅ Firebase inicializado con archivo local');
                        console.log(`📱 Project ID: ${serviceAccount.project_id}`);
                    } else {
                        console.log('❌ Archivo firebase-service-account.json no encontrado');
                        console.log('💡 Configura las variables de entorno en Railway');
                        firebaseError = 'Archivo de credenciales no encontrado';
                    }
                } catch (fileError) {
                    console.error('❌ Error al cargar archivo local:', fileError.message);
                    firebaseError = fileError.message;
                }
            }
        }
    } catch (error) {
        console.error('❌ Error al inicializar Firebase:', error.message);
        console.error('📚 Stack:', error.stack);
        firebaseError = error.message;
        firebaseInitialized = false;
    }
} else {
    console.log('⚠️ Firebase Admin no disponible');
    firebaseError = 'firebase-admin no instalado';
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

// Enviar notificación individual
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

    const isFCMToken = token.startsWith('dQjpi') || token.length > 50;
    console.log(`🔑 Tipo de token: ${isFCMToken ? 'FCM REAL' : 'TEST'}`);
    
    const isRegistered = registeredTokens.includes(token);
    console.log(`📌 Token registrado: ${isRegistered ? '✅ SI' : '❌ NO'}`);
    
    if (!isRegistered) {
        console.log('⚠️ Token no registrado, registrándolo...');
        registeredTokens.push(token);
    }

    if (!firebaseInitialized || !admin) {
        console.log('⚠️ Firebase NO disponible, simulando envío');
        return res.json({
            success: true,
            message: 'Notificación simulada (Firebase no disponible)',
            messageId: 'simulated_' + Date.now(),
            tokenType: isFCMToken ? 'FCM_REAL' : 'TEST',
            timestamp: new Date().toISOString(),
            warning: firebaseError || 'Firebase no inicializado',
            firebaseAvailable: false
        });
    }

    try {
        let messageId = null;
        
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
                            priority: 'high'
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
                    error: error.message,
                    code: error.code || 'FCM_ERROR'
                });
            }
        } else {
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

// Enviar a TODOS los dispositivos (Multicast)
app.post('/api/send-to-all', async (req, res) => {
    const { title, body, data } = req.body;
    
    console.log('📢 RECIBIDA SOLICITUD MASIVA:');
    console.log('  Título:', title || 'Sin título');
    console.log('  Mensaje:', body || 'Sin mensaje');
    console.log(`  📊 Dispositivos registrados: ${registeredTokens.length}`);

    if (registeredTokens.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No hay dispositivos registrados',
            message: 'Registra al menos un dispositivo primero'
        });
    }

    if (!firebaseInitialized || !admin) {
        console.log('⚠️ Firebase NO disponible');
        return res.json({
            success: false,
            error: 'Firebase no disponible',
            message: 'Las notificaciones no pueden enviarse',
            firebaseAvailable: false
        });
    }

    try {
        const message = {
            notification: {
                title: title || '📢 Notificación masiva',
                body: body || 'Esta es una notificación para todos los dispositivos'
            },
            android: {
                priority: 'high',
                notification: {
                    channelId: 'default_channel',
                    sound: 'default',
                    priority: 'high'
                }
            },
            data: {
                title: title || '📢 Notificación masiva',
                body: body || 'Esta es una notificación para todos los dispositivos',
                timestamp: new Date().toISOString(),
                type: 'massive',
                ...data
            }
        };

        console.log(`📤 Enviando a ${registeredTokens.length} dispositivos...`);

        const response = await admin.messaging().sendEachForMulticast({
            ...message,
            tokens: registeredTokens
        });

        console.log('✅ RESULTADO:');
        console.log(`  ✅ Éxitos: ${response.successCount}`);
        console.log(`  ❌ Fallos: ${response.failureCount}`);

        const results = response.responses.map((resp, index) => ({
            index: index,
            token: registeredTokens[index],
            success: resp.success,
            error: resp.error ? resp.error.message : null
        }));

        const failedTokens = results
            .filter(r => !r.success && r.error?.includes('registration-token-not-registered'))
            .map(r => r.token);

        if (failedTokens.length > 0) {
            console.log(`⚠️ Eliminando ${failedTokens.length} tokens inválidos...`);
            failedTokens.forEach(token => {
                const idx = registeredTokens.indexOf(token);
                if (idx > -1) {
                    registeredTokens.splice(idx, 1);
                }
            });
        }

        res.json({
            success: true,
            message: 'Notificaciones masivas enviadas',
            totalDevices: registeredTokens.length,
            sentCount: response.successCount,
            failedCount: response.failureCount,
            failedTokens: failedTokens.length > 0 ? failedTokens.map(t => t.substring(0, 20) + '...') : [],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error masivo:', error);
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

// Eliminar todos los tokens
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
        firebaseError: firebaseError || null,
        registeredDevices: registeredTokens.length,
        adminAvailable: !!admin,
        credentialAvailable: !!(admin && admin.credential)
    });
});

// API Status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        registeredDevices: registeredTokens.length,
        firebaseAvailable: firebaseInitialized,
        firebaseError: firebaseError || null,
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
    if (firebaseError) {
        console.log(`❌ Error: ${firebaseError}`);
    }
    console.log(`📊 Dispositivos registrados: ${registeredTokens.length}`);
    console.log(`\n📋 Endpoints disponibles:`);
    console.log(`  GET  /health              - Health check`);
    console.log(`  GET  /api/status          - Estado del servidor`);
    console.log(`  POST /api/register-device - Registrar dispositivo`);
    console.log(`  POST /api/send-notification - Enviar notificación`);
    console.log(`  POST /api/send-to-all     - Enviar a todos los dispositivos`);
    console.log(`  GET  /api/tokens          - Ver tokens registrados`);
    console.log(`  DELETE /api/tokens        - Eliminar todos los tokens`);
    console.log(`\n`);
});