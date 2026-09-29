import { Router } from 'express';
import { prisma, io } from '../index';
import { EstadoDispositivo } from '@prisma/client';
import { despacharAlertaWhatsApp } from '../services/whatsappService';

const router = Router();

router.post('/uplink', async (req, res) => {
  try {
    let { idNodo, tipo, bateria, senalDbm, latitud, longitud, cavitacion } = req.body;

    // --- BLINDAJE DE TIPOS PARA PRISMA (POSTGRESQL) ---
    // Nos aseguramos de que todo sea un número puro antes de guardarlo
    if (bateria !== undefined && bateria !== null) bateria = Math.round(parseFloat(bateria));
    if (latitud !== undefined && latitud !== null) latitud = parseFloat(latitud);
    if (longitud !== undefined && longitud !== null) longitud = parseFloat(longitud);
    if (senalDbm !== undefined && senalDbm !== null) senalDbm = Math.round(parseFloat(senalDbm));
    cavitacion = Boolean(cavitacion);
    // --------------------------------------------------

    // LÓGICA PARA GATEWAYS
    if (tipo === 'GATEWAY') {
      let gw = await prisma.gateway.findUnique({ where: { id: idNodo } });
      if (!gw) {
        console.log(`📡 [NUEVO GATEWAY HUÉRFANO]: ${idNodo}`);
        gw = await prisma.gateway.create({
          data: { id: idNodo, estado: 'ACTIVO', latitud, longitud }
        });
        io.emit('nuevo-gateway-huerfano', gw);
      } else {
        console.log(`📶 [GATEWAY PING]: ${idNodo} | Señal: ${senalDbm}dBm`);
      }
    } 
    // LÓGICA PARA NODOS
    else if (tipo === 'NODO') {
      // Modificamos la búsqueda para traernos el teléfono del cliente
      let nodo = await prisma.nodo.findUnique({ 
        where: { id: idNodo },
        include: { sector: { include: { cliente: true } } } 
      });

      let nuevoEstado: EstadoDispositivo = 'ACTIVO';
      if (bateria <= 0) {
        nuevoEstado = 'INACTIVO';
      } else if (cavitacion) {
        nuevoEstado = 'ALERTA';
      }

      if (!nodo) {
        // ... (Lógica de creación de nodo huérfano intacta)
      } else {
        const esAlertaNueva = nuevoEstado === 'ALERTA' && nodo.estado !== 'ALERTA';
        const seApago = nuevoEstado === 'INACTIVO' && nodo.estado !== 'INACTIVO';
        
        await prisma.nodo.update({ 
          where: { id: idNodo }, 
          data: { bateria, estado: nuevoEstado } 
        });

        // Verificamos si es una alerta nueva y si el cliente tiene teléfono registrado
        let whatsappExitoso = false;
        if (esAlertaNueva && nodo.sector?.cliente?.telefono && nodo.latitud && nodo.longitud) {
          whatsappExitoso = await despacharAlertaWhatsApp(
            nodo.sector.cliente.telefono,
            nodo.id,
            nodo.sector.nombre,
            nodo.sector.cliente.nombre,
            nodo.latitud,
            nodo.longitud
          );
        }

        // GUARDAMOS EL HISTORIAL INCLUYENDO EL ESTADO DEL MENSAJE
        // GUARDAMOS EL HISTORIAL INCLUYENDO EL ESTADO DEL MENSAJE
        await prisma.lectura.create({
          data: {
            nodoId: idNodo,
            bateria: bateria,
            cavitacion: cavitacion || false,
            rssi: senalDbm !== undefined ? senalDbm : -65,
            whatsappEnviado: whatsappExitoso
          }
        });

        // NUEVO: Creamos un paquete de datos completo para el frontend
        const payloadSocket = {
          id: idNodo,
          bateria,
          estado: nuevoEstado,
          senalDbm: senalDbm !== undefined ? senalDbm : -65,
          cavitacion: cavitacion || false,
          whatsappEnviado: whatsappExitoso || false
        };

        if (seApago) {
          console.log(`⚠️ [NODO CAÍDO]: ${idNodo} sin energía. Estado inactivo.`);
          io.emit('nodo-ping', payloadSocket);
        } else if (esAlertaNueva) {
          console.log(`🚨 [NUEVA ALERTA]: Estrés hídrico en ${idNodo}. WhatsApp enviado: ${whatsappExitoso}`);
          io.emit('alerta_nodo', { nodoId: idNodo });
          // Ahora TAMBIÉN emitimos el ping normal para que se guarde en la bitácora
          io.emit('nodo-ping', payloadSocket);
        } else {
          console.log(`📶 [NODO PING]: ${idNodo} | Bat: ${bateria}% | Estado: ${nuevoEstado}`);
          io.emit('nodo-ping', payloadSocket);
        }
      }
    }

    res.status(200).json({ mensaje: 'Paquete procesado' });
  } catch (error) {
    console.error('❌ Error CRÍTICO procesando paquete LoRa:', error); // Esto te dirá exactamente qué columna falló
    res.status(500).json({ error: 'Error interno procesando uplink' });
  }
});

export default router;
