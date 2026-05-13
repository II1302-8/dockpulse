"""branded html shell for transactional emails

mail clients drop css variables, css-grid, and modern selectors; this template
sticks to inline styles on tables for outlook + gmail mobile compatibility. all
emails go through `render` so brand styling stays consistent across the
verification, password-reset, invite, and removal flows
"""

import html
from collections.abc import Iterable

BRAND_NAVY = "#0a2540"
BRAND_BLUE = "#0093e9"
BRAND_CYAN = "#00e5ff"
BG_PAGE = "#f4f9ff"
BG_CARD = "#ffffff"
INK = "#0a2540"
INK_MUTED = "rgba(10, 37, 64, 0.6)"
INK_FAINT = "rgba(10, 37, 64, 0.4)"


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
    headline paragraph rendered larger than the body. `cta_url`/`cta_label`
    render the bold gradient button (omit both to skip).
    """
    body_html = "".join(
        f'<p style="margin:0 0 16px;color:{INK_MUTED};line-height:1.55;'
        f'font-size:14px;">{_esc(p)}</p>'
        for p in body_paragraphs
    )

    cta_html = ""
    if cta_url and cta_label:
        cta_html = (
            f'<table role="presentation" cellpadding="0" cellspacing="0" '
            f'border="0" style="margin:24px 0;">'
            f'<tr><td align="center" bgcolor="{BRAND_BLUE}" '
            f'style="border-radius:14px;background-image:linear-gradient('
            f"135deg,{BRAND_BLUE} 0%,{BRAND_CYAN} 100%);"
            f'box-shadow:0 8px 20px rgba(0,147,233,0.25);">'
            f'<a href="{_esc(cta_url)}" target="_blank" rel="noopener" '
            f'style="display:inline-block;padding:14px 28px;color:#ffffff;'
            f"font-weight:800;font-size:11px;letter-spacing:0.18em;"
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

    # legacy <table> layout keeps gmail + outlook happy; CSS vars + flex don't
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

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{BG_PAGE}" style="background:{BG_PAGE};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:{BG_CARD};border-radius:24px;box-shadow:0 16px 48px rgba(10,37,64,0.08);overflow:hidden;">

          <tr>
            <td style="background:linear-gradient(135deg,{BRAND_NAVY} 0%,{BRAND_BLUE} 100%);padding:28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size:11px;font-weight:800;letter-spacing:0.28em;text-transform:uppercase;color:rgba(255,255,255,0.6);">DockPulse</div>
                    <div style="margin-top:4px;font-size:20px;font-weight:900;letter-spacing:-0.01em;color:#ffffff;">{_esc(title)}</div>
                  </td>
                  <td align="right" valign="top">
                    <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,0.12);font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#ffffff;">Marina HUD</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:{INK};font-weight:600;">{_esc(intro)}</p>
              {body_html}
              {cta_html}
              {footnote_html}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid rgba(10,37,64,0.06);">
              <p style="margin:0;color:{INK_FAINT};font-size:11px;line-height:1.5;">
                Sent by DockPulse · <a href="https://dockpulse.xyz" style="color:{BRAND_BLUE};text-decoration:none;">dockpulse.xyz</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
