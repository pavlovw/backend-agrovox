import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

router.get('/:id', async (req, res) => {
  try {
    const nodo = await prisma.nodo.findUnique({
      where: { id: req.params.id },
      include: {
        sector: { include: { cliente: true } },
        lecturas: {
          orderBy: { createdAt: 'desc' },
          take: 30 // Traemos los últimos 30 eventos para el historial y gráfico
        }
      }
    });

    if (!nodo) {
      return res.status(404).json({ error: 'Nodo no encontrado' });
    }

    res.json(nodo);
  } catch (error) {
    console.error('Error obteniendo detalle de nodo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;