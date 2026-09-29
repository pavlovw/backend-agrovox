import { Router } from 'express';
import { prisma } from '../index'; 

const router = Router();

// 1. Endpoint para borrar el hardware y empezar de 0
router.delete('/reset-db', async (req, res) => {
    try {
        await prisma.lectura.deleteMany({});
        await prisma.nodo.deleteMany({});
        await prisma.gateway.deleteMany({});
        res.status(200).json({ mensaje: 'Base de datos en cero' });
    } catch (error) {
        console.error('Error reseteando BD:', error);
        res.status(500).json({ error: 'Error reseteando PostgreSQL' });
    }
});

// 2. Endpoint para guardar el JSON masivamente en PostgreSQL
router.post('/aprovisionar', async (req, res) => {
    try {
        const { gateways, nodos } = req.body;

        await prisma.lectura.deleteMany({});
        await prisma.nodo.deleteMany({});
        await prisma.gateway.deleteMany({});

        if (gateways && gateways.length > 0) {
            for (const gw of gateways) {
                await prisma.gateway.create({
                    data: {
                        id: gw.id,
                        estado: 'INACTIVO',
                        latitud: parseFloat(gw.latitud) || 0,
                        longitud: parseFloat(gw.longitud) || 0
                    }
                });
            }
        }

        if (nodos && nodos.length > 0) {
            for (const n of nodos) {
                await prisma.nodo.create({
                    data: {
                        id: n.id,
                        estado: 'INACTIVO',
                        bateria: 100,
                        latitud: parseFloat(n.latitud) || 0,
                        longitud: parseFloat(n.longitud) || 0
                    }
                });
            }
        }

        res.status(200).json({ mensaje: 'Hardware aprovisionado con éxito' });
    } catch (error) {
        console.error('Error en el aprovisionamiento:', error);
        res.status(500).json({ error: 'Error interno insertando hardware' });
    }
});

// 3. NUEVO: Endpoint para que cualquier celular o PC consulte el hardware existente
router.get('/dispositivos', async (req, res) => {
    try {
        const gateways = await prisma.gateway.findMany({ orderBy: { id: 'asc' } });
        const nodos = await prisma.nodo.findMany({ orderBy: { id: 'asc' } });
        res.status(200).json({ gateways, nodos });
    } catch (error) {
        console.error('Error obteniendo dispositivos:', error);
        res.status(500).json({ error: 'Error consultando PostgreSQL' });
    }
});

