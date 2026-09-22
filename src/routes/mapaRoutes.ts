import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

// GET /api/mapa/cliente/:clienteId
router.get('/cliente/:clienteId', async (req, res) => {
  try {
    const clienteId = parseInt(req.params.clienteId);
    
    // 1. Buscamos el cliente y sus datos asignados
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      include: {
        infraestructuras: true,
        sectores: { include: { nodos: true } },
        gateways: true
      }
    });

    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    // 2. Buscamos el hardware "huérfano" que flota en la red (listo para ser reclamado)
    const nodosHuerfanos = await prisma.nodo.findMany({ where: { sectorId: null } });
    const gatewaysHuerfanos = await prisma.gateway.findMany({ where: { clienteId: null } });

    // 3. Lo juntamos todo en un solo paquete y lo enviamos al frontend
    res.json({ ...cliente, nodosHuerfanos, gatewaysHuerfanos });
  } catch (error) {
    console.error('Error cargando mapa:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapa/cliente/:clienteId/importar
router.post('/cliente/:clienteId/importar', async (req, res) => {
  try {
    const clienteId = parseInt(req.params.clienteId);
    
    // Ahora leemos infraestructuras en plural
    const { infraestructuras, sectores } = req.body;

    // 1. Insertar Infraestructuras (Iterando sobre el array)
    if (infraestructuras && Array.isArray(infraestructuras)) {
      for (const infra of infraestructuras) {
        // Envolvemos en try-catch interno por si falla una coordenada, no aborte todo
        try {
          await prisma.infraestructura.create({
            data: {
              clienteId,
              nombre: infra.nombre || 'Infraestructura General',
              tipo: infra.tipo || 'CASETA',
              // Si tu DB usa String, cambiar a: JSON.stringify(infra.coordenadas)
              coordenadas: infra.coordenadas, 
              color: infra.color || '#3b82f6'
            }
          });
        } catch (error) {
          console.error(`Error insertando infraestructura ${infra.nombre}:`, error);
        }
      }
    }

    // 2. Insertar Sectores
    if (sectores && Array.isArray(sectores)) {
      for (const sector of sectores) {
        try {
          await prisma.sector.create({
            data: {
              clienteId,
              nombre: sector.nombre,
              cultivo: sector.cultivo || 'Sin especificar',
              coordenadas: sector.coordenadas,
              color: sector.color || '#22c55e'
            }
          });
        } catch (error) {
          console.error(`Error insertando sector ${sector.nombre}:`, error);
        }
      }
    }

    res.status(200).json({ mensaje: 'Mapa importado correctamente' });
  } catch (error) {
    console.error('Error importando mapa:', error);
    res.status(500).json({ error: 'Error procesando el archivo JSON' });
  }
});

// DELETE /api/mapa/sectores
router.delete('/sectores', async (req, res) => {
  try {
    const { sectorIds } = req.body;

    if (!sectorIds || !Array.isArray(sectorIds) || sectorIds.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron sectores para eliminar' });
    }

    // Usamos una transacción para asegurar la integridad de los datos
    await prisma.$transaction([
      // 1. Dejar "huérfanos" a los nodos (quitándoles el sectorId)
      prisma.nodo.updateMany({
        where: { sectorId: { in: sectorIds } },
        data: { sectorId: null }
      }),
      // 2. Eliminar los sectores de la base de datos
      prisma.sector.deleteMany({
        where: { id: { in: sectorIds } }
      })
    ]);

    res.json({ mensaje: 'Sectores eliminados y nodos desvinculados correctamente' });
  } catch (error) {
    console.error('Error eliminando sectores:', error);
    res.status(500).json({ error: 'Error interno del servidor al eliminar sectores' });
  }
});

// PUT /api/mapa/nodos/:id/asignar
router.put('/nodos/:id/asignar', async (req, res) => {
  try {
    const { sectorId } = req.body;
    await prisma.nodo.update({
      where: { id: req.params.id },
      data: { sectorId }
    });
    res.json({ mensaje: 'Nodo vinculado correctamente' });
  } catch (error) {
    console.error('Error asignando nodo:', error);
    res.status(500).json({ error: 'Error al vincular el nodo' });
  }
});

// PUT /api/mapa/gateways/:id/asignar
router.put('/gateways/:id/asignar', async (req, res) => {
  try {
    const { clienteId } = req.body;
    await prisma.gateway.update({
      where: { id: req.params.id },
      data: { clienteId }
    });
    res.json({ mensaje: 'Gateway vinculado correctamente' });
  } catch (error) {
    console.error('Error asignando gateway:', error);
    res.status(500).json({ error: 'Error al vincular el gateway' });
  }
});

export default router;