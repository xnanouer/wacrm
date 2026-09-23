import type {
  ContractDocumentData,
  VehicleTransactionInput,
} from '@/lib/contracts/types';

/* eslint-disable @next/next/no-img-element -- Contract logos are external snapshots rendered into PDFs. */

const date = (value: string) =>
  new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
const money = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);

export function VehicleReservationDocument({
  data,
}: {
  data: ContractDocumentData;
}) {
  const { company, contract } = data;
  const input = contract.input as VehicleTransactionInput;
  return (
    <article className="vr-document">
      <style>{`
    @page { size: A4; margin: 0; } * { box-sizing: border-box; } body { margin: 0; background: #eef0f5; }
    .vr-document { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.55; }
    .vr-head { display: flex; justify-content: space-between; gap: 12mm; border-bottom: 2px solid #7c3aed; padding-bottom: 6mm; } .vr-brand { display: flex; align-items: center; gap: 4mm; } .vr-brand img { width: 25mm; height: 18mm; object-fit: contain; } .vr-brand h1 { margin: 0; font-size: 18pt; } .vr-brand p { margin: 1mm 0 0; color: #6b7280; font-size: 8pt; } .vr-meta { text-align: right; font-size: 8pt; } .vr-meta strong { display: block; margin-bottom: 2mm; font-size: 11pt; }
    .vr-title { margin: 15mm 0 2mm; text-align: center; font-size: 22pt; text-transform: uppercase; } .vr-subtitle { margin: 0 0 12mm; color: #7c3aed; text-align: center; font-size: 8pt; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
    .vr-lead { text-align: justify; } .vr-vehicle { margin: 10mm 0; padding: 6mm; border: 1px solid #c4b5fd; border-radius: 4mm; background: #faf8ff; } .vr-vehicle h2 { margin: 0 0 4mm; color: #5b21b6; font-size: 12pt; } .vr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; } .vr-grid span { display: block; color: #6b7280; font-size: 7pt; text-transform: uppercase; } .vr-grid strong { display: block; margin-top: 1mm; }
    .vr-guarantee { margin-top: 8mm; padding: 6mm; border-radius: 4mm; background: #111027; color: #fff; } .vr-guarantee strong.amount { color: #a78bfa; font-size: 20pt; } .vr-guarantee p { margin: 3mm 0 0; }
    .vr-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 20mm; margin-top: 35mm; } .vr-signature { border-top: 1px solid #111827; padding-top: 2mm; text-align: center; } .vr-signature span { display: block; color: #6b7280; font-size: 8pt; }
    .vr-footer { margin-top: 12mm; padding-top: 3mm; border-top: 1px solid #e5e7eb; color: #6b7280; text-align: center; font-size: 7.5pt; }
  `}</style>
      <header className="vr-head">
        <div className="vr-brand">
          {company.logoUrl ? (
            <img src={company.logoUrl} alt={company.displayName} />
          ) : null}
          <div>
            <h1>{company.displayName}</h1>
            <p>
              {company.legalName} · RUT {company.taxId || '—'}
            </p>
          </div>
        </div>
        <div className="vr-meta">
          <strong>{contract.contractNumber}</strong>
          <span>{date(input.issueDate)}</span>
        </div>
      </header>
      <h2 className="vr-title">Contrato de reserva</h2>
      <p className="vr-subtitle">Reserva de vehículo · Documento referencial</p>
      <p className="vr-lead">
        En <strong>{input.issuePlace}</strong>, a{' '}
        <strong>{date(input.issueDate)}</strong>, comparece{' '}
        <strong>{input.buyerName}</strong>, RUT{' '}
        <strong>{input.buyerRut}</strong>, teléfono{' '}
        <strong>{input.buyerPhone || '—'}</strong>, en adelante la parte
        reservadora, y{' '}
        <strong>{company.legalName || company.displayName}</strong>, RUT{' '}
        <strong>{company.taxId || '—'}</strong>, como parte proveedora. Ambas
        partes acuerdan reservar la unidad individualizada a continuación.
      </p>
      <section className="vr-vehicle">
        <h2>Vehículo reservado</h2>
        <div className="vr-grid">
          <div>
            <span>Marca</span>
            <strong>{input.vehicleMake}</strong>
          </div>
          <div>
            <span>Modelo</span>
            <strong>{input.vehicleModel}</strong>
          </div>
          <div>
            <span>Año</span>
            <strong>{input.vehicleYear}</strong>
          </div>
          <div>
            <span>Patente</span>
            <strong>{input.vehiclePlate}</strong>
          </div>
          <div>
            <span>Tipo</span>
            <strong>{input.vehicleType}</strong>
          </div>
          <div>
            <span>Color</span>
            <strong>{input.vehicleColor || '—'}</strong>
          </div>
        </div>
      </section>
      <section className="vr-guarantee">
        <span>Garantía de reserva</span>
        <strong className="amount">{money(input.reservationAmount)}</strong>
        <p>
          Medio de pago: <strong>{input.reservationPaymentMethod}</strong>
        </p>
        <p>
          Vigencia: hasta el <strong>{date(input.reservationExpiresAt)}</strong>
          .
        </p>
        <p>{input.reservationConditions}</p>
      </section>
      <div className="vr-signatures">
        <div className="vr-signature">
          <strong>{company.displayName}</strong>
          <span>Timbre y firma de la empresa</span>
        </div>
        <div className="vr-signature">
          <strong>{input.buyerName}</strong>
          <span>RUT {input.buyerRut} · Parte reservadora</span>
        </div>
      </div>
      <footer className="vr-footer">
        {company.legalAddress}
        {company.phone ? ` · ${company.phone}` : ''}
        {company.email ? ` · ${company.email}` : ''}
      </footer>
    </article>
  );
}
