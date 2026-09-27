function serializedId(value) {
  return typeof value === 'string' && /^[^@\s]+@(c\.us|lid)$/i.test(value)
    ? value
    : null;
}

export function profilePictureLookupIds({ contactId, peerJid, phoneJid }) {
  return [
    ...new Set(
      [phoneJid, contactId, peerJid].map(serializedId).filter(Boolean)
    ),
  ];
}

function isUnavailableProfilePictureError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message === 'r' ||
    /No LID for user|ServerStatusCodeError|profile picture not available/i.test(
      message
    )
  );
}

export async function findVisibleProfilePicture(lookupIds, loadUrl) {
  let transientError = null;

  for (const lookupId of lookupIds) {
    try {
      const rawUrl = await loadUrl(lookupId);
      if (typeof rawUrl === 'string' && /^https:\/\//i.test(rawUrl)) {
        return { status: 'visible', url: rawUrl };
      }
    } catch (error) {
      if (!isUnavailableProfilePictureError(error)) {
        transientError ??= error;
      }
    }
  }

  return transientError
    ? { status: 'transient_error', error: transientError }
    : { status: 'hidden', url: null };
}
