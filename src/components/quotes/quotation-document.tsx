import {
  calculateQuotationAmounts,
  formatClp,
} from '@/lib/quotes/calculations';
import { QUOTATION_DOCUMENT_CSS } from '@/lib/quotes/document-styles';
import type { QuotationDocumentData } from '@/lib/quotes/types';
import { QuotationShowcaseDocument } from './quotation-showcase-document';

interface QuotationDocumentProps {
  data: QuotationDocumentData;
  includeStyles?: boolean;
}

const NEXORA_LOGO_SRC = '/brand/nexora-transparent-lockup.png';

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === '' || value === null || value === undefined) return null;
  return (
    <div className="quote-field">
      <span className="quote-field-label">{label}:</span>
      <span className="quote-field-value">{value}</span>
    </div>
  );
}

function SectionTitle({
  icon,
  number,
  children,
}: {
  icon: string;
  number: number;
  children: React.ReactNode;
}) {
  return (
    <h2 className="quote-section-title">
      <span className="quote-section-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="quote-section-number">{number}.</span> {children}
    </h2>
  );
}

function Header({
  data,
  compact = false,
}: Pick<QuotationDocumentProps, 'data'> & { compact?: boolean }) {
  const { quotation, settings } = data;
  const companyLogoSrc = settings.logoUrl || settings.accountLogoUrl;
  const brands = (
    <div className="quote-brand-lockup">
      {/* Plain img is required by the standalone PDF/PNG renderer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="quote-nexora-logo"
        src={NEXORA_LOGO_SRC}
        alt="Nexora CRM"
      />
      <span className="quote-brand-divider" aria-hidden="true" />
      <div className="quote-company-brand">
        {companyLogoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={companyLogoSrc} alt={settings.companyDisplayName} />
        ) : (
          <strong>{settings.companyDisplayName}</strong>
        )}
      </div>
    </div>
  );
  if (compact) {
    return (
      <div className="quote-mini-header">
        {brands}
        <span className="quote-mini-number">{quotation.quoteNumber}</span>
      </div>
    );
  }
  return (
    <header className="quote-header">
      <div className="quote-brand">{brands}</div>
      <div className="quote-meta">
        <div className="quote-meta-row">
          <span className="quote-meta-icon">▣</span>
          <div>
            <div className="quote-meta-label">N° Cotización</div>
            <div className="quote-meta-value">{quotation.quoteNumber}</div>
          </div>
        </div>
        <div className="quote-meta-row">
          <span className="quote-meta-icon">▦</span>
          <div>
            <div className="quote-meta-label">Fecha de emisión</div>
            <div className="quote-meta-value">
              {formatDate(quotation.issueDate)}
            </div>
          </div>
        </div>
        <div className="quote-meta-row">
          <span className="quote-meta-icon">◷</span>
          <div>
            <div className="quote-meta-label">Validez de la cotización</div>
            <div className="quote-meta-value">
              {formatDate(quotation.validUntil)}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function QuotationDocument({
  data,
  includeStyles = true,
}: QuotationDocumentProps) {
  if (data.quotation.documentTemplate === 'showcase') {
    return (
      <QuotationShowcaseDocument data={data} includeStyles={includeStyles} />
    );
  }
  const { quotation, settings, installments } = data;
  const amounts = calculateQuotationAmounts(quotation);
  const firstInstallments = installments.slice(0, 6);
  const extraInstallments = installments.slice(6);
  const vehicleName = [
    quotation.vehicleMake,
    quotation.vehicleModel,
    quotation.vehicleVersion,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className="quote-document"
      style={
        {
          '--quote-primary': settings.primaryColor,
          '--quote-accent': settings.accentColor,
        } as React.CSSProperties
      }
    >
      {includeStyles && <style>{QUOTATION_DOCUMENT_CSS}</style>}
      <article className="quote-page">
        <Header data={data} />
        <main className="quote-body">
          <h1 className="quote-title">COTIZACIÓN VEHICULAR</h1>
          <div className="quote-subtitle">Documento referencial</div>

          <div className="quote-client-vehicle">
            <section className="quote-section">
              <SectionTitle icon="C" number={1}>
                Información del cliente
              </SectionTitle>
              <div className="quote-box quote-fields">
                <Field label="Nombre" value={quotation.clientName} />
                {settings.showClientRut && (
                  <Field label="RUT" value={quotation.clientRut} />
                )}
                <Field label="Teléfono" value={quotation.clientPhone} />
                {settings.showClientEmail && (
                  <Field label="Correo" value={quotation.clientEmail} />
                )}
                <Field label="Ciudad / comuna" value={quotation.clientCity} />
              </div>
            </section>
            <div className="quote-photo">
              {quotation.vehicleImageUrl ? (
                // Plain img is required by the standalone PDF/PNG renderer.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={quotation.vehicleImageUrl} alt={vehicleName} />
              ) : (
                <div className="quote-photo-placeholder">
                  Imagen del vehículo
                  <br />
                  no disponible
                </div>
              )}
            </div>
          </div>

          <section className="quote-section">
            <SectionTitle icon="V" number={2}>
              Información del vehículo
            </SectionTitle>
            <div className="quote-box quote-vehicle-grid">
              <div className="quote-fields">
                <Field label="Marca" value={quotation.vehicleMake} />
                <Field label="Modelo" value={quotation.vehicleModel} />
                <Field label="Año" value={quotation.vehicleYear} />
                <Field label="Versión" value={quotation.vehicleVersion} />
                {settings.showVehiclePlate && (
                  <Field label="Patente" value={quotation.vehiclePlate} />
                )}
              </div>
              <div className="quote-fields">
                <Field
                  label="Kilometraje"
                  value={`${new Intl.NumberFormat('es-CL').format(quotation.vehicleMileageKm)} km`}
                />
                <Field label="Color" value={quotation.vehicleColor} />
                <Field label="Combustible" value={quotation.vehicleFuel} />
                <Field
                  label="Transmisión"
                  value={quotation.vehicleTransmission}
                />
                <Field label="Tracción" value={quotation.vehicleDrivetrain} />
              </div>
            </div>
          </section>

          <section className="quote-finance">
            <div className="quote-finance-title">
              <span>$</span>
              <span>3. Resumen financiero</span>
            </div>
            <div className="quote-finance-grid">
              <div className="quote-finance-col">
                <div className="quote-money-row">
                  <span>Precio lista:</span>
                  <strong>{formatClp(amounts.listPrice)}</strong>
                </div>
                <div className="quote-money-row accent">
                  <span>Bono / descuento:</span>
                  <strong>-{formatClp(amounts.discountAmount)}</strong>
                </div>
                <div className="quote-money-total">
                  <span>Precio final:</span>
                  <strong>{formatClp(amounts.finalPrice)}</strong>
                </div>
              </div>
              <div className="quote-finance-col">
                {quotation.purchaseType === 'cash' ? (
                  <>
                    <div className="quote-money-row">
                      <span>Modalidad:</span>
                      <strong>Compra al contado</strong>
                    </div>
                    <div className="quote-money-total">
                      <span>Total:</span>
                      <strong>{formatClp(amounts.finalPrice)}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="quote-money-row">
                      <span>Pie:</span>
                      <strong>{formatClp(amounts.downPayment)}</strong>
                    </div>
                    <div className="quote-money-row">
                      <span>Pie (%):</span>
                      <strong>{amounts.downPaymentPercentage}%</strong>
                    </div>
                    {amounts.financedExpenses > 0 && (
                      <div className="quote-money-row">
                        <span>Gastos financiados:</span>
                        <strong>{formatClp(amounts.financedExpenses)}</strong>
                      </div>
                    )}
                    <div className="quote-money-total">
                      <span>Monto a financiar:</span>
                      <strong>{formatClp(amounts.amountToFinance)}</strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {quotation.purchaseType === 'financed' &&
            firstInstallments.length > 0 && (
              <section className="quote-section">
                <SectionTitle icon="#" number={4}>
                  Opciones de financiamiento
                </SectionTitle>
                <table className="quote-table">
                  <thead>
                    <tr>
                      <th>Plazo</th>
                      <th>Valor cuota mensual</th>
                      <th>Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firstInstallments.map((option) => (
                      <tr key={`${option.termMonths}-${option.sortOrder}`}>
                        <td>{option.termMonths} cuotas</td>
                        <td>{formatClp(option.monthlyPayment)}</td>
                        <td>{option.observation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

          <section className="quote-section">
            <SectionTitle
              icon="E"
              number={quotation.purchaseType === 'financed' ? 5 : 4}
            >
              Información del ejecutivo
            </SectionTitle>
            <div className="quote-box quote-executive">
              <div className="quote-executive-item">
                <span className="quote-executive-icon">E</span>
                <div>
                  <div className="quote-executive-label">Ejecutivo</div>
                  <div className="quote-executive-value">
                    {quotation.executiveName}
                  </div>
                </div>
              </div>
              {settings.showExecutivePhone && (
                <div className="quote-executive-item">
                  <span className="quote-executive-icon">T</span>
                  <div>
                    <div className="quote-executive-label">Teléfono</div>
                    <div className="quote-executive-value">
                      {quotation.executivePhone ||
                        settings.companyPhone ||
                        'No informado'}
                    </div>
                  </div>
                </div>
              )}
              {settings.showExecutiveEmail && (
                <div className="quote-executive-item">
                  <span className="quote-executive-icon">@</span>
                  <div>
                    <div className="quote-executive-label">Correo</div>
                    <div className="quote-executive-value">
                      {quotation.executiveEmail ||
                        settings.companyEmail ||
                        'No informado'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="quote-notes">
            {quotation.documentNotes && (
              <div className="quote-note">
                <strong>Observaciones:</strong> {quotation.documentNotes}
              </div>
            )}
            <div className="quote-note">
              <strong>Importante:</strong>{' '}
              {quotation.termsText || settings.defaultTerms}
            </div>
          </div>
        </main>
        <footer className="quote-footer" />
      </article>

      {extraInstallments.length > 0 && (
        <article className="quote-page">
          <div className="quote-continuation">
            <Header data={data} compact />
            <h2 className="quote-second-page-title">
              Opciones de financiamiento — continuación
            </h2>
            <table className="quote-table">
              <thead>
                <tr>
                  <th>Plazo</th>
                  <th>Valor cuota mensual</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {extraInstallments.map((option) => (
                  <tr key={`${option.termMonths}-${option.sortOrder}`}>
                    <td>{option.termMonths} cuotas</td>
                    <td>{formatClp(option.monthlyPayment)}</td>
                    <td>{option.observation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="quote-notes">
              <div className="quote-note">
                <strong>Importante:</strong>{' '}
                {quotation.termsText || settings.defaultTerms}
              </div>
            </div>
          </div>
          <footer className="quote-footer" />
        </article>
      )}
    </div>
  );
}
