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

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, maxLength - 3);
  const lastSpace = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, lastSpace > maxLength * 0.7 ? lastSpace : undefined).trimEnd()}...`;
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
          <img
            className="showcase-company-logo-knockout"
            src={companyLogoSrc}
            alt={data.settings.companyDisplayName}
          />
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
      className={
        variant === 'total'
          ? 'showcase-finance-item total'
          : 'showcase-finance-item'
      }
    >
      <span className="showcase-finance-label">{label}</span>
      <strong
        className={
          variant === 'discount'
            ? 'showcase-finance-value discount'
            : 'showcase-finance-value'
        }
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
  const orderedInstallments = [...installments].sort(
    (left, right) => left.termMonths - right.termMonths
  );
  const visibleInstallments = orderedInstallments.slice(0, 4);
  const extraInstallments = orderedInstallments.slice(4);
  const companyLogoSrc = settings.logoUrl || settings.accountLogoUrl;
  const termsText = quotation.termsText || settings.defaultTerms;
  const documentNotes = quotation.documentNotes || '';
  const needsContinuation =
    extraInstallments.length > 0 ||
    termsText.length > 300 ||
    documentNotes.length > 180;
  const firstPageTerms = needsContinuation
    ? truncateText(termsText, 300)
    : termsText;
  const firstPageNotes = documentNotes
    ? truncateText(documentNotes, 180)
    : 'Sin observaciones adicionales.';
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
      <svg
        className="showcase-filter-definitions"
        width="0"
        height="0"
        aria-hidden="true"
      >
        <filter
          id="showcase-logo-knockout"
          colorInterpolationFilters="sRGB"
          x="-2%"
          y="-8%"
          width="104%"
          height="116%"
        >
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.333 -0.333 -0.333 0 1"
          />
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 0 1 1 1" />
          </feComponentTransfer>
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </svg>
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
            <div>
              <div className="showcase-title-kicker">Propuesta comercial</div>
              <h1 className="showcase-title">
                COTIZACIÓN <span>VEHICULAR</span>
              </h1>
            </div>
            <div className="showcase-title-vehicle">{vehicleName}</div>
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
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="showcase-photo-backdrop"
                    src={quotation.vehicleImageUrl}
                    alt=""
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="showcase-photo-main"
                    src={quotation.vehicleImageUrl}
                    alt={vehicleName}
                  />
                </>
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
                <div className="showcase-payment-summary">
                  <div>
                    <span>Pie {amounts.downPaymentPercentage}%</span>
                    <strong>{formatClp(amounts.downPayment)}</strong>
                  </div>
                  <div>
                    <span>Monto a financiar</span>
                    <strong>{formatClp(amounts.amountToFinance)}</strong>
                  </div>
                </div>
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
                {firstPageNotes}
                {needsContinuation && documentNotes.length > 180 && (
                  <span className="showcase-more-note">
                    Detalle completo en la página siguiente.
                  </span>
                )}
              </div>
            </div>
          </section>
          <div className="showcase-terms">
            <strong>Importante:</strong> {firstPageTerms}
            {needsContinuation && termsText.length > 300 && (
              <span>
                {' '}
                Consulta las condiciones completas en la página siguiente.
              </span>
            )}
          </div>
        </main>
        <footer className="showcase-footer" />
      </article>

      {needsContinuation && (
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
            <h2>Información complementaria</h2>
            {extraInstallments.length > 0 && (
              <section className="showcase-continuation-section">
                <h3>Opciones de financiamiento adicionales</h3>
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
              </section>
            )}
            {documentNotes.length > 180 && (
              <section className="showcase-continuation-section">
                <h3>Observaciones</h3>
                <p>{documentNotes}</p>
              </section>
            )}
            <section className="showcase-continuation-section">
              <h3>Condiciones importantes</h3>
              <p>{termsText}</p>
            </section>
          </div>
          <footer className="showcase-footer" />
        </article>
      )}
    </div>
  );
}
