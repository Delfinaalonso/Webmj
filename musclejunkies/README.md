# Muscle Junkies — Deploy en Netlify

## Estructura del proyecto

```
musclejunkies/
├── public/
│   └── index.html          ← El sitio
├── netlify/
│   └── functions/
│       ├── productos.js     ← GET /api/productos → Tienda Nube
│       └── checkout.js      ← POST /api/checkout → Tienda Nube
├── netlify.toml             ← Configuración de Netlify
├── package.json
├── .env.example             ← Variables de entorno (referencia)
└── .gitignore
```

---

## Paso 1 — Crear tu app en Tienda Nube

1. Entrá al panel de TN: **Mis aplicaciones → Crear aplicación**
2. Tipo: **Aplicación privada**
3. En permisos, habilitá:
   - `products` → **Lectura**
   - `carts` → **Escritura**
4. Guardá y copiá el **Access Token** y el **Store ID**
   - Store ID: es el número en la URL del panel → `tiendanube.com/XXXXXXX/admin`

---

## Paso 2 — Subir el proyecto a GitHub

```bash
cd musclejunkies
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/musclejunkies.git
git push -u origin main
```

---

## Paso 3 — Conectar con Netlify

1. Entrá a [netlify.com](https://netlify.com) → **Add new site → Import from Git**
2. Seleccioná tu repo de GitHub
3. Netlify va a detectar el `netlify.toml` automáticamente
   - Build command: *(dejar vacío)*
   - Publish directory: `public`
4. Click en **Deploy site**

---

## Paso 4 — Configurar variables de entorno

En Netlify: **Site → Settings → Environment variables → Add variable**

| Variable | Valor |
|---|---|
| `TN_STORE_ID` | El número de tu tienda (ej: `6670517`) |
| `TN_ACCESS_TOKEN` | El token de tu app de TN |

Después de agregar las variables: **Deploys → Trigger deploy** para que tomen efecto.

---

## Paso 5 — Verificar que funciona

Una vez deployado, abrí en el browser:

```
https://TU-SITIO.netlify.app/api/productos
```

Tenés que ver un JSON con todos tus productos de TN. Si ves eso, todo está funcionando.

Si ves un error, revisá:
- Que las variables de entorno estén bien escritas (sin espacios)
- Que el Access Token tenga permisos de `products:read` y `carts:write`
- Los logs en Netlify: **Functions → productos → View logs**

---

## Dominio personalizado (opcional)

En Netlify: **Site → Domain management → Add custom domain**

---

## Flujo de datos

```
Usuario → index.html
  ↓ (al cargar la página)
GET /api/productos
  ↓
netlify/functions/productos.js
  ↓
api.tiendanube.com/v1/{storeId}/products
  ↓ (productos reales, con imágenes y precios actualizados)
Se muestran en la tienda

Usuario hace click en "Finalizar compra"
  ↓
POST /api/checkout  { items: [{ variantId, quantity }] }
  ↓
netlify/functions/checkout.js
  ↓
api.tiendanube.com/v1/{storeId}/carts
  ↓ (devuelve checkoutUrl)
Usuario es redirigido al checkout oficial de TN ✓
```
