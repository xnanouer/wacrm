import type {
  PaymentCommitmentDocumentData,
  PaymentCommitmentInput,
} from '@/lib/contracts/types';

function formatDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(parsed);
}

function money(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="pc-cell">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

export function PaymentCommitmentDocument({
  data,
}: {
  data: PaymentCommitmentDocumentData;
}) {
  const { contract, company } = data;
  const input = contract.input as PaymentCommitmentInput;
  const companyAddress = [company.legalAddress, company.commune, company.city]
    .filter(Boolean)
    .join(', ');
  const branchName = input.branchName.trim();
  const hasDistinctBranchName =
    Boolean(branchName) &&
    branchName.toLocaleLowerCase('es-CL') !==
      company.displayName.trim().toLocaleLowerCase('es-CL');
  return (
    <article className="pc-document">
      <style>{`
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #eef0f5; }
        .pc-document { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 9.6pt; line-height: 1.45; }
        .pc-head { display: grid; grid-template-columns: 1fr auto; gap: 14mm; align-items: start; border-bottom: 2px solid #7c3aed; padding-bottom: 5mm; }
        .pc-brand { display: flex; gap: 4mm; align-items: center; }
        .pc-brand img { width: 24mm; height: 17mm; object-fit: contain; }
        .pc-brand h1 { margin: 0; font-size: 17pt; }
        .pc-brand p { margin: 1mm 0 0; color: #6b7280; font-size: 8pt; }
        .pc-number { text-align: right; }
        .pc-number span { display: block; color: #6b7280; font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; }
        .pc-number strong { display: block; margin: 1mm 0 2mm; font-size: 11pt; }
        .pc-title { margin: 9mm 0 2mm; text-align: center; font-size: 18pt; text-transform: uppercase; }
        .pc-subtitle { margin: 0 0 7mm; color: #7c3aed; text-align: center; font-size: 8pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
        .pc-lead { margin: 0 0 5mm; text-align: justify; }
        .pc-section { margin-top: 5mm; break-inside: avoid; }
        .pc-section h3 { display: flex; align-items: center; gap: 2mm; margin: 0 0 2.5mm; color: #5b21b6; font-size: 10pt; text-transform: uppercase; }
        .pc-section h3::before { content: ''; width: 3mm; height: 3mm; border-radius: 999px; background: #7c3aed; }
        .pc-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #d7d9e0; border-radius: 3mm; overflow: hidden; }
        .pc-grid.two { grid-template-columns: repeat(2, 1fr); }
        .pc-cell { min-height: 13mm; padding: 2.5mm 3mm; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
        .pc-cell span { display: block; margin-bottom: 1mm; color: #6b7280; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
        .pc-cell strong { display: block; font-size: 9pt; overflow-wrap: anywhere; }
        .pc-payment { padding: 4mm; border: 1px solid #c4b5fd; border-radius: 3mm; background: #faf8ff; }
        .pc-payment p { margin: 0 0 3mm; text-align: justify; }
        .pc-payment p:last-child { margin: 0; }
        .pc-value { color: #5b21b6; font-size: 13pt; }
        .pc-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 18mm; margin-top: 19mm; break-inside: avoid; }
        .pc-signature { border-top: 1px solid #111827; padding-top: 2mm; text-align: center; }
        .pc-signature strong, .pc-signature span { display: block; }
        .pc-signature span { color: #6b7280; margin-top: 1mm; font-size: 8pt; }
        .pc-footer { margin-top: 10mm; padding-top: 3mm; border-top: 1px solid #e5e7eb; color: #6b7280; text-align: center; font-size: 7.3pt; }
        @media print { body { background: #fff; } .pc-document { margin: 0; } }
      `}</style>
      <header className="pc-head">
        <div className="pc-brand">
          {company.logoUrl ? (
            // The PDF renderer must load the original signed storage URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt={company.displayName} />
          ) : null}
          <div>
            <h1>{company.displayName}</h1>
            <p>{company.legalName}</p>
            <p>{company.taxId ? `RUT ${company.taxId}` : ''}</p>
          </div>
        </div>
        <div className="pc-number">
          <span>N.º de contrato</span>
          <strong>{contract.contractNumber}</strong>
          <span>Fecha</span>
          <strong>{formatDate(input.issueDate)}</strong>
        </div>
      </header>
      <h2 className="pc-title">Compromiso de pago</h2>
      <p className="pc-subtitle">Recepción de vehículo · Modelo 1</p>
      <p className="pc-lead">
        En {input.providerCity || company.city || 'la ciudad indicada'}, a{' '}
        {formatDate(input.issueDate)}, comparece{' '}
        <strong>{input.providerName}</strong>, RUT{' '}
        <strong>{input.providerRut}</strong>, en adelante la parte proveedora,
        quien entrega el vehículo individualizado a{' '}
        <strong>{company.legalName || company.displayName}</strong>. La empresa
        se compromete a pagar el valor y dentro de los plazos señalados en este
        documento, una vez cumplidas las condiciones aplicables y firmado por
        ambas partes.
      </p>
      <section className="pc-section">
        <h3>1. Parte proveedora</h3>
        <div className="pc-grid two">
          <Cell label="Nombre completo" value={input.providerName} />
          <Cell label="RUT" value={input.providerRut} />
          <Cell label="Domicilio" value={input.providerAddress} />
          <Cell label="Comuna" value={input.providerCommune} />
          <Cell
            label="Ciudad / Región"
            value={[input.providerCity, input.providerRegion]
              .filter(Boolean)
              .join(' · ')}
          />
          <Cell label="Teléfono" value={input.providerPhone} />
          <Cell label="Correo" value={input.providerEmail} />
          <Cell
            label="Deuda de pensión"
            value={input.hasPensionDebt ? 'Sí' : 'No'}
          />
        </div>
      </section>
      <section className="pc-section">
        <h3>2. Identificación del vehículo</h3>
        <div className="pc-grid">
          <Cell label="Tipo" value={input.vehicleType} />
          <Cell label="Marca" value={input.vehicleMake} />
          <Cell label="Modelo" value={input.vehicleModel} />
          <Cell label="N.º motor" value={input.vehicleEngineNumber} />
          <Cell label="N.º chasis / VIN" value={input.vehicleChassisNumber} />
          <Cell label="Color" value={input.vehicleColor} />
          <Cell label="Patente" value={input.vehiclePlate} />
          <Cell label="Año" value={input.vehicleYear} />
          <Cell label="Combustible" value={input.vehicleFuel} />
        </div>
      </section>
      <section className="pc-section">
        <h3>3. Compromiso y condiciones de pago</h3>
        <div className="pc-payment">
          <p>
            El vehículo es recibido por <strong>{company.displayName}</strong>{' '}
            en{' '}
            {hasDistinctBranchName ? (
              <>
                la sucursal <strong>{branchName}</strong>
              </>
            ) : (
              'su sucursal'
            )}
            , ubicada en <strong>{input.branchAddress}</strong>, por un valor
            acordado de{' '}
            <strong className="pc-value">{money(input.takePrice)}</strong>.
          </p>
          <p>
            <strong>Venta al contado:</strong> el pago se realizará dentro de{' '}
            {input.cashPaymentBusinessDays} días hábiles, contados desde la
            firma de ambas partes.
          </p>
          <p>
            <strong>Venta mediante financiamiento o crédito automotriz:</strong>{' '}
            el pago se realizará dentro de {input.financedPaymentBusinessDays}{' '}
            días hábiles, contados desde la firma de ambas partes.
          </p>
          <p>
            <strong>Ejecutivo responsable:</strong> {input.executiveName}
            {input.executivePhone ? ` · ${input.executivePhone}` : ''}
            {input.executiveEmail ? ` · ${input.executiveEmail}` : ''}.
          </p>
        </div>
      </section>
      <section className="pc-signatures">
        <div className="pc-signature">
          <strong>{company.displayName}</strong>
          <span>Timbre y firma de la empresa</span>
        </div>
        <div className="pc-signature">
          <strong>{input.providerName}</strong>
          <span>RUT {input.providerRut} · Parte proveedora</span>
        </div>
      </section>
      <footer className="pc-footer">
        {companyAddress}
        {company.phone ? ` · ${company.phone}` : ''}
        {company.email ? ` · ${company.email}` : ''}
      </footer>
    </article>
  );
}
