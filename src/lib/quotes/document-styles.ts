export const QUOTATION_DOCUMENT_CSS = String.raw`
  .quote-document, .quote-document * { box-sizing: border-box; }
  .quote-document { width: 210mm; margin: 0 auto; color: #11142d; background: #fff; }
  .quote-page { position: relative; width: 210mm; min-height: 297mm; overflow: hidden; background: #fff; page-break-after: always; }
  .quote-page:last-child { page-break-after: auto; }
  .quote-header { min-height: 47mm; padding: 12mm 11mm 9mm; display: grid; grid-template-columns: minmax(0,1fr) 64mm; gap: 6mm; align-items: center; background: radial-gradient(circle at 14% 30%, rgba(109,40,217,.24), transparent 28%), linear-gradient(135deg,#07091d 0%,#0b0c27 56%,#08091b 100%); color: #fff; border-bottom: 1.5mm solid var(--quote-primary); }
  .quote-brand { display: flex; align-items: center; min-width: 0; }
  .quote-brand-lockup { display: flex; align-items: center; gap: 4mm; min-width: 0; max-width: 100%; }
  .quote-brand-lockup img { display: block; object-fit: contain; }
  .quote-nexora-logo { width: 72mm; max-height: 22mm; object-position: left center; flex: 0 1 auto; }
  .quote-brand-divider { width: .3mm; height: 20mm; flex: 0 0 auto; background: rgba(255,255,255,.35); }
  .quote-company-brand { display: flex; align-items: center; min-width: 0; max-width: 32mm; min-height: 20mm; }
  .quote-company-brand img { max-width: 32mm; max-height: 19mm; object-position: left center; filter: grayscale(1) invert(1) contrast(1.8) brightness(1.35); mix-blend-mode: screen; }
  .quote-company-brand strong { color: #fff; font-size: 4.8mm; line-height: 1.08; font-weight: 800; overflow-wrap: anywhere; }
  .quote-meta { border-left: .3mm solid rgba(139,92,246,.55); padding-left: 8mm; display: grid; gap: 4mm; }
  .quote-meta-row { display: grid; grid-template-columns: 7mm 1fr; gap: 3mm; align-items: start; }
  .quote-meta-icon { color: var(--quote-accent); font-size: 5mm; line-height: 1; }
  .quote-meta-label { color: #c7c9da; font-size: 3.1mm; line-height: 1.2; }
  .quote-meta-value { margin-top: .8mm; color: #fff; font-size: 4mm; font-weight: 750; line-height: 1.15; }
  .quote-body { padding: 8mm 10.5mm 7mm; }
  .quote-title { margin: 0; font-size: 7.2mm; line-height: 1; letter-spacing: -.12mm; font-weight: 850; color: #0a0c25; }
  .quote-subtitle { margin-top: 2mm; color: var(--quote-primary); font-size: 3.8mm; }
  .quote-client-vehicle { margin-top: 7mm; display: grid; grid-template-columns: 1fr 90mm; gap: 8mm; align-items: stretch; }
  .quote-section { margin-top: 5.5mm; break-inside: avoid; }
  .quote-client-vehicle .quote-section { margin-top: 0; }
  .quote-section-title { display: flex; align-items: center; gap: 2.5mm; margin: 0 0 2.5mm; color: var(--quote-primary); font-size: 3.7mm; font-weight: 850; letter-spacing: .02mm; text-transform: uppercase; }
  .quote-section-number { font-weight: 900; }
  .quote-section-icon { width: 6mm; height: 6mm; display: inline-grid; place-items: center; border: .35mm solid var(--quote-primary); border-radius: 2mm; font-size: 3.2mm; }
  .quote-box { border: .3mm solid #d8d9e6; border-radius: 2.3mm; padding: 3.1mm 4.5mm; background: #fff; }
  .quote-fields { display: grid; gap: 0; }
  .quote-field { display: grid; grid-template-columns: 34mm 1fr; gap: 3mm; padding: 1.7mm 0; border-bottom: .25mm solid #dcdeea; font-size: 3.35mm; line-height: 1.2; }
  .quote-field:last-child { border-bottom: 0; }
  .quote-field-label { font-weight: 800; color: #131633; }
  .quote-field-value { color: #232748; overflow-wrap: anywhere; }
  .quote-photo { min-height: 48mm; height: 100%; border: .3mm solid #d8d9e6; border-radius: 2.5mm; display: grid; place-items: center; overflow: hidden; background: linear-gradient(145deg,#f9f9fc,#eef0f6); }
  .quote-photo img { width: 100%; height: 100%; object-fit: contain; }
  .quote-photo-placeholder { color: #9094aa; text-align: center; font-size: 3.3mm; }
  .quote-vehicle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10mm; }
  .quote-vehicle-grid .quote-field { grid-template-columns: 34mm 1fr; }
  .quote-finance { margin-top: 5.5mm; padding: 5mm 5.5mm; border-radius: 2.4mm; background: radial-gradient(circle at 18% 45%,rgba(109,40,217,.18),transparent 35%),linear-gradient(135deg,#080920,#0b0b2c); color: #fff; break-inside: avoid; }
  .quote-finance-title { display: flex; align-items: center; gap: 3mm; font-size: 3.8mm; font-weight: 850; text-transform: uppercase; }
  .quote-finance-title span:first-child { width: 7mm; height: 7mm; display: grid; place-items: center; border-radius: 50%; border: .35mm solid var(--quote-accent); color: #fff; box-shadow: 0 0 4mm rgba(139,92,246,.75); }
  .quote-finance-grid { margin-top: 4mm; display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .quote-finance-col { padding-right: 7mm; }
  .quote-finance-col + .quote-finance-col { padding: 0 0 0 7mm; border-left: .3mm solid var(--quote-primary); }
  .quote-money-row { display: flex; justify-content: space-between; gap: 5mm; padding: 1.35mm 0; font-size: 3.45mm; }
  .quote-money-row strong { font-weight: 760; white-space: nowrap; }
  .quote-money-row.accent strong { color: var(--quote-accent); }
  .quote-money-total { margin-top: 2mm; padding-top: 2.5mm; border-top: .3mm solid var(--quote-primary); display: flex; justify-content: space-between; align-items: baseline; gap: 5mm; }
  .quote-money-total span { font-size: 4mm; font-weight: 800; }
  .quote-money-total strong { color: #fff; font-size: 6.4mm; line-height: 1; text-shadow: 0 0 4mm rgba(139,92,246,.8); white-space: nowrap; }
  .quote-table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; border: .3mm solid #d5d7e4; border-radius: 2.4mm; font-size: 3.25mm; }
  .quote-table th { padding: 2.2mm 3mm; background: linear-gradient(90deg,#1b0756,#140542); color: #fff; text-align: center; font-weight: 760; }
  .quote-table td { padding: 2.1mm 3mm; border-top: .25mm solid #d8dae6; border-right: .25mm solid #d8dae6; text-align: center; }
  .quote-table td:last-child, .quote-table th:last-child { border-right: 0; }
  .quote-table td:first-child { font-weight: 750; }
  .quote-executive { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; align-items: center; padding: 3.5mm 5mm; }
  .quote-executive-item { display: grid; grid-template-columns: 8mm 1fr; gap: 2.2mm; align-items: center; min-width: 0; padding: 0 5mm; border-right: .25mm solid #d9dbe7; }
  .quote-executive-item:first-child { padding-left: 0; }
  .quote-executive-item:last-child { border-right: 0; padding-right: 0; }
  .quote-executive-icon { color: var(--quote-primary); font-size: 5mm; }
  .quote-executive-label { font-size: 2.8mm; font-weight: 800; color: #242743; }
  .quote-executive-value { margin-top: .4mm; font-size: 3.2mm; color: #202441; overflow-wrap: anywhere; }
  .quote-notes { margin-top: 4mm; display: grid; gap: 2.5mm; }
  .quote-note { border: .3mm solid #d9d7ee; border-radius: 2mm; padding: 3mm 4mm; background: linear-gradient(90deg,#fbfaff,#f7f3ff); font-size: 2.85mm; line-height: 1.35; color: #282c49; }
  .quote-note strong { color: var(--quote-primary); }
  .quote-footer { position: absolute; left: 0; right: 0; bottom: 0; height: 4.2mm; background: linear-gradient(90deg,#6122db,#7c3aed,#5321cc); }
  .quote-second-page-title { margin: 8mm 0 5mm; font-size: 6mm; font-weight: 850; }
  .quote-continuation { padding: 12mm 11mm 10mm; }
  .quote-mini-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:5mm; border-bottom:.5mm solid var(--quote-primary); }
  .quote-mini-header .quote-brand-lockup { gap: 3mm; }
  .quote-mini-header .quote-nexora-logo { width: 35mm; max-height: 11mm; }
  .quote-mini-header .quote-brand-divider { height: 11mm; background: #d5d7e4; }
  .quote-mini-header .quote-company-brand { max-width: 42mm; min-height: 11mm; }
  .quote-mini-header .quote-company-brand img { max-width: 42mm; max-height: 11mm; filter: none; mix-blend-mode: multiply; }
  .quote-mini-header .quote-company-brand strong { color: #11142d; font-size: 3.8mm; }
  .quote-mini-number { font-size:3.8mm; font-weight:800; }
  @media screen {
    .quote-page { box-shadow: 0 8px 42px rgba(10,12,38,.16); margin-bottom: 8mm; }
  }
  @media print {
    .quote-document, .quote-page { margin: 0; box-shadow: none; }
  }
  @page { size: A4 portrait; margin: 0; }
`;
