# TwoOneFour website: a static site on S3 + CloudFront, with one small Lambda
# for the contact and newsletter forms. No servers. See README.md for the steps.

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.70" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # State stays on the machine that runs Terraform (see README). It holds the
  # origin secret, so it is never committed.
}

provider "aws" {
  region = var.region
  default_tags { tags = { Project = "twoonefour" } }
}

# CloudFront only accepts certificates from us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags { tags = { Project = "twoonefour" } }
}

locals {
  name    = "twoonefour"
  domain  = var.domain
  www     = "www.${var.domain}"
  aliases = [var.domain, "www.${var.domain}"]
}

data "aws_caller_identity" "me" {}
