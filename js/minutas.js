// ─── MINUTAS PARA CARGAR ──────────────────────────────────────────────────────
// Minutas que se pasan por chat y se dejan ordenadas acá. La plataforma muestra
// un aviso "📥 Minuta para cargar" y con un clic crea la reunión, las tareas y
// las piezas del calendario (una sola vez: se identifica por el id).
// kind:'status' → status para el cliente (✅ 👀 🔸 ▫️ por área) que se convierte en tareas.
//   who  → primer nombre de la persona responsable (si no está cargada, queda para quien importa)
//   due  → fecha límite YYYY-MM-DD
window.ANM_MINUTAS = [
  {
    id: 'min-2026-09-28-mipileta',
    client: 'Mipileta',
    title: 'Reunión de planificación · octubre',
    date: '2026-09-28T17:30',
    type: 'seguimiento',
    attendees: ['Diogenes', 'Luisina'],
    topics: ['métricas', 'influencers', 'feria', 'arquitectos', 'web', 'tutoriales', 'linkedin', 'stock'],
    minuta:
`• Todo lo que se publique: mandar el link de la publicación para que el equipo del cliente lo pueda difundir.
• Informe de métricas mensual para el directorio: lo más importante del mes + mostrar la pauta. Se presenta la 1ª o 2ª semana de cada mes.
• Documento con todas las acciones de influencers hasta ahora, con una ficha por influencer para compartir con los vendedores: tipo de influencer, producto que se le dio, de qué fue el contenido y cuál es su comunidad (para que sepan dónde poner el ojo).
• Plan de acciones: del 23/10 al 1/11 hay feria. Envían productos a arquitectos y diseñadores (en La Plata): ir a generar material.
• Van a estar en Bahía Blanca exhibiendo muebles: subir algo en LinkedIn entre el 1 y el 5 de octubre.
• Armar una propuesta para arquitectos (conveniencia de negocio, sin decirlo en esos términos) para que se contacten. Después, una sección en la web pensada para desarrolladores y arquitectos.
• Contenido: mechar más con otras piletas y aflojar con Essentia porque no hay más stock (Luisina).
• Web: llevar el look and feel de la parte de garantía (lo que está en azul) a la estética nueva (Diogenes).
• Cómo se coloca el sifón: hacerlo en video / animación, lo preguntan mucho (Diogenes).
• Redes: publicar tutoriales de cómo se coloca MiPileta, quizás con una historia destacada (Luisina).
• Web: sección “Academia” con tutoriales y un espacio para que escriban sus dudas (Diogenes).
• Esta semana: Diego está hasta las 15 h; hacer un Meet por el tema guiones (Luisina).`,
    decisiones:
`• Cada publicación se comparte por link al cliente para difusión.
• El informe de métricas se presenta al directorio todos los meses, 1ª o 2ª semana.
• Se baja la exposición de Essentia en contenido (sin stock) y se reparte con otras piletas.`,
    tasks: [
      { text: 'Mandar al cliente el link de cada publicación para que la difundan (armar rutina)', who: 'Luisina', due: '2026-10-02', unit: 'social' },
      { text: 'Informe mensual de métricas para el directorio (lo más importante + pauta) — presentar 1ª/2ª semana', who: 'Diogenes', due: '2026-10-09', unit: 'pauta' },
      { text: 'Documento de acciones con influencers: ficha por influencer (tipo, producto, contenido, comunidad) para vendedores', who: 'Luisina', due: '2026-10-10', unit: 'social' },
      { text: 'Post de LinkedIn: exhibición de muebles en Bahía Blanca (publicar entre 1 y 5 de octubre)', who: 'Luisina', due: '2026-10-03', unit: 'social' },
      { text: 'Plan de acciones para la feria (23/10 al 1/11): envío a arquitectos y diseñadores + generar material', who: 'Diogenes', due: '2026-10-16', unit: 'contenido' },
      { text: 'Propuesta para que los arquitectos se contacten (beneficio de negocio, sin decirlo así)', who: 'Diogenes', due: '2026-10-17', unit: 'pauta' },
      { text: 'Web: sección para desarrolladores y arquitectos', who: 'Diogenes', due: '2026-10-31', unit: 'web' },
      { text: 'Contenido: mechar con otras piletas y aflojar con Essentia (sin stock)', who: 'Luisina', due: '2026-10-03', unit: 'social' },
      { text: 'Web: pasar el look and feel de la sección garantía (azul) a la estética nueva', who: 'Diogenes', due: '2026-10-10', unit: 'web' },
      { text: 'Video / animación: cómo se coloca el sifón', who: 'Diogenes', due: '2026-10-17', unit: 'contenido' },
      { text: 'Tutoriales en redes de cómo se coloca MiPileta + historia destacada', who: 'Luisina', due: '2026-10-10', unit: 'social' },
      { text: 'Web: sección Academia con tutoriales y espacio para dudas', who: 'Diogenes', due: '2026-10-31', unit: 'web' },
      { text: 'Coordinar Meet con Diego por guiones (está hasta las 15 h)', who: 'Luisina', due: '2026-10-02', unit: 'social' },
    ],
    content: [
      { title: 'LinkedIn: exhibición de muebles en Bahía Blanca', date: '2026-10-02', format: 'post', unit: 'social' },
      { title: 'Feria: cobertura con arquitectos y diseñadores', date: '2026-10-23', format: 'reel', unit: 'contenido' },
      { title: 'Tutorial: cómo se coloca MiPileta', date: '2026-10-08', format: 'reel', unit: 'social' },
    ],
  },
  {
    // Status "En qué estamos" pasado por chat: se carga como tareas por área (✅ 👀 🔸 ▫️)
    id: 'status-2026-09-03-mipileta',
    kind: 'status',
    client: 'Mipileta',
    title: 'Status Mipileta · En qué estamos',
    date: '2026-09-03T12:00',
    statusText:
`*EN QUÉ ESTAMOS* — 9/3/2026

✅ cerrado · 👀 en revisión · 🔸 en curso · ▫️ pendiente

*CONTENIDO*
👀  Aprobación de calendario de Septiembre - https://canva.link/1wceuffss05p0hd
👀  Comenzar lanzamiento de Essentia - Falta OK final para empezar a salir
▫️ Lau tiene que envíar fotos de su casa para planificar grabación
▫️ Generar reunion con Lau y Diego para coordinar mejor el día de grabación
🔸 Generar video de la página: cambio de colores, desagües, piletas con accesorios agregados.
✅ Generar contenido más apuntado para arquitectos
✅ Video de youtube subido - https://www.youtube.com/watch?v=ydlHkftJvxQ

*CRM Y ATENCIÓN AL CLIENTE*
https://canva.link/tmokv3b66akf5gx
👀 Definir la comunicación para derivar consultas de clientes finales a los distribuidores
👀 Ordenar la canalización de cada tipo de cliente
👀 Preparar respuestas modelo para consultas frecuentes y generales
👀 Definir secuencia de seguimiento con mensajes cortos para recontactar potenciales

*CALENDARIO Y EFEMÉRIDES*
🔸 Revisar efemerides (Falta la del metalurgico a sumar)

*GOOGLE ADS*
https://canva.link/ifplr1i5kaidg8o
👀 Propuesta de Google Ads con foco en constructoras
👀 Propuesta con foco en flipping inmobiliario
👀 Propuesta con foco en empresas y profesionales del rubro
👀 Trabajar mensajes de calidad, precio, garantía y compra por volumen

*ORGANIZACIÓN INTERNA*
✅ Subida de contenido ya posteado en la carpeta de RRSS - ACTUALIZADO 9.3.2026
✅ Ordenar el Drive con nomenclatura consistente: nombre de producto + fecha

*INFLUENCERS Y CANJES*
🔸 Seguimiento Mica - Ya le instalaron hoy creo pero le dijeron que espere  hasta el viernes para usarla, y mañana le isntalan el desague y todo, asi q estamos esperando eso.
✅ Seguimiento Andre - Status: Estamos OK - Ella nos dio tambien todo el material en crudo para q tengamos y podamos generar contenido por ejemplo en tik tok que habíamos pensado
🔸 Ramiro: Todavía no empezo la obra por q esta a full con casa foa, pero me dijo que en breve estaría.

*SEGUIMIENTO COMERCIAL*
🔸 Enviar mensaje de seguimiento a Llanos Estudios - hoy les enviamos mensaje 9.3.2026

*LANZAMIENTO ZINGARA OVAL*
🔸Definir y generar contenidos y tomando la estetica de la web como fuente para generar contenido.
Lanzamiento: fines de septiembre / octubre.

*60 AÑOS DE MI PILETA*
🔸Desarrollo de estrategia digital

*WEB*
✅ Estamos al día con cambios - https://mipileta.com.ar/
▫️ Listado de sellers que queiran poner en el mapita interactivo que hoy esta oculto de la página.`,
  },
];
