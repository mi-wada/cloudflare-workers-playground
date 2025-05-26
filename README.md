# Cloudflare Workers Playground

A repository for experimenting with [Cloudflare Workers](https://workers.cloudflare.com/) and related services.

## Repository secrets

This section explains how the secrets defined below are generated and their intended usage.

<https://github.com/mi-wada/cloudflare-workers-playground/settings/secrets/actions>

### CLOUDFLARE_ACCOUNT_ID

Copied from the Cloudflare dashboard. Used to access the Cloudflare API, for example during deployment via GitHub Actions.

<https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/>

### CLOUDFLARE_API_TOKEN

Generated in the Cloudflare dashboard. Used to access the Cloudflare API, for example during deployment via GitHub Actions.

<https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/#api-token>
