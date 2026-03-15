// netlify/functions/productos.js
// Proxy hacia la API de Tienda Nube — GET /api/productos
//
// Variables de entorno necesarias en Netlify (Settings → Environment variables):
//   TN_STORE_ID      → ID numérico de tu tienda (lo ves en la URL del panel: tiendanube.com/XXXXXXX/...)
//   TN_ACCESS_TOKEN  → Token de acceso de tu app (Panel TN → Mis aplicaciones → Tu app → Credenciales)
//
// La API de TN devuelve productos paginados. Este endpoint trae hasta 200 productos
// (2 páginas de 100) y los transforma al formato que usa el frontend.

const TN_STORE_ID    = process.env.TN_STORE_ID;
const TN_ACCESS_TOKEN = process.env.TN_ACCESS_TOKEN;
const TN_API_BASE    = `https://api.tiendanube.com/v1/${TN_STORE_ID}`;

const HEADERS = {
  'Authentication': `bearer ${TN_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'MuscleJunkies/1.0 (contacto@musclejunkies.com.ar)',
};

// Trae una página de productos de TN
async function fetchPage(page = 1, perPage = 100) {
  const url = `${TN_API_BASE}/products?page=${page}&per_page=${perPage}&published=true&fields=id,name,handle,categories,variants,images,description,published`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TN API error ${res.status}: ${body}`);
  }
  return res.json();
}

// ── PARSER DE DESCRIPCIÓN ESTRUCTURADA ──
// Lee secciones con títulos en mayúsculas de la descripción de TN.
// Formato esperado en el campo Descripción de cada producto en TN:
//
//   Texto introductorio del producto (se usa como description).
//
//   BENEFICIOS:
//   Texto del beneficio 1
//   Texto del beneficio 2
//
//   INGREDIENTES:
//   Nombre del ingrediente | dosis | descripción del ingrediente
//   Nombre del ingrediente | dosis | descripción del ingrediente
//
//   DOSIFICACIÓN:
//   Cantidad: 5g por día
//   Cuándo: Post-entrenamiento
//   Cómo: Disolver en 200ml de agua
//
//   IDEAL PARA:
//   Tipo de persona o situación 1
//   Tipo de persona o situación 2
//
//   DATOS NUTRICIONALES:
//   Texto libre de info nutricional
//
//   FAQ:
//   ¿Pregunta 1? | Respuesta 1
//   ¿Pregunta 2? | Respuesta 2

function parseDescription(rawHtml) {
  // 1. Limpiar HTML → texto plano
  const text = (rawHtml || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r\n/g, '\n')
    .trim();

  // 2. Detectar secciones — cualquier línea que sea solo MAYÚSCULAS + ":"
  const SECTION_RE = /^([A-ZÁÉÍÓÚÜÑ\s]+):\s*$/m;
  const sections = {};
  let currentSection = '__intro__';
  sections[currentSection] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]{2,}):$/);
    if (match) {
      currentSection = match[1].trim();
      sections[currentSection] = [];
    } else {
      sections[currentSection] = sections[currentSection] || [];
      sections[currentSection].push(line);
    }
  }

  // Helper: líneas no vacías de una sección
  const lines = (key) => {
    const found = Object.keys(sections).find(k => k.startsWith(key));
    return found ? sections[found].filter(Boolean) : [];
  };

  // 3. Descripción: primer párrafo (intro)
  const description = (sections['__intro__'] || []).join(' ').slice(0, 400);

  // 4. Beneficios: líneas simples
  const benefits = lines('BENEFICIO').slice(0, 6);

  // 5. Ingredientes: "Nombre | dosis | descripción"
  const ingredients = lines('INGREDIENTE').map(l => {
    const parts = l.split('|').map(s => s.trim());
    return { name: parts[0] || '', dose: parts[1] || '', desc: parts[2] || '' };
  }).filter(i => i.name);

  // 6. Dosificación: "Cantidad: X", "Cuándo: X", "Cómo: X"
  let dosage = null;
  const dosageLines = lines('DOSIFICACI');
  if (dosageLines.length > 0) {
    const get = (prefix) => {
      const l = dosageLines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase()));
      return l ? l.replace(/^[^:]+:\s*/i, '').trim() : '';
    };
    dosage = {
      amount: get('Cantidad') || get('Dosis') || dosageLines[0] || '',
      when:   get('Cuándo')  || get('Cuando') || dosageLines[1] || '',
      how:    get('Cómo')    || get('Como')   || dosageLines[2] || '',
    };
    if (!dosage.amount && !dosage.when && !dosage.how) dosage = null;
  }

  // 7. Ideal para: líneas simples
  const idealFor = lines('IDEAL').slice(0, 6);

  // 8. Datos nutricionales: texto libre
  const supplementFacts = lines('DATO').join(' ') || lines('NUTRICIONAL').join(' ') || null;

  // 9. FAQ: "¿Pregunta? | Respuesta"
  const faq = lines('FAQ').map(l => {
    const idx = l.indexOf('|');
    if (idx === -1) return null;
    return { q: l.slice(0, idx).trim(), a: l.slice(idx + 1).trim() };
  }).filter(Boolean);

  return { description, benefits, ingredients, dosage, idealFor, supplementFacts, faq };
}

