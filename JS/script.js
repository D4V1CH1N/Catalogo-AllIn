// ==========================================
// Semana 3 - Configuracion de Cobro del Negocio
// ==========================================
const CONFIG_PAGO_NEGOCIO = {
    tienda: 'All In Fast Food',
    whatsapp: '59178929539',
    qrUrl: '', // Si esta vacio, renderiza un codigo QR SVG limpio de demostracion; si tiene URL, muestra esa imagen
    banco: 'Banco Union S.A.',
    cuenta: '10000045892314',
    titular: 'All In Fast Food',
    documento: 'NIT / CI: 8492015012'
};

// ==========================================
// BLOQUE 1 - Conexion API, Roles y Cola Offline FIFO
// ==========================================
// Semana 3 - Backend Supabase
(function (global) {
    const SUPABASE_URL = 'https://bmcdlimkoxnlyqeyksdk.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_ci-J9b7yQEoYOqxbm3IDMA_DrOTWRr-';
    const PROYECTO_ACTUAL = 'catalogo_allin';
    const CLAVE_SESION_LEGADA = 'sesionActiva_' + PROYECTO_ACTUAL;
    const CLAVE_SESION = 'sesionReal_' + PROYECTO_ACTUAL;
    const CLAVE_COLA_FIFO = 'colaSincronizacion_' + PROYECTO_ACTUAL;
    const CLAVE_CACHE_EXTRAS = 'cacheProductosExtra_' + PROYECTO_ACTUAL;
    const CLAVE_CACHE_PROMO = 'cachePromocion_' + PROYECTO_ACTUAL;
    const CLAVE_MIS_PEDIDOS_IDS = 'misPedidosIds_' + PROYECTO_ACTUAL;

    function limpiarSesionLegada() {
        try {
            sessionStorage.removeItem(CLAVE_SESION_LEGADA);
        } catch (err) {
        }
    }
    limpiarSesionLegada();

    function obtenerCabeceras(extra) {
        return Object.assign(
            {
                apikey: SUPABASE_KEY,
                Authorization: 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json'
            },
            extra || {}
        );
    }

    function normalizarRol(rol) {
        const valor = String(rol || '').trim().toLowerCase();
        if (valor === 'admin' || valor === 'encargado' || valor === 'cliente') {
            return valor;
        }
        return 'cliente';
    }

    function obtenerSesion() {
        limpiarSesionLegada();
        try {
            const raw = sessionStorage.getItem(CLAVE_SESION);
            if (!raw) {
                return { usuario: 'Invitado', rol: 'cliente', autenticada: false };
            }
            const parsed = JSON.parse(raw);
            const usuarioLimpio = String((parsed && parsed.usuario) || '').trim();
            const autenticadaReal = Boolean(parsed && parsed.autenticada === true && usuarioLimpio && usuarioLimpio !== 'Invitado');
            if (!autenticadaReal) {
                sessionStorage.removeItem(CLAVE_SESION);
                return { usuario: 'Invitado', rol: 'cliente', autenticada: false };
            }
            return {
                usuario: usuarioLimpio,
                rol: normalizarRol(parsed.rol),
                autenticada: true
            };
        } catch (err) {
            return { usuario: 'Invitado', rol: 'cliente', autenticada: false };
        }
    }

    function guardarSesion(sesion) {
        const usuarioLimpio = String((sesion && sesion.usuario) || '').trim();
        const autenticadaReal = Boolean(sesion && sesion.autenticada === true && usuarioLimpio && usuarioLimpio !== 'Invitado');
        if (!autenticadaReal) {
            return cerrarSesion();
        }
        const limpia = {
            usuario: usuarioLimpio,
            rol: normalizarRol(sesion && sesion.rol),
            autenticada: true
        };
        try {
            sessionStorage.setItem(CLAVE_SESION, JSON.stringify(limpia));
        } catch (err) {
        }
        return limpia;
    }

    function cerrarSesion() {
        try {
            sessionStorage.removeItem(CLAVE_SESION_LEGADA);
            sessionStorage.removeItem(CLAVE_SESION);
            sessionStorage.removeItem(CLAVE_MIS_PEDIDOS_IDS);
        } catch (err) {
        }
        return { usuario: 'Invitado', rol: 'cliente', autenticada: false };
    }

    function obtenerIdsPedidosSesion() {
        try {
            const raw = sessionStorage.getItem(CLAVE_MIS_PEDIDOS_IDS);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr.map(String) : [];
        } catch (err) {
            return [];
        }
    }

    function registrarIdPedidoSesion(idPedido) {
        if (idPedido === undefined || idPedido === null || idPedido === '') return;
        const ids = obtenerIdsPedidosSesion();
        const clave = String(idPedido);
        if (ids.indexOf(clave) === -1) {
            ids.push(clave);
            try {
                sessionStorage.setItem(CLAVE_MIS_PEDIDOS_IDS, JSON.stringify(ids));
            } catch (err) {
            }
        }
    }

    // Semana 2 - Arquitectura PWA Offline
    function obtenerColaFIFO() {
        try {
            const raw = localStorage.getItem(CLAVE_COLA_FIFO);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            return [];
        }
    }

    function guardarColaFIFO(cola) {
        try {
            localStorage.setItem(CLAVE_COLA_FIFO, JSON.stringify(Array.isArray(cola) ? cola : []));
        } catch (err) {
        }
    }

    function encolarOperacionFIFO(tabla, metodo, cuerpo, filtroQuery) {
        const cola = obtenerColaFIFO();
        const entrada = {
            idCola: 'FIFO-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            tabla: tabla,
            metodo: metodo || 'POST',
            filtroQuery: filtroQuery || '',
            cuerpo: Object.assign({}, cuerpo, { proyecto: PROYECTO_ACTUAL }),
            registradaEn: new Date().toISOString()
        };
        cola.push(entrada);
        guardarColaFIFO(cola);
        return { ok: false, encolado: true, posicion: cola.length, entrada: entrada };
    }

    async function peticionRest(ruta, opciones) {
        const url = SUPABASE_URL + '/rest/v1/' + ruta;
        const resp = await fetch(url, opciones);
        if (!resp.ok) {
            const textoErr = await resp.text().catch(() => '');
            throw new Error('HTTP ' + resp.status + (textoErr ? ': ' + textoErr : ''));
        }
        if (resp.status === 204) {
            return [];
        }
        const texto = await resp.text();
        return texto ? JSON.parse(texto) : [];
    }

    async function sincronizarColaFifo() {
        if (!navigator.onLine) {
            return { procesados: 0, pendientes: obtenerColaFIFO().length, detenido: true };
        }
        const cola = obtenerColaFIFO();
        let procesados = 0;
        while (cola.length > 0) {
            const siguiente = cola[0];
            try {
                const ruta = siguiente.tabla + (siguiente.filtroQuery ? '?' + siguiente.filtroQuery : '');
                const filas = await peticionRest(ruta, {
                    method: siguiente.metodo || 'POST',
                    headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                    body: JSON.stringify(siguiente.cuerpo)
                });
                if (siguiente.tabla === 'pedidos' && Array.isArray(filas) && filas[0] && filas[0].id) {
                    registrarIdPedidoSesion(filas[0].id);
                }
                cola.shift();
                guardarColaFIFO(cola);
                procesados += 1;
            } catch (err) {
                break;
            }
        }
        return { procesados: procesados, pendientes: cola.length, detenido: cola.length > 0 };
    }

    async function listarTabla(tabla, ordenDesc, limite) {
        const params = ['proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL), 'select=*'];
        if (ordenDesc !== false) {
            params.push('order=id.desc');
        }
        if (limite) {
            params.push('limit=' + Number(limite));
        }
        return peticionRest(tabla + '?' + params.join('&'), {
            method: 'GET',
            headers: obtenerCabeceras()
        });
    }

    async function listarProductosExtraConCache() {
        try {
            const filas = await listarTabla('productos_extra', true, 100);
            const lista = Array.isArray(filas) ? filas : [];
            try {
                localStorage.setItem(CLAVE_CACHE_EXTRAS, JSON.stringify(lista));
            } catch (err) {
            }
            return lista;
        } catch (err) {
            try {
                const raw = localStorage.getItem(CLAVE_CACHE_EXTRAS);
                const cached = raw ? JSON.parse(raw) : [];
                return Array.isArray(cached) ? cached : [];
            } catch (err2) {
                return [];
            }
        }
    }

    async function insertarRegistro(tabla, datos) {
        const payload = Object.assign({}, datos, { proyecto: PROYECTO_ACTUAL });
        if (!navigator.onLine) {
            return encolarOperacionFIFO(tabla, 'POST', payload);
        }
        try {
            const filas = await peticionRest(tabla, {
                method: 'POST',
                headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                body: JSON.stringify(payload)
            });
            if (tabla === 'pedidos' && Array.isArray(filas) && filas[0] && filas[0].id) {
                registrarIdPedidoSesion(filas[0].id);
            }
            return { ok: true, encolado: false, data: filas };
        } catch (err) {
            return encolarOperacionFIFO(tabla, 'POST', payload);
        }
    }

    async function actualizarPorId(tabla, id, campos) {
        const filtro = 'id=eq.' + encodeURIComponent(String(id)) + '&proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL);
        if (!navigator.onLine) {
            return encolarOperacionFIFO(tabla, 'PATCH', campos, filtro);
        }
        try {
            const filas = await peticionRest(tabla + '?' + filtro, {
                method: 'PATCH',
                headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                body: JSON.stringify(campos)
            });
            return { ok: true, encolado: false, data: filas };
        } catch (err) {
            return encolarOperacionFIFO(tabla, 'PATCH', campos, filtro);
        }
    }

    async function eliminarPorId(tabla, id) {
        const filtro = 'id=eq.' + encodeURIComponent(String(id)) + '&proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL);
        return peticionRest(tabla + '?' + filtro, {
            method: 'DELETE',
            headers: obtenerCabeceras({ Prefer: 'return=representation' })
        });
    }

    async function iniciarSesionCuenta(usuario, clave) {
        const u = String(usuario || '').trim();
        const c = String(clave || '').trim();
        if (!u || !c) {
            return { ok: false, error: 'Ingresa tu usuario y clave.' };
        }
        try {
            const q = 'cuentas?proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL) +
                '&usuario=eq.' + encodeURIComponent(u) +
                '&clave=eq.' + encodeURIComponent(c) + '&select=*&limit=1';
            const filas = await peticionRest(q, {
                method: 'GET',
                headers: obtenerCabeceras()
            });
            if (Array.isArray(filas) && filas.length > 0) {
                const cuenta = filas[0];
                return { ok: true, cuenta: { usuario: cuenta.usuario, rol: normalizarRol(cuenta.rol), autenticada: true } };
            }
            return { ok: false, error: 'Usuario o clave incorrectos.' };
        } catch (err) {
            return { ok: false, error: 'Sin conexion para validar credenciales.' };
        }
    }

    async function registrarCuenta(usuario, clave, rolSolicitado) {
        const payload = {
            proyecto: PROYECTO_ACTUAL,
            usuario: String(usuario || '').trim(),
            clave: String(clave || '').trim(),
            rol: normalizarRol(rolSolicitado)
        };
        try {
            const filas = await peticionRest('cuentas', {
                method: 'POST',
                headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                body: JSON.stringify(payload)
            });
            return { ok: true, data: filas };
        } catch (err) {
            const msg = String(err && err.message || '');
            const duplicado = msg.indexOf('409') !== -1 || msg.toLowerCase().indexOf('duplicate') !== -1;
            return { ok: false, error: duplicado ? 'Ese nombre de usuario ya esta registrado. Elija otro.' : 'No se pudo completar el registro en este momento.' };
        }
    }

    function obtenerCachePromocion() {
        try {
            const raw = localStorage.getItem(CLAVE_CACHE_PROMO);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            return null;
        }
    }

    function guardarCachePromocion(promo) {
        if (!promo) return;
        try {
            localStorage.setItem(CLAVE_CACHE_PROMO, JSON.stringify(promo));
        } catch (err) {
        }
    }

    async function obtenerPromocionActiva() {
        try {
            const q = 'promociones?proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL) + '&limit=1';
            const filas = await peticionRest(q, {
                method: 'GET',
                headers: obtenerCabeceras()
            });
            const promo = Array.isArray(filas) && filas.length > 0 ? filas[0] : null;
            if (promo) {
                guardarCachePromocion(promo);
                return { ok: true, vacia: false, promo: promo };
            }
            return { ok: true, vacia: true, promo: null };
        } catch (err) {
            return { ok: false, vacia: false, promo: obtenerCachePromocion(), offline: true, error: err.message };
        }
    }

    async function guardarPromocion(datosPromo) {
        const duracion = Math.max(1, parseInt(datosPromo.duracion_minutos, 10) || 15);
        const ahoraIso = new Date().toISOString();
        const expiraIso = datosPromo.expira_en
            ? new Date(datosPromo.expira_en).toISOString()
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        const payloadPatch = {
            titulo: String(datosPromo.titulo || '').trim(),
            descripcion: String(datosPromo.descripcion || '').trim(),
            precio: Number(datosPromo.precio || 25),
            duracion_minutos: duracion,
            expira_en: expiraIso,
            activa: datosPromo.activa !== false,
            actualizada_por: String(datosPromo.actualizada_por || 'administracion'),
            actualizada_en: ahoraIso
        };
        const filtro = 'proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL);
        try {
            const filasPatch = await peticionRest('promociones?' + filtro, {
                method: 'PATCH',
                headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                body: JSON.stringify(payloadPatch)
            });
            if (Array.isArray(filasPatch) && filasPatch.length > 0) {
                guardarCachePromocion(filasPatch[0]);
                return { ok: true, metodo: 'PATCH', data: filasPatch[0] };
            }
            const payloadPost = Object.assign({ proyecto: PROYECTO_ACTUAL }, payloadPatch);
            const filasPost = await peticionRest('promociones', {
                method: 'POST',
                headers: obtenerCabeceras({ Prefer: 'return=representation' }),
                body: JSON.stringify(payloadPost)
            });
            const guardada = (Array.isArray(filasPost) && filasPost.length > 0) ? filasPost[0] : payloadPost;
            guardarCachePromocion(guardada);
            return { ok: true, metodo: 'POST', data: guardada };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    async function registrarActividad(cliente, accion, detalle) {
        return insertarRegistro('actividad_clientes', {
            cliente: String(cliente || 'Invitado'),
            accion: String(accion || 'ACCION'),
            detalle: String(detalle || '')
        });
    }

    async function purgarActividadProyecto() {
        const filtro = 'proyecto=eq.' + encodeURIComponent(PROYECTO_ACTUAL);
        return peticionRest('actividad_clientes?' + filtro, {
            method: 'DELETE',
            headers: obtenerCabeceras({ Prefer: 'return=representation' })
        });
    }

    global.SupabaseAPI = {
        SUPABASE_URL: SUPABASE_URL,
        SUPABASE_KEY: SUPABASE_KEY,
        PROYECTO_ACTUAL: PROYECTO_ACTUAL,
        CLAVE_SESION: CLAVE_SESION,
        CLAVE_COLA_FIFO: CLAVE_COLA_FIFO,
        CLAVE_CACHE_PROMO: CLAVE_CACHE_PROMO,
        normalizarRol: normalizarRol,
        obtenerSesion: obtenerSesion,
        guardarSesion: guardarSesion,
        cerrarSesion: cerrarSesion,
        obtenerIdsPedidosSesion: obtenerIdsPedidosSesion,
        registrarIdPedidoSesion: registrarIdPedidoSesion,
        obtenerColaFIFO: obtenerColaFIFO,
        guardarColaFIFO: guardarColaFIFO,
        sincronizarColaFifo: sincronizarColaFifo,
        sincronizarColaFIFO: sincronizarColaFifo,
        listarTabla: listarTabla,
        listarProductosExtraConCache: listarProductosExtraConCache,
        insertarRegistro: insertarRegistro,
        actualizarPorId: actualizarPorId,
        eliminarPorId: eliminarPorId,
        iniciarSesionCuenta: iniciarSesionCuenta,
        registrarCuenta: registrarCuenta,
        obtenerCachePromocion: obtenerCachePromocion,
        guardarCachePromocion: guardarCachePromocion,
        obtenerPromocionActiva: obtenerPromocionActiva,
        guardarPromocion: guardarPromocion,
        guardarPromocionActiva: guardarPromocion,
        registrarActividad: registrarActividad,
        purgarActividadProyecto: purgarActividadProyecto
    };
})(window);

// ==========================================
// BLOQUE 2 - Pruebas de Integridad del Sistema
// ==========================================
// Semana 3 - Desarrollo Agil y Smoke Testing
document.addEventListener('DOMContentLoaded', () => {
    const botonSmokeTest = document.getElementById('btnSmokeTest');
    const salidaAuditoria = document.getElementById('salidaAudit');
    if (!botonSmokeTest || !salidaAuditoria) return;
    botonSmokeTest.addEventListener('click', () => {
        const imgsSinAlt = document.querySelectorAll('img:not([alt]), img[alt=""]').length;
        const enlacesVacios = document.querySelectorAll('a[href=""], a:not([href])').length;
        const totalBotones = document.querySelectorAll('button').length;
        salidaAuditoria.textContent = `Smoke Test OK | Botones: ${totalBotones} | Imagenes sin alt: ${imgsSinAlt} | Enlaces vacios: ${enlacesVacios}`;
    });
});

// ==========================================
// BLOQUE 3 - Auditoria de Accesibilidad A11Y
// ==========================================
// Semana 3 - Cierre A11Y HTML5 y HMR
document.addEventListener('DOMContentLoaded', () => {
    const botonAuditar = document.getElementById('btnAuditarA11Y');
    const salidaReporte = document.getElementById('reporteA11Y');
    if (!botonAuditar || !salidaReporte) return;
    botonAuditar.addEventListener('click', () => {
        const zonasSemanticas = document.querySelectorAll('header, nav, main, article, footer').length;
        const imagenesSinAlt = document.querySelectorAll('img:not([alt]), img[alt=""]').length;
        salidaReporte.textContent = `Auditoria en vivo: ${zonasSemanticas} etiquetas semanticas HTML5 detectadas | Imagenes sin alt: ${imagenesSinAlt}.`;
    });
});

// ==========================================
// BLOQUE 4 - Logica Principal de Interfaz, Catalogo, Carrito y Eventos
// ==========================================
// Semana 1 - Modo Oscuro
const CONFIG_NEGOCIO = {
    proyecto: 'catalogo_allin',
    nombreMarca: 'All In Fast Food',
    nombreCorto: 'AllInFastFood',
    subtitulo: 'Hamburguesas, Alitas, Chicken Fingers, Costillas y Almuerzo del Dia',
    direccion: 'Genaro Gamarra 1886, Zona Miraflores',
    telefono: '78929539',
    moneda: 'Bs.',
    tarifaCalculador: 28,
    catalogoUrl: './data/catalogo.json',
    subcategoriasPorLinea: {
        'Almuerzo Diario': [
            { clave: 'Almuerzo Diario', etiqueta: 'Almuerzo Diario (4 tiempos)' }
        ],
        'Menu Nocturno': [
            { clave: 'Costillitas Nocturnas', etiqueta: 'Costillitas Nocturnas' },
            { clave: 'Clasicas 150g', etiqueta: 'Hamburguesas Clasicas 150g' },
            { clave: 'Especiales con Tocino', etiqueta: 'Hamburguesas con Tocino' },
            { clave: 'De la Casa', etiqueta: 'Hamburguesas de la Casa' },
            { clave: 'Porciones Personales', etiqueta: 'Alitas y Fingers Personales' },
            { clave: 'Para Compartir', etiqueta: 'Alitas y Fingers Para Compartir' },
            { clave: 'Salsas de la Casa', etiqueta: 'Salsas de la Casa' }
        ],
        'Hamburguesas': [
            { clave: 'Clasicas 150g', etiqueta: 'Clasicas 150g' },
            { clave: 'Especiales con Tocino', etiqueta: 'Especiales con Tocino' },
            { clave: 'De la Casa', etiqueta: 'De la Casa' }
        ],
        'Alitas': [
            { clave: 'Porciones Personales', etiqueta: 'Porciones Personales (6u / 9u)' },
            { clave: 'Para Compartir', etiqueta: 'Para Compartir (12u / 24u)' }
        ],
        'Chicken Fingers': [
            { clave: 'Porciones Personales', etiqueta: 'Porciones Personales (6u / 9u)' },
            { clave: 'Para Compartir', etiqueta: 'Para Compartir (12u / 24u)' }
        ],
        'Salsas': [
            { clave: 'Salsas de la Casa', etiqueta: 'Salsas de la Casa' }
        ]
    }
};

const CLASE_BANNER_CATEGORIA = {
    'Almuerzo Diario': 'banner-linea--almuerzo',
    'Menu Nocturno': 'banner-linea--costillas',
    'Hamburguesas y Alitas': 'banner-linea--burgers',
    'Fingers y Salsas': 'banner-linea--salsas',
    'Hamburguesas': 'banner-linea--burgers',
    'Alitas': 'banner-linea--alitas',
    'Chicken Fingers': 'banner-linea--fingers',
    'Salsas': 'banner-linea--salsas'
};

const CLASE_MEDIA_CATEGORIA = {
    'Almuerzo Diario': 'card-item__media--almuerzo',
    'Menu Nocturno': 'card-item__media--burgers',
    'Hamburguesas': 'card-item__media--burgers',
    'Alitas': 'card-item__media--alitas',
    'Chicken Fingers': 'card-item__media--fingers',
    'Salsas': 'card-item__media--salsas'
};

const PAQUETES_RECOMENDADOS = [];

// Semana 2 - Respaldo Completo de 14 Platos All In Fast Food
const CATALOGO_RESPALDO = [
    {
        "id": "AI-01",
        "sku": "AI-AD-01",
        "orden": 1,
        "nombre": "Almuerzo Especial del Dia (Cambia cada dia)",
        "alt": "Fotografia oficial del Almuerzo Diario All In Fast Food",
        "categoria": "Almuerzo Diario",
        "subcategoria": "Almuerzo Diario",
        "horario": "Almuerzo Diario",
        "tematica": "Entrada, sopa, segundo a eleccion y postre (el almuerzo cambia cada dia)",
        "presentacion": "Menu completo de 4 tiempos - Horario de almuerzo",
        "precio": 22.0,
        "stock": 40,
        "descripcion": "Entrada, sopa, segundo a eleccion y postre; ej. tucumanita de ricota, mani con macarron, filete/chuleta/milanesa y duraznos al jugo.",
        "fichaTecnica": "El almuerzo cambia cada dia con preparacion fresca de cocina. Disponible en horario de almuerzo.",
        "portada": "https://www.dropbox.com/scl/fi/qo2ej3bdalfijih7bj87n/Almuerzo-diario.jpg?rlkey=pny2etzspuqcmpts8ygxk12bd&st=gf6q2d0y&raw=1"
    },
    {
        "id": "AI-02",
        "sku": "AI-MN-02",
        "orden": 2,
        "nombre": "Costillas de Cerdo (Solo en las noches)",
        "alt": "Fotografia oficial de Costillas de Cerdo 400g con papas fritas y salsas All In Fast Food",
        "categoria": "Menu Nocturno",
        "subcategoria": "Costillitas Nocturnas",
        "horario": "Solo en las noches",
        "tematica": "400g de costillas glaseadas con papas fritas y salsas - Solo en las noches (Jueves y Viernes)",
        "presentacion": "Porcion de 400g + papas fritas + salsas a eleccion - Servicio nocturno",
        "precio": 60.0,
        "stock": 25,
        "descripcion": "400 gramos de costillas de cerdo jugosas, papas fritas doradas y salsas a eleccion. Disponibles solo en las noches (jueves y viernes).",
        "fichaTecnica": "Especialidad del servicio nocturno (jueves y viernes por la noche). Incluye seleccion de salsas Barbacoa, Miel y Mostaza o Picante.",
        "portada": "https://www.dropbox.com/scl/fi/458cfbkg2xs9ih4s29bt6/Costillitas.jpg?rlkey=fkijtci2jn2gi59nasrl8urh8&st=6z38m5az&raw=1"
    },
    {
        "id": "AI-03",
        "sku": "AI-HB-03",
        "orden": 3,
        "nombre": "Hamburguesa Full",
        "alt": "Fotografia real de Hamburguesa Full All In Fast Food con papas fritas",
        "categoria": "Hamburguesas",
        "subcategoria": "Clasicas 150g",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: 150g de carne a la plancha, lechuga, tomate y queso",
        "presentacion": "Hamburguesa 150g con papas fritas - Servicio nocturno",
        "precio": 23.0,
        "stock": 80,
        "descripcion": "150g de carne, lechuga fresca, tomate y queso derretido, servida con papas fritas. Disponible en horario nocturno.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Pan artesanal tostado al momento, medallon de 150g de res y papas fritas.",
        "portada": "https://www.dropbox.com/scl/fi/jr5lq1pe36u64dqnq07uh/Hamburguesa-Full.jpg?rlkey=xhx9zzta89xpgkdmb4xhsydnb&st=fnsktjhn&raw=1"
    },
    {
        "id": "AI-04",
        "sku": "AI-HB-04",
        "orden": 4,
        "nombre": "Hamburguesa Poker",
        "alt": "Fotografia real de Hamburguesa Poker All In Fast Food con queso, tocino y papas fritas",
        "categoria": "Hamburguesas",
        "subcategoria": "Especiales con Tocino",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: 150g de carne, queso fundido y tocino crocante",
        "presentacion": "Hamburguesa 150g con tocino y papas fritas - Servicio nocturno",
        "precio": 28.0,
        "stock": 75,
        "descripcion": "150g de carne, lechuga, tomate, queso y tocino crocante, acompanada de papas fritas. Disponible en horario nocturno.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Medallon de 150g con tiras de tocino ahumado dorado a la plancha.",
        "portada": "https://www.dropbox.com/scl/fi/jin555d65ljao3nyj50aa/Hamburguesa-Poker.jpg?rlkey=2pdwad5804jk81axoazvu6e2i&st=6aywb1le&raw=1"
    },
    {
        "id": "AI-05",
        "sku": "AI-HB-05",
        "orden": 5,
        "nombre": "Hamburguesa All In",
        "alt": "Fotografia real de Hamburguesa All In con tocino, huevo y papas fritas",
        "categoria": "Hamburguesas",
        "subcategoria": "De la Casa",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: La estelar de la casa con tocino crocante y huevo frito",
        "presentacion": "Hamburguesa 150g completa + papas fritas - Servicio nocturno",
        "precio": 33.0,
        "stock": 70,
        "descripcion": "150g de carne, lechuga, tomate, queso, tocino y huevo, servida con papas fritas. Disponible en horario nocturno.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Tocino ahumado, huevo a la plancha, queso fundido y papas fritas.",
        "portada": "https://www.dropbox.com/scl/fi/quej44f9w1plh2svx4zli/Hamburguesa-All-In.jpg?rlkey=2tstb7ewbexdybnqv07yiyzc8&st=v8btqjfu&raw=1"
    },
    {
        "id": "AI-06",
        "sku": "AI-AL-06",
        "orden": 6,
        "nombre": "Alitas 6 unidades",
        "alt": "Fotografia real de Alitas 6 unidades con papas fritas y salsas All In Fast Food",
        "categoria": "Alitas",
        "subcategoria": "Porciones Personales",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: 6 alitas crujientes con papas fritas y salsas a eleccion",
        "presentacion": "6 unidades + papas fritas + salsa a eleccion - Servicio nocturno",
        "precio": 35.0,
        "stock": 90,
        "descripcion": "6 alitas doradas y jugosas servidas con papas fritas y salsas a eleccion (Barbacoa, Miel y Mostaza o Picante). Solo en las noches.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Preparadas al instante para mantener su textura crujiente.",
        "portada": "https://www.dropbox.com/scl/fi/o7nbf1vnovqe0im5pg2y6/Alitas-6-Unidades.jpg?rlkey=o16h8sxqey7rwmi8vyl3xig94&st=zfptrw1x&raw=1"
    },
    {
        "id": "AI-07",
        "sku": "AI-AL-07",
        "orden": 7,
        "nombre": "Alitas 9 unidades",
        "alt": "Fotografia real de Alitas 9 unidades con papas fritas y salsas All In Fast Food",
        "categoria": "Alitas",
        "subcategoria": "Porciones Personales",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: 9 alitas crujientes con papas fritas y salsas a eleccion",
        "presentacion": "9 unidades + papas fritas + salsas a eleccion - Servicio nocturno",
        "precio": 45.0,
        "stock": 85,
        "descripcion": "9 alitas doradas y jugosas servidas con papas fritas y salsas a eleccion (Barbacoa, Miel y Mostaza o Picante). Solo en las noches.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Porcion ideal para compartir con salsas de la casa.",
        "portada": "https://www.dropbox.com/scl/fi/vr36dt38qk7fhmcm2l87l/Alitas-9-Unidades-con-papas.jpeg?rlkey=f0nzruj4ahy3g4z74r68wqyc0&st=omlowko0&raw=1"
    },
    {
        "id": "AI-08",
        "sku": "AI-AL-08",
        "orden": 8,
        "nombre": "Alitas 12 unidades",
        "alt": "Fotografia real de Alitas 12 unidades con papas fritas y salsas All In Fast Food",
        "categoria": "Alitas",
        "subcategoria": "Para Compartir",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: 12 alitas crujientes con papas fritas y salsas a eleccion",
        "presentacion": "12 unidades + papas fritas + salsas a eleccion - Servicio nocturno",
        "precio": 65.0,
        "stock": 75,
        "descripcion": "12 alitas crocantes servidas con abundante porcion de papas fritas y salsas a eleccion. Solo en las noches.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Combina Barbacoa, Miel y Mostaza o Picante segun prefieras.",
        "portada": "https://www.dropbox.com/scl/fi/u01olugi9cb3rsqx0aw5r/Alitas-12-Unidades-con-papas.jpg?rlkey=x6yxzdcymksqia8oc45q4x3xg&st=aizphdu9&raw=1"
    },
    {
        "id": "AI-09",
        "sku": "AI-AL-09",
        "orden": 9,
        "nombre": "Alitas 24 unidades",
        "alt": "Fotografia real de Alitas 24 unidades con papas fritas y salsas All In Fast Food",
        "categoria": "Alitas",
        "subcategoria": "Para Compartir",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: 24 alitas crujientes para grupo con papas fritas y salsas",
        "presentacion": "24 unidades + papas fritas + salsas a eleccion - Servicio nocturno",
        "precio": 125.0,
        "stock": 50,
        "descripcion": "24 alitas doradas y jugosas con papas fritas y variedad de salsas a eleccion para toda la mesa. Solo en las noches.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Formato grupal con todas las salsas disponibles a eleccion.",
        "portada": "https://www.dropbox.com/scl/fi/47r9476c9ux7dx72df6pk/Alitas-24-Unidades-con-papas.jpg?rlkey=el6z7617dz42chc44icu7herq&st=r6odxba0&raw=1"
    },
    {
        "id": "AI-10",
        "sku": "AI-CF-10",
        "orden": 10,
        "nombre": "Chicken Fingers 6 unidades",
        "alt": "Fotografia real de Chicken Fingers 6 unidades con papas fritas All In Fast Food",
        "categoria": "Chicken Fingers",
        "subcategoria": "Porciones Personales",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: 6 tiras de filete de pollo empanizado + papas fritas + salsa",
        "presentacion": "6 tiras de pollo + papas fritas + salsa a eleccion - Servicio nocturno",
        "precio": 30.0,
        "stock": 90,
        "descripcion": "6 tiras de filete de pollo empanizado doradas y crujientes, con papas fritas y salsa a eleccion. Solo en las noches.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Pechuga de pollo 100% filete sin hueso y papas fritas.",
        "portada": "https://www.dropbox.com/scl/fi/b9kswhnk5xa9sut85iy4h/Chicken-fingers-6-unidades.jpg?rlkey=jwjj51j46u17ysmr0tn27e3wk&st=4bz5u5yb&raw=1"
    },
    {
        "id": "AI-11",
        "sku": "AI-CF-11",
        "orden": 11,
        "nombre": "Chicken Fingers 9 unidades",
        "alt": "Fotografia real de Chicken Fingers 9 unidades con papas fritas All In Fast Food",
        "categoria": "Chicken Fingers",
        "subcategoria": "Porciones Personales",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: 9 tiras de filete de pollo empanizado + papas fritas + salsa",
        "presentacion": "9 tiras de pollo + papas fritas + salsa a eleccion - Servicio nocturno",
        "precio": 40.0,
        "stock": 85,
        "descripcion": "9 tiras de filete de pollo empanizado, papas fritas y salsa a eleccion. Solo en las noches.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Acompanalas con Barbacoa, Miel y Mostaza o Picante.",
        "portada": "https://www.dropbox.com/scl/fi/vw1ah7s2cbk38bo4x42t0/Chicken-Fingers-9-Unidades.jpg?rlkey=yvdlipg00g85jphro85vzeqrq&st=g9195hby&raw=1"
    },
    {
        "id": "AI-12",
        "sku": "AI-CF-12",
        "orden": 12,
        "nombre": "Chicken Fingers 12 unidades",
        "alt": "Fotografia real de Chicken Fingers 12 unidades con papas fritas All In Fast Food",
        "categoria": "Chicken Fingers",
        "subcategoria": "Para Compartir",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: 12 tiras de filete de pollo empanizado + papas fritas + salsa",
        "presentacion": "12 tiras de pollo + papas fritas + salsas a eleccion - Servicio nocturno",
        "precio": 55.0,
        "stock": 75,
        "descripcion": "12 tiras de filete de pollo empanizado, porcion generosa de papas fritas y salsa a eleccion. Solo en las noches.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Ideal para compartir entre amigos o pareja.",
        "portada": "https://www.dropbox.com/scl/fi/9s7fty8owmul491n0hg0y/Chicken-fingers-12-unidades.jpg?rlkey=hqqznru8l79rgetofl214861d&st=5g6wwo2o&raw=1"
    },
    {
        "id": "AI-13",
        "sku": "AI-CF-13",
        "orden": 13,
        "nombre": "Chicken Fingers 24 unidades",
        "alt": "Fotografia real de Chicken Fingers 24 unidades con papas fritas All In Fast Food",
        "categoria": "Chicken Fingers",
        "subcategoria": "Para Compartir",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: 24 tiras de filete de pollo empanizado para compartir",
        "presentacion": "24 tiras de pollo + papas fritas + salsas a eleccion - Servicio nocturno",
        "precio": 105.0,
        "stock": 50,
        "descripcion": "24 tiras de filete de pollo empanizado, papas fritas abundantes y salsas a eleccion. Solo en las noches.",
        "fichaTecnica": "Plato del Menu Nocturno (solo en las noches). Formato grupal de pechuga 100% filete empanizado.",
        "portada": "https://www.dropbox.com/scl/fi/4e7retrkqbzziudbzeyrc/Chicken-fingers-24-unidades.jpg?rlkey=3zkxoesyeh527h457ri5mrb1t&st=48rk2u2a&raw=1"
    },
    {
        "id": "AI-14",
        "sku": "AI-SL-14",
        "orden": 14,
        "nombre": "Salsa Extra (Barbacoa / Miel y Mostaza / Picante)",
        "alt": "Fotografia real de Salsas Extra Barbacoa, Miel y Mostaza y Picante All In Fast Food",
        "categoria": "Salsas",
        "subcategoria": "Salsas de la Casa",
        "horario": "Solo en las noches",
        "tematica": "Menu Nocturno: Barbacoa ahumada, Miel y Mostaza o Picante de la casa",
        "presentacion": "Pocillo individual de salsa artesanal - Servicio nocturno",
        "precio": 5.0,
        "stock": 150,
        "descripcion": "Porcion extra de tu salsa favorita a eleccion: Barbacoa, Miel y Mostaza o Picante. Disponible en el servicio nocturno.",
        "fichaTecnica": "Acompanamiento del Menu Nocturno (solo en las noches). Indica tu sabor preferido en notas del pedido.",
        "portada": "https://www.dropbox.com/scl/fi/7vhrpf1j93i8jhf6q3mrb/salsas-extra.jpg?rlkey=2d4srz29du97ws1p0lx4n1e1k&st=xdjm1j1e&raw=1"
    }
];

// Semana 2 - Fetch Lazy Loading y Bubbling
function abrirLightboxImagen(srcImagen, tituloImagen) {
    if (!srcImagen) return;
    const visorLightbox = document.getElementById('lightboxImagenVisor');
    const fotoAmpliada = document.getElementById('lightboxImagenFoto');
    const etiquetaTitulo = document.getElementById('lightboxImagenTitulo');
    if (!visorLightbox || !fotoAmpliada) return;
    fotoAmpliada.setAttribute('src', srcImagen);
    fotoAmpliada.setAttribute('alt', tituloImagen || 'Vista ampliada');
    if (etiquetaTitulo) etiquetaTitulo.textContent = tituloImagen || '';
    visorLightbox.classList.add('activo');
}

function cerrarLightboxImagen() {
    const visorLightbox = document.getElementById('lightboxImagenVisor');
    if (visorLightbox) visorLightbox.classList.remove('activo');
}

function esVistaMovilVertical() {
    return window.matchMedia('(max-width: 1023px)').matches;
}

function abrirDrawerMovil() {
    const drawer = document.getElementById('drawerMenuMovil');
    const backdrop = document.getElementById('drawerBackdrop');
    const burguer = document.getElementById('burguerBtn');
    if (!drawer || !backdrop) return;
    drawer.inert = false;
    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.add('drawer-movil--abierto');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('drawer-backdrop--abierto');
    document.body.classList.add('drawer-abierto');
    if (burguer) burguer.setAttribute('aria-expanded', 'true');
}

function cerrarDrawerMovil() {
    const drawer = document.getElementById('drawerMenuMovil');
    const backdrop = document.getElementById('drawerBackdrop');
    const burguer = document.getElementById('burguerBtn');
    if (drawer) {
        drawer.classList.remove('drawer-movil--abierto');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.inert = true;
    }
    if (backdrop) {
        backdrop.classList.remove('drawer-backdrop--abierto');
        backdrop.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('drawer-abierto');
    if (burguer && esVistaMovilVertical()) {
        burguer.setAttribute('aria-expanded', 'false');
    }
}

document.addEventListener('click', (eventoClick) => {
    const imagenTocada = eventoClick.target.closest('img');
    if (
        imagenTocada &&
        !imagenTocada.closest('#lightboxImagenVisor') &&
        !imagenTocada.closest('#sugerenciasBuscador') &&
        imagenTocada.getAttribute('src')
    ) {
        const origenFoto = imagenTocada.getAttribute('src');
        const textoFoto = imagenTocada.getAttribute('alt') || imagenTocada.closest('article')?.querySelector('h3, h2')?.textContent || '';
        abrirLightboxImagen(origenFoto, textoFoto);
    }
});

document.addEventListener('keydown', (eventoTecla) => {
    if (eventoTecla.key === 'Escape') {
        cerrarLightboxImagen();
        cerrarDrawerMovil();
        const btnCerrarCar = document.getElementById('btnCerrarCarrito');
        const panelCar = document.getElementById('panelCarritoDrawer');
        if (btnCerrarCar && panelCar && !panelCar.hidden) btnCerrarCar.click();
        const sugerencias = document.getElementById('sugerenciasBuscador');
        if (sugerencias) sugerencias.hidden = true;
        const btnLupa = document.getElementById('btnLupa');
        if (btnLupa) btnLupa.setAttribute('aria-expanded', 'false');
    }
});

// Semana 3 - DOMPurify
function renderizarDetalleSeguro(contenedorSelector, htmlDesdeServidor) {
    const htmlSanitizado = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(htmlDesdeServidor) : '';
    const nodo = document.querySelector(contenedorSelector);
    if (!nodo) return;
    if (htmlSanitizado) {
        nodo.innerHTML = htmlSanitizado;
    } else {
        nodo.textContent = String(htmlDesdeServidor || '');
    }
}

// Semana 2 - Arquitectura PWA Offline
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

let eventoInstalacionDiferido = null;
window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    eventoInstalacionDiferido = evento;
    const btnInstalar = document.getElementById('btnInstalarPWA');
    if (btnInstalar) btnInstalar.hidden = false;
});

$(document).ready(function () {
    const api = window.SupabaseAPI;
    const CLAVE_TEMA = 'tema_' + api.PROYECTO_ACTUAL;
    const CLAVE_CARRITO = 'carrito_' + api.PROYECTO_ACTUAL;
    const TASA_IMPUESTO = 0.13;

    let sesionActiva = api.obtenerSesion();
    let catalogoBase = [];
    let productosExtraRemotos = [];
    let catalogoPrincipal = [];
    let catalogoCompleto = [];
    let carrito = cargarCarritoLocal();
    let categoriaActiva = 'Almuerzo Diario';
    let subcategoriaActiva = '';
    let terminoBusqueda = '';
    let productoResaltadoId = '';
    let pedidoEnEdicionId = null;
    const PROMO_TITULO_DEFECTO = 'Almuerzo Especial del Dia';
    const PROMO_DESC_PUBLICA = 'Entrada: Tucumanita de ricota | Sopa: Mani con macarron | Segundo: Filete, chuleta o milanesa | Postre: Duraznos al jugo.';
    const PROMO_PRECIO_DEFECTO = 22;
    const UMBRAL_EVERGREEN_MS = 180 * 24 * 60 * 60 * 1000;
    let promoActual = null;
    let promoExpiracionNotificada = false;
    let promoReclamos = 0;
    let imagenDataUrlCargada = '';
    let temporizadorCheckout = null;
    const DURACION_CHECKOUT_SEG = 300;
    let segundosCheckout = DURACION_CHECKOUT_SEG;
    let temporizadorBuscador = null;

    // Semana 3 - Validacion Estricta en Tiempo Real y Blacklist de Groserias
    const BLACKLIST_GROSERIAS = [
        'puta', 'puto', 'mierda', 'carajo', 'verga', 'pene', 'vagina',
        'cojudo', 'cojuda', 'pelotudo', 'pelotuda', 'imbecil', 'idiota',
        'estupido', 'estupida', 'maricon', 'marica', 'cabron', 'pendejo',
        'pendeja', 'chinga', 'joder', 'culero', 'malparido', 'hijueputa',
        'concha', 'csm', 'ctm', 'ptm', 'hdpta'
    ];

    const PALABRAS_SEGURAS_FILTRO = [
        'computadora', 'computador', 'disputa', 'reputacion', 'diputado',
        'diputada', 'imputar', 'amputar', 'escuchar', 'conchita'
    ];

    const ABREVIATURAS_SIN_VOCAL = new Set([
        'qr', 'bs', 'sr', 'dr', 'km', 'cm', 'mm', 'ml',
        'gr', 'kg', 'cs', 'tv', 'dj', 'sm', 'xl', 'xs'
    ]);

    const PALABRAS_DOBLE_SILABA_VALIDAS = new Set([
        'mama', 'papa', 'bebe', 'pepe', 'coco', 'nene',
        'lulu', 'tutu', 'nana', 'mimi', 'tata', 'kiki'
    ]);

    const PATRONES_TECLAZO = [
        'asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl', 'qwer', 'wert',
        'erty', 'zxcv', 'xcvb', 'cvbn', 'dwad', 'awda', 'wadw', 'sdwa',
        'adwa', 'asda', 'dsad', 'sadw', 'wdwa', 'jdsj', 'dsjk', 'lkjh',
        'poiu', 'mnbv', 'wasd', 'fesf', 'awra'
    ];

    const BIGRAMAS_TECLAZO = [
        'dw', 'wd', 'wr', 'jk', 'jd', 'kj', 'dk', 'kd', 'fj', 'jf',
        'fg', 'gf', 'hg', 'hj', 'jh', 'zx', 'xz', 'cv', 'vc',
        'vb', 'bv', 'qw', 'wq', 'wx', 'xw'
    ];

    function normalizarTextoFiltro(texto) {
        return String(texto || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[@4]/g, 'a')
            .replace(/[3]/g, 'e')
            .replace(/[1!]/g, 'i')
            .replace(/[0]/g, 'o')
            .replace(/[$5]/g, 's')
            .replace(/[^a-z\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function contieneGroserias(texto) {
        let normalizado = normalizarTextoFiltro(texto);
        if (!normalizado) return false;
        PALABRAS_SEGURAS_FILTRO.forEach((segura) => {
            normalizado = normalizado.replace(new RegExp('\\b' + segura + 's?\\b', 'g'), ' ');
        });
        normalizado = normalizado.replace(/\s+/g, ' ').trim();
        if (!normalizado) return false;

        const palabras = normalizado.split(' ');
        const colapsado2 = normalizado.replace(/(.)\1{2,}/g, '$1');
        const colapsado1 = normalizado.replace(/(.)\1+/g, '$1');
        const palabrasColapsadas = colapsado2.split(' ').concat(colapsado1.split(' '));
        const conjunto = new Set(palabras.concat(palabrasColapsadas));
        const compacto = colapsado2.replace(/\s+/g, '');

        for (let i = 0; i < BLACKLIST_GROSERIAS.length; i += 1) {
            const mala = BLACKLIST_GROSERIAS[i];
            if (conjunto.has(mala) || conjunto.has(mala + 's') || conjunto.has(mala + 'es')) {
                return true;
            }
            if (mala.length >= 4 && compacto.indexOf(mala) !== -1) {
                return true;
            }
        }
        return false;
    }

    function tieneConsonantesExcesivas(cadenaLetras) {
        const saneada = cadenaLetras.replace(/nstr|nscr|bstr|xtr|lstr/g, 'str');
        return /[bcdfghjklmnpqrstvwxz]{4,}/i.test(saneada);
    }

    function tieneSilabaRepetidaBasura(palabra) {
        if (/(.)\1{2,}/i.test(palabra)) return true;
        if (/([a-z]{3,4})\1+/i.test(palabra)) return true;
        if (/([a-z]{2})\1{2,}/i.test(palabra)) return true;
        if (/^([a-z]{2})\1$/i.test(palabra) && !PALABRAS_DOBLE_SILABA_VALIDAS.has(palabra)) {
            return true;
        }
        return false;
    }

    function esPalabraBasura(palabra) {
        const w = String(palabra || '').toLowerCase();
        if (!w) return false;
        if (tieneSilabaRepetidaBasura(w)) return true;
        if (w.length >= 2 && !/[aeiou]/.test(w)) {
            if (!ABREVIATURAS_SIN_VOCAL.has(w)) return true;
        }
        if (tieneConsonantesExcesivas(w)) return true;
        if ((w.match(/w/g) || []).length >= 2) return true;
        for (let i = 0; i < PATRONES_TECLAZO.length; i += 1) {
            if (w.indexOf(PATRONES_TECLAZO[i]) !== -1) return true;
        }
        if (w.length >= 4) {
            for (let j = 0; j < BIGRAMAS_TECLAZO.length; j += 1) {
                if (w.indexOf(BIGRAMAS_TECLAZO[j]) !== -1) return true;
            }
        }
        if (w.length >= 5) {
            const voc = (w.match(/[aeiou]/g) || []).length;
            if (voc / w.length < 0.2) return true;
            if (voc <= 1 && /[bcdfghjklmnpqrstvwxz]{2}.*[bcdfghjklmnpqrstvwxz]{2}/.test(w)) {
                return true;
            }
        }
        return false;
    }

    function esTeclazoSinSentido(texto) {
        const limpio = String(texto || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        if (/(.)\1{2,}/i.test(limpio)) return true;
        const soloLetrasEspacios = limpio.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!soloLetrasEspacios) return true;
        const sinEspacios = soloLetrasEspacios.replace(/\s+/g, '');
        if (/([a-z]{3,4})\1+/i.test(sinEspacios)) return true;
        if (sinEspacios.length >= 5) {
            const vocalesTotales = (sinEspacios.match(/[aeiou]/g) || []).length;
            if (vocalesTotales / sinEspacios.length < 0.2) return true;
        }
        const palabras = soloLetrasEspacios.split(' ').filter(Boolean);
        for (let i = 0; i < palabras.length; i += 1) {
            if (esPalabraBasura(palabras[i])) {
                return true;
            }
        }
        return false;
    }

    function validarTextoEnVivo(valor, tipo) {
        const limpio = String(valor || '').trim();
        if (contieneGroserias(limpio)) {
            return { valido: false, error: 'Lenguaje no permitido. Por favor escribe de forma respetuosa.' };
        }
        if (tipo === 'nombre') {
            const regexNombre = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]{3,45}$/;
            const palabras = limpio.split(/\s+/).filter(Boolean);
            const soloLetras = limpio.replace(/\s+/g, '').toLowerCase();
            const unicos = new Set(soloLetras.split('')).size;
            const longitudesValidas = palabras.length > 0 && palabras.every((w, idx) => {
                if (w.length >= 2) return true;
                return palabras.length >= 3 && idx > 0 && idx < palabras.length - 1 && (w.toLowerCase() === 'y' || w.toLowerCase() === 'e');
            });
            if (
                !regexNombre.test(limpio) ||
                !longitudesValidas ||
                !/[aeiouáéíóúü]/i.test(limpio) ||
                esTeclazoSinSentido(limpio) ||
                (soloLetras.length >= 5 && unicos <= 2)
            ) {
                return { valido: false, error: 'Ingresa un nombre real valido (solo letras, minimo 3 caracteres).' };
            }
            return { valido: true, error: '' };
        }
        if (tipo === 'mensaje') {
            const normal = limpio.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const palabrasValidas = normal
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter((w) => {
                    if (!w) return false;
                    if (/^[0-9]+$/.test(w)) return true;
                    const soloL = w.replace(/[^a-z]/g, '');
                    if (!soloL) return false;
                    if (soloL.length === 1) return soloL === 'a' || soloL === 'y' || soloL === 'o' || soloL === 'e';
                    return !esPalabraBasura(soloL);
                });
            const palabrasConLetras = normal
                .replace(/[^a-z\s]/g, ' ')
                .split(/\s+/)
                .filter((w) => w.length >= 2 && !esPalabraBasura(w));
            const vocales = (limpio.match(/[aeiouáéíóúü]/gi) || []).length;
            if (
                limpio.length < 10 ||
                vocales < 3 ||
                palabrasValidas.length < 2 ||
                palabrasConLetras.length < 2 ||
                esTeclazoSinSentido(limpio)
            ) {
                return { valido: false, error: 'Escribe un mensaje claro y real (minimo 2 palabras coherentes).' };
            }
            return { valido: true, error: '' };
        }
        if (tipo === 'lista') {
            const soloAlfanum = limpio.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/g, '');
            const letras = (limpio.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
            if (
                limpio.length < 3 ||
                soloAlfanum.length < 3 ||
                letras < 2 ||
                esTeclazoSinSentido(limpio)
            ) {
                return { valido: false, error: 'Escribe un articulo, color o tematica valida.' };
            }
            return { valido: true, error: '' };
        }
        if (tipo === 'referencia' || tipo === 'texto_corto') {
            const soloAlfanum = limpio.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/g, '');
            const letras = (limpio.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
            const digitos = (limpio.match(/[0-9]/g) || []).length;
            const soloDigitosRepetidos = digitos >= 3 && letras === 0 && /^(\d)\1{2,}$/.test(soloAlfanum);
            if (limpio.length < 3 || soloAlfanum.length < 3 || soloDigitosRepetidos) {
                return { valido: false, error: 'Ingresa un numero de comprobante o referencia valida.' };
            }
            if (letras > 0) {
                if (/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])\1{2,}/i.test(limpio)) {
                    return { valido: false, error: 'Ingresa una referencia valida sin caracteres repetidos.' };
                }
                if (digitos === 0 && esTeclazoSinSentido(limpio)) {
                    return { valido: false, error: 'Ingresa una referencia valida sin teclazos aleatorios.' };
                }
                if (digitos > 0 && letras >= 3 && esTeclazoSinSentido(limpio)) {
                    return { valido: false, error: 'Ingresa una referencia bancaria o QR valida.' };
                }
            }
            return { valido: true, error: '' };
        }
        if (tipo === 'celular') {
            const soloDigitos = limpio.replace(/[^0-9]/g, '');
            const regexCel = /^[0-9+\-\s()]{7,18}$/;
            if (!regexCel.test(limpio) || soloDigitos.length < 7 || soloDigitos.length > 15 || /^(\d)\1{6,}$/.test(soloDigitos)) {
                return { valido: false, error: 'Ingresa un numero de celular o WhatsApp valido (7 a 15 digitos).' };
            }
            return { valido: true, error: '' };
        }
        if (tipo === 'usuario') {
            const regexUsuario = /^[a-zA-Z0-9._-]{4,25}$/;
            if (!regexUsuario.test(limpio)) {
                return { valido: false, error: 'Ingresa un usuario valido (4 a 25 caracteres alfanumericos sin espacios).' };
            }
            return { valido: true, error: '' };
        }
        return { valido: true, error: '' };
    }

    function validarEntradaTexto(valor, tipo) {
        return validarTextoEnVivo(valor, tipo);
    }

    function obtenerSpanErrorCampo($campo) {
        if (!$campo || !$campo.length) return $();
        const idCampo = $campo.attr('id') || '';
        if (idCampo === 'buscadorProductos') {
            const $panel = $campo.closest('#panelBuscadorSuperior');
            let $spanBusc = $panel.children('.error-tiempo-real');
            if (!$spanBusc.length) {
                $spanBusc = $('<span>').attr({ id: 'errorBuscadorTiempoReal', 'aria-live': 'polite' }).addClass('error-tiempo-real');
                $panel.children('.buscador-superior__barra').after($spanBusc);
            }
            return $spanBusc;
        }
        const $grupo = $campo.closest('.campo-grupo');
        if ($grupo.length) {
            let $span = $grupo.children('.error-tiempo-real');
            if (!$span.length) {
                $span = $('<span>').addClass('error-tiempo-real').attr('aria-live', 'polite');
                $grupo.append($span);
            }
            return $span;
        }
        let $sig = $campo.next('.error-tiempo-real');
        if (!$sig.length) {
            $sig = $('<span>').addClass('error-tiempo-real').attr('aria-live', 'polite');
            $campo.after($sig);
        }
        return $sig;
    }

    function inyectarSpansErrorTiempoReal() {
        const selectores = [
            '#buscadorProductos',
            '#consultaMensaje',
            '#checkoutNombreCliente',
            '#checkoutCelular',
            '#checkoutNotasEntrega',
            '#perfilDireccion',
            '#perfilSalsasNotas',
            '#perfilCelular',
            '#inputRefPago',
            '#inputMontoEfectivo',
            '#userTikTok',
            '#clienteNombre',
            '#inputCancion',
            '#regNombreCompleto',
            '#regUsuario',
            '#regClave',
            '#loginUsuario',
            '#loginClave',
            '#prodExtraNombre',
            '#promoEditTitulo',
            '#promoEditDesc',
            '#adminNuevoUsuario',
            '#adminNuevaClave'
        ];
        selectores.forEach((sel) => {
            const $c = $(sel);
            if ($c.length) obtenerSpanErrorCampo($c);
        });
    }

    function mostrarErrorCampo($campo, mensaje, enfocar) {
        if (!$campo || !$campo.length) return;
        const esTextarea = $campo.is('textarea');
        $campo
            .removeClass('campo-valido')
            .addClass('campo-invalido ' + (esTextarea ? 'control-textarea--invalido' : 'control-input--invalido'))
            .attr('aria-invalid', 'true');
        obtenerSpanErrorCampo($campo).text(mensaje);
        if (enfocar !== false) {
            $campo.trigger('focus');
        }
    }

    function marcarCampoValido($campo) {
        if (!$campo || !$campo.length) return;
        $campo
            .removeClass('campo-invalido control-input--invalido control-textarea--invalido')
            .addClass('campo-valido')
            .removeAttr('aria-invalid');
        obtenerSpanErrorCampo($campo).text('');
    }

    function limpiarErrorCampo($campo) {
        if (!$campo || !$campo.length) return;
        $campo
            .removeClass('campo-invalido campo-valido control-input--invalido control-textarea--invalido')
            .removeAttr('aria-invalid');
        obtenerSpanErrorCampo($campo).text('');
    }

    function actualizarEstadoBotonFormulario(clave) {
        if (clave === 'consulta') {
            const v = String($('#consultaMensaje').val() || '').trim();
            const ok = Boolean(v) && validarTextoEnVivo(v, 'mensaje').valido;
            $('#formConsultaCliente button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'combo') {
            const v = String($('#userTikTok').val() || '').trim();
            const ok = Boolean(v) && validarTextoEnVivo(v, 'mensaje').valido;
            $('#orderForm button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'reserva') {
            const v = String($('#clienteNombre').val() || '').trim();
            const ok = Boolean(v) && validarTextoEnVivo(v, 'nombre').valido;
            $('#formReserva button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'lista') {
            const v = String($('#inputCancion').val() || '').trim();
            const ok = Boolean(v) && validarTextoEnVivo(v, 'lista').valido;
            $('#btnPedir').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'registro') {
            const n = String($('#regNombreCompleto').val() || '').trim();
            const u = String($('#regUsuario').val() || '').trim();
            const c = String($('#regClave').val() || '').trim();
            const ok = Boolean(n && u) && validarTextoEnVivo(n, 'nombre').valido && validarTextoEnVivo(u, 'usuario').valido && c.length >= 6;
            $('#formRegistroCliente button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'login') {
            const u = String($('#loginUsuario').val() || '').trim();
            const c = String($('#loginClave').val() || '').trim();
            const ok = Boolean(u) && validarTextoEnVivo(u, 'usuario').valido && c.length >= 4;
            $('#formLogin button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'checkout') {
            let ok = true;
            const pideNombre = !$('#grupoCheckoutNombreCliente').prop('hidden');
            if (pideNombre) {
                const nom = String($('#checkoutNombreCliente').val() || '').trim();
                if (!nom || !validarTextoEnVivo(nom, 'nombre').valido) ok = false;
            }
            const cel = String($('#checkoutCelular').val() || '').trim();
            if (cel && !validarTextoEnVivo(cel, 'celular').valido) ok = false;
            const notas = String($('#checkoutNotasEntrega').val() || '').trim();
            if (notas && !validarTextoEnVivo(notas, 'mensaje').valido) ok = false;
            const $ref = $('#inputRefPago');
            if ($ref.length) {
                const refVal = String($ref.val() || '').trim();
                if (refVal && !validarTextoEnVivo(refVal, 'referencia').valido) ok = false;
            }
            const forma = String($('#checkoutPago').val() || 'Pago por QR');
            if (forma === 'Efectivo Contra Entrega') {
                const $ef = $('#inputMontoEfectivo');
                if ($ef.length) {
                    const crudo = String($ef.val() || '').trim();
                    if (crudo) {
                        const monto = Number(crudo);
                        const tot = calcularTotalCheckoutActual();
                        if (!Number.isFinite(monto) || monto + 0.001 < tot) ok = false;
                    }
                }
            }
            $('#btnSubmitCheckout').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'perfil') {
            let ok = true;
            const dir = String($('#perfilDireccion').val() || '').trim();
            const sal = String($('#perfilSalsasNotas').val() || '').trim();
            const cel = String($('#perfilCelular').val() || '').trim();
            if (dir && !validarTextoEnVivo(dir, 'mensaje').valido) ok = false;
            if (sal && !validarTextoEnVivo(sal, 'mensaje').valido) ok = false;
            if (cel && !validarTextoEnVivo(cel, 'celular').valido) ok = false;
            $('#btnGuardarPerfilCliente').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'prodExtra') {
            const nom = String($('#prodExtraNombre').val() || '').trim();
            const ok = Boolean(nom) && validarTextoEnVivo(nom, 'lista').valido;
            $('#formProductoExtra button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        if (clave === 'promoOp') {
            const tit = String($('#promoEditTitulo').val() || '').trim();
            const desc = String($('#promoEditDesc').val() || '').trim();
            const okTit = Boolean(tit) && validarTextoEnVivo(tit, 'lista').valido;
            const okDesc = !desc || validarTextoEnVivo(desc, 'mensaje').valido;
            $('#formPromoExpress button[type="submit"]').prop('disabled', !(okTit && okDesc));
            return okTit && okDesc;
        }
        if (clave === 'cuentaInterna') {
            const u = String($('#adminNuevoUsuario').val() || '').trim();
            const c = String($('#adminNuevaClave').val() || '').trim();
            const ok = Boolean(u) && validarTextoEnVivo(u, 'usuario').valido && c.length >= 6;
            $('#formNuevaCuentaInterna button[type="submit"]').prop('disabled', !ok);
            return ok;
        }
        return true;
    }

    function aplicarValidacionTiempoReal($campo, tipo, claveForm, opciones) {
        const valor = String($campo.val() || '').trim();
        if (!valor) {
            limpiarErrorCampo($campo);
            actualizarEstadoBotonFormulario(claveForm);
            return Boolean(opciones && opciones.opcional);
        }
        const res = validarTextoEnVivo(valor, tipo);
        if (!res.valido) {
            mostrarErrorCampo($campo, res.error, false);
            actualizarEstadoBotonFormulario(claveForm);
            return false;
        }
        marcarCampoValido($campo);
        actualizarEstadoBotonFormulario(claveForm);
        return true;
    }

    function conectarValidacionTiempoReal(selector, tipo, claveForm, opciones) {
        $(document).on('input blur', selector, function () {
            aplicarValidacionTiempoReal($(this), tipo, claveForm, opciones);
        });
    }

    inyectarSpansErrorTiempoReal();
    conectarValidacionTiempoReal('#consultaMensaje', 'mensaje', 'consulta');
    conectarValidacionTiempoReal('#checkoutNombreCliente', 'nombre', 'checkout');
    conectarValidacionTiempoReal('#checkoutCelular', 'celular', 'checkout', { opcional: true });
    conectarValidacionTiempoReal('#checkoutNotasEntrega', 'mensaje', 'checkout', { opcional: true });
    conectarValidacionTiempoReal('#perfilDireccion', 'mensaje', 'perfil', { opcional: true });
    conectarValidacionTiempoReal('#perfilSalsasNotas', 'mensaje', 'perfil', { opcional: true });
    conectarValidacionTiempoReal('#perfilCelular', 'celular', 'perfil', { opcional: true });
    conectarValidacionTiempoReal('#inputRefPago', 'referencia', 'checkout', { opcional: true });
    conectarValidacionTiempoReal('#userTikTok', 'mensaje', 'combo');
    conectarValidacionTiempoReal('#clienteNombre', 'nombre', 'reserva');
    conectarValidacionTiempoReal('#inputCancion', 'lista', 'lista');
    conectarValidacionTiempoReal('#regNombreCompleto', 'nombre', 'registro');
    conectarValidacionTiempoReal('#regUsuario', 'usuario', 'registro');
    conectarValidacionTiempoReal('#loginUsuario', 'usuario', 'login');
    conectarValidacionTiempoReal('#prodExtraNombre', 'lista', 'prodExtra');
    conectarValidacionTiempoReal('#promoEditTitulo', 'lista', 'promoOp');
    conectarValidacionTiempoReal('#promoEditDesc', 'mensaje', 'promoOp', { opcional: true });
    conectarValidacionTiempoReal('#adminNuevoUsuario', 'usuario', 'cuentaInterna');

    $(document).on('input blur', '#adminNuevaClave', function () {
        const $c = $(this);
        const v = String($c.val() || '').trim();
        if (!v) {
            limpiarErrorCampo($c);
        } else if (v.length < 6) {
            mostrarErrorCampo($c, 'La clave interna debe tener al menos 6 caracteres.', false);
        } else {
            marcarCampoValido($c);
        }
        actualizarEstadoBotonFormulario('cuentaInterna');
    });

    $(document).on('input blur', '#regClave', function () {
        const $c = $(this);
        const v = String($c.val() || '').trim();
        if (!v) {
            limpiarErrorCampo($c);
        } else if (v.length < 6) {
            mostrarErrorCampo($c, 'La clave debe tener al menos 6 caracteres.', false);
        } else {
            marcarCampoValido($c);
        }
        actualizarEstadoBotonFormulario('registro');
    });

    $(document).on('input blur', '#loginClave', function () {
        const $c = $(this);
        const v = String($c.val() || '').trim();
        if (!v) {
            limpiarErrorCampo($c);
        } else if (v.length < 4) {
            mostrarErrorCampo($c, 'Ingresa tu clave de acceso (minimo 4 caracteres).', false);
        } else {
            marcarCampoValido($c);
        }
        actualizarEstadoBotonFormulario('login');
    });

    ['consulta', 'combo', 'reserva', 'lista', 'registro', 'login'].forEach(actualizarEstadoBotonFormulario);

    function cargarCarritoLocal() {
        try {
            const raw = localStorage.getItem(CLAVE_CARRITO);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (err) {
            return [];
        }
    }

    function guardarCarritoLocal() {
        try {
            localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito));
        } catch (err) {
        }
    }

    function registrarBitacoraDom(tipo, detalle) {
        const lista = document.getElementById('listaBitacoraDom');
        if (!lista) return;
        const li = document.createElement('li');
        li.textContent = '[' + new Date().toLocaleTimeString() + '] ' + tipo + ': ' + detalle;
        lista.prepend(li);
        while (lista.children.length > 120) {
            lista.removeChild(lista.lastChild);
        }
    }

    // Semana 2 - Calculador Modal 30s y Toast
    function mostrarToast(mensaje, variante) {
        const $cont = $('#contenedorToasts');
        const clase = variante ? 'alerta-toast--' + variante : '';
        const $toast = $('<div>').addClass('alerta-toast ' + clase).text(mensaje).hide();
        $cont.append($toast);
        $toast.slideDown(180).delay(2800).fadeOut(280, function () {
            $(this).remove();
        });
    }

    function construirUrlComprobanteWhatsapp(pedidoInfo) {
        const codigo = pedidoInfo && pedidoInfo.id ? ('#' + pedidoInfo.id) : 'Pendiente de asignacion';
        const cliente = String((pedidoInfo && pedidoInfo.cliente) || sesionActiva.usuario || 'Invitado').trim();
        const itemsLista = Array.isArray(pedidoInfo && pedidoInfo.items) && pedidoInfo.items.length > 0
            ? pedidoInfo.items.map((it) => (it.nombre || 'Producto') + ' x' + Math.max(1, Number(it.cantidad || 1))).join(', ')
            : 'Detalle registrado en tienda';
        const total = Number((pedidoInfo && pedidoInfo.total) || 0).toFixed(2);
        const modalidad = String((pedidoInfo && pedidoInfo.modalidad) || 'Envio a Domicilio');
        const formaPago = String((pedidoInfo && pedidoInfo.formaPago) || 'Pago por QR');
        const texto = [
            'Hola ' + CONFIG_PAGO_NEGOCIO.tienda + ', envio mi comprobante y detalle de pedido:',
            'Codigo: ' + codigo,
            'Cliente: ' + cliente,
            'Productos: ' + itemsLista,
            'Entrega: ' + modalidad,
            'Forma de pago: ' + formaPago,
            'Total: ' + CONFIG_NEGOCIO.moneda + ' ' + total
        ].join('\n');
        return 'https://wa.me/' + CONFIG_PAGO_NEGOCIO.whatsapp + '?text=' + encodeURIComponent(texto);
    }

    function crearBotonWhatsappComprobante(pedidoInfo) {
        const url = construirUrlComprobanteWhatsapp(pedidoInfo);
        const $enlace = $('<a>')
            .attr({
                href: url,
                target: '_blank',
                rel: 'noopener noreferrer',
                'aria-label': 'Enviar comprobante de pedido por WhatsApp a ' + CONFIG_PAGO_NEGOCIO.tienda
            })
            .addClass('btn-whatsapp-comprobante');
        const svgWa = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
        $enlace.append(svgWa, $('<span>').text('Enviar Comprobante por WhatsApp'));
        return $enlace;
    }

    function mostrarToastComprobanteWhatsapp(mensaje, variante, pedidoInfo) {
        const $cont = $('#contenedorToasts');
        const clase = variante ? 'alerta-toast--' + variante : '';
        const $toast = $('<div>').addClass('alerta-toast alerta-toast--accion ' + clase).hide();
        const $cab = $('<div>').addClass('alerta-toast__cabecera');
        const $texto = $('<span>').text(mensaje);
        const $btnCerrar = $('<button>')
            .attr({ type: 'button', 'aria-label': 'Cerrar notificacion' })
            .addClass('alerta-toast__cerrar')
            .text('X')
            .on('click', () => $toast.fadeOut(180, () => $toast.remove()));
        $cab.append($texto, $btnCerrar);
        $toast.append($cab, crearBotonWhatsappComprobante(pedidoInfo));
        $cont.append($toast);
        $toast.slideDown(180);
        setTimeout(() => {
            if ($toast.closest('body').length) {
                $toast.fadeOut(280, () => $toast.remove());
            }
        }, 9000);
    }

    function actualizarEstadoRedYAvisoOffline() {
        const enLinea = navigator.onLine;
        const badge = document.getElementById('estadoRed');
        if (badge) {
            badge.textContent = enLinea ? 'ONLINE' : 'OFFLINE';
            badge.classList.toggle('indicador-red--offline', !enLinea);
        }
        const badgeDrawer = document.getElementById('drawerEstadoRed');
        if (badgeDrawer) {
            badgeDrawer.textContent = enLinea ? 'ONLINE' : 'OFFLINE';
            badgeDrawer.classList.toggle('indicador-red--offline', !enLinea);
        }
        const cola = api.obtenerColaFIFO();
        const aviso = document.getElementById('avisoColaOffline');
        const texto = document.getElementById('textoAvisoOffline');
        const btnSync = document.getElementById('btnSincronizarColaGlobal');
        if (!aviso || !texto || !btnSync) return;

        if (!enLinea) {
            const n = cola.length;
            texto.textContent = n > 0
                ? 'Modo Offline activo: ' + n + (n === 1 ? ' operacion' : ' operaciones') + ' en cola FIFO. Se enviara automaticamente al recuperar conexion.'
                : 'Modo Offline activo: navegando desde cache local. Tus pedidos y consultas se encolaran en orden FIFO.';
            btnSync.hidden = true;
            aviso.hidden = false;
        } else if (cola.length > 0) {
            texto.textContent = 'Conexion recuperada: ' + cola.length + (cola.length === 1 ? ' operacion pendiente' : ' operaciones pendientes') + ' en cola FIFO.';
            btnSync.hidden = false;
            aviso.hidden = false;
        } else {
            aviso.hidden = true;
        }
    }

    function aplicarTema(tema) {
        const oscuro = tema === 'oscuro';
        document.body.classList.toggle('modo-oscuro', oscuro);
        document.body.classList.toggle('dark-mode', oscuro);
        document.body.classList.toggle('modo-claro', !oscuro);
        const textoDrawerTema = document.getElementById('drawerTemaTexto');
        if (textoDrawerTema) {
            textoDrawerTema.textContent = oscuro ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro';
        }
    }

    function alternarTema() {
        const nuevo = (document.body.classList.contains('modo-oscuro') || document.body.classList.contains('dark-mode')) ? 'claro' : 'oscuro';
        aplicarTema(nuevo);
        localStorage.setItem(CLAVE_TEMA, nuevo);
        registrarBitacoraDom('TEMA', 'Modo cambiado a ' + nuevo);
    }

    aplicarTema(localStorage.getItem(CLAVE_TEMA) || 'oscuro');
    $('#themeBtn').on('click', alternarTema);
    $('#btnDrawerTema').on('click', alternarTema);

    $('#btnInstalarPWA').on('click', async function () {
        if (!eventoInstalacionDiferido) return;
        eventoInstalacionDiferido.prompt();
        await eventoInstalacionDiferido.userChoice.catch(() => {});
        eventoInstalacionDiferido = null;
        this.hidden = true;
    });

    $('#btnCerrarLightbox').on('click', cerrarLightboxImagen);
    $('#lightboxImagenVisor').on('click', function (e) {
        if (e.target === this) cerrarLightboxImagen();
    });

    // Semana 1 - Menu Hamburguesa
    const mqMovil = window.matchMedia('(max-width: 1023px)');
    function sincronizarEstadoMenuResponsivo() {
        const burguer = document.getElementById('burguerBtn');
        const dock = document.getElementById('dockAcciones');
        if (!burguer || !dock) return;
        if (mqMovil.matches) {
            dock.classList.remove('dock-acciones--colapsada');
            burguer.setAttribute('aria-controls', 'drawerMenuMovil');
            const drawer = document.getElementById('drawerMenuMovil');
            const abierto = drawer ? drawer.classList.contains('drawer-movil--abierto') : false;
            burguer.setAttribute('aria-expanded', String(abierto));
        } else {
            cerrarDrawerMovil();
            burguer.setAttribute('aria-controls', 'dockAcciones');
            burguer.setAttribute('aria-expanded', String(!dock.classList.contains('dock-acciones--colapsada')));
        }
    }

    cerrarDrawerMovil();
    sincronizarEstadoMenuResponsivo();
    if (typeof mqMovil.addEventListener === 'function') {
        mqMovil.addEventListener('change', sincronizarEstadoMenuResponsivo);
    }

    $('#burguerBtn').on('click', function () {
        if (esVistaMovilVertical()) {
            const drawer = document.getElementById('drawerMenuMovil');
            if (drawer && drawer.classList.contains('drawer-movil--abierto')) {
                cerrarDrawerMovil();
            } else {
                abrirDrawerMovil();
            }
            return;
        }
        const dock = document.getElementById('dockAcciones');
        if (!dock) return;
        const colapsado = dock.classList.toggle('dock-acciones--colapsada');
        this.setAttribute('aria-expanded', String(!colapsado));
    });

    $('#btnCerrarDrawer, #drawerBackdrop').on('click', cerrarDrawerMovil);
    $(document).on('click', '.drawer-movil__item[data-vista]', function () {
        mostrarVista(this.getAttribute('data-vista'));
        cerrarDrawerMovil();
    });
    $('#btnDrawerAcceso').on('click', function () {
        cerrarDrawerMovil();
        sincronizarUiSesionModal();
        $('#feedbackAcceso').prop('hidden', true);
        $('#modalAcceso').prop('hidden', false);
    });

    function puedeVerVista(idVista) {
        const panel = document.getElementById(idVista);
        if (!panel) return false;
        const req = panel.getAttribute('data-rol');
        if (!req) return true;
        const rol = api.normalizarRol(sesionActiva.rol);
        if (req === 'cliente') return rol === 'cliente';
        if (req === 'operativo') return rol === 'encargado' || rol === 'admin';
        if (req === 'admin') return rol === 'admin';
        return true;
    }

    function mostrarVista(idVista) {
        if (!puedeVerVista(idVista)) return;
        $('.vista-panel').each(function () {
            const ocultar = this.id !== idVista;
            this.hidden = ocultar;
            $(this).toggleClass('oculto', ocultar);
        });
        const vistaNavActiva = idVista === 'vistaDetalleProducto' ? 'vista-catalogo' : idVista;
        $('.dock-acciones__btn[data-vista]').removeClass('dock-acciones__btn--activo activo');
        $('.dock-acciones__btn[data-vista="' + vistaNavActiva + '"]').addClass('dock-acciones__btn--activo activo');
        $('.drawer-movil__item[data-vista]').removeClass('drawer-movil__item--activo activo');
        $('.drawer-movil__item[data-vista="' + vistaNavActiva + '"]').addClass('drawer-movil__item--activo activo');
        if (idVista === 'vistaMisPedidos') {
            cargarMisPedidosCliente();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function obtenerClavePerfilCliente(usuario) {
        const u = String(usuario || '').trim().toLowerCase();
        return u ? ('perfilCliente_' + api.PROYECTO_ACTUAL + '_' + u) : '';
    }

    function esClienteAutenticado() {
        return Boolean(
            sesionActiva &&
            sesionActiva.autenticada === true &&
            sesionActiva.usuario &&
            sesionActiva.usuario !== 'Invitado' &&
            api.normalizarRol(sesionActiva.rol) === 'cliente'
        );
    }

    function cargarPerfilClienteLocal() {
        const vacio = { direccion: '', salsasNotas: '', celular: '' };
        if (!esClienteAutenticado()) return vacio;
        const clave = obtenerClavePerfilCliente(sesionActiva.usuario);
        if (!clave) return vacio;
        try {
            const raw = localStorage.getItem(clave);
            if (!raw) return vacio;
            const parsed = JSON.parse(raw);
            return {
                direccion: String((parsed && parsed.direccion) || '').trim(),
                salsasNotas: String((parsed && parsed.salsasNotas) || '').trim(),
                celular: String((parsed && parsed.celular) || '').trim()
            };
        } catch (err) {
            return vacio;
        }
    }

    function guardarPerfilClienteLocal(datos) {
        if (!esClienteAutenticado()) return false;
        const clave = obtenerClavePerfilCliente(sesionActiva.usuario);
        if (!clave) return false;
        const limpio = {
            direccion: String((datos && datos.direccion) || '').trim(),
            salsasNotas: String((datos && datos.salsasNotas) || '').trim(),
            celular: String((datos && datos.celular) || '').trim()
        };
        try {
            localStorage.setItem(clave, JSON.stringify(limpio));
            return true;
        } catch (err) {
            return false;
        }
    }

    function sincronizarPerfilClienteModal() {
        const mostrarPerfil = esClienteAutenticado();
        $('#bloquePerfilCliente').prop('hidden', !mostrarPerfil);
        $('#feedbackPerfilCliente').prop('hidden', true);
        if (!mostrarPerfil) return;
        const perfil = cargarPerfilClienteLocal();
        $('#perfilDireccion').val(perfil.direccion);
        $('#perfilSalsasNotas').val(perfil.salsasNotas);
        $('#perfilCelular').val(perfil.celular);
        limpiarErrorCampo($('#perfilDireccion'));
        limpiarErrorCampo($('#perfilSalsasNotas'));
        limpiarErrorCampo($('#perfilCelular'));
        actualizarEstadoBotonFormulario('perfil');
    }

    $('#formPerfilCliente').on('submit', function (e) {
        e.preventDefault();
        if (!esClienteAutenticado()) return;
        const $dir = $('#perfilDireccion');
        const $sal = $('#perfilSalsasNotas');
        const $cel = $('#perfilCelular');
        limpiarErrorCampo($dir);
        limpiarErrorCampo($sal);
        limpiarErrorCampo($cel);

        const direccion = String($dir.val() || '').trim();
        const salsasNotas = String($sal.val() || '').trim();
        const celular = String($cel.val() || '').trim();

        if (direccion) {
            const valDir = validarTextoEnVivo(direccion, 'mensaje');
            if (!valDir.valido) {
                mostrarErrorCampo($dir, valDir.error);
                actualizarEstadoBotonFormulario('perfil');
                return;
            }
        }
        if (salsasNotas) {
            const valSal = validarTextoEnVivo(salsasNotas, 'mensaje');
            if (!valSal.valido) {
                mostrarErrorCampo($sal, valSal.error);
                actualizarEstadoBotonFormulario('perfil');
                return;
            }
        }
        if (celular) {
            const valCel = validarTextoEnVivo(celular, 'celular');
            if (!valCel.valido) {
                mostrarErrorCampo($cel, valCel.error);
                actualizarEstadoBotonFormulario('perfil');
                return;
            }
        }

        guardarPerfilClienteLocal({ direccion: direccion, salsasNotas: salsasNotas, celular: celular });
        $('#feedbackPerfilCliente')
            .removeClass('feedback-formulario--error')
            .addClass('feedback-formulario--exito')
            .text('Datos de entrega guardados. Se autocompletaran automaticamente en tu proximo pedido.')
            .prop('hidden', false);
        mostrarToast('Perfil de entrega actualizado.', 'exito');
        registrarBitacoraDom('PERFIL_CLIENTE', 'Autocompletado guardado para ' + sesionActiva.usuario);
    });

    $('#btnEditarPerfilDesdeCheckout').on('click', function () {
        cerrarModalCheckout();
        sincronizarUiSesionModal();
        $('#feedbackAcceso').prop('hidden', true);
        $('#modalAcceso').prop('hidden', false);
        $('#perfilDireccion').trigger('focus');
    });

    function sincronizarUiSesionModal() {
        const rol = api.normalizarRol(sesionActiva.rol);
        const esAdmin = rol === 'admin';
        const etiquetaRol = esAdmin ? 'Admin' : (rol === 'encargado' ? 'Encargado' : 'Cliente');
        const tieneSesionActiva = Boolean(sesionActiva.autenticada === true && sesionActiva.usuario && sesionActiva.usuario !== 'Invitado');
        const nombreVisible = tieneSesionActiva ? sesionActiva.usuario : 'Invitado';

        $('#marcaNombreTexto').text(CONFIG_NEGOCIO.nombreMarca + ' | ' + nombreVisible);
        $('#drawerUsuarioActivo').text(nombreVisible);
        $('#resumenSesionModal').text('Sesion actual: ' + nombreVisible + ' (' + etiquetaRol + ')').prop('hidden', tieneSesionActiva);
        $('#bloqueFormulariosAcceso').prop('hidden', tieneSesionActiva);
        $('#bloqueCerrarSesion, #btnCerrarSesion').prop('hidden', !tieneSesionActiva);
        $('#perfilActivoUsuario').text(nombreVisible);
        $('#perfilActivoRol')
            .removeClass('badge-rol--cliente badge-rol--encargado badge-rol--admin')
            .addClass('badge-rol--' + rol)
            .text(etiquetaRol);
        sincronizarPerfilClienteModal();
    }

    function aplicarPermisosPorRol() {
        const rol = api.normalizarRol(sesionActiva.rol);
        const esCliente = rol === 'cliente';
        const esOperativo = rol === 'encargado' || rol === 'admin';
        const esAdmin = rol === 'admin';
        const etiquetaRol = esAdmin ? 'Admin' : (rol === 'encargado' ? 'Encargado' : 'Cliente');

        $('#badgeRolActivo')
            .removeClass('badge-rol--cliente badge-rol--encargado badge-rol--admin')
            .addClass('badge-rol--' + rol)
            .text(etiquetaRol);
        $('#drawerRolBadge')
            .removeClass('badge-rol--cliente badge-rol--encargado badge-rol--admin')
            .addClass('badge-rol--' + rol)
            .text(etiquetaRol);
        sincronizarUiSesionModal();
        const etiquetaModulo = document.getElementById('etiquetaModuloActivo');
        if (etiquetaModulo) {
            if (rol === 'cliente') {
                etiquetaModulo.hidden = true;
                etiquetaModulo.textContent = '';
            } else {
                etiquetaModulo.hidden = false;
                etiquetaModulo.textContent = esAdmin ? 'PANEL ADMINISTRADOR' : 'PANEL ENCARGADO DE TIENDA';
            }
        }

        $('[data-rol]').each(function () {
            const req = this.getAttribute('data-rol');
            if (req === 'cliente') {
                this.hidden = !esCliente;
            } else if (req === 'operativo') {
                this.hidden = !esOperativo;
            } else if (req === 'admin') {
                this.hidden = !esAdmin;
            }
        });

        const mostrarInvitacionCuenta = esCliente && !sesionActiva.autenticada;
        $('#invitacionCuentaPedidos, #invitacionCuentaCheckout').prop('hidden', !mostrarInvitacionCuenta);
        if (!esCliente) {
            $('#bloquePerfilCliente, #avisoAutocompletadoCheckout').prop('hidden', true);
        }

        if (!esCliente) {
            cerrarBuscadorSuperior();
            cerrarCarrito(true);
            cerrarModalCheckout();
            mostrarVista(esAdmin ? 'vista-admin-control' : 'vista-op-pedidos');
        } else {
            mostrarVista('vista-catalogo');
        }

        promoExpiracionNotificada = false;
        pintarPromocionExpress();
        actualizarBarraPagoRapido();
        hidratarDatosSegunRol();
    }

    // Semana 2 - jQuery Acordeon y Temas
    $(document).on('click', '.accordion-btn', function () {
        const panel = this.nextElementSibling;
        if (!panel) return;
        panel.hidden = !panel.hidden;
    });

    $(document).on('click', '.btn-subtab', function () {
        const grupo = this.getAttribute('data-grupo');
        const destino = this.getAttribute('data-subtab');
        if (!grupo || !destino) return;
        $('.btn-subtab[data-grupo="' + grupo + '"]').removeClass('btn-subtab--activo');
        $(this).addClass('btn-subtab--activo');
        $('.panel-subtab[data-grupo="' + grupo + '"]').each(function () {
            this.hidden = this.id !== destino;
        });
    });

    $(document).on('click', '.dock-acciones__btn[data-vista]', function () {
        mostrarVista(this.getAttribute('data-vista'));
    });

    // Semana 3 - Buscador Google con Autocompletado
    function sincronizarBotonLimpiarBusqueda() {
        const valor = String($('#buscadorProductos').val() || '');
        $('#btnLimpiarBusqueda').prop('hidden', valor.trim().length === 0);
    }

    function abrirBuscadorSuperior() {
        const panel = document.getElementById('panelBuscadorSuperior');
        if (!panel) return;
        panel.classList.add('buscador-superior--abierto');
        $('#btnLupa').attr('aria-expanded', 'true');
        $('#buscadorProductos').trigger('focus');
        renderizarSugerenciasBuscador($('#buscadorProductos').val(), true);
    }

    function cerrarBuscadorSuperior() {
        const panel = document.getElementById('panelBuscadorSuperior');
        if (panel) panel.classList.remove('buscador-superior--abierto');
        const sug = document.getElementById('sugerenciasBuscador');
        if (sug) sug.hidden = true;
        $('#btnLupa').attr('aria-expanded', 'false');
    }

    function renderizarSugerenciasBuscador(consulta, mostrarSugeridosIniciales) {
        const $sug = $('#sugerenciasBuscador').empty();
        const limpio = String(consulta || '').trim().toLowerCase();
        const $busc = $('#buscadorProductos');
        const $barra = $('.buscador-superior__barra');
        if (!limpio && !mostrarSugeridosIniciales) {
            $barra.removeClass('buscador-superior__barra--invalida');
            limpiarErrorCampo($busc);
            $sug.prop('hidden', true);
            return;
        }
        if (limpio && contieneGroserias(limpio)) {
            $barra.addClass('buscador-superior__barra--invalida');
            mostrarErrorCampo($busc, 'Lenguaje no permitido. Por favor escribe de forma respetuosa.', false);
            $sug.append($('<div>').addClass('sugerencia-vacia sugerencia-vacia--alerta').attr('role', 'alert').text('Lenguaje no permitido. Por favor escribe de forma respetuosa.'));
            $sug.prop('hidden', false);
            return;
        }
        $barra.removeClass('buscador-superior__barra--invalida');
        limpiarErrorCampo($busc);
        const coincidencias = limpio
            ? catalogoPrincipal
                .filter((item) => {
                    const bolsa = (item.nombre + ' ' + item.id + ' ' + item.categoria + ' ' + (item.subcategoria || '') + ' ' + (item.tematica || '') + ' ' + (item.descripcion || '')).toLowerCase();
                    return bolsa.indexOf(limpio) !== -1;
                })
                .slice(0, 8)
            : catalogoPrincipal.slice(0, 8);

        if (coincidencias.length === 0) {
            $sug.append($('<div>').addClass('sugerencia-vacia').text('No hay coincidencias para "' + String(consulta || '').trim() + '".'));
            $sug.prop('hidden', false);
            return;
        }

        coincidencias.forEach((item) => {
            const $opcion = $('<button>')
                .attr({ type: 'button', role: 'option', 'data-id': item.id })
                .addClass('sugerencia-item');
            const $thumb = $('<img>')
                .addClass('sugerencia-item__img')
                .attr('src', item.portada)
                .attr('alt', item.alt || ('Miniatura de ' + item.nombre))
                .attr('loading', 'lazy');
            const $info = $('<div>').addClass('sugerencia-item__info')
                .append($('<strong>').addClass('sugerencia-item__nombre').text(item.nombre))
                .append($('<span>').addClass('sugerencia-item__cat').text(item.categoria.toUpperCase() + (item.subcategoria ? (' | ' + item.subcategoria) : '')));
            const $precio = $('<strong>').addClass('sugerencia-item__precio').text(CONFIG_NEGOCIO.moneda + ' ' + Number(item.precio).toFixed(2));
            $opcion.append($thumb, $info, $precio);
            $sug.append($opcion);
        });
        $sug.prop('hidden', false);
    }

    $('#btnLupa').on('click', function () {
        const panel = document.getElementById('panelBuscadorSuperior');
        if (panel && panel.classList.contains('buscador-superior--abierto') && !String($('#buscadorProductos').val() || '').trim()) {
            cerrarBuscadorSuperior();
            return;
        }
        abrirBuscadorSuperior();
    });

    $('#btnLimpiarBusqueda').on('click', function () {
        clearTimeout(temporizadorBuscador);
        $('#buscadorProductos').val('');
        terminoBusqueda = '';
        productoResaltadoId = '';
        sincronizarBotonLimpiarBusqueda();
        renderizarTarjetasCatalogo();
        $('#buscadorProductos').trigger('focus');
        renderizarSugerenciasBuscador('', true);
    });

    $('#buscadorProductos').on('focus click', function () {
        sincronizarBotonLimpiarBusqueda();
        renderizarSugerenciasBuscador($(this).val(), true);
    });

    $('#buscadorProductos').on('input', function () {
        terminoBusqueda = $(this).val();
        productoResaltadoId = '';
        sincronizarBotonLimpiarBusqueda();
        renderizarSugerenciasBuscador(terminoBusqueda, true);
        if ($('#vista-catalogo').prop('hidden')) {
            mostrarVista('vista-catalogo');
        }
        renderizarTarjetasCatalogo();
        clearTimeout(temporizadorBuscador);
        const limpio = String(terminoBusqueda || '').trim();
        if (limpio && !contieneGroserias(limpio)) {
            temporizadorBuscador = setTimeout(() => {
                registrarBitacoraDom('BUSQUEDA', 'Termino: "' + limpio + '"');
            }, 700);
        }
    });

    $('#sugerenciasBuscador').on('click', '.sugerencia-item', function () {
        const idElegido = this.getAttribute('data-id');
        const prod = catalogoCompleto.find((x) => String(x.id) === String(idElegido));
        if (!prod) return;
        cerrarBuscadorSuperior();
        abrirDetalleProducto(prod.id);
    });

    $(document).on('click', function (e) {
        if (!$(e.target).closest('#panelBuscadorSuperior').length) {
            cerrarBuscadorSuperior();
        }
    });

    // Semana 3 - Componentes Encapsulados
    function obtenerCantidadEnCarrito(id) {
        const encontrado = carrito.find((x) => String(x.id) === String(id));
        return encontrado ? Number(encontrado.cantidad || 0) : 0;
    }

    function construirControlCantidadTarjeta(id) {
        const cantidad = obtenerCantidadEnCarrito(id);
        if (cantidad > 0) {
            const $stepper = $('<div>').addClass('stepper-inline').attr('data-id', id);
            const $btnRestar = $('<button>')
                .attr({ type: 'button', 'aria-label': 'Restar unidad', 'data-id': id })
                .addClass('stepper-inline__btn btn-stepper-restar')
                .text('-');
            const $valor = $('<span>').addClass('stepper-inline__valor').attr('aria-live', 'polite').text(cantidad);
            const $btnSumar = $('<button>')
                .attr({ type: 'button', 'aria-label': 'Sumar unidad', 'data-id': id })
                .addClass('stepper-inline__btn btn-stepper-sumar')
                .text('+');
            return $stepper.append($btnRestar, $valor, $btnSumar);
        }
        return $('<button>')
            .attr({ type: 'button', 'data-id': id })
            .addClass('card-item__btn-simular tarjeta-ods__boton--destacado btn-tactil')
            .text('+ Agregar');
    }

    function sincronizarControlesTarjetas() {
        $('.card-item__control-cantidad').each(function () {
            const id = this.getAttribute('data-id');
            $(this).empty().append(construirControlCantidadTarjeta(id));
        });
    }

    function construirTarjetaProducto(item) {
        const esResaltada = productoResaltadoId && String(item.id) === String(productoResaltadoId);
        const $card = $('<article>')
            .addClass('card-item' + (esResaltada ? ' card-item--resaltada' : ''))
            .attr('data-id', item.id);
        const esSvg = String(item.portada || '').indexOf('image/svg+xml') !== -1;
        const claseMedia = CLASE_MEDIA_CATEGORIA[item.categoria] || 'card-item__media--almuerzo';
        const $media = $('<div>')
            .addClass('card-item__media ' + claseMedia)
            .attr('title', 'Toca la imagen para ampliar: ' + item.nombre);
        const $img = $('<img>')
            .addClass('tarjeta-ods__imagen img-ampliable' + (esSvg ? '' : ' tarjeta-ods__imagen--foto'))
            .attr('src', item.portada)
            .attr('alt', item.alt || ('Plato All In Fast Food ' + item.nombre))
            .attr('loading', 'lazy');
        $media.append($img);

        const $cuerpo = $('<div>').addClass('card-item__cuerpo');
        const $franjaCat = $('<div>').addClass('card-item__franja-cat')
            .append($('<span>').addClass('insignia-categoria').text(item.categoria));
        if (item.horario) {
            $franjaCat.append($('<span>').addClass('card-item__meta').text(item.horario));
        }
        const $titulo = $('<h3>')
            .addClass('card-item__titulo card-item__enlace-detalle')
            .attr({ tabindex: '0', role: 'button', 'data-detalle-id': item.id })
            .text(item.nombre);
        const descTexto = item.descripcion || item.presentacion || 'Preparado al momento en All In Fast Food.';
        const $desc = $('<p>').addClass('card-item__desc-carta').text(descTexto);
        $cuerpo.append($franjaCat, $titulo, $desc);

        const $precioTag = $('<strong>')
            .addClass('card-item__precio card-item__precio-ficha')
            .text(CONFIG_NEGOCIO.moneda + ' ' + Number(item.precio).toFixed(2));
        const $controlCant = $('<div>').addClass('card-item__control-cantidad').attr('data-id', item.id).append(construirControlCantidadTarjeta(item.id));
        const $btnPagarYa = $('<button>')
            .attr({ type: 'button', 'data-id': item.id })
            .addClass('card-item__btn-comprar-ya btn-tactil')
            .text('Pedir');
        const $acciones = $('<div>').addClass('card-item__acciones').append($controlCant, $btnPagarYa);
        const $derecha = $('<div>').addClass('card-item__derecha').append($precioTag, $acciones);

        $card.append($media, $cuerpo, $derecha);
        return $card;
    }

    // Semana 3 - Vista Completa de Detalle de Producto
    let productoDetalleActual = null;
    let cantidadDetalleActual = 1;

    function abrirDetalleProducto(idProducto) {
        const prod = catalogoCompleto.find((x) => String(x.id) === String(idProducto));
        if (!prod) return;
        productoDetalleActual = prod;
        cantidadDetalleActual = 1;

        $('#detalleRutaProducto').text('Carta > ' + (prod.categoria || 'Menu') + ' > ' + prod.nombre);
        $('#detalleProductoImagen')
            .attr('src', prod.portada)
            .attr('alt', prod.alt || ('Ilustracion de ' + prod.nombre));
        $('#detalleProductoCategoria').text(prod.categoria || 'Carta All In');
        $('#detalleProductoTitulo').text(prod.nombre);
        $('#detalleProductoPrecio').text(CONFIG_NEGOCIO.moneda + ' ' + Number(prod.precio || 0).toFixed(2));
        const stockNum = Number(prod.stock || 50);
        $('#detalleProductoStock span').text(stockNum > 0 ? 'Disponible en cocina - Recien preparado' : 'Consultar disponibilidad');
        $('#detalleProductoDescripcion').text(prod.descripcion || 'Preparado al momento en All In Fast Food.');
        $('#detalleProductoTematica').empty()
            .append($('<strong>').text('Detalle / Salsas: '))
            .append(document.createTextNode(prod.tematica || prod.subcategoria || prod.nombre));
        $('#detalleProductoPresentacion').empty()
            .append($('<strong>').text('Porcion: '))
            .append(document.createTextNode(prod.presentacion || 'Porcion individual o para compartir'));
        $('#detalleProductoFicha').text(prod.fichaTecnica || '');
        $('#detalleCantidadValor').text(cantidadDetalleActual);

        const mismaCat = catalogoPrincipal.filter((x) => x.categoria === prod.categoria && String(x.id) !== String(prod.id));
        const otros = catalogoPrincipal.filter((x) => x.categoria !== prod.categoria && String(x.id) !== String(prod.id));
        const relacionados = mismaCat.concat(otros).slice(0, 4);
        const $rel = $('#contenedorRelacionados').empty();
        relacionados.forEach((itemRel) => {
            $rel.append(construirTarjetaProducto(itemRel));
        });

        mostrarVista('vistaDetalleProducto');
        registrarBitacoraDom('DETALLE_PRODUCTO', 'Abierto: ' + prod.nombre);
    }

    $('#btnVolverCatalogo').on('click', function () {
        mostrarVista('vista-catalogo');
    });

    $('#btnDetalleMenos').on('click', function () {
        cantidadDetalleActual = Math.max(1, cantidadDetalleActual - 1);
        $('#detalleCantidadValor').text(cantidadDetalleActual);
    });

    $('#btnDetalleMas').on('click', function () {
        cantidadDetalleActual = Math.min(99, cantidadDetalleActual + 1);
        $('#detalleCantidadValor').text(cantidadDetalleActual);
    });

    $('#btnDetalleAgregar').on('click', function () {
        if (!productoDetalleActual) return;
        agregarAlCarrito(productoDetalleActual, false, cantidadDetalleActual);
    });

    $('#btnDetalleComprarAhora').on('click', function () {
        if (!productoDetalleActual) return;
        agregarAlCarrito(productoDetalleActual, true, cantidadDetalleActual);
        abrirModalCheckout();
    });

    $('#vista-catalogo, #vistaDetalleProducto').on('click', '.card-item__enlace-detalle', function () {
        const id = this.getAttribute('data-detalle-id') || $(this).closest('.card-item').attr('data-id');
        if (id) abrirDetalleProducto(id);
    });

    $('#vista-catalogo, #vistaDetalleProducto').on('keydown', '.card-item__enlace-detalle', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const id = this.getAttribute('data-detalle-id') || $(this).closest('.card-item').attr('data-id');
            if (id) abrirDetalleProducto(id);
        }
    });

    function renderizarFranjaPaquetes() {
        const $cont = $('#contenedorPaquetesRecomendados').empty();
        PAQUETES_RECOMENDADOS.forEach((pack) => {
            $cont.append(construirTarjetaProducto(pack));
        });
    }

    function renderizarTarjetasCatalogo() {
        const $contenedor = $('#contenedor-tarjetas');
        $contenedor.empty();
        const texto = terminoBusqueda.trim().toLowerCase();
        const orden = $('#selector-orden').val() || 'destacado';

        if (texto && contieneGroserias(texto)) {
            $('#resultadoFiltro').text('Mostrando 0 de ' + catalogoPrincipal.length + ' productos.');
            $contenedor.append($('<p>').addClass('mensaje-error-campo').attr('role', 'alert').text('Lenguaje no permitido. Por favor escribe de forma respetuosa.'));
            return;
        }

        let filtrados = catalogoPrincipal.filter((item) => {
            const esNocturno = item.horario === 'Solo en las noches' || item.categoria === 'Menu Nocturno';
            let okCat = true;
            if (!texto && categoriaActiva !== 'todos') {
                if (categoriaActiva === 'Menu Nocturno') {
                    okCat = esNocturno;
                } else if (categoriaActiva === 'Hamburguesas y Alitas') {
                    okCat = item.categoria === 'Hamburguesas' || item.categoria === 'Alitas';
                } else if (categoriaActiva === 'Fingers y Salsas') {
                    okCat = item.categoria === 'Chicken Fingers' || item.categoria === 'Salsas';
                } else {
                    okCat = item.categoria === categoriaActiva;
                }
            }
            const okSub = !subcategoriaActiva || item.subcategoria === subcategoriaActiva;
            const bolsa = (item.nombre + ' ' + item.id + ' ' + item.categoria + ' ' + (item.subcategoria || '') + ' ' + (item.horario || '') + ' ' + (item.tematica || '') + ' ' + (item.descripcion || '')).toLowerCase();
            const okTxt = !texto || bolsa.indexOf(texto) !== -1;
            return okCat && okSub && okTxt;
        });

        if (orden === 'precio-asc') filtrados.sort((a, b) => Number(a.precio) - Number(b.precio));
        if (orden === 'precio-desc') filtrados.sort((a, b) => Number(b.precio) - Number(a.precio));
        if (orden === 'nombre-asc') filtrados.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

        $('#resultadoFiltro').text('Mostrando ' + filtrados.length + ' de ' + catalogoPrincipal.length + ' platos.');

        if (filtrados.length === 0) {
            $contenedor.append($('<p>').addClass('micro-guia').text('No se encontraron platos para el filtro seleccionado.'));
            return;
        }

        filtrados.forEach((item) => $contenedor.append(construirTarjetaProducto(item)));
    }

    // Semana 2 - Filtro de 3 Capas
    function actualizarSubcategoriasCapa2(linea) {
        const $capa2 = $('#capa2');
        $capa2.empty();
        const lista = CONFIG_NEGOCIO.subcategoriasPorLinea[linea] || [];
        if (!linea || lista.length === 0) {
            $capa2.append($('<option>').val('').text('Elige primero una seccion')).prop('disabled', true);
            subcategoriaActiva = '';
            return;
        }
        $capa2.append($('<option>').val('').text('Todas las subcategorias'));
        lista.forEach((s) => $capa2.append($('<option>').val(s.clave).text(s.etiqueta)));
        $capa2.prop('disabled', false);
    }

    function actualizarBannerCategoria() {
        $('#banner-linea').removeClass('banner-linea--almuerzo banner-linea--burgers banner-linea--alitas banner-linea--fingers banner-linea--salsas');
        if (categoriaActiva !== 'todos' && CLASE_BANNER_CATEGORIA[categoriaActiva]) {
            $('#banner-linea').addClass(CLASE_BANNER_CATEGORIA[categoriaActiva]);
        }
        const etiqueta = categoriaActiva === 'todos' ? 'TODA LA CARTA' : categoriaActiva.toUpperCase();
        $('#indicador-linea-activa').html('<strong>' + etiqueta + '</strong>');
        $('#rutaCategoriaActual').text(categoriaActiva === 'todos' ? 'Carta > Ver Todo' : ('Carta > ' + categoriaActiva));
    }

    function seleccionarCategoria(cat) {
        categoriaActiva = cat || 'todos';
        subcategoriaActiva = '';
        productoResaltadoId = '';
        $('#grupo-filtros-categoria .btn-filtro').removeClass('btn-filtro--activo');
        $('#grupo-filtros-categoria .btn-filtro[data-categoria="' + categoriaActiva + '"]').addClass('btn-filtro--activo');
        $('#capa1').val(categoriaActiva === 'todos' ? '' : categoriaActiva);
        actualizarSubcategoriasCapa2(categoriaActiva === 'todos' ? '' : categoriaActiva);
        actualizarBannerCategoria();
        renderizarTarjetasCatalogo();
    }

    $('#grupo-filtros-categoria').on('click', '.btn-filtro', function () {
        seleccionarCategoria(this.getAttribute('data-categoria'));
    });

    $('#gridCategoriasVisuales').on('click', '.cat-visual-card', function () {
        const catElegida = this.getAttribute('data-categoria');
        seleccionarCategoria(catElegida);
        const rejilla = document.getElementById('contenedor-tarjetas');
        if (rejilla) {
            rejilla.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });

    $('#btnToggleCascada').on('click', function () {
        const panel = document.getElementById('filtros-cascada');
        if (!panel) return;
        panel.hidden = !panel.hidden;
        this.setAttribute('aria-expanded', String(!panel.hidden));
    });

    $('#capa1').on('change', function () {
        const val = $(this).val();
        categoriaActiva = val || 'todos';
        subcategoriaActiva = '';
        $('#grupo-filtros-categoria .btn-filtro').removeClass('btn-filtro--activo');
        $('#grupo-filtros-categoria .btn-filtro[data-categoria="' + categoriaActiva + '"]').addClass('btn-filtro--activo');
        actualizarSubcategoriasCapa2(val);
        actualizarBannerCategoria();
        renderizarTarjetasCatalogo();
    });

    $('#capa2').on('change', function () {
        subcategoriaActiva = $(this).val() || '';
        renderizarTarjetasCatalogo();
    });

    $('#selector-orden').on('change', renderizarTarjetasCatalogo);

    // Semana 3 - Flujo de Pago Rapido y Carrito Boutique
    const URL_LOGO_RESPALDO_CARRITO = 'https://www.dropbox.com/scl/fi/3f7n6ezktped54rgafyhz/Logo-ALL-IN.png?rlkey=3hu57t9whtuqykp2230taxzt8&st=o5to91g6&raw=1';
    let temporizadorCierreCarrito = null;

    function obtenerPortadaProductoCarrito(item) {
        const portadaGuardada = String((item && item.portada) || '').trim();
        if (portadaGuardada) {
            return portadaGuardada;
        }
        const idBuscado = String((item && item.id) || '');
        const fuente = catalogoCompleto.length > 0 ? catalogoCompleto : CATALOGO_RESPALDO.concat(PAQUETES_RECOMENDADOS);
        const encontrado = fuente.find((x) => String(x.id) === idBuscado);
        if (encontrado && encontrado.portada) {
            return encontrado.portada;
        }
        return URL_LOGO_RESPALDO_CARRITO;
    }

    function actualizarBarraPagoRapido() {
        const barra = document.getElementById('barraPagoRapido');
        if (!barra) return;
        const esCliente = api.normalizarRol(sesionActiva.rol) === 'cliente';
        const unidades = carrito.reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
        const subtotal = carrito.reduce((acc, it) => acc + Number(it.cantidad || 0) * Number(it.precio || 0), 0);
        const total = subtotal * (1 + TASA_IMPUESTO);
        const etiquetaItems = unidades === 1 ? '1 item' : (unidades + ' items');
        $('#barraPagoResumen').text(etiquetaItems + ' | ' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2));
        const panelCar = document.getElementById('panelCarritoDrawer');
        const drawerAbierto = Boolean(panelCar && panelCar.classList.contains('carrito-drawer--abierto'));
        const modalAbierto = !$('#modalCheckout').prop('hidden');
        const visible = esCliente && unidades > 0 && !drawerAbierto && !modalAbierto;
        barra.hidden = !visible;
        document.body.classList.toggle('con-barra-pago', visible);
    }

    function renderizarCarrito() {
        const $lista = $('#listaItemsCarrito').empty();
        let unidades = 0;
        let subtotal = 0;
        carrito.forEach((item) => {
            const cant = Math.max(1, Number(item.cantidad || 1));
            const precioUnit = Number(item.precio || 0);
            const subItem = cant * precioUnit;
            unidades += cant;
            subtotal += subItem;

            const $li = $('<li>').addClass('carrito-item');
            const $thumb = $('<img>')
                .addClass('carrito-item__thumb')
                .attr('src', obtenerPortadaProductoCarrito(item))
                .attr('alt', 'Fotografia de ' + (item.nombre || 'producto de fiesta'))
                .attr('loading', 'lazy');
            const $info = $('<div>').addClass('carrito-item__info')
                .append($('<strong>').addClass('carrito-item__nombre').text(item.nombre || 'Producto de fiesta'))
                .append(
                    $('<span>').addClass('carrito-item__precios')
                        .append(document.createTextNode(CONFIG_NEGOCIO.moneda + ' ' + precioUnit.toFixed(2) + ' c/u \u00B7 Subtotal: '))
                        .append($('<span>').addClass('carrito-item__subtotal').text(CONFIG_NEGOCIO.moneda + ' ' + subItem.toFixed(2)))
                );
            const $stepper = $('<div>').addClass('carrito-stepper');
            const $btnMenos = $('<button>')
                .attr({ type: 'button', 'aria-label': 'Restar unidad de ' + (item.nombre || 'producto'), 'data-id': item.id })
                .addClass('carrito-stepper__btn btn-restar-carrito')
                .text('-');
            const $valor = $('<span>').addClass('carrito-stepper__valor').attr('aria-live', 'polite').text(cant);
            const $btnMas = $('<button>')
                .attr({ type: 'button', 'aria-label': 'Sumar unidad de ' + (item.nombre || 'producto'), 'data-id': item.id })
                .addClass('carrito-stepper__btn carrito-stepper__btn--mas btn-sumar-carrito')
                .text('+');
            $stepper.append($btnMenos, $valor, $btnMas);

            $li.append($thumb, $info, $stepper);
            $lista.append($li);
        });
        const impuesto = subtotal * TASA_IMPUESTO;
        const total = subtotal + impuesto;
        const tieneItems = carrito.length > 0;
        $('#carritoVacioMensaje').prop('hidden', tieneItems);
        $('#listaItemsCarrito').prop('hidden', !tieneItems);
        $('#carritoUnidades').text(unidades);
        $('#carritoCabeceraBadge').text(unidades === 1 ? '1 plato' : (unidades + ' platos'));
        $('#badgeCarritoHeader').text(unidades);
        $('#montoCarritoHeader').text(CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2));
        $('#carritoSubtotal').text(CONFIG_NEGOCIO.moneda + ' ' + subtotal.toFixed(2));
        $('#carritoImpuesto').text(CONFIG_NEGOCIO.moneda + ' ' + impuesto.toFixed(2));
        $('#carritoTotal').text(CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2));
        guardarCarritoLocal();
        sincronizarControlesTarjetas();
        actualizarBarraPagoRapido();
    }

    function agregarAlCarrito(prod, silencioso, cantidadAgregar) {
        const incremento = Math.max(1, parseInt(cantidadAgregar, 10) || 1);
        const existente = carrito.find((x) => String(x.id) === String(prod.id));
        if (existente) {
            existente.cantidad += incremento;
            if (!existente.portada && prod.portada) {
                existente.portada = prod.portada;
            }
        } else {
            carrito.push({
                id: prod.id,
                nombre: prod.nombre,
                precio: Number(prod.precio || 0),
                cantidad: incremento,
                portada: prod.portada || ''
            });
        }
        renderizarCarrito();
        if (!silencioso) {
            mostrarToast('Agregado a tu pedido: ' + prod.nombre + (incremento > 1 ? (' (x' + incremento + ')') : ''), 'exito');
        }
        registrarBitacoraDom('CARRITO', 'Agregado ' + prod.nombre + ' x' + incremento);
    }

    function actualizarCantidadProducto(id, delta) {
        const idx = carrito.findIndex((x) => String(x.id) === String(id));
        if (idx === -1) {
            if (delta > 0) {
                const prod = catalogoCompleto.find((x) => String(x.id) === String(id));
                if (prod) agregarAlCarrito(prod, true);
            }
            return;
        }
        carrito[idx].cantidad += delta;
        if (carrito[idx].cantidad <= 0) {
            carrito.splice(idx, 1);
        }
        renderizarCarrito();
    }

    $('#vista-catalogo, #vistaDetalleProducto').on('click', '.card-item__btn-simular', function (e) {
        e.stopPropagation();
        const id = this.getAttribute('data-id');
        const prod = catalogoCompleto.find((x) => String(x.id) === String(id));
        if (prod) agregarAlCarrito(prod);
    });

    $('#vista-catalogo, #vistaDetalleProducto').on('click', '.btn-stepper-sumar', function (e) {
        e.stopPropagation();
        actualizarCantidadProducto(this.getAttribute('data-id'), 1);
    });

    $('#vista-catalogo, #vistaDetalleProducto').on('click', '.btn-stepper-restar', function (e) {
        e.stopPropagation();
        actualizarCantidadProducto(this.getAttribute('data-id'), -1);
    });

    $('#vista-catalogo, #vistaDetalleProducto').on('click', '.card-item__btn-comprar-ya', function (e) {
        e.stopPropagation();
        const id = this.getAttribute('data-id');
        const prod = catalogoCompleto.find((x) => String(x.id) === String(id));
        if (!prod) return;
        if (obtenerCantidadEnCarrito(prod.id) === 0) {
            agregarAlCarrito(prod, true);
        }
        abrirModalCheckout();
    });

    $('#listaItemsCarrito').on('click', '.btn-sumar-carrito', function () {
        actualizarCantidadProducto(this.getAttribute('data-id'), 1);
    });

    $('#listaItemsCarrito').on('click', '.btn-restar-carrito', function () {
        actualizarCantidadProducto(this.getAttribute('data-id'), -1);
    });

    function abrirCarrito() {
        clearTimeout(temporizadorCierreCarrito);
        const panel = document.getElementById('panelCarritoDrawer');
        const backdrop = document.getElementById('carritoBackdrop');
        if (!panel || !backdrop) return;
        backdrop.hidden = false;
        panel.hidden = false;
        void panel.offsetHeight;
        backdrop.classList.add('carrito-backdrop--abierto');
        panel.classList.add('carrito-drawer--abierto');
        document.body.classList.add('carrito-abierto');
        actualizarBarraPagoRapido();
    }

    function cerrarCarrito(inmediato) {
        clearTimeout(temporizadorCierreCarrito);
        const panel = document.getElementById('panelCarritoDrawer');
        const backdrop = document.getElementById('carritoBackdrop');
        document.body.classList.remove('carrito-abierto');
        if (panel) panel.classList.remove('carrito-drawer--abierto');
        if (backdrop) backdrop.classList.remove('carrito-backdrop--abierto');
        actualizarBarraPagoRapido();
        if (inmediato) {
            if (backdrop) backdrop.hidden = true;
            if (panel) panel.hidden = true;
            return;
        }
        temporizadorCierreCarrito = setTimeout(() => {
            if (panel && !panel.classList.contains('carrito-drawer--abierto')) {
                panel.hidden = true;
            }
            if (backdrop && !backdrop.classList.contains('carrito-backdrop--abierto')) {
                backdrop.hidden = true;
            }
        }, 260);
    }

    $('#btnCarritoHeader, #btnBarraVerCarrito').on('click', abrirCarrito);
    $('#btnBarraPagarAhora').on('click', () => abrirModalCheckout());
    $('#btnCerrarCarrito, #carritoBackdrop').on('click', () => cerrarCarrito(false));
    $('#btnExplorarDesdeCarrito').on('click', function () {
        cerrarCarrito(false);
        mostrarVista('vista-catalogo');
    });
    $('#btnIrAMisPedidosCarrito').on('click', function () {
        cerrarCarrito(true);
        mostrarVista('vistaMisPedidos');
    });
    $('#btnVaciarCarrito').on('click', function () {
        carrito = [];
        pedidoEnEdicionId = null;
        renderizarCarrito();
        mostrarToast('Carrito vaciado.', 'alerta');
    });

    function formatearMinutosSegundos(totalSeg) {
        const sLimpio = Math.max(0, Math.floor(totalSeg));
        const min = Math.floor(sLimpio / 60);
        const seg = sLimpio % 60;
        return String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0');
    }

    function iniciarTemporizadorCheckout() {
        clearInterval(temporizadorCheckout);
        segundosCheckout = DURACION_CHECKOUT_SEG;
        $('#temporizadorTexto').text(formatearMinutosSegundos(segundosCheckout));
        $('#barraProgresoTiempo').css('width', '100%');
        temporizadorCheckout = setInterval(() => {
            segundosCheckout -= 1;
            if (segundosCheckout <= 0) {
                segundosCheckout = DURACION_CHECKOUT_SEG;
                $('#temporizadorTexto').text(formatearMinutosSegundos(segundosCheckout));
                $('#barraProgresoTiempo').css('width', '100%');
                mostrarToast('Tiempo renovado por 5 minutos mas', 'alerta');
                return;
            }
            $('#temporizadorTexto').text(formatearMinutosSegundos(segundosCheckout));
            $('#barraProgresoTiempo').css('width', ((segundosCheckout / DURACION_CHECKOUT_SEG) * 100) + '%');
        }, 1000);
    }

    const CLAVE_NOMBRE_INVITADO = 'nombreInvitado_' + api.PROYECTO_ACTUAL;
    function obtenerNombreInvitadoGuardado() {
        try {
            return String(sessionStorage.getItem(CLAVE_NOMBRE_INVITADO) || '').trim();
        } catch (err) {
            return '';
        }
    }

    function guardarNombreInvitado(nombre) {
        try {
            if (nombre) sessionStorage.setItem(CLAVE_NOMBRE_INVITADO, nombre);
        } catch (err) {
        }
    }

    // Semana 3 - Panel Dinamico de Forma de Pago
    function calcularTotalCheckoutActual() {
        const subtotal = carrito.reduce((acc, it) => acc + Number(it.precio || 0) * Number(it.cantidad || 0), 0);
        return Number((subtotal * (1 + TASA_IMPUESTO)).toFixed(2));
    }

    function construirQrSvgInline() {
        const svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210" width="210" height="210">',
            '<rect width="210" height="210" rx="14" fill="#ffffff"/>',
            '<rect x="14" y="14" width="54" height="54" rx="6" fill="none" stroke="#111215" stroke-width="8"/>',
            '<rect x="28" y="28" width="26" height="26" rx="3" fill="#F97316"/>',
            '<rect x="142" y="14" width="54" height="54" rx="6" fill="none" stroke="#111215" stroke-width="8"/>',
            '<rect x="156" y="28" width="26" height="26" rx="3" fill="#EF4444"/>',
            '<rect x="14" y="142" width="54" height="54" rx="6" fill="none" stroke="#111215" stroke-width="8"/>',
            '<rect x="28" y="156" width="26" height="26" rx="3" fill="#22C55E"/>',
            '<g fill="#111215">',
            '<rect x="82" y="14" width="12" height="12"/><rect x="102" y="14" width="12" height="12"/><rect x="122" y="14" width="10" height="12"/>',
            '<rect x="82" y="34" width="22" height="10"/><rect x="114" y="34" width="18" height="10"/>',
            '<rect x="82" y="54" width="10" height="14"/><rect x="102" y="54" width="14" height="14"/><rect x="122" y="54" width="10" height="14"/>',
            '<rect x="14" y="82" width="14" height="12"/><rect x="36" y="82" width="14" height="12"/><rect x="58" y="82" width="12" height="24"/>',
            '<rect x="14" y="104" width="26" height="12"/><rect x="48" y="114" width="22" height="14"/>',
            '<rect x="14" y="124" width="18" height="10"/><rect x="142" y="82" width="14" height="14"/><rect x="164" y="82" width="32" height="12"/>',
            '<rect x="142" y="104" width="24" height="12"/><rect x="176" y="104" width="20" height="22"/>',
            '<rect x="142" y="124" width="12" height="10"/><rect x="82" y="142" width="14" height="14"/><rect x="104" y="142" width="26" height="12"/>',
            '<rect x="142" y="142" width="16" height="16"/><rect x="168" y="142" width="28" height="14"/>',
            '<rect x="82" y="164" width="26" height="12"/><rect x="118" y="164" width="16" height="14"/><rect x="142" y="168" width="22" height="12"/>',
            '<rect x="174" y="166" width="22" height="30"/><rect x="82" y="184" width="14" height="12"/><rect x="104" y="184" width="28" height="12"/>',
            '<rect x="142" y="186" width="24" height="10"/>',
            '</g>',
            '<circle cx="105" cy="105" r="28" fill="#111215" stroke="#F97316" stroke-width="4" stroke-dasharray="6 4"/>',
            '<text x="105" y="111" text-anchor="middle" fill="#F97316" font-family="Arial, sans-serif" font-size="14" font-weight="bold">ALL IN</text>',
            '</svg>'
        ].join('');
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function extraerDatosFormaPagoGuardada(formaPagoRaw) {
        const texto = String(formaPagoRaw || 'Pago por QR').trim();
        let tipo = 'Pago por QR';
        if (texto.indexOf('Transferencia Bancaria') === 0) {
            tipo = 'Transferencia Bancaria';
        } else if (texto.indexOf('Efectivo Contra Entrega') === 0) {
            tipo = 'Efectivo Contra Entrega';
        }
        const matchRef = texto.match(/\(Ref:\s*([^)]+)\)/i);
        const matchEfec = texto.match(/Paga con\s+(?:Bs\.?\s*)?([0-9]+(?:\.[0-9]+)?)/i);
        return {
            tipo: tipo,
            referencia: matchRef ? matchRef[1].trim() : '',
            montoEfectivo: matchEfec ? matchEfec[1].trim() : ''
        };
    }

    function actualizarCalculoCambioEfectivo(total) {
        const $texto = $('#textoCambioEfectivo');
        if (!$texto.length) return;
        const crudo = String($('#inputMontoEfectivo').val() || '').trim();
        $texto.removeClass('panel-detalle-pago__cambio--ok panel-detalle-pago__cambio--alerta');
        if (!crudo) {
            $texto.text('Ingresa el monto con el que pagaras para calcular tu cambio.');
            return;
        }
        const monto = Number(crudo);
        if (!Number.isFinite(monto) || monto <= 0) {
            $texto.addClass('panel-detalle-pago__cambio--alerta').text('Ingresa un monto valido mayor a 0.');
            return;
        }
        if (monto + 0.001 < total) {
            $texto.addClass('panel-detalle-pago__cambio--alerta').text(
                'El monto ingresado (' + CONFIG_NEGOCIO.moneda + ' ' + monto.toFixed(2) + ') es menor al total a pagar (' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2) + ').'
            );
            return;
        }
        const cambio = Number((monto - total).toFixed(2));
        if (cambio <= 0.005) {
            $texto.addClass('panel-detalle-pago__cambio--ok').text('Monto exacto (no requiere cambio).');
            return;
        }
        $texto.addClass('panel-detalle-pago__cambio--ok').text('Cambio a entregar: ' + CONFIG_NEGOCIO.moneda + ' ' + cambio.toFixed(2));
    }

    function renderizarPanelDetallePago(valoresIniciales) {
        const $panel = $('#panelDetallePago').empty();
        if (!$panel.length) return;
        const forma = String($('#checkoutPago').val() || 'Pago por QR');
        const total = calcularTotalCheckoutActual();
        const refInicial = String((valoresIniciales && valoresIniciales.referencia) || '');
        const montoInicial = String((valoresIniciales && valoresIniciales.montoEfectivo) || '');

        if (forma === 'Pago por QR') {
            const urlQrReal = String(CONFIG_PAGO_NEGOCIO.qrUrl || '').trim();
            const srcQr = urlQrReal || construirQrSvgInline();
            const $cab = $('<div>').addClass('panel-detalle-pago__cabecera')
                .append($('<strong>').addClass('panel-detalle-pago__titulo').text('Escanea y transfiere por QR'))
                .append($('<span>').addClass('panel-detalle-pago__monto').text('Total: ' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2)));
            const $qrCaja = $('<div>').addClass('panel-detalle-pago__qr-caja');
            const $imgQr = $('<img>')
                .addClass('panel-detalle-pago__qr-img img-ampliable')
                .attr('src', srcQr)
                .attr('alt', 'Codigo QR de cobro oficial de ' + CONFIG_PAGO_NEGOCIO.tienda);
            const $btnQr = $('<button>')
                .attr({ type: 'button', id: 'btnDescargarVerQr' })
                .addClass('panel-detalle-pago__btn')
                .append('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>')
                .append($('<span>').text('Descargar / Ver QR'))
                .on('click', function () {
                    abrirLightboxImagen(srcQr, 'QR de Cobro - ' + CONFIG_PAGO_NEGOCIO.tienda + ' (' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2) + ')');
                    try {
                        const a = document.createElement('a');
                        a.href = urlQrReal ? urlQrReal.replace('raw=1', 'dl=1') : srcQr;
                        a.download = urlQrReal ? 'QR-All-In-Fast-Food.jpg' : 'QR-All-In-Fast-Food.svg';
                        if (urlQrReal) {
                            a.target = '_blank';
                            a.rel = 'noopener noreferrer';
                        }
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    } catch (err) {
                    }
                });
            $qrCaja.append($imgQr, $btnQr);
            const $grupoRef = $('<div>').addClass('campo-grupo')
                .append($('<label>').attr('for', 'inputRefPago').addClass('etiqueta-campo').text('Comprobante o referencia QR'))
                .append($('<input>').attr({ type: 'text', id: 'inputRefPago', placeholder: 'Nro. de comprobante o referencia (opcional)' }).addClass('control-input').val(refInicial));
            $panel.append($cab, $qrCaja, $grupoRef);
            inyectarSpansErrorTiempoReal();
            actualizarEstadoBotonFormulario('checkout');
            return;
        }

        if (forma === 'Transferencia Bancaria') {
            const $cab = $('<div>').addClass('panel-detalle-pago__cabecera')
                .append($('<strong>').addClass('panel-detalle-pago__titulo').text('Datos para Transferencia Bancaria'))
                .append($('<span>').addClass('panel-detalle-pago__monto').text('Total: ' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2)));
            const $datos = $('<div>').addClass('panel-detalle-pago__datos')
                .append($('<div>').addClass('panel-detalle-pago__fila-dato').append($('<span>').addClass('panel-detalle-pago__etiqueta').text('Banco:')).append($('<span>').addClass('panel-detalle-pago__valor').text(CONFIG_PAGO_NEGOCIO.banco)))
                .append($('<div>').addClass('panel-detalle-pago__fila-dato').append($('<span>').addClass('panel-detalle-pago__etiqueta').text('Cuenta:')).append($('<span>').addClass('panel-detalle-pago__valor').text(CONFIG_PAGO_NEGOCIO.cuenta)))
                .append($('<div>').addClass('panel-detalle-pago__fila-dato').append($('<span>').addClass('panel-detalle-pago__etiqueta').text('Titular:')).append($('<span>').addClass('panel-detalle-pago__valor').text(CONFIG_PAGO_NEGOCIO.titular)))
                .append($('<div>').addClass('panel-detalle-pago__fila-dato').append($('<span>').addClass('panel-detalle-pago__etiqueta').text('Documento:')).append($('<span>').addClass('panel-detalle-pago__valor').text(CONFIG_PAGO_NEGOCIO.documento)));
            const $feedbackCopia = $('<span>').attr({ id: 'feedbackCopiaCuenta', 'aria-live': 'polite' }).addClass('panel-detalle-pago__feedback');
            const $btnCopiar = $('<button>')
                .attr({ type: 'button', id: 'btnCopiarCuenta' })
                .addClass('panel-detalle-pago__btn')
                .append('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>')
                .append($('<span>').text('Copiar Cuenta'))
                .on('click', async function () {
                    let copiado = false;
                    try {
                        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                            await navigator.clipboard.writeText(CONFIG_PAGO_NEGOCIO.cuenta);
                            copiado = true;
                        }
                    } catch (err) {
                    }
                    if (!copiado) {
                        const tmp = document.createElement('textarea');
                        tmp.value = CONFIG_PAGO_NEGOCIO.cuenta;
                        tmp.setAttribute('readonly', '');
                        document.body.appendChild(tmp);
                        tmp.select();
                        try {
                            copiado = document.execCommand('copy');
                        } catch (err2) {
                        }
                        document.body.removeChild(tmp);
                    }
                    $feedbackCopia.text(copiado ? 'Cuenta copiada' : ('Cuenta: ' + CONFIG_PAGO_NEGOCIO.cuenta));
                    mostrarToast('Cuenta copiada: ' + CONFIG_PAGO_NEGOCIO.cuenta, 'exito');
                    setTimeout(() => $feedbackCopia.text(''), 2600);
                });
            const $acciones = $('<div>').addClass('panel-detalle-pago__acciones').append($btnCopiar, $feedbackCopia);
            const $grupoRef = $('<div>').addClass('campo-grupo')
                .append($('<label>').attr('for', 'inputRefPago').addClass('etiqueta-campo').text('Comprobante bancario'))
                .append($('<input>').attr({ type: 'text', id: 'inputRefPago', placeholder: 'Nro. de operacion bancaria (opcional)' }).addClass('control-input').val(refInicial));
            $panel.append($cab, $datos, $acciones, $grupoRef);
            inyectarSpansErrorTiempoReal();
            actualizarEstadoBotonFormulario('checkout');
            return;
        }

        const $cabEf = $('<div>').addClass('panel-detalle-pago__cabecera')
            .append($('<strong>').addClass('panel-detalle-pago__titulo').text('Efectivo Contra Entrega'))
            .append($('<span>').addClass('panel-detalle-pago__monto').text('Total: ' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2)));
        const $grupoEf = $('<div>').addClass('campo-grupo')
            .append($('<label>').attr('for', 'inputMontoEfectivo').addClass('etiqueta-campo').text('Con cuanto pagas? (para llevar cambio)'))
            .append($('<input>').attr({ type: 'number', id: 'inputMontoEfectivo', min: '0', step: '1', inputmode: 'decimal', placeholder: 'Ej. 100' }).addClass('control-input').val(montoInicial));
        const $cambio = $('<p>').attr({ id: 'textoCambioEfectivo', 'aria-live': 'polite' }).addClass('panel-detalle-pago__cambio');
        $panel.append($cabEf, $grupoEf, $cambio);
        $('#inputMontoEfectivo').on('input', () => {
            actualizarCalculoCambioEfectivo(total);
            actualizarEstadoBotonFormulario('checkout');
        });
        inyectarSpansErrorTiempoReal();
        actualizarCalculoCambioEfectivo(total);
        actualizarEstadoBotonFormulario('checkout');
    }

    function construirTextoDetallePago(formaPagoBase, total) {
        if (formaPagoBase === 'Pago por QR' || formaPagoBase === 'Transferencia Bancaria') {
            const ref = String($('#inputRefPago').val() || '').trim();
            return ref ? (formaPagoBase + ' (Ref: ' + ref + ')') : formaPagoBase;
        }
        const montoCrudo = String($('#inputMontoEfectivo').val() || '').trim();
        const monto = Number(montoCrudo);
        if (montoCrudo && Number.isFinite(monto) && monto > 0) {
            if (monto + 0.001 < total) {
                return formaPagoBase + ' (Paga con ' + CONFIG_NEGOCIO.moneda + ' ' + monto.toFixed(2) + ' - Monto menor al total)';
            }
            const cambio = Number((monto - total).toFixed(2));
            if (cambio <= 0.005) {
                return formaPagoBase + ' (Monto exacto ' + CONFIG_NEGOCIO.moneda + ' ' + monto.toFixed(2) + ')';
            }
            return formaPagoBase + ' (Paga con ' + CONFIG_NEGOCIO.moneda + ' ' + monto.toFixed(2) + ' - Cambio: ' + CONFIG_NEGOCIO.moneda + ' ' + cambio.toFixed(2) + ')';
        }
        return formaPagoBase;
    }

    function abrirModalCheckout(pedidoEditar) {
        const esInvitado = sesionActiva.usuario === 'Invitado' || !sesionActiva.autenticada;
        let datosPagoIniciales = null;
        let mostrarAvisoAutocompletado = false;
        if (pedidoEditar && pedidoEditar.id) {
            pedidoEnEdicionId = pedidoEditar.id;
            if (Array.isArray(pedidoEditar.items) && pedidoEditar.items.length > 0) {
                carrito = pedidoEditar.items.map((it) => ({
                    id: it.id || ('ITEM-' + Date.now()),
                    nombre: it.nombre || 'Plato All In',
                    precio: Number(it.precio || 0),
                    cantidad: Math.max(1, Number(it.cantidad || 1)),
                    portada: it.portada || ''
                }));
                renderizarCarrito();
            }
            datosPagoIniciales = extraerDatosFormaPagoGuardada(pedidoEditar.forma_pago);
            $('#tituloModalCheckout').text('Editar Pedido #' + pedidoEditar.id);
            $('#btnSubmitCheckout').text('Guardar Cambios');
            $('#bloqueTimerCheckout').prop('hidden', true);
            $('#grupoCheckoutNombreCliente').prop('hidden', false);
            $('#checkoutNombreCliente').val(pedidoEditar.cliente || (esInvitado ? obtenerNombreInvitadoGuardado() : sesionActiva.usuario));
            const modCruda = String(pedidoEditar.modalidad || 'Delivery a Domicilio');
            const matchCel = modCruda.match(/\s*\|\s*Cel:\s*([^|]+)/i);
            const matchNotas = modCruda.match(/\s*\|\s*Notas:\s*(.+)$/i);
            const modBase = modCruda.split(' | ')[0] || 'Delivery a Domicilio';
            $('#checkoutModalidad').val(modBase);
            $('#checkoutCelular').val(matchCel ? matchCel[1].trim() : '');
            $('#checkoutNotasEntrega').val(matchNotas ? matchNotas[1].trim() : '');
            $('#checkoutPago').val(datosPagoIniciales.tipo);
        } else {
            pedidoEnEdicionId = null;
            if (carrito.length === 0) {
                mostrarToast('Agrega al menos un plato a tu pedido.', 'error');
                return;
            }
            $('#tituloModalCheckout').text('Confirmar Pedido All In');
            $('#btnSubmitCheckout').text('Confirmar Pedido');
            $('#bloqueTimerCheckout').prop('hidden', false);
            $('#grupoCheckoutNombreCliente').prop('hidden', !esInvitado);
            $('#checkoutNombreCliente').val(esInvitado ? obtenerNombreInvitadoGuardado() : sesionActiva.usuario);
            $('#checkoutCelular').val('');
            $('#checkoutNotasEntrega').val('');
            if (esClienteAutenticado()) {
                const perfil = cargarPerfilClienteLocal();
                const notasCombinadas = [perfil.direccion, perfil.salsasNotas].filter(Boolean).join(' - ');
                if (perfil.celular || notasCombinadas) {
                    $('#checkoutCelular').val(perfil.celular);
                    $('#checkoutNotasEntrega').val(notasCombinadas);
                    mostrarAvisoAutocompletado = true;
                }
            }
            iniciarTemporizadorCheckout();
        }
        $('#avisoAutocompletadoCheckout').prop('hidden', !mostrarAvisoAutocompletado);
        limpiarErrorCampo($('#checkoutNombreCliente'));
        limpiarErrorCampo($('#checkoutCelular'));
        limpiarErrorCampo($('#checkoutNotasEntrega'));
        $('#invitacionCuentaCheckout').prop('hidden', !esInvitado);
        cerrarCarrito(true);
        $('#feedbackCheckout').prop('hidden', true);
        renderizarPanelDetallePago(datosPagoIniciales);
        $('#modalCheckout').prop('hidden', false);
        actualizarEstadoBotonFormulario('checkout');
        actualizarBarraPagoRapido();
    }

    $('#checkoutPago').on('change', function () {
        renderizarPanelDetallePago();
    });

    function cerrarModalCheckout() {
        clearInterval(temporizadorCheckout);
        pedidoEnEdicionId = null;
        $('#modalCheckout').prop('hidden', true);
        actualizarBarraPagoRapido();
    }

    $('#btnAbrirCheckout').on('click', () => abrirModalCheckout());
    $('#btnCerrarCheckout').on('click', cerrarModalCheckout);

    $('#btnEjemploCotizador').on('click', function () {
        $('.btn-subtab[data-grupo="cotizador"]').removeClass('btn-subtab--activo');
        $('.btn-subtab[data-grupo="cotizador"][data-subtab="subtab-calculador"]').addClass('btn-subtab--activo');
        $('.panel-subtab[data-grupo="cotizador"]').each(function () {
            this.hidden = this.id !== 'subtab-calculador';
        });
        $('#hrs').val(2).trigger('input');
        $('#variantSelect').prop('selectedIndex', 1);
        const $tematica = $('#userTikTok');
        limpiarErrorCampo($tematica);
        $tematica.val('Salsa Barbacoa y Picante aparte, papas bien crocantes').trigger('input');
        $('#errUserTikTok').text('Ejemplo listo').removeClass('estado-validacion-campo--error').addClass('estado-validacion-campo--ok');
        mostrarToast('Ejemplo cargado: 2 porciones y Combo Mesa Poker con salsas.', 'exito');
    });

    $('#hrs').on('input', function () {
        const cant = Math.max(1, parseInt($(this).val(), 10) || 1);
        $('#total').text(cant * CONFIG_NEGOCIO.tarifaCalculador);
    });

    $('#btnModal').on('click', function () {
        const cant = Math.max(1, parseInt($('#hrs').val(), 10) || 1);
        agregarAlCarrito({
            id: 'PACK-COM-' + cant,
            nombre: 'Porciones Poker All In (' + cant + ' porciones)',
            precio: cant * CONFIG_NEGOCIO.tarifaCalculador
        }, true);
        abrirModalCheckout();
    });

    $('#orderForm').on('submit', function (e) {
        e.preventDefault();
        const $campoTematica = $('#userTikTok');
        limpiarErrorCampo($campoTematica);
        const tematica = String($campoTematica.val() || '').trim();
        const sel = document.getElementById('variantSelect');
        const opcion = sel.options[sel.selectedIndex];
        const validacion = validarTextoEnVivo(tematica, 'mensaje');
        if (!validacion.valido) {
            $('#errUserTikTok').text('Revisa este campo').removeClass('estado-validacion-campo--ok').addClass('estado-validacion-campo--error');
            mostrarErrorCampo($campoTematica, validacion.error);
            actualizarEstadoBotonFormulario('combo');
            return;
        }
        $('#errUserTikTok').text('Valido').removeClass('estado-validacion-campo--error').addClass('estado-validacion-campo--ok');
        agregarAlCarrito({
            id: 'COMBO-' + sel.selectedIndex,
            nombre: 'Combo All In: ' + sel.value + ' (' + tematica + ')',
            precio: Number(opcion.getAttribute('data-precio') || 50)
        });
        $('#estadoOrdenDirecta')
            .removeClass('feedback-formulario--error')
            .addClass('feedback-formulario--exito')
            .text('Combo agregado a tu pedido con notas: ' + tematica + '.')
            .prop('hidden', false);
        this.reset();
        limpiarErrorCampo($campoTematica);
        actualizarEstadoBotonFormulario('combo');
    });

    $('#formCheckout').on('submit', async function (e) {
        e.preventDefault();
        const esInvitado = sesionActiva.usuario === 'Invitado' || !sesionActiva.autenticada;
        const $campoNombre = $('#checkoutNombreCliente');
        limpiarErrorCampo($campoNombre);
        const $campoCelular = $('#checkoutCelular');
        limpiarErrorCampo($campoCelular);
        const $campoNotas = $('#checkoutNotasEntrega');
        limpiarErrorCampo($campoNotas);
        const $campoRef = $('#inputRefPago');
        limpiarErrorCampo($campoRef);
        const $campoEfec = $('#inputMontoEfectivo');
        limpiarErrorCampo($campoEfec);
        $('#feedbackCheckout').prop('hidden', true);

        const cliente = (esInvitado || pedidoEnEdicionId)
            ? String($campoNombre.val() || '').trim()
            : String(sesionActiva.usuario || '').trim();
        const modalidadBase = String($('#checkoutModalidad').val() || 'Delivery a Domicilio');
        const celularEntrega = String($campoCelular.val() || '').trim();
        const notasEntrega = String($campoNotas.val() || '').trim();
        const formaPagoBase = String($('#checkoutPago').val() || 'Pago por QR');
        if (esInvitado || pedidoEnEdicionId) {
            const valNombre = validarTextoEnVivo(cliente, 'nombre');
            if (!valNombre.valido) {
                mostrarErrorCampo($campoNombre, valNombre.error);
                actualizarEstadoBotonFormulario('checkout');
                return;
            }
        }
        if (celularEntrega) {
            const valCel = validarTextoEnVivo(celularEntrega, 'celular');
            if (!valCel.valido) {
                mostrarErrorCampo($campoCelular, valCel.error);
                actualizarEstadoBotonFormulario('checkout');
                return;
            }
        }
        if (notasEntrega) {
            const valNotas = validarTextoEnVivo(notasEntrega, 'mensaje');
            if (!valNotas.valido) {
                mostrarErrorCampo($campoNotas, valNotas.error);
                actualizarEstadoBotonFormulario('checkout');
                return;
            }
        }
        if ($campoRef.length && String($campoRef.val() || '').trim()) {
            const valRef = validarTextoEnVivo($campoRef.val(), 'referencia');
            if (!valRef.valido) {
                mostrarErrorCampo($campoRef, valRef.error);
                actualizarEstadoBotonFormulario('checkout');
                return;
            }
        }
        const partesModalidad = [modalidadBase];
        if (celularEntrega) partesModalidad.push('Cel: ' + celularEntrega);
        if (notasEntrega) partesModalidad.push('Notas: ' + notasEntrega);
        const modalidad = partesModalidad.join(' | ');
        const contienePromo = carrito.some((it) => String(it.id) === 'PROMO-EXPRESS');
        const itemsConfirmados = carrito.slice();
        const subtotal = itemsConfirmados.reduce((acc, it) => acc + it.precio * it.cantidad, 0);
        const total = Number((subtotal * (1 + TASA_IMPUESTO)).toFixed(2));
        if (formaPagoBase === 'Efectivo Contra Entrega') {
            const montoCrudo = String($campoEfec.val() || '').trim();
            if (montoCrudo) {
                const montoEfec = Number(montoCrudo);
                if (!Number.isFinite(montoEfec) || montoEfec + 0.001 < total) {
                    mostrarErrorCampo($campoEfec, 'El monto en efectivo debe ser mayor o igual al total (' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2) + ').');
                    return;
                }
            }
        }
        if (esInvitado) {
            guardarNombreInvitado(cliente);
        } else if (esClienteAutenticado()) {
            const perfilActual = cargarPerfilClienteLocal();
            const nuevoPerfil = {
                direccion: perfilActual.direccion || notasEntrega,
                salsasNotas: perfilActual.salsasNotas,
                celular: celularEntrega || perfilActual.celular
            };
            if (nuevoPerfil.direccion || nuevoPerfil.salsasNotas || nuevoPerfil.celular) {
                guardarPerfilClienteLocal(nuevoPerfil);
            }
        }
        const formaPagoDetalle = construirTextoDetallePago(formaPagoBase, total);
        const idEditando = pedidoEnEdicionId;

        let res;
        if (idEditando) {
            res = await api.actualizarPorId('pedidos', idEditando, {
                cliente: cliente,
                modalidad: modalidad,
                forma_pago: formaPagoDetalle,
                monto_total: total,
                items: itemsConfirmados
            });
            await api.registrarActividad(cliente, 'EDITAR_PEDIDO', 'Pedido #' + idEditando + ' actualizado (' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2) + ' | ' + formaPagoDetalle + ')');
        } else {
            res = await api.insertarRegistro('pedidos', {
                cliente: cliente,
                modalidad: modalidad,
                forma_pago: formaPagoDetalle,
                monto_total: total,
                items: itemsConfirmados,
                estado: 'pendiente'
            });
            await api.registrarActividad(cliente, 'NUEVO_PEDIDO', 'Total ' + CONFIG_NEGOCIO.moneda + ' ' + total.toFixed(2) + ' (' + modalidad + ' | ' + formaPagoDetalle + ')');
        }

        const idGenerado = idEditando || (Array.isArray(res && res.data) && res.data[0] && res.data[0].id ? res.data[0].id : '');
        const resumenComprobante = {
            id: idGenerado,
            cliente: cliente,
            items: itemsConfirmados,
            total: total,
            modalidad: modalidad,
            formaPago: formaPagoDetalle
        };

        if (contienePromo && promoActual) {
            pintarPromocionExpress();
        }
        carrito = [];
        pedidoEnEdicionId = null;
        renderizarCarrito();
        actualizarEstadoRedYAvisoOffline();
        cerrarModalCheckout();
        if (res.encolado) {
            mostrarToastComprobanteWhatsapp('Sin conexion: pedido guardado en cola local.', 'alerta', resumenComprobante);
        } else {
            mostrarToastComprobanteWhatsapp(
                idEditando ? ('Pedido #' + idEditando + ' actualizado correctamente.') : 'Pedido enviado a All In Fast Food con exito.',
                'exito',
                resumenComprobante
            );
        }
        if (!$('#vistaMisPedidos').prop('hidden')) {
            cargarMisPedidosCliente();
        }
    });

    // Semana 3 - Mis Pedidos del Cliente
    async function cargarMisPedidosCliente() {
        const $pend = $('#listaPedidosPendientesCliente').empty();
        const $hist = $('#listaPedidosHistorialCliente').empty();
        try {
            const filas = await api.listarTabla('pedidos', true, 80);
            const idsSesion = api.obtenerIdsPedidosSesion();
            const usuarioActivo = String(sesionActiva.usuario || '').trim().toLowerCase();
            const misPedidos = (Array.isArray(filas) ? filas : []).filter((p) => {
                const coincideId = idsSesion.indexOf(String(p.id)) !== -1;
                const coincideCliente = sesionActiva.autenticada && String(p.cliente || '').trim().toLowerCase() === usuarioActivo;
                return coincideId || coincideCliente;
            });

            const pendientes = misPedidos.filter((p) => String(p.estado || 'pendiente').toLowerCase() === 'pendiente');
            const historial = misPedidos.filter((p) => String(p.estado || 'pendiente').toLowerCase() !== 'pendiente');

            if (pendientes.length === 0) {
                $pend.append($('<p>').addClass('card-item__meta').text('No tienes pedidos pendientes de confirmacion en este momento.'));
            } else {
                pendientes.forEach((p) => {
                    const $card = $('<div>').addClass('tarjeta-operativa');
                    const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                        .append($('<strong>').text('Pedido #' + p.id + ' - ' + (p.cliente || 'Cliente')))
                        .append($('<span>').addClass('badge-estado badge-estado--pendiente').text('Pendiente'));
                    const resumenItems = Array.isArray(p.items)
                        ? p.items.map((it) => (it.nombre || 'Producto') + ' x' + (it.cantidad || 1)).join(', ')
                        : 'Detalle de pedido';
                    const $det = $('<p>').addClass('card-item__meta').text(resumenItems);
                    const $meta = $('<p>').addClass('card-item__meta').text((p.modalidad || '') + ' | ' + (p.forma_pago || '') + ' | Total: ' + CONFIG_NEGOCIO.moneda + ' ' + Number(p.monto_total || 0).toFixed(2));
                    const $acciones = $('<div>').addClass('fila-tactil');
                    const $confirmBox = $('<div>').addClass('fila-tactil').prop('hidden', true);

                    const $btnEditar = $('<button>').attr('type', 'button').addClass('btn-primario').text('Editar Pedido').on('click', () => {
                        abrirModalCheckout(p);
                    });
                    const $btnCancelar = $('<button>').attr('type', 'button').addClass('btn-peligro').text('Cancelar Pedido').on('click', () => {
                        $confirmBox.prop('hidden', false);
                    });
                    const $btnConfCanc = $('<button>').attr('type', 'button').addClass('btn-peligro').text('Confirmar Cancelacion').on('click', async () => {
                        const resCanc = await api.actualizarPorId('pedidos', p.id, { estado: 'cancelado' });
                        await api.registrarActividad(p.cliente || sesionActiva.usuario, 'CANCELAR_PEDIDO', 'Pedido #' + p.id + ' cancelado por cliente');
                        actualizarEstadoRedYAvisoOffline();
                        mostrarToast(resCanc.encolado ? 'Cancelacion encolada en FIFO offline.' : 'Pedido #' + p.id + ' cancelado.', 'alerta');
                        cargarMisPedidosCliente();
                    });
                    const $btnVolver = $('<button>').attr('type', 'button').addClass('btn-secundario').text('Mantener').on('click', () => {
                        $confirmBox.prop('hidden', true);
                    });
                    $confirmBox.append($('<span>').addClass('card-item__meta').text('Confirmas cancelar este pedido?'), $btnConfCanc, $btnVolver);
                    const $btnWaPend = crearBotonWhatsappComprobante({
                        id: p.id,
                        cliente: p.cliente || 'Cliente',
                        items: p.items,
                        total: p.monto_total,
                        modalidad: p.modalidad,
                        formaPago: p.forma_pago
                    });
                    $acciones.append($btnWaPend, $btnEditar, $btnCancelar);
                    $card.append($cab, $det, $meta, $acciones, $confirmBox);
                    $pend.append($card);
                });
            }

            if (historial.length === 0) {
                $hist.append($('<p>').addClass('card-item__meta').text('Aun no registras pedidos confirmados, despachados o cancelados.'));
            } else {
                historial.forEach((p) => {
                    const est = String(p.estado || 'confirmado').toLowerCase();
                    const $card = $('<div>').addClass('tarjeta-operativa');
                    const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                        .append($('<strong>').text('Pedido #' + p.id + ' - ' + (p.cliente || 'Cliente')))
                        .append($('<span>').addClass('badge-estado badge-estado--' + est).text(est));
                    const resumenItems = Array.isArray(p.items)
                        ? p.items.map((it) => (it.nombre || 'Producto') + ' x' + (it.cantidad || 1)).join(', ')
                        : 'Detalle de pedido';
                    const fechaTxt = p.created_at ? new Date(p.created_at).toLocaleString() : 'Registrado';
                    const $det = $('<p>').addClass('card-item__meta').text(resumenItems);
                    const $meta = $('<p>').addClass('card-item__meta').text(fechaTxt + ' | ' + (p.modalidad || '') + ' | ' + (p.forma_pago || '') + ' | ' + CONFIG_NEGOCIO.moneda + ' ' + Number(p.monto_total || 0).toFixed(2));
                    $card.append($cab, $det, $meta);
                    if (est !== 'cancelado') {
                        const $accHist = $('<div>').addClass('fila-tactil').append(crearBotonWhatsappComprobante({
                            id: p.id,
                            cliente: p.cliente || 'Cliente',
                            items: p.items,
                            total: p.monto_total,
                            modalidad: p.modalidad,
                            formaPago: p.forma_pago
                        }));
                        $card.append($accHist);
                    }
                    $hist.append($card);
                });
            }
        } catch (err) {
            $pend.append($('<p>').addClass('card-item__meta').text('Sin conexion para consultar pedidos en este momento.'));
        }
    }

    $('#btnRefrescarMisPedidos').on('click', cargarMisPedidosCliente);

    $('#formReserva').on('submit', async function (e) {
        e.preventDefault();
        const $campoCliente = $('#clienteNombre');
        limpiarErrorCampo($campoCliente);
        const cliente = String($campoCliente.val() || '').trim();
        const salaRaw = String($('#salaSelect').val() || 'MESA-01|Mesa en Local Genaro Gamarra 1886').split('|');
        const fecha = String($('#fechaReserva').val() || new Date().toISOString().slice(0, 10));
        const horario = String($('#horarioReserva').val() || '12:30');
        const valCliente = validarTextoEnVivo(cliente, 'nombre');
        if (!valCliente.valido) {
            $('#errClienteReserva').text('Revisa este campo').removeClass('estado-validacion-campo--ok').addClass('estado-validacion-campo--error');
            mostrarErrorCampo($campoCliente, valCliente.error);
            actualizarEstadoBotonFormulario('reserva');
            return;
        }
        $('#errClienteReserva').text('OK').removeClass('estado-validacion-campo--error').addClass('estado-validacion-campo--ok');
        const res = await api.insertarRegistro('reservas', {
            cliente: cliente,
            estacion_codigo: salaRaw[0],
            detalle_sala: salaRaw[1] || salaRaw[0],
            fecha_reserva: fecha,
            horario: horario,
            duracion_horas: 1,
            estado: 'pendiente'
        });
        const $li = $('<li>').addClass('fila-cola-item').append($('<span>').addClass('titulo-truncado').text(cliente + ' - ' + (salaRaw[1] || salaRaw[0]) + ' (' + fecha + ' ' + horario + ')'));
        $('#listaReservas').prepend($li);
        await api.registrarActividad(cliente, 'RESERVA_EVENTO', (salaRaw[1] || salaRaw[0]) + ' ' + fecha + ' ' + horario);
        actualizarEstadoRedYAvisoOffline();
        this.reset();
        limpiarErrorCampo($campoCliente);
        actualizarEstadoBotonFormulario('reserva');
        mostrarToast(res.encolado ? 'Sin conexion: reserva guardada en cola local.' : 'Fecha de evento reservada con exito.', res.encolado ? 'alerta' : 'exito');
    });

    $('#btnPedir').on('click', function () {
        const $campoLista = $('#inputCancion');
        limpiarErrorCampo($campoLista);
        const texto = String($campoLista.val() || '').trim();
        const valLista = validarTextoEnVivo(texto, 'lista');
        if (!valLista.valido) {
            mostrarErrorCampo($campoLista, valLista.error);
            actualizarEstadoBotonFormulario('lista');
            return;
        }
        const $fila = $('<div>').addClass('fila-cola-item');
        const $titulo = $('<span>').addClass('titulo-truncado').text(texto);
        const $quitar = $('<button>').attr('type', 'button').addClass('btn-peligro btn-tactil').text('X').on('click', function () {
            $fila.remove();
        });
        $fila.append($titulo, $quitar);
        $('#listaCanciones').prepend($fila);
        $campoLista.val('');
        limpiarErrorCampo($campoLista);
        actualizarEstadoBotonFormulario('lista');
        registrarBitacoraDom('LISTA_FIESTA', 'Item anotado: ' + texto);
    });

    $('#formConsultaCliente').on('submit', async function (e) {
        e.preventDefault();
        const $campoMensaje = $('#consultaMensaje');
        limpiarErrorCampo($campoMensaje);
        const mensaje = String($campoMensaje.val() || '').trim();
        const valMensaje = validarTextoEnVivo(mensaje, 'mensaje');
        if (!valMensaje.valido) {
            $('#errConsultaMensaje').text('Revisa este campo').removeClass('estado-validacion-campo--ok').addClass('estado-validacion-campo--error');
            mostrarErrorCampo($campoMensaje, valMensaje.error);
            actualizarEstadoBotonFormulario('consulta');
            return;
        }
        $('#errConsultaMensaje').text('Enviada').removeClass('estado-validacion-campo--error').addClass('estado-validacion-campo--ok');
        const cliente = sesionActiva.usuario || 'Invitado';
        const res = await api.insertarRegistro('consultas', {
            cliente: cliente,
            mensaje: mensaje,
            respuesta: '',
            estado: 'pendiente'
        });
        await api.registrarActividad(cliente, 'CONSULTA_CLIENTE', mensaje);
        $('#consultaMensaje').val('');
        limpiarErrorCampo($campoMensaje);
        actualizarEstadoBotonFormulario('consulta');
        $('#feedbackConsultaCliente')
            .removeClass('feedback-formulario--error')
            .addClass(res.encolado ? 'feedback-formulario--alerta' : 'feedback-formulario--exito')
            .text(res.encolado ? 'Sin conexion: consulta guardada en cola FIFO. Se enviara al reconectar.' : 'Consulta enviada a All In Fast Food.')
            .prop('hidden', false);
        actualizarEstadoRedYAvisoOffline();
        await cargarConsultasCliente();
    });

    $('#btnSincronizarColaGlobal').on('click', async function () {
        const res = await api.sincronizarColaFifo();
        actualizarEstadoRedYAvisoOffline();
        mostrarToast('Sincronizados: ' + res.procesados + ' | Pendientes: ' + res.pendientes, res.procesados > 0 ? 'exito' : 'alerta');
        if (res.procesados > 0) hidratarDatosSegunRol();
    });

    window.addEventListener('online', async () => {
        actualizarEstadoRedYAvisoOffline();
        const res = await api.sincronizarColaFifo();
        actualizarEstadoRedYAvisoOffline();
        if (res.procesados > 0) {
            mostrarToast('Cola FIFO sincronizada automaticamente (' + res.procesados + ' enviados).', 'exito');
            hidratarDatosSegunRol();
        }
    });
    window.addEventListener('offline', actualizarEstadoRedYAvisoOffline);

    function crearPromocionInicialDefecto() {
        const ahora = new Date();
        return {
            proyecto: api.PROYECTO_ACTUAL,
            titulo: PROMO_TITULO_DEFECTO,
            descripcion: PROMO_DESC_PUBLICA,
            precio: PROMO_PRECIO_DEFECTO,
            duracion_minutos: 15,
            expira_en: new Date(ahora.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            activa: true,
            actualizada_por: 'sistema',
            actualizada_en: ahora.toISOString()
        };
    }

    function esPromoPorVisita(promo) {
        if (!promo || !promo.expira_en || !promo.actualizada_en) return false;
        const expMs = new Date(promo.expira_en).getTime();
        const actMs = new Date(promo.actualizada_en).getTime();
        if (!Number.isFinite(expMs) || !Number.isFinite(actMs)) return false;
        return (expMs - actMs) > UMBRAL_EVERGREEN_MS;
    }

    function detectarModoVigencia(promo) {
        if (!promo || esPromoPorVisita(promo)) return 'evergreen';
        const expMs = new Date(promo.expira_en).getTime();
        const actMs = new Date(promo.actualizada_en || Date.now()).getTime();
        const diffMin = Number.isFinite(expMs) && Number.isFinite(actMs) ? Math.round((expMs - actMs) / 60000) : (Number(promo.duracion_minutos) || 15);
        if (diffMin >= 5000) return '7d';
        if (diffMin >= 720) return '24h';
        return '15m';
    }

    function obtenerClaveReclamoPromo(promo) {
        const version = String((promo && promo.actualizada_en) || 'base');
        const rol = api.normalizarRol(sesionActiva.rol);
        const usuario = String(sesionActiva.usuario || 'Invitado').trim();
        const esClienteAutenticado = rol === 'cliente' && usuario !== '' && usuario !== 'Invitado' && sesionActiva.autenticada;
        if (esClienteAutenticado) {
            return {
                almacen: localStorage,
                clave: 'promoReclamada_' + api.PROYECTO_ACTUAL + '_' + usuario + '_' + version
            };
        }
        return {
            almacen: sessionStorage,
            clave: 'promoReclamada_' + api.PROYECTO_ACTUAL + '_invitado_' + version
        };
    }

    function fuePromoReclamada(promo) {
        if (!promo) return false;
        const info = obtenerClaveReclamoPromo(promo);
        try {
            return info.almacen.getItem(info.clave) === '1';
        } catch (err) {
            return false;
        }
    }

    function marcarPromoReclamada(promo) {
        if (!promo) return;
        const info = obtenerClaveReclamoPromo(promo);
        try {
            info.almacen.setItem(info.clave, '1');
        } catch (err) {
        }
    }

    function obtenerFinRelojCliente(promo) {
        if (!promo || promo.activa === false || fuePromoReclamada(promo)) return null;
        const expGlobalMs = new Date(promo.expira_en).getTime();
        if (!Number.isFinite(expGlobalMs) || Date.now() >= expGlobalMs) return null;
        if (esPromoPorVisita(promo)) {
            const minutos = Math.max(1, Number(promo.duracion_minutos) || 15);
            const claveVisita = 'promoVisitaFin_' + api.PROYECTO_ACTUAL + '_' + String(promo.actualizada_en || 'base');
            let finVisitaMs = NaN;
            try {
                const guardado = sessionStorage.getItem(claveVisita);
                if (guardado) finVisitaMs = Number(guardado);
            } catch (err) {
            }
            if (!Number.isFinite(finVisitaMs) || finVisitaMs <= 0) {
                finVisitaMs = Date.now() + (minutos * 60000);
                try {
                    sessionStorage.setItem(claveVisita, String(finVisitaMs));
                } catch (err) {
                }
            }
            return { finMs: Math.min(finVisitaMs, expGlobalMs), totalSeg: minutos * 60, porVisita: true };
        }
        const actMs = new Date(promo.actualizada_en || Date.now()).getTime();
        const duracionRealSeg = Number.isFinite(actMs) && expGlobalMs > actMs
            ? Math.max(60, Math.round((expGlobalMs - actMs) / 1000))
            : Math.max(60, (Number(promo.duracion_minutos) || 15) * 60);
        return { finMs: expGlobalMs, totalSeg: duracionRealSeg, porVisita: false };
    }

    function formatearCuentaRegresiva(totalSeg) {
        const segLimpios = Math.max(0, Math.floor(totalSeg));
        if (segLimpios >= 86400) {
            const dias = Math.floor(segLimpios / 86400);
            const horas = Math.floor((segLimpios % 86400) / 3600);
            const min = Math.floor((segLimpios % 3600) / 60);
            const seg = segLimpios % 60;
            return dias + 'd ' + String(horas).padStart(2, '0') + ':' + String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0');
        }
        if (segLimpios >= 3600) {
            const horas = Math.floor(segLimpios / 3600);
            const min = Math.floor((segLimpios % 3600) / 60);
            const seg = segLimpios % 60;
            return String(horas).padStart(2, '0') + ':' + String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0');
        }
        const min = Math.floor(segLimpios / 60);
        const seg = segLimpios % 60;
        return String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0');
    }

    function actualizarAyudaModoVigencia() {
        const modo = String($('#promoModoVigencia').val() || 'evergreen');
        const esEvergreen = modo === 'evergreen';
        $('#grupoDuracionFlash').prop('hidden', !esEvergreen);
        const textos = {
            evergreen: 'Cada cliente recibe una ventana flash individual al visitar el catalogo sin que la oferta caduque cuando nadie entra.',
            '15m': 'Campana global en tiempo real: caduca exactamente 15 minutos despues de guardar.',
            '24h': 'Campana global en tiempo real: caduca exactamente 24 horas despues de guardar.',
            '7d': 'Campana semanal en tiempo real: caduca exactamente 7 dias despues de guardar.'
        };
        $('#promoModoAyuda').text(textos[modo] || textos.evergreen);
    }

    function sincronizarEstadoBadgeEditor() {
        const $badge = $('#promoEstadoBadge');
        const $meta = $('#promoMetaVigencia');
        if (!$badge.length) return;
        $badge.removeClass('badge-estado--confirmado badge-estado--info badge-estado--pendiente badge-estado--cancelado');
        if (!promoActual) {
            $badge.addClass('badge-estado--pendiente').text('PAUSADA');
            $meta.text('Sin promocion activa registrada.');
            return;
        }
        if (promoActual.activa === false) {
            $badge.addClass('badge-estado--pendiente').text('PAUSADA');
            $meta.text('Pausada manualmente. El banner permanece oculto para los clientes.');
            return;
        }
        const expMs = new Date(promoActual.expira_en).getTime();
        if (!Number.isFinite(expMs) || Date.now() >= expMs) {
            $badge.addClass('badge-estado--cancelado').text('EXPIRADA');
            $meta.text('La vigencia global vencio. Selecciona una nueva vigencia y guarda para reactivarla.');
            return;
        }
        if (esPromoPorVisita(promoActual)) {
            $badge.addClass('badge-estado--confirmado').text('ACTIVA (POR VISITA)');
            $meta.text('Siempre activa: ventana flash de ' + (Number(promoActual.duracion_minutos) || 15) + ' min por cada cliente que visita.');
            return;
        }
        $badge.addClass('badge-estado--info').text('ACTIVA (CAMPANA)');
        $meta.text('Campana en tiempo real vigente hasta ' + new Date(expMs).toLocaleString() + '.');
    }

    function sincronizarEditorPromocion() {
        sincronizarEstadoBadgeEditor();
        if (!promoActual) return;
        const modo = detectarModoVigencia(promoActual);
        $('#promoEditTitulo').val(promoActual.titulo || PROMO_TITULO_DEFECTO);
        $('#promoEditDesc').val(promoActual.descripcion || PROMO_DESC_PUBLICA);
        $('#promoEditPrecio').val(Number(promoActual.precio || PROMO_PRECIO_DEFECTO));
        $('#promoModoVigencia').val(modo);
        $('#promoEditDuracion').val(modo === 'evergreen' ? (Number(promoActual.duracion_minutos) || 15) : 15);
        $('#promoActivaCheck').prop('checked', promoActual.activa !== false);
        actualizarAyudaModoVigencia();
    }

    function actualizarRelojPromocion(notificarSiVence) {
        const banner = document.getElementById('bannerPromoExpress');
        if (!banner) return;
        const reloj = obtenerFinRelojCliente(promoActual);
        if (!reloj) {
            banner.hidden = true;
            return;
        }
        const restanteMs = Math.max(0, reloj.finMs - Date.now());
        if (restanteMs <= 0) {
            const estabaVisible = !banner.hidden;
            banner.hidden = true;
            $('#promoCuentaRegresiva').text('00:00');
            $('#promoBarraTiempo').css('width', '0%');
            sincronizarEstadoBadgeEditor();
            if (notificarSiVence && estabaVisible && !promoExpiracionNotificada && api.normalizarRol(sesionActiva.rol) === 'cliente') {
                promoExpiracionNotificada = true;
                mostrarToast('La promocion express ha finalizado.', 'alerta');
            }
            return;
        }
        const totalSeg = Math.ceil(restanteMs / 1000);
        $('#promoCuentaRegresiva').text(formatearCuentaRegresiva(totalSeg));
        const pct = Math.min(100, Math.max(0, (totalSeg / reloj.totalSeg) * 100));
        $('#promoBarraTiempo').css('width', pct + '%');
    }

    function pintarPromocionExpress() {
        const banner = document.getElementById('bannerPromoExpress');
        if (!banner) return;
        const reloj = obtenerFinRelojCliente(promoActual);
        if (!reloj || reloj.finMs <= Date.now()) {
            banner.hidden = true;
            return;
        }
        const descCruda = String(promoActual.descripcion || '').trim();
        const descFinal = !descCruda ? PROMO_DESC_PUBLICA : descCruda;
        $('#promoTitulo').text(promoActual.titulo || PROMO_TITULO_DEFECTO);
        $('#promoDescripcion').text(descFinal);
        $('#promoPrecio').text(CONFIG_NEGOCIO.moneda + ' ' + Number(promoActual.precio || PROMO_PRECIO_DEFECTO).toFixed(2));
        renderizarDetalleSeguro('#promoDetalleSeguro', '<strong>Menu de 4 tiempos</strong> | Entrada, sopa, segundo a eleccion y postre recien preparados.');
        banner.hidden = false;
        actualizarRelojPromocion(false);
    }

    async function hidratarPromocion() {
        const cacheLocal = api.obtenerCachePromocion();
        if (cacheLocal) {
            promoActual = cacheLocal;
            pintarPromocionExpress();
            sincronizarEditorPromocion();
        }
        const res = await api.obtenerPromocionActiva();
        if (res && res.ok) {
            if (res.promo) {
                promoActual = res.promo;
            } else if (res.vacia) {
                promoActual = crearPromocionInicialDefecto();
            }
        } else if (!promoActual && res && res.promo) {
            promoActual = res.promo;
        } else if (!promoActual) {
            promoActual = crearPromocionInicialDefecto();
        }
        promoExpiracionNotificada = false;
        pintarPromocionExpress();
        sincronizarEditorPromocion();
    }

    $('#promoModoVigencia').on('change', actualizarAyudaModoVigencia);

    setInterval(() => {
        if (!promoActual) return;
        actualizarRelojPromocion(true);
    }, 1000);

    $('#btnReclamarPromo').on('click', async function () {
        if (!promoActual) return;
        promoReclamos += 1;
        $('#promoConfirmaciones').text(promoReclamos + (promoReclamos === 1 ? ' pedido hoy' : ' pedidos hoy'));
        agregarAlCarrito({
            id: 'PROMO-EXPRESS',
            nombre: promoActual.titulo || PROMO_TITULO_DEFECTO,
            precio: Number(promoActual.precio || PROMO_PRECIO_DEFECTO),
            portada: CATALOGO_RESPALDO[0] ? CATALOGO_RESPALDO[0].portada : ''
        }, true);
        mostrarToast('Almuerzo Especial del Dia agregado a tu pedido.', 'exito');
        abrirModalCheckout();
        await api.registrarActividad(sesionActiva.usuario, 'PEDIDO_ALMUERZO_DIA', promoActual.titulo || PROMO_TITULO_DEFECTO);
    });

    async function cargarConsultasCliente() {
        const $cont = $('#listaConsultasCliente').empty();
        try {
            const filas = await api.listarTabla('consultas', true, 25);
            if (!filas.length) {
                $cont.append($('<p>').addClass('card-item__meta').text('Aun no hay consultas registradas.'));
                return;
            }
            filas.forEach((c) => {
                const $card = $('<div>').addClass('tarjeta-operativa');
                const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                    .append($('<strong>').text(c.cliente || 'Cliente'))
                    .append($('<span>').addClass('badge-estado badge-estado--' + (c.estado || 'pendiente')).text(c.estado || 'pendiente'));
                $card.append($cab, $('<p>').text(c.mensaje || ''));
                if (c.respuesta) {
                    $card.append($('<p>').addClass('feedback-formulario feedback-formulario--exito').text('Respuesta All In Fast Food: ' + c.respuesta));
                }
                $cont.append($card);
            });
        } catch (err) {
            $cont.append($('<p>').addClass('card-item__meta').text('Sin conexion para actualizar el historial de consultas.'));
        }
    }

    async function cargarPanelPedidosOp() {
        const $cont = $('#listaPedidosOp').empty();
        try {
            const filas = await api.listarTabla('pedidos', true, 50);
            $('#metricaPedidos').text(filas.length);
            const ingresos = filas.filter((p) => p.estado === 'confirmado' || p.estado === 'despachado').reduce((acc, p) => acc + Number(p.monto_total || 0), 0);
            $('#metricaIngresos').text(CONFIG_NEGOCIO.moneda + ' ' + ingresos.toFixed(2));
            if (!filas.length) {
                $cont.append($('<p>').addClass('card-item__meta').text('Sin pedidos entrantes registrados.'));
                return;
            }
            filas.forEach((p) => {
                const est = String(p.estado || 'pendiente').toLowerCase();
                const $card = $('<div>').addClass('tarjeta-operativa');
                const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                    .append($('<strong>').text('#' + p.id + ' - ' + (p.cliente || 'Cliente')))
                    .append($('<span>').addClass('badge-estado badge-estado--' + est).text(est));
                const resumenItems = Array.isArray(p.items) && p.items.length
                    ? p.items.map((it) => (it.nombre || 'Producto') + ' x' + (it.cantidad || 1)).join(', ')
                    : 'Detalle de pedido';
                const $itemsTxt = $('<p>').addClass('card-item__meta').text(resumenItems);
                const $det = $('<p>').addClass('card-item__meta').text((p.modalidad || '') + ' | ' + (p.forma_pago || '') + ' | Total: ' + CONFIG_NEGOCIO.moneda + ' ' + Number(p.monto_total || 0).toFixed(2));
                const $acc = $('<div>').addClass('fila-tactil');
                if (est === 'pendiente') {
                    const $btnConf = $('<button>').attr('type', 'button').addClass('btn-primario').text('Confirmar Pedido').on('click', async () => {
                        await api.actualizarPorId('pedidos', p.id, { estado: 'confirmado' });
                        await api.registrarActividad(sesionActiva.usuario, 'PEDIDO_CONFIRMADO', 'Pedido #' + p.id + ' confirmado');
                        mostrarToast('Pedido #' + p.id + ' confirmado.', 'exito');
                        cargarPanelPedidosOp();
                    });
                    $acc.append($btnConf);
                }
                if (est === 'pendiente' || est === 'confirmado') {
                    const $btnDesp = $('<button>').attr('type', 'button').addClass('btn-secundario').text('Marcar Despachado').on('click', async () => {
                        await api.actualizarPorId('pedidos', p.id, { estado: 'despachado' });
                        await api.registrarActividad(sesionActiva.usuario, 'PEDIDO_DESPACHADO', 'Pedido #' + p.id + ' despachado');
                        mostrarToast('Pedido #' + p.id + ' marcado como despachado.', 'exito');
                        cargarPanelPedidosOp();
                    });
                    $acc.append($btnDesp);
                }
                $card.append($cab, $itemsTxt, $det);
                if ($acc.children().length > 0) {
                    $card.append($acc);
                }
                $cont.append($card);
            });
        } catch (err) {
            $cont.append($('<p>').addClass('card-item__meta').text('No se pudieron consultar los pedidos en este momento.'));
        }
    }

    async function cargarPanelConsultasOp() {
        const $cont = $('#listaConsultasOp').empty();
        try {
            const filas = await api.listarTabla('consultas', true, 50);
            const pendientes = filas.filter((c) => c.estado !== 'respondida').length;
            $('#metricaConsultasPend').text(pendientes);
            if (!filas.length) {
                $cont.append($('<p>').addClass('card-item__meta').text('No existen consultas pendientes.'));
                return;
            }
            filas.forEach((c) => {
                const $card = $('<div>').addClass('tarjeta-operativa');
                const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                    .append($('<strong>').text(c.cliente || 'Cliente'))
                    .append($('<span>').addClass('badge-estado badge-estado--' + (c.estado || 'pendiente')).text(c.estado || 'pendiente'));
                $card.append($cab, $('<p>').text(c.mensaje || ''));
                if (c.estado === 'respondida' && c.respuesta) {
                    $card.append($('<p>').addClass('feedback-formulario feedback-formulario--exito').text('Respondido: ' + c.respuesta));
                } else {
                    const idInput = 'respConsulta_' + c.id;
                    const $grupoResp = $('<div>').addClass('campo-grupo');
                    const $lbl = $('<label>').attr('for', idInput).addClass('etiqueta-campo').text('Respuesta de All In Fast Food');
                    const $inp = $('<input>').attr({ type: 'text', id: idInput, placeholder: 'Escribe la respuesta para el cliente...' }).addClass('control-input');
                    const $btn = $('<button>').attr('type', 'button').addClass('btn-primario').text('Responder al Cliente');
                    $inp.on('input blur', function () {
                        const v = String($inp.val() || '').trim();
                        if (!v) {
                            limpiarErrorCampo($inp);
                            return;
                        }
                        const valResp = validarTextoEnVivo(v, 'mensaje');
                        if (!valResp.valido) {
                            mostrarErrorCampo($inp, valResp.error, false);
                        } else {
                            marcarCampoValido($inp);
                        }
                    });
                    $btn.on('click', async () => {
                        const respTexto = String($inp.val() || '').trim();
                        const valResp = validarTextoEnVivo(respTexto, 'mensaje');
                        if (!valResp.valido) {
                            mostrarErrorCampo($inp, valResp.error);
                            mostrarToast(valResp.error, 'error');
                            return;
                        }
                        await api.actualizarPorId('consultas', c.id, { respuesta: respTexto, estado: 'respondida' });
                        await api.registrarActividad(sesionActiva.usuario, 'RESPUESTA_CONSULTA', 'Respondio consulta #' + c.id);
                        mostrarToast('Respuesta enviada al cliente.', 'exito');
                        cargarPanelConsultasOp();
                    });
                    $grupoResp.append($lbl, $('<div>').addClass('fila-tactil').append($inp, $btn));
                    $card.append($grupoResp);
                }
                $cont.append($card);
            });
        } catch (err) {
            $cont.append($('<p>').addClass('card-item__meta').text('Error al consultar bandeja de consultas.'));
        }
    }

    async function cargarPanelReservasOp() {
        const $cont = $('#listaReservasOp').empty();
        try {
            const filas = await api.listarTabla('reservas', true, 50);
            if (!filas.length) {
                $cont.append($('<p>').addClass('card-item__meta').text('Sin reservas de eventos programadas.'));
                return;
            }
            filas.forEach((r) => {
                const estRes = String(r.estado || 'pendiente').toLowerCase();
                const $card = $('<div>').addClass('tarjeta-operativa');
                const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                    .append($('<strong>').text((r.cliente || 'Cliente') + ' - ' + (r.detalle_sala || r.estacion_codigo || '')))
                    .append($('<span>').addClass('badge-estado badge-estado--' + estRes).text(estRes));
                const $det = $('<p>').addClass('card-item__meta').text('Fecha: ' + (r.fecha_reserva || '') + ' | Horario: ' + (r.horario || ''));
                $card.append($cab, $det);
                if (estRes !== 'confirmado') {
                    const $btnOk = $('<button>').attr('type', 'button').addClass('btn-primario').text('Confirmar Reserva').on('click', async () => {
                        await api.actualizarPorId('reservas', r.id, { estado: 'confirmado' });
                        await api.registrarActividad(sesionActiva.usuario, 'RESERVA_CONFIRMADA', 'Reserva #' + r.id + ' confirmada');
                        mostrarToast('Reserva de evento confirmada.', 'exito');
                        cargarPanelReservasOp();
                    });
                    $card.append($('<div>').addClass('fila-tactil').append($btnOk));
                }
                $cont.append($card);
            });
        } catch (err) {
            $cont.append($('<p>').addClass('card-item__meta').text('Error al cargar reservas.'));
        }
    }

    function renderizarProductosExtraOp() {
        const $cont = $('#listaProductosExtra').empty();
        if (!productosExtraRemotos.length) {
            $cont.append($('<p>').addClass('card-item__meta').text('No hay productos adicionales publicados.'));
            return;
        }
        productosExtraRemotos.forEach((p) => {
            const $card = $('<div>').addClass('tarjeta-operativa');
            const $img = $('<img>')
                .addClass('tarjeta-ods__imagen tarjeta-ods__imagen--foto img-ampliable')
                .attr('src', p.imagen || CATALOGO_RESPALDO[0].portada)
                .attr('alt', 'Foto de ' + (p.nombre || 'producto extra'))
                .attr('loading', 'lazy');
            const $cab = $('<div>').addClass('tarjeta-operativa__cabecera')
                .append($('<strong>').text(p.nombre + ' (' + CONFIG_NEGOCIO.moneda + ' ' + Number(p.precio || 0).toFixed(2) + ')'))
                .append($('<button>').attr('type', 'button').addClass('btn-peligro').text('Eliminar').on('click', async () => {
                    await api.eliminarPorId('productos_extra', p.id);
                    await api.registrarActividad(sesionActiva.usuario, 'ELIMINAR_PRODUCTO', p.nombre);
                    mostrarToast('Producto eliminado.', 'alerta');
                    await hidratarCatalogoCompleto();
                    renderizarProductosExtraOp();
                }));
            $card.append($img, $cab);
            $cont.append($card);
        });
    }

    $('#prodExtraImagenArchivo').on('change', function () {
        const archivo = this.files && this.files[0];
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const maxW = 480;
                const escala = Math.min(1, maxW / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * escala));
                canvas.height = Math.max(1, Math.round(img.height * escala));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                imagenDataUrlCargada = canvas.toDataURL('image/jpeg', 0.72);
                $('#previewProdExtra').attr('src', imagenDataUrlCargada);
                $('#contenedorPreviewFoto').prop('hidden', false);
            };
            img.src = String(ev.target.result || '');
        };
        lector.readAsDataURL(archivo);
    });

    $('#prodExtraImagenUrl').on('input', function () {
        const u = String($(this).val() || '').trim();
        if (u.startsWith('http://') || u.startsWith('https://')) {
            $('#previewProdExtra').attr('src', u);
            $('#contenedorPreviewFoto').prop('hidden', false);
        }
    });

    $('#formProductoExtra').on('submit', async function (e) {
        e.preventDefault();
        const $campoNombre = $('#prodExtraNombre');
        limpiarErrorCampo($campoNombre);
        const nombre = String($campoNombre.val() || '').trim();
        const categoria = String($('#prodExtraCategoria').val() || 'Hamburguesas');
        const precio = Number($('#prodExtraPrecio').val() || 0);
        const urlImg = String($('#prodExtraImagenUrl').val() || '').trim();
        const imagenFinal = imagenDataUrlCargada || urlImg || CATALOGO_RESPALDO[0].portada;
        const valNom = validarTextoEnVivo(nombre, 'lista');
        if (!valNom.valido) {
            mostrarErrorCampo($campoNombre, valNom.error);
            $('#feedbackProdExtra').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text(valNom.error).prop('hidden', false);
            mostrarToast(valNom.error, 'error');
            return;
        }
        if (precio <= 0) {
            $('#feedbackProdExtra').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text('Ingresa un precio unitario valido mayor a 0.').prop('hidden', false);
            mostrarToast('Ingresa un precio valido.', 'error');
            return;
        }
        await api.insertarRegistro('productos_extra', { nombre: nombre, categoria: categoria, precio: precio, imagen: imagenFinal });
        await api.registrarActividad(sesionActiva.usuario, 'NUEVO_PRODUCTO', nombre + ' (' + CONFIG_NEGOCIO.moneda + ' ' + precio.toFixed(2) + ')');
        imagenDataUrlCargada = '';
        $('#contenedorPreviewFoto').prop('hidden', true);
        this.reset();
        limpiarErrorCampo($campoNombre);
        actualizarEstadoBotonFormulario('prodExtra');
        $('#feedbackProdExtra').removeClass('feedback-formulario--error').addClass('feedback-formulario--exito').text('Plato publicado en la carta de All In Fast Food con exito.').prop('hidden', false);
        await hidratarCatalogoCompleto();
        renderizarProductosExtraOp();
    });

    $('#formPromoExpress').on('submit', async function (e) {
        e.preventDefault();
        const $campoTit = $('#promoEditTitulo');
        const $campoDesc = $('#promoEditDesc');
        limpiarErrorCampo($campoTit);
        limpiarErrorCampo($campoDesc);
        const titulo = String($campoTit.val() || '').trim();
        const descCruda = String($campoDesc.val() || '').trim();
        const valTit = validarTextoEnVivo(titulo, 'lista');
        if (!valTit.valido) {
            mostrarErrorCampo($campoTit, valTit.error);
            $('#feedbackPromoOp').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text(valTit.error).prop('hidden', false);
            mostrarToast(valTit.error, 'error');
            return;
        }
        if (descCruda) {
            const valDesc = validarTextoEnVivo(descCruda, 'mensaje');
            if (!valDesc.valido) {
                mostrarErrorCampo($campoDesc, valDesc.error);
                $('#feedbackPromoOp').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text(valDesc.error).prop('hidden', false);
                mostrarToast(valDesc.error, 'error');
                return;
            }
        }
        const descripcion = descCruda || PROMO_DESC_PUBLICA;
        const precio = Number($('#promoEditPrecio').val() || PROMO_PRECIO_DEFECTO);
        const modo = String($('#promoModoVigencia').val() || 'evergreen');
        const ahoraMs = Date.now();
        let duracionMinutos = Math.max(1, parseInt($('#promoEditDuracion').val(), 10) || 15);
        let expiraMs = ahoraMs + 365 * 24 * 60 * 60 * 1000;
        if (modo === '15m') {
            duracionMinutos = 15;
            expiraMs = ahoraMs + 15 * 60 * 1000;
        } else if (modo === '24h') {
            duracionMinutos = 1440;
            expiraMs = ahoraMs + 24 * 60 * 60 * 1000;
        } else if (modo === '7d') {
            duracionMinutos = 10080;
            expiraMs = ahoraMs + 7 * 24 * 60 * 60 * 1000;
        }
        const datos = {
            titulo: titulo,
            descripcion: descripcion,
            precio: precio,
            duracion_minutos: duracionMinutos,
            expira_en: new Date(expiraMs).toISOString(),
            activa: $('#promoActivaCheck').is(':checked'),
            actualizada_por: sesionActiva.usuario
        };
        if (datos.precio <= 0) {
            $('#feedbackPromoOp').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text('Ingresa un precio valido mayor a 0.').prop('hidden', false);
            mostrarToast('Ingresa un precio valido.', 'error');
            return;
        }
        const res = await api.guardarPromocion(datos);
        if (res.ok && res.data) {
            promoActual = res.data;
            promoExpiracionNotificada = false;
            pintarPromocionExpress();
            sincronizarEditorPromocion();
            await api.registrarActividad(sesionActiva.usuario, 'EDITAR_PROMO', datos.titulo + ' (' + modo + ')');
            $('#feedbackPromoOp').removeClass('feedback-formulario--error').addClass('feedback-formulario--exito').text('Almuerzo / Promocion actualizada con exito.').prop('hidden', false);
            mostrarToast('Almuerzo / Promocion actualizada.', 'exito');
        } else {
            $('#feedbackPromoOp').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text('No se pudo actualizar la promocion: ' + (res.error || '')).prop('hidden', false);
        }
    });

    async function cargarPanelAdminControl() {
        const $act = $('#listaActividadClientes').empty();
        const $cuentas = $('#listaCuentasInternas').empty();
        try {
            const eventos = await api.listarTabla('actividad_clientes', true, 40);
            if (!eventos.length) {
                $act.append($('<p>').addClass('card-item__meta').text('Sin actividad registrada aun.'));
            } else {
                eventos.forEach((ev) => {
                    $act.append($('<div>').addClass('fila-cola-item').append($('<span>').addClass('titulo-truncado').text('[' + (ev.accion || 'EVENTO') + '] ' + (ev.cliente || '') + ' - ' + (ev.detalle || ''))));
                });
            }
        } catch (err) {
            $act.append($('<p>').addClass('card-item__meta').text('No se pudo consultar la actividad reciente.'));
        }
        try {
            const cuentas = await api.listarTabla('cuentas', true, 50);
            cuentas.forEach((c) => {
                $cuentas.append($('<li>').addClass('fila-cola-item').append($('<span>').addClass('titulo-truncado').text(c.usuario)).append($('<span>').addClass('badge-estado badge-estado--confirmado').text(c.rol)));
            });
        } catch (err) {
            $cuentas.append($('<li>').addClass('card-item__meta').text('No se pudo leer cuentas internas.'));
        }
    }

    $('#formNuevaCuentaInterna').on('submit', async function (e) {
        e.preventDefault();
        const $campoU = $('#adminNuevoUsuario');
        const $campoC = $('#adminNuevaClave');
        limpiarErrorCampo($campoU);
        limpiarErrorCampo($campoC);
        const usuario = String($campoU.val() || '').trim();
        const clave = String($campoC.val() || '').trim();
        const rol = String($('#adminNuevoRol').val() || 'encargado');
        const valU = validarTextoEnVivo(usuario, 'usuario');
        if (!valU.valido) {
            mostrarErrorCampo($campoU, valU.error);
            $('#feedbackCuentaInterna').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text(valU.error).prop('hidden', false);
            mostrarToast(valU.error, 'error');
            return;
        }
        if (clave.length < 6) {
            mostrarErrorCampo($campoC, 'La clave interna debe tener al menos 6 caracteres.');
            $('#feedbackCuentaInterna').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text('La clave interna debe tener al menos 6 caracteres.').prop('hidden', false);
            mostrarToast('Clave demasiado corta (minimo 6 caracteres).', 'error');
            return;
        }
        const res = await api.registrarCuenta(usuario, clave, rol);
        $('#feedbackCuentaInterna')
            .removeClass('feedback-formulario--error feedback-formulario--exito')
            .addClass(res.ok ? 'feedback-formulario--exito' : 'feedback-formulario--error')
            .text(res.ok ? 'Cuenta interna creada.' : ('Error: ' + (res.error || 'No se pudo registrar')))
            .prop('hidden', false);
        if (res.ok) {
            this.reset();
            limpiarErrorCampo($campoU);
            limpiarErrorCampo($campoC);
            actualizarEstadoBotonFormulario('cuentaInterna');
            mostrarToast('Cuenta interna creada con exito.', 'exito');
            cargarPanelAdminControl();
        }
    });

    $('#btnRefrescarPedidos').on('click', cargarPanelPedidosOp);
    $('#btnRefrescarConsultas').on('click', cargarPanelConsultasOp);
    $('#btnRefrescarReservas').on('click', cargarPanelReservasOp);
    $('#btnRefrescarActividad').on('click', cargarPanelAdminControl);
    $('#btnLimpiarBitacora').on('click', () => $('#listaBitacoraDom').empty());
    $('#btnPurgarActividadRemota').on('click', async () => {
        await api.purgarActividadProyecto().catch(() => {});
        mostrarToast('Actividad remota purgada.', 'alerta');
        cargarPanelAdminControl();
    });

    function abrirModalRegistroCliente() {
        cerrarModalCheckout();
        $('.btn-subtab[data-grupo="acceso"]').removeClass('btn-subtab--activo');
        $('.btn-subtab[data-grupo="acceso"][data-subtab="subtab-registro"]').addClass('btn-subtab--activo');
        $('.panel-subtab[data-grupo="acceso"]').each(function () {
            this.hidden = this.id !== 'subtab-registro';
        });
        sincronizarUiSesionModal();
        $('#feedbackAcceso').prop('hidden', true);
        $('#modalAcceso').prop('hidden', false);
        $('#regUsuario').trigger('focus');
    }

    $(document).on('click', '.btn-abrir-registro-rapido', abrirModalRegistroCliente);

    $('#btnAbrirAcceso').on('click', () => {
        sincronizarUiSesionModal();
        $('#feedbackAcceso').prop('hidden', true);
        $('#modalAcceso').prop('hidden', false);
    });
    $('#btnCerrarAcceso').on('click', () => $('#modalAcceso').prop('hidden', true));

    $('#formLogin').on('submit', async function (e) {
        e.preventDefault();
        const $campoUsuario = $('#loginUsuario');
        const $campoClave = $('#loginClave');
        limpiarErrorCampo($campoUsuario);
        limpiarErrorCampo($campoClave);
        $('#feedbackAcceso').prop('hidden', true);

        const usuario = String($campoUsuario.val() || '').trim();
        const clave = String($campoClave.val() || '').trim();
        const valLogin = validarTextoEnVivo(usuario, 'usuario');
        if (!valLogin.valido) {
            mostrarErrorCampo($campoUsuario, valLogin.error);
            actualizarEstadoBotonFormulario('login');
            return;
        }
        if (clave.length < 4) {
            mostrarErrorCampo($campoClave, 'Ingresa tu clave de acceso.');
            actualizarEstadoBotonFormulario('login');
            return;
        }
        const res = await api.iniciarSesionCuenta(usuario, clave);
        if (!res.ok) {
            $('#feedbackAcceso').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text(res.error || 'Credenciales invalidas.').prop('hidden', false);
            return;
        }
        sesionActiva = api.guardarSesion(res.cuenta);
        this.reset();
        limpiarErrorCampo($campoUsuario);
        limpiarErrorCampo($campoClave);
        actualizarEstadoBotonFormulario('login');
        $('#modalAcceso').prop('hidden', true);
        aplicarPermisosPorRol();
        mostrarToast('Bienvenido ' + sesionActiva.usuario + ' (' + sesionActiva.rol + ').', 'exito');
    });

    $('#formRegistroCliente').on('submit', async function (e) {
        e.preventDefault();
        const $campoRegNombre = $('#regNombreCompleto');
        const $campoRegUsuario = $('#regUsuario');
        const $campoRegClave = $('#regClave');
        limpiarErrorCampo($campoRegNombre);
        limpiarErrorCampo($campoRegUsuario);
        limpiarErrorCampo($campoRegClave);
        $('#feedbackAcceso').prop('hidden', true);

        const nombreCompleto = String($campoRegNombre.val() || '').trim();
        const usuario = String($campoRegUsuario.val() || '').trim();
        const clave = String($campoRegClave.val() || '').trim();
        const valNombreReg = validarTextoEnVivo(nombreCompleto, 'nombre');
        if (!valNombreReg.valido) {
            mostrarErrorCampo($campoRegNombre, valNombreReg.error);
            actualizarEstadoBotonFormulario('registro');
            return;
        }
        const valReg = validarTextoEnVivo(usuario, 'usuario');
        if (!valReg.valido) {
            mostrarErrorCampo($campoRegUsuario, valReg.error);
            actualizarEstadoBotonFormulario('registro');
            return;
        }
        if (clave.length < 6) {
            mostrarErrorCampo($campoRegClave, 'Crea una clave de al menos 6 caracteres.');
            actualizarEstadoBotonFormulario('registro');
            return;
        }
        const res = await api.registrarCuenta(usuario, clave, 'cliente');
        if (!res.ok) {
            $('#feedbackAcceso').removeClass('feedback-formulario--exito').addClass('feedback-formulario--error').text(res.error || 'No se pudo crear la cuenta.').prop('hidden', false);
            return;
        }
        sesionActiva = api.guardarSesion({ usuario: usuario, rol: 'cliente', autenticada: true });
        if (promoActual && promoActual.actualizada_en) {
            try {
                sessionStorage.removeItem('promoVisitaFin_' + api.PROYECTO_ACTUAL + '_' + String(promoActual.actualizada_en));
            } catch (err) {
            }
        }
        this.reset();
        limpiarErrorCampo($campoRegNombre);
        limpiarErrorCampo($campoRegUsuario);
        limpiarErrorCampo($campoRegClave);
        actualizarEstadoBotonFormulario('registro');
        $('#modalAcceso').prop('hidden', true);
        aplicarPermisosPorRol();
        mostrarToast('Cuenta creada con exito. Bienvenido ' + usuario + '!', 'exito');
    });

    $('#btnCerrarSesion').on('click', function () {
        sesionActiva = api.cerrarSesion();
        $('.btn-subtab[data-grupo="acceso"]').removeClass('btn-subtab--activo');
        $('.btn-subtab[data-grupo="acceso"][data-subtab="subtab-login"]').addClass('btn-subtab--activo');
        $('.panel-subtab[data-grupo="acceso"]').each(function () {
            this.hidden = this.id !== 'subtab-login';
        });
        $('#feedbackAcceso').prop('hidden', true);
        aplicarPermisosPorRol();
        mostrarToast('Sesion cerrada.', 'alerta');
    });

    // Semana 3 - Backend Supabase
    async function hidratarCatalogoCompleto() {
        let base = CATALOGO_RESPALDO.slice();
        try {
            const resp = await fetch(CONFIG_NEGOCIO.catalogoUrl, { cache: 'no-cache' });
            if (resp.ok) {
                const json = await resp.json();
                if (Array.isArray(json) && json.length >= CATALOGO_RESPALDO.length) {
                    base = json;
                }
            }
        } catch (err) {
            try {
                const respFallback = await fetch(CONFIG_NEGOCIO.catalogoUrl);
                if (respFallback.ok) {
                    const jsonFallback = await respFallback.json();
                    if (Array.isArray(jsonFallback) && jsonFallback.length >= CATALOGO_RESPALDO.length) {
                        base = jsonFallback;
                    }
                }
            } catch (err2) {
            }
        }
        catalogoBase = base;
        productosExtraRemotos = await api.listarProductosExtraConCache();
        const mapeadosExtras = productosExtraRemotos.map((e, i) => ({
            id: 'EXT-' + (e.id || (i + 1)),
            sku: 'EXT-' + (e.id || (i + 1)),
            orden: 500 + i,
            nombre: e.nombre || 'Plato Extra All In',
            alt: 'Imagen de ' + (e.nombre || 'Plato Extra All In'),
            categoria: e.categoria || 'Hamburguesas',
            subcategoria: 'Especiales de Cocina',
            tematica: e.nombre || 'Especial de la casa',
            presentacion: 'Carta ampliada en linea',
            precio: Number(e.precio || 0),
            stock: 50,
            descripcion: 'Plato publicado desde el panel operativo de All In Fast Food.',
            fichaTecnica: 'Registro incorporado por el equipo de cocina All In Fast Food.',
            portada: e.imagen || CATALOGO_RESPALDO[0].portada
        }));
        catalogoPrincipal = catalogoBase.concat(mapeadosExtras);
        catalogoCompleto = catalogoPrincipal.concat(PAQUETES_RECOMENDADOS);
        $('#metricaProductosActivos').text(catalogoPrincipal.length);
        renderizarTarjetasCatalogo();
        renderizarFranjaPaquetes();
    }

    async function hidratarDatosSegunRol() {
        const rol = api.normalizarRol(sesionActiva.rol);
        if (rol === 'cliente') {
            await cargarConsultasCliente();
        } else {
            await Promise.all([
                cargarPanelPedidosOp(),
                cargarPanelConsultasOp(),
                cargarPanelReservasOp(),
                hidratarPromocion()
            ]);
            renderizarProductosExtraOp();
            sincronizarEditorPromocion();
            if (rol === 'admin') {
                await cargarPanelAdminControl();
            }
        }
    }

    async function hidratarEstadoAplicacion() {
        actualizarEstadoRedYAvisoOffline();
        renderizarCarrito();
        await Promise.all([
            hidratarPromocion(),
            hidratarCatalogoCompleto()
        ]);
        aplicarPermisosPorRol();
        if (navigator.onLine) {
            const resSync = await api.sincronizarColaFifo();
            actualizarEstadoRedYAvisoOffline();
            if (resSync.procesados > 0) {
                registrarBitacoraDom('SYNC_FIFO', resSync.procesados + ' registros sincronizados con el servidor.');
                mostrarToast('Cola FIFO sincronizada automaticamente (' + resSync.procesados + ').', 'exito');
            }
        }
        registrarBitacoraDom('SISTEMA', 'Aplicacion hidratada para proyecto ' + CONFIG_NEGOCIO.proyecto);
    }

    hidratarEstadoAplicacion();
});
