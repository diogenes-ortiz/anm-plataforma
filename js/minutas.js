// ─── MINUTAS PARA CARGAR ──────────────────────────────────────────────────────
// Minutas que se pasan por chat y se dejan ordenadas acá. La plataforma muestra
// un aviso "📥 Minuta para cargar" y con un clic crea la reunión, las tareas y
// las piezas del calendario (una sola vez: se identifica por el id).
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
];
