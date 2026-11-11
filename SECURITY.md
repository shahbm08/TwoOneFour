# Security

## Reporting a problem

If you find a security issue in this website, please report it privately
through GitHub: open the **Security** tab of this repository and choose
**Report a vulnerability**. Please don't open a public issue.

## How the site is protected

- **No server to break into.** The site is plain files on S3, served by
  CloudFront. There's no login, admin page, database login or CMS.
- **Private storage.** The S3 bucket isn't public. Only CloudFront can read it,
  and every file version is kept for 30 days so any change can be rolled back.
- **HTTPS everywhere.** TLS 1.2 or later, HSTS, and HTTP redirects to HTTPS.
- **Strict browser rules.** A Content-Security-Policy allows only this site's
  own scripts, styles and fonts, with no third-party code at all. The site
  can't be framed (clickjacking), and camera, microphone and location are
  switched off.
- **Forms.**
  - The form function only answers requests that come through CloudFront,
    which proves itself with a secret header.
  - Input is length-limited and validated.
  - Email headers can't be injected.
  - A hidden honeypot field catches bots.
  - Each visitor can send at most 5 forms an hour.
- **Least privilege.** The function can only send email to the owner, add a
  subscriber and count requests. The deploy role can only update this site.
- **Deploys need approval.** GitHub can only reach AWS from the `production`
  environment, which waits for the owner to approve. There are no AWS keys
  stored in GitHub; it uses short-lived OpenID Connect credentials.
- **Supply chain.**
  - GitHub Actions are pinned to exact commits.
  - Dependabot proposes updates.
  - The tests fail if the site ever loads anything from another domain.
- **Secrets never in git.** The Terraform state and settings are git-ignored.
