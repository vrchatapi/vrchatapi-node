#!/bin/bash

rm src/__generated/* -rf

npx @hey-api/openapi-ts -i https://raw.githubusercontent.com/vrchatapi/specification/gh-pages/openapi.yaml -o src/__generated -c @hey-api/client-fetch --schemas false

npm install

rm dist/* -rf
npm run build