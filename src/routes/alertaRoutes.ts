import { Router } from 'express';
import { prisma, io } from '../index';
import { obtenerConfiguracionActual } from './configuracionRoutes';

const router = Router();

// Función auxiliar para auditar el estado actual de la red y crear alertas si no existen
export const sincronizarAlertasDeRed = async () => {
    const config = await obtenerConfiguracionActual();
  const UMBRAL_BATERIA = config.bateriaMinima; // Ahora es dinámico (ej. 20%)
  const UMBRAL_RSSI = config.rssiMinimoDbm;


  const nodos = await prisma.nodo.findMany({
    include: {
      sector: { include: { cliente: true } },
      lecturas: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  });

  const gateways = await prisma.gateway.findMany({
    include: { cliente: true }
  });

  const alertasActivas = await prisma.alertaSistema.findMany({
    where: { estado: 'pending' }
  });

  const existeAlertaActiva = (dispositivo: string, categoria: string) =>
    alertasActivas.some(a => a.dispositivo === dispositivo && a.categoria === categoria);

  const nuevasAlertas = [];

  for (const n of nodos) {
    const ubicacion = n.sector
      ? `${n.sector.cliente?.nombre || 'Predio'} • ${n.sector.nombre}`
      : 'Sin asignar (Inventario / Terreno)';

    // 1. Nodo sin energía / Inactivo
    if ((n.estado === 'INACTIVO' || (n.bateria !== null && n.bateria <= 0)) && !existeAlertaActiva(n.id, 'CONECTIVIDAD')) {
      const alerta = await prisma.alertaSistema.create({
        data: {
          titulo: 'Nodo fuera de línea (Pérdida de comunicación)',
          descripcion: 'El dispositivo dejó de emitir paquetes LoRaWAN o agotó su reserva energética (0%). Requiere inspección en terreno.',
          severidad: 'high',
          estado: 'pending',
          categoria: 'CONECTIVIDAD',
          dispositivo: n.id,
          ubicacion
        }
      });
      nuevasAlertas.push(alerta);
    }
    // 2. Batería Solar Baja (1% a 20%)
    else if (n.bateria !== null && n.bateria > 0 && n.bateria <= UMBRAL_BATERIA && !existeAlertaActiva(n.id, 'ENERGIA')) {
      const alerta = await prisma.alertaSistema.create({
        data: {
          titulo: `Batería solar bajo el umbral (${n.bateria}%)`,
          descripcion: 'Descarga pronunciada detectada. Revisar orientación o limpieza del panel solar.',
          severidad: n.bateria <= 10 ? 'high' : 'medium',
          estado: 'pending',
          categoria: 'ENERGIA',
          dispositivo: n.id,
          ubicacion
        }
      });
      nuevasAlertas.push(alerta);
    }

    // 3. Señal LoRaWAN degradada (RSSI <= -110 dBm)
    const ultimaLectura = n.lecturas[0];
    if (ultimaLectura?.rssi && ultimaLectura.rssi <= UMBRAL_RSSI && !existeAlertaActiva(n.id, 'RED_LORA')) {
      const alerta = await prisma.alertaSistema.create({
        data: {
          titulo: `Degradación crítica de señal LoRa (${ultimaLectura.rssi} dBm)`,
          descripcion: 'Alta atenuación por follaje o distancia al Gateway. Riesgo de pérdida de paquetes.',
          severidad: 'medium',
          estado: 'pending',
          categoria: 'RED_LORA',
          dispositivo: n.id,
          ubicacion
        }
      });
      nuevasAlertas.push(alerta);
    }

    // 4. Hardware Huérfano pendiente de vinculación
    if (!n.sectorId && !existeAlertaActiva(n.id, 'SISTEMA')) {
      const alerta = await prisma.alertaSistema.create({
        data: {
          titulo: 'Dispositivo Zero-Touch pendiente de asignación',
          descripcion: 'El nodo está transmitiendo telemetría pero aún no ha sido vinculado a ningún polígono de riego.',
          severidad: 'info',
          estado: 'pending',
          categoria: 'SISTEMA',
          dispositivo: n.id,
          ubicacion: 'Red LoRa Global (Sin Sector)'
        }
      });
      nuevasAlertas.push(alerta);
    }
  }

  for (const gw of gateways) {
    const ubicacionGw = gw.cliente ? gw.cliente.nombre : 'Caseta sin asignar';
    if (gw.estado === 'INACTIVO' && !existeAlertaActiva(gw.id, 'CONECTIVIDAD')) {
      const alerta = await prisma.alertaSistema.create({
        data: {
          titulo: 'Caída de Gateway LoRa Central',
          descripcion: 'El concentrador principal no responde al ping de red. Peligro de punto ciego en todo el predio.',
          severidad: 'high',
          estado: 'pending',
          categoria: 'CONECTIVIDAD',
          dispositivo: gw.id,
          ubicacion: ubicacionGw
        }
      });
      nuevasAlertas.push(alerta);
    }
  }

  return nuevasAlertas;
};

// GET /api/alertas -> Obtiene todas las alertas (y sincroniza el estado actual de los equipos)
router.get('/', async (req, res) => {
  try {
    await sincronizarAlertasDeRed();

    const alertas = await prisma.alertaSistema.findMany({
      orderBy: [
        { estado: 'asc' }, // 'pending' primero, 'resolved' después
        { createdAt: 'desc' }
      ],
      take: 100
    });

    res.json(alertas);
  } catch (error) {
    console.error('Error obteniendo alertas de sistema:', error);
    res.status(500).json({ error: 'Error interno obteniendo alertas' });
  }
});

// POST /api/alertas/auditar -> Fuerza un escaneo profundo de toda la red
router.post('/auditar', async (req, res) => {
  try {
    const nuevas = await sincronizarAlertasDeRed();
    if (nuevas.length > 0) {
      io.emit('alertas-actualizadas');
    }
    res.json({ mensaje: 'Auditoría completada', nuevasDetectadas: nuevas.length });
  } catch (error) {
    res.status(500).json({ error: 'Error auditando red' });
  }
});

// PUT /api/alertas/:id/estado -> Cambia entre 'pending' y 'resolved'
router.put('/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body; // 'pending' | 'resolved'

    const actualizada = await prisma.alertaSistema.update({
      where: { id: Number(id) },
      data: {
        estado,
        resolvedAt: estado === 'resolved' ? new Date() : null
      }
    });

    io.emit('alerta-sistema-actualizada', actualizada);
    res.json(actualizada);
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando estado de la alerta' });
  }
});

// PUT /api/alertas/resolver-todas -> Marca todas las pendientes como resueltas
router.put('/resolver-todas', async (req, res) => {
  try {
    await prisma.alertaSistema.updateMany({
      where: { estado: 'pending' },
      data: { estado: 'resolved', resolvedAt: new Date() }
    });

    io.emit('alertas-actualizadas');
    res.json({ mensaje: 'Todas las alertas fueron marcadas como resueltas' });
  } catch (error) {
    res.status(500).json({ error: 'Error resolviendo alertas en lote' });
  }
});

// DELETE /api/alertas/limpiar-resueltas -> Limpia el historial de alertas ya resueltas
router.delete('/limpiar-resueltas', async (req, res) => {
  try {
    await prisma.alertaSistema.deleteMany({
      where: { estado: 'resolved' }
    });
    io.emit('alertas-actualizadas');
    res.json({ mensaje: 'Historial de alertas resueltas limpiado' });
  } catch (error) {
    res.status(500).json({ error: 'Error limpiando alertas' });
  }
});

export default router;