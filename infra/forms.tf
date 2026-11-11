# The form handler: one Lambda behind CloudFront at /api/*.

resource "random_password" "origin_secret" {
  length  = 40
  special = false
}

# Newsletter sign-ups. On-demand billing: free at this size.
resource "aws_dynamodb_table" "subscribers" {
  name         = "${local.name}-subscribers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"
  attribute {
    name = "email"
    type = "S"
  }
  server_side_encryption { enabled = true }
}

# Per-visitor hourly counters for the form rate limit. Rows expire by themselves.
resource "aws_dynamodb_table" "rate" {
  name         = "${local.name}-form-rate"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"
  attribute {
    name = "id"
    type = "S"
  }
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  server_side_encryption { enabled = true }
}

# Sending email. The domain identity lets the site send as
# website@twoonefour.com.au; DKIM records go into the zone automatically.
resource "aws_sesv2_email_identity" "domain" {
  email_identity = local.domain
}

resource "aws_route53_record" "dkim" {
  count   = 3
  zone_id = aws_route53_zone.site.zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${local.domain}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.site.zone_id
  name    = "_dmarc.${local.domain}"
  type    = "TXT"
  ttl     = 3600
  records = ["v=DMARC1; p=none;"]
}

# While SES is in its sandbox it only delivers to verified addresses, which is
# all this site needs: every message goes to the owner. AWS emails this
# address a link to click once.
resource "aws_sesv2_email_identity" "notify" {
  email_identity = var.notify_email
}

data "archive_file" "forms" {
  type        = "zip"
  source_file = "${path.module}/../api/index.mjs"
  output_path = "${path.module}/.build/forms.zip"
}

resource "aws_iam_role" "forms" {
  name = "${local.name}-forms"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "forms" {
  role = aws_iam_role.forms.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.forms.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = "ses:SendEmail"
        Resource = [aws_sesv2_email_identity.domain.arn, aws_sesv2_email_identity.notify.arn]
      },
      {
        Effect   = "Allow"
        Action   = "dynamodb:PutItem"
        Resource = aws_dynamodb_table.subscribers.arn
      },
      {
        Effect   = "Allow"
        Action   = "dynamodb:UpdateItem"
        Resource = aws_dynamodb_table.rate.arn
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "forms" {
  name              = "/aws/lambda/${local.name}-forms"
  retention_in_days = 30
}

resource "aws_lambda_function" "forms" {
  function_name    = "${local.name}-forms"
  role             = aws_iam_role.forms.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  architectures    = ["arm64"]
  memory_size      = 128
  timeout          = 10
  filename         = data.archive_file.forms.output_path
  source_code_hash = data.archive_file.forms.output_base64sha256

  environment {
    variables = {
      ORIGIN_SECRET     = random_password.origin_secret.result
      FROM_ADDRESS      = "website@${local.domain}"
      NOTIFY_ADDRESS    = var.notify_email
      SUBSCRIBERS_TABLE = aws_dynamodb_table.subscribers.name
      RATE_TABLE        = aws_dynamodb_table.rate.name
      RATE_LIMIT        = "5"
    }
  }

  depends_on = [aws_cloudwatch_log_group.forms, aws_iam_role_policy.forms]
}

# Public URL, but the function refuses any request without CloudFront's secret header.
resource "aws_lambda_function_url" "forms" {
  function_name      = aws_lambda_function.forms.function_name
  authorization_type = "NONE"
}