router.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Laboratorio IoT AgroVox - RF Realista</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-950 text-slate-300 min-h-screen font-mono flex flex-col" onload="cargarEstado()">
        
        <header class="bg-slate-900 border-b border-slate-800 p-4 md:p-6 flex flex-wrap justify-between items-center gap-4 shrink-0 shadow-md">
            <h1 class="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
                📡 Simulador de Hardware
            </h1>
            <div class="flex flex-wrap gap-2 items-center">
                <button onclick="resetearBD()" class="bg-red-800 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition-colors text-xs md:text-sm font-bold shadow-lg border border-red-500/50">
                    ⚠️ Resetear BD
                </button>

                <button onclick="limpiarEstado()" class="bg-orange-600/80 hover:bg-orange-500 text-white px-3 py-2 rounded-lg transition-colors text-xs md:text-sm font-bold shadow-lg border border-orange-500/50">
                    🧹 Limpiar Pantalla
                </button>

                <label class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors text-xs md:text-sm font-bold shadow-lg">
                    📥 Importar JSON
                    <input type="file" id="fileInput" accept=".json" class="hidden" onchange="importarHardware(event)">
                </label>
            </div>
        </header>

        <div class="flex flex-col md:flex-row flex-1 overflow-hidden">
            
            <div class="w-full md:w-1/2 bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto p-4 md:p-6 space-y-6">
                
                <div>
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-base font-bold text-slate-400 uppercase tracking-widest">Gateways de Enlace</h2>
                        <button onclick="toggleGlobal('gateways')" class="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-700 transition-colors shadow-sm">
                            ON/OFF Todos
                        </button>
                    </div>
                    <div id="lista-gateways" class="space-y-3">
                        <p class="text-xs text-slate-600 italic">Sincronizando con PostgreSQL...</p>
                    </div>
                </div>

                <hr class="border-slate-800 my-4">

                <div>
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-base font-bold text-slate-400 uppercase tracking-widest">Nodos (Sensores)</h2>
                        <button onclick="toggleGlobal('nodos')" class="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-700 transition-colors shadow-sm">
                            ON/OFF Todos
                        </button>
                    </div>
                    <div id="lista-nodos" class="space-y-3">
                        <p class="text-xs text-slate-600 italic">Sincronizando con PostgreSQL...</p>
                    </div>
                </div>

            </div>

            <div class="w-full md:w-1/2 bg-black p-4 md:p-6 flex flex-col h-72 md:h-auto">
                <div class="flex justify-between items-center mb-3 shrink-0">
                    <h2 class="text-sm md:text-base font-bold text-green-500 uppercase tracking-widest">Terminal LoRaWAN</h2>
                    <button onclick="document.getElementById('consola').innerHTML=''" class="text-xs text-slate-500 hover:text-white transition-colors bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">Limpiar</button>
                </div>
                <div id="consola" class="flex-1 overflow-y-auto bg-slate-900/50 rounded-xl border border-slate-800 p-4 text-xs font-mono space-y-1 shadow-inner">
                    <div class="text-slate-600">Esperando inicialización de dispositivos...</div>
                </div>
            </div>
        </div>

        <script>
            let hardware = { gateways: [], nodos: [] };
            const INTERVALO_PING = 10000; 
            const DESGASTE_BATERIA = 0.5; 

            function guardarEstado() {
                const copia = JSON.parse(JSON.stringify(hardware));
                copia.gateways.forEach(g => delete g.timer);
                copia.nodos.forEach(n => delete n.timer);
                localStorage.setItem('agrovox_hardware', JSON.stringify(copia));
            }

            // SINCRONIZACIÓN AUTOMÁTICA CON POSTGRESQL
            async function cargarEstado() {
                try {
                    const res = await fetch('/simulador/dispositivos');
                    if (res.ok) {
                        const data = await res.json();
                        if ((data.gateways && data.gateways.length > 0) || (data.nodos && data.nodos.length > 0)) {
                            const memoriaLocal = JSON.parse(localStorage.getItem('agrovox_hardware') || '{}');

                            hardware.gateways = (data.gateways || []).map(gw => {
                                const local = (memoriaLocal.gateways || []).find(g => g.id === gw.id);
                                const encendido = local ? local.encendido : false;
                                return {
                                    id: gw.id,
                                    latitud: gw.latitud,
                                    longitud: gw.longitud,
                                    tipo: 'GATEWAY',
                                    encendido: encendido,
                                    senalDbm: local ? local.senalDbm : -68,
                                    segundosMalaSenal: 0,
                                    timer: null
                                };
                            });

                            hardware.nodos = (data.nodos || []).map(nodo => {
                                const local = (memoriaLocal.nodos || []).find(n => n.id === nodo.id);
                                const encendido = local ? local.encendido : false;
                                return {
                                    id: nodo.id,
                                    latitud: nodo.latitud,
                                    longitud: nodo.longitud,
                                    tipo: 'NODO',
                                    encendido: encendido,
                                    bateria: local ? local.bateria : (nodo.bateria ?? 100),
                                    cavitacion: local ? local.cavitacion : false,
                                    senalDbm: local ? local.senalDbm : -70,
                                    segundosMalaSenal: 0,
                                    timer: null
                                };
                            });

                            // Reactivar temporizadores si estaban encendidos localmente
                            hardware.gateways.forEach(gw => {
                                if (gw.encendido) gw.timer = setInterval(() => transmitirPaquete(gw), INTERVALO_PING);
                            });
                            hardware.nodos.forEach(nodo => {
                                if (nodo.encendido) nodo.timer = setInterval(() => transmitirPaquete(nodo), INTERVALO_PING);
                            });

                            logTerminal('Sistema', 'Hardware cargado directamente desde PostgreSQL.', 'text-green-400 font-bold');
                            renderUI();
                            return;
                        }
                    }
                } catch (e) {
                    console.warn('Error consultando base de datos:', e);
                }

                // Fallback a localStorage si la red falló
                const memoria = localStorage.getItem('agrovox_hardware');
                if (memoria) {
                    try {
                        hardware = JSON.parse(memoria);
                        renderUI();
                    } catch (e) { console.error(e); }
                }
            }

            function limpiarEstado() {
                localStorage.removeItem('agrovox_hardware');
                hardware.gateways.forEach(gw => clearInterval(gw.timer));
                hardware.nodos.forEach(n => clearInterval(n.timer));
                hardware = { gateways: [], nodos: [] };
                renderUI();
            }

            async function resetearBD() {
                const confirmacion = confirm("⚠️ ATENCIÓN: Esto borrará TODOS los Nodos, Gateways y el Historial de PostgreSQL.\\n\\n¿Deseas continuar?");
                if (!confirmacion) return;

                try {
                    const response = await fetch('/simulador/reset-db', { method: 'DELETE' });
                    if (response.ok) {
                        limpiarEstado();
                        logTerminal('SISTEMA', 'BASE DE DATOS FORMATEADA CON ÉXITO.', 'text-red-500 font-bold');
                        alert("✅ Base de datos limpiada con éxito.");
                    } else { alert("❌ Error al borrar la base de datos."); }
                } catch (error) { alert("❌ Error de red."); }
            }

            function importarHardware(event) {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        
                        const res = await fetch('/simulador/aprovisionar', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(data)
                        });

                        if (!res.ok) throw new Error("Error en aprovisionamiento BD");

                        hardware.gateways = (data.gateways || []).map(gw => ({
                            ...gw, tipo: 'GATEWAY', encendido: false, senalDbm: -68, segundosMalaSenal: 0, timer: null 
                        }));
                        
                        hardware.nodos = (data.nodos || []).map(nodo => ({
                            ...nodo, tipo: 'NODO', encendido: false, bateria: 100, cavitacion: false, senalDbm: -70, segundosMalaSenal: 0, timer: null 
                        }));

                        logTerminal('Sistema', 'Equipos guardados en PostgreSQL. Listos para operar.', 'text-blue-400 font-bold');
                        guardarEstado();
                        renderUI();
                    } catch (err) {
                        alert("Error leyendo o insertando JSON");
                    }
                };
                reader.readAsText(file);
                event.target.value = '';
            }

            setInterval(() => {
                const dispositivosActivos = [...hardware.gateways, ...hardware.nodos].filter(d => d.encendido);
                dispositivosActivos.forEach(item => {
                    if (item.segundosMalaSenal > 0) {
                        item.segundosMalaSenal--;
                        item.senalDbm = -105 - Math.floor(Math.random() * 21);
                    } else {
                        if (Math.random() < 0.20) {
                            item.segundosMalaSenal = 3 + Math.floor(Math.random() * 3); 
                            item.senalDbm = -105 - Math.floor(Math.random() * 21);
                        } else {
                            item.senalDbm = -65 - Math.floor(Math.random() * 18);
                        }
                    }
                    const el = document.getElementById('signal-val-' + item.id);
                    if (el) {
                        const esCritica = item.senalDbm <= -100;
                        el.innerText = '📶 ' + item.senalDbm + ' dBm';
                        el.className = esCritica ? 'text-amber-400 font-bold animate-pulse' : 'text-slate-400 font-medium';
                    }
                });
            }, 1000);

            function setBateria(id, valor) {
                const nodo = hardware.nodos.find(x => x.id === id);
                if (nodo) {
                    nodo.bateria = parseFloat(valor);
                    document.getElementById('bat-val-' + id).innerText = nodo.bateria + '%';
                    guardarEstado();
                    if (nodo.encendido) transmitirPaquete(nodo);
                }
            }

            function toggleCavitacion(id) {
                const nodo = hardware.nodos.find(x => x.id === id);
                if (nodo) {
                    nodo.cavitacion = !nodo.cavitacion;
                    renderUI();
                    guardarEstado();
                    if (nodo.encendido) transmitirPaquete(nodo);
                }
            }

            function renderUI() {
                const drawItem = (d, type) => {
                    const isAlert = type === 'nodos' && d.cavitacion;
                    const borderColor = d.encendido ? (isAlert ? 'border-red-500/50' : 'border-green-500/50') : 'border-slate-700';
                    const textColor = d.encendido ? (isAlert ? 'text-red-400' : 'text-green-400') : 'text-slate-400';
                    const senalColor = d.senalDbm <= -100 ? 'text-amber-400 font-bold animate-pulse' : 'text-slate-400 font-medium';
                    
                    return \`
                        <div class="bg-slate-800/80 border-2 \${borderColor} rounded-xl p-4 flex flex-col transition-colors shadow-md">
                            <div class="flex justify-between items-center">
                                <div>
                                    <p class="font-bold text-lg \${textColor}">\${d.id}</p>
                                    <p class="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                        <span>\${type === 'nodos' ? 'Activo' : 'Antena'}</span> • 
                                        <span id="signal-val-\${d.id}" class="\${senalColor}">📶 \${d.senalDbm} dBm</span>
                                    </p>
                                </div>
                                <button onclick="toggleDispositivo('\${type}', '\${d.id}')" 
                                        class="\${d.encendido ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/30'} 
                                               px-3 py-1.5 rounded-lg text-xs font-bold transition-colors w-28 text-center border-2">
                                    \${d.encendido ? 'APAGAR' : 'ENCENDER'}
                                </button>
                            </div>

                            \${type === 'nodos' ? \`
                            <div class="mt-4 pt-3 border-t border-slate-700/50 flex flex-col gap-3">
                                <div class="flex items-center justify-between">
                                    <label class="text-xs text-slate-400 font-bold">Batería: <span id="bat-val-\${d.id}" class="text-white">\${d.bateria.toFixed(1)}%</span></label>
                                    <input type="range" min="0" max="100" value="\${d.bateria}" onchange="setBateria('\${d.id}', this.value)" class="w-36 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer">
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-xs text-slate-400 font-bold">Estrés Hídrico:</span>
                                    <button onclick="toggleCavitacion('\${d.id}')" class="text-xs px-3 py-1 rounded-lg border-2 transition-colors font-bold \${d.cavitacion ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'}">
                                        \${d.cavitacion ? 'DETECTADA 🚨' : 'NORMAL'}
                                    </button>
                                </div>
                            </div>
                            <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/30">
                                <span class="text-[11px] text-slate-400 font-bold">Agricultor:</span>
                                <button onclick="simularRiego('\${d.id}')" class="text-xs bg-blue-600/30 hover:bg-blue-600/50 text-blue-400 border border-blue-500/40 px-2 py-1 rounded font-bold transition-colors">
                                    💧 Confirmar Riego
                                </button>
                            </div>                            
                            \` : ''}
                        </div>
                    \`;
                };

                document.getElementById('lista-gateways').innerHTML = hardware.gateways.map(gw => drawItem(gw, 'gateways')).join('') || '<p class="text-xs text-slate-600 p-3 bg-slate-900 rounded-lg">No hay gateways.</p>';
                document.getElementById('lista-nodos').innerHTML = hardware.nodos.map(n => drawItem(n, 'nodos')).join('') || '<p class="text-xs text-slate-600 p-3 bg-slate-900 rounded-lg">No hay nodos.</p>';
            }

            function toggleDispositivo(tipoLista, id) {
                const item = hardware[tipoLista].find(x => x.id === id);
                if (!item) return;

                item.encendido = !item.encendido;

                if (item.encendido) {
                    transmitirPaquete(item);
                    item.timer = setInterval(() => transmitirPaquete(item), INTERVALO_PING);
                    logTerminal(item.id, 'Dispositivo INICIADO (TX activo)', 'text-green-500');
                } else {
                    clearInterval(item.timer);
                    item.timer = null;
                    if (item.tipo === 'NODO' && item.bateria > 0) {
                        transmitirPaquete(item, true); 
                    }
                    logTerminal(item.id, 'Dispositivo APAGADO', 'text-red-500');
                }
                guardarEstado();
                renderUI();
            }

            function toggleGlobal(tipoLista) {
                const encendidos = hardware[tipoLista].filter(x => x.encendido).length;
                const turnOn = encendidos < (hardware[tipoLista].length / 2);

                hardware[tipoLista].forEach(item => {
                    if (item.encendido !== turnOn) toggleDispositivo(tipoLista, item.id);
                });
                guardarEstado();
            }

            async function transmitirPaquete(dispositivo, forzarApagado = false) {
                let payload = {
                    idNodo: dispositivo.id,
                    tipo: dispositivo.tipo,
                    latitud: dispositivo.latitud,
                    longitud: dispositivo.longitud,
                    senalDbm: dispositivo.senalDbm
                };

                if (dispositivo.tipo === 'NODO') {
                    if (forzarApagado) {
                        dispositivo.bateria = 0;
                    } else {
                        dispositivo.bateria = Math.max(0, dispositivo.bateria - DESGASTE_BATERIA);
                    }
                    payload.bateria = dispositivo.bateria;
                    payload.cavitacion = dispositivo.cavitacion; 
                }

                try {
                    const response = await fetch('/api/lora/uplink', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if(response.ok) {
                        const statusColor = dispositivo.cavitacion ? 'text-red-400' : 'text-slate-300';
                        logTerminal(
                            dispositivo.id, 
                            \`TX OK ➔ \${dispositivo.tipo === 'NODO' ? 'Bat: ' + dispositivo.bateria.toFixed(1) + '% | RSSI: ' + dispositivo.senalDbm + ' dBm | Cav: ' + (dispositivo.cavitacion ? 'SI' : 'NO') : 'RSSI: ' + dispositivo.senalDbm + ' dBm'}\`, 
                            statusColor
                        );
                    }
                } catch (error) {
                    logTerminal(dispositivo.id, 'TX FALLIDA', 'text-red-500');
                }
                
                if (dispositivo.tipo === 'NODO' && dispositivo.bateria <= 0 && dispositivo.encendido) {
                    toggleDispositivo('nodos', dispositivo.id);
                    logTerminal(dispositivo.id, 'Batería agotada.', 'text-red-500 font-bold');
                }
                
                if(dispositivo.tipo === 'NODO') {
                    const batElement = document.getElementById('bat-val-' + dispositivo.id);
                    if(batElement) batElement.innerText = dispositivo.bateria.toFixed(1) + '%';
                    guardarEstado();
                }
            }

            function logTerminal(origen, mensaje, colorClass) {
                const consoleDiv = document.getElementById('consola');
                const time = new Date().toLocaleTimeString();
                consoleDiv.innerHTML = \`<div class="animate-pulse \${colorClass} py-0.5">[\${time}] <span class="font-bold text-white">\${origen}</span>: \${mensaje}</div>\` + consoleDiv.innerHTML;
            }

            async function simularRiego(idNodo) {
                await fetch('/api/whatsapp/simular-riego', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idNodo })
                });
                logTerminal(idNodo, 'WhatsApp: Agricultor activó riego.', 'text-blue-400 font-bold');
            }            
        </script>
    </body>
    </html>
  `);
});

export default router;
