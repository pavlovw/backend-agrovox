import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

// 1. IMPORTAMOS TODAS LAS RUTAS
import loraRoutes from './routes/loraRoutes';
import mapaRoutes from './routes/mapaRoutes';
import clienteRoutes from './routes/clienteRoutes'; 
import simuladorRoutes from './routes/simuladorRoutes';

const app = express();
const server = http.createServer(app);

// === NUEVA CONFIGURACIÓN DE SEGURIDAD (CORS) ===
const origenesPermitidos = [
  "http://localhost:3000",
  "https://agro-vox-demo.vercel.app" 
];

// Configuración para WebSockets (Socket.io)
export const io = new Server(server, {
  cors: {
    origin: origenesPermitidos,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

export const prisma = new PrismaClient();

// Middlewares - Configuración para peticiones HTTP (Express)
app.use(cors({ origin: origenesPermitidos, credentials: true }));
app.use(express.json());

// 2. MONTAMOS LAS RUTAS (Esto es lo que evita el error 404)
app.use('/api/lora', loraRoutes);
app.use('/api/mapa', mapaRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/simulador', simuladorRoutes);

// Ruta base para saber si el servidor está vivo
app.get('/', (req, res) => {
  res.send('🌱 API de AgroVox funcionando correctamente');
});

// WebSockets
io.on('connection', (socket) => {
  console.log('🟢 Nuevo cliente conectado al Dashboard (Next.js):', socket.id);

  socket.on('disconnect', () => {
    console.log('🔴 Cliente desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Servidor backend de AgroVox corriendo en http://localhost:${PORT}`);
});
