const express = require('express');
const router = express.Router();

// Configuración desde variables de entorno
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const FCM_TOKEN = process.env.FCM_TOKEN || '';

// Endpoint para obtener configuración
router.get('/config', (req, res) => {
    res.json({
        backendUrl: BACKEND_URL,
        fcmToken: FCM_TOKEN ? 'configured' : 'not configured',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Endpoint para enviar a todos
router.post('/send-to-all', async (req, res) => {
    try {
        const { title, body, data } = req.body;

        // Aquí implementa la lógica para enviar a todos los tokens
        // O redirige al backend principal
        
        res.json({
            success: true,
            message: 'Notificaciones masivas enviadas',
            totalDevices: 0, // Reemplazar con el conteo real
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint proxy para registrar dispositivo
router.post('/register-device', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Token es requerido'
            });
        }

        // Aquí puedes agregar lógica para almacenar tokens en una base de datos
        // o simplemente reenviar al backend

        res.json({
            success: true,
            message: 'Dispositivo registrado correctamente',
            token: token,
            registeredAt: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint proxy para enviar notificación
router.post('/send-notification', async (req, res) => {
    try {
        const { token, title, body } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Token es requerido'
            });
        }

        // En una implementación real, aquí enviarías la notificación
        // usando el backend o directamente FCM
        
        res.json({
            success: true,
            message: 'Notificación enviada correctamente',
            data: {
                token,
                title: title || 'Notificación de prueba',
                body: body || 'Esta es una notificación de prueba',
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint para ver estado
router.get('/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        backend: BACKEND_URL
    });
});

module.exports = router;