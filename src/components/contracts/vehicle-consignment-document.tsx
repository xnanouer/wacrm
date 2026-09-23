import type {
  VehicleConsignmentDocumentData,
  VehicleConsignmentInput,
} from '@/lib/contracts/types';

function yesNo(value: boolean): string {
  return value ? 'Sí' : 'No';
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(date);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

function DataCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="contract-data-cell">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

export function VehicleConsignmentDocument({
  data,
}: {
  data: VehicleConsignmentDocumentData;
}) {
  const { contract, company } = data;
  const input = contract.input as VehicleConsignmentInput;
  const companyAddress = [company.legalAddress, company.commune, company.city]
    .filter(Boolean)
    .join(', ');
  const branchName = input.branchName.trim();
  const hasDistinctBranchName =
    Boolean(branchName) &&
    branchName.toLocaleLowerCase('es-CL') !==
      company.displayName.trim().toLocaleLowerCase('es-CL');
  return (
    <article className="contract-document">
      <style>{`
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #eef0f5; }
        .contract-document { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 15mm 16mm 16mm; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; line-height: 1.42; }
        .contract-head { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 16mm; padding-bottom: 5mm; border-bottom: 2px solid #7c3aed; }
        .contract-brand { display: flex; align-items: center; gap: 4mm; }
        .contract-brand img { width: 23mm; height: 16mm; object-fit: contain; }
        .contract-brand h1 { margin: 0; font-size: 17pt; letter-spacing: -.02em; }
        .contract-brand p { margin: 1mm 0 0; color: #6b7280; font-size: 8.5pt; }
        .contract-number { text-align: right; }
        .contract-number span { display: block; color: #6b7280; font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; }
        .contract-number strong { display: block; margin-top: 1mm; font-size: 12pt; }
        .contract-title { margin: 7mm 0 1mm; text-align: center; font-size: 16pt; text-transform: uppercase; }
        .contract-subtitle { margin: 0 0 6mm; text-align: center; color: #7c3aed; font-size: 8pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
        .contract-lead { margin: 0 0 5mm; text-align: justify; }
        .contract-section { margin-top: 5mm; break-inside: avoid; }
        .contract-section-title { display: flex; align-items: center; gap: 2mm; margin: 0 0 2.5mm; color: #5b21b6; font-size: 10pt; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
        .contract-section-title::before { content: ''; width: 3mm; height: 3mm; border-radius: 50%; background: #7c3aed; }
        .contract-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #d7d9e0; border-radius: 3mm; overflow: hidden; }
        .contract-grid.two { grid-template-columns: repeat(2, 1fr); }
        .contract-data-cell { min-height: 13mm; padding: 2.5mm 3mm; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
        .contract-data-cell span { display: block; margin-bottom: 1mm; color: #6b7280; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
        .contract-data-cell strong { display: block; font-size: 9pt; overflow-wrap: anywhere; }
        .contract-checks { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.8mm 5mm; padding: 3mm 4mm; border: 1px solid #d7d9e0; border-radius: 3mm; }
        .contract-check { display: flex; justify-content: space-between; gap: 3mm; border-bottom: 1px dotted #d1d5db; padding: 1.2mm 0; }
        .contract-check strong { color: #5b21b6; }
        .contract-conditions { padding: 4mm; border: 1px solid #c4b5fd; border-radius: 3mm; background: #faf8ff; }
        .contract-conditions p { margin: 0 0 2.5mm; text-align: justify; }
        .contract-conditions p:last-child { margin-bottom: 0; }
        .contract-value { color: #5b21b6; font-size: 12pt; }
        .contract-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 18mm; margin-top: 15mm; break-inside: avoid; }
        .contract-signature { padding-top: 2mm; border-top: 1px solid #111827; text-align: center; }
        .contract-signature strong, .contract-signature span { display: block; }
        .contract-signature span { margin-top: 1mm; color: #6b7280; font-size: 8pt; }
        .contract-footer { margin-top: 8mm; padding-top: 3mm; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 7.3pt; text-align: center; }
        @media print { body { background: #fff; } .contract-document { margin: 0; } }
      `}</style>

      <header className="contract-head">
        <div className="contract-brand">
          {company.logoUrl ? (
            // The PDF renderer needs the original signed storage URL. Next
            // Image optimization is intentionally bypassed for this document.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt={company.displayName} />
          ) : null}
          <div>
            <h1>{company.displayName}</h1>
            <p>{company.legalName}</p>
            <p>{company.taxId ? `RUT ${company.taxId}` : ''}</p>
          </div>
        </div>
        <div className="contract-number">
          <span>N.º de contrato</span>
          <strong>{contract.contractNumber}</strong>
          <span style={{ marginTop: '2mm' }}>Fecha</span>
          <strong>{formatDate(input.issueDate)}</strong>
        </div>
      </header>

      <h2 className="contract-title">Recepción de vehículo</h2>
      <p className="contract-subtitle">Anexo de consignación · Modelo 1</p>

      <p className="contract-lead">
        En {input.consignorCity || company.city || 'la ciudad indicada'}, a{' '}
        {formatDate(input.issueDate)}, comparece{' '}
        <strong>{input.consignorName}</strong>, cédula de identidad N.º{' '}
        <strong>{input.consignorRut}</strong>, domiciliado(a) en{' '}
        <strong>{input.consignorAddress}</strong>, teléfono{' '}
        <strong>{input.consignorPhone}</strong>, en adelante la parte
        consignadora, quien entrega a{' '}
        <strong>{company.legalName || company.displayName}</strong>, RUT{' '}
        <strong>{company.taxId || '—'}</strong>, el vehículo individualizado a
        continuación.
      </p>

      <section className="contract-section">
        <h3 className="contract-section-title">1. Parte consignadora</h3>
        <div className="contract-grid two">
          <DataCell label="Nombre completo" value={input.consignorName} />
          <DataCell label="RUT" value={input.consignorRut} />
          <DataCell label="Domicilio" value={input.consignorAddress} />
          <DataCell label="Ciudad" value={input.consignorCity} />
          <DataCell label="Teléfono" value={input.consignorPhone} />
          <DataCell label="Correo" value={input.consignorEmail} />
        </div>
      </section>

      <section className="contract-section">
        <h3 className="contract-section-title">
          2. Identificación del vehículo
        </h3>
        <div className="contract-grid">
          <DataCell label="Tipo" value={input.vehicleType} />
          <DataCell label="Marca" value={input.vehicleMake} />
          <DataCell
            label="Modelo / versión"
            value={[input.vehicleModel, input.vehicleVersion]
              .filter(Boolean)
              .join(' · ')}
          />
          <DataCell
            label="N.º motor"
            value={input.vehicleEngineNumber || input.vehicleEngine}
          />
          <DataCell
            label="N.º chasis / VIN"
            value={input.vehicleChassisNumber}
          />
          <DataCell label="Color" value={input.vehicleColor} />
          <DataCell label="Patente" value={input.vehiclePlate} />
          <DataCell label="Año" value={input.vehicleYear} />
          <DataCell
            label="Combustible / PBV"
            value={[
              input.vehicleFuel,
              input.vehicleGrossWeightKg
                ? `${input.vehicleGrossWeightKg.toLocaleString('es-CL')} kg`
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          <DataCell
            label="Kilometraje"
            value={
              input.vehicleMileageKm === null
                ? '—'
                : `${input.vehicleMileageKm.toLocaleString('es-CL')} km`
            }
          />
          <DataCell label="Llaves recibidas" value={input.keysReceived} />
          <DataCell label="Llaves en sucursal" value={input.keysAtBranch} />
        </div>
      </section>

      <section className="contract-section">
        <h3 className="contract-section-title">
          3. Documentación y declaraciones
        </h3>
        <div className="contract-checks">
          <div className="contract-check">
            <span>Documentos al día</span>
            <strong>{yesNo(input.documentsUpToDate)}</strong>
          </div>
          <div className="contract-check">
            <span>Consigna como</span>
            <strong>
              {input.consignorCapacity === 'legal_owner'
                ? 'Dueño legal'
                : 'Representante autorizado'}
            </strong>
          </div>
          <div className="contract-check">
            <span>Carta poder</span>
            <strong>{yesNo(input.hasPowerOfAttorney)}</strong>
          </div>
          <div className="contract-check">
            <span>Copia de cédula</span>
            <strong>{yesNo(input.hasIdCopy)}</strong>
          </div>
          <div className="contract-check">
            <span>Uso del vehículo</span>
            <strong>{input.vehicleUse || '—'}</strong>
          </div>
          <div className="contract-check">
            <span>Posee prenda</span>
            <strong>{yesNo(input.hasLien)}</strong>
          </div>
          <div className="contract-check">
            <span>Certificado de anotaciones</span>
            <strong>{yesNo(input.hasAnnotationsCertificate)}</strong>
          </div>
          <div className="contract-check">
            <span>Informe Autofact</span>
            <strong>
              {yesNo(input.hasAutofactReport)}
              {input.autofactPreparedBy ? ` · ${input.autofactPreparedBy}` : ''}
            </strong>
          </div>
          <div className="contract-check">
            <span>Posee multas</span>
            <strong>{yesNo(input.hasFines)}</strong>
          </div>
          <div className="contract-check">
            <span>Deuda de pensión</span>
            <strong>{yesNo(input.hasPensionDebt)}</strong>
          </div>
        </div>
      </section>

      <section className="contract-section">
        <h3 className="contract-section-title">4. Ingreso y condiciones</h3>
        <div className="contract-conditions">
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
            , ubicada en <strong>{input.branchAddress}</strong>. La recepción es
            gestionada por el/la ejecutivo(a){' '}
            <strong>{input.executiveName}</strong>.
          </p>
          <p>
            Las partes registran un valor de consignación de{' '}
            <strong className="contract-value">
              {formatMoney(input.consignmentValue)}
            </strong>
            .
          </p>
          <p>
            <strong>Pago por venta al contado:</strong> {input.cashPaymentTerms}
          </p>
          <p>
            <strong>Pago por venta con financiamiento:</strong>{' '}
            {input.financedPaymentTerms}
          </p>
        </div>
      </section>

      <section className="contract-signatures">
        <div className="contract-signature">
          <strong>{company.displayName}</strong>
          <span>Timbre y firma de la empresa</span>
        </div>
        <div className="contract-signature">
          <strong>{input.consignorName}</strong>
          <span>RUT {input.consignorRut} · Parte consignadora</span>
        </div>
      </section>

      <footer className="contract-footer">
        {companyAddress} {company.phone ? `· ${company.phone}` : ''}{' '}
        {company.email ? `· ${company.email}` : ''}
      </footer>
    </article>
  );
}
