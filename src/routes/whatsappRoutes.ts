import { Router } from 'express';
import { prisma, io } from '../index';
import { enviarConfirmacionRiegoWhatsApp } from '../services/whatsappService';

const router = Router();

// Verificación inicial de Meta (Webhook)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'agrovox_secret') {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Receptor del botón presionado en WhatsApp
router.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    // Detectamos si el usuario presionó el botón de respuesta
    if (message?.type === 'interactive' && message.interactive?.button_reply) {
      const buttonId = message.interactive.button_reply.id; // Ej: RIEGO_OK_AGV-001
      const telefonoRemitente = message.from;

      if (buttonId.startsWith('RIEGO_OK_')) {
        const idNodo = buttonId.replace('RIEGO_OK_', '');

        const nodo = await prisma.nodo.findUnique({ where: { id: idNodo } });

        if (nodo) {
          // Extraemos la batería de forma segura para TypeScript
          const bateriaActual = nodo.bateria ?? 100;

          // 1. Guardamos el evento histórico en PostgreSQL
          await prisma.lectura.create({
            data: {
              nodoId: idNodo,
              bateria: bateriaActual,
              cavitacion: false,
              rssi: -65,
              whatsappEnviado: true,
              riegoConfirmado: true // Registramos la confirmación
            }
          });

          // 2. Disparamos la actualización por WebSocket al navegador
          const payload = {
            id: idNodo,
            bateria: bateriaActual,
            estado: nodo.estado,
            cavitacion: false,
            whatsappEnviado: true,
            riegoConfirmado: true,
            createdAt: new Date().toISOString()
          };

          io.emit('nodo-ping', payload);

          // 3. Le respondemos al agricultor por WhatsApp
          await enviarConfirmacionRiegoWhatsApp(telefonoRemitente, idNodo);
          console.log(`💧 [RIEGO CONFIRMADO]: Agricultor activó riego en ${idNodo}`);
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error procesando webhook de WhatsApp:', error);
    res.sendStatus(500);
  }
});

// RUTA AUXILIAR DE RESPALDO (Por si estás en localhost sin ngrok durante la presentación)
router.post('/simular-riego', async (req, res) => {
  const { idNodo } = req.body;
  const nodo = await prisma.nodo.findUnique({ where: { id: idNodo } });
  if (!nodo) return res.status(404).json({ error: 'Nodo no encontrado' });

  // Extraemos la batería de forma segura para TypeScript
  const bateriaActual = nodo.bateria ?? 100;

  await prisma.lectura.create({
    data: {
      nodoId: idNodo,
      bateria: bateriaActual,
      cavitacion: false,
      rssi: -65,
      whatsappEnviado: true,
      riegoConfirmado: true
    }
  });

  io.emit('nodo-ping', {
    id: idNodo,
    bateria: bateriaActual,
    estado: nodo.estado,
    cavitacion: false,
    whatsappEnviado: true,
    riegoConfirmado: true,
    createdAt: new Date().toISOString()
  });

  res.json({ mensaje: 'Riego simulado correctamente' });
});

export default router;