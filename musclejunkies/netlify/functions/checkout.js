// netlify/functions/checkout.js
// Crea un carrito en Tienda Nube y devuelve la URL de checkout
//
// Variables de entorno necesarias (mismas que productos.js):
//   TN_STORE_ID
//   TN_ACCESS_TOKEN
//
// El frontend envía:
//   POST /api/checkout
//   Body: { items: [{ variantId: 123456, quantity: 2 }, ...] }
//
// Esta función:
//   1. Crea un carrito en TN via POST /carts
//   2. Devuelve la checkoutUrl para redirigir al usuario
//
// Documentación TN Carts API:
//   https://tiendanube.github.io/api-documentation/resources/cart

const TN_STORE_ID     = process.env.TN_STORE_ID;
const TN_ACCESS_TOKEN = process.env.TN_ACCESS_TOKEN;
const TN_API_BASE     = `https://api.tiendanube.com/v1/${TN_STORE_ID}`;

const HEADERS = {
  'Authentication': `bearer ${TN_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'MuscleJunkies/1.0 (contacto@musclejunkies.com.ar)',
};

exports.handler = async function(event, context) {
  // Solo POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verificar credenciales
  if (!TN_STORE_ID || !TN_ACCESS_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Configuración de API incompleta' }),
    };
  }

  // Parsear body
  let items;
  try {
    const body = JSON.parse(event.body || '{}');
    items = body.items;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'items requerido y no puede estar vacío' }),
      };
    }
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'JSON inválido' }),
    };
  }

  // Validar items
  for (const item of items) {
    if (!item.variantId || !item.quantity || item.quantity < 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Item inválido: ${JSON.stringify(item)}` }),
      };
    }
  }

  try {
    // Crear carrito en TN
    // TN espera: { items: [{ variant_id: X, quantity: Y }] }
    const cartBody = {
      items: items.map(item => ({
        variant_id: Number(item.variantId),
        quantity: Number(item.quantity),
      })),
    };

    const res = await fetch(`${TN_API_BASE}/carts`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(cartBody),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`TN Carts API error ${res.status}: ${errBody}`);
    }

    const cart = await res.json();

    // TN devuelve cart.checkout_url con la URL de pago
    const checkoutUrl = cart.checkout_url;
    if (!checkoutUrl) {
      throw new Error('TN no devolvió checkout_url en la respuesta');
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkoutUrl }),
    };

  } catch (err) {
    console.error('Error creating cart in TN:', err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
