import type {
  ContractDocumentData,
  VehicleLegalInput,
  VehicleLegalVehicle,
} from '@/lib/contracts/types';

/* eslint-disable @next/next/no-img-element -- Company logos are external snapshots rendered into PDFs. */

const formatDate = (value: string) => {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value || '—'
    : new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(parsed);
};

function Header({ data }: { data: ContractDocumentData }) {
  const { company, contract } = data;
  return (
    <header className="vl-head">
      <div className="vl-brand">
        {company.logoUrl ? (
          <img src={company.logoUrl} alt={company.displayName} />
        ) : null}
        <div>
          <h1>{company.displayName}</h1>
          <p>{company.legalName}</p>
          <p>{company.taxId ? `RUT ${company.taxId}` : ''}</p>
        </div>
      </div>
      <div className="vl-meta">
        <span>N.º documento</span>
        <strong>{contract.contractNumber}</strong>
        <span>Fecha</span>
        <strong>{formatDate(contract.issueDate)}</strong>
      </div>
    </header>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="vl-cell">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

function VehicleGrid({ vehicle }: { vehicle: VehicleLegalVehicle }) {
  return (
    <div className="vl-grid">
      <Cell label="Tipo" value={vehicle.type} />
      <Cell label="Marca" value={vehicle.make} />
      <Cell label="Modelo" value={vehicle.model} />
      <Cell label="Año" value={vehicle.year} />
      <Cell label="Patente" value={vehicle.plate} />
      <Cell label="Color" value={vehicle.color} />
      <Cell label="N.º motor" value={vehicle.engineNumber} />
      <Cell label="N.º chasis" value={vehicle.chassisNumber} />
      <Cell label="N.º serie" value={vehicle.serialNumber} />
      <Cell label="VIN" value={vehicle.vin} />
      <Cell label="Combustible" value={vehicle.fuel} />
      <Cell
        label="Peso bruto"
        value={
          vehicle.grossWeightKg
            ? `${vehicle.grossWeightKg.toLocaleString('es-CL')} kg`
            : ''
        }
      />
    </div>
  );
}

function SalesPower({
  data,
  input,
}: {
  data: ContractDocumentData;
  input: VehicleLegalInput;
}) {
  const vehicle = input.vehicles[0];
  return (
    <section className="vl-page">
      <Header data={data} />
      <h2 className="vl-title">Poder especial</h2>
      <p className="vl-subtitle">
        Venta y transferencia de vehículo motorizado
      </p>
      <p>
        En <strong>{input.issuePlace}</strong>, a{' '}
        <strong>{formatDate(input.issueDate)}</strong>, comparece{' '}
        <strong>{input.declarantName}</strong>, RUT{' '}
        <strong>{input.declarantRut}</strong>, domiciliado(a) en{' '}
        <strong>{input.declarantAddress}</strong>, ciudad de{' '}
        <strong>{input.declarantCity}</strong>, en adelante el mandante.
      </p>
      <p>
        Por este acto confiere poder especial, amplio y suficiente a{' '}
        <strong>{input.representativeName}</strong>, RUT{' '}
        <strong>{input.representativeRut}</strong>, domiciliado(a) en{' '}
        <strong>{input.representativeAddress || '—'}</strong>, ciudad de{' '}
        <strong>{input.representativeCity || '—'}</strong>, para que, actuando
        en su nombre y representación, pueda vender, ceder, transferir y
        autocontratar respecto del vehículo individualizado a continuación.
      </p>
      <h3 className="vl-section-title">Vehículo objeto del mandato</h3>
      {vehicle ? <VehicleGrid vehicle={vehicle} /> : null}
      <div className="vl-clauses">
        <p>
          El mandatario podrá acordar el precio y la forma de pago, suscribir
          contratos de compraventa y demás instrumentos necesarios, otorgar
          recibos y cancelaciones, solicitar y retirar documentos, percibir el
          valor de la operación y realizar las gestiones requeridas ante
          notarías, municipalidades, el Servicio de Registro Civil e
          Identificación y cualquier otra entidad competente.
        </p>
        <p>
          También podrá efectuar aclaraciones y rectificaciones formales que no
          alteren la identidad del vehículo ni la voluntad esencial del
          mandante, y ejecutar todos los actos indispensables para completar la
          transferencia.
        </p>
        <p>
          Este poder tendrá una vigencia de{' '}
          <strong>{input.powerValidityMonths} meses</strong> contados desde su
          otorgamiento, salvo revocación previa comunicada por medios
          verificables.
        </p>
      </div>
      <div className="vl-signatures single">
        <div className="vl-signature">
          <strong>{input.declarantName || 'Mandante'}</strong>
          <span>RUT {input.declarantRut || '—'} · Firma del mandante</span>
        </div>
      </div>
      <footer className="vl-footer">
        Documento preparado por {data.company.displayName}. Revisión notarial
        recomendada antes de su firma y uso.
      </footer>
    </section>
  );
}

function ResponsibilityDeclaration({
  data,
  input,
}: {
  data: ContractDocumentData;
  input: VehicleLegalInput;
}) {
  return (
    <section className="vl-page">
      <Header data={data} />
      <h2 className="vl-title">Declaración de compromiso y responsabilidad</h2>
      <p className="vl-subtitle">Multas e infracciones anteriores a la venta</p>
      <p>
        En <strong>{input.issuePlace}</strong>, a{' '}
        <strong>{formatDate(input.issueDate)}</strong>, comparece{' '}
        <strong>{input.declarantName}</strong>, RUT{' '}
        <strong>{input.declarantRut}</strong>, domiciliado(a) en{' '}
        <strong>{input.declarantAddress}</strong>, ciudad de{' '}
        <strong>{input.declarantCity}</strong>, quien declara asumir la plena
        responsabilidad por las multas, infracciones y demás cargos originados
        con anterioridad a la fecha de venta de los vehículos individualizados a
        continuación.
      </p>
      <div className="vl-vehicle-list">
        {input.vehicles.map((vehicle, index) => (
          <section className="vl-vehicle-card" key={vehicle.id}>
            <div className="vl-vehicle-title">
              <strong>Vehículo {index + 1}</strong>
              <span>Ingreso: {formatDate(vehicle.entryDate)}</span>
            </div>
            <div className="vl-grid compact">
              <Cell label="Marca" value={vehicle.make} />
              <Cell label="Modelo" value={vehicle.model} />
              <Cell label="Año" value={vehicle.year} />
              <Cell label="Patente" value={vehicle.plate} />
              <Cell label="Color" value={vehicle.color} />
              <Cell label="Tipo" value={vehicle.type} />
            </div>
          </section>
        ))}
      </div>
      <div className="vl-clauses">
        <p>
          La persona declarante se obliga a responder por toda sanción,
          penalidad, multa de tránsito o municipal y cualquier otra infracción
          cuyo hecho generador sea anterior a la venta, aunque sea detectada,
          notificada o registrada con posterioridad.
        </p>
        <p>
          Asimismo, se compromete a comparecer ante la autoridad policial,
          judicial o administrativa competente, entregar los antecedentes que
          correspondan y realizar las gestiones necesarias para regularizar
          dichas obligaciones, manteniendo indemne a la parte adquirente y a{' '}
          <strong>{data.company.legalName || data.company.displayName}</strong>.
        </p>
      </div>
      <div className="vl-signatures single declaration">
        <div className="vl-signature">
          <strong>{input.declarantName || 'Parte declarante'}</strong>
          <span>RUT {input.declarantRut || '—'} · Firma</span>
        </div>
      </div>
      <footer className="vl-footer">
        {data.company.legalAddress}
        {data.company.phone ? ` · ${data.company.phone}` : ''}
        {data.company.email ? ` · ${data.company.email}` : ''}
      </footer>
    </section>
  );
}

export function VehicleLegalDocument({ data }: { data: ContractDocumentData }) {
  const input = data.contract.input as VehicleLegalInput;
  return (
    <article className="contract-document vl-document">
      <style>{`
        @page { size: A4; margin: 0; } * { box-sizing: border-box; } body { margin: 0; background: #eef0f5; }
        .vl-document { color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 9.2pt; line-height: 1.48; }
        .vl-page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 15mm 17mm; background: #fff; }
        .vl-head { display: grid; grid-template-columns: 1fr auto; gap: 10mm; border-bottom: 2px solid #7c3aed; padding-bottom: 4mm; }
        .vl-brand { display: flex; align-items: center; gap: 4mm; } .vl-brand img { width: 24mm; height: 17mm; object-fit: contain; }
        .vl-brand h1 { margin: 0; font-size: 16pt; } .vl-brand p { margin: .7mm 0 0; color: #6b7280; font-size: 7.5pt; }
        .vl-meta { min-width: 43mm; text-align: right; } .vl-meta span { display: block; color: #6b7280; font-size: 6.8pt; text-transform: uppercase; }
        .vl-meta strong { display: block; margin: .6mm 0 2mm; font-size: 9.5pt; }
        .vl-title { margin: 8mm 0 1mm; text-align: center; font-size: 17pt; text-transform: uppercase; }
        .vl-subtitle { margin: 0 0 6mm; color: #7c3aed; text-align: center; font-size: 7.5pt; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
        .vl-page > p { margin: 4mm 0; text-align: justify; } .vl-section-title { margin: 5mm 0 2mm; color: #5b21b6; font-size: 10pt; text-transform: uppercase; }
        .vl-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #d7d9e0; border-radius: 3mm; overflow: hidden; }
        .vl-cell { min-height: 10mm; padding: 2mm 2.5mm; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
        .vl-cell span { display: block; color: #6b7280; font-size: 6.3pt; font-weight: 700; text-transform: uppercase; }
        .vl-cell strong { display: block; margin-top: .7mm; font-size: 8pt; overflow-wrap: anywhere; }
        .vl-clauses { margin-top: 5mm; padding: 4mm; border: 1px solid #c4b5fd; border-radius: 3mm; background: #faf8ff; }
        .vl-clauses p { margin: 0 0 3mm; text-align: justify; } .vl-clauses p:last-child { margin-bottom: 0; }
        .vl-signatures { margin-top: 18mm; } .vl-signatures.single { width: 80mm; margin-right: auto; margin-left: auto; }
        .vl-signatures.declaration { margin-top: 14mm; } .vl-signature { border-top: 1px solid #111827; padding-top: 2mm; text-align: center; }
        .vl-signature strong, .vl-signature span { display: block; } .vl-signature span { margin-top: 1mm; color: #6b7280; font-size: 7.5pt; }
        .vl-footer { margin-top: 7mm; padding-top: 2.5mm; border-top: 1px solid #e5e7eb; color: #6b7280; text-align: center; font-size: 7pt; }
        .vl-vehicle-list { display: grid; gap: 3mm; margin: 5mm 0; } .vl-vehicle-card { break-inside: avoid; border: 1px solid #d7d9e0; border-radius: 3mm; overflow: hidden; }
        .vl-vehicle-title { display: flex; justify-content: space-between; padding: 2mm 3mm; background: #f5f3ff; color: #5b21b6; font-size: 8pt; }
        .vl-vehicle-card .vl-grid { border: 0; border-radius: 0; } .vl-grid.compact .vl-cell { min-height: 9mm; }
        @media print { body { background: #fff; } .vl-page { margin: 0; } }
      `}</style>
      {data.contract.templateKey === 'vehicle_sale_power_v1' ? (
        <SalesPower data={data} input={input} />
      ) : (
        <ResponsibilityDeclaration data={data} input={input} />
      )}
    </article>
  );
}
