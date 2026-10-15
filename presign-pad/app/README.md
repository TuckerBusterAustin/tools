# Presign Pad

Local-first static page: fill in an AWS-style request, get a SigV4 signature,
build S3 presigned URLs, explain AWS error responses (with a
canonical-request / StringToSign diff), lint the request before sending, and
save profiles. No server, no account; keys stay in the browser.

## Run
Open `index.html` in a browser (or serve the folder with any static server).

## Test
`node --test` (Node 18+, standard library only).

## Features
- **Sign / Presign**: canonical request, string to sign, signature, Authorization header, S3 URL.
- **Explain**: paste an S3 error body; get plain-words causes and a line-by-line diff of the
  canonical request and string to sign against what this page computed (differing lines highlighted).
- **Inspect**: paste a presigned URL; see expiry, signed headers and warnings. Optionally enter
  the secret key to verify the signature (host-only signed headers).
- **Profiles**: save and load request settings locally. **Copy curl** copies the last signed request.
- Secrets are kept only in memory unless you tick the save-secrets box.
- Makes no network calls except when you click "Send via fetch", which sends your signed request to the host you entered.

## Supported scope
SigV4 and S3 presigned URLs only. Not supported: SigV4a, SigV2, POST policies, chunked
streaming payload signing, other services' error formats beyond XML/JSON error bodies.

## Manual AWS CLI comparison
Use a throwaway key pair, never a real production secret.
1. Pick a fixed time, e.g. `20130524T000000Z`, and enter it in the Date field.
2. In the page, fill host `examplebucket.s3.amazonaws.com`, path `/test.txt`, region `us-east-1`,
   your access key ID and secret, expires `86400`, then click Presign.
3. Run `aws s3 presign s3://examplebucket/test.txt --expires-in 86400 --region us-east-1`
   (same bucket, key and region). The CLI always signs with the current time, so run both
   within the same second, or compare structure rather than the signature.
4. Compare `X-Amz-Credential`, `X-Amz-SignedHeaders` and `X-Amz-Expires` in both URLs. With the
   same clock second the `X-Amz-Signature` values must be identical.
5. Paste the CLI's URL into Inspect with the secret: it must report "matches".
6. Force an error (change one character of the secret), request the object with curl, paste
   the XML into Explain and confirm the diff shows no canonical request differences but the
   hint points at the secret key.
7. Check the known AWS docs example: GET `/test.txt`, Range `bytes=0-9`, signature
   `f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41` (covered by `node --test`).

## Layout
- `src/sigv4.js` – canonical request, string to sign, key derivation, Authorization header.
  Crypto is injected: `sha256Hex(data)` and `hmac(key, data)` (async; hmac returns bytes).
- `src/crypto-node.js` / `src/crypto-web.js` – the two implementations.
- `src/app.js` – browser glue.
- `src/presign.js`, `explain.js`, `lint.js` – S3 presigned URLs, error explainer, pre-send checks.
- `src/inspect.js` – presigned URL inspector. `src/export.js` – curl / `aws s3 presign` strings.
- `src/profiles.js` – saved profiles. `serialise(list, {includeSecrets})` drops
  secretKey/secretAccessKey/sessionToken unless `includeSecrets === true`; profiles
  need a name and region; `parse` returns `[]` on corrupt JSON.

## Saved profiles and secrets
Profiles live in this browser's localStorage only. Secret key and session token are
never saved unless you tick the labelled checkbox (default off); they are then stored
unencrypted. "Clear saved data" deletes everything saved.

## Known limits
- Sending requests from the page is subject to CORS; many AWS endpoints will block it.
- With the save-secrets box ticked, secrets sit in plain text in localStorage; unticking it
  and saving removes them from stored profiles.
- Query strings are decoded with `decodeURIComponent` (`+` stays a literal plus).
- Path input is the raw, unencoded path; the signer applies AWS encoding rules.
