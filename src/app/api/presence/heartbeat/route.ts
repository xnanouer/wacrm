import { createClient } from '@/lib/supabase/server';

type HeartbeatBody = {
  status?: unknown;
  sessionId?: unknown;
  currentPath?: unknown;
  deviceType?: unknown;
};

export async function POST(request: Request) {
  let body: HeartbeatBody;

  try {
    body = (await request.json()) as HeartbeatBody;
  } catch {
    return Response.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  const status = body.status;
  const sessionId = body.sessionId;
  const currentPath = body.currentPath;
  const deviceType = body.deviceType;

  if (
    (status !== 'online' && status !== 'away') ||
    typeof sessionId !== 'string' ||
    sessionId.length < 1 ||
    sessionId.length > 100 ||
    typeof currentPath !== 'string' ||
    currentPath.length > 500 ||
    (deviceType !== 'mobile' && deviceType !== 'desktop')
  ) {
    return Response.json(
      { error: 'Datos de presencia inválidos' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const [memberResult, platformResult] = await Promise.all([
      supabase.rpc('touch_presence', { p_status: status }),
      supabase.rpc('touch_platform_presence', {
        p_session_id: sessionId,
        p_current_path: currentPath,
        p_device_type: deviceType,
      }),
    ]);

    if (memberResult.error || platformResult.error) {
      return Response.json(
        { error: 'No se pudo actualizar la presencia' },
        { status: 503 }
      );
    }

    return new Response(null, { status: 204 });
  } catch {
    return Response.json(
      { error: 'Servicio de presencia temporalmente no disponible' },
      { status: 503 }
    );
  }
}