// Mapea un producto de TN al formato interno del frontend
function mapProduct(tnProduct) {
  const variant = tnProduct.variants?.[0] || {};
  const allVariants = tnProduct.variants || [];

  // Sabores desde variantes
  const flavors = allVariants
    .map(v => v.values?.[0]?.es || v.values?.[0] || null)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  // Precios
  const price = Math.round(parseFloat(variant.price || 0));
  const comparePrice = variant.compare_at_price
    ? Math.round(parseFloat(variant.compare_at_price))
    : null;

  // Categoría
  const category = tnProduct.categories?.[0]?.name?.es
    || tnProduct.categories?.[0]?.name
    || 'General';

  // Imagen
  const imageUrl = tnProduct.images?.[0]?.src || null;

  // Parsear descripción estructurada
  const rawDesc = tnProduct.description?.es || tnProduct.description || '';
  const parsed = parseDescription(rawDesc);

  return {
    id: String(variant.id || tnProduct.id),
    slug: tnProduct.handle,
    name: tnProduct.name?.es || tnProduct.name || '',
    category,
    price,
    originalPrice: comparePrice && comparePrice > price ? comparePrice : null,
    rating: 5.0,
    reviews: 0,
    featured: tnProduct.published === true,
    visible: tnProduct.published === true,
    flavors: flavors.length > 0 ? flavors : null,
    // Campos parseados de la descripción → misma estructura que espera el frontend
    description:     parsed.description,
    benefits:        parsed.benefits,
    ingredients:     parsed.ingredients.length > 0 ? parsed.ingredients : null,
    dosage:          parsed.dosage,
    idealFor:        parsed.idealFor.length > 0 ? parsed.idealFor : null,
    supplementFacts: parsed.supplementFacts || null,
    faq:             parsed.faq.length > 0 ? parsed.faq : null,
    imageUrl,
    variantId: variant.id,
    variants: allVariants.map(v => ({
      id: v.id,
      flavor: v.values?.[0]?.es || v.values?.[0] || null,
      price: Math.round(parseFloat(v.price || 0)),
      stock: v.stock,
    })),
  };
}

exports.handler = async function(event, context) {
  // Solo GET
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verificar credenciales configuradas
  if (!TN_STORE_ID || !TN_ACCESS_TOKEN) {
    console.error('Faltan variables de entorno TN_STORE_ID o TN_ACCESS_TOKEN');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Configuración de API incompleta' }),
    };
  }

  try {
    // Traer hasta 2 páginas (200 productos)
    const [page1, page2] = await Promise.all([
      fetchPage(1, 100),
      fetchPage(2, 100),
    ]);

    const allProducts = [...page1, ...page2].filter(p => p.published !== false);
    const mapped = allProducts.map(mapProduct);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache de 5 minutos en el browser, 10 en CDN de Netlify
        'Cache-Control': 'public, max-age=300, s-maxage=600',
      },
      body: JSON.stringify(mapped),
    };
  } catch (err) {
    console.error('Error fetching products from TN:', err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
