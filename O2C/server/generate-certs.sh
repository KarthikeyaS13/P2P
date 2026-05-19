#!/bin/bash
set -e

# Move to script directory
cd "$(dirname "$0")"

# Make sure keys directory exists
mkdir -p keys

echo "Generating fresh cryptographic keys and certificates for PDF signing..."

# 1. Generate secure private key
openssl genrsa -out keys/private.pem 2048

# 2. Generate self-signed certificate (CN=O2C Invoice Signer)
openssl req -new -x509 -key keys/private.pem -out keys/certificate.pem -days 365 -subj "/CN=O2C Invoice Signer/O=Sudha Analyticals/C=IN"

# 3. Export to PKCS#12 keystore (.p12) with password 'password123'
openssl pkcs12 -export -out keys/keystore.p12 -inkey keys/private.pem -in keys/certificate.pem -passout pass:password123

# 4. Export public key in PEM format
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

echo "Cryptographic files generated in keys/ directory:"
ls -la keys
