"""branded html shell for transactional emails

mail clients drop css variables, css-grid, and modern selectors; this template
sticks to inline styles on tables for outlook + gmail mobile compatibility. all
emails go through `render` so brand styling stays consistent across the
verification, password-reset, invite, and removal flows. the look mirrors the
admin panel: white card, subtle borders, navy text, uppercase eyebrows, no
saturated gradient headers
"""

import html
from collections.abc import Iterable

BRAND_NAVY = "#0a2540"
BRAND_BLUE = "#0093e9"
BG_PAGE = "#f4f5f8"
BG_CARD = "#ffffff"
BORDER = "rgba(10,37,64,0.08)"
DIVIDER = "rgba(10,37,64,0.06)"
EYEBROW = "rgba(10,37,64,0.5)"
INK = "#0a2540"
INK_MUTED = "rgba(10,37,64,0.65)"
INK_FAINT = "rgba(10,37,64,0.4)"


def _esc(value: str) -> str:
    return html.escape(value, quote=True)


def render(
    *,
    title: str,
    preheader: str,
    intro: str,
    body_paragraphs: Iterable[str] = (),
    cta_url: str | None = None,
    cta_label: str | None = None,
    footnote: str | None = None,
) -> str:
    """build a full html email body around the brand shell.

    `preheader` is the line gmail/apple mail preview after the subject — keep
    it short and complementary, not a duplicate of the subject. `intro` is the
    headline paragraph rendered slightly larger than the body. `cta_url` and
    `cta_label` render the solid-brand-blue button (omit both to skip).
    """
    body_html = "".join(
        f'<p style="margin:0 0 16px;color:{INK_MUTED};line-height:1.55;'
        f'font-size:14px;">{_esc(p)}</p>'
        for p in body_paragraphs
    )

    cta_html = ""
    if cta_url and cta_label:
        # flat brand-blue, no gradient, matches admin's primary Button variant
        cta_html = (
            f'<table role="presentation" cellpadding="0" cellspacing="0" '
            f'border="0" style="margin:28px 0 8px;">'
            f'<tr><td align="center" bgcolor="{BRAND_BLUE}" '
            f'style="border-radius:12px;">'
            f'<a href="{_esc(cta_url)}" target="_blank" rel="noopener" '
            f'style="display:inline-block;padding:12px 24px;color:#ffffff;'
            f"font-weight:900;font-size:11px;letter-spacing:0.2em;"
            f"text-transform:uppercase;text-decoration:none;font-family:"
            f"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;\">"
            f"{_esc(cta_label)}</a></td></tr></table>"
        )

    footnote_html = ""
    if footnote:
        footnote_html = (
            f'<p style="margin:24px 0 0;color:{INK_FAINT};line-height:1.55;'
            f'font-size:12px;">{_esc(footnote)}</p>'
        )

    # legacy <table> layout keeps gmail + outlook happy; flex/css-vars don't
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <title>{_esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:{BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{INK};">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">{_esc(preheader)}</span>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{BG_PAGE}" style="background:{BG_PAGE};padding:40px 16px;">
    <tr>
      <td align="center">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin:0 0 20px;">
          <tr>
            <td>
              <span style="font-size:11px;font-weight:900;letter-spacing:0.28em;text-transform:uppercase;color:{BRAND_NAVY};">DockPulse</span>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:{BG_CARD};border:1px solid {BORDER};border-radius:16px;overflow:hidden;">

          <tr>
            <td style="padding:32px 32px 8px;">
              <div style="font-size:10px;font-weight:900;letter-spacing:0.28em;text-transform:uppercase;color:{EYEBROW};margin-bottom:8px;">Notification</div>
              <h1 style="margin:0;font-size:24px;font-weight:900;letter-spacing:-0.01em;color:{BRAND_NAVY};line-height:1.2;">{_esc(title)}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 32px;">
              <p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:{INK};font-weight:600;">{_esc(intro)}</p>
              {body_html}
              {cta_html}
              {footnote_html}
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px;border-top:1px solid {DIVIDER};background:rgba(10,37,64,0.02);">
              <p style="margin:0;color:{INK_FAINT};font-size:11px;line-height:1.5;">
                DockPulse · <a href="https://dockpulse.xyz" style="color:{BRAND_BLUE};text-decoration:none;font-weight:700;">dockpulse.xyz</a>
              </p>
            </td>
          </tr>

        </table>

        <p style="max-width:560px;margin:16px auto 0;color:{INK_FAINT};font-size:10px;line-height:1.5;text-align:center;font-weight:600;letter-spacing:0.05em;">
          You're receiving this because of activity on your DockPulse account.
        </p>

      </td>
    </tr>
  </table>
</body>
</html>"""
