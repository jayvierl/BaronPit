# Profile photo scanner contract

The app sends an original upload and its normalized WebP to one operator-configured private processor. The operator supplies the processor endpoint, whose implementation may call contracted image safety services. The app has no bundled known-abuse reference database. The SHA-256 digests in the transport identify the exact bytes covered by a decision.

## Before enabling uploads

1. Configure a private HTTPS endpoint in `PROFILE_PHOTO_SCANNER_URL` and a shared random secret of at least 32 characters in `PROFILE_PHOTO_SCANNER_SECRET`. Keep the secret in the web server and processor environments. Use an endpoint without URL credentials or query parameters.
2. Configure two distinct trained responders in both `ADMIN_EMAILS` and `SAFETY_OWNER_EMAILS`. Test the restricted-evidence and notification procedure with benign fixtures. Confirm the processor’s custody, access, deletion and reporting responsibilities before it receives player files.
3. Exercise material rejection, borderline review, restricted referral, timeout, invalid signature and clean acceptance in staging. Set `PROFILE_PHOTO_SAFETY_READY=true` only when the processor performs all the checks below on both representations. Unset this flag to pause new screening.

## Authenticated exchange

The app posts JSON containing `id` (the staged asset UUID), `originalHash`, `contentHash`, `original` (base64 input bytes), `image` (base64 normalized WebP bytes), and `timestamp` (integer Unix seconds). The original is limited to 1 MiB and the normalized representation to 128 KiB. The `x-scan-signature` header is the lowercase hex HMAC-SHA256 of the exact UTF-8 HTTP body using the shared secret.

The processor must authenticate the unparsed request body, enforce a five-minute timestamp window, bound the input, decode the two byte strings and recompute both SHA-256 values before screening. Treat repeated requests for an identical ID and hash pair as retries. Reject reuse of an ID with different bytes. Keep images, request payloads and detection details out of ordinary HTTP logs.

For each image, perform all of the following, including on content that will be cropped out of the public image.

- **Known-abuse screening.** Use a qualified processor with authorized known-CSAM perceptual-hash reference coverage. Send exact and possible matches to restricted handling.
- **Visual screening.** Inspect the decoded pixels for prohibited imagery. Route possible minor-safety imagery and other material designated for protected responders to restricted handling.
- **Text screening.** Run OCR on the image and moderate the extracted text. An image that contains no readable text can pass after OCR completes.

Combine each check’s results across both images. Return HTTP 200 with `Content-Type: application/json`, a fresh integer timestamp and a signature in `x-scan-signature` computed over the exact response body. Return only identifiers and decisions. The accepted response size is at most 4096 bytes. For example, with the same ID and digest strings from the request, a clean response has this form.

```json
{
  "id": "<request id>",
  "originalHash": "<request originalHash>",
  "contentHash": "<request contentHash>",
  "checks": { "knownAbuse": "clear", "visual": "clear", "ocr": "clear" },
  "timestamp": 1790000000
}
```

Use `clear` only for a completed check. `review` means human review and `reject` means a nonpublishable finding. `restricted` means protected handling. A `review` or `reject` result from the known-abuse check also receives protected handling. When any service is unavailable or its coverage is uncertain, return `error` for that check. A verified restricted finding still takes priority over an incomplete check.

The app verifies the signature, timestamp, asset ID and both hashes. Only three explicit clear decisions can approve a scan. An unavailable service, invalid receipt or five-second timeout leaves the asset pending. A successful scan can still require account-based review before profile selection.

For a local fixture, an HTTP processor bound to loopback is permitted in development or test. A production-mode local smoke build also requires `PROFILE_PHOTO_SCANNER_ALLOW_LOCAL=true`. Setting `VERCEL` or `VERCEL_ENV` disables the HTTP exception.
