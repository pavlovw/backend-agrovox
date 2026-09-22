import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

// 1. OBTENER todos los clientes (Para la lista y el mapa general)
router.get('/', async (req, res) => {
  try {
    const clientes = await prisma.cliente.findMany({
      include: {
        gateways: true,
        sectores: {
          include: { nodos: true }
        },
        _count: {
          select: { sectores: true, gateways: true }
        }
      }
    });
    res.json(clientes);
  } catch (error) {
    console.error('Error obteniendo clientes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. CREAR un nuevo cliente
router.post('/', async (req, res) => {
  try {
    const { nombre, rut, email, telefono, latitud, longitud } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
    }

    const nuevoCliente = await prisma.cliente.create({
      data: {
        nombre,
        rut,
        email,
        telefono,
        latitud: latitud ? parseFloat(latitud) : null, // Convertimos el texto a Float
        longitud: longitud ? parseFloat(longitud) : null
      }
    });

    res.status(201).json({ mensaje: 'Cliente creado exitosamente', cliente: nuevoCliente });
  } catch (error) {
    console.error('Error creando cliente:', error);
    res.status(500).json({ error: 'Error interno del servidor guardando el cliente' });
  }
});

// 3. ELIMINAR un cliente y toda su descendencia (Nodos, Sectores, Lecturas, etc.)
router.delete('/:id', async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id);

    // Buscamos los sectores del cliente para saber qué nodos y lecturas borrar
    const sectores = await prisma.sector.findMany({ where: { clienteId } });
    const sectorIds = sectores.map(s => s.id);

    // Usamos $transaction para borrar todo en el orden correcto sin romper las relaciones
    await prisma.$transaction([
      prisma.lectura.deleteMany({ where: { nodo: { sectorId: { in: sectorIds } } } }),
      prisma.nodo.deleteMany({ where: { sectorId: { in: sectorIds } } }),
      prisma.sector.deleteMany({ where: { clienteId } }),
      prisma.gateway.deleteMany({ where: { clienteId } }),
      prisma.infraestructura.deleteMany({ where: { clienteId } }),
      prisma.cliente.delete({ where: { id: clienteId } })
    ]);

    res.json({ mensaje: 'Cliente y todos sus datos relacionados eliminados' });
  } catch (error) {
    console.error('Error eliminando cliente:', error);
    res.status(500).json({ error: 'Error interno del servidor al eliminar' });
  }
});

export default router;