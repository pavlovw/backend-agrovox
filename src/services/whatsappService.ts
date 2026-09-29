import axios from 'axios';

const WA_TOKEN = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

export const despacharAlertaWhatsApp = async (
  telefono: string, 
  nodoId: string, 
  sectorNombre: string, 
  fundoNombre: string,
  latitud: number, 
  longitud: number
) => {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.warn("⚠️ Faltan credenciales de WhatsApp Business en .env");
    return false;
  }

  const url = `https://graph.facebook.com/v17.0/${WA_PHONE_ID}/messages`;
  const numeroLimpio = telefono.replace(/\D/g, '');

  // 1. Enlace directo a Google Maps (Garantiza el marcador exacto sin error de búsqueda)
  const linkMaps = `https://www.google.com/maps?q=${latitud},${longitud}`;

  // 2. Mensaje Interactivo con Botón de Acción
  const interactivePayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: numeroLimpio,
    type: "interactive",
    interactive: {
      type: "button",
      header: {
        type: "text",
        text: "🚨 ALERTA: ESTRÉS HÍDRICO"
      },
      body: {
        text: `*Reporte Técnico AgroVox*\n\n• *Dispositivo:* ${nodoId}\n• *Fundo:* ${fundoNombre}\n• *Sector:* ${sectorNombre}\n• *Diagnóstico:* Cavitación acústica en el xilema.\n\n📍 *Ubicación del árbol:*\n${linkMaps}\n\n_¿Se ha aplicado el riego de mitigación?_`
      },
      footer: {
        text: "AgroVox • Monitoreo Predictivo"
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: `RIEGO_OK_${nodoId}`,
              title: "💧 Ya activé el riego" // Máximo 20 caracteres permitidos por WhatsApp
            }
          }
        ]
      }
    }
  };

  // 3. Tarjeta de ubicación nativa (Sin el campo "name" para que no intente buscar texto)
  const locationPayload = {
    messaging_product: "whatsapp",
    to: numeroLimpio,
    type: "location",
    location: {
      latitude: latitud,
      longitude: longitud
    }
  };

  try {
    await axios.post(url, interactivePayload, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
    await axios.post(url, locationPayload, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
    return true;
  } catch (error: any) {
    console.error("❌ Error API WhatsApp:", error.response?.data || error.message);
    return false;
  }
};

// Función para enviar confirmación cuando el agricultor presiona el botón
export const enviarConfirmacionRiegoWhatsApp = async (telefono: string, nodoId: string) => {
  if (!WA_TOKEN || !WA_PHONE_ID) return;
  const url = `https://graph.facebook.com/v17.0/${WA_PHONE_ID}/messages`;
  try {
    await axios.post(url, {
      messaging_product: "whatsapp",
      to: telefono.replace(/\D/g, ''),
      type: "text",
      text: {
        body: `✅ *AgroVox:* Confirmación de riego registrada para el sensor *${nodoId}*. Los sensores monitorearán la estabilización acústica del cultivo.`
      }
    }, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  } catch (error: any) {
    console.error("Error enviando confirmación:", error.response?.data || error.message);
  }
};