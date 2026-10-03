import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { loadQuotationSettings } from '@/lib/quotes/server';
import {
  isSafeRemoteAssetUrl,
  renderQuotationMessage,
} from '@/lib/quotes/validation';

export async function GET() {
  try {
    const ctx = await requireRole('agent');
    return NextResponse.json({ settings: await loadQuotationSettings(ctx) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
    }
    const prefix = String(body.quotePrefix ?? '')
      .trim()
      .toUpperCase();
    const digits = Number(body.sequenceDigits);
    const validity = Number(body.defaultValidityDays);
    const primaryColor = String(body.primaryColor ?? '');
    const accentColor = String(body.accentColor ?? '');
    const messageTemplate = String(body.messageTemplate ?? '').trim();
    const logoUrl = String(body.logoUrl ?? '').trim();
    if (!/^[A-Z0-9]{1,12}$/.test(prefix)) {
      return NextResponse.json(
        { error: 'El prefijo admite entre 1 y 12 letras o números.' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(digits) || digits < 3 || digits > 10) {
      return NextResponse.json(
        { error: 'La numeración debe usar entre 3 y 10 dígitos.' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(validity) || validity < 1 || validity > 365) {
      return NextResponse.json(
        { error: 'La vigencia debe estar entre 1 y 365 días.' },
        { status: 400 }
      );
    }
    if (
      !/^#[0-9A-Fa-f]{6}$/.test(primaryColor) ||
      !/^#[0-9A-Fa-f]{6}$/.test(accentColor)
    ) {
      return NextResponse.json(
        { error: 'Los colores no son válidos.' },
        { status: 400 }
      );
    }
    if (logoUrl && !isSafeRemoteAssetUrl(logoUrl)) {
      return NextResponse.json(
        { error: 'El logo debe usar una URL HTTPS pública y segura.' },
        { status: 400 }
      );
    }
    const rendered = renderQuotationMessage(messageTemplate, {
      cliente: 'Cliente',
      numero: 'NX-000001',
      vehiculo: 'Vehículo',
      precio: '$0',
      vigencia: '01/01/2027',
      ejecutivo: 'Ejecutivo',
    });
    if (!messageTemplate || rendered.unknownVariables.length) {
      return NextResponse.json(
        {
          error: rendered.unknownVariables.length
            ? `Variables desconocidas: ${rendered.unknownVariables.join(', ')}.`
            : 'El mensaje de WhatsApp es obligatorio.',
        },
        { status: 400 }
      );
    }
    const attachment = body.defaultAttachmentFormat;
    if (!['pdf', 'png', 'both'].includes(String(attachment))) {
      return NextResponse.json(
        { error: 'Formato de adjunto inválido.' },
        { status: 400 }
      );
    }
    const { data, error } = await ctx.supabase
      .from('quotation_settings')
      .update({
        quote_prefix: prefix,
        sequence_digits: digits,
        default_validity_days: validity,
        currency_code: 'CLP',
        company_display_name: String(body.companyDisplayName ?? '').trim(),
        company_rut: String(body.companyRut ?? '').trim() || null,
        company_phone: String(body.companyPhone ?? '').trim() || null,
        company_email: String(body.companyEmail ?? '').trim() || null,
        company_address: String(body.companyAddress ?? '').trim() || null,
        logo_url: logoUrl || null,
        primary_color: primaryColor,
        accent_color: accentColor,
        show_client_rut: Boolean(body.showClientRut),
        show_client_email: Boolean(body.showClientEmail),
        show_vehicle_plate: Boolean(body.showVehiclePlate),
        show_executive_phone: Boolean(body.showExecutivePhone),
        show_executive_email: Boolean(body.showExecutiveEmail),
        default_terms: String(body.defaultTerms ?? '').trim(),
        message_template: messageTemplate,
        default_attachment_format: attachment,
      })
      .eq('account_id', ctx.accountId)
      .select('*')
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: 'No fue posible guardar la configuración.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ settings: await loadQuotationSettings(ctx) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
