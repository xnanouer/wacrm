const bridgeSecret = process.env.WHATSAPP_WEB_BRIDGE_SECRET;
if (!bridgeSecret) {
  console.error('worker=missing-bridge-secret');
  process.exit(1);
}

try {
  const response = await fetch('http://whatsapp-worker:3001/health', {
    headers: { 'x-nexora-bridge-secret': bridgeSecret },
  });
  console.log(`worker=${response.status}`);
  if (!response.ok) process.exit(1);
} catch (error) {
  console.error(
    `worker=unreachable ${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
}
