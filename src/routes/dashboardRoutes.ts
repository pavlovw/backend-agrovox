import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

router.get('/resumen', async (req, res) => {
  try {
    // Ejecutamos TODAS las consultas en paralelo (6x más rápido en Render)
    const [
      nodosHuerfanos,
      gatewaysHuerfanos,
      alertasCavitacion,
      nodosCaidos,
      gatewaysCaidos,
      nodosBateriaBaja
    ] = await Promise.all([
      prisma.nodo.findMany({
        where: {
          sectorId: null,
          OR: [{ estado: { not: 'INACTIVO' } }, { lecturas: { some: {} } }]
        }
      }),
      prisma.gateway.findMany({
        where: { clienteId: null, estado: 'ACTIVO' }
      }),
      prisma.nodo.findMany({
        where: { estado: 'ALERTA' },
        include: { sector: { include: { cliente: true } } }
      }),
      prisma.nodo.findMany({
        where: { estado: 'INACTIVO', sectorId: { not: null } },
        include: { sector: { include: { cliente: true } } }
      }),
      prisma.gateway.findMany({
        where: { estado: 'INACTIVO', clienteId: { not: null } },
        include: { cliente: true }
      }),
      prisma.nodo.findMany({
        where: { bateria: { lte: 15, gt: 0 } },
        include: { sector: { include: { cliente: true } } }
      })
    ]);

    res.json({
      metricas: {
        alertasCavitacion: alertasCavitacion.length,
        gatewaysOffline: gatewaysCaidos.length,
        nodosBateriaCritica: nodosBateriaBaja.length,
        huerfanosPendientes: nodosHuerfanos.length + gatewaysHuerfanos.length
      },
      alertasCavitacion,
      equiposCaidos: { nodos: nodosCaidos, gateways: gatewaysCaidos },
      nodosBateriaBaja,
      hardwareHuerfano: [...gatewaysHuerfanos, ...nodosHuerfanos]
    });
  } catch (error) {
    console.error('Error cargando resumen del dashboard:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;