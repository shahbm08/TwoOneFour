variable "region" {
  description = "Region for the bucket, the form function, the table and email."
  type        = string
  default     = "ap-southeast-2"
}

variable "domain" {
  description = "The site's domain, without www."
  type        = string
  default     = "twoonefour.com.au"
}

variable "notify_email" {
  description = "Where contact-form messages and sign-up notices are sent. AWS emails it a verification link once."
  type        = string
}

variable "github_repo" {
  description = "owner/name of the GitHub repository allowed to deploy, e.g. shahbm08/TwoOneFour."
  type        = string
}

variable "create_github_oidc_provider" {
  description = "Set true only if this AWS account has no GitHub Actions OIDC provider yet. The MaisonGambu deploy already created one."
  type        = bool
  default     = false
}
