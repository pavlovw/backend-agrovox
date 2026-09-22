import { Router } from 'express';
import { prisma, io } from '../index';

const router = Router();

router.post('/uplink', async (req, res) => {
  try {
    const { idNodo, tipo, bateria, senalDbm, latitud, longitud } = req.body;

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
        // Aquí podrías actualizar la señal (opcional)
        console.log(`📶 [GATEWAY PING]: ${idNodo} | Señal: ${senalDbm}dBm`);
      }
    } 
    // LÓGICA PARA NODOS
    else if (tipo === 'NODO') {
      let nodo = await prisma.nodo.findUnique({ where: { id: idNodo } });
      if (!nodo) {
        console.log(`📡 [NUEVO NODO HUÉRFANO]: ${idNodo}`);
        nodo = await prisma.nodo.create({
          data: { id: idNodo, bateria, estado: 'ACTIVO', latitud, longitud }
        });
        io.emit('nuevo-nodo-huerfano', nodo); 
      } else {
        console.log(`📶 [NODO PING]: ${idNodo} | Batería: ${bateria}%`);
        await prisma.nodo.update({ where: { id: idNodo }, data: { bateria } });
        io.emit('nodo-ping', nodo);
      }
    }

    res.status(200).json({ mensaje: 'Paquete procesado' });
  } catch (error) {
    console.error('Error procesando paquete LoRa:', error);
    res.status(500).json({ error: 'Error interno procesando uplink' });
  }
});

export default router;