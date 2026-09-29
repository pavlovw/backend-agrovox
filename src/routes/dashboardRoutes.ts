import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

router.get('/resumen', async (req, res) => {
  try {
    // 1. Hardware Huérfano (Nodos y Gateways sin asignar)
    const nodosHuerfanos = await prisma.nodo.findMany({ where: { sectorId: null } });
    const gatewaysHuerfanos = await prisma.gateway.findMany({ where: { clienteId: null } });
    
    // 2. Alertas Críticas: Cavitación
    const alertasCavitacion = await prisma.nodo.findMany({
      where: { estado: 'ALERTA' },
      include: { 
        sector: { 
          include: { cliente: true } // Extraemos el cliente a través del sector
        } 
      } 
    });

    // 3. Alertas Críticas: Equipos Asignados que se apagaron
    const nodosCaidos = await prisma.nodo.findMany({
      where: { estado: 'INACTIVO', sectorId: { not: null } },
      include: { 
        sector: { 
          include: { cliente: true } 
        } 
      }
    });
    
    const gatewaysCaidos = await prisma.gateway.findMany({
      where: { estado: 'INACTIVO', clienteId: { not: null } },
      include: { cliente: true }
    });

    // 4. Cálculos Matemáticos (KPIs)
    const gatewaysOffline = await prisma.gateway.count({
      // Tu regla: Contar como offline si está inactivo O si no tiene cliente
      where: { OR: [{ estado: 'INACTIVO' }, { clienteId: null }] }
    });

    const nodosBateriaCritica = await prisma.nodo.count({
      where: { bateria: { lte: 15, gt: 0 } }
    });

    // Buscar los nodos con batería entre 1% y 15%
    const nodosBateriaBaja = await prisma.nodo.findMany({
      where: { bateria: { lte: 15, gt: 0 } },
      include: { 
        sector: { 
          include: { cliente: true } 
        } 
      }
    });

    res.json({
      metricas: {
        alertasCavitacion: alertasCavitacion.length,
        gatewaysOffline,
        nodosBateriaCritica,
        huerfanosPendientes: nodosHuerfanos.length + gatewaysHuerfanos.length
      },
      alertasCavitacion,
      equiposCaidos: { nodos: nodosCaidos, gateways: gatewaysCaidos },
      nodosBateriaBaja,
      hardwareHuerfano: [...nodosHuerfanos, ...gatewaysHuerfanos] // Unificamos la bandeja Zero-Touch
    });
  } catch (error) {
    console.error('Error cargando resumen del dashboard:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;