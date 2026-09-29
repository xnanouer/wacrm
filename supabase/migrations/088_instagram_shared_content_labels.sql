-- Replace the internal Meta attachment tokens stored before Nexora learned
-- how to render shared Instagram content. The permalink remains untouched.
UPDATE public.messages
SET content_text = CASE content_text
  WHEN '[ig_reel]' THEN 'Reel de Instagram'
  WHEN '[ig_post]' THEN 'Publicación de Instagram'
  WHEN '[story_mention]' THEN 'Historia de Instagram'
  ELSE content_text
END
WHERE content_type = 'text'
  AND content_text IN ('[ig_reel]', '[ig_post]', '[story_mention]')
  AND media_url ~ '^https://([^.]+\.)*instagram\.com/';

UPDATE public.conversations
SET last_message_text = CASE last_message_text
  WHEN '[ig_reel]' THEN 'Reel de Instagram'
  WHEN '[ig_post]' THEN 'Publicación de Instagram'
  WHEN '[story_mention]' THEN 'Historia de Instagram'
  ELSE last_message_text
END
WHERE last_message_text IN ('[ig_reel]', '[ig_post]', '[story_mention]');
