output "name_servers" {
  description = "Put these four into GoDaddy: Domain settings > Nameservers > I'll use my own nameservers."
  value       = aws_route53_zone.site.name_servers
}

output "github_variables" {
  description = "Add these as repository variables in GitHub (Settings > Secrets and variables > Actions > Variables)."
  value = {
    AWS_DEPLOY_ROLE_ARN = aws_iam_role.deploy.arn
    SITE_BUCKET         = aws_s3_bucket.site.id
    DISTRIBUTION_ID     = aws_cloudfront_distribution.site.id
    FORMS_FUNCTION      = aws_lambda_function.forms.function_name
  }
}

output "cloudfront_domain" {
  description = "Test address that works before the name servers switch."
  value       = aws_cloudfront_distribution.site.domain_name
}
