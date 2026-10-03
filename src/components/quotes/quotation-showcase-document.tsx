import {
  calculateQuotationAmounts,
  formatClp,
} from '@/lib/quotes/calculations';
import { QUOTATION_SHOWCASE_DOCUMENT_CSS } from '@/lib/quotes/showcase-document-styles';
import type { QuotationDocumentData } from '@/lib/quotes/types';

interface QuotationShowcaseDocumentProps {
  data: QuotationDocumentData;
  includeStyles?: boolean;
}

const NEXORA_LOGO_SRC = '/brand/nexora-transparent-lockup.png';
const NEXORA_LIGHT_LOGO_SRC = '/brand/nexora-transparent-lockup-light.png';

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function BrandLockup({ data }: { data: QuotationDocumentData }) {
  const companyLogoSrc = data.settings.logoUrl || data.settings.accountLogoUrl;
  return (
    <div className="showcase-brands">
      {/* Plain images are required by the standalone PDF/PNG renderer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="showcase-nexora-logo"
        src={NEXORA_LOGO_SRC}
        alt="Nexora CRM"
      />
      <span className="showcase-brand-divider" aria-hidden="true" />
      <div className="showcase-company">
        {companyLogoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={companyLogoSrc} alt={data.settings.companyDisplayName} />
        ) : (
          <strong>{data.settings.companyDisplayName}</strong>
        )}
      </div>
    </div>
  );
}

function ShowcaseField({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
}) {
  if (value === '' || value === null || value === undefined) return null;
  return (
    <div className="showcase-field">
      <span className="showcase-field-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="showcase-field-label">{label}:</span>
      <span className="showcase-field-value">{value}</span>
    </div>
  );
}

function FinanceValue({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: 'discount' | 'total';
}) {
  return (
    <div
      className={`showcase-finance-item${variant === 'total' ? 'total' : ''}`}
    >
      <span className="showcase-finance-label">{label}</span>
      <strong
        className={`showcase-finance-value${variant === 'discount' ? 'discount' : ''}`}
      >
        {value}
      </strong>
    </div>
  );
}

export function QuotationShowcaseDocument({
  data,
  includeStyles = true,
}: QuotationShowcaseDocumentProps) {
  const { quotation, settings, installments } = data;
  const amounts = calculateQuotationAmounts(quotation);
  const visibleInstallments = installments.slice(0, 4);
  const extraInstallments = installments.slice(4);
  const companyLogoSrc = settings.logoUrl || settings.accountLogoUrl;
  const vehicleName = [
    quotation.vehicleMake,
    quotation.vehicleModel,
    quotation.vehicleVersion,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="quote-document showcase-document">
      {includeStyles && <style>{QUOTATION_SHOWCASE_DOCUMENT_CSS}</style>}
      <article className="showcase-page">
        <header className="showcase-header">
          {quotation.vehicleImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="showcase-header-photo"
              src={quotation.vehicleImageUrl}
              alt=""
            />
          )}
          <div className="showcase-header-shade" />
          <div className="showcase-header-content">
            <BrandLockup data={data} />
            <div className="showcase-meta">
              <div className="showcase-meta-row">
                <span className="showcase-meta-icon">Nº</span>
                <div>
                  <div className="showcase-meta-label">N° Cotización</div>
                  <div className="showcase-meta-value">
                    {quotation.quoteNumber}
                  </div>
                </div>
              </div>
              <div className="showcase-meta-row">
                <span className="showcase-meta-icon">FE</span>
                <div>
                  <div className="showcase-meta-label">Fecha de emisión</div>
                  <div className="showcase-meta-value">
                    {formatDate(quotation.issueDate)}
                  </div>
                </div>
              </div>
              <div className="showcase-meta-row">
                <span className="showcase-meta-icon">VU</span>
                <div>
                  <div className="showcase-meta-label">Validez</div>
                  <div className="showcase-meta-value">
                    {formatDate(quotation.validUntil)}
                  </div>
                </div>
              </div>
              <div className="showcase-generated">
                <span>Generado con</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={NEXORA_LOGO_SRC} alt="Nexora CRM" />
              </div>
            </div>
          </div>
        </header>

        <main className="showcase-body">
          <div className="showcase-title-wrap">
            <h1 className="showcase-title">
              COTIZACIÓN <span>VEHICULAR</span>
            </h1>
            <span className="showcase-title-stripes" aria-hidden="true">
              <i />
              <i />
            </span>
          </div>

          <section className="showcase-section">
            <h2 className="showcase-section-heading">
              <span className="showcase-section-icon">C</span>
              Información del cliente
            </h2>
            <div className="showcase-client-grid">
              <ShowcaseField
                icon="N"
                label="Nombre"
                value={quotation.clientName}
              />
              <ShowcaseField
                icon="T"
                label="Teléfono"
                value={quotation.clientPhone}
              />
              {settings.showClientRut && (
                <ShowcaseField
                  icon="R"
                  label="RUT"
                  value={quotation.clientRut}
                />
              )}
              {settings.showClientEmail && (
                <ShowcaseField
                  icon="@"
                  label="Correo"
                  value={quotation.clientEmail}
                />
              )}
              <ShowcaseField
                icon="U"
                label="Ciudad / comuna"
                value={quotation.clientCity}
              />
            </div>
          </section>

          <section className="showcase-vehicle">
            <div className="showcase-vehicle-data">
              <h2 className="showcase-section-heading">
                <span className="showcase-section-icon">V</span>
                Información del vehículo
              </h2>
              <div className="showcase-vehicle-fields">
                <ShowcaseField
                  icon="M"
                  label="Marca"
                  value={quotation.vehicleMake}
                />
                <ShowcaseField
                  icon="M"
                  label="Modelo"
                  value={quotation.vehicleModel}
                />
                <ShowcaseField
                  icon="A"
                  label="Año"
                  value={quotation.vehicleYear}
                />
                <ShowcaseField
                  icon="V"
                  label="Versión"
                  value={quotation.vehicleVersion}
                />
                <ShowcaseField
                  icon="K"
                  label="Kilometraje"
                  value={`${new Intl.NumberFormat('es-CL').format(quotation.vehicleMileageKm)} km`}
                />
                <ShowcaseField
                  icon="C"
                  label="Color"
                  value={quotation.vehicleColor}
                />
                <ShowcaseField
                  icon="F"
                  label="Combustible"
                  value={quotation.vehicleFuel}
                />
                <ShowcaseField
                  icon="T"
                  label="Transmisión"
                  value={quotation.vehicleTransmission}
                />
                <ShowcaseField
                  icon="X"
                  label="Tracción"
                  value={quotation.vehicleDrivetrain}
                />
                {settings.showVehiclePlate && (
                  <ShowcaseField
                    icon="P"
                    label="Patente"
                    value={quotation.vehiclePlate}
                  />
                )}
              </div>
            </div>
            <div className="showcase-vehicle-photo">
              {quotation.vehicleImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={quotation.vehicleImageUrl} alt={vehicleName} />
              ) : (
                <div className="showcase-photo-placeholder">
                  Selecciona un vehículo del catálogo
                  <br />
                  para incorporar su foto principal
                </div>
              )}
              <div className="showcase-photo-caption">{vehicleName}</div>
            </div>
          </section>

          <section className="showcase-finance">
            <div className="showcase-finance-title">
              <span>$</span>
              Resumen financiero
            </div>
            <div className="showcase-finance-grid">
              <FinanceValue
                label="Precio lista"
                value={formatClp(amounts.listPrice)}
              />
              <FinanceValue
                label="Bono / descuento"
                value={`-${formatClp(amounts.discountAmount)}`}
                variant="discount"
              />
              <FinanceValue
                label="Precio final"
                value={formatClp(amounts.finalPrice)}
                variant="total"
              />
              {quotation.purchaseType === 'financed' ? (
                <FinanceValue
                  label={`Pie ${amounts.downPaymentPercentage}%`}
                  value={formatClp(amounts.downPayment)}
                />
              ) : (
                <FinanceValue label="Modalidad" value="Contado" />
              )}
            </div>
          </section>

          {quotation.purchaseType === 'financed' &&
            visibleInstallments.length > 0 && (
              <section className="showcase-installments">
                <h2 className="showcase-installments-title">
                  <span className="showcase-section-icon">F</span>
                  Opciones de financiamiento
                </h2>
                <table className="showcase-table">
                  <thead>
                    <tr>
                      <th>Plazo</th>
                      <th>Valor cuota (CLP)</th>
                      <th>Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleInstallments.map((option) => (
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

          <section className="showcase-bottom">
            <div>
              <h2 className="showcase-bottom-title">Datos del ejecutivo</h2>
              <div className="showcase-executive-grid">
                <div>
                  <span>Ejecutivo</span>
                  <strong>{quotation.executiveName}</strong>
                </div>
                {settings.showExecutivePhone && (
                  <div>
                    <span>Teléfono</span>
                    <strong>
                      {quotation.executivePhone ||
                        settings.companyPhone ||
                        'No informado'}
                    </strong>
                  </div>
                )}
                {settings.showExecutiveEmail && (
                  <div>
                    <span>Correo</span>
                    <strong>
                      {quotation.executiveEmail ||
                        settings.companyEmail ||
                        'No informado'}
                    </strong>
                  </div>
                )}
              </div>
            </div>
            <div>
              <h2 className="showcase-bottom-title">Observaciones</h2>
              <div className="showcase-observation">
                {quotation.documentNotes || 'Sin observaciones adicionales.'}
              </div>
            </div>
          </section>
          <div className="showcase-terms">
            <strong>Importante:</strong>{' '}
            {quotation.termsText || settings.defaultTerms}
          </div>
        </main>
        <footer className="showcase-footer" />
      </article>

      {extraInstallments.length > 0 && (
        <article className="showcase-page">
          <div className="showcase-continuation">
            <div className="showcase-continuation-head">
              <div className="showcase-continuation-brands">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="showcase-nexora-logo"
                  src={NEXORA_LIGHT_LOGO_SRC}
                  alt="Nexora CRM"
                />
                <span className="showcase-brand-divider" aria-hidden="true" />
                <div className="showcase-company">
                  {companyLogoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={companyLogoSrc}
                      alt={settings.companyDisplayName}
                    />
                  ) : (
                    <strong>{settings.companyDisplayName}</strong>
                  )}
                </div>
              </div>
              <span className="showcase-continuation-number">
                {quotation.quoteNumber}
              </span>
            </div>
            <h2>Opciones de financiamiento — continuación</h2>
            <table className="showcase-table">
              <thead>
                <tr>
                  <th>Plazo</th>
                  <th>Valor cuota (CLP)</th>
                  <th>Observaciones</th>
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
            <div className="showcase-terms">
              <strong>Importante:</strong>{' '}
              {quotation.termsText || settings.defaultTerms}
            </div>
          </div>
          <footer className="showcase-footer" />
        </article>
      )}
    </div>
  );
}
