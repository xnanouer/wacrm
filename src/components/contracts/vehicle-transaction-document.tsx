import type {
  CompanyContractSnapshot,
  ContractDocumentData,
  VehicleTransactionInput,
  VehicleTransactionTemplateKey,
} from '@/lib/contracts/types';

/* eslint-disable @next/next/no-img-element -- Contract logos are external snapshots rendered into PDFs. */

const date = (value: string) => {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(parsed);
};
const money = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
const yesNo = (value: boolean) => (value ? 'Sí' : 'No');

function Brand({
  company,
  number,
  issueDate,
}: {
  company: CompanyContractSnapshot;
  number: string;
  issueDate: string;
}) {
  return (
    <header className="vt-head">
      <div className="vt-brand">
        {company.logoUrl ? (
          <img src={company.logoUrl} alt={company.displayName} />
        ) : null}
        <div>
          <h1>{company.displayName}</h1>
          <p>{company.legalName}</p>
          <p>{company.taxId ? `RUT ${company.taxId}` : ''}</p>
        </div>
      </div>
      <div className="vt-number">
        <span>N.º documento</span>
        <strong>{number}</strong>
        <span>Fecha</span>
        <strong>{date(issueDate)}</strong>
      </div>
    </header>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="vt-cell">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

function VehicleGrid({ input }: { input: VehicleTransactionInput }) {
  return (
    <div className="vt-grid">
      <Cell label="Tipo" value={input.vehicleType} />
      <Cell label="Marca" value={input.vehicleMake} />
      <Cell label="Modelo" value={input.vehicleModel} />
      <Cell label="N.º motor" value={input.vehicleEngineNumber} />
      <Cell label="N.º chasis / VIN" value={input.vehicleChassisNumber} />
      <Cell label="N.º serie" value={input.vehicleSerialNumber} />
      <Cell label="Color" value={input.vehicleColor} />
      <Cell label="Patente" value={input.vehiclePlate} />
      <Cell label="Año" value={input.vehicleYear} />
      <Cell label="Combustible" value={input.vehicleFuel} />
      <Cell
        label="Peso bruto"
        value={
          input.vehicleGrossWeightKg
            ? `${input.vehicleGrossWeightKg.toLocaleString('es-CL')} kg`
            : ''
        }
      />
    </div>
  );
}

function sellerText(
  templateKey: VehicleTransactionTemplateKey,
  input: VehicleTransactionInput,
  company: CompanyContractSnapshot
) {
  if (templateKey === 'vehicle_sale_company_v1')
    return (
      <>
        <strong>{company.legalName || company.displayName}</strong>, RUT{' '}
        <strong>{company.taxId || '—'}</strong>, representada por{' '}
        <strong>
          {company.legalRepresentativeName ||
            'representante legal por completar'}
        </strong>
        , RUT <strong>{company.legalRepresentativeTaxId || '—'}</strong>, con
        domicilio en <strong>{company.legalAddress || '—'}</strong>
      </>
    );
  if (templateKey === 'vehicle_sale_seller_power_v1')
    return (
      <>
        <strong>{input.sellerRepresentativeName}</strong>, RUT{' '}
        <strong>{input.sellerRepresentativeRut}</strong>, en representación de{' '}
        <strong>{input.sellerName}</strong>, RUT{' '}
        <strong>{input.sellerRut}</strong>, según carta poder de fecha{' '}
        <strong>{date(input.sellerPowerDate)}</strong>, otorgada ante{' '}
        <strong>{input.sellerPowerNotary}</strong>
      </>
    );
  return (
    <>
      <strong>{input.sellerName}</strong>, RUT{' '}
      <strong>{input.sellerRut}</strong>, con domicilio en{' '}
      <strong>{input.sellerAddress}</strong>, ciudad de{' '}
      <strong>{input.sellerCity}</strong>
    </>
  );
}

function buyerText(
  templateKey: VehicleTransactionTemplateKey,
  input: VehicleTransactionInput
) {
  if (templateKey === 'vehicle_sale_civil_union_v1')
    return (
      <>
        <strong>{input.buyerName}</strong>, RUT{' '}
        <strong>{input.buyerRut}</strong>, y{' '}
        <strong>{input.secondBuyerName}</strong>, RUT{' '}
        <strong>{input.secondBuyerRut}</strong>, quienes adquieren conjuntamente
      </>
    );
  if (templateKey === 'vehicle_sale_purchase_power_v1')
    return (
      <>
        <strong>{input.buyerRepresentativeName}</strong>, RUT{' '}
        <strong>{input.buyerRepresentativeRut}</strong>, en representación de{' '}
        <strong>{input.buyerName}</strong>, RUT{' '}
        <strong>{input.buyerRut}</strong>, según poder de fecha{' '}
        <strong>{date(input.buyerPowerDate)}</strong>, otorgado ante{' '}
        <strong>{input.buyerPowerNotary}</strong>
      </>
    );
  return (
    <>
      <strong>{input.buyerName}</strong>, RUT <strong>{input.buyerRut}</strong>,
      con domicilio en <strong>{input.buyerAddress}</strong>, ciudad de{' '}
      <strong>{input.buyerCity}</strong>
    </>
  );
}

function PurchasePowerPage({
  data,
  input,
}: {
  data: ContractDocumentData;
  input: VehicleTransactionInput;
}) {
  const { company, contract } = data;
  return (
    <section className="vt-page vt-power-page">
      <Brand
        company={company}
        number={`${contract.contractNumber}-P`}
        issueDate={input.issueDate}
      />
      <h2 className="vt-title">Poder especial para compra</h2>
      <p className="vt-subtitle">Adquisición de vehículo motorizado</p>
      <p>
        En <strong>{input.issuePlace}</strong>, a{' '}
        <strong>{date(input.buyerPowerDate || input.issueDate)}</strong>,
        comparece <strong>{input.buyerName}</strong>, RUT{' '}
        <strong>{input.buyerRut}</strong>, domiciliado(a) en{' '}
        <strong>{input.buyerAddress}</strong>, ciudad de{' '}
        <strong>{input.buyerCity}</strong>, en adelante el mandante.
      </p>
      <p>
        Por este acto confiere mandato especial, amplio y suficiente a{' '}
        <strong>{input.buyerRepresentativeName}</strong>, RUT{' '}
        <strong>{input.buyerRepresentativeRut}</strong>, domiciliado(a) en{' '}
        <strong>{input.buyerRepresentativeAddress}</strong>, ciudad de{' '}
        <strong>{input.buyerRepresentativeCity}</strong>, para que, en su nombre
        y representación, compre y adquiera un vehículo motorizado, pudiendo
        convenir precio, forma de pago y demás cláusulas necesarias; solicitar
        antecedentes, comparecer ante notarías, automotoras, municipalidades y
        el Servicio de Registro Civil e Identificación; firmar los documentos
        requeridos para la inscripción y realizar los actos indispensables para
        completar la adquisición.
      </p>
      <p>
        El mandatario queda facultado para recibir y trasladar el vehículo,
        gestionar permisos y documentación para su circulación, y efectuar las
        declaraciones necesarias para el cumplimiento de este mandato. Este
        poder tendrá una vigencia de{' '}
        <strong>{input.powerValidityDays} días corridos</strong> desde su
        otorgamiento.
      </p>
      <div className="vt-signatures single">
        <div className="vt-signature">
          <strong>{input.buyerName}</strong>
          <span>RUT {input.buyerRut} · Mandante</span>
        </div>
      </div>
      <footer className="vt-footer">
        Documento generado por Nexora para {company.displayName}. Revisión
        notarial recomendada.
      </footer>
    </section>
  );
}

function SalePage({
  data,
  input,
  templateKey,
}: {
  data: ContractDocumentData;
  input: VehicleTransactionInput;
  templateKey: VehicleTransactionTemplateKey;
}) {
  const { company, contract } = data;
  const sellerSignature =
    templateKey === 'vehicle_sale_company_v1'
      ? company.legalName || company.displayName
      : templateKey === 'vehicle_sale_seller_power_v1'
        ? input.sellerRepresentativeName
        : input.sellerName;
  const buyerSignature =
    templateKey === 'vehicle_sale_purchase_power_v1'
      ? input.buyerRepresentativeName
      : input.buyerName;
  return (
    <section className="vt-page">
      <Brand
        company={company}
        number={contract.contractNumber}
        issueDate={input.issueDate}
      />
      <h2 className="vt-title">Contrato de compraventa de vehículo</h2>
      <p className="vt-subtitle">Instrumento privado · Modelo Nexora</p>
      <p className="vt-lead">
        En <strong>{input.issuePlace}</strong>, a{' '}
        <strong>{date(input.issueDate)}</strong>, comparecen como parte
        vendedora {sellerText(templateKey, input, company)}, y como parte
        compradora {buyerText(templateKey, input)}. Las partes acuerdan la
        siguiente compraventa:
      </p>
      <h3 className="vt-section-title">Primero · Vehículo</h3>
      <p>
        La parte vendedora vende, cede y transfiere a la parte compradora el
        siguiente vehículo motorizado:
      </p>
      <VehicleGrid input={input} />
      <div className="vt-clauses">
        <p>
          <strong>Segundo · Precio.</strong> El precio total es{' '}
          <strong>{money(input.totalPrice)}</strong>, pagado mediante{' '}
          <strong>{money(input.cashAmount)}</strong> al contado y{' '}
          <strong>{money(input.financedAmount)}</strong> mediante
          financiamiento. La suma de ambos conceptos coincide con el precio
          total.
        </p>
        <p>
          <strong>Tercero · Estado y entrega.</strong> La parte compradora
          declara conocer y recibir el vehículo en su estado actual. La parte
          vendedora declara que tiene facultades para transferirlo y que los
          antecedentes entregados son veraces.
        </p>
        <p>
          <strong>Cuarto · Inscripción.</strong> Las partes facultan al notario
          y al portador autorizado para efectuar aclaraciones formales y
          gestionar las inscripciones necesarias ante el Registro de Vehículos
          Motorizados, sin alterar el precio ni la identidad de las partes.
        </p>
        <p>
          <strong>Quinto · Domicilio.</strong> Para los efectos derivados de
          este contrato, las partes fijan domicilio en{' '}
          <strong>{input.issuePlace}</strong>.
        </p>
        <p>
          <strong>Sexto · Gravámenes.</strong> La parte vendedora declara que el
          vehículo se encuentra libre de prendas, embargos y prohibiciones no
          informadas.
        </p>
        <p>
          <strong>Séptimo · Multas y pensiones.</strong> Vehículo con multas
          informadas: <strong>{yesNo(input.vehicleHasFines)}</strong>. Vendedor
          en registro de deudores de alimentos:{' '}
          <strong>{yesNo(input.sellerHasPensionDebt)}</strong>. Comprador en
          dicho registro: <strong>{yesNo(input.buyerHasPensionDebt)}</strong>.
        </p>
        {input.amendmentAttorneyName ? (
          <p>
            <strong>Octavo · Mandato de rectificación.</strong> Las partes
            facultan a <strong>{input.amendmentAttorneyName}</strong>, RUT{' '}
            <strong>{input.amendmentAttorneyRut}</strong>, para subsanar errores
            u omisiones formales destinados exclusivamente a obtener la
            inscripción correspondiente.
          </p>
        ) : null}
      </div>
      <div className="vt-signatures">
        <div className="vt-signature">
          <strong>{sellerSignature || 'Parte vendedora'}</strong>
          <span>Firma parte vendedora</span>
        </div>
        <div className="vt-signature">
          <strong>{buyerSignature || 'Parte compradora'}</strong>
          <span>Firma parte compradora</span>
        </div>
      </div>
      <footer className="vt-footer">
        {company.legalAddress}
        {company.phone ? ` · ${company.phone}` : ''}
        {company.email ? ` · ${company.email}` : ''}
      </footer>
    </section>
  );
}

export function VehicleTransactionDocument({
  data,
}: {
  data: ContractDocumentData;
}) {
  const input = data.contract.input as VehicleTransactionInput;
  const templateKey = data.contract
    .templateKey as VehicleTransactionTemplateKey;
  return (
    <article className="vt-document">
      <style>{`
    @page { size: A4; margin: 0; } * { box-sizing: border-box; } body { margin: 0; background: #eef0f5; }
    .vt-document { color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.38; }
    .vt-page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 16mm 15mm; background: #fff; break-after: page; }
    .vt-page:last-child { break-after: auto; } .vt-head { display: grid; grid-template-columns: 1fr auto; gap: 12mm; border-bottom: 2px solid #7c3aed; padding-bottom: 4mm; }
    .vt-brand { display: flex; align-items: center; gap: 4mm; } .vt-brand img { width: 23mm; height: 16mm; object-fit: contain; } .vt-brand h1 { margin: 0; font-size: 16pt; } .vt-brand p { margin: 1mm 0 0; color: #6b7280; font-size: 7.5pt; }
    .vt-number { text-align: right; } .vt-number span { display: block; color: #6b7280; font-size: 7pt; text-transform: uppercase; } .vt-number strong { display: block; margin: .7mm 0 2mm; font-size: 10pt; }
    .vt-title { margin: 7mm 0 1mm; text-align: center; font-size: 16pt; text-transform: uppercase; } .vt-subtitle { margin: 0 0 5mm; color: #7c3aed; text-align: center; font-size: 7.5pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .vt-lead, .vt-page > p { text-align: justify; } .vt-section-title { margin: 4mm 0 2mm; color: #5b21b6; font-size: 10pt; text-transform: uppercase; }
    .vt-grid { display: grid; grid-template-columns: repeat(3, 1fr); margin: 2mm 0 4mm; border: 1px solid #d7d9e0; border-radius: 3mm; overflow: hidden; }
    .vt-cell { min-height: 11mm; padding: 2mm 2.5mm; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; } .vt-cell span { display: block; color: #6b7280; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; } .vt-cell strong { display: block; margin-top: .8mm; font-size: 8.3pt; overflow-wrap: anywhere; }
    .vt-clauses { padding: 3mm 4mm; border: 1px solid #c4b5fd; border-radius: 3mm; background: #faf8ff; } .vt-clauses p { margin: 0 0 2.2mm; text-align: justify; } .vt-clauses p:last-child { margin-bottom: 0; }
    .vt-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 18mm; margin-top: 13mm; } .vt-signatures.single { grid-template-columns: 1fr; max-width: 75mm; margin: 30mm auto 0; }
    .vt-signature { border-top: 1px solid #111827; padding-top: 2mm; text-align: center; } .vt-signature strong, .vt-signature span { display: block; } .vt-signature span { margin-top: 1mm; color: #6b7280; font-size: 7.5pt; }
    .vt-footer { margin-top: 7mm; padding-top: 2.5mm; border-top: 1px solid #e5e7eb; color: #6b7280; text-align: center; font-size: 7pt; }
    .vt-power-page > p { margin: 5mm 0; line-height: 1.65; }
    @media print { body { background: #fff; } .vt-page { margin: 0; } }
  `}</style>
      {templateKey === 'vehicle_sale_purchase_power_v1' ? (
        <PurchasePowerPage data={data} input={input} />
      ) : null}
      <SalePage data={data} input={input} templateKey={templateKey} />
    </article>
  );
}
