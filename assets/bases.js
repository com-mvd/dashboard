/* Lee las bases que sube el n8n del COM a Supabase Storage (bucket "bases") con los botones Actualizar de
   el panel Supervisor de COM 2, https://com-mvd.github.io/com2/) y las entrega como filas iguales a las de los CSV que antes estaban en data/:
   un objeto por fila, con los nombres de columna del Grafana y todo como texto
   ("2026-10-01 00:08:00", "-34.88342330", "" si está vacío).

   Uso:   const filas = await BasesCOM.filas('reclamos');   // 'agenda', 'zona-limpia', 'reclamos', 'bolsones'

   Lo público no trae teléfonos, emails ni la columna "informacion" (van cifrados aparte). */
const BasesCOM = (() => {
  // Desde el 10/11/2026 las bases están en Supabase Storage (bucket público "bases"), ya no en GitHub Pages.
  const URL_BASES = 'https://srgduwdvkgqrrmhxpzlx.supabase.co/storage/v1/object/public/bases/';

  const dosDigitos = n => String(n).padStart(2, '0');
  // Segundos del reloj de Montevideo (sin zona) -> "2026-10-01 00:08:00"
  const fecha = s => {
    const d = new Date(s * 1000);
    return d.getUTCFullYear() + '-' + dosDigitos(d.getUTCMonth() + 1) + '-' + dosDigitos(d.getUTCDate()) + ' '
      + dosDigitos(d.getUTCHours()) + ':' + dosDigitos(d.getUTCMinutes()) + ':' + dosDigitos(d.getUTCSeconds());
  };

  // Las bases grandes se publican comprimidas con gzip (zona-limpia.json.gz pesa ~5 MB en vez de ~41 MB).
  // Si todavía no está la comprimida, se usa la .json de antes.
  const COMPRIMIDAS = ['agenda', 'zona-limpia', 'reclamos'];

  async function bajar(nombre) {
    const q = '?_=' + Date.now();
    if (COMPRIMIDAS.includes(nombre)) {
      const res = await fetch(URL_BASES + nombre + '.json.gz' + q, { cache: 'no-store' });
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        // Por si el navegador ya la descomprimió solo: gzip empieza con 1f 8b
        const texto = bytes[0] === 0x1f && bytes[1] === 0x8b
          ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
          : new TextDecoder().decode(bytes);
        return JSON.parse(texto);
      }
    }
    const res = await fetch(URL_BASES + nombre + '.json' + q, { cache: 'no-store' });
    if (!res.ok) throw new Error(`No se pudo bajar la base ${nombre} (HTTP ${res.status})`);
    return res.json();
  }

  // Formato de Agenda, Zona Limpia y Reclamos: columnas del Grafana; "dicc" guarda una sola vez los textos que se
  // repiten (la fila tiene su posición) y las columnas de "fechas" van en segundos.
  function desarmar(base) {
    const { columnas, registros } = base;
    const dicc = base.dicc || {}, fechas = new Set(base.fechas || []);
    const conv = columnas.map(c => {
      if (dicc[c]) return v => (v == null ? '' : dicc[c][v]);
      if (fechas.has(c)) return v => (v == null ? '' : fecha(v));
      if (c === 'latitud' || c === 'longitud') return v => (v == null ? '' : Number(v).toFixed(8));
      return v => (v == null ? '' : String(v));
    });
    return registros.map(r => {
      const o = {};
      for (let k = 0; k < columnas.length; k++) o[columnas[k]] = conv[k](r[k]);
      return o;
    });
  }

  // Bolsones tiene su propio formato (el de la página Supervisión de Bolsones de com): se pasa a las columnas del CSV
  const BOLSONES = {
    id: 'id_solicitud', mun: 'municipio', edif: 'edificio', tipoEdif: 'tipo_edificio', dir: 'direccion',
    lat: 'latitud', lng: 'longitud', fSol: 'fecha_de_solicitud', nota: 'datos_de_solicitud',
    cantSol: 'cantidad_solicitada', gestion: 'gestion', cantB: 'cantidad_bolsones', tipoB: 'tipo_de_bolsones',
    fGes: 'fecha_de_gestion', obs: 'observacion', transp: 'transportista', matr: 'matricula', planta: 'planta',
    cantT: 'cantidad_transportada', hora: 'hora', estado: 'estado', nServ: 'numero_de_servicio', unid: 'unidades',
  };
  function desarmarBolsones(base) {
    const cols = base.columnas.map(c => BOLSONES[c] || null);
    return base.registros.map(r => {
      const o = { numero_de_puerta: '' };
      cols.forEach((c, k) => {
        if (!c) return;
        const v = r[k];
        if (v == null) o[c] = '';
        else if (c === 'fecha_de_solicitud' || c === 'fecha_de_gestion') o[c] = String(v).replace('T', ' ') + ':00';
        else if (c === 'latitud' || c === 'longitud') o[c] = Number(v).toFixed(8);
        else o[c] = String(v);
      });
      return o;
    });
  }

  async function filas(nombre) {
    const base = await bajar(nombre);
    return nombre === 'bolsones' ? desarmarBolsones(base) : desarmar(base);
  }

  return { filas, URL_BASES };
})();
