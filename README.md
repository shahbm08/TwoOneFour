# TwoOneFour website

The website for **twoonefour.com.au**, an Australian IT consultancy. It's a
static site with an animated hero, links to the MaisonGambu and Slottrix
ventures, a contact form and a newsletter sign-up. It's hosted on AWS without a
server. See [SECURITY.md](SECURITY.md) for how it is protected.

```
visitor ──► CloudFront (HTTPS, twoonefour.com.au + www)
              ├─ /*      ──► S3 bucket (the files in site/)
              └─ /api/*  ──► Lambda (api/index.mjs)
                               ├─ contact form  ──► email to the owner (SES)
                               ├─ newsletter    ──► DynamoDB list + email notice
                               └─ rate limit    ──► DynamoDB counters (5 an hour)
DNS: Route 53. Registration: GoDaddy (until 15-10-2027).
```

| Folder | What's in it |
| --- | --- |
| `site/` | The website: `index.html`, `privacy.html`, `404.html`, `assets/` |
| `api/` | The form handler and its tests (`npm test`) |
| `infra/` | Terraform that creates everything on AWS |
| `.github/workflows/deploy.yml` | Publishes on every push to `main` |

## Running cost

About **A$15 a year** (incl. GST), almost all of it the Route 53 hosted zone
(US$0.50 a month). S3, CloudFront, Lambda, DynamoDB and SES stay inside AWS's
free allowances at this size. The GoDaddy renewal is separate.

## Editing the site

All the words are in `site/index.html`. Colours are at the top of
`site/assets/site.css`, and the hero animation is in `site/assets/site.js`.
Push to `main`, approve the deployment in GitHub, and the live site updates
about a minute later.

Keep everything in `site/assets/`: the security policy blocks inline scripts and
styles, and anything loaded from another domain. The tests check both.

## First-time setup (once)

You need the AWS CLI signed in to the AWS account that hosts MaisonGambu, and
Terraform 1.6 or later.

1. **Settings.**
   `cp infra/terraform.tfvars.example infra/terraform.tfvars` and fill in the
   email address that should receive enquiries.

2. **Create the DNS zone first.**
   ```
   cd infra
   terraform init
   terraform apply -target=aws_route53_zone.site
   terraform output name_servers
   ```

3. **Keep any email working.** If the domain has email at GoDaddy (or anywhere
   else), copy those MX and TXT records from GoDaddy's DNS page into the new
   Route 53 zone before the next step.

4. **Point GoDaddy at Route 53.** In GoDaddy, open Domain settings, then
   Nameservers, choose "I'll use my own nameservers", and enter the four from
   step 2.

5. **Create everything else.**
   `terraform apply`. It waits for the HTTPS certificate, which can only be
   issued once step 4 has taken effect. That usually takes minutes, but can
   take a few hours.

6. **Confirm the email address.** AWS sends a verification link to the
   enquiry address. Click it, or the forms can't deliver.

7. **Connect GitHub.** Run `terraform output github_variables`. In the GitHub
   repository, open Settings, then Secrets and variables, then Actions, then
   Variables, and add each one.

8. **Require your approval for every deploy.** In GitHub, open Settings, then
   Environments, then New environment, and name it `production`. Tick
   **Required reviewers** and add yourself, and under Deployment branches choose
   `main` only. AWS only trusts jobs running in this environment.

9. **Protect the repository** (Settings):
   - **Branches.** Add a rule for `main` that requires the `test` check to pass
     and blocks force pushes and deletion.
   - **Code security.** Turn on Dependabot alerts and security updates, secret
     scanning and push protection, and private vulnerability reporting.
   - **Your account.** Use two-factor authentication on GitHub, and MFA on the
     AWS root user.

The Terraform state (`infra/terraform.tfstate`) stays on the machine that ran
it. Keep it safe, because it is needed for any later infrastructure change. It
is git-ignored on purpose, since it holds a secret.

## Notes

- **Spam.** The forms have a hidden honeypot field and a limit of 5 sends per
  visitor per hour. The function only answers requests that come through
  CloudFront.
- **Subscribers.** Sign-ups are in the DynamoDB table `twoonefour-subscribers`,
  which you can browse in the AWS console.
- **SES sandbox.** It only delivers to verified addresses. That's fine here,
  because every message goes to the owner. You'd only need production access to
  send newsletters to subscribers.
