import { NexoraSupportChat } from '@/components/support/nexora-support-chat';
import { SupportBooking } from '@/components/support/support-booking';

export default function SupportPage() {
  return (
    <div className="nexora-page-stack">
      <div>
        <p className="nexora-kicker">Ayuda y soporte</p>
        <h1 className="nexora-title mt-2">Resuelve tus dudas con Nexora</h1>
        <p className="nexora-description mt-3">
          El asistente revisa solamente la configuración y el contexto de tu
          propia empresa.
        </p>
      </div>
      <NexoraSupportChat embedded />
      <SupportBooking />
    </div>
  );
}
