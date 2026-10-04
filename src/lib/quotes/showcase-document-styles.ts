export const QUOTATION_SHOWCASE_DOCUMENT_CSS = String.raw`
  .showcase-document, .showcase-document * { box-sizing: border-box; }
  .showcase-document { width: 210mm; margin: 0 auto; color: #07162e; background: #fff; font-family: Inter, Arial, sans-serif; }
  .showcase-filter-definitions { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
  .showcase-page { position: relative; width: 210mm; height: 297mm; min-height: 297mm; overflow: hidden; background: #fff; page-break-after: always; }
  .showcase-page:last-child { page-break-after: auto; }

  .showcase-header { position: relative; height: 50mm; overflow: hidden; color: #fff; background: #04182f; }
  .showcase-header-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 52%; opacity: .42; filter: saturate(.8) contrast(1.14); }
  .showcase-header-shade { position: absolute; inset: 0; background: linear-gradient(101deg,rgba(1,14,31,.99) 0%,rgba(2,29,55,.96) 43%,rgba(3,59,102,.76) 72%,rgba(1,18,38,.94) 100%); }
  .showcase-header::before { content: ''; position: absolute; z-index: 1; left: -22mm; top: -39mm; width: 105mm; height: 69mm; transform: rotate(-33deg); background: linear-gradient(135deg,#1785e9,#0b4b99); opacity: .68; }
  .showcase-header::after { content: ''; position: absolute; z-index: 1; left: 0; right: 0; bottom: 0; height: 1.2mm; background: linear-gradient(90deg,#7048ff,#9f30ef 43%,#1ca8ef); }
  .showcase-header-content { position: relative; z-index: 2; height: 100%; padding: 6mm 7mm 5mm 9mm; display: grid; grid-template-columns: minmax(0,1fr) 59mm; gap: 7mm; align-items: center; }
  .showcase-brands { min-width: 0; display: flex; align-items: center; gap: 5mm; }
  .showcase-nexora-logo { display: block; width: 59mm; max-height: 20mm; object-fit: contain; object-position: left center; }
  .showcase-brand-divider { width: .3mm; height: 25mm; flex: 0 0 auto; background: rgba(255,255,255,.58); }
  .showcase-company { width: 42mm; height: 27mm; overflow: visible; display: grid; place-items: center; }
  .showcase-company img { display: block; width: 100%; max-width: 42mm; max-height: 27mm; object-fit: contain; }
  .showcase-company-logo-knockout { filter: url(#showcase-logo-knockout); }
  .showcase-company strong { color: #fff; font-size: 4.8mm; line-height: 1.02; text-align: center; overflow-wrap: anywhere; text-shadow: 0 1mm 3mm rgba(0,0,0,.32); }
  .showcase-meta { align-self: stretch; display: grid; align-content: center; gap: .7mm; padding: 2.4mm 3.2mm; border: .3mm solid rgba(105,200,255,.58); border-radius: 2.5mm; background: rgba(2,18,38,.76); box-shadow: 0 2mm 7mm rgba(0,0,0,.16); }
  .showcase-meta-row { display: grid; grid-template-columns: 7.3mm 1fr; gap: 2mm; align-items: center; min-height: 7.8mm; border-bottom: .2mm solid rgba(255,255,255,.18); }
  .showcase-meta-row:last-of-type { border-bottom: 0; }
  .showcase-meta-icon { width: 6.1mm; height: 6.1mm; display: grid; place-items: center; border: .28mm solid #fff; border-radius: 1mm; font-size: 2.6mm; font-weight: 900; }
  .showcase-meta-label { color: #bcd5eb; font-size: 2.4mm; line-height: 1; }
  .showcase-meta-value { margin-top: .55mm; color: #fff; font-size: 3.35mm; font-weight: 850; line-height: 1.02; }
  .showcase-generated { margin-top: .4mm; padding-top: 1mm; border-top: .2mm solid rgba(255,255,255,.24); display: flex; align-items: center; justify-content: flex-end; gap: 1.5mm; color: #bdd6ea; font-size: 2.15mm; }
  .showcase-generated img { width: 19mm; max-height: 5mm; object-fit: contain; }

  .showcase-body { position: relative; padding: 3.7mm 5mm 8mm; }
  .showcase-title-wrap { position: relative; height: 14mm; display: flex; align-items: center; justify-content: space-between; gap: 5mm; overflow: hidden; }
  .showcase-title-kicker { margin-bottom: .9mm; color: #5a7694; font-size: 2.2mm; font-weight: 800; letter-spacing: .5mm; text-transform: uppercase; }
  .showcase-title { position: relative; z-index: 1; margin: 0; font-size: 8.5mm; line-height: .88; font-weight: 950; letter-spacing: -.35mm; color: #061126; }
  .showcase-title span { color: #1268da; }
  .showcase-title-vehicle { position: relative; z-index: 1; max-width: 56mm; padding: 2mm 3mm; border: .25mm solid #d3e6f6; border-radius: 2mm; color: #0a488c; background: rgba(239,248,255,.9); font-size: 2.8mm; line-height: 1.18; font-weight: 850; text-align: right; overflow-wrap: anywhere; }
  .showcase-title-stripes { position: absolute; right: 43mm; top: -5mm; display: flex; gap: 2.3mm; transform: skew(-37deg); opacity: .1; }
  .showcase-title-stripes i { display: block; width: 7mm; height: 24mm; background: #1781f2; }

  .showcase-section { margin-top: 2mm; border: .25mm solid #cfe4f5; border-radius: 2.4mm; overflow: hidden; background: linear-gradient(112deg,#f8fcff,#edf7ff); break-inside: avoid; }
  .showcase-section-heading { height: 8mm; display: flex; align-items: center; gap: 2.2mm; padding: 0 2.7mm; color: #0755bd; font-size: 3.65mm; font-weight: 900; text-transform: uppercase; }
  .showcase-section-icon { width: 6.1mm; height: 6.1mm; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; color: #fff; background: linear-gradient(135deg,#0a70da,#074da8); font-size: 2.8mm; font-weight: 900; box-shadow: 0 .7mm 1.8mm rgba(6,91,189,.2); }
  .showcase-client-grid { margin: 0 2.5mm 2.3mm; padding: .7mm 2.6mm; border-radius: 1.7mm; background: rgba(255,255,255,.92); display: grid; grid-template-columns: 1fr 1fr; gap: 0 8mm; }
  .showcase-field { min-width: 0; min-height: 5.6mm; display: grid; grid-template-columns: 5mm 25mm 1fr; gap: 1.6mm; align-items: center; border-bottom: .2mm solid #dbe7f1; font-size: 2.75mm; }
  .showcase-client-grid .showcase-field:nth-last-child(-n+2) { border-bottom: 0; }
  .showcase-field-icon { color: #0758bd; font-size: 2.7mm; font-weight: 950; text-align: center; }
  .showcase-field-label { color: #476889; }
  .showcase-field-value { min-width: 0; color: #0a1a36; font-weight: 820; overflow-wrap: anywhere; }

  .showcase-vehicle { margin-top: 2mm; height: 74mm; display: grid; grid-template-columns: 69mm minmax(0,1fr); gap: 2.5mm; break-inside: avoid; }
  .showcase-vehicle-data { overflow: hidden; border: .25mm solid #cfe4f5; border-radius: 2.4mm; background: linear-gradient(138deg,#f9fcff,#ebf6ff); }
  .showcase-vehicle-fields { margin: 0 2.3mm 2.3mm; padding: .7mm 2.2mm; border-radius: 1.7mm; background: rgba(255,255,255,.94); }
  .showcase-vehicle-fields .showcase-field { grid-template-columns: 4.4mm 24mm 1fr; min-height: 5.35mm; gap: 1.2mm; font-size: 2.65mm; }
  .showcase-vehicle-fields .showcase-field:last-child { border-bottom: 0; }
  .showcase-vehicle-photo { position: relative; height: 74mm; overflow: hidden; border: .25mm solid #bcd8ee; border-radius: 2.4mm; background: #dcebf5; isolation: isolate; }
  .showcase-photo-backdrop { position: absolute; z-index: 0; inset: -4mm; width: calc(100% + 8mm); height: calc(100% + 8mm); object-fit: cover; filter: blur(3mm) brightness(.7) saturate(.78); transform: scale(1.05); }
  .showcase-photo-main { position: relative; z-index: 1; display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
  .showcase-photo-placeholder { height: 100%; display: grid; place-items: center; color: #6e8aa6; font-size: 3.2mm; line-height: 1.4; text-align: center; }
  .showcase-photo-caption { position: absolute; z-index: 2; left: 2.5mm; right: 2.5mm; bottom: 2.5mm; padding: 1.8mm 2.6mm; border: .2mm solid rgba(255,255,255,.22); border-radius: 1.4mm; color: #fff; background: linear-gradient(90deg,rgba(2,22,44,.9),rgba(2,38,70,.72)); font-size: 2.8mm; font-weight: 850; backdrop-filter: blur(1mm); }

  .showcase-finance { margin-top: 2mm; height: 29mm; overflow: hidden; border-radius: 2.4mm; padding: 3mm 3.7mm; color: #fff; background: radial-gradient(circle at 88% 28%,rgba(16,142,241,.5),transparent 33%),linear-gradient(115deg,#03172f,#063762 58%,#07569a); box-shadow: 0 1.2mm 3.3mm rgba(4,40,75,.15); break-inside: avoid; }
  .showcase-finance-title { height: 5.3mm; display: flex; align-items: center; gap: 2mm; font-size: 3.5mm; font-weight: 900; text-transform: uppercase; }
  .showcase-finance-title > span { width: 5.3mm; height: 5.3mm; display: grid; place-items: center; border-radius: 50%; color: #05254a; background: #67d4ff; }
  .showcase-finance-grid { height: 17mm; margin-top: 1.7mm; display: grid; grid-template-columns: .9fr .85fr 1.18fr 1.15fr; align-items: stretch; }
  .showcase-finance-item { min-width: 0; padding: 1mm 3mm; border-right: .2mm solid rgba(255,255,255,.26); display: flex; flex-direction: column; justify-content: center; }
  .showcase-finance-item:first-child { padding-left: 1mm; }
  .showcase-finance-label { color: #cfe4f7; font-size: 2.45mm; }
  .showcase-finance-value { margin-top: 1.3mm; font-size: 4.5mm; line-height: 1; font-weight: 900; white-space: nowrap; }
  .showcase-finance-value.discount { color: #61d7ff; }
  .showcase-finance-item.total { margin: -.2mm 2.2mm; padding: 1.5mm 3mm; border: .4mm solid #37c7ff; border-radius: 1.8mm; background: rgba(2,24,50,.38); box-shadow: inset 0 0 4mm rgba(26,169,255,.18),0 0 3mm rgba(31,173,255,.24); }
  .showcase-finance-item.total .showcase-finance-label { color: #62dcff; font-size: 2.5mm; font-weight: 900; letter-spacing: .2mm; text-transform: uppercase; }
  .showcase-finance-item.total .showcase-finance-value { font-size: 5.1mm; }
  .showcase-payment-summary { min-width: 0; padding-left: 1.5mm; display: grid; grid-template-rows: 1fr 1fr; align-content: center; }
  .showcase-payment-summary > div { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 2mm; padding: .6mm 0; }
  .showcase-payment-summary > div + div { border-top: .2mm solid rgba(255,255,255,.2); }
  .showcase-payment-summary span { color: #cfe4f7; font-size: 2.25mm; white-space: nowrap; }
  .showcase-payment-summary strong { font-size: 3.15mm; line-height: 1; white-space: nowrap; }

  .showcase-installments { margin-top: 2mm; padding: 1.8mm 2.5mm 2.4mm; border: .25mm solid #cfe4f5; border-radius: 2.4mm; background: linear-gradient(112deg,#f8fcff,#edf7ff); break-inside: avoid; }
  .showcase-installments-title { height: 5.8mm; display: flex; align-items: center; gap: 2mm; margin: 0 0 1.2mm; color: #0755bd; font-size: 3.35mm; font-weight: 900; text-transform: uppercase; }
  .showcase-table { width: 100%; overflow: hidden; border-collapse: separate; border-spacing: 0; border: .22mm solid #b9d5eb; border-radius: 1.6mm; background: #fff; font-size: 2.6mm; }
  .showcase-table th { height: 5mm; padding: 1mm 2mm; color: #fff; background: linear-gradient(90deg,#082d53,#0d477c); font-weight: 780; }
  .showcase-table td { height: 5mm; padding: 1mm 2mm; border-top: .18mm solid #d3e1ed; text-align: center; }
  .showcase-table tbody tr:nth-child(even) td { background: #f8fbfe; }
  .showcase-table td:first-child { font-weight: 850; }

  .showcase-bottom { margin-top: 2mm; min-height: 18mm; padding: 2.2mm 3mm; border-top: .28mm solid #aac7df; border-bottom: .2mm solid #d7e4ef; display: grid; grid-template-columns: 1.6fr 1fr; gap: 5mm; break-inside: avoid; }
  .showcase-bottom-title { margin: 0 0 1.3mm; color: #0755bd; font-size: 2.8mm; font-weight: 900; letter-spacing: .15mm; text-transform: uppercase; }
  .showcase-executive-grid { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 3mm; font-size: 2.35mm; }
  .showcase-executive-grid span { display: block; color: #6a8097; }
  .showcase-executive-grid strong { display: block; margin-top: .5mm; color: #0b1e38; overflow-wrap: anywhere; }
  .showcase-observation { font-size: 2.4mm; line-height: 1.3; color: #1c3552; overflow-wrap: anywhere; }
  .showcase-more-note { display: block; margin-top: .7mm; color: #0755bd; font-weight: 750; }
  .showcase-terms { margin: 1.5mm 3mm 0; color: #607387; font-size: 2.05mm; line-height: 1.23; overflow-wrap: anywhere; }
  .showcase-terms strong { color: #354f69; }
  .showcase-footer { position: absolute; left: 0; right: 0; bottom: 0; height: 3mm; background: linear-gradient(90deg,#071b33,#0b70cf,#22b5ef); }

  .showcase-continuation { height: 100%; padding: 10mm 10mm 15mm; }
  .showcase-continuation-head { padding-bottom: 5mm; border-bottom: .6mm solid #0a67c7; display: flex; align-items: center; justify-content: space-between; gap: 8mm; }
  .showcase-continuation-brands { display: flex; align-items: center; gap: 4mm; }
  .showcase-continuation-brands .showcase-nexora-logo { width: 43mm; max-height: 13mm; }
  .showcase-continuation-brands .showcase-brand-divider { height: 12mm; background: #a8bfd3; }
  .showcase-continuation-brands .showcase-company { width: 34mm; height: 14mm; }
  .showcase-continuation-brands .showcase-company img { max-width: 34mm; max-height: 13mm; filter: none; mix-blend-mode: multiply; }
  .showcase-continuation-brands .showcase-company strong { color: #07162e; font-size: 3.4mm; }
  .showcase-continuation-number { padding: 2mm 3mm; border-radius: 1.5mm; color: #fff; background: #0a4f96; font-size: 3.2mm; font-weight: 850; }
  .showcase-continuation h2 { margin: 8mm 0 5mm; color: #0755bd; font-size: 6mm; }
  .showcase-continuation-section { margin-top: 6mm; padding: 5mm; border: .25mm solid #cfdfec; border-radius: 2.3mm; background: #f8fbfe; }
  .showcase-continuation-section h3 { margin: 0 0 3mm; color: #0a579f; font-size: 4mm; }
  .showcase-continuation-section p { margin: 0; color: #304961; font-size: 3mm; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }

  @media screen { .showcase-page { margin-bottom: 8mm; box-shadow: 0 8px 42px rgba(10,38,68,.18); } }
  @media print { .showcase-document, .showcase-page { margin: 0; box-shadow: none; } }
  @page { size: A4 portrait; margin: 0; }
`;
