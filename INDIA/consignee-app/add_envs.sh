#!/bin/bash
while IFS='=' read -r key value; do
  # Skip empty lines and comments
  if [[ -z "$key" || "$key" == \#* ]]; then
    continue
  fi
  
  # Remove quotes from value if present
  clean_value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//')
  
  echo "Adding $key to production..."
  echo "$clean_value" | npx vercel env add $key production
  
  echo "Adding $key to preview..."
  echo "$clean_value" | npx vercel env add $key preview
  
  echo "Adding $key to development..."
  echo "$clean_value" | npx vercel env add $key development
  
done < .env
