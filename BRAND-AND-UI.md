# 115-1 interface refresh

The official logo is the supplied seated 3D sprout turtle. The transparent master is
`public/club-logo.png`; the header, admin workspace, favicon and PWA all use derivatives
of this same logo. The original supplied reference remains in `public/club-mascot.png`.

Built-in imagegen was used for background extraction. Final prompt:
"Remove the background, orbit lines, floating building badge and external shadow.
Preserve the turtle's identity, glossy eyes, seated pose, hands, sprout, lime-green
head, green shell, yellow belly and 3D shading. Deliver a centered full-body cutout
on a genuinely transparent RGBA background, with no matte, text or extra symbols."

`scripts/export-brand-icons.ps1` checks the transparent corner and exports PNG
sizes 32, 48, 180, 192 and 512 without adding a background. Transparent PWA icons
use purpose "any", so the operating system does not crop the character as a maskable icon.

Shared tokens live in `src/styles.css`: warm-white surfaces, olive shell green,
restrained warm yellow, one-pixel dividers, 12px controls, 180ms transitions and
reduced-motion support. Registration, header, leader selection, results, admin
shell, metrics and dashboard widgets are independent presentation components.
Game scoring and Google integration server modules are unchanged.

QA: npm test, typecheck, lint, build and git diff --check; responsive browser flow
at 360, 375, 390, 412 and 430px plus desktop. Browser tests use synthetic fixtures,
including login failure/success, filters, widget preferences, warmup, official play
and idempotent retry after reload. They do not write production Google Sheet data.
Set CLUB_QA_DIR to save optional review screenshots.
