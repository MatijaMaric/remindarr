# Telemetry token exposure remediation

`/metrics` is disabled (404) until an operator sets `METRICS_TOKEN`. Configure
the scraper to send `Authorization: Bearer <METRICS_TOKEN>` and restrict scraper
access at the network boundary. Never put the metrics credential in a URL.
Worker does not expose this endpoint. Both runtimes record registered route
templates instead of token-bearing request paths in application telemetry.

Instances running older versions may have retained share and kiosk URLs in
logs and Prometheus labels. After upgrading:

1. Restart the Bun process to discard existing in-memory metric labels and the
   admin log buffer. Upgrade every Worker deployment receiving traffic.
2. Revoke and regenerate watchlist share links (also used by Wrapped) and kiosk
   links that were requested while affected versions were running. Existing
   links are not automatically rotated because rotation invalidates recipients'
   bookmarks. Replace published links and reconfigure kiosk displays.
3. Remove affected historical metrics, logs and exports according to your
   telemetry provider's deletion procedures. Restrict access to backups and
   copies that cannot be removed immediately. Rotation remains necessary even
   after deletion, because a previously copied link still grants access.
4. Review reverse-proxy, CDN and third-party request logging separately: those
   systems can capture raw URLs independently. Redact token path segments and
   query strings there. If calendar feed URLs or other credentials were captured
   by those systems, revoke/regenerate them as well.

Do not paste old tokens into tickets or shared incident reports.
