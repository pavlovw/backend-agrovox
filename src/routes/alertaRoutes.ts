import { Router } from 'express';
import { prisma, io } from '../index';
import { obtenerConfiguracionActual } from './configuracionRoutes';

const router = Router();

// Función auxiliar para auditar el estado actual de la red y crear alertas si no existen
let sincronizando = false;
export const sincronizarAlertasDeRed = async () => {
  if (sincronizando) return [];
  sincronizando = true;

  try {
    const config = await obtenerConfiguracionActual();
    const UMBRAL_BATERIA = config.bateriaMinima ?? 20;
    const UMBRAL_RSSI = config.rssiMinimoDbm ?? -110;

    // Ejecutamos las 3 lecturas EN PARALELO (3 veces más rápido en Render)
    const [nodos, gateways, alertasActivas] = await Promise.all([
      prisma.nodo.findMany({
        include: {
          sector: { include: { cliente: true } },
          lecturas: { orderBy: { createdAt: 'desc' }, take: 1 }
        }
      }),
      prisma.gateway.findMany({ include: { cliente: true } }),
      prisma.alertaSistema.findMany({ where: { estado: 'pending' } })
    ]);

    const existeAlertaActiva = (dispositivo: string, categoria: string) =>
      alertasActivas.some(a => a.dispositivo === dispositivo && a.categoria === categoria);

    const nuevasAlertas = [];

    for (const n of nodos) {
      // Si el nodo está en el simulador pero jamás se ha encendido ni asignado, lo ignoramos
      if (!n.sectorId && n.estado === 'INACTIVO' && n.lecturas.length === 0) {
        continue;
      }

      const ubicacion = n.sector
        ? `${n.sector.cliente?.nombre || 'Predio'} • ${n.sector.nombre}`
        : 'Sin asignar (Inventario / Terreno)';

      if ((n.estado === 'INACTIVO' || (n.bateria !== null && n.bateria <= 0)) && !existeAlertaActiva(n.id, 'CONECTIVIDAD')) {
        const alerta = await prisma.alertaSistema.create({
          data: {
            titulo: 'Nodo fuera de línea (Pérdida de comunicación)',
            descripcion: 'El dispositivo dejó de emitir paquetes LoRaWAN o agotó su batería (0%).',
            severidad: 'high',
            estado: 'pending',
            categoria: 'CONECTIVIDAD',
            dispositivo: n.id,
            ubicacion
          }
        });
        alertasActivas.push(alerta);
        nuevasAlertas.push(alerta);
      } else if (n.bateria !== null && n.bateria > 0 && n.bateria <= UMBRAL_BATERIA && !existeAlertaActiva(n.id, 'ENERGIA')) {
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
        alertasActivas.push(alerta);
        nuevasAlertas.push(alerta);
      }

      const ultimaLectura = n.lecturas[0];
      if (ultimaLectura?.rssi && ultimaLectura.rssi <= UMBRAL_RSSI && !existeAlertaActiva(n.id, 'RED_LORA')) {
        const alerta = await prisma.alertaSistema.create({
          data: {
            titulo: `Degradación crítica de señal LoRa (${ultimaLectura.rssi} dBm)`,
            descripcion: 'Alta atenuación por follaje o distancia al Gateway.',
            severidad: 'medium',
            estado: 'pending',
            categoria: 'RED_LORA',
            dispositivo: n.id,
            ubicacion
          }
        });
        alertasActivas.push(alerta);
        nuevasAlertas.push(alerta);
      }
    }

    for (const gw of gateways) {
      if (!gw.clienteId) continue;
      if (gw.estado === 'INACTIVO' && !existeAlertaActiva(gw.id, 'CONECTIVIDAD')) {
        const alerta = await prisma.alertaSistema.create({
          data: {
            titulo: 'Caída de Gateway LoRa Central',
            descripcion: 'El concentrador principal no responde al ping de red.',
            severidad: 'high',
            estado: 'pending',
            categoria: 'CONECTIVIDAD',
            dispositivo: gw.id,
            ubicacion: gw.cliente?.nombre || 'Predio'
          }
        });
        alertasActivas.push(alerta);
        nuevasAlertas.push(alerta);
      }
    }

    return nuevasAlertas;
  } finally {
    sincronizando = false;
  }
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