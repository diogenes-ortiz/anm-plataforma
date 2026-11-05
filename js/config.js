// ─── CONFIGURACIÓN DE LA BASE DE DATOS ────────────────────────────────────────
// Único lugar donde se define a qué proyecto de Supabase se conecta todo
// (plataforma y Finanzas). Nunca pongas acá la clave "secret"/"service_role".
//
// Entornos:
//   · produccion → los datos reales (lo que se usa siempre).
//   · prueba     → un segundo proyecto de Supabase para probar cambios sin tocar
//                  los datos reales. Se activa entrando con ?entorno=prueba
//                  (o abriendo la copia de /staging/) y se sale con ?entorno=produccion.
//                  Mientras está activo se ve una franja amarilla arriba.
(function(){
  const ENTORNOS = {
    produccion: {
      SUPABASE_URL: 'https://pxsgqbldbdvbrfwqnvyl.supabase.co',
      SUPABASE_KEY: 'sb_publishable_raHPfxFnjqySQ1QyS75aCw_RywBnd0O',
    },
    // Completar con "Project URL" y la clave "publishable" del proyecto de prueba
    prueba: {
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
    },
  };
  let env = 'produccion';
  try {
    const q = new URLSearchParams(location.search).get('entorno');
    if(q && ENTORNOS[q]) sessionStorage.setItem('anm_entorno', q);
    env = sessionStorage.getItem('anm_entorno') || (/\/staging\//.test(location.pathname) ? 'prueba' : 'produccion');
    if(!ENTORNOS[env]) env = 'produccion';
  } catch(e){}
  const cfg = ENTORNOS[env];
  const listo = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);
  window.ANM_CONFIG = {
    ...cfg,
    ENTORNO: env,
    // El entorno de prueba guarda su copia local aparte, para que nunca se mezcle con la real
    LS_PREFIX: env==='produccion' ? '' : env+'_',
    LISTO: listo,
  };
  if(env!=='produccion'){
    const aviso = listo ? `🧪 ENTORNO DE PRUEBA — estos no son los datos reales · <a href="?entorno=produccion" style="color:inherit">volver a producción</a>`
                        : `🧪 Falta configurar el entorno de prueba en js/config.js · <a href="?entorno=produccion" style="color:inherit">volver a producción</a>`;
    document.addEventListener('DOMContentLoaded', ()=>document.body.insertAdjacentHTML('afterbegin',
      `<div style="position:sticky;top:0;z-index:999;background:#f5c518;color:#1a1a1a;font:700 13px system-ui,sans-serif;padding:7px 12px;text-align:center">${aviso}</div>`));
  }
})();
