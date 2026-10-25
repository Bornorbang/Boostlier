param([string]$ForwardTo = 'http://127.0.0.1:8080/webhooks/stripe')
$ErrorActionPreference = 'Stop'
$boostlierRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$boostlierCli = Join-Path $boostlierRoot 'artifacts/tools/stripe/stripe.exe'
if (!(Test-Path -LiteralPath $boostlierCli)) { throw 'Install the official Stripe CLI in artifacts/tools/stripe, or use stripe listen manually.' }
$boostlierKeyLine = Get-Content -LiteralPath (Join-Path $boostlierRoot 'backend/.env') | Where-Object { $_.StartsWith('STRIPE_SECRET_KEY=') } | Select-Object -First 1
if (!$boostlierKeyLine) { throw 'Configure STRIPE_SECRET_KEY first.' }
$env:STRIPE_API_KEY = $boostlierKeyLine.Substring('STRIPE_SECRET_KEY='.Length)
if (!$env:STRIPE_API_KEY.StartsWith('sk_test_')) { throw 'This helper is only for Stripe test mode.' }
$env:STRIPE_DEVICE_NAME = 'Boostlier-localhost'
$env:STRIPE_NO_AUTO_UPDATE = '1'
& $boostlierCli listen --events 'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired' --forward-to $ForwardTo
