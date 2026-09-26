import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, Trash2 } from 'lucide-react';

import {
  LegalList,
  LegalNotice,
  LegalPage,
  LegalSection,
} from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Eliminación de datos',
  description:
    'Instrucciones para solicitar la eliminación de datos personales y conexiones de Meta en Nexora CRM.',
  alternates: { canonical: '/eliminacion-de-datos' },
  robots: { index: true, follow: true },
};

const navigation = [
  { id: 'alcance', label: 'Quién puede solicitarla' },
  { id: 'solicitar', label: 'Cómo solicitarla' },
  { id: 'meta', label: 'Facebook e Instagram' },
  { id: 'proceso', label: 'Proceso de verificación' },
  { id: 'eliminamos', label: 'Qué eliminamos' },
  { id: 'conservacion', label: 'Excepciones y respaldos' },
  { id: 'empresas', label: 'Datos de empresas clientes' },
  { id: 'contacto', label: 'Seguimiento y contacto' },
] as const;

export default function DataDeletionPage() {
  return (
    <LegalPage
      eyebrow="Control sobre tus datos"
      title="Eliminación de datos personales"
      description="Aquí puedes conocer cómo solicitar la eliminación de tu cuenta, tus datos personales o una conexión de Facebook e Instagram asociada a Nexora CRM."
      updatedAt="26 de septiembre de 2026"
      navigation={[...navigation]}
      icon={<Trash2 className="size-4" />}
    >
      <LegalSection id="alcance" title="1. Quién puede solicitarla">
        <p>Puedes presentar una solicitud si eres:</p>
        <LegalList>
          <li>titular de una cuenta de usuario en Nexora;</li>
          <li>administrador autorizado de un espacio de trabajo;</li>
          <li>
            una persona que se comunicó con una empresa mediante Facebook,
            Instagram, WhatsApp u otro canal gestionado en Nexora; o
          </li>
          <li>representante debidamente autorizado de la persona titular.</li>
        </LegalList>
        <p>
          Si solicitas el cierre completo de una empresa, debes contar con
          facultades de propietario o administrador para evitar la eliminación
          no autorizada de información compartida con otros integrantes.
        </p>
      </LegalSection>

      <LegalSection id="solicitar" title="2. Cómo presentar una solicitud">
        <p>Puedes usar cualquiera de estas vías:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border-border/70 bg-background rounded-2xl border p-4">
            <p className="text-foreground font-bold">Desde Nexora</p>
            <p className="mt-1">
              Inicia sesión, abre <strong>Ayuda y soporte</strong> y crea una
              solicitud con el asunto &ldquo;Eliminación de datos&rdquo;.
            </p>
            <Link
              href="/support"
              className="text-primary mt-3 inline-flex font-semibold underline underline-offset-4"
            >
              Ir a Ayuda y soporte
            </Link>
          </div>
          <div className="border-border/70 bg-background rounded-2xl border p-4">
            <p className="text-foreground font-bold">Por correo electrónico</p>
            <p className="mt-1">
              Envía la solicitud desde tu correo habitual con el asunto
              &ldquo;Solicitud de eliminación de datos&rdquo;.
            </p>
            <a
              href="mailto:privacidad@nexoracrm.cl?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos"
              className="text-primary mt-3 inline-flex font-semibold underline underline-offset-4"
            >
              privacidad@nexoracrm.cl
            </a>
          </div>
        </div>
        <p>Incluye solamente:</p>
        <LegalList>
          <li>tu nombre y correo o teléfono asociado;</li>
          <li>la empresa o espacio de trabajo relacionado, si lo conoces;</li>
          <li>
            la página de Facebook o cuenta de Instagram conectada, si aplica;
          </li>
          <li>una descripción clara de los datos que deseas eliminar.</li>
        </LegalList>
        <LegalNotice>
          No envíes contraseñas, códigos de verificación, tokens de acceso ni
          copias completas de documentos de identidad.
        </LegalNotice>
      </LegalSection>

      <LegalSection id="meta" title="3. Facebook e Instagram">
        <p>
          Si conectaste Facebook o Instagram mediante Nexora, puedes revocar el
          acceso desde <strong>Configuración → Facebook e Instagram</strong> en
          la Plataforma. Esto elimina o invalida las credenciales almacenadas y
          detiene la recepción de nuevos mensajes para esa conexión.
        </p>
        <p>
          También puedes retirar a Nexora desde la sección de integraciones
          empresariales de tu cuenta de Meta. La revocación del permiso impide
          nuevos accesos, pero no sustituye una solicitud de eliminación de
          datos ya almacenados en Nexora; para ello utiliza uno de los canales
          indicados arriba.
        </p>
      </LegalSection>

      <LegalSection id="proceso" title="4. Verificación y plazo de respuesta">
        <ol className="marker:text-primary ml-5 list-decimal space-y-2 pl-1">
          <li>Registramos la solicitud y acusamos recibo.</li>
          <li>
            Verificamos razonablemente la identidad y autoridad de quien la
            presenta, solicitando solo la información indispensable.
          </li>
          <li>
            Identificamos los sistemas, espacios de trabajo e integraciones
            involucrados.
          </li>
          <li>
            Ejecutamos la eliminación, anonimización, bloqueo o derivación que
            corresponda y comunicamos el resultado.
          </li>
        </ol>
        <p>
          Procuramos responder dentro de 30 días corridos. Si la solicitud es
          compleja, afecta información de terceros o requiere coordinación con
          la empresa responsable, informaremos el estado y cualquier plazo
          adicional permitido por la normativa aplicable.
        </p>
      </LegalSection>

      <LegalSection id="eliminamos" title="5. Qué ocurre con los datos">
        <p>Según el alcance validado, podremos:</p>
        <LegalList>
          <li>
            cerrar el usuario y eliminar o anonimizar sus datos de perfil;
          </li>
          <li>
            revocar tokens y desconectar Facebook, Instagram u otros canales;
          </li>
          <li>
            eliminar contactos, mensajes, archivos, transcripciones y datos
            comerciales cuando corresponda y exista autorización suficiente;
          </li>
          <li>
            eliminar configuraciones, automatizaciones y contenido del espacio
            si se solicita el cierre completo de una empresa; y
          </li>
          <li>
            anonimizar registros técnicos cuando su eliminación individual no
            sea razonablemente posible.
          </li>
        </LegalList>
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3.5 text-emerald-800 dark:text-emerald-200">
          <BadgeCheck className="mt-0.5 size-5 shrink-0" />
          <p>
            Cuando el proceso finalice, enviaremos una confirmación al canal
            verificado utilizado para la solicitud.
          </p>
        </div>
      </LegalSection>

      <LegalSection
        id="conservacion"
        title="6. Excepciones, seguridad y respaldos"
      >
        <p>
          Podemos conservar temporalmente información cuando sea necesaria para
          cumplir una obligación legal o contractual, resolver una controversia,
          prevenir fraude, proteger la seguridad o acreditar operaciones. En
          estos casos la información se bloquea o restringe para que no se use
          con otras finalidades.
        </p>
        <p>
          Las copias de respaldo protegidas se eliminan conforme a sus ciclos de
          rotación. Durante ese periodo no se restauran para uso ordinario y
          permanecen sujetas a controles de acceso y seguridad.
        </p>
      </LegalSection>

      <LegalSection
        id="empresas"
        title="7. Datos administrados por empresas clientes"
      >
        <p>
          Si tus datos forman parte del espacio de una empresa que utiliza
          Nexora para atenderte, normalmente esa empresa es quien decide para
          qué y por cuánto tiempo se conservan. Nexora puede recibir tu
          solicitud, identificar al responsable y colaborar con él para
          responderla, pero no eliminará unilateralmente registros que la
          empresa deba conservar por una obligación legal o una relación
          vigente.
        </p>
      </LegalSection>

      <LegalSection id="contacto" title="8. Seguimiento y contacto">
        <p>
          Para consultar el estado de una solicitud, responde al mismo correo o
          ticket con el que fue registrada. Usa como referencia el número de
          caso que recibirás en la confirmación.
        </p>
        <p>
          Contacto de privacidad:{' '}
          <a
            href="mailto:privacidad@nexoracrm.cl"
            className="text-primary font-semibold underline underline-offset-4"
          >
            privacidad@nexoracrm.cl
          </a>
          . Consulta también nuestra{' '}
          <Link
            href="/privacidad"
            className="text-primary font-semibold underline underline-offset-4"
          >
            Política de privacidad
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
