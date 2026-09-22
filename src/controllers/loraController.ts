import { Request, Response } from 'express';
import { prisma, io } from '../index'; 

export const recibirLecturaLora = async (req: Request, res: Response) => {
  try {
    // 1. Recibir el payload con las nuevas variables de calidad de red
    const { nodoId, bateria, cavitacion, rssi, snr } = req.body;

    if (!nodoId || bateria === undefined || cavitacion === undefined) {
      return res.status(400).json({ error: 'Faltan datos obligatorios del nodo.' });
    }

    let nodo = await prisma.nodo.findUnique({ where: { id: nodoId } });

    // Si el nodo no existe, lo creamos con el nuevo enum de estado
    if (!nodo) {
      nodo = await prisma.nodo.create({
        data: {
          id: nodoId,
          estado: 'ACTIVO', // <-- Solución al error TS2353
        }
      });
      console.log(`📡 Nuevo nodo registrado en la BD: ${nodo.id}`);
    }

    // 2. Guardar la lectura incluyendo la calidad de red LoRaWAN
    const nuevaLectura = await prisma.lectura.create({
      data: {
        nodoId,
        bateria,
        cavitacion,
        rssi,
        snr
      }
    });

    if (cavitacion) {
      io.emit('alerta_nodo', {
        nodoId: nodo.id,
        sectorId: nodo.sectorId,
        estado: 'ALERTA',
        mensaje: `¡Cavitación detectada en el nodo ${nodo.id}!`
      });
      console.log(`🚨 ALERTA EMITIDA: Cavitación en nodo ${nodo.id}`);
    }

    res.status(200).json({ 
      mensaje: 'Lectura procesada y guardada correctamente', 
      lectura: nuevaLectura 
    });

  } catch (error) {
    console.error('Error procesando webhook LoRa:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};