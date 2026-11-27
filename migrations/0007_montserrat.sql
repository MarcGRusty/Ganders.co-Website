-- Montserrat becomes the default font. Update a saved theme that still uses the old default fonts.
UPDATE settings SET value = json_set(value, '$.fontDisplay', 'Montserrat')
  WHERE key = 'theme' AND json_extract(value, '$.fontDisplay') = 'Bricolage Grotesque';
UPDATE settings SET value = json_set(value, '$.fontBody', 'Montserrat')
  WHERE key = 'theme' AND json_extract(value, '$.fontBody') = 'Schibsted Grotesk';
