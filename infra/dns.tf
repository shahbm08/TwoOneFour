# DNS lives in Route 53; the registration stays at GoDaddy until it is moved.
# After the first apply, put these four name servers into GoDaddy.
resource "aws_route53_zone" "site" {
  name    = local.domain
  comment = "TwoOneFour website"
}

# Certificate for the apex and www, validated through the zone above. Validation
# only completes once GoDaddy points at the Route 53 name servers.
resource "aws_acm_certificate" "site" {
  provider                  = aws.us_east_1
  domain_name               = local.domain
  subject_alternative_names = [local.www]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for o in aws_acm_certificate.site.domain_validation_options : o.domain_name => {
      name   = o.resource_record_name
      type   = o.resource_record_type
      record = o.resource_record_value
    }
  }
  zone_id         = aws_route53_zone.site.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# Apex and www both point at CloudFront; a CloudFront function redirects www.
resource "aws_route53_record" "alias" {
  for_each = { for pair in setproduct(local.aliases, ["A", "AAAA"]) : "${pair[0]}-${pair[1]}" => pair }

  zone_id = aws_route53_zone.site.zone_id
  name    = each.value[0]
  type    = each.value[1]
  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
