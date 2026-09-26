import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

import {
  LegalList,
  LegalNotice,
  LegalPage,
  LegalSection,
} from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Conoce cómo Nexora CRM recopila, utiliza, protege y elimina datos personales.',
  alternates: { canonical: '/privacidad' },
  robots: { index: true, follow: true },
};

const navigation = [
  { id: 'alcance', label: 'Responsable y alcance' },
  { id: 'datos', label: 'Datos que tratamos' },
  { id: 'finalidades', label: 'Para qué los utilizamos' },
  { id: 'ia', label: 'Inteligencia Artificial' },
  { id: 'base', label: 'Fundamento del tratamiento' },
  { id: 'terceros', label: 'Proveedores e integraciones' },
  { id: 'conservacion', label: 'Conservación y seguridad' },
  { id: 'derechos', label: 'Tus derechos' },
  { id: 'cookies', label: 'Cookies y tecnologías' },
  { id: 'cambios', label: 'Cambios y contacto' },
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacidad y confianza"
      title="Política de privacidad de Nexora CRM"
      description="Explicamos de forma transparente qué información procesa Nexora, con qué finalidad y qué controles tienen las empresas, sus equipos y las personas que conversan con ellas."
      updatedAt="26 de septiembre de 2026"
      navigation={[...navigation]}
      icon={<ShieldCheck className="size-4" />}
    >
      <LegalSection id="alcance" title="1. Responsable y alcance">
        <p>
          Nexora CRM (&ldquo;Nexora&rdquo;, &ldquo;la Plataforma&rdquo; o
          &ldquo;nosotros&rdquo;), disponible en{' '}
          <Link
            href="https://nexoracrm.cl"
            className="text-primary font-semibold underline underline-offset-4"
          >
            nexoracrm.cl
          </Link>
          , es una plataforma de gestión de clientes, comunicaciones y operación
          comercial para empresas.
        </p>
        <p>
          Nexora actúa como responsable respecto de los datos necesarios para
          crear, proteger y administrar cuentas de la Plataforma. Cuando una
          empresa utiliza Nexora para gestionar datos de sus clientes,
          prospectos o contactos, esa empresa determina las finalidades del
          tratamiento y Nexora actúa por su cuenta como proveedor tecnológico.
        </p>
        <LegalNotice>
          Esta política considera la Ley N.º 19.628 vigente y la transición
          hacia sus modificaciones introducidas por la Ley N.º 21.719, que
          entran en vigor el 1 de diciembre de 2026.
        </LegalNotice>
      </LegalSection>

      <LegalSection id="datos" title="2. Datos que tratamos">
        <p>Dependiendo de las funciones utilizadas, podemos tratar:</p>
        <LegalList>
          <li>
            <strong className="text-foreground">Cuenta y acceso:</strong>{' '}
            nombre, correo electrónico, rol, empresa, preferencias, sesiones y
            registros de autenticación. Las contraseñas son gestionadas de forma
            segura por el servicio de autenticación y no se muestran en texto
            legible a Nexora.
          </li>
          <li>
            <strong className="text-foreground">Datos empresariales:</strong>{' '}
            nombre comercial, configuración del espacio, integrantes,
            departamentos, sucursales, catálogos, oportunidades y reglas de
            trabajo.
          </li>
          <li>
            <strong className="text-foreground">
              Contactos y conversaciones:
            </strong>{' '}
            nombres, identificadores de canales, teléfonos, correos, mensajes,
            notas, archivos, imágenes, audios, transcripciones y estado de
            atención recibidos mediante WhatsApp, Facebook, Instagram u otros
            canales habilitados.
          </li>
          <li>
            <strong className="text-foreground">Información comercial:</strong>{' '}
            preferencias, productos de interés, cotizaciones, contratos,
            historial de atención y datos que la persona entrega voluntariamente
            para evaluar alternativas comerciales o de financiamiento.
          </li>
          <li>
            <strong className="text-foreground">Datos técnicos:</strong>{' '}
            dirección IP, tipo de navegador o dispositivo, fecha y hora de
            acceso, registros de errores, seguridad, uso y auditoría.
          </li>
        </LegalList>
        <p>
          La información puede provenir directamente de ti, de la empresa con la
          que interactúas, de usuarios autorizados o de integraciones que
          conectas expresamente a Nexora.
        </p>
      </LegalSection>

      <LegalSection id="finalidades" title="3. Para qué utilizamos los datos">
        <LegalList>
          <li>Crear y administrar cuentas, permisos y espacios de trabajo.</li>
          <li>
            Recibir, organizar y responder conversaciones en los canales
            conectados por cada empresa.
          </li>
          <li>
            Gestionar contactos, oportunidades, cotizaciones, contratos,
            automatizaciones, catálogos y seguimiento comercial.
          </li>
          <li>
            Proporcionar funciones de asistencia, transcripción, clasificación y
            apoyo mediante Inteligencia Artificial cuando sean habilitadas.
          </li>
          <li>
            Prevenir accesos indebidos, fraude, abuso y fallas; mantener
            respaldos, trazabilidad y continuidad operacional.
          </li>
          <li>
            Atender solicitudes de soporte, gestionar planes y cumplir
            obligaciones contractuales o legales.
          </li>
          <li>
            Analizar el funcionamiento y mejorar el servicio mediante
            información agregada o razonablemente anonimizada.
          </li>
        </LegalList>
        <p>
          Nexora no vende datos personales ni los utiliza para publicidad de
          terceros ajena a la prestación de la Plataforma.
        </p>
      </LegalSection>

      <LegalSection id="ia" title="4. Inteligencia Artificial y automatización">
        <p>
          Algunas empresas pueden habilitar asistentes, respuestas sugeridas,
          transcripción de audio, resúmenes, análisis de atención o
          precalificación comercial. Para producir esos resultados se procesa el
          contexto estrictamente necesario de la conversación y la configuración
          definida por la empresa.
        </p>
        <p>
          Los resultados generados son herramientas de apoyo y pueden contener
          errores. No constituyen una decisión crediticia, jurídica, laboral o
          de otra naturaleza con efectos legales. Las empresas usuarias deben
          aplicar revisión humana antes de adoptar decisiones relevantes o
          enviar contenido al cliente.
        </p>
      </LegalSection>

      <LegalSection id="base" title="5. Fundamento del tratamiento">
        <p>
          Tratamos datos cuando es necesario para prestar el servicio
          contratado, cuando existe consentimiento o autorización del titular,
          para cumplir obligaciones legales y para proteger la seguridad y el
          funcionamiento legítimo de la Plataforma, según corresponda.
        </p>
        <p>
          Cada empresa usuaria es responsable de informar a sus contactos y de
          contar con una base legítima para incorporar sus datos y
          conversaciones a Nexora. Si no deseas entregar un dato solicitado en
          una conversación, puedes comunicarlo al ejecutivo que te atiende.
        </p>
      </LegalSection>

      <LegalSection
        id="terceros"
        title="6. Proveedores, canales y transferencias"
      >
        <p>
          Para operar la Plataforma podemos recurrir a proveedores de
          infraestructura, base de datos, almacenamiento, seguridad,
          autenticación, mensajería, soporte, pagos e Inteligencia Artificial.
          Solo reciben la información necesaria para su función y quedan sujetos
          a obligaciones de seguridad y confidencialidad.
        </p>
        <p>
          Si conectas Facebook o Instagram, Nexora intercambia con Meta los
          identificadores, permisos, tokens y mensajes necesarios para la
          integración autorizada. Del mismo modo, las conexiones de WhatsApp se
          rigen también por las condiciones y políticas del proveedor del canal.
          Puedes revocar una integración desde Nexora o desde la configuración
          del proveedor correspondiente.
        </p>
        <p>
          Algunos proveedores pueden procesar información fuera de Chile. En
          tales casos aplicamos medidas contractuales, técnicas y organizativas
          razonables para protegerla conforme a la normativa aplicable.
        </p>
      </LegalSection>

      <LegalSection id="conservacion" title="7. Conservación y seguridad">
        <p>
          Conservamos los datos mientras la cuenta o relación comercial se
          encuentre activa y durante el tiempo necesario para prestar el
          servicio, resolver controversias, proteger la seguridad y cumplir
          obligaciones legales o contractuales. Los plazos concretos dependen
          del tipo de dato y de las instrucciones de la empresa usuaria.
        </p>
        <p>
          Utilizamos controles de acceso por empresa y rol, cifrado de
          credenciales sensibles, conexiones seguras, registros de auditoría,
          respaldos y medidas de disponibilidad. Ningún sistema es infalible;
          por ello revisamos y actualizamos nuestras medidas conforme evoluciona
          el servicio y sus riesgos.
        </p>
      </LegalSection>

      <LegalSection id="derechos" title="8. Tus derechos y solicitudes">
        <p>
          Puedes solicitar información sobre tus datos, acceso, rectificación,
          eliminación, bloqueo u oposición cuando corresponda. Desde el 1 de
          diciembre de 2026 se aplicarán además los derechos y condiciones
          establecidos por la Ley N.º 21.719, incluida la portabilidad en los
          casos previstos por ella.
        </p>
        <p>
          Para solicitar eliminación, revisa nuestras{' '}
          <Link
            href="/eliminacion-de-datos"
            className="text-primary font-semibold underline underline-offset-4"
          >
            instrucciones de eliminación de datos
          </Link>
          . Si tus datos fueron incorporados por una empresa cliente de Nexora,
          podremos derivar la solicitud a esa empresa para que valide y defina
          las acciones que correspondan.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="9. Cookies y tecnologías similares">
        <p>
          Nexora utiliza cookies y almacenamiento local necesarios para iniciar
          sesión, proteger la cuenta, mantener preferencias de apariencia y
          conservar el estado esencial de la aplicación. Desactivar estas
          tecnologías puede impedir que la Plataforma funcione correctamente.
        </p>
      </LegalSection>

      <LegalSection id="cambios" title="10. Cambios y contacto">
        <p>
          Podemos actualizar esta política para reflejar cambios normativos,
          operacionales o de producto. Publicaremos la versión vigente en esta
          misma dirección, indicando su fecha de actualización.
        </p>
        <p>
          Para consultas de privacidad escribe a{' '}
          <a
            href="mailto:privacidad@nexoracrm.cl"
            className="text-primary font-semibold underline underline-offset-4"
          >
            privacidad@nexoracrm.cl
          </a>
          . Los usuarios registrados también pueden ingresar una solicitud en el
          centro de Ayuda y soporte de Nexora.
        </p>
        <p className="text-xs leading-5">
          Referencias normativas:{' '}
          <a
            href="https://www.bcn.cl/leychile/Navegar?idNorma=141599"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-4"
          >
            Ley N.º 19.628
          </a>{' '}
          y{' '}
          <a
            href="https://www.bcn.cl/leychile/Navegar?idNorma=1209272"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-4"
          >
            Ley N.º 21.719
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
