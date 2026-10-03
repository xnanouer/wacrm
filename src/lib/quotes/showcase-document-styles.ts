export const QUOTATION_SHOWCASE_DOCUMENT_CSS = String.raw`
  .showcase-document, .showcase-document * { box-sizing: border-box; }
  .showcase-document { width: 210mm; margin: 0 auto; color: #07162e; background: #fff; font-family: Inter, Arial, sans-serif; }
  .showcase-page { position: relative; width: 210mm; min-height: 297mm; overflow: hidden; background: #fff; page-break-after: always; }
  .showcase-page:last-child { page-break-after: auto; }
  .showcase-header { position: relative; height: 55mm; overflow: hidden; color: #fff; background: #06182f; }
  .showcase-header-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 48%; opacity: .38; filter: saturate(.75) contrast(1.1); }
  .showcase-header-shade { position: absolute; inset: 0; background: linear-gradient(98deg,rgba(2,17,36,.98) 0%,rgba(3,34,64,.94) 42%,rgba(0,59,110,.72) 72%,rgba(1,16,36,.9) 100%); }
  .showcase-header::after { content: ''; position: absolute; left: -18mm; top: -39mm; width: 96mm; height: 68mm; transform: rotate(-33deg); background: linear-gradient(135deg,#0c78dc,#0d3f83); opacity: .72; }
  .showcase-header-content { position: relative; z-index: 2; height: 100%; padding: 7mm 7mm 5.5mm 10mm; display: grid; grid-template-columns: minmax(0,1fr) 59mm; gap: 7mm; align-items: center; }
  .showcase-brands { min-width: 0; display: flex; align-items: center; gap: 5mm; }
  .showcase-nexora-logo { display: block; width: 62mm; max-height: 22mm; object-fit: contain; object-position: left center; }
  .showcase-brand-divider { width: .35mm; height: 27mm; flex: 0 0 auto; background: rgba(255,255,255,.56); }
  .showcase-company { width: 43mm; height: 29mm; overflow: hidden; display: grid; place-items: center; }
  .showcase-company img { display: block; width: 100%; max-width: 43mm; max-height: 27mm; object-fit: contain; transform: scale(1.13); filter: grayscale(1) invert(1) contrast(2) brightness(1.4); mix-blend-mode: screen; }
  .showcase-company strong { color: #fff; font-size: 5.2mm; line-height: 1.03; text-align: center; overflow-wrap: anywhere; }
  .showcase-meta { align-self: stretch; display: grid; align-content: center; gap: 1.2mm; padding: 3mm 3.5mm; border: .35mm solid rgba(116,202,255,.5); border-radius: 2.5mm; background: rgba(2,19,39,.72); backdrop-filter: blur(1mm); }
  .showcase-meta-row { display: grid; grid-template-columns: 8mm 1fr; gap: 2.5mm; align-items: center; min-height: 9mm; border-bottom: .25mm solid rgba(255,255,255,.18); }
  .showcase-meta-row:last-of-type { border-bottom: 0; }
  .showcase-meta-icon { width: 6.5mm; height: 6.5mm; display: grid; place-items: center; border: .3mm solid #fff; border-radius: 1.2mm; font-size: 3mm; font-weight: 900; }
  .showcase-meta-label { color: #d6e9fb; font-size: 2.7mm; line-height: 1.05; }
  .showcase-meta-value { margin-top: .7mm; color: #fff; font-size: 3.65mm; font-weight: 850; line-height: 1.05; }
  .showcase-generated { margin-top: 1mm; padding-top: 1.5mm; border-top: .25mm solid rgba(255,255,255,.24); display: flex; align-items: center; justify-content: flex-end; gap: 2mm; color: #c8dff3; font-size: 2.5mm; }
  .showcase-generated img { width: 21mm; max-height: 6mm; object-fit: contain; }
  .showcase-body { position: relative; padding: 5mm 5mm 10mm; }
  .showcase-title-wrap { position: relative; min-height: 16mm; display: flex; align-items: center; overflow: hidden; }
  .showcase-title { position: relative; z-index: 1; margin: 0; font-size: 9.3mm; line-height: 1; font-weight: 950; letter-spacing: -.35mm; color: #061126; }
  .showcase-title span { color: #1268da; }
  .showcase-title-stripes { position: absolute; right: 10mm; top: -3mm; display: flex; gap: 2.3mm; transform: skew(-37deg); opacity: .16; }
  .showcase-title-stripes i { display: block; width: 7mm; height: 22mm; background: #1781f2; }
  .showcase-section { margin-top: 2.5mm; border: .25mm solid #d6eafa; border-radius: 2.3mm; overflow: hidden; background: linear-gradient(115deg,#f8fcff,#eef8ff); break-inside: avoid; }
  .showcase-section-heading { height: 9mm; display: flex; align-items: center; gap: 2.5mm; padding: 0 3mm; color: #0755bd; font-size: 4.1mm; font-weight: 900; text-transform: uppercase; }
  .showcase-section-icon { width: 6.7mm; height: 6.7mm; display: grid; place-items: center; border-radius: 50%; color: #fff; background: #0b60cb; font-size: 3.1mm; font-weight: 900; }
  .showcase-client-grid { margin: 0 2.5mm 2.5mm; padding: 1.2mm 3mm; border-radius: 2mm; background: rgba(255,255,255,.88); display: grid; grid-template-columns: 1fr 1fr; gap: 0 8mm; }
  .showcase-field { min-width: 0; min-height: 6.2mm; display: grid; grid-template-columns: 5.5mm 27mm 1fr; gap: 2mm; align-items: center; border-bottom: .2mm solid #dbe7f1; font-size: 3mm; }
  .showcase-field:nth-last-child(-n+2) { border-bottom: 0; }
  .showcase-field-icon { color: #0758bd; font-size: 3mm; font-weight: 900; text-align: center; }
  .showcase-field-label { color: #365982; }
  .showcase-field-value { min-width: 0; color: #0a1a36; font-weight: 800; overflow-wrap: anywhere; }
  .showcase-vehicle { margin-top: 2.5mm; display: grid; grid-template-columns: 74mm 1fr; gap: 2.5mm; min-height: 72mm; break-inside: avoid; }
  .showcase-vehicle-data { border: .25mm solid #d6eafa; border-radius: 2.3mm; overflow: hidden; background: linear-gradient(135deg,#f9fcff,#edf7ff); }
  .showcase-vehicle-fields { margin: 0 2.5mm 2.5mm; padding: 1mm 2.5mm; border-radius: 2mm; background: rgba(255,255,255,.88); }
  .showcase-vehicle-fields .showcase-field { grid-template-columns: 5mm 26mm 1fr; min-height: 5.6mm; }
  .showcase-vehicle-fields .showcase-field:nth-last-child(-n+2) { border-bottom: .2mm solid #dbe7f1; }
  .showcase-vehicle-fields .showcase-field:last-child { border-bottom: 0; }
  .showcase-vehicle-photo { position: relative; min-height: 72mm; overflow: hidden; border: .25mm solid #c4dff5; border-radius: 2.3mm; background: #eaf4fb; }
  .showcase-vehicle-photo img { width: 100%; height: 100%; object-fit: cover; object-position: center; }
  .showcase-photo-placeholder { height: 100%; display: grid; place-items: center; color: #6e8aa6; font-size: 3.5mm; text-align: center; }
  .showcase-photo-caption { position: absolute; left: 3mm; right: 3mm; bottom: 3mm; padding: 2mm 3mm; border-radius: 1.5mm; color: #fff; background: rgba(2,22,44,.74); font-size: 3mm; font-weight: 800; backdrop-filter: blur(1mm); }
  .showcase-finance { margin-top: 2.5mm; overflow: hidden; border-radius: 2.3mm; padding: 3.5mm 4mm; color: #fff; background: radial-gradient(circle at 88% 30%,rgba(12,128,231,.45),transparent 34%),linear-gradient(115deg,#031a35,#073968 58%,#074c88); break-inside: avoid; }
  .showcase-finance-title { display: flex; align-items: center; gap: 2.5mm; font-size: 4mm; font-weight: 900; text-transform: uppercase; }
  .showcase-finance-grid { margin-top: 3mm; display: grid; grid-template-columns: 1fr .9fr 1.35fr .95fr; align-items: stretch; }
  .showcase-finance-item { min-width: 0; padding: 1mm 4mm; border-right: .25mm solid rgba(255,255,255,.3); display: flex; flex-direction: column; justify-content: center; }
  .showcase-finance-item:first-child { padding-left: 1mm; }
  .showcase-finance-item:last-child { padding-right: 1mm; border-right: 0; }
  .showcase-finance-label { color: #d8e9f8; font-size: 2.8mm; }
  .showcase-finance-value { margin-top: 1mm; font-size: 5mm; line-height: 1; font-weight: 900; white-space: nowrap; }
  .showcase-finance-value.discount { color: #5ed6ff; }
  .showcase-finance-item.total { margin: -1mm 3mm; padding: 2mm 4mm; border: .45mm solid #28b9ff; border-radius: 2mm; box-shadow: inset 0 0 5mm rgba(26,169,255,.18),0 0 4mm rgba(31,173,255,.3); }
  .showcase-finance-item.total .showcase-finance-label { color: #59d8ff; font-weight: 900; text-transform: uppercase; }
  .showcase-finance-item.total .showcase-finance-value { font-size: 5.3mm; }
  .showcase-installments { margin-top: 2.5mm; padding: 2mm 2.5mm 2.5mm; border: .25mm solid #d6eafa; border-radius: 2.3mm; background: linear-gradient(115deg,#f8fcff,#eef8ff); break-inside: avoid; }
  .showcase-installments-title { display: flex; align-items: center; gap: 2mm; margin: 0 0 1.5mm; color: #0755bd; font-size: 3.8mm; font-weight: 900; text-transform: uppercase; }
  .showcase-table { width: 100%; overflow: hidden; border-collapse: separate; border-spacing: 0; border: .25mm solid #b9d5eb; border-radius: 1.7mm; background: #fff; font-size: 2.9mm; }
  .showcase-table th { padding: 1.5mm 2mm; color: #fff; background: #0b3159; font-weight: 750; }
  .showcase-table td { padding: 1.5mm 2mm; border-top: .2mm solid #d3e1ed; text-align: center; }
  .showcase-table td:first-child { font-weight: 850; }
  .showcase-bottom { margin-top: 2.5mm; padding: 2.5mm 3mm; border-top: .3mm solid #aac7df; display: grid; grid-template-columns: 1.55fr 1fr; gap: 5mm; break-inside: avoid; }
  .showcase-bottom-title { margin: 0 0 1.4mm; color: #0755bd; font-size: 3mm; font-weight: 900; text-transform: uppercase; }
  .showcase-executive-grid { display: grid; grid-template-columns: 1fr 1fr 1.25fr; gap: 3mm; font-size: 2.7mm; }
  .showcase-executive-grid span { display: block; color: #5a718b; }
  .showcase-executive-grid strong { display: block; margin-top: .5mm; color: #0b1e38; overflow-wrap: anywhere; }
  .showcase-observation { font-size: 2.7mm; line-height: 1.3; color: #1c3552; overflow-wrap: anywhere; }
  .showcase-terms { margin: 1.7mm 3mm 0; padding-top: 1.5mm; border-top: .2mm solid #d4e1eb; color: #607387; font-size: 2.25mm; line-height: 1.25; }
  .showcase-footer { position: absolute; left: 0; right: 0; bottom: 0; height: 3mm; background: linear-gradient(90deg,#071b33,#0b70cf,#22b5ef); }
  .showcase-continuation { padding: 12mm 10mm 15mm; }
  .showcase-continuation-head { padding-bottom: 5mm; border-bottom: .6mm solid #0a67c7; display: flex; align-items: center; justify-content: space-between; gap: 8mm; }
  .showcase-continuation-brands { display: flex; align-items: center; gap: 4mm; }
  .showcase-continuation-brands .showcase-nexora-logo { width: 43mm; max-height: 13mm; }
  .showcase-continuation-brands .showcase-brand-divider { height: 12mm; background: #a8bfd3; }
  .showcase-continuation-brands .showcase-company { width: 34mm; height: 14mm; }
  .showcase-continuation-brands .showcase-company img { max-width: 34mm; max-height: 13mm; filter: none; mix-blend-mode: multiply; }
  .showcase-continuation-brands .showcase-company strong { color: #07162e; font-size: 3.4mm; }
  .showcase-continuation-number { font-size: 3.5mm; font-weight: 850; }
  .showcase-continuation h2 { margin: 9mm 0 5mm; color: #0755bd; font-size: 6mm; }
  @media screen { .showcase-page { margin-bottom: 8mm; box-shadow: 0 8px 42px rgba(10,38,68,.18); } }
  @media print { .showcase-document, .showcase-page { margin: 0; box-shadow: none; } }
  @page { size: A4 portrait; margin: 0; }
`;
